-- moink: HSK 3.0 words and the 2025 syllabus levels.
--
-- Additive and re-runnable, in one transaction. Run after
-- 20261109120000_writing.sql, then fill the new columns with
-- scripts/seed-hsk3.ts.
--
-- words.hsk3_level stays the 2021 standard (GF0025-2021, the dataset's
-- new-* tags). hsk3_2025_level is the 2025 exam syllabus (newest-* tags),
-- the target standard. Both use 7 for the combined bands 7 to 9.
--
-- HSK 3.0 words that were never in old HSK get rows with hsk_level null,
-- so hsk_level loses NOT NULL. Old HSK keeps its own order (sort_order);
-- the 2025 levels get sort_order_2025.

begin;

-- ---------------------------------------------------------------------------
-- words
-- ---------------------------------------------------------------------------

-- Old HSK level (1 to 6); null for a word that's only in HSK 3.0.
alter table public.words alter column hsk_level drop not null;

alter table public.words
  add column if not exists hsk3_2025_level smallint;

alter table public.words drop constraint if exists words_hsk3_2025_level_check;
alter table public.words
  add constraint words_hsk3_2025_level_check check (hsk3_2025_level between 1 and 7);

-- Order within the 2025 level: by frequency (the dataset's rank, lower is
-- more common; unknown last), ties by id. Set by rank_words_2025().
alter table public.words
  add column if not exists sort_order_2025 integer;

create index if not exists words_hsk3_2025_level_sort_order_2025_idx
  on public.words (hsk3_2025_level, sort_order_2025);

-- ---------------------------------------------------------------------------
-- rank_words_2025
-- ---------------------------------------------------------------------------

-- Sets sort_order_2025 for every word with a 2025 level, old and new, and
-- clears it for words without one. Only rows whose value changes are
-- written, so running it again is cheap. Returns the number of rows
-- changed. For scripts/seed-hsk3.ts, run with the service role.
create or replace function public.rank_words_2025()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_changed integer;
begin
  with ranked as (
    select
      w.id,
      case
        when w.hsk3_2025_level is null then null
        else row_number() over (
          partition by w.hsk3_2025_level
          order by w.frequency nulls last, w.id
        )
      end as rn
    from public.words w
  )
  update public.words w
  set sort_order_2025 = ranked.rn
  from ranked
  where w.id = ranked.id
    and w.sort_order_2025 is distinct from ranked.rn;

  get diagnostics v_changed = row_count;
  return v_changed;
end;
$$;

revoke execute on function public.rank_words_2025() from public, anon, authenticated;
grant execute on function public.rank_words_2025() to service_role;

commit;
