-- moink: training (skills, review queue, new-word budget).
--
-- Additive and re-runnable, in one transaction. Run after
-- 20261101120000_dictionary_search.sql: it replaces word_of_the_day from
-- there and record_review and next_new_words from
-- 20261025120000_learning_core.sql.
--
-- A card is now one user, one word and one skill. Existing rows become
-- 'recognition' cards (the column default). Writing cards aren't created
-- anywhere yet.

begin;

-- ---------------------------------------------------------------------------
-- Skills
-- ---------------------------------------------------------------------------

alter table public.user_words
  add column if not exists skill text not null default 'recognition';

alter table public.user_words drop constraint if exists user_words_skill_check;
alter table public.user_words
  add constraint user_words_skill_check check (skill in ('recognition', 'writing'));

-- The primary key was (user_id, word_id), created inline, so Postgres named
-- it user_words_pkey. Nothing references it.
alter table public.user_words drop constraint if exists user_words_pkey;
alter table public.user_words
  add constraint user_words_pkey primary key (user_id, word_id, skill);

drop index if exists public.user_words_due_idx;
create index user_words_due_idx
  on public.user_words (user_id, skill, due)
  where suspended = false;

alter table public.reviews
  add column if not exists skill text not null default 'recognition';

alter table public.reviews drop constraint if exists reviews_skill_check;
alter table public.reviews
  add constraint reviews_skill_check check (skill in ('recognition', 'writing'));

-- ---------------------------------------------------------------------------
-- record_review
-- ---------------------------------------------------------------------------

-- Replaces the five-argument version: adding p_skill as an overload would
-- make calls without it ambiguous.
drop function if exists public.record_review(bigint, jsonb, jsonb, integer, text);

-- p_card is a ts-fsrs Card and p_log a ReviewLog, both as JSON (Dates
-- serialize to ISO strings). The first review of a brand-new word has no
-- user_words row yet, so the card is upserted: inserted with p_card's
-- values (introduced_at now) or updated in place. Runs as the caller, so
-- RLS applies, and the function body is one transaction: the card and the
-- review are both saved or neither is. Returns the new review id.
create or replace function public.record_review(
  p_word_id bigint,
  p_card jsonb,
  p_log jsonb,
  p_duration_ms integer default null,
  p_mode text default 'flashcard',
  p_skill text default 'recognition'
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_skill text := coalesce(p_skill, 'recognition');
  v_review_id bigint;
begin
  if v_user is null then
    raise exception 'record_review: not signed in' using errcode = '42501';
  end if;

  insert into public.user_words as uw (
    user_id, word_id, skill, due, stability, difficulty, elapsed_days,
    scheduled_days, learning_steps, reps, lapses, state, last_review
  )
  values (
    v_user,
    p_word_id,
    v_skill,
    (p_card ->> 'due')::timestamptz,
    (p_card ->> 'stability')::double precision,
    (p_card ->> 'difficulty')::double precision,
    (p_card ->> 'elapsed_days')::integer,
    (p_card ->> 'scheduled_days')::integer,
    (p_card ->> 'learning_steps')::integer,
    (p_card ->> 'reps')::integer,
    (p_card ->> 'lapses')::integer,
    (p_card ->> 'state')::smallint,
    nullif(p_card ->> 'last_review', '')::timestamptz
  )
  on conflict (user_id, word_id, skill) do update
  set
    due = excluded.due,
    stability = excluded.stability,
    difficulty = excluded.difficulty,
    elapsed_days = excluded.elapsed_days,
    scheduled_days = excluded.scheduled_days,
    learning_steps = excluded.learning_steps,
    reps = excluded.reps,
    lapses = excluded.lapses,
    state = excluded.state,
    last_review = excluded.last_review;

  insert into public.reviews (
    user_id, word_id, skill, rating, state, due, stability, difficulty,
    elapsed_days, last_elapsed_days, scheduled_days, learning_steps, review,
    duration_ms, mode
  )
  values (
    v_user,
    p_word_id,
    v_skill,
    (p_log ->> 'rating')::smallint,
    (p_log ->> 'state')::smallint,
    (p_log ->> 'due')::timestamptz,
    (p_log ->> 'stability')::double precision,
    (p_log ->> 'difficulty')::double precision,
    (p_log ->> 'elapsed_days')::integer,
    (p_log ->> 'last_elapsed_days')::integer,
    (p_log ->> 'scheduled_days')::integer,
    (p_log ->> 'learning_steps')::integer,
    (p_log ->> 'review')::timestamptz,
    p_duration_ms,
    coalesce(p_mode, 'flashcard')
  )
  returning id into v_review_id;

  return v_review_id;
end;
$$;

revoke execute on function public.record_review(bigint, jsonb, jsonb, integer, text, text) from public, anon;
grant execute on function public.record_review(bigint, jsonb, jsonb, integer, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Started words are recognition cards
-- ---------------------------------------------------------------------------

-- Same as before, but only a recognition card counts as started, so a
-- future writing card doesn't hide a word from new recognition cards.
create or replace function public.next_new_words(p_limit integer default 10)
returns setof public.words
language sql
stable
security invoker
set search_path = ''
as $$
  select w.*
  from public.words w
  where auth.uid() is not null
    and w.hsk_level >= coalesce(
      (select p.hsk_level_target from public.profiles p where p.id = auth.uid()),
      1
    )
    and not exists (
      select 1
      from public.user_words uw
      where uw.user_id = auth.uid()
        and uw.word_id = w.id
        and uw.skill = 'recognition'
    )
  order by w.hsk_level, w.sort_order, w.id
  limit greatest(coalesce(p_limit, 10), 0);
$$;

-- Same as in 20261101120000_dictionary_search.sql, with "started" meaning
-- a recognition card.
create or replace function public.word_of_the_day(p_date date)
returns setof public.words
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_target smallint;
  v_level smallint;
  v_pool bigint;
  v_hash bigint;
begin
  if v_user is null then
    return;
  end if;

  select coalesce(p.hsk_level_target, 1) into v_target
  from public.profiles p
  where p.id = v_user;
  v_target := coalesce(v_target, 1);

  -- 28 bits of md5: always a non-negative integer.
  v_hash := ('x' || substr(md5(v_user::text || ':' || coalesce(p_date, current_date)::text), 1, 7))::bit(28)::bigint;

  -- Lowest level at or above the target that still has unstarted words.
  select min(w.hsk_level) into v_level
  from public.words w
  where w.hsk_level >= v_target
    and not exists (
      select 1 from public.user_words uw
      where uw.user_id = v_user and uw.word_id = w.id and uw.skill = 'recognition'
    );

  if v_level is not null then
    select count(*) into v_pool
    from public.words w
    where w.hsk_level = v_level
      and not exists (
        select 1 from public.user_words uw
        where uw.user_id = v_user and uw.word_id = w.id and uw.skill = 'recognition'
      );

    return query
      select w.*
      from public.words w
      where w.hsk_level = v_level
        and not exists (
          select 1 from public.user_words uw
          where uw.user_id = v_user and uw.word_id = w.id and uw.skill = 'recognition'
        )
      order by w.sort_order nulls last, w.id
      offset v_hash % v_pool
      limit 1;
    return;
  end if;

  -- Everything started: any word at their level.
  select count(*) into v_pool from public.words w where w.hsk_level = v_target;
  if v_pool = 0 then
    return;
  end if;

  return query
    select w.*
    from public.words w
    where w.hsk_level = v_target
    order by w.sort_order nulls last, w.id
    offset v_hash % v_pool
    limit 1;
end;
$$;

-- ---------------------------------------------------------------------------
-- new_words_remaining_today
-- ---------------------------------------------------------------------------

-- The caller's daily_new_words minus the new words they've already met
-- today: recognition reviews since p_today_start (the start of today in
-- profiles.timezone, worked out by the server) whose logged state was New.
-- A word logs state New only on its first review, so each counts once.
-- Never below 0.
create or replace function public.new_words_remaining_today(p_today_start timestamptz)
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select greatest(
    coalesce(
      (select p.daily_new_words from public.profiles p where p.id = auth.uid()),
      0
    )
    - (
      select count(*)
      from public.reviews r
      where r.user_id = auth.uid()
        and r.skill = 'recognition'
        and r.state = 0
        and r.review >= p_today_start
    ),
    0
  )::integer;
$$;

revoke execute on function public.new_words_remaining_today(timestamptz) from public, anon;
grant execute on function public.new_words_remaining_today(timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- get_review_queue
-- ---------------------------------------------------------------------------

-- A recognition session, in order: due cards (not New, not suspended, due
-- by p_now, earliest first, at most 200), then new cards up to
-- new_words_remaining_today: first the caller's recognition cards still
-- New (words added from the Dictionary), oldest introduced first, then
-- words from next_new_words. Inserts nothing: a new word gets its row on
-- its first rating (record_review).
--
-- has_card is false only for next_new_words rows, whose card fields are
-- null (the client treats them as an empty card).
create or replace function public.get_review_queue(
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
  v_pending integer;
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
      and uw.skill = 'recognition'
      and uw.suspended = false
      and uw.state <> 0
      and uw.due <= p_now
    order by uw.due, w.id
    limit 200;

  v_budget := public.new_words_remaining_today(p_today_start);
  if v_budget <= 0 then
    return;
  end if;

  return query
    select
      w.id, w.simplified, w.pinyin, w.gloss, w.hsk_level, w.classifiers,
      uw.due, uw.stability, uw.difficulty, uw.elapsed_days, uw.scheduled_days,
      uw.learning_steps, uw.reps, uw.lapses, uw.state, uw.last_review,
      true, true
    from public.user_words uw
    join public.words w on w.id = uw.word_id
    where uw.user_id = v_user
      and uw.skill = 'recognition'
      and uw.suspended = false
      and uw.state = 0
    order by uw.introduced_at, w.id
    limit v_budget;

  get diagnostics v_pending = row_count;
  if v_pending >= v_budget then
    return;
  end if;

  return query
    select
      w.id, w.simplified, w.pinyin, w.gloss, w.hsk_level, w.classifiers,
      null::timestamptz, null::double precision, null::double precision,
      null::integer, null::integer, null::integer, null::integer, null::integer,
      null::smallint, null::timestamptz,
      true, false
    from public.next_new_words(v_budget - v_pending) w;
end;
$$;

revoke execute on function public.get_review_queue(timestamptz, timestamptz) from public, anon;
grant execute on function public.get_review_queue(timestamptz, timestamptz) to authenticated;

commit;
