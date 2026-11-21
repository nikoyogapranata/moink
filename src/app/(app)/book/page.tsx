import { Check } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CARD } from "@/components/app/card";
import { PageHeader } from "@/components/app/PageHeader";
import { RetryButton } from "@/components/app/RetryButton";
import { PrivateCard } from "@/components/book/PrivateCard";
import { ZhText } from "@/components/book/ZhText";
import { loadShelf, type ShelfBook } from "@/lib/book/load";
import { getAppUser } from "@/lib/supabase/app-user";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "HSK Book - moink",
};

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust";

function BookCard({ book, open }: { book: ShelfBook; open: boolean }) {
  const done = book.lessons.filter((l) => l.done).length;
  const total = book.lessons.length;
  return (
    <Link
      href={`/book?book=${book.slug}`}
      aria-current={open ? "true" : undefined}
      className={`${CARD} flex items-center gap-4 !p-3 transition-colors hover:bg-highlight/40 sm:!p-4 ${FOCUS_RING} ${
        open ? "!border-rust/50" : ""
      }`}
    >
      {/* The cover: a color block with the book's level. */}
      <span
        aria-hidden="true"
        className="flex h-24 w-[72px] shrink-0 flex-col justify-between rounded-[10px] bg-rust p-2 text-on-rust shadow-float"
      >
        <span className="font-body text-[10px] font-medium uppercase leading-3 tracking-wide opacity-90">HSK</span>
        <span className="font-heading text-[28px] font-bold leading-8">{book.slug.toUpperCase()}</span>
        <span className="h-1 w-8 rounded-full bg-bamboo-gold" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span lang="zh-CN" className="font-hanzi text-[19px] font-bold leading-7 text-bark">
          {book.title_zh}
        </span>
        <span className="font-body text-body text-bark-muted">{book.title_en}</span>
        <span className="mt-1 font-body text-body-sm text-bark-muted">
          {total} {total === 1 ? "lesson" : "lessons"} · {done} done
        </span>
        <span
          role="progressbar"
          aria-label="Lessons done"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
          className="mt-1.5 h-1.5 w-full max-w-60 overflow-hidden rounded-full bg-skeleton"
        >
          <span className="block h-full rounded-full bg-bamboo-green" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
        </span>
      </span>
    </Link>
  );
}

function LessonList({ book }: { book: ShelfBook }) {
  if (!book.lessons.length) {
    return <p className="font-body text-body text-bark-muted">No lessons in this book yet.</p>;
  }
  return (
    <ol className={`${CARD} flex flex-col divide-y-[1.5px] divide-line !px-2 !py-1 sm:!px-3`}>
      {book.lessons.map((l) => (
        <li key={l.id}>
          <Link
            href={`/book/${book.slug}/${l.number}`}
            className={`flex items-center gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-highlight/40 sm:px-3 ${FOCUS_RING}`}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-highlight font-heading text-body font-bold text-rust-dark">
              {l.number}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <ZhText text={l.title} className="text-[18px] leading-[2.1] text-bark" />
              <span className="font-body text-body-sm text-bark-muted">
                {l.title_en} · pp. {l.page_start}–{l.page_end}
              </span>
            </span>
            {l.done ? (
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-good-tint text-good-ink" title="Done">
                <Check size={16} aria-hidden="true" />
                <span className="sr-only">Done</span>
              </span>
            ) : (
              <span aria-hidden="true" className="h-7 w-7 shrink-0 rounded-full border-[1.5px] border-line" />
            )}
          </Link>
        </li>
      ))}
    </ol>
  );
}

/** The shelf: the books, and the open book's lessons. */
export default async function BookShelfPage({ searchParams }: PageProps<"/book">) {
  const user = await getAppUser();
  if (!user?.hasBookAccess) return <PrivateCard />;

  const { book: wanted } = await searchParams;
  const supabase = await createClient();
  let books: ShelfBook[];
  try {
    books = await loadShelf(supabase, user.id);
  } catch (error) {
    console.error("BookShelfPage: couldn't load the shelf.", error);
    return (
      <div className="flex flex-col items-start gap-3">
        <p role="alert" className="font-body text-body text-bark">
          Couldn&apos;t load the HSK Book.
        </p>
        <RetryButton />
      </div>
    );
  }

  const open = books.find((b) => b.slug === wanted) ?? books[0];

  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-6">
      <PageHeader title="HSK Book">The textbook, lesson by lesson, in the book&apos;s own order.</PageHeader>
      {books.length === 0 ? (
        <p className="font-body text-body text-bark-muted">No books yet.</p>
      ) : (
        <>
          <ul className="grid gap-3 sm:grid-cols-2">
            {books.map((b) => (
              <li key={b.id}>
                <BookCard book={b} open={b.id === open.id} />
              </li>
            ))}
          </ul>
          <section aria-labelledby="lessons-title" className="flex flex-col gap-3">
            <h2 id="lessons-title" className="font-heading text-h2 font-bold text-bark">
              <span lang="zh-CN" className="font-hanzi">
                {open.title_zh}
              </span>
            </h2>
            <LessonList book={open} />
          </section>
        </>
      )}
    </div>
  );
}
