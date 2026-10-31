-- moink: daily activity and streaks, plus the Dashboard's level progress
-- and due forecast.
--
-- Additive and re-runnable, in one transaction. Run after
-- 20261130120000_dictionary_sort.sql: it replaces record_review from
-- 20261102120000_training.sql.
--
-- A day is a calendar day in the user's profiles.timezone. A day is
-- completed by finishing Today's review, or by 20 reviews in it; a streak
-- is consecutive completed days. Practice (flashcards, quiz, listening,
-- writing practice) marks a day practiced, which never completes it.
--
-- daily_activity is written only by the functions here (security
-- definer); users can read their own rows. Every writer recomputes from
-- the reviews and cards themselves rather than counting calls, so calling
-- one again (or directly) changes nothing.

begin;

-- ---------------------------------------------------------------------------
-- daily_activity
-- ---------------------------------------------------------------------------

create table if not exists public.daily_activity (
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- The calendar day in the user's time zone.
  day date not null,
  -- Reviews saved that day (recognition and writing).
  reviews_done integer not null default 0,
  -- Cards in Today's review when the day's row was created (its first
  -- review or practice): cards due by the end of the day, plus the new
  -- words and new writing it would bring, as many as there are.
  due_at_start integer not null default 0,
  completed boolean not null default false,
  practiced boolean not null default false,
  primary key (user_id, day)
);

alter table public.daily_activity enable row level security;

drop policy if exists "daily_activity: select own" on public.daily_activity;
create policy "daily_activity: select own" on public.daily_activity
  for select to authenticated
  using (user_id = (select auth.uid()));

-- No insert, update or delete policy, so RLS refuses those for every user;
-- revoked as well, so the intent shows in the grants too.
revoke insert, update, delete on public.daily_activity from anon, authenticated;
grant select on public.daily_activity to authenticated;

-- ---------------------------------------------------------------------------
-- The caller's day
-- ---------------------------------------------------------------------------

-- The caller's time zone (profiles.timezone), or Asia/Jakarta when it's
-- unset or not a zone Postgres knows (the app's FALLBACK_TIME_ZONE).
create or replace function public.user_zone()
returns text
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_zone text;
begin
  select p.timezone into v_zone from public.profiles p where p.id = auth.uid();
  if v_zone is null or v_zone = '' then
    return 'Asia/Jakarta';
  end if;
  begin
    perform now() at time zone v_zone;
  exception when invalid_parameter_value then
    return 'Asia/Jakarta';
  end;
  return v_zone;
end;
$$;

-- Today in the caller's zone, and when it starts and ends.
create or replace function public.user_today(
  out today date,
  out day_start timestamptz,
  out day_end timestamptz
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_zone text := public.user_zone();
begin
  today := (now() at time zone v_zone)::date;
  day_start := today::timestamp at time zone v_zone;
  day_end := (today + 1)::timestamp at time zone v_zone;
end;
$$;

revoke execute on function public.user_zone() from public, anon;
grant execute on function public.user_zone() to authenticated;
revoke execute on function public.user_today() from public, anon;
grant execute on function public.user_today() to authenticated;

-- ---------------------------------------------------------------------------
-- Writing a day
-- ---------------------------------------------------------------------------

-- Creates the caller's row for today if there's none, with due_at_start:
-- recognition and writing cards (past New, not suspended) due by the end
-- of today, plus the new words and new writing Today's review would bring
-- now (get_review_queue and get_writing_queue already cap those at the
-- words there are). record_review calls it before saving a review, so the
-- count is from before the day's first review.
create or replace function public.start_daily_activity()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_day record;
  v_due integer;
  v_new integer;
begin
  if v_user is null then
    return;
  end if;
  select * into v_day from public.user_today();
  if exists (
    select 1 from public.daily_activity a where a.user_id = v_user and a.day = v_day.today
  ) then
    return;
  end if;

  select count(*) into v_due
  from public.user_words uw
  where uw.user_id = v_user
    and uw.suspended = false
    and uw.state <> 0
    and uw.due < v_day.day_end;

  select
    (select count(*) from public.get_review_queue(now(), v_day.day_start) q where q.is_new)
    + (select count(*) from public.get_writing_queue(now(), v_day.day_start) q where q.is_new)
  into v_new;

  insert into public.daily_activity (user_id, day, due_at_start)
  values (v_user, v_day.today, v_due + v_new)
  on conflict (user_id, day) do nothing;
end;
$$;

-- Brings today's row up to date after a review: reviews_done from the
-- reviews saved today, and completed once 20 are done or nothing is left
-- that Today's review would show now: no card past New due by now (a
-- learning step due later today waits for later, and so does a card
-- scheduled for later today), and no new words or new writing left in
-- today's budget. Once completed, a day stays completed.
create or replace function public.update_daily_activity()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_day record;
  v_done integer;
  v_completed boolean;
begin
  if v_user is null then
    return;
  end if;
  select * into v_day from public.user_today();
  perform public.start_daily_activity();

  select count(*) into v_done
  from public.reviews r
  where r.user_id = v_user
    and r.review >= v_day.day_start
    and r.review < v_day.day_end;

  update public.daily_activity a
  set reviews_done = v_done
  where a.user_id = v_user and a.day = v_day.today
  returning a.completed into v_completed;

  if v_completed then
    return;
  end if;

  if v_done < 20 then
    if exists (
      select 1 from public.user_words uw
      where uw.user_id = v_user
        and uw.suspended = false
        and uw.state <> 0
        and uw.due <= now()
    ) then
      return;
    end if;
    if exists (select 1 from public.get_review_queue(now(), v_day.day_start) q where q.is_new) then
      return;
    end if;
    if exists (select 1 from public.get_writing_queue(now(), v_day.day_start) q where q.is_new) then
      return;
    end if;
  end if;

  update public.daily_activity a
  set completed = true
  where a.user_id = v_user and a.day = v_day.today;
end;
$$;

-- Marks today practiced: called once per practice session. Never
-- completes the day.
create or replace function public.mark_practiced()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'mark_practiced: not signed in' using errcode = '42501';
  end if;
  perform public.start_daily_activity();
  update public.daily_activity a
  set practiced = true
  where a.user_id = v_user and a.day = (select t.today from public.user_today() t);
end;
$$;

-- record_review (security invoker) calls the first two as the caller.
-- Each touches only the caller's row and recomputes it, so calling them
-- directly is harmless.
revoke execute on function public.start_daily_activity() from public, anon;
grant execute on function public.start_daily_activity() to authenticated;
revoke execute on function public.update_daily_activity() from public, anon;
grant execute on function public.update_daily_activity() to authenticated;
revoke execute on function public.mark_practiced() from public, anon;
grant execute on function public.mark_practiced() to authenticated;

-- ---------------------------------------------------------------------------
-- record_review
-- ---------------------------------------------------------------------------

-- As in 20261102120000_training.sql, and it keeps today's daily_activity
-- row up to date: started before the card changes (so due_at_start is
-- from before the review), updated after the review is saved. Each runs
-- in its own subtransaction: a failure there is a warning in the log and
-- never stops the review from being saved.
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

  begin
    perform public.start_daily_activity();
  exception when others then
    raise warning 'record_review: start_daily_activity failed: %', sqlerrm;
  end;

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

  begin
    perform public.update_daily_activity();
  exception when others then
    raise warning 'record_review: update_daily_activity failed: %', sqlerrm;
  end;

  return v_review_id;
end;
$$;

revoke execute on function public.record_review(bigint, jsonb, jsonb, integer, text, text) from public, anon;
grant execute on function public.record_review(bigint, jsonb, jsonb, integer, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- get_streak
-- ---------------------------------------------------------------------------

-- The caller's streaks, as one row:
--   current_streak  completed days in a row ending today, or ending
--                   yesterday while today isn't completed yet (today
--                   doesn't break it until it's over)
--   best_streak     the longest run of completed days ever
--   today           today in their zone
--   last_active     the latest day with a review or a practice session,
--                   or null
--   days            the last 7 days, oldest first, as
--                   [{ "day", "completed", "practiced" }]
create or replace function public.get_streak()
returns table (
  current_streak integer,
  best_streak integer,
  today date,
  last_active date,
  days jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  with t as (
    select u.today from public.user_today() u
  ),
  mine as (
    select a.*
    from public.daily_activity a, t
    where a.user_id = auth.uid() and a.day <= t.today
  ),
  -- Runs of consecutive completed days: day minus its rank is constant
  -- within a run.
  runs as (
    select count(*)::integer as length, max(r.day) as last_day
    from (
      select m.day, m.day - (row_number() over (order by m.day))::integer as run
      from mine m
      where m.completed
    ) r
    group by r.run
  )
  select
    coalesce(
      (select r.length from runs r where r.last_day in (t.today, t.today - 1) order by r.last_day desc limit 1),
      0
    ),
    coalesce((select max(r.length) from runs r), 0),
    t.today,
    (select max(m.day) from mine m where m.reviews_done > 0 or m.practiced),
    (
      select jsonb_agg(
        jsonb_build_object(
          'day', d.day::date,
          'completed', coalesce(m.completed, false),
          'practiced', coalesce(m.practiced, false)
        )
        order by d.day
      )
      from generate_series(t.today - 6, t.today, interval '1 day') as d(day)
      left join mine m on m.day = d.day::date
    )
  from t
  where auth.uid() is not null;
$$;

revoke execute on function public.get_streak() from public, anon;
grant execute on function public.get_streak() to authenticated;

-- ---------------------------------------------------------------------------
-- get_level_progress
-- ---------------------------------------------------------------------------

-- For each level in the caller's standard: its words, and how many of
-- them the caller has started (a recognition card past New) and learned.
-- "Learned" is the Training stats' definition, passed in so it lives in
-- one place (src/lib/training/stats.ts): a recognition card in Review (2)
-- with stability of at least p_learned_stability days and at least
-- p_learned_min_reps reviews.
--
-- Totals come from words alone and the caller's counts from their own
-- cards, joined per level after: joining every word to user_words cost
-- about 40 times as much under RLS.
create or replace function public.get_level_progress(
  p_learned_stability double precision,
  p_learned_min_reps integer
)
returns table (
  level smallint,
  total bigint,
  started bigint,
  learned bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with std as (
    select public.user_standard() as s
  ),
  totals as (
    select public.word_level(w, std.s) as level, count(*) as total
    from public.words w, std
    group by 1
  ),
  mine as (
    select
      public.word_level(w, std.s) as level,
      count(*) filter (where uw.state <> 0) as started,
      count(*) filter (
        where uw.state = 2
          and uw.stability >= p_learned_stability
          and uw.reps >= p_learned_min_reps
      ) as learned
    from public.user_words uw
    join public.words w on w.id = uw.word_id
    cross join std
    where uw.user_id = auth.uid()
      and uw.skill = 'recognition'
    group by 1
  )
  select t.level, t.total, coalesce(m.started, 0), coalesce(m.learned, 0)
  from totals t
  left join mine m on m.level = t.level
  where t.level is not null
    and auth.uid() is not null
  order by t.level;
$$;

revoke execute on function public.get_level_progress(double precision, integer) from public, anon;
grant execute on function public.get_level_progress(double precision, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- get_due_forecast
-- ---------------------------------------------------------------------------

-- Recognition and writing cards (past New, not suspended) due on each of
-- the next p_days days in the caller's zone, today first. Today counts
-- everything due by its end, overdue cards included. Days with none are
-- 0.
create or replace function public.get_due_forecast(p_days integer default 7)
returns table (
  day date,
  due bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with z as (
    select public.user_zone() as zone, u.today, u.day_start
    from public.user_today() u
  ),
  n as (
    select least(greatest(coalesce(p_days, 7), 1), 31) as days
  ),
  cards as (
    select greatest((uw.due at time zone z.zone)::date, z.today) as day
    from public.user_words uw, z, n
    where uw.user_id = auth.uid()
      and uw.suspended = false
      and uw.state <> 0
      and uw.due < ((z.today + n.days)::timestamp at time zone z.zone)
  )
  select d.day::date, count(c.day)
  from z, n, generate_series(z.today, z.today + n.days - 1, interval '1 day') as d(day)
  left join cards c on c.day = d.day::date
  where auth.uid() is not null
  group by d.day
  order by d.day;
$$;

revoke execute on function public.get_due_forecast(integer) from public, anon;
grant execute on function public.get_due_forecast(integer) to authenticated;

commit;
