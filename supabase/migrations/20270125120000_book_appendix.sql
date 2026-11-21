-- moink: the HSK Book's appendix (back matter: parts of speech, word
-- index, proper-noun index), and vocab marks that need nothing here.
--
-- Additive and re-runnable, in one transaction. Run after
-- 20270118120000_book_kinds_types.sql.
--
-- 1. Section kind 'appendix'; block types 'pos_table' and 'word_index'
--    (both checks recreated with the full lists, as in docs/book-format.md).
-- 2. book_lessons.kind ('lesson' or 'appendix') and book_lessons.slug. An
--    appendix has no number: it's found by its slug ("appendix", the URL
--    /book/<book>/appendix) and lists after the numbered lessons (number
--    order puts nulls last). Every existing row is a lesson with a number,
--    so the new checks pass on every row.
-- 3. import_book_lesson upserts an appendix by (book, slug) and a lesson by
--    (book, number), as before. Either way the row keeps its id, so user
--    notes and progress stay attached; answers are keyed by item key.

begin;

-- 1. Kinds and types --------------------------------------------------------

alter table public.book_sections drop constraint if exists book_sections_kind_check;
alter table public.book_sections
  add constraint book_sections_kind_check check (
    kind in ('objectives', 'warmup', 'text', 'grammar', 'exercises', 'task', 'bonus', 'summary', 'appendix')
  );

alter table public.book_blocks drop constraint if exists book_blocks_type_check;
alter table public.book_blocks
  add constraint book_blocks_type_check check (
    type in (
      'objectives', 'instruction', 'scene', 'choice', 'dialogue', 'passage', 'vocab', 'prompts', 'retell',
      'grammar', 'dialogue_fill', 'sentence_fill', 'word_bank', 'passage_fill', 'image_match',
      'picture_write', 'task', 'tip', 'video', 'self_check', 'pos_table', 'word_index'
    )
  );

-- 2. Lessons without a number ------------------------------------------------

alter table public.book_lessons add column if not exists kind text not null default 'lesson';
alter table public.book_lessons add column if not exists slug text;
alter table public.book_lessons alter column number drop not null;

alter table public.book_lessons drop constraint if exists book_lessons_kind_check;
alter table public.book_lessons
  add constraint book_lessons_kind_check check (kind in ('lesson', 'appendix'));

-- A lesson has a number; an appendix has a slug and no number. The slug
-- starts with a letter, so it never looks like a lesson number in a URL.
alter table public.book_lessons drop constraint if exists book_lessons_ref_check;
alter table public.book_lessons
  add constraint book_lessons_ref_check check (
    (kind = 'lesson' and number is not null)
    or (kind = 'appendix' and number is null and slug ~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*$')
  );

-- Null slugs (every numbered lesson) don't collide.
alter table public.book_lessons drop constraint if exists book_lessons_book_id_slug_key;
alter table public.book_lessons
  add constraint book_lessons_book_id_slug_key unique (book_id, slug);

-- 3. The import ---------------------------------------------------------------

-- Upserts the book (by slug) and the lesson (an appendix by book and slug,
-- a lesson by book and number), then replaces the lesson's sections and
-- blocks with p_sections (the file's "sections", blocks included). sort is
-- the array index. The lesson keeps its id, so user notes and progress stay
-- attached. Any error rolls the whole call back. Service role only.
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
  v_kind text := coalesce(p_lesson ->> 'kind', 'lesson');
  -- ->> gives null for a JSON null.
  v_number integer := (p_lesson ->> 'number')::integer;
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

  if v_number is null then
    insert into public.book_lessons (book_id, kind, slug, number, title, title_en, page_start, page_end, updated_at)
    values (
      v_book, v_kind, p_lesson ->> 'slug', null, p_lesson -> 'title', p_lesson ->> 'title_en',
      (p_lesson ->> 'page_start')::integer, (p_lesson ->> 'page_end')::integer, now()
    )
    on conflict (book_id, slug) do update set
      kind = excluded.kind,
      title = excluded.title,
      title_en = excluded.title_en,
      page_start = excluded.page_start,
      page_end = excluded.page_end,
      updated_at = now()
    returning id into v_lesson;
  else
    insert into public.book_lessons (book_id, kind, number, title, title_en, page_start, page_end, updated_at)
    values (
      v_book, v_kind, v_number, p_lesson -> 'title', p_lesson ->> 'title_en',
      (p_lesson ->> 'page_start')::integer, (p_lesson ->> 'page_end')::integer, now()
    )
    on conflict (book_id, number) do update set
      kind = excluded.kind,
      title = excluded.title,
      title_en = excluded.title_en,
      page_start = excluded.page_start,
      page_end = excluded.page_end,
      updated_at = now()
    returning id into v_lesson;
  end if;

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

commit;
