import { BookOpenText, Headphones, MapPin, MessageCircle, Play } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import type { GrammarLink, VocabWord } from "@/lib/book/load";
import type { Block, BlockData, FillLine, Image, Option } from "@/lib/book/types";

import { AddToTraining } from "./AddToTraining";
import {
  AnswerBox,
  BankBlank,
  ChoicePills,
  FillBlank,
  GroupMatchPicker,
  ItemFeedback,
  MatchPicker,
  ObjectiveCheck,
  PassageBlank,
  PassageCheck,
  ResetAnswers,
  SampleReveal,
  SelfCheckRadio,
  TableAnswer,
} from "./Inputs";
import { SpeakButton } from "./SpeakButton";
import { paragraphs, speakable, ZhText } from "./ZhText";

// One component per block type (docs/book-format.md), read-only for now:
// the inputs (answers, checks, notes) slot in later. Server components;
// the speaker and Add to Training buttons are the only client parts.
//
// Classes the reader's switches act on (book.css): book-en for English,
// book-extra for moink additions.

export interface BlockContext {
  /** For links to the book's lessons (the word index). */
  bookSlug: string;
  /** The book's HSK level, for "beyond the syllabus" marks. */
  bookLevel: number;
  images: Record<string, string>;
  vocabWords: Record<string, VocabWord>;
  grammarLinks: Record<string, GrammarLink>;
}

/** Cards: 16px inside on phones, 20px from sm. */
export const BOOK_CARD = "rounded-[22px] border-[1.5px] border-line bg-surface-raised p-4 sm:p-5";
/** Chinese: instructions, scenes, exercises, prompts (book.css sizes). */
const ZH = "book-zh text-bark";
/** Chinese: dialogue, passages, grammar examples, retell. */
const ZH_LG = "book-zh-lg text-bark";
const EN = "book-en font-body";

/** ① to ㊿ (three Unicode runs), then the number in brackets. */
export function circled(num: string | number) {
  const n = Number(num);
  if (n >= 1 && n <= 20) return String.fromCodePoint(0x245f + n);
  if (n >= 21 && n <= 35) return String.fromCodePoint(0x3251 + n - 21);
  if (n >= 36 && n <= 50) return String.fromCodePoint(0x32b1 + n - 36);
  return `(${num})`;
}

function En({ children, className = "" }: { children?: string; className?: string }) {
  if (!children) return null;
  return <p className={`${EN} ${className}`}>{children}</p>;
}

export function MoinkTag() {
  return (
    <span className="inline-flex shrink-0 items-center rounded-pill bg-good-tint px-2 font-body text-[12px] font-medium leading-[18px] text-good-ink">
      moink
    </span>
  );
}

function AudioChip({ track }: { track?: string | null }) {
  if (!track) return null;
  return (
    <span
      title="Track number of the book's audio"
      className="inline-flex shrink-0 items-center gap-1 rounded-pill border-[1.5px] border-line px-2 font-body text-[12px] leading-5 text-bark-muted"
    >
      <Headphones size={13} aria-hidden="true" />
      {track}
    </span>
  );
}

/** The book's * for a word beyond this level's syllabus. */
function Beyond({ level, className = "" }: { level: number; className?: string }) {
  return (
    <span title={`Beyond the HSK ${level} syllabus`} className={`cursor-help font-body text-bamboo-gold-dark ${className}`}>
      <span aria-hidden="true">*</span>
      <span className="sr-only"> (beyond the HSK {level} syllabus)</span>
    </span>
  );
}

/** The item number at the start of an exercise line. */
function Num({ children }: { children: string }) {
  return (
    <span aria-hidden="true" className="book-line w-6 font-body text-[15px] font-medium text-bark-muted">
      {children}.
    </span>
  );
}

function BookImage({ image, ctx, className }: { image: Image; ctx: BlockContext; className: string }) {
  const url = ctx.images[image.src];
  if (!url) {
    return (
      <div className={`flex items-center justify-center bg-skeleton p-3 text-center font-body text-body-sm text-bark-muted ${className}`}>
        {image.alt}
      </div>
    );
  }
  // A plain img: the signed URL changes on every load, so next/image's
  // cache would only add a round trip.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={image.alt} loading="lazy" className={`book-img ${className}`} />;
}

/** "A 护照" chips for an exercise's choices. */
function OptionList({ options, className = "" }: { options: Option[]; className?: string }) {
  return (
    <ul className={`flex flex-wrap gap-x-5 gap-y-1 ${className}`}>
      {options.map((o) => (
        <li key={o.label} className="flex items-baseline gap-2">
          <span className="font-body text-[15px] font-medium text-rust-dark">{o.label}</span>
          <ZhText text={o.text} className={ZH} />
        </li>
      ))}
    </ul>
  );
}

const blankCount = (zh: string) => zh.split("{_}").length - 1;

/** An item's lines. `blank(n)` fills the item's nth blank (numbered across
 *  all its lines, in order). */
function FillLines({ lines, after, blank }: { lines: FillLine[]; after?: ReactNode; blank?: (n: number) => ReactNode }) {
  // Where each line's blanks start in the item's numbering.
  const starts = lines.map((_, i) => lines.slice(0, i).reduce((n, l) => n + blankCount(l.text.zh), 0));
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {lines.map((line, i) => {
        const start = starts[i];
        return (
          <p key={i} className={ZH}>
            {line.speaker && <span className="font-body font-medium text-bark-muted">{line.speaker}：</span>}
            <ZhText text={line.text} blank={blank ? (b) => blank(start + b) : undefined} />
            {i === lines.length - 1 ? after : null}
          </p>
        );
      })}
    </div>
  );
}

/* Blocks */

function Objectives({ data }: { data: BlockData["objectives"] }) {
  return (
    <div className="rounded-[22px] bg-highlight/60 p-4 sm:p-5">
      <ul className="flex flex-col gap-2">
        {data.items.map((item) => (
          <li key={item.key} className="flex gap-3">
            <span className="book-line">
              <ObjectiveCheck itemKey={item.key} label={`Done: ${item.text.zh}`} />
            </span>
            <div className="min-w-0">
              <ZhText text={item.text} className={ZH} />
              <En>{item.en}</En>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Instruction({ data }: { data: BlockData["instruction"] }) {
  return (
    <div className="flex gap-3">
      {data.num === null ? (
        <span aria-hidden="true" className="book-line">
          <span className="h-3 w-3 rounded-[3px] bg-bamboo-green" />
        </span>
      ) : (
        <span className="book-line">
          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-[6px] border-[1.5px] border-bamboo-green px-1 font-body text-[13px] font-medium text-deep-grass">
            {data.num}
          </span>
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2">
          <ZhText text={data.text} className={`${ZH} font-medium`} />
          <AudioChip track={data.audio} />
        </p>
        <En>{data.en}</En>
      </div>
    </div>
  );
}

function Scene({ data }: { data: BlockData["scene"] }) {
  const Icon = data.icon === "pin" ? MapPin : BookOpenText;
  return (
    <div className="flex gap-3">
      <span aria-hidden="true" className="book-line">
        <Icon size={20} className="text-rust-dark" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2">
          <ZhText text={data.text} className={ZH} />
          <AudioChip track={data.audio} />
        </p>
        <En>{data.en}</En>
      </div>
    </div>
  );
}

/** The dialogue, passage and video pictures: natural height, at most 420px
 *  wide, centred. The fallback (no image) keeps some height. */
const FIGURE = "mx-auto block h-auto min-h-24 w-full max-w-105 rounded-lg";

/** A dialogue line's card. */
const LINE_CARD = "min-w-0 rounded-[16px] border-[1.5px] border-line bg-surface-raised px-3 py-2 sm:px-4";

function Dialogue({ data, ctx }: { data: BlockData["dialogue"]; ctx: BlockContext }) {
  return (
    <div className={BOOK_CARD}>
      {data.image && <BookImage image={data.image} ctx={ctx} className={`${FIGURE} mb-4`} />}
      <ol className="flex flex-col gap-2">
        {data.lines.map((line) =>
          line.speaker === null ? (
            // Narration: the full width, no name column.
            <li key={line.key} className={`${LINE_CARD} text-center`}>
              <ZhText text={line.text} className={`${ZH_LG} italic !text-bark-muted`} />
              <En className="italic">{line.en}</En>
            </li>
          ) : (
            // Phones: the name above its card. sm and up: a 72px column
            // beside it, pushed down by the card's top border and padding
            // and one text line tall, so it sits on the text's first line.
            <li key={line.key} className="flex flex-col gap-0.5 sm:grid sm:grid-cols-[72px_minmax(0,1fr)] sm:gap-x-3">
              {/* Two speakers break between names, never inside one. */}
              <span
                lang="zh-CN"
                className="px-1 font-hanzi text-[15px] font-bold leading-6 text-deep-grass sm:relative sm:top-(--py-shift-lg) sm:px-0 sm:leading-[calc(var(--zh-lg)*var(--lh))] sm:pt-[calc(0.5rem+1.5px)] sm:text-[16px]"
              >
                {line.speaker.map((name, i) => (
                  <span key={i} className="whitespace-nowrap">
                    {name}
                    {i < line.speaker!.length - 1 ? "、" : ""}
                  </span>
                ))}
              </span>
              <div className={LINE_CARD}>
                <div className="flex items-start gap-1">
                  <ZhText text={line.text} className={`${ZH_LG} min-w-0 flex-1`} />
                  <span className="book-line-lg">
                    <SpeakButton text={speakable(line.text)} />
                  </span>
                </div>
                <En>{line.en}</En>
              </div>
            </li>
          ),
        )}
      </ol>
    </div>
  );
}

function Passage({ data, ctx }: { data: BlockData["passage"]; ctx: BlockContext }) {
  return (
    <div className={BOOK_CARD}>
      {data.image && (
        <BookImage image={data.image} ctx={ctx} className={`${FIGURE} mb-4`} />
      )}
      <div className="flex flex-col gap-3">
        {data.paragraphs.map((p, i) => {
          const right = p.align === "right";
          return (
            <div key={i} className={right ? "text-right" : ""}>
              <p className={`${ZH_LG} ${right || p.indent === false ? "" : "indent-[2em]"}`}>
                <ZhText text={p.text} /> <SpeakButton text={speakable(p.text)} />
              </p>
              <En className="mt-1">{p.en}</En>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 生词 New words, or with `proper` the 专有名词 Proper Nouns table: no
 *  audio track, no part of speech. Numbers as given: proper nouns are
 *  numbered on their own, continuing across the lesson's tables. */
function Vocab({ data, ctx }: { data: BlockData["vocab"]; ctx: BlockContext }) {
  const proper = data.proper === true;
  return (
    <div className={BOOK_CARD}>
      <div className="mb-1 flex items-center gap-2">
        <h3 lang="zh-CN" className="font-hanzi text-[17px] font-bold text-bark">
          {proper ? "专有名词" : "生词"}
        </h3>
        <span className="font-body text-body-sm text-bark-muted">{proper ? "Proper Nouns" : "New words"}</span>
        {!proper && (
          <span className="ml-auto">
            <AudioChip track={data.audio} />
          </span>
        )}
      </div>
      <ol className="flex flex-col divide-y-[1.5px] divide-line">
        {data.items.map((item) => {
          const word = ctx.vocabWords[item.hanzi];
          return (
            <li key={item.key} data-vocab-row className="flex gap-2 py-3 sm:gap-3">
              <span aria-hidden="true" className="w-5 shrink-0 font-body text-[17px] leading-9 text-bark-muted">
                {circled(item.num)}
              </span>
              <div className="min-w-0 flex-1">
                {/* Phones: hanzi, pinyin and part of speech on one line, the
                    English under them. sm and up: all on one line. */}
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <span lang="zh-CN" className="book-vocab-hz font-hanzi text-bark">
                    {item.hanzi}
                    {item.beyond && <Beyond level={ctx.bookLevel} className="ml-0.5 align-super text-[14px]" />}
                  </span>
                  <span className="book-vpy font-body font-medium text-rust-dark">{item.pinyin}</span>
                  {!proper && <span className="book-pos font-body italic text-bark-muted">{item.pos}</span>}
                  <span className="book-vocab-en basis-full font-body text-bark sm:basis-auto">{item.en}</span>
                </div>
                {item.extra && (
                  <div className="book-extra mt-1 flex flex-wrap items-center gap-x-2">
                    <MoinkTag />
                    <ZhText text={item.extra.text} className={ZH} />
                    <SpeakButton text={speakable(item.extra.text)} />
                    {item.extra.en && <span className="book-en font-body">{item.extra.en}</span>}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-start gap-0.5 pt-0.5 sm:pt-1">
                <SpeakButton text={item.hanzi} />
                <AddToTraining hanzi={item.hanzi} wordId={word?.id ?? null} inTraining={word?.inTraining ?? false} />
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Prompts({ data }: { data: BlockData["prompts"] }) {
  return (
    <ol className="flex flex-col gap-2">
      {data.items.map((item) => (
        <li key={item.key} className="flex gap-1">
          <Num>{item.num}</Num>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <ZhText text={item.text} className={ZH} />
            {data.answer_mode === "text" && <AnswerBox answerKey={item.key} label={`Answer to question ${item.num}`} />}
            {item.sample?.length ? <SampleReveal answerKey={item.key} sample={item.sample} /> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

function Retell({ data }: { data: BlockData["retell"] }) {
  return (
    <div className="flex flex-col gap-3 rounded-[22px] bg-highlight/60 p-4 sm:p-5">
      <ZhText text={data.text} className={ZH_LG} />
      <AnswerBox answerKey={data.answer_key} label="Your retelling" placeholder="Retell it in your own words" />
    </div>
  );
}

function Grammar({ data, ctx }: { data: BlockData["grammar"]; ctx: BlockContext }) {
  const related = (data.extra?.related ?? []).flatMap((slug) => (ctx.grammarLinks[slug] ? [ctx.grammarLinks[slug]] : []));
  const more = data.extra?.examples ?? [];
  const examples = (list: typeof data.examples) => (
    <ol className="flex flex-col gap-1">
      {list.map((e, i) => (
        <li key={i} className="flex gap-2">
          <span aria-hidden="true" className="book-line-lg w-5 font-body text-[17px] text-bark-muted">
            {circled(i + 1)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-1">
              <ZhText text={e.text} className={`${ZH_LG} min-w-0 flex-1`} />
              <span className="book-line-lg">
                <SpeakButton text={speakable(e.text)} />
              </span>
            </div>
            <En>{e.en}</En>
          </div>
        </li>
      ))}
    </ol>
  );

  return (
    <div className={`${BOOK_CARD} border-l-4 border-l-bamboo-gold`}>
      <p lang="zh-CN" className="font-hanzi text-body-sm font-medium text-bamboo-gold-dark">
        小语讲堂 {data.num}
      </p>
      <h3 className="mt-1">
        <ZhText text={data.title} className="book-title-zh font-bold text-bark" />
      </h3>
      <En className="-mt-1 mb-2 font-medium">{data.title_en}</En>
      <ZhText text={data.explain} className={ZH} />
      <En className="mb-2">{data.explain_en}</En>
      {examples(data.examples)}

      {(more.length > 0 || related.length > 0) && (
        <div className="book-extra mt-4 flex flex-col gap-2 border-t-[1.5px] border-line pt-4">
          {more.length > 0 && (
            <>
              <p className="flex items-center gap-2 font-body text-body-sm font-medium text-bark">
                More examples <MoinkTag />
              </p>
              {examples(more)}
            </>
          )}
          {related.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="font-body text-body-sm text-bark-muted">In Grammar:</span>
              {related.map((r) => (
                <Link
                  key={r.slug}
                  href={`/grammar/${r.slug}`}
                  className="inline-flex min-h-9 items-center rounded-pill border-[1.5px] border-line px-3 font-body text-body-sm text-bark transition-colors hover:bg-highlight/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust"
                >
                  {r.name_en}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Choice({ data }: { data: BlockData["choice"] }) {
  return (
    <ol className="flex flex-col gap-3">
      {data.items.map((item) => (
        <li key={item.key} className="flex gap-1">
          <Num>{item.num}</Num>
          <div className="min-w-0 flex-1">
            <ZhText text={item.text} className={ZH} />
            <ChoicePills itemKey={item.key} options={item.options} answer={item.answer} />
          </div>
        </li>
      ))}
      <li className="list-none">
        <ResetAnswers keys={data.items.map((it) => it.key)} />
      </li>
    </ol>
  );
}

function Fill({ data }: { data: BlockData["dialogue_fill"] | BlockData["sentence_fill"] }) {
  return (
    <ol className="flex flex-col gap-3">
      {data.items.map((item) => {
        const hint = "hint" in item && item.hint ? item.hint : null;
        const blanks = item.lines.reduce((n, l) => n + blankCount(l.text.zh), 0);
        return (
          <li key={item.key} className="flex gap-1">
            <Num>{item.num}</Num>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <FillLines
                lines={item.lines}
                blank={(n) => (
                  <FillBlank itemKey={item.key} index={n} count={blanks} label={`Item ${item.num}, blank ${n + 1}`} />
                )}
                after={
                  hint ? (
                    <span className="text-bark-muted">
                      （<ZhText text={hint} />）
                    </span>
                  ) : null
                }
              />
              {item.sample?.length ? <SampleReveal answerKey={item.key} sample={item.sample} /> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function WordBank({ data }: { data: BlockData["word_bank"] }) {
  return (
    <div className="flex flex-col gap-3">
      <OptionList options={data.bank} className="rounded-lg border-[1.5px] border-dashed border-line px-4 py-2" />
      <ol className="flex flex-col gap-2">
        {data.items.map((item) => (
          <li key={item.key} className="flex gap-1">
            <Num>{item.num}</Num>
            <div className="min-w-0 flex-1">
              <FillLines
                lines={item.lines}
                blank={() => <BankBlank itemKey={item.key} num={item.num} options={data.bank} answer={item.answer} />}
              />
              <ItemFeedback itemKey={item.key} answer={item.answer} />
            </div>
          </li>
        ))}
      </ol>
      <ResetAnswers keys={data.items.map((it) => it.key)} />
    </div>
  );
}

function PassageFill({ data }: { data: BlockData["passage_fill"] }) {
  return (
    <div className="flex flex-col gap-3">
      <OptionList options={data.options} className="flex-col !gap-y-0" />
      {/* A "\n" in zh starts a new paragraph, indented like a passage's;
          blank numbers run on across paragraphs. */}
      <div className={`${BOOK_CARD} flex flex-col gap-3`}>
        {paragraphs(data.text).map((p, n) => (
          <p key={n} className={`${ZH} indent-[2em]`}>
            <ZhText
              text={p.text}
              blank={(i) => (
                <PassageBlank
                  answerKey={data.answer_key}
                  index={p.blankOffset + i}
                  count={data.answers.length}
                  options={data.options}
                  answers={data.answers}
                />
              )}
            />
          </p>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PassageCheck answerKey={data.answer_key} answers={data.answers} />
        <ResetAnswers keys={[data.answer_key]} />
      </div>
    </div>
  );
}

function ImageMatch({ data, ctx }: { data: BlockData["image_match"]; ctx: BlockContext }) {
  return (
    <div className="flex flex-col gap-4">
      <OptionList options={data.options} />
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {data.images.map((im, i) => (
          <li key={im.key} className="flex flex-col items-center gap-1.5">
            <BookImage image={im} ctx={ctx} className="aspect-[7/6] w-full rounded-lg border-[1.5px] border-line object-cover" />
            {data.groups?.length && typeof im.answer === "object" ? (
              <>
                <span className="font-body text-[15px] text-bark-muted">{i + 1}.</span>
                {data.groups.map((g) => (
                  <GroupMatchPicker
                    key={g.key}
                    itemKey={im.key}
                    num={i + 1}
                    options={data.options}
                    group={g}
                    groups={data.groups!}
                    answer={im.answer as Record<string, string>}
                  />
                ))}
              </>
            ) : (
              <MatchPicker itemKey={im.key} num={i + 1} options={data.options} answer={im.answer as string} />
            )}
          </li>
        ))}
      </ul>
      <ResetAnswers keys={data.images.map((im) => im.key)} />
    </div>
  );
}

function PictureWrite({ data, ctx }: { data: BlockData["picture_write"]; ctx: BlockContext }) {
  return (
    <ul className="flex flex-col gap-5">
      {data.items.map((item) => (
        <li key={item.key} className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <BookImage
            image={item.image}
            ctx={ctx}
            className="aspect-[16/9] w-full shrink-0 rounded-lg border-[1.5px] border-line object-cover sm:w-[38%]"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <p className="flex items-baseline gap-1">
              <span className="font-body text-[15px] font-medium text-bark-muted">{item.num}.</span>
              <ZhText text={item.word} className={ZH} />
            </p>
            <AnswerBox answerKey={item.key} label={`Sentence for picture ${item.num} with ${item.word.zh}`} placeholder="Write a sentence" />
            {item.sample?.length ? <SampleReveal answerKey={item.key} sample={item.sample} /> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

function Task({ data }: { data: BlockData["task"] }) {
  return (
    <div className={BOOK_CARD}>
      <h3>
        <ZhText text={data.title} className="book-title-zh font-bold text-bark" />
      </h3>
      <En className="-mt-1 mb-2 font-medium">{data.title_en}</En>
      <ZhText text={data.text} className={ZH} />
      <En className="mt-1">{data.en}</En>
      {data.tips && data.tips.items.length > 0 && (
        <div className="mt-3">
          {data.tips.label && (
            <p className="flex items-baseline gap-2">
              <ZhText text={data.tips.label} className={`${ZH} font-bold`} />
              <span className="font-body text-body-sm font-medium text-bark-muted">{data.tips.label_en}</span>
            </p>
          )}
          <ul className="flex flex-col">
            {data.tips.items.map((t, i) => (
              <li key={i} className={ZH}>
                <ZhText text={t.label} className="font-bold" />{" "}
                <span className="font-body text-body-sm text-bark-muted">({t.label_en})</span>
                <span aria-hidden="true">：</span>
                <ZhText text={t.text} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {data.min_chars ? (
        <p className="book-body mt-2 font-body">At least {data.min_chars} characters</p>
      ) : null}
      <div className="mt-3">
        {data.answer_mode === "table" && data.table ? (
          <TableAnswer answerKey={data.answer_key} table={data.table} />
        ) : (
          <AnswerBox
            answerKey={data.answer_key}
            label={data.answer_mode === "notes" ? "Your notes for this task" : "Your answer"}
            placeholder={data.answer_mode === "notes" ? "Notes for the activity" : "Write your answer"}
            minChars={data.min_chars}
          />
        )}
      </div>
    </div>
  );
}

/** 小语助力 Xiaoyu's Tip: a small callout, like the grammar card's gold
 *  edge but lighter, its top-left corner tucked in like a speech bubble. */
function Tip({ data }: { data: BlockData["tip"] }) {
  return (
    <aside
      aria-label="Xiaoyu's Tip"
      className="rounded-[18px] rounded-tl-[4px] border-[1.5px] border-l-[3px] border-line border-l-bamboo-gold bg-surface-raised px-4 py-3"
    >
      <p className="flex items-center gap-1.5 font-body text-[12px] font-medium leading-4 text-bamboo-gold-dark">
        <MessageCircle size={13} aria-hidden="true" />
        <span lang="zh-CN" className="font-hanzi">
          小语助力
        </span>
        <span>Xiaoyu&apos;s Tip</span>
      </p>
      <ZhText text={data.text} className={`${ZH} mt-1 block`} />
      <En>{data.en}</En>
    </aside>
  );
}

/** The book's video: moink doesn't have it, so its still with a play icon
 *  that does nothing, and a note saying so. The still is sized like the
 *  dialogue and passage pictures, centred above its title. */
function Video({ data, ctx }: { data: BlockData["video"]; ctx: BlockContext }) {
  return (
    <div className={`${BOOK_CARD} flex flex-col gap-3`}>
      <div className="relative mx-auto w-full max-w-105">
        <BookImage image={data.image} ctx={ctx} className={`${FIGURE} border-[1.5px] border-line`} />
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-scrim text-white">
            <Play size={26} fill="currentColor" className="ml-1" />
          </span>
        </span>
      </div>
      <div className="flex min-w-0 flex-col items-start gap-1">
        <span className="inline-flex items-center rounded-pill border-[1.5px] border-line px-2 font-body text-[12px] font-medium leading-5 text-bark-muted">
          <span aria-hidden="true">▶&nbsp;</span>
          <span className="sr-only">Video </span>
          {data.label}
        </span>
        <h3>
          <ZhText text={data.title} className={`${ZH} font-bold`} />
        </h3>
        <En className="-mt-1">{data.title_en}</En>
        <p className="font-body text-[13px] text-bark-muted">Video not included</p>
      </div>
    </div>
  );
}

function SelfCheck({ data }: { data: BlockData["self_check"] }) {
  // A table from sm; on phones each statement takes the full width with
  // its three choices in a row underneath, labelled.
  const cols = "sm:grid-cols-[minmax(0,1fr)_repeat(3,6.5rem)]";
  return (
    <div className="flex flex-col gap-3">
      <div>
        <ZhText text={data.intro} className={ZH} />
        <En>{data.intro_en}</En>
      </div>
      <div role="table" aria-label="Self-check" className="rounded-[22px] border-[1.5px] border-line bg-surface-raised">
        <div role="row" className={`hidden border-b-[1.5px] border-line sm:grid ${cols}`}>
          <span role="columnheader">
            <span className="sr-only">Statement</span>
          </span>
          {data.scale.map((s) => (
            <span key={s.zh} role="columnheader" className="px-1 py-3 text-center">
              <span lang="zh-CN" className="block font-hanzi text-[15px] font-bold text-bark">
                {s.zh}
              </span>
              <span className="block font-body text-[12px] leading-4 text-bark-muted">{s.en}</span>
            </span>
          ))}
        </div>
        <div role="rowgroup" className="divide-y-[1.5px] divide-line">
          {data.rows.map((row) => (
            <div key={row.key} role="row" className={`grid grid-cols-3 gap-y-2 p-4 sm:items-center sm:p-0 ${cols}`}>
              <div role="cell" className="col-span-3 sm:col-span-1 sm:p-3 sm:pl-5">
                <ZhText text={row.text} className={ZH} />
                <En>{row.en}</En>
              </div>
              {data.scale.map((s) => (
                <label key={s.zh} role="cell" className="flex min-h-11 cursor-pointer flex-col items-center justify-center gap-1">
                  <SelfCheckRadio rowKey={row.key} value={s.zh} label={`${s.zh} (${s.en})`} />
                  <span lang="zh-CN" aria-hidden="true" className="font-hanzi text-[13px] text-bark-muted sm:hidden">
                    {s.zh}
                  </span>
                </label>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** 词性对照表: part of speech, English name, abbreviation. From lg it
 *  splits into two side-by-side halves, like the book. */
function PosTable({ data }: { data: BlockData["pos_table"] }) {
  const half = Math.ceil(data.items.length / 2);
  const halves = [data.items.slice(0, half), data.items.slice(half)];
  const table = (items: typeof data.items, i: number) => (
    <table key={i} className={`w-full border-collapse ${i === 1 ? "lg:border-l-[1.5px] lg:border-line" : ""}`}>
      <thead className={i === 1 ? "hidden lg:table-header-group" : ""}>
        <tr className="border-b-[1.5px] border-line">
          {[
            ["词性", "Part of Speech"],
            ["英文", "English"],
            ["英文简写", "Abbreviation"],
          ].map(([zh, en]) => (
            <th key={en} scope="col" className="px-3 py-2 text-left align-bottom font-normal">
              <span lang="zh-CN" className="block font-hanzi text-[15px] font-bold text-bark">
                {zh}
              </span>
              <span className="block font-body text-[12px] leading-4 text-bark-muted">{en}</span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y-[1.5px] divide-line">
        {items.map((it) => (
          <tr key={it.key}>
            <td className="px-3 py-1">
              <ZhText text={it.text} className={ZH} />
            </td>
            <td className="px-3 py-1 font-body text-[15px] text-bark">{it.en}</td>
            <td className="px-3 py-1 font-body text-[15px] italic text-bark-muted">{it.abbr}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
  return (
    <div className={`${BOOK_CARD} !p-2 sm:!p-3`}>
      {/* Phones and tablets: one table (the second half's header hidden, its
          rows continuing the first's). */}
      <div className="grid lg:grid-cols-2">{halves.map(table)}</div>
    </div>
  );
}

/** 词语表 / 专有名词: the appendix's word index, by initial letter. Plain
 *  hanzi and pinyin (no ruby); each lesson number links to that lesson. */
function WordIndex({ data, ctx }: { data: BlockData["word_index"]; ctx: BlockContext }) {
  return (
    <div className="flex flex-col gap-2">
      <div className={`${BOOK_CARD} !p-2 sm:!p-3`}>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b-[1.5px] border-line">
              {[
                ["词语", "Word/Phrase"],
                ["拼音", "Pinyin"],
                ["课号", "Lesson"],
              ].map(([zh, en], i) => (
                <th key={en} scope="col" className={`px-3 py-2 align-bottom font-normal ${i === 2 ? "text-right" : "text-left"}`}>
                  <span lang="zh-CN" className="block font-hanzi text-[15px] font-bold text-bark">
                    {zh}
                  </span>
                  <span className="block font-body text-[12px] leading-4 text-bark-muted">{en}</span>
                </th>
              ))}
            </tr>
          </thead>
          {data.groups.map((g) => (
            <tbody key={g.letter}>
              <tr>
                <th colSpan={3} scope="rowgroup" className="bg-highlight/50 px-3 py-1 text-left font-heading text-[15px] font-bold text-rust-dark">
                  {g.letter}
                </th>
              </tr>
              {g.items.map((it) => (
                <tr key={it.key} className="border-t-[1.5px] border-line first:border-t-0">
                  <td lang="zh-CN" className="whitespace-nowrap px-3 py-1.5 font-hanzi text-[17px] text-bark">
                    {it.beyond && <Beyond level={ctx.bookLevel} className="mr-0.5" />}
                    {it.hanzi}
                  </td>
                  <td className="px-3 py-1.5 font-body text-[15px] text-bark-muted">{it.pinyin}</td>
                  <td className="px-3 py-1.5 text-right">
                    <span className="inline-flex flex-wrap justify-end gap-1">
                      {it.lessons.map((n) => (
                        <Link
                          key={n}
                          href={`/book/${ctx.bookSlug}/${n}`}
                          aria-label={`Lesson ${n}`}
                          className="inline-flex h-7 min-w-7 items-center justify-center rounded-pill px-1.5 font-body text-[14px] font-medium text-rust-dark transition-colors hover:bg-highlight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust"
                        >
                          {n}
                        </Link>
                      ))}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
      {data.note && (
        <div className="px-1">
          <ZhText text={data.note.text} className={`${ZH} text-[15px]!`} />
          <En>{data.note.en}</En>
        </div>
      )}
    </div>
  );
}

/** One block, by type. */
export function BlockView({ block, ctx }: { block: Block; ctx: BlockContext }) {
  switch (block.type) {
    case "objectives":
      return <Objectives data={block.data} />;
    case "instruction":
      return <Instruction data={block.data} />;
    case "scene":
      return <Scene data={block.data} />;
    case "dialogue":
      return <Dialogue data={block.data} ctx={ctx} />;
    case "passage":
      return <Passage data={block.data} ctx={ctx} />;
    case "vocab":
      return <Vocab data={block.data} ctx={ctx} />;
    case "prompts":
      return <Prompts data={block.data} />;
    case "retell":
      return <Retell data={block.data} />;
    case "grammar":
      return <Grammar data={block.data} ctx={ctx} />;
    case "choice":
      return <Choice data={block.data} />;
    case "dialogue_fill":
    case "sentence_fill":
      return <Fill data={block.data} />;
    case "word_bank":
      return <WordBank data={block.data} />;
    case "passage_fill":
      return <PassageFill data={block.data} />;
    case "image_match":
      return <ImageMatch data={block.data} ctx={ctx} />;
    case "picture_write":
      return <PictureWrite data={block.data} ctx={ctx} />;
    case "task":
      return <Task data={block.data} />;
    case "tip":
      return <Tip data={block.data} />;
    case "video":
      return <Video data={block.data} ctx={ctx} />;
    case "self_check":
      return <SelfCheck data={block.data} />;
    case "pos_table":
      return <PosTable data={block.data} />;
    case "word_index":
      return <WordIndex data={block.data} ctx={ctx} />;
    default:
      return null;
  }
}

