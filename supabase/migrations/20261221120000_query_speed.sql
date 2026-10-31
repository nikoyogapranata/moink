-- moink: query speed for Today's review, the Dashboard and search.
--
-- Additive and re-runnable, in one transaction. Run after
-- 20261214120000_rest_days_timezone.sql. Replaces next_new_words and
-- search_words (20261123120000_hsk_standard.sql), get_level_progress
-- (20261207120000_streaks.sql), and one profiles policy.
--
-- What EXPLAIN (ANALYZE, BUFFERS) showed, as the signed-in test user:
-- next_new_words took about 220 ms (and with it get_review_queue, 230 ms)
-- and get_level_progress about 175 ms; everything else on the Dashboard
-- took under 6 ms, a plain count of words 2 ms. The cause was the same in
-- each: the caller's standard came from user_standard() in a CTE that
-- Postgres inlines, so it ran once per word row (11,470 of them), in the
-- filter and again in each sort key, each time a lookup in profiles
-- (7.6 million sequential scans of it so far). user_standard() itself
-- can't be inlined (it sets search_path), and with the sort key an
-- expression the (hsk_level, sort_order) and (hsk3_2025_level,
-- sort_order_2025) indexes couldn't give the order either.
--
-- word_level() and word_sort() were already plain LANGUAGE sql IMMUTABLE
-- CASE expressions with no SET clause, and Postgres inlines them; they
-- stay as they are. The fixes read the standard once per query instead:
--   next_new_words      looks it up once, then runs the query for that
--                       standard on its own columns, so the level index
--                       gives the order and the scan stops at p_limit
--   get_level_progress  materializes the standard, so it's a value
--   search_words        materializes the parsed query (standard, plain
--                       and numeric pinyin, the escaped regex), which was
--                       also being worked out once per word
--
-- RLS: every policy on user_words, reviews and daily_activity already
-- uses (select auth.uid()), evaluated once per query; the one that
-- didn't, the profiles update policy, is rewritten. Each table already
-- has an index that starts with user_id (its primary key, and
-- user_words_due_idx and reviews_user_review_idx), so none is added.

begin;

-- ---------------------------------------------------------------------------
-- next_new_words
-- ---------------------------------------------------------------------------

-- As in 20261123120000_hsk_standard.sql: words at or above the caller's
-- hsk_level_target in their standard (1 if unset) with no recognition
-- card yet, in learning order, words with no level in it left out. The
-- standard and target are read once, and each standard's query uses its
-- own columns, so the index on (level, order) gives the order.
create or replace function public.next_new_words(p_limit integer default 10)
returns setof public.words
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_std text;
  v_target smallint;
  v_limit integer := greatest(coalesce(p_limit, 10), 0);
begin
  if v_user is null then
    return;
  end if;
  select p.hsk_standard, p.hsk_level_target into v_std, v_target
  from public.profiles p
  where p.id = v_user;
  v_std := coalesce(v_std, 'hsk3');
  v_target := coalesce(v_target, 1);

  if v_std = 'hsk2' then
    return query
      select w.*
      from public.words w
      where w.hsk_level >= v_target
        and not exists (
          select 1 from public.user_words uw
          where uw.user_id = v_user and uw.word_id = w.id and uw.skill = 'recognition'
        )
      order by w.hsk_level, w.sort_order nulls last, w.id
      limit v_limit;
  else
    return query
      select w.*
      from public.words w
      where w.hsk3_2025_level >= v_target
        and not exists (
          select 1 from public.user_words uw
          where uw.user_id = v_user and uw.word_id = w.id and uw.skill = 'recognition'
        )
      order by w.hsk3_2025_level, w.sort_order_2025 nulls last, w.id
      limit v_limit;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- get_level_progress
-- ---------------------------------------------------------------------------

-- As in 20261207120000_streaks.sql, with the standard materialized: read
-- once, not once per word.
create or replace function public.get_level_progress(
  p_learned_stability double precision,
  p_learned_min_reps integer
)
returns table (
  level smallint,
  total bigint,
  started bigint,
  learned bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with std as materialized (
    select public.user_standard() as s
  ),
  totals as (
    select public.word_level(w, std.s) as level, count(*) as total
    from public.words w, std
    group by 1
  ),
  mine as (
    select
      public.word_level(w, std.s) as level,
      count(*) filter (where uw.state <> 0) as started,
      count(*) filter (
        where uw.state = 2
          and uw.stability >= p_learned_stability
          and uw.reps >= p_learned_min_reps
      ) as learned
    from public.user_words uw
    join public.words w on w.id = uw.word_id
    cross join std
    where uw.user_id = auth.uid()
      and uw.skill = 'recognition'
    group by 1
  )
  select t.level, t.total, coalesce(m.started, 0), coalesce(m.learned, 0)
  from totals t
  left join mine m on m.level = t.level
  where t.level is not null
    and auth.uid() is not null
  order by t.level;
$$;

revoke execute on function public.get_level_progress(double precision, integer) from public, anon;
grant execute on function public.get_level_progress(double precision, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- search_words
-- ---------------------------------------------------------------------------

-- As in 20261123120000_hsk_standard.sql, with the parsed query (n)
-- materialized: the standard, the plain and numeric pinyin and the escaped
-- regex are worked out once, not once per word.
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
  hsk3_2025_level smallint,
  total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (
    select
      lower(btrim(coalesce(p_query, ''))) as raw,
      public.user_standard() as std
  ),
  n as materialized (
    select
      raw,
      std,
      raw ~ '[㐀-䶿一-鿿豈-﫿]' as is_hanzi,
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
      w.id, w.simplified, w.pinyin, w.gloss, w.hsk_level, w.hsk3_level, w.hsk3_2025_level,
      public.word_level(w, n.std) as level,
      public.word_sort(w, n.std) as sort,
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
        or (p_level >= 5 and public.word_level(w, n.std) >= 5)
        or public.word_level(w, n.std) = p_level
      )
  )
  select
    r.id, r.simplified, r.pinyin, r.gloss, r.hsk_level, r.hsk3_level, r.hsk3_2025_level,
    count(*) over () as total_count
  from ranked r
  where r.rank is not null
  order by r.rank, r.level nulls last, r.sort nulls last, r.id
  limit least(greatest(coalesce(p_limit, 30), 0), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke execute on function public.search_words(text, smallint, integer, integer) from public, anon;
grant execute on function public.search_words(text, smallint, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- profiles: the update policy
-- ---------------------------------------------------------------------------

-- Same rule, with auth.uid() in a subquery so it's evaluated once per
-- query rather than once per row.
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

commit;
