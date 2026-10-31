-- moink: grammar points (the HSK 3.0 2025 syllabus), their lessons and
-- examples, and a per-user FSRS card for grammar practice.
--
-- Additive and re-runnable, in one transaction. Run after
-- 20261221120000_query_speed.sql, then fill the tables with
-- scripts/seed-grammar.ts (the point list) and scripts/import-grammar.ts
-- (the lessons and examples we write).
--
-- grammar_points is the syllabus list: one row per entry of the 2025
-- syllabus, in its order (standard, level, sort_order). category,
-- subcategory, detail and source_text are the syllabus text (类别,
-- 类别名称, 细目, 语法内容) as the seed script read it, kept for tracing
-- back; nothing users see comes from them. Everything users see (name_en,
-- slug, pattern, the lesson and its examples) is written by us.
--
-- kind 'words' is an entry that lists function words (程度副词: 很、太、
-- 真 ...); grammar_point_words links them to words. 'structure' is
-- everything else, and only those get lessons.
--
-- Levels are 1 to 7, with 7 for bands 7 to 9, as in words.
--
-- Reference data (grammar_points, grammar_point_words, grammar_lessons,
-- grammar_examples) is readable by signed-in users and written only by
-- the service role (the scripts), which bypasses RLS. user_grammar is the
-- user's own, like user_words; nothing reads it yet.

begin;

-- ---------------------------------------------------------------------------
-- grammar_points
-- ---------------------------------------------------------------------------

create table if not exists public.grammar_points (
  id integer generated always as identity primary key,
  standard text not null default 'hsk3_2025'
    constraint grammar_points_standard_check check (standard in ('hsk3_2025')),
  level smallint not null
    constraint grammar_points_level_check check (level between 1 and 7),
  -- Position in the syllabus within the level, from 1.
  sort_order integer not null,

  -- The syllabus text, after the seed script's typo fixes. Null where the
  -- syllabus leaves the field empty.
  category text,
  subcategory text,
  detail text,
  source_text text not null,

  kind text not null
    constraint grammar_points_kind_check check (kind in ('words', 'structure')),
  name_zh text not null,
  name_en text,
  slug text
    constraint grammar_points_slug_check check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  -- Display pattern, e.g. "A比B+形容词". Null until written.
  pattern text,

  -- The matching point of the 2021 standard (GF 0025-2021), where the
  -- match is confident: its level and code (二58, 七—九012).
  level_2021 smallint
    constraint grammar_points_level_2021_check check (level_2021 between 1 and 7),
  code_2021 text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint grammar_points_standard_level_sort_order_key unique (standard, level, sort_order),
  constraint grammar_points_slug_key unique (slug)
);

-- ---------------------------------------------------------------------------
-- grammar_point_words: the words a 'words' point lists
-- ---------------------------------------------------------------------------

create table if not exists public.grammar_point_words (
  point_id integer not null references public.grammar_points (id) on delete cascade,
  word_id bigint not null references public.words (id) on delete cascade,
  -- Order in the syllabus list (很 before 太 before 真), from 1.
  sort_order smallint not null,
  primary key (point_id, word_id)
);

-- Which points list a word (the word's page).
create index if not exists grammar_point_words_word_id_idx
  on public.grammar_point_words (word_id);

-- ---------------------------------------------------------------------------
-- grammar_lessons: one per 'structure' point, written by us
-- ---------------------------------------------------------------------------

-- pattern_parts: [{ "text": "比", "label": "compare marker", "role":
-- "marker" }, ...], in order; role picks the block's color.
create or replace function public.grammar_pattern_parts_valid(p_parts jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p_parts) = 'array'
    and not exists (
      select 1
      from jsonb_array_elements(p_parts) as part
      where jsonb_typeof(part) <> 'object'
        or jsonb_typeof(part -> 'text') is distinct from 'string'
        or part ->> 'text' = ''
        or jsonb_typeof(part -> 'label') is distinct from 'string'
        or coalesce(part ->> 'role', '') not in (
          'subject', 'object', 'marker', 'verb', 'adjective',
          'number', 'time', 'place', 'other'
        )
    );
$$;

-- sections: [{ "kind": "build", "title": "...", "body": "..." }, ...], in
-- order. A 'mistakes' section also has "items": [{ "wrong", "right",
-- "reason" }, ...]. scripts/import-grammar.ts checks the rest.
create or replace function public.grammar_sections_valid(p_sections jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p_sections) = 'array'
    and not exists (
      select 1
      from jsonb_array_elements(p_sections) as section
      where jsonb_typeof(section) <> 'object'
        or coalesce(section ->> 'kind', '') not in (
          'build', 'variations', 'negative', 'questions', 'mistakes', 'compare', 'notes'
        )
        or jsonb_typeof(section -> 'title') is distinct from 'string'
        or jsonb_typeof(section -> 'body') is distinct from 'string'
        or (section ->> 'kind' = 'mistakes' and jsonb_typeof(section -> 'items') is distinct from 'array')
    );
$$;

create table if not exists public.grammar_lessons (
  point_id integer primary key references public.grammar_points (id) on delete cascade,
  summary text not null default '',
  pattern_parts jsonb not null default '[]'
    constraint grammar_lessons_pattern_parts_check check (public.grammar_pattern_parts_valid(pattern_parts)),
  sections jsonb not null default '[]'
    constraint grammar_lessons_sections_check check (public.grammar_sections_valid(sections)),
  -- grammar_points ids. Not foreign keys (an array can't be one): the
  -- importer checks them.
  related_point_ids integer[] not null default '{}',
  status text not null default 'draft'
    constraint grammar_lessons_status_check check (status in ('draft', 'reviewed')),
  reviewed_at timestamptz,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- grammar_examples
-- ---------------------------------------------------------------------------

create table if not exists public.grammar_examples (
  id integer generated always as identity primary key,
  point_id integer not null references public.grammar_points (id) on delete cascade,
  sort_order smallint not null,
  hanzi text not null,
  pinyin text not null,
  translation text not null,
  -- The part of hanzi that shows the pattern, highlighted in the lesson.
  highlight text not null,
  difficulty smallint not null default 1
    constraint grammar_examples_difficulty_check check (difficulty between 1 and 3),
  status text not null default 'draft'
    constraint grammar_examples_status_check check (status in ('draft', 'reviewed')),
  -- Highest 2025 level of the words in hanzi, set by
  -- scripts/check-grammar-examples.ts (and the importer).
  max_word_level smallint
    constraint grammar_examples_max_word_level_check check (max_word_level between 1 and 7),
  updated_at timestamptz not null default now(),

  constraint grammar_examples_highlight_check check (strpos(hanzi, highlight) > 0),
  -- Also serves lookups by point_id.
  constraint grammar_examples_point_id_sort_order_key unique (point_id, sort_order)
);

-- ---------------------------------------------------------------------------
-- RLS for the reference tables: read when signed in, written by the
-- service role only (no insert, update or delete policy, so RLS refuses
-- them for every other role).
-- ---------------------------------------------------------------------------

alter table public.grammar_points enable row level security;
alter table public.grammar_point_words enable row level security;
alter table public.grammar_lessons enable row level security;
alter table public.grammar_examples enable row level security;

drop policy if exists "grammar_points: read" on public.grammar_points;
create policy "grammar_points: read" on public.grammar_points
  for select to authenticated using (true);

drop policy if exists "grammar_point_words: read" on public.grammar_point_words;
create policy "grammar_point_words: read" on public.grammar_point_words
  for select to authenticated using (true);

drop policy if exists "grammar_lessons: read" on public.grammar_lessons;
create policy "grammar_lessons: read" on public.grammar_lessons
  for select to authenticated using (true);

drop policy if exists "grammar_examples: read" on public.grammar_examples;
create policy "grammar_examples: read" on public.grammar_examples
  for select to authenticated using (true);

grant select on public.grammar_points, public.grammar_point_words,
  public.grammar_lessons, public.grammar_examples to authenticated;

-- ---------------------------------------------------------------------------
-- user_grammar: one FSRS card per user and grammar point (not used yet)
-- ---------------------------------------------------------------------------

-- The same card fields and defaults as user_words (ts-fsrs
-- createEmptyCard()), so a new card can be inserted with just user_id and
-- point_id.
create table if not exists public.user_grammar (
  user_id uuid not null references public.profiles (id) on delete cascade,
  point_id integer not null references public.grammar_points (id) on delete cascade,

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

  primary key (user_id, point_id)
);

-- user_id lookups (the RLS filter) use the primary key, which starts with
-- user_id; this one is for the due queue, as user_words_due_idx.
create index if not exists user_grammar_due_idx
  on public.user_grammar (user_id, due)
  where suspended = false;

-- For the cascade when a grammar point is deleted.
create index if not exists user_grammar_point_id_idx
  on public.user_grammar (point_id);

alter table public.user_grammar enable row level security;

drop policy if exists "user_grammar: select own" on public.user_grammar;
create policy "user_grammar: select own" on public.user_grammar
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "user_grammar: insert own" on public.user_grammar;
create policy "user_grammar: insert own" on public.user_grammar
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "user_grammar: update own" on public.user_grammar;
create policy "user_grammar: update own" on public.user_grammar
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "user_grammar: delete own" on public.user_grammar;
create policy "user_grammar: delete own" on public.user_grammar
  for delete to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.user_grammar to authenticated;

commit;
