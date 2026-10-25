-- moink: learning core (glosses, FSRS cards, review log).
--
-- Safe to run once on the existing database: everything is additive and
-- guarded with "if not exists" / "or replace". Nothing is dropped or
-- renamed except policies, which are dropped and recreated by name so the
-- script can be re-run. Wrapped in a transaction: it applies fully or not
-- at all.
--
-- FSRS fields mirror ts-fsrs 5.4.2:
--   Card      due, stability, difficulty, elapsed_days, scheduled_days,
--             learning_steps, reps, lapses, state, last_review
--   ReviewLog rating, state, due, stability, difficulty, elapsed_days,
--             last_elapsed_days, scheduled_days, learning_steps, review
--   State     0 New, 1 Learning, 2 Review, 3 Relearning
--   Rating    1 Again, 2 Hard, 3 Good, 4 Easy (0 Manual is not stored)

begin;

-- ---------------------------------------------------------------------------
-- words
-- ---------------------------------------------------------------------------

-- Short learner-facing meaning, built from meanings by
-- scripts/clean-glosses.ts. 'reviewed' rows were hand-edited and are never
-- overwritten by the script.
alter table public.words
  add column if not exists gloss text;

alter table public.words
  add column if not exists gloss_status text not null default 'auto'
    constraint words_gloss_status_check check (gloss_status in ('auto', 'reviewed'));

-- classifiers text[] already exists (filled by the seed script), so it is
-- not added here.

-- New HSK 3.0 level, filled later. hsk_level stays the old HSK (1 to 6).
alter table public.words
  add column if not exists hsk3_level smallint
    constraint words_hsk3_level_check check (hsk3_level between 1 and 9);

-- Stable learning order within a level. frequency can't serve: it has ties
-- (4,289 distinct values over 4,991 rows) and uses 1000000 for "unknown".
-- The dataset order (id) is alphabetical by pinyin, so the order is by
-- frequency rank, ties broken by id. Only fills rows that have no value,
-- so re-running keeps existing numbers.
alter table public.words
  add column if not exists sort_order integer;

update public.words w
set sort_order = ranked.rn
from (
  select id, row_number() over (partition by hsk_level order by frequency nulls last, id) as rn
  from public.words
) ranked
where ranked.id = w.id
  and w.sort_order is null;

create index if not exists words_hsk_level_sort_order_idx
  on public.words (hsk_level, sort_order);

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists daily_new_words smallint not null default 10
    constraint profiles_daily_new_words_check check (daily_new_words between 0 and 50);

alter table public.profiles
  add column if not exists timezone text not null default 'Asia/Jakarta';

-- ---------------------------------------------------------------------------
-- user_words: one FSRS card per user and word
-- ---------------------------------------------------------------------------

-- Defaults match ts-fsrs createEmptyCard(), so a new card can be inserted
-- with just user_id and word_id.
create table if not exists public.user_words (
  user_id uuid not null references public.profiles (id) on delete cascade,
  word_id bigint not null references public.words (id) on delete cascade,

  due timestamptz not null default now(),
  stability double precision not null default 0,
  difficulty double precision not null default 0,
  elapsed_days integer not null default 0,
  scheduled_days integer not null default 0,
  learning_steps integer not null default 0,
  reps integer not null default 0,
  lapses integer not null default 0,
  state smallint not null default 0 check (state between 0 and 3),
  last_review timestamptz,

  introduced_at timestamptz not null default now(),
  suspended boolean not null default false,

  primary key (user_id, word_id)
);

create index if not exists user_words_due_idx
  on public.user_words (user_id, due)
  where suspended = false;

alter table public.user_words enable row level security;

drop policy if exists "user_words: select own" on public.user_words;
create policy "user_words: select own" on public.user_words
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "user_words: insert own" on public.user_words;
create policy "user_words: insert own" on public.user_words
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "user_words: update own" on public.user_words;
create policy "user_words: update own" on public.user_words
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "user_words: delete own" on public.user_words;
create policy "user_words: delete own" on public.user_words
  for delete to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.user_words to authenticated;

-- ---------------------------------------------------------------------------
-- reviews: append-only review log
-- ---------------------------------------------------------------------------

create table if not exists public.reviews (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  word_id bigint not null references public.words (id) on delete cascade,

  rating smallint not null check (rating between 1 and 4),
  state smallint not null check (state between 0 and 3),
  due timestamptz not null,
  stability double precision not null,
  difficulty double precision not null,
  elapsed_days integer not null,
  last_elapsed_days integer not null,
  scheduled_days integer not null,
  learning_steps integer not null,
  review timestamptz not null,

  duration_ms integer check (duration_ms >= 0),
  mode text not null default 'flashcard'
);

create index if not exists reviews_user_review_idx
  on public.reviews (user_id, review desc);

alter table public.reviews enable row level security;

-- Select and insert only. With no update or delete policy, RLS refuses
-- both for every user.
drop policy if exists "reviews: select own" on public.reviews;
create policy "reviews: select own" on public.reviews
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "reviews: insert own" on public.reviews;
create policy "reviews: insert own" on public.reviews
  for insert to authenticated
  with check (user_id = (select auth.uid()));

grant select, insert on public.reviews to authenticated;

-- The identity sequence, so inserts run as the user can draw ids.
do $$
begin
  execute format(
    'grant usage on sequence %s to authenticated',
    pg_get_serial_sequence('public.reviews', 'id')
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- record_review: save the new card state and log the review together
-- ---------------------------------------------------------------------------

-- p_card is a ts-fsrs Card and p_log a ReviewLog, both as JSON (Dates
-- serialize to ISO strings). Runs as the caller, so RLS applies: it can
-- only touch the caller's own card. A function body is one transaction, so
-- the update and the insert both happen or neither does. Returns the new
-- review id.
create or replace function public.record_review(
  p_word_id bigint,
  p_card jsonb,
  p_log jsonb,
  p_duration_ms integer default null,
  p_mode text default 'flashcard'
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_review_id bigint;
begin
  if v_user is null then
    raise exception 'record_review: not signed in' using errcode = '42501';
  end if;

  update public.user_words
  set
    due = (p_card ->> 'due')::timestamptz,
    stability = (p_card ->> 'stability')::double precision,
    difficulty = (p_card ->> 'difficulty')::double precision,
    elapsed_days = (p_card ->> 'elapsed_days')::integer,
    scheduled_days = (p_card ->> 'scheduled_days')::integer,
    learning_steps = (p_card ->> 'learning_steps')::integer,
    reps = (p_card ->> 'reps')::integer,
    lapses = (p_card ->> 'lapses')::integer,
    state = (p_card ->> 'state')::smallint,
    last_review = nullif(p_card ->> 'last_review', '')::timestamptz
  where user_id = v_user
    and word_id = p_word_id;

  if not found then
    raise exception 'record_review: no card for word %', p_word_id using errcode = 'P0002';
  end if;

  insert into public.reviews (
    user_id, word_id, rating, state, due, stability, difficulty,
    elapsed_days, last_elapsed_days, scheduled_days, learning_steps, review,
    duration_ms, mode
  )
  values (
    v_user,
    p_word_id,
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

revoke execute on function public.record_review(bigint, jsonb, jsonb, integer, text) from public, anon;
grant execute on function public.record_review(bigint, jsonb, jsonb, integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- next_new_words: the caller's next N unseen words
-- ---------------------------------------------------------------------------

-- Words at or above the caller's hsk_level_target (old HSK; 1 if unset)
-- that aren't in their user_words yet, in learning order. Only the query:
-- session logic (daily limits, introducing cards) lives elsewhere.
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
    )
  order by w.hsk_level, w.sort_order, w.id
  limit greatest(coalesce(p_limit, 10), 0);
$$;

revoke execute on function public.next_new_words(integer) from public, anon;
grant execute on function public.next_new_words(integer) to authenticated;

commit;
