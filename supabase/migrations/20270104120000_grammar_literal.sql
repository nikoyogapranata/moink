-- moink: a word-by-word translation for grammar examples, and three more
-- lesson section kinds.
--
-- Additive and re-runnable, in one transaction. Run after
-- 20261228120000_grammar.sql.
--
-- grammar_examples.literal: the sentence translated word by word ("I go
-- store buy things"), shown under the pinyin. Optional.
--
-- Section kinds: 'how' (how it works, the intuition), 'when' (when to use
-- it) and 'recap' (in short), besides the first seven. Existing sections
-- all use the first seven, so the check passes on every row.

begin;

alter table public.grammar_examples
  add column if not exists literal text;

-- As in 20261228120000_grammar.sql, with the three new kinds. The table's
-- check constraint calls this function, so replacing it is enough.
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
          'build', 'variations', 'negative', 'questions', 'mistakes', 'compare', 'notes',
          'how', 'when', 'recap'
        )
        or jsonb_typeof(section -> 'title') is distinct from 'string'
        or jsonb_typeof(section -> 'body') is distinct from 'string'
        or (section ->> 'kind' = 'mistakes' and jsonb_typeof(section -> 'items') is distinct from 'array')
    );
$$;

commit;
