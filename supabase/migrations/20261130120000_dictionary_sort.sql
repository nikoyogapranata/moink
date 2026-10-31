-- moink: A to Z order for the dictionary list.
--
-- Additive and re-runnable, in one transaction. Run after
-- 20261123120000_hsk_standard.sql. Nothing to backfill: sort_az is a
-- generated column, so Postgres fills it now and keeps it in step when a
-- seed or fix script changes a word's pinyin.
--
-- A to Z order, by these keys in turn:
--   1 pinyin_plain (no tones or spaces, ü as v): every "ma..." together,
--     and 旅 lǚ ("lv") after every "lu..." word
--   2 the tone of each syllable in order, neutral last: 妈 mā, 麻 má,
--     马 mǎ, 骂 mà, 吗 ma
--   3 number of characters, 4 simplified, then id (in the query)
-- Search keeps its relevance order (search_words); this is for browsing.

begin;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Tone digits of toned pinyin, one per tone mark, syllable by syllable:
-- "mā" -> "1", "zhǔn bèi" -> "34", "ma" -> "5". A space-separated token
-- with no mark is neutral (5). A few readings run syllables together
-- ("zhìlìyú" -> "442"); their marks still come out in order. Uppercase
-- marks are folded by hand, since lower() only folds ASCII in a C locale.
create or replace function public.pinyin_tones(p_pinyin text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(
    string_agg(
      case
        when s.t ~ '[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜńňǹḿ]' then
          translate(
            regexp_replace(s.t, '[^āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜńňǹḿ]', '', 'g'),
            'āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜńňǹḿ',
            '1234123412341234123412342342'
          )
        else '5'
      end,
      ''
      order by s.n
    ),
    ''
  )
  from regexp_split_to_table(
    btrim(
      translate(
        normalize(coalesce(p_pinyin, ''), nfc),
        'ĀÁǍÀĒÉĚÈĪÍǏÌŌÓǑÒŪÚǓÙǕǗǙǛ',
        'āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ'
      )
    ),
    '\s+'
  ) with ordinality as s(t, n)
  where s.t <> '';
$$;

-- The A to Z key, compared byte by byte (collate "C"):
--   pinyin_plain, space, tones, space, character count (2 digits), space,
--   simplified
-- e.g. "ma 1 01 妈". A space sorts before any letter or digit, so "ma"
-- comes before "mai" and tones "1" before "11". A word without
-- pinyin_plain sorts after z.
create or replace function public.pinyin_sort_key(
  p_plain text,
  p_pinyin text,
  p_simplified text
)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(nullif(p_plain, ''), '~')
    || ' ' || public.pinyin_tones(p_pinyin)
    || ' ' || lpad(char_length(p_simplified)::text, 2, '0')
    || ' ' || p_simplified;
$$;

-- ---------------------------------------------------------------------------
-- words.sort_az
-- ---------------------------------------------------------------------------

alter table public.words
  add column if not exists sort_az text collate "C"
  generated always as (public.pinyin_sort_key(pinyin_plain, pinyin, simplified)) stored;

-- One index per level filter, in each standard, so a page of the list is
-- an index range scan: All, a single level, and 5+ (5 and above).
create index if not exists words_sort_az_idx
  on public.words (sort_az, id);
create index if not exists words_hsk_level_sort_az_idx
  on public.words (hsk_level, sort_az, id);
create index if not exists words_hsk3_2025_level_sort_az_idx
  on public.words (hsk3_2025_level, sort_az, id);
create index if not exists words_hsk_level_5_sort_az_idx
  on public.words (sort_az, id) where hsk_level >= 5;
create index if not exists words_hsk3_2025_level_5_sort_az_idx
  on public.words (sort_az, id) where hsk3_2025_level >= 5;

-- ---------------------------------------------------------------------------
-- word_letter_counts
-- ---------------------------------------------------------------------------

-- How many words start with each letter (A to Z, from sort_az) at
-- p_level in p_standard ('hsk2' or 'hsk3'; p_level null for all levels,
-- 5 for 5 and above), in A to Z order. Letters with no words are left
-- out. The client adds them up to find where each letter starts in the
-- list, for the jump index.
create or replace function public.word_letter_counts(
  p_standard text,
  p_level smallint default null
)
returns table (
  letter text,
  word_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select upper(left(w.sort_az, 1)) as letter, count(*) as word_count
  from public.words w
  where p_level is null
    or (p_level >= 5 and public.word_level(w, p_standard) >= 5)
    or public.word_level(w, p_standard) = p_level
  group by 1
  order by 1;
$$;

revoke execute on function public.word_letter_counts(text, smallint) from public, anon;
grant execute on function public.word_letter_counts(text, smallint) to authenticated;

commit;
