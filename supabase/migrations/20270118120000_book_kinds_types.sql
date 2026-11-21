-- moink: the HSK Book's allowed section kinds and block types, as in
-- docs/book-format.md (lessons 1-4).
--
-- Additive and re-runnable, in one transaction. Run after
-- 20270111120000_book.sql. Matches what was applied by hand in the SQL
-- editor: both checks recreated with the full lists.
--
-- New: kind 'bonus' (小语的彩蛋 Xiaoyu's Bonus Content); types 'tip'
-- (小语助力 Xiaoyu's Tip) and 'video'. Existing rows all use earlier
-- values, so both checks pass on every row.
--
-- A new kind or type goes in a new migration like this one, together with
-- SECTION_KINDS / BLOCK_TYPES in scripts/import-book.ts.

begin;

alter table public.book_sections drop constraint if exists book_sections_kind_check;
alter table public.book_sections
  add constraint book_sections_kind_check check (
    kind in ('objectives', 'warmup', 'text', 'grammar', 'exercises', 'task', 'bonus', 'summary')
  );

alter table public.book_blocks drop constraint if exists book_blocks_type_check;
alter table public.book_blocks
  add constraint book_blocks_type_check check (
    type in (
      'objectives', 'instruction', 'scene', 'choice', 'dialogue', 'passage', 'vocab', 'prompts', 'retell',
      'grammar', 'dialogue_fill', 'sentence_fill', 'word_bank', 'passage_fill', 'image_match',
      'picture_write', 'task', 'tip', 'video', 'self_check'
    )
  );

commit;
