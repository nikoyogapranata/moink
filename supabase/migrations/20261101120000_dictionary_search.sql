-- moink: dictionary search and word of the day.
--
-- Additive and re-runnable, in one transaction. Run after
-- 20261025120000_learning_core.sql (it uses sort_order, gloss and
-- user_words). Then fill the new columns with
-- scripts/backfill-search.ts --write.
--
-- words.radical already exists and is filled for every word (for a
-- multi-character word it is the first character's radical), so it is not
-- added here.

begin;

-- ---------------------------------------------------------------------------
-- Search columns
-- ---------------------------------------------------------------------------

-- pinyin_plain  "zhǔn bèi"   -> "zhunbei"    lowercase, tones and spaces removed
-- pinyin_num    "zhun3 bei4" -> "zhun3bei4"  pinyin_numeric without spaces
-- ü is "v" in both. Filled by scripts/backfill-search.ts, and by the seed
-- and fix scripts from then on (scripts/lib/pinyin.ts).
alter table public.words add column if not exists pinyin_plain text;
alter table public.words add column if not exists pinyin_num text;

-- The same normalization for a search query, so "zhǔn bèi", "Zhun Bei"
-- and "zhunbei" all compare equal. Keep the character map identical to
-- scripts/lib/pinyin.ts.
create or replace function public.pinyin_plain(p_text text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select nullif(
    regexp_replace(
      translate(
        replace(lower(normalize(coalesce(p_text, ''), nfc)), 'u:', 'v'),
        'āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜüńňǹḿ',
        'aaaaeeeeiiiioooouuuuvvvvvnnnm'
      ),
      '[^a-z]', '', 'g'
    ),
    ''
  );
$$;

create or replace function public.pinyin_num(p_text text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select nullif(
    regexp_replace(
      translate(
        replace(lower(normalize(coalesce(p_text, ''), nfc)), 'u:', 'v'),
        'āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜüńňǹḿ',
        'aaaaeeeeiiiioooouuuuvvvvvnnnm'
      ),
      '[^a-z0-9]', '', 'g'
    ),
    ''
  );
$$;

-- True when p_query is exactly the first k syllables of p_pinyin (any k),
-- compared in search form: "zhun" and "zhunbei" are syllable prefixes of
-- "zhǔn bèi", but "zhun" is not one of "zhú nián" ("zhu" + half of
-- "nian"). With p_numbers, compares pinyin_numeric forms ("zhun3").
create or replace function public.pinyin_syllable_prefix(
  p_pinyin text,
  p_query text,
  p_numbers boolean
)
returns boolean
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  v_acc text := '';
  v_syllable text;
begin
  if p_pinyin is null or p_query is null or p_query = '' then
    return false;
  end if;
  foreach v_syllable in array regexp_split_to_array(btrim(p_pinyin), '\s+') loop
    v_acc := v_acc || coalesce(
      case when p_numbers then public.pinyin_num(v_syllable) else public.pinyin_plain(v_syllable) end,
      ''
    );
    if v_acc = p_query then
      return true;
    end if;
    if length(v_acc) >= length(p_query) then
      return false;
    end if;
  end loop;
  return false;
end;
$$;

-- ---------------------------------------------------------------------------
-- search_words
-- ---------------------------------------------------------------------------

-- One page of search results. A query with any CJK character matches
-- hanzi; a query with letters or digits matches pinyin, then the gloss,
-- then the raw meanings; anything else (only punctuation) matches nothing.
-- Ranks (lower first), then hsk_level, then sort_order:
--   1 exact hanzi      2 hanzi prefix      3 hanzi contains
--   4 exact pinyin
--   5 pinyin prefix ending on a syllable boundary ("zhun" -> 准备)
--   6 other pinyin prefix ("zhun" -> 逐年 zhú nián)
--   7 gloss whole word  8 meanings contain the query
-- With a digit in the query ("zhun3"), pinyin compares against pinyin_num
-- (tone numbers) instead of pinyin_plain. p_level filters by old HSK;
-- 5 means 5 and above. total_count is the number of matches before
-- paging, the same on every row.
create or replace function public.search_words(
  p_query text,
  p_level smallint default null,
  p_limit integer default 30,
  p_offset integer default 0
)
returns table (
  id bigint,
  simplified text,
  pinyin text,
  gloss text,
  hsk_level smallint,
  hsk3_level smallint,
  total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (
    select
      lower(btrim(coalesce(p_query, ''))) as raw
  ),
  n as (
    select
      raw,
      raw ~ '[㐀-䶿一-鿿豈-﫿]' as is_hanzi,
      raw ~ '[0-9]' as has_digit,
      raw ~ '[a-z0-9]' as has_alnum,
      public.pinyin_plain(raw) as plain,
      public.pinyin_num(raw) as num,
      -- The query as a regex literal, for the whole-word gloss match.
      regexp_replace(raw, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g') as escaped
    from q
  ),
  ranked as (
    select
      w.id, w.simplified, w.pinyin, w.gloss, w.hsk_level, w.hsk3_level, w.sort_order,
      case
        when n.is_hanzi then
          case
            when w.simplified = n.raw or w.traditional = n.raw then 1
            when left(w.simplified, length(n.raw)) = n.raw
              or left(w.traditional, length(n.raw)) = n.raw then 2
            when strpos(w.simplified, n.raw) > 0
              or strpos(coalesce(w.traditional, ''), n.raw) > 0 then 3
          end
        when n.has_alnum then
          case
            when n.has_digit and w.pinyin_num = n.num then 4
            when not n.has_digit and w.pinyin_plain = n.plain then 4
            when n.has_digit and left(w.pinyin_num, length(n.num)) = n.num then
              case when public.pinyin_syllable_prefix(w.pinyin_numeric, n.num, true) then 5 else 6 end
            when not n.has_digit and left(w.pinyin_plain, length(n.plain)) = n.plain then
              case when public.pinyin_syllable_prefix(w.pinyin, n.plain, false) then 5 else 6 end
            when w.gloss ~* ('\m' || n.escaped || '\M') then 7
            when strpos(lower(array_to_string(w.meanings, ' | ')), n.raw) > 0 then 8
          end
      end as rank
    from public.words w
    cross join n
    where n.raw <> ''
      and (
        p_level is null
        or (p_level >= 5 and w.hsk_level >= 5)
        or w.hsk_level = p_level
      )
  )
  select
    r.id, r.simplified, r.pinyin, r.gloss, r.hsk_level, r.hsk3_level,
    count(*) over () as total_count
  from ranked r
  where r.rank is not null
  order by r.rank, r.hsk_level, r.sort_order nulls last, r.id
  limit least(greatest(coalesce(p_limit, 30), 0), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke execute on function public.search_words(text, smallint, integer, integer) from public, anon;
grant execute on function public.search_words(text, smallint, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- word_of_the_day
-- ---------------------------------------------------------------------------

-- One word for the caller and p_date (the date in their own time zone,
-- profiles.timezone; the client works it out). Pool: words at their
-- hsk_level_target they haven't started, in sort_order; if none are left,
-- the next level up, and so on; if they've started everything from their
-- level up, every word at their level. The pick is md5(user, date) modulo
-- the pool size: the same all day, different between users.
create or replace function public.word_of_the_day(p_date date)
returns setof public.words
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_target smallint;
  v_level smallint;
  v_pool bigint;
  v_hash bigint;
begin
  if v_user is null then
    return;
  end if;

  select coalesce(p.hsk_level_target, 1) into v_target
  from public.profiles p
  where p.id = v_user;
  v_target := coalesce(v_target, 1);

  -- 28 bits of md5: always a non-negative integer.
  v_hash := ('x' || substr(md5(v_user::text || ':' || coalesce(p_date, current_date)::text), 1, 7))::bit(28)::bigint;

  -- Lowest level at or above the target that still has unstarted words.
  select min(w.hsk_level) into v_level
  from public.words w
  where w.hsk_level >= v_target
    and not exists (
      select 1 from public.user_words uw
      where uw.user_id = v_user and uw.word_id = w.id
    );

  if v_level is not null then
    select count(*) into v_pool
    from public.words w
    where w.hsk_level = v_level
      and not exists (
        select 1 from public.user_words uw
        where uw.user_id = v_user and uw.word_id = w.id
      );

    return query
      select w.*
      from public.words w
      where w.hsk_level = v_level
        and not exists (
          select 1 from public.user_words uw
          where uw.user_id = v_user and uw.word_id = w.id
        )
      order by w.sort_order nulls last, w.id
      offset v_hash % v_pool
      limit 1;
    return;
  end if;

  -- Everything started: any word at their level.
  select count(*) into v_pool from public.words w where w.hsk_level = v_target;
  if v_pool = 0 then
    return;
  end if;

  return query
    select w.*
    from public.words w
    where w.hsk_level = v_target
    order by w.sort_order nulls last, w.id
    offset v_hash % v_pool
    limit 1;
end;
$$;

revoke execute on function public.word_of_the_day(date) from public, anon;
grant execute on function public.word_of_the_day(date) to authenticated;

commit;
