# HSK Book lesson format

One JSON file per lesson: `book-<book>-lesson-<NN>.json` (e.g. `book-4a-lesson-01.json`).
Images referenced by `src` live next to it under `assets/` with the same path
(e.g. `assets/4a/01/text1.webp`) and are uploaded to the private `book-assets` bucket.

Everything renders **in array order**. Never sort sections or blocks; the order
in the file is the book's order. `page` is the printed book page number.

## Top level

```json
{
  "book":   { "slug": "4a", "title_zh": "新HSK教程 4上", "title_en": "New HSK Course 4A", "level": 4, "standard": "hsk3_2025" },
  "lesson": { "number": 1, "title": Text, "title_en": "...", "page_start": 1, "page_end": 11 },
  "sections": [Section, ...]
}
```

## Text

All Chinese is a Text object:

```json
{ "zh": "你们好，欢迎来到中国留学！", "py": "nǐ men hǎo huān yíng lái dào zhōng guó liú xué" }
```

- `py` has exactly one syllable per Han character in `zh`, separated by spaces, in order.
  Non-Han characters (punctuation, digits, Latin letters, `……`) have no syllable.
- Render each Han character as `<ruby>字<rt>pinyin</rt></ruby>`, walking `zh` and taking the
  next syllable for every Han character. Everything else is output as-is.
- `{_}` inside `zh` is a blank (an answer slot). It has no syllable. Blanks in one item are
  numbered in order of appearance (0, 1, 2...).
- An empty `py` with no Han characters is valid (e.g. a line that is only `{_}。`).

## Section

```json
{ "key": "4a-01-t1", "kind": "text", "label_zh": "课文 1", "label_en": "Text 1", "page": 2, "blocks": [Block, ...] }
```

`kind`: `objectives` · `warmup` · `text` · `grammar` · `exercises` · `task` · `bonus` · `summary` · `appendix`. (`bonus` = 小语的彩蛋 Xiaoyu's Bonus Content. `appendix` is only used in the appendix file.)
Sections become the chips at the top of the lesson. `key` is stable.

## Block

```json
{ "key": "4a-01-t1-b03", "type": "choice", "page": 2, "source": "book", "data": { ... } }
```

- `key` is stable across re-imports. User answers and notes reference block keys and item keys.
- `source` is `book` for book content. moink additions live **inside** `data` and are marked
  with `"source": "moink"` (an `extra` object) or with sibling fields ending in `_source: "moink"`
  (`answer_source`, `sample_source`, `en_source`). The "moink extras" switch hides all of them,
  except `en` translations, which follow the English switch.
- Items inside `items`, `rows`, `lines` and `images` each have a stable `key` (e.g. `4a-01-t1-b03-i2`).
  Free-text answers for a whole block use `data.answer_key`.

## Block types

| type | data | user input |
|---|---|---|
| `objectives` | `items: [{text, en}]` | checkbox per item |
| `instruction` | `num` (null = green square marker, "1"/"2" = boxed number), `text`, `en`, `audio` ("1-1", label only) | none |
| `scene` | `icon` (`pin` = location, `reading` = reading-passage icon), `text`, `en`, optional `audio` | none |
| `choice` | `items: [{key, num, text, options: [{label, text}], answer, answer_source}]` | pick one option per item |
| `dialogue` | `image?: {src, alt}`, `lines: [{key, speaker: string[] \| null, text, en?, en_source?}]` | none (notes allowed per line) |
| `passage` | `image?`, `paragraphs: [{text, en, en_source, indent?, align?}]`. `indent: false` = no first-line indent (e.g. a diary date line, a letter greeting, a numbered heading); default is indented. `align: "right"` = right-aligned line with no indent (e.g. a letter's signature and date) | none |
| `vocab` | `audio`, `items: [{key, num, hanzi, pinyin, pos, en, extra: {source, text, en}}]` Optional `proper: true` = a 专有名词 Proper Nouns table (no `audio`, `pos` is empty, numbering is separate from normal vocab and continues across the lesson's proper-noun tables). | "add to Training" per word |
| `prompts` | `answer_mode` (`text` / `none`), `items: [{key, num, text, sample?: [Text], sample_source?}]` | textarea per item |
| `retell` | `text` (prompt passage with ……), `answer_key` | textarea |
| `grammar` | `num`, `title`, `title_en`, `explain`, `explain_en`, `examples: [{text, en, en_source}]`, `extra: {source, examples: [{text, en}], related: [grammar slugs]}` | none |
| `dialogue_fill` | `items: [{key, num, lines: [{speaker: "A"/"B", text}], sample?: [Text], sample_source}]` | one input per `{_}` |
| `sentence_fill` | same shape as `dialogue_fill` (speaker null), plus optional `hint` (Text, shown in brackets after the sentence) | one input per `{_}` |
| `word_bank` | `bank: [{label, text}]`, `items: [{key, num, lines: [{speaker, text}], answer, answer_source}]` (one `{_}` per item) | pick a bank label per item |
| `passage_fill` | `options: [{label, text}]`, `text` (with several `{_}`; a `\n` in `zh` starts a new indented paragraph), `answers: ["C","B",...]`, `answer_source`, `answer_key` | pick a label per blank |
| `image_match` | `images: [{key, src, alt, answer}]`, `options: [{label, text}]`, `answer_source`. Optional `groups: [{key, label_zh, label_en, labels}]`: then each image's `answer` is an object like `{"name": "C", "flavor": "F"}`, one label per group | pick a label per image |
| `picture_write` | `items: [{key, num, image, word: Text, sample?, sample_source}]` | textarea per item |
| `task` | `title`, `title_en`, `text`, `en`, `answer_mode` (`text` / `notes` / `table`), `min_chars?`, `answer_key`, optional `tips: {label?, label_en?, items: [{label, label_en, text}]}` (when `label` is missing, show the items without a heading) shown under the task text (e.g. 提示 Tips: 正方 Pro side / 反方 Con side); optional `table: {columns: [{text, en}], rows, numbered?, row_labels?: [{text, en}], merged_rows?: [row index]}` for a table the user fills in (answer_mode `table`, answer saved as a 2D array of strings). `row_labels` puts a label cell at the start of each row (instead of a number). A row listed in `merged_rows` is one wide cell spanning all columns, saved as a one-item array | textarea (show live character count vs `min_chars`) |
| `tip` | `text`, `en`. A 小语助力 Xiaoyu's Tip box: a small callout with the label "小语助力 Xiaoyu's Tip" | none |
| `video` | `label` ("4-1", the book's video number), `title`, `title_en`, `image` (a still from the book). The video itself is not available: show the still with a play-icon overlay that does nothing, plus the title and a small "Video not included" note | none |
| `pos_table` | `items: [{key, text, en, abbr}]` (词性对照表: part of speech, English name, abbreviation). Show as a 3-column table (词性 Part of Speech · 英文 English · 英文简写 Abbreviation); on wide screens it can split into two side-by-side halves like the book | none |
| `word_index` | `groups: [{letter, items: [{key, hanzi, pinyin, lessons: [int], beyond?}]}]`, optional `proper: true` (专有名词 index), optional `note: {text, en}` (footnote under the table). Columns 词语 Word/Phrase · 拼音 Pinyin · 课号 Lesson, with a letter row before each group. Plain hanzi + pinyin (no ruby). Each lesson number links to `/book/<book>/<n>`. `beyond: true` shows `*` before the hanzi like the book | none |
| `self_check` | `intro`, `intro_en`, `scale: [{zh, en}]`, `rows: [{key, text, en}]` | one choice of the scale per row |

## Appendix file

`book-<book>-appendix.json` has the same top level as a lesson, but `lesson` is
`{ "kind": "appendix", "slug": "appendix", "number": null, "title", "title_en", "page_start", "page_end" }`.
It is the book's back matter (4上: pp. 120–127): the parts-of-speech table, the full vocabulary
index and the proper-nouns index. It lists after the last lesson and opens at `/book/<book>/appendix`.
Every section has `kind: "appendix"`.

## Checking answers

- `choice`, `word_bank`, `passage_fill`, `image_match`: compare to `answer`/`answers`
  and show correct / try again. Tag the result "Answer key by moink".
- Fill-ins, prompts, writing: free text, no auto check. If `sample` exists, offer
  "Show a sample answer" after the user has typed something. Tag it "moink".
