-- moink: a per-user HSK standard (old HSK 2.0, or the HSK 3.0 2025
-- syllabus).
--
-- Additive and re-runnable, in one transaction. Run after
-- 20261116120000_hsk3_2025.sql.
--
-- profiles.hsk_standard picks which level a word has for the user:
-- words.hsk_level for 'hsk2', words.hsk3_2025_level for 'hsk3' (7 = bands
-- 7 to 9). hsk_level_target is a level in that standard. Every function
-- that works by level follows it: next_new_words (and through it the new
-- words in get_review_queue), word_of_the_day, the new words in
-- get_writing_queue, and search_words' level filter and order. A word
-- with no level in the user's standard is never introduced as a new word;
-- it stays searchable (sorted last) and can be added by hand.

begin;

-- ---------------------------------------------------------------------------
-- profiles.hsk_standard and hsk_level_target
-- ---------------------------------------------------------------------------

-- Added with default 'hsk2', so every profile that exists now (pranata and
-- moink_test) keeps old HSK, which its hsk_level_target was picked in;
-- then new profiles default to 'hsk3'. Re-running doesn't touch existing
-- rows, so a profile switched to 'hsk3' stays switched.
alter table public.profiles
  add column if not exists hsk_standard text not null default 'hsk2';
alter table public.profiles alter column hsk_standard set default 'hsk3';

alter table public.profiles drop constraint if exists profiles_hsk_standard_check;
alter table public.profiles
  add constraint profiles_hsk_standard_check check (hsk_standard in ('hsk2', 'hsk3'));

-- The table predates these migrations, so its old check on
-- hsk_level_target (1 to 6) has an unknown name: drop every check that
-- mentions the column, then add the standard-aware one.
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%hsk_level_target%'
  loop
    execute format('alter table public.profiles drop constraint %I', c.conname);
  end loop;
end;
$$;

alter table public.profiles
  add constraint profiles_hsk_level_target_check check (
    hsk_level_target is null
    or (hsk_standard = 'hsk2' and hsk_level_target between 1 and 6)
    or (hsk_standard = 'hsk3' and hsk_level_target between 1 and 7)
  );

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- A word's level and order in a standard: hsk_level and sort_order for
-- 'hsk2', hsk3_2025_level and sort_order_2025 for 'hsk3'. Null when the
-- word has no level in it. No SET search_path: they only read their
-- argument's fields, and without it Postgres can inline them into the
-- queries below.
create or replace function public.word_level(w public.words, p_standard text)
returns smallint
language sql
immutable
as $$
  select case when p_standard = 'hsk2' then w.hsk_level else w.hsk3_2025_level end;
$$;

create or replace function public.word_sort(w public.words, p_standard text)
returns integer
language sql
immutable
as $$
  select case when p_standard = 'hsk2' then w.sort_order else w.sort_order_2025 end;
$$;

-- The caller's standard; 'hsk3' (the column default) without a profile.
create or replace function public.user_standard()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    (select p.hsk_standard from public.profiles p where p.id = auth.uid()),
    'hsk3'
  );
$$;

-- ---------------------------------------------------------------------------
-- next_new_words
-- ---------------------------------------------------------------------------

-- Words at or above the caller's hsk_level_target in their standard (1 if
-- unset) that have no recognition card yet, in learning order. Words with
-- no level in the standard are left out.
create or replace function public.next_new_words(p_limit integer default 10)
returns setof public.words
language sql
stable
security invoker
set search_path = ''
as $$
  with me as (
    select
      public.user_standard() as std,
      coalesce(
        (select p.hsk_level_target from public.profiles p where p.id = auth.uid()),
        1
      ) as target
  )
  select w.*
  from public.words w
  cross join me
  where auth.uid() is not null
    and public.word_level(w, me.std) >= me.target
    and not exists (
      select 1
      from public.user_words uw
      where uw.user_id = auth.uid()
        and uw.word_id = w.id
        and uw.skill = 'recognition'
    )
  order by public.word_level(w, me.std), public.word_sort(w, me.std) nulls last, w.id
  limit greatest(coalesce(p_limit, 10), 0);
$$;

-- ---------------------------------------------------------------------------
-- word_of_the_day
-- ---------------------------------------------------------------------------

-- As in 20261102120000_training.sql, with levels and order in the
-- caller's standard: one of the words at the lowest level from their
-- target up that they haven't started, picked by md5(user, date); if
-- they've started everything from their level up, any word at their level.
create or replace function public.word_of_the_day(p_date date)
returns setof public.words
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_std text := public.user_standard();
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
  select min(public.word_level(w, v_std)) into v_level
  from public.words w
  where public.word_level(w, v_std) >= v_target
    and not exists (
      select 1 from public.user_words uw
      where uw.user_id = v_user and uw.word_id = w.id and uw.skill = 'recognition'
    );

  if v_level is not null then
    select count(*) into v_pool
    from public.words w
    where public.word_level(w, v_std) = v_level
      and not exists (
        select 1 from public.user_words uw
        where uw.user_id = v_user and uw.word_id = w.id and uw.skill = 'recognition'
      );

    return query
      select w.*
      from public.words w
      where public.word_level(w, v_std) = v_level
        and not exists (
          select 1 from public.user_words uw
          where uw.user_id = v_user and uw.word_id = w.id and uw.skill = 'recognition'
        )
      order by public.word_sort(w, v_std) nulls last, w.id
      offset v_hash % v_pool
      limit 1;
    return;
  end if;

  -- Everything started: any word at their level.
  select count(*) into v_pool from public.words w where public.word_level(w, v_std) = v_target;
  if v_pool = 0 then
    return;
  end if;

  return query
    select w.*
    from public.words w
    where public.word_level(w, v_std) = v_target
    order by public.word_sort(w, v_std) nulls last, w.id
    offset v_hash % v_pool
    limit 1;
end;
$$;

-- ---------------------------------------------------------------------------
-- get_review_queue
-- ---------------------------------------------------------------------------

-- As in 20261102120000_training.sql (new words come from next_new_words,
-- so they follow the standard), returning hsk3_2025_level too: dropped
-- first, since the row type changes.
drop function if exists public.get_review_queue(timestamptz, timestamptz);

create function public.get_review_queue(
  p_now timestamptz,
  p_today_start timestamptz
)
returns table (
  id bigint,
  simplified text,
  pinyin text,
  gloss text,
  hsk_level smallint,
  hsk3_2025_level smallint,
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
      w.id, w.simplified, w.pinyin, w.gloss, w.hsk_level, w.hsk3_2025_level, w.classifiers,
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

  -- Words added by hand (from the Dictionary or a practice deck) come
  -- first, whatever their level.
  return query
    select
      w.id, w.simplified, w.pinyin, w.gloss, w.hsk_level, w.hsk3_2025_level, w.classifiers,
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
      w.id, w.simplified, w.pinyin, w.gloss, w.hsk_level, w.hsk3_2025_level, w.classifiers,
      null::timestamptz, null::double precision, null::double precision,
      null::integer, null::integer, null::integer, null::integer, null::integer,
      null::smallint, null::timestamptz,
      true, false
    from public.next_new_words(v_budget - v_pending) w;
end;
$$;

revoke execute on function public.get_review_queue(timestamptz, timestamptz) from public, anon;
grant execute on function public.get_review_queue(timestamptz, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- get_writing_queue
-- ---------------------------------------------------------------------------

-- As in 20261109120000_writing.sql, returning hsk3_2025_level too, with
-- the newly eligible words in the caller's standard's order (words with
-- no level in it last: they were added by hand, so they stay eligible).
drop function if exists public.get_writing_queue(timestamptz, timestamptz);

create function public.get_writing_queue(
  p_now timestamptz,
  p_today_start timestamptz
)
returns table (
  id bigint,
  simplified text,
  pinyin text,
  gloss text,
  hsk_level smallint,
  hsk3_2025_level smallint,
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
  v_std text := public.user_standard();
  v_budget integer;
begin
  if v_user is null then
    return;
  end if;

  return query
    select
      w.id, w.simplified, w.pinyin, w.gloss, w.hsk_level, w.hsk3_2025_level, w.classifiers,
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
      w.id, w.simplified, w.pinyin, w.gloss, w.hsk_level, w.hsk3_2025_level, w.classifiers,
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
    order by
      public.word_level(w, v_std) nulls last,
      public.word_sort(w, v_std) nulls last,
      w.id
    limit v_budget;
end;
$$;

revoke execute on function public.get_writing_queue(timestamptz, timestamptz) from public, anon;
grant execute on function public.get_writing_queue(timestamptz, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- search_words
-- ---------------------------------------------------------------------------

-- As in 20261101120000_dictionary_search.sql, with p_level and the order
-- in the caller's standard (p_level 5 still means 5 and above; words with
-- no level in the standard match only with no p_level, and sort last
-- within their rank), returning hsk3_2025_level too: dropped first, since
-- the row type changes.
drop function if exists public.search_words(text, smallint, integer, integer);

create function public.search_words(
  p_query text,
  p_level smallint default null,
  p_limit integer default 30,
  p_offset integer default 0
)
returns table (
  id bigint,
  simplified text,
  pinyin text,
  gloss text,
  hsk_level smallint,
  hsk3_level smallint,
  hsk3_2025_level smallint,
  total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (
    select
      lower(btrim(coalesce(p_query, ''))) as raw,
      public.user_standard() as std
  ),
  n as (
    select
      raw,
      std,
      raw ~ '[㐀-䶿一-鿿豈-﫿]' as is_hanzi,
      raw ~ '[0-9]' as has_digit,
      raw ~ '[a-z0-9]' as has_alnum,
      public.pinyin_plain(raw) as plain,
      public.pinyin_num(raw) as num,
      -- The query as a regex literal, for the whole-word gloss match.
      regexp_replace(raw, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g') as escaped
    from q
  ),
  ranked as (
    select
      w.id, w.simplified, w.pinyin, w.gloss, w.hsk_level, w.hsk3_level, w.hsk3_2025_level,
      public.word_level(w, n.std) as level,
      public.word_sort(w, n.std) as sort,
      case
        when n.is_hanzi then
          case
            when w.simplified = n.raw or w.traditional = n.raw then 1
            when left(w.simplified, length(n.raw)) = n.raw
              or left(w.traditional, length(n.raw)) = n.raw then 2
            when strpos(w.simplified, n.raw) > 0
              or strpos(coalesce(w.traditional, ''), n.raw) > 0 then 3
          end
        when n.has_alnum then
          case
            when n.has_digit and w.pinyin_num = n.num then 4
            when not n.has_digit and w.pinyin_plain = n.plain then 4
            when n.has_digit and left(w.pinyin_num, length(n.num)) = n.num then
              case when public.pinyin_syllable_prefix(w.pinyin_numeric, n.num, true) then 5 else 6 end
            when not n.has_digit and left(w.pinyin_plain, length(n.plain)) = n.plain then
              case when public.pinyin_syllable_prefix(w.pinyin, n.plain, false) then 5 else 6 end
            when w.gloss ~* ('\m' || n.escaped || '\M') then 7
            when strpos(lower(array_to_string(w.meanings, ' | ')), n.raw) > 0 then 8
          end
      end as rank
    from public.words w
    cross join n
    where n.raw <> ''
      and (
        p_level is null
        or (p_level >= 5 and public.word_level(w, n.std) >= 5)
        or public.word_level(w, n.std) = p_level
      )
  )
  select
    r.id, r.simplified, r.pinyin, r.gloss, r.hsk_level, r.hsk3_level, r.hsk3_2025_level,
    count(*) over () as total_count
  from ranked r
  where r.rank is not null
  order by r.rank, r.level nulls last, r.sort nulls last, r.id
  limit least(greatest(coalesce(p_limit, 30), 0), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke execute on function public.search_words(text, smallint, integer, integer) from public, anon;
grant execute on function public.search_words(text, smallint, integer, integer) to authenticated;

commit;
