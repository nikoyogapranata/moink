-- moink: rest days for the streak, and a confirmed time zone.
--
-- Additive and re-runnable, in one transaction. Run after
-- 20261207120000_streaks.sql: it replaces start_daily_activity and
-- get_streak from there.
--
-- Rest days: a day with nothing to do (no card past New due during it,
-- and no new words or new writing Today's review could bring, say with a
-- new-word limit of 0) can't be completed, so it no longer breaks the
-- streak. It's neutral: it neither extends nor breaks it.
--
-- Whether a day had anything to do is judged from the cards as they were
-- that day. Cards change only when they're reviewed, and the review log
-- doesn't keep the due date a card had (ts-fsrs logs the previous review
-- time there), so the moment to judge a day is before the next review:
--   - a day with a daily_activity row is a rest day when it isn't
--     completed and due_at_start is 0 (nothing due by its end, nothing
--     new), which start_daily_activity counts before the day's first
--     review;
--   - the days skipped since the last row are judged from the cards as
--     they are now, since nothing has reviewed them in between:
--     start_daily_activity records the rest days among them (rows with
--     due_at_start 0) before the first review of the next active day, and
--     get_streak works them out on the fly until then.
-- Days skipped before this migration have no rows and stay as they were:
-- missed.

begin;

-- ---------------------------------------------------------------------------
-- profiles.timezone_confirmed
-- ---------------------------------------------------------------------------

-- True once the time zone came from the user's browser (onboarding, or the
-- app's one-time check for profiles still on the default) or was picked in
-- Settings. While false, the app may replace the default with the
-- browser's zone, once; after that only Settings changes it, so picking
-- Asia/Jakarta by hand is never undone.
alter table public.profiles
  add column if not exists timezone_confirmed boolean not null default false;

-- ---------------------------------------------------------------------------
-- Rest days
-- ---------------------------------------------------------------------------

-- True when Today's review could bring the caller new words or new writing
-- right now with a full day's budget: a new-word limit above 0 and a word
-- left to learn (a New card added by hand, or a word at or above their
-- target level without a recognition card), or a new-writing limit above
-- 0 and a word that's eligible for writing.
create or replace function public.has_new_work()
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_std text := public.user_standard();
  v_profile record;
begin
  select p.daily_new_words, p.daily_new_writing, coalesce(p.hsk_level_target, 1) as target
  into v_profile
  from public.profiles p
  where p.id = v_user;
  if not found then
    return false;
  end if;

  if v_profile.daily_new_words > 0 then
    if exists (
      select 1 from public.user_words uw
      where uw.user_id = v_user and uw.skill = 'recognition' and uw.state = 0 and uw.suspended = false
    ) then
      return true;
    end if;
    -- No order needed (unlike next_new_words): any one word will do.
    if exists (
      select 1 from public.words w
      where public.word_level(w, v_std) >= v_profile.target
        and not exists (
          select 1 from public.user_words uw
          where uw.user_id = v_user and uw.word_id = w.id and uw.skill = 'recognition'
        )
    ) then
      return true;
    end if;
  end if;

  -- now() as the day's start: no reviews since, so the full budget.
  if v_profile.daily_new_writing > 0
    and exists (select 1 from public.get_writing_queue(now(), now()) q where q.is_new) then
    return true;
  end if;
  return false;
end;
$$;

-- The days from p_from to p_to (in the caller's zone) with nothing to do,
-- judged from the cards as they are now: no card past New (not suspended)
-- due before the day ends, and no new work (has_new_work). Only right for
-- days since the caller's last review, when the cards are as they were
-- then. The checks run cheapest first: a card already due rules out every
-- day.
create or replace function public.rest_days(p_from date, p_to date)
returns setof date
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_first_due timestamptz;
  v_first_day date;
begin
  if auth.uid() is null or p_from is null or p_to is null or p_from > p_to then
    return;
  end if;

  select min(uw.due) into v_first_due
  from public.user_words uw
  where uw.user_id = auth.uid() and uw.suspended = false and uw.state <> 0;
  v_first_day := (v_first_due at time zone public.user_zone())::date;
  if v_first_day is not null and v_first_day <= p_from then
    return;
  end if;

  if public.has_new_work() then
    return;
  end if;

  -- A day has a card due when the earliest due falls on or before it.
  return query
    select d::date
    from generate_series(p_from, least(p_to, coalesce(v_first_day - 1, p_to)), interval '1 day') as d;
end;
$$;

revoke execute on function public.has_new_work() from public, anon;
grant execute on function public.has_new_work() to authenticated;
revoke execute on function public.rest_days(date, date) from public, anon;
grant execute on function public.rest_days(date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- start_daily_activity
-- ---------------------------------------------------------------------------

-- As in 20261207120000_streaks.sql, and before today's row it records the
-- rest days among those skipped since the last row (up to a year back),
-- while the cards are still as they were on them: it runs before the
-- day's first review is saved (record_review) and on practice.
create or replace function public.start_daily_activity()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_day record;
  v_last date;
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

  select max(a.day) into v_last
  from public.daily_activity a
  where a.user_id = v_user and a.day < v_day.today;
  if v_last is not null then
    insert into public.daily_activity (user_id, day)
    select v_user, r.day
    from public.rest_days(greatest(v_last + 1, v_day.today - 366), v_day.today - 1) as r(day)
    on conflict (user_id, day) do nothing;
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

revoke execute on function public.start_daily_activity() from public, anon;
grant execute on function public.start_daily_activity() to authenticated;

-- ---------------------------------------------------------------------------
-- get_streak
-- ---------------------------------------------------------------------------

-- As in 20261207120000_streaks.sql, with rest days left out of the count:
--   current_streak  completed days in a row up to the latest day that
--                   counts (today once completed, otherwise the latest
--                   past day that isn't a rest day); rest days in between
--                   neither extend nor break it
--   best_streak     the longest such run
--   days            the last 7 days, oldest first, now with "rest"
-- A day is a rest day when its row isn't completed and had nothing to do
-- (due_at_start 0), or, without a row since the last one (today too),
-- rest_days says so.
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
  -- Rest days among those since the last row, today included when it has
  -- none: nothing has reviewed the cards since, so they tell.
  gap_rest as (
    select r.day
    from t, public.rest_days(
      coalesce((select max(m.day) + 1 from mine m), t.today),
      t.today
    ) as r(day)
  ),
  span as (
    select d::date as day
    from t, generate_series(coalesce((select min(m.day) from mine m), t.today), t.today, interval '1 day') as d
  ),
  status as (
    select
      s.day,
      coalesce(m.completed, false) as completed,
      coalesce(m.practiced, false) as practiced,
      case
        when m.day is not null then not m.completed and m.due_at_start = 0
        else s.day in (select g.day from gap_rest g)
      end as rest
    from span s
    left join mine m on m.day = s.day
  ),
  -- The days that count: completed days and missed ones. Rest days, and
  -- today until it's completed, are left out.
  counted as (
    select st.day, st.completed
    from status st, t
    where not st.rest and (st.completed or st.day < t.today)
  ),
  -- Runs of completed days among the counted ones: a counted day's rank
  -- minus its rank among days of the same kind is constant within a run.
  runs as (
    select count(*)::integer as length, max(c.day) as last_day
    from (
      select
        c.day,
        c.completed,
        row_number() over (order by c.day)
          - row_number() over (partition by c.completed order by c.day) as run
      from counted c
    ) c
    where c.completed
    group by c.run
  )
  select
    coalesce((select r.length from runs r where r.last_day = (select max(c.day) from counted c)), 0),
    coalesce((select max(r.length) from runs r), 0),
    t.today,
    (select max(m.day) from mine m where m.reviews_done > 0 or m.practiced),
    (
      select jsonb_agg(
        jsonb_build_object(
          'day', d.day::date,
          'completed', coalesce(st.completed, false),
          'practiced', coalesce(st.practiced, false),
          'rest', coalesce(st.rest, false)
        )
        order by d.day
      )
      from generate_series(t.today - 6, t.today, interval '1 day') as d(day)
      left join status st on st.day = d.day::date
    )
  from t
  where auth.uid() is not null;
$$;

revoke execute on function public.get_streak() from public, anon;
grant execute on function public.get_streak() to authenticated;

commit;
