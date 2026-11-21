import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache, type ReactNode } from "react";

import { RetryButton } from "@/components/app/RetryButton";
import { BlockView, type BlockContext } from "@/components/book/Blocks";
import { BookScore } from "@/components/book/Inputs";
import { BlockNotes } from "@/components/book/Notes";
import { PrivateCard } from "@/components/book/PrivateCard";
import { Reader } from "@/components/book/Reader";
import { ZhText } from "@/components/book/ZhText";
import { loadReaderLesson } from "@/lib/book/load";
import type { BlockType } from "@/lib/book/types";
import { getAppUser } from "@/lib/supabase/app-user";
import { createClient } from "@/lib/supabase/server";

/** The lesson, null when there's none (or no access), or "error" when the
 *  load failed (logged here). */
const getLesson = cache(async (book: string, lesson: string) => {
  const user = await getAppUser();
  if (!user?.hasBookAccess) return "private" as const;
  const number = Number(lesson);
  if (!Number.isInteger(number) || number < 1) return null;
  const supabase = await createClient();
  try {
    return await loadReaderLesson(supabase, user.id, book, number);
  } catch (error) {
    console.error(`BookLessonPage: couldn't load ${book}/${lesson}.`, error);
    return "error" as const;
  }
});

export async function generateMetadata({ params }: PageProps<"/book/[book]/[lesson]">): Promise<Metadata> {
  const { book, lesson } = await params;
  const data = await getLesson(book, lesson);
  if (!data || typeof data === "string") return { title: "HSK Book - moink" };
  return { title: `${data.number}. ${data.title.zh} - moink` };
}

/** What a block is, for its notes button and the Lesson notes panel. */
const BLOCK_NAMES: Record<BlockType, string> = {
  objectives: "Objectives",
  instruction: "Instruction",
  scene: "Scene",
  choice: "Choice exercise",
  dialogue: "Dialogue",
  passage: "Passage",
  vocab: "New words",
  prompts: "Questions",
  retell: "Retelling",
  grammar: "Grammar point",
  dialogue_fill: "Complete the dialogues",
  sentence_fill: "Complete the sentences",
  word_bank: "Word bank",
  passage_fill: "Passage blanks",
  image_match: "Picture match",
  picture_write: "Picture writing",
  task: "Task",
  self_check: "Self-check",
};

/** "p. 3": the printed page, so the lesson can be followed in class. */
function PageTag({ page, className = "" }: { page: number; className?: string }) {
  return (
    <span className={`font-body text-[12px] leading-4 text-bark-muted/80 ${className}`}>
      <span className="sr-only">Book page </span>
      <span aria-hidden="true">p. </span>
      {page}
    </span>
  );
}

export default async function BookLessonPage({ params }: PageProps<"/book/[book]/[lesson]">) {
  const { book, lesson: number } = await params;
  const lesson = await getLesson(book, number);
  if (lesson === "private") return <PrivateCard />;
  if (lesson === "error") {
    return (
      <div className="flex flex-col items-start gap-3">
        <p role="alert" className="font-body text-body text-bark">
          Couldn&apos;t load this lesson.
        </p>
        <RetryButton />
      </div>
    );
  }
  if (!lesson) notFound();

  const ctx: BlockContext = { images: lesson.images, vocabWords: lesson.vocabWords, grammarLinks: lesson.grammarLinks };

  const header = (
    <header className="flex flex-col gap-1">
      <Link
        href={`/book?book=${lesson.book.slug}`}
        className="mb-3 inline-flex min-h-11 items-center gap-1.5 self-start rounded-pill border-[1.5px] border-line bg-surface-raised py-2 pl-[11px] pr-4 font-body text-[15px] font-medium leading-6 text-bark transition-colors hover:bg-highlight/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust"
      >
        <ArrowLeft size={18} aria-hidden="true" className="text-rust-dark" />
        <span lang="zh-CN" className="font-hanzi">
          {lesson.book.title_zh}
        </span>
      </Link>
      <p className="flex items-center gap-2 font-body text-body-sm text-bark-muted">
        <span className="rounded-pill bg-highlight px-2.5 py-0.5 font-medium text-rust-dark">Lesson {lesson.number}</span>
        <span>
          pp. {lesson.page_start}–{lesson.page_end}
        </span>
        <span className="ml-auto">
          <BookScore />
        </span>
      </p>
      <h1>
        <ZhText text={lesson.title} className="text-[28px] font-bold leading-[2.4] text-bark lg:text-[32px]" />
      </h1>
      <p className="font-body text-h3 text-bark-muted">{lesson.title_en}</p>
    </header>
  );

  // A block shows its page in the margin when it's on a new page: the
  // section header shows the section's own.
  const blockLabel = (sectionLabel: string, type: BlockType, page: number) =>
    `${sectionLabel} · ${BLOCK_NAMES[type]} · p. ${page}`;
  const blocks = lesson.sections.flatMap((section) =>
    section.blocks.map((b) => ({ key: b.key, label: blockLabel(section.label_zh, b.type, b.page) })),
  );

  const sections: ReactNode[] = lesson.sections.map((section) => {
    let shown = section.page;
    return (
      <section key={section.key} id={section.key} aria-labelledby={`${section.key}-title`} className="scroll-mt-20 pt-12">
        <div className="mb-6 flex items-end gap-3 border-b-[1.5px] border-line pb-2">
          <h2 id={`${section.key}-title`} className="flex min-w-0 flex-wrap items-baseline gap-x-3">
            <span lang="zh-CN" className="book-section-zh font-hanzi font-bold text-bark">
              {section.label_zh}
            </span>
            <span className="font-body text-body-sm text-bark-muted">{section.label_en}</span>
          </h2>
          <PageTag page={section.page} className="ml-auto shrink-0 rounded-pill border-[1.5px] border-line px-2 py-0.5" />
        </div>
        <div className="flex flex-col gap-6">
          {section.blocks.map((block) => {
            const newPage = block.page !== shown;
            shown = block.page;
            return (
              <div key={block.key} id={block.key} data-block-key={block.key} className="relative scroll-mt-24">
                {newPage && (
                  // In the left margin where there's room (xl); a thin page
                  // break line above the block otherwise.
                  <div className="mb-3 flex items-center gap-2 xl:absolute xl:right-full xl:top-2 xl:mb-0 xl:mr-5">
                    <span aria-hidden="true" className="h-px flex-1 bg-line xl:hidden" />
                    <PageTag page={block.page} className="whitespace-nowrap" />
                  </div>
                )}
                <BlockNotes blockKey={block.key} label={blockLabel(section.label_zh, block.type, block.page)}>
                  <BlockView block={block} ctx={ctx} />
                </BlockNotes>
              </div>
            );
          })}
        </div>
      </section>
    );
  });

  return (
    <Reader
      lessonId={lesson.id}
      sections={lesson.sections.map(({ key, label_zh, label_en }) => ({ key, label_zh, label_en }))}
      blocks={blocks}
      answers={lesson.answers}
      notes={lesson.notes}
      autoItems={lesson.autoItems}
      prefs={lesson.prefs}
      done={lesson.done}
      lastBlockKey={lesson.lastBlockKey}
      header={header}
      next={lesson.next !== null ? `/book/${lesson.book.slug}/${lesson.next}` : null}
    >
      {sections}
    </Reader>
  );
}
