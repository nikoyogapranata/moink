# HSK Book: Claude Code prompts

Run these one at a time, in order. Wait for each report before sending the next one.
Before prompt 1, unzip the package into the repo root so these exist:

- `docs/book-format.md`
- `scripts/output/book/book-4a-lesson-01.json`
- `scripts/output/book/assets/4a/01/*.webp` (13 images)

---

## Prompt 1: database, storage and import script

```
We're adding a new section to moink called "HSK Book": the 新HSK教程 4上 textbook, lesson by lesson, in the exact order of the printed book. Read docs/book-format.md first. It defines the lesson JSON. The first lesson is scripts/output/book/book-4a-lesson-01.json with images in scripts/output/book/assets/4a/01/.

1. Migration (new file in supabase/migrations, I'll run it in the SQL editor):

   Content tables:
   - books (id uuid pk, slug text unique, title_zh, title_en, level int, standard text, sort int, created_at)
   - book_lessons (id uuid pk, book_id fk, number int, title jsonb, title_en text, page_start int, page_end int, updated_at; unique(book_id, number))
   - book_sections (id uuid pk, lesson_id fk on delete cascade, key text unique, sort int, kind text, label_zh, label_en, page int)
   - book_blocks (id uuid pk, section_id fk on delete cascade, lesson_id fk, key text unique, sort int, page int, type text, source text default 'book', data jsonb)
   Index book_blocks(lesson_id, sort) and book_sections(lesson_id, sort).

   Access allowlist:
   - book_access (user_id uuid pk references auth.users, granted_at timestamptz default now())
   - a security definer function has_book_access() returning boolean for auth.uid()
   - RLS on all four content tables: select only when has_book_access(). No insert/update/delete policies (only the service role writes).
   - RLS on book_access: a user can select only their own row.

   User data (RLS: each user can only select/insert/update/delete their own rows, and only when has_book_access()):
   - user_book_answers (user_id, item_key text, answer jsonb, is_correct boolean null, updated_at; pk(user_id, item_key))
   - user_book_notes (id uuid pk, user_id, lesson_id fk, block_key text null, body text, created_at, updated_at). block_key null = a note for the whole lesson.
   - user_book_progress (user_id, lesson_id, last_block_key text, completed_at timestamptz null, updated_at; pk(user_id, lesson_id))
   Answers and notes reference keys, not block ids, on purpose: block ids change on re-import, keys don't.

   Settings: add to the existing user settings table: show_pinyin boolean default true, show_english boolean default false, show_extras boolean default true.

   Storage: a private bucket "book-assets". Read policy: authenticated users with has_book_access(). No public access.

   At the end of the migration file, add a commented-out line to grant myself access:
   -- insert into book_access (user_id) select id from auth.users where email = '<my email>';

2. scripts/import-book.ts (same style as the grammar import script; uses the service role key from .env.local, never from anything shipped to the client):
   - Usage: pnpm tsx scripts/import-book.ts scripts/output/book/book-4a-lesson-01.json [--write]
   - Dry run by default. Validate before writing anything:
     - every Text object: count of Han characters in zh (ignoring {_}) equals the number of space-separated syllables in py
     - keys unique, pages never go down in array order, choice/word_bank/image_match answers exist among the labels, passage_fill blanks count equals answers count
     - every image src exists under scripts/output/book/assets/
   - Print a short summary: sections, blocks per type, vocab count, images, problems. If there are problems, stop.
   - With --write: upsert the book row, upsert the lesson, then replace that lesson's sections and blocks (delete and insert inside one transaction or one RPC so a failed import never leaves a half lesson). sort = array index. Upload the lesson's images to book-assets at the same path as src (upsert). User answers/notes are untouched.
   - Add it to package.json scripts as "import:book".

3. Do not touch any other feature.

Report back briefly: files created, the dry-run summary for lesson 1, anything you had to decide. No data dumps.
```

---

## Prompt 2: shelf and lesson reader

```
Build the HSK Book pages. Read docs/book-format.md again for the block shapes. Match the existing moink look (same header, cards, radius, shadows, Baloo 2 for headings, Plus Jakarta Sans for body). Colors: page bg #FDFBF6, primary rust #E06B2E, bamboo green #6FA23A, deep grass #4A7A2C, bamboo gold #F2A93C, bark #3D2A1F text, bark-muted #8A6A4F secondary text, blush #FBE3C2 soft fills, danger #D94F4F. Dark mode: #18181A page, #232325 cards, same accents. Use the existing theme tokens if these already exist as tokens.

Access:
- Add "HSK Book" to the nav only for users with a book_access row. Users without access who open /book see a small friendly "This section is private" card, not an error.
- All data reads go through the user's normal Supabase session so RLS does the work. Images use signed URLs from book-assets (1 hour), created server-side in the same request as the lesson.

Routes:
- /book: shelf. One card per book (cover color block, 新HSK教程 4上, New HSK Course 4A, lesson count, progress). Below it, the lesson list for the open book: number, Chinese title with pinyin, English title, pages "pp. 1–11", and a done check from user_book_progress.
- /book/[book]/[lesson] e.g. /book/4a/1: the reader.
- loading.tsx skeletons for both, same style as the other sections.

Reader layout:
- Top: lesson number, title (ruby pinyin), English title, page range.
- Sticky chip bar under the header with one chip per section in order (目标, 热身, 课文 1, 小语讲堂 1, ...). Clicking scrolls to it; the chip for the section in view is highlighted (IntersectionObserver).
- Toggles in the same sticky bar, right side: 拼音 (pinyin), EN (English), moink (extras). Persist to show_pinyin / show_english / show_extras in settings, optimistic update. They apply to the whole page instantly with no re-render of data: implement with a data attribute on the reader root and CSS (e.g. [data-pinyin="off"] rt { visibility: hidden } so lines don't jump; English and extras hidden with display none).
- Content column max-width about 760px, centered. Sections separated by clear space (about 48px) and a section header: label_zh big in Baloo 2, label_en small muted, and a small "p. 3" page tag on the right. Every block also shows a faint page tag in the margin only when its page differs from the previous block's, so I can match the printed book in class.
- Render blocks in array order. Never sort.

Text rendering:
- One <ZhText text={...} /> component used everywhere. It walks zh and pairs each Han character with the next syllable from py as <ruby>字<rt>pīn</rt></ruby>. Non-Han characters render as-is. {_} renders whatever the parent passes as the blank slot (input, select, or an underline in read-only places). Pinyin should be small (about 0.55em), muted, and the line height large enough that ruby never collides between lines.
- A small speaker button on dialogue lines, passage paragraphs, vocab words, vocab example phrases and grammar examples that reads the zh with the browser's speechSynthesis (zh-CN voice, rate 0.9). Hide the button if no zh-CN voice exists.

Block components (read-only parts now, the inputs come in prompt 3, but leave space for them):
- objectives: list with a soft blush background card.
- instruction: green square marker (num null) or a boxed number, instruction text, English below in muted when EN is on, audio label like "🎧 1-1" as a small muted chip (no audio file exists, it's only the book's track number).
- scene: pin or open-book icon, scene text, English when EN on.
- dialogue: optional image at the top (rounded, max-height 220px, object-fit cover). Each line: speaker name column (fixed width, bark-muted, bold) and text column. speaker null = stage note, centered italic muted. Two speakers = "白家月、陈天中". English line under each line when EN on.
- passage: optional image floated right on desktop, above on mobile. Paragraphs with first-line indent of 2em like the book, English paragraph under each when EN on.
- vocab: table-like list. Columns: number (①②③ style circled numbers), hanzi (big), pinyin, part of speech, English. Under each word when moink extras on: the example phrase (ZhText) and its English, prefixed with a small "moink" tag. Each row has an "Add to Training" icon button that adds the word to the user's existing vocab/review system if the word exists in our HSK word table (match on hanzi), otherwise disabled with a tooltip.
- grammar: card with a gold left border. Title "小语讲堂 1" small, then the point title big, explanation, numbered examples ①②③. English for explanation and examples when EN on. When extras on: "More examples" (moink tag) and links to related points in our Grammar section by slug (skip slugs that don't exist).
- retell: the prompt text in a soft card.
- self_check: a table with the scale as column headers (zh with en below).

Spacing rules for every block: 24px between blocks inside a section, 16px inner padding in cards on mobile and 20px on desktop, nothing touching the edges on a 375px phone. Check the page at 375px, 768px and 1280px and fix any overflow.

Progress: save last_block_key while scrolling (debounced), and a "Mark lesson as done" button at the end.

Report back briefly: routes and components created, how you implemented the toggles, any block type you couldn't render cleanly. Include 3 screenshots if you can (desktop top, desktop a dialogue with pinyin on, mobile vocab).
```

---

## Prompt 3: exercises, answers and notes

```
Now make the HSK Book exercises interactive and add notes. Read docs/book-format.md, section "Checking answers" and the "user input" column.

Answers:
- Every answerable item saves to user_book_answers keyed by its item key (or data.answer_key for whole-block answers), debounced 600ms for text, immediately for choices. Load all answers for the lesson in the same server request as the lesson.
- choice: options as pill buttons (A B C D with ZhText). On pick, show correct (deep grass) or wrong (danger, shake once), and save is_correct. A "Reset" link per block.
- word_bank: the bank shown as chips at the top. Each blank is a small select/popover with the bank labels; after choosing, the blank shows the chosen word with its pinyin. Correct/wrong per item.
- passage_fill: the passage with numbered blanks; each blank picks from the options A to D. A "Check" button checks all blanks at once.
- image_match: grid of images (3 per row desktop, 2 mobile), a label picker under each image, options listed above the grid.
- dialogue_fill and sentence_fill: inputs inline where {_} is, auto-growing width, Chinese IME friendly (don't save on compositionupdate, only on compositionend / blur / debounce). hint renders after the sentence in brackets with ZhText.
- prompts, retell, picture_write, task: textarea (auto height). task with min_chars shows a live Han character count "86 / 120". picture_write shows the image left and the word + textarea right (stacked on mobile).
- self_check: one radio per row across the scale.
- objectives: a checkbox per item.
- Sample answers: if an item has sample, show "Show sample" only after the user typed something (or clicked "I'm stuck"). The sample shows with a small "moink" tag. Samples and answer keys are moink extras: when extras are off, hide the "Show sample" button and turn auto-check off (choices just get selected, no right/wrong).
- Lesson header shows a small score: auto-checked items correct / total.

Notes:
- A notes button on every block (appears on hover on desktop, always visible small icon on mobile). It opens an inline note editor under that block, saved to user_book_notes with block_key. Blocks with a note show a small gold dot.
- A "Lesson notes" panel: right drawer on desktop, bottom sheet on mobile, opened from the sticky bar. It shows the lesson-wide note on top (block_key null) and then every block note in book order with a jump link to its block.
- Plain text with line breaks is enough. Autosave with a tiny "Saved" indicator.

Keep everything keyboard accessible (tab through blanks, Enter checks). Don't change the read-only rendering from prompt 2 except to plug the inputs in.

Report back briefly: what's interactive, where answers and notes are saved, anything that didn't fit the format. No data dumps.
```

---

## After the three prompts

1. Run the migration in the Supabase SQL editor, then uncomment and run the `book_access` line with your email.
2. `pnpm import:book scripts/output/book/book-4a-lesson-01.json` (dry run), then add `--write`.
3. Open /book/4a/1 next to the printed book and go through pages 1 to 11.
