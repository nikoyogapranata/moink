-- moink: HSK Book, the 新HSK教程 textbooks lesson by lesson, in the printed
-- book's order (docs/book-format.md has the lesson JSON).
--
-- Additive and re-runnable, in one transaction. Run after
-- 20270104120000_grammar_literal.sql, then fill the tables with
-- scripts/import-book.ts.
--
-- Content (books, book_lessons, book_sections, book_blocks) is written only
-- by the service role (the import script, through import_book_lesson) and
-- read only by users on the book_access allowlist. A re-import replaces a
-- lesson's sections and blocks, so their ids change; their keys don't.
-- User data (answers, notes, progress) references keys for that reason.

begin;

-- ---------------------------------------------------------------------------
-- Access allowlist
-- ---------------------------------------------------------------------------

create table if not exists public.book_access (
  user_id uuid primary key references auth.users (id) on delete cascade,
  granted_at timestamptz not null default now()
);

-- True when the caller is on the allowlist. security definer so the
-- policies that call it don't depend on book_access's own policy.
create or replace function public.has_book_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.book_access where user_id = auth.uid());
$$;

revoke execute on function public.has_book_access() from public, anon;
grant execute on function public.has_book_access() to authenticated;

alter table public.book_access enable row level security;

drop policy if exists "book_access: select own" on public.book_access;
create policy "book_access: select own" on public.book_access
  for select to authenticated
  using (user_id = (select auth.uid()));

grant select on public.book_access to authenticated;

-- ---------------------------------------------------------------------------
-- Content
-- ---------------------------------------------------------------------------

create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  slug text not null
    constraint books_slug_check check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title_zh text not null,
  title_en text not null,
  level smallint not null,
  standard text not null,
  -- Order on the book list. The importer sets it on insert only.
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  constraint books_slug_key unique (slug)
);

create table if not exists public.book_lessons (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books (id) on delete cascade,
  number integer not null,
  -- A Text: {zh, py}.
  title jsonb not null,
  title_en text not null,
  page_start integer not null,
  page_end integer not null,
  updated_at timestamptz not null default now(),
  constraint book_lessons_book_id_number_key unique (book_id, number)
);

create table if not exists public.book_sections (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.book_lessons (id) on delete cascade,
  key text not null,
  -- Position in the lesson, from 0. Never re-sort: this is the book's order.
  sort integer not null,
  kind text not null
    constraint book_sections_kind_check check (
      kind in ('objectives', 'warmup', 'text', 'grammar', 'exercises', 'task', 'summary')
    ),
  label_zh text not null,
  label_en text not null,
  page integer not null,
  constraint book_sections_key_key unique (key)
);

create index if not exists book_sections_lesson_id_sort_idx
  on public.book_sections (lesson_id, sort);

create table if not exists public.book_blocks (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.book_sections (id) on delete cascade,
  lesson_id uuid not null references public.book_lessons (id) on delete cascade,
  key text not null,
  -- Position in the lesson (not the section), from 0.
  sort integer not null,
  page integer not null,
  type text not null,
  source text not null default 'book',
  data jsonb not null,
  constraint book_blocks_key_key unique (key)
);

create index if not exists book_blocks_lesson_id_sort_idx
  on public.book_blocks (lesson_id, sort);

-- For the cascade when a section is deleted (every re-import).
create index if not exists book_blocks_section_id_idx
  on public.book_blocks (section_id);

alter table public.books enable row level security;
alter table public.book_lessons enable row level security;
alter table public.book_sections enable row level security;
alter table public.book_blocks enable row level security;

drop policy if exists "books: read with access" on public.books;
create policy "books: read with access" on public.books
  for select to authenticated
  using ((select public.has_book_access()));

drop policy if exists "book_lessons: read with access" on public.book_lessons;
create policy "book_lessons: read with access" on public.book_lessons
  for select to authenticated
  using ((select public.has_book_access()));

drop policy if exists "book_sections: read with access" on public.book_sections;
create policy "book_sections: read with access" on public.book_sections
  for select to authenticated
  using ((select public.has_book_access()));

drop policy if exists "book_blocks: read with access" on public.book_blocks;
create policy "book_blocks: read with access" on public.book_blocks
  for select to authenticated
  using ((select public.has_book_access()));

grant select on public.books, public.book_lessons, public.book_sections,
  public.book_blocks to authenticated;

-- ---------------------------------------------------------------------------
-- import_book_lesson: the import script's write, in one transaction
-- ---------------------------------------------------------------------------

-- Upserts the book (by slug) and the lesson (by book and number), then
-- replaces the lesson's sections and blocks with p_sections (the file's
-- "sections", blocks included). sort is the array index. The lesson keeps
-- its id, so user notes and progress stay attached. Any error rolls the
-- whole call back. Service role only.
create or replace function public.import_book_lesson(p_book jsonb, p_lesson jsonb, p_sections jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_book uuid;
  v_lesson uuid;
  v_section uuid;
  v_sort integer := 0;
  s record;
  b record;
begin
  insert into public.books (slug, title_zh, title_en, level, standard)
  values (
    p_book ->> 'slug', p_book ->> 'title_zh', p_book ->> 'title_en',
    (p_book ->> 'level')::smallint, p_book ->> 'standard'
  )
  on conflict (slug) do update set
    title_zh = excluded.title_zh,
    title_en = excluded.title_en,
    level = excluded.level,
    standard = excluded.standard
  returning id into v_book;

  insert into public.book_lessons (book_id, number, title, title_en, page_start, page_end, updated_at)
  values (
    v_book, (p_lesson ->> 'number')::integer, p_lesson -> 'title', p_lesson ->> 'title_en',
    (p_lesson ->> 'page_start')::integer, (p_lesson ->> 'page_end')::integer, now()
  )
  on conflict (book_id, number) do update set
    title = excluded.title,
    title_en = excluded.title_en,
    page_start = excluded.page_start,
    page_end = excluded.page_end,
    updated_at = now()
  returning id into v_lesson;

  -- Blocks go with their sections (on delete cascade).
  delete from public.book_sections where lesson_id = v_lesson;

  for s in
    select value, ordinality - 1 as idx
    from jsonb_array_elements(p_sections) with ordinality
  loop
    insert into public.book_sections (lesson_id, key, sort, kind, label_zh, label_en, page)
    values (
      v_lesson, s.value ->> 'key', s.idx, s.value ->> 'kind',
      s.value ->> 'label_zh', s.value ->> 'label_en', (s.value ->> 'page')::integer
    )
    returning id into v_section;

    for b in
      select value from jsonb_array_elements(s.value -> 'blocks') with ordinality order by ordinality
    loop
      insert into public.book_blocks (section_id, lesson_id, key, sort, page, type, source, data)
      values (
        v_section, v_lesson, b.value ->> 'key', v_sort, (b.value ->> 'page')::integer,
        b.value ->> 'type', coalesce(b.value ->> 'source', 'book'), b.value -> 'data'
      );
      v_sort := v_sort + 1;
    end loop;
  end loop;

  return v_lesson;
end;
$$;

revoke execute on function public.import_book_lesson(jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.import_book_lesson(jsonb, jsonb, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- User data: own rows only, and only with book access
-- ---------------------------------------------------------------------------

-- item_key is an item key, a block key or a block's answer_key.
create table if not exists public.user_book_answers (
  user_id uuid not null references public.profiles (id) on delete cascade,
  item_key text not null,
  answer jsonb not null,
  -- Null for free text (no auto check).
  is_correct boolean,
  updated_at timestamptz not null default now(),
  primary key (user_id, item_key)
);

create table if not exists public.user_book_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  lesson_id uuid not null references public.book_lessons (id) on delete cascade,
  -- Null: a note for the whole lesson.
  block_key text,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_book_notes_user_id_lesson_id_idx
  on public.user_book_notes (user_id, lesson_id);

-- For the cascade when a lesson is deleted.
create index if not exists user_book_notes_lesson_id_idx
  on public.user_book_notes (lesson_id);

create table if not exists public.user_book_progress (
  user_id uuid not null references public.profiles (id) on delete cascade,
  lesson_id uuid not null references public.book_lessons (id) on delete cascade,
  last_block_key text,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

create index if not exists user_book_progress_lesson_id_idx
  on public.user_book_progress (lesson_id);

alter table public.user_book_answers enable row level security;
alter table public.user_book_notes enable row level security;
alter table public.user_book_progress enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['user_book_answers', 'user_book_notes', 'user_book_progress'] loop
    execute format('drop policy if exists %I on public.%I', t || ': select own', t);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (user_id = (select auth.uid()) and (select public.has_book_access()))',
      t || ': select own', t);

    execute format('drop policy if exists %I on public.%I', t || ': insert own', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated
         with check (user_id = (select auth.uid()) and (select public.has_book_access()))',
      t || ': insert own', t);

    execute format('drop policy if exists %I on public.%I', t || ': update own', t);
    execute format(
      'create policy %I on public.%I for update to authenticated
         using (user_id = (select auth.uid()) and (select public.has_book_access()))
         with check (user_id = (select auth.uid()) and (select public.has_book_access()))',
      t || ': update own', t);

    execute format('drop policy if exists %I on public.%I', t || ': delete own', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated
         using (user_id = (select auth.uid()) and (select public.has_book_access()))',
      t || ': delete own', t);
  end loop;
end;
$$;

grant select, insert, update, delete on public.user_book_answers,
  public.user_book_notes, public.user_book_progress to authenticated;

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists show_pinyin boolean not null default true,
  add column if not exists show_english boolean not null default false,
  add column if not exists show_extras boolean not null default true;

-- ---------------------------------------------------------------------------
-- Storage: private bucket for lesson images, at the path in the JSON's src
-- (e.g. 4a/01/text1.webp). Written by the service role only.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('book-assets', 'book-assets', false)
on conflict (id) do update set public = false;

drop policy if exists "book-assets: read with access" on storage.objects;
create policy "book-assets: read with access" on storage.objects
  for select to authenticated
  using (bucket_id = 'book-assets' and (select public.has_book_access()));

commit;

-- Grant yourself access:
-- insert into book_access (user_id) select id from auth.users where email = '<my email>';
