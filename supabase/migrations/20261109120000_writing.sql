-- moink: writing (a daily new-writing limit, words with no stroke data,
-- and the writing queue).
--
-- Additive and re-runnable, in one transaction. Run after
-- 20261102120000_training.sql.
--
-- A writing card is a user_words row with skill 'writing'. Nothing here
-- inserts one: the first recall of a word creates it through record_review
-- (p_skill 'writing', p_mode 'writing_recall'), which already upserts by
-- (user_id, word_id, skill). Recognition is untouched: next_new_words,
-- word_of_the_day, new_words_remaining_today and get_review_queue already
-- look at skill 'recognition' only (20261102120000_training.sql).

begin;

-- ---------------------------------------------------------------------------
-- profiles.daily_new_writing
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists daily_new_writing smallint not null default 5;

alter table public.profiles drop constraint if exists profiles_daily_new_writing_check;
alter table public.profiles
  add constraint profiles_daily_new_writing_check check (daily_new_writing between 0 and 20);

-- ---------------------------------------------------------------------------
-- writing_excluded: characters hanzi-writer has no stroke data for
-- ---------------------------------------------------------------------------

-- Kept in step by scripts/check-stroke-data.ts, which also writes
-- src/lib/training/writing-excluded.json for the app. Its last run (HSK 1
-- to 6, 2,632 characters, hanzi-writer-data 2.0.1) found none, so it
-- starts empty. A word containing any of these is never eligible.
create table if not exists public.writing_excluded (
  char text primary key
);

alter table public.writing_excluded enable row level security;

drop policy if exists "writing_excluded: read" on public.writing_excluded;
create policy "writing_excluded: read" on public.writing_excluded
  for select to authenticated using (true);

grant select on public.writing_excluded to authenticated;

-- ---------------------------------------------------------------------------
-- new_writing_remaining_today
-- ---------------------------------------------------------------------------

-- The caller's daily_new_writing minus the new writing cards they've
-- already started today: writing reviews since p_today_start (the start of
-- today in profiles.timezone) whose logged state was New. Never below 0.
create or replace function public.new_writing_remaining_today(p_today_start timestamptz)
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select greatest(
    coalesce(
      (select p.daily_new_writing from public.profiles p where p.id = auth.uid()),
      0
    )
    - (
      select count(*)
      from public.reviews r
      where r.user_id = auth.uid()
        and r.skill = 'writing'
        and r.state = 0
        and r.review >= p_today_start
    ),
    0
  )::integer;
$$;

revoke execute on function public.new_writing_remaining_today(timestamptz) from public, anon;
grant execute on function public.new_writing_remaining_today(timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- get_writing_queue
-- ---------------------------------------------------------------------------

-- A writing session, in order: due writing cards (not New, not suspended,
-- due by p_now, earliest first, at most 100), then new ones up to
-- new_writing_remaining_today, by hsk_level then sort_order.
--
-- A word is eligible for a new writing card when it has no writing card
-- yet, its recognition card is in state Review (2), it has at least 2
-- recognition reviews rated Good (3) or Easy (4), and every character has
-- stroke data (none is in writing_excluded).
--
-- Same columns as get_review_queue. Inserts nothing; new rows have null
-- card fields, is_new true and has_card false.
create or replace function public.get_writing_queue(
  p_now timestamptz,
  p_today_start timestamptz
)
returns table (
  id bigint,
  simplified text,
  pinyin text,
  gloss text,
  hsk_level smallint,
  classifiers text[],
  due timestamptz,
  stability double precision,
  difficulty double precision,
  elapsed_days integer,
  scheduled_days integer,
  learning_steps integer,
  reps integer,
  lapses integer,
  state smallint,
  last_review timestamptz,
  is_new boolean,
  has_card boolean
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_budget integer;
begin
  if v_user is null then
    return;
  end if;

  return query
    select
      w.id, w.simplified, w.pinyin, w.gloss, w.hsk_level, w.classifiers,
      uw.due, uw.stability, uw.difficulty, uw.elapsed_days, uw.scheduled_days,
      uw.learning_steps, uw.reps, uw.lapses, uw.state, uw.last_review,
      false, true
    from public.user_words uw
    join public.words w on w.id = uw.word_id
    where uw.user_id = v_user
      and uw.skill = 'writing'
      and uw.suspended = false
      and uw.state <> 0
      and uw.due <= p_now
    order by uw.due, w.id
    limit 100;

  v_budget := public.new_writing_remaining_today(p_today_start);
  if v_budget <= 0 then
    return;
  end if;

  return query
    with good as (
      select r.word_id
      from public.reviews r
      where r.user_id = v_user
        and r.skill = 'recognition'
        and r.rating in (3, 4)
      group by r.word_id
      having count(*) >= 2
    )
    select
      w.id, w.simplified, w.pinyin, w.gloss, w.hsk_level, w.classifiers,
      null::timestamptz, null::double precision, null::double precision,
      null::integer, null::integer, null::integer, null::integer, null::integer,
      null::smallint, null::timestamptz,
      true, false
    from public.user_words rec
    join good on good.word_id = rec.word_id
    join public.words w on w.id = rec.word_id
    where rec.user_id = v_user
      and rec.skill = 'recognition'
      and rec.state = 2
      and not exists (
        select 1 from public.user_words wr
        where wr.user_id = v_user and wr.word_id = rec.word_id and wr.skill = 'writing'
      )
      and not exists (
        select 1 from public.writing_excluded e
        where strpos(w.simplified, e.char) > 0
      )
    order by w.hsk_level, w.sort_order nulls last, w.id
    limit v_budget;
end;
$$;

revoke execute on function public.get_writing_queue(timestamptz, timestamptz) from public, anon;
grant execute on function public.get_writing_queue(timestamptz, timestamptz) to authenticated;

commit;
