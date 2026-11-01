import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { RetryButton } from "@/components/app/RetryButton";
import { LessonView } from "@/components/grammar/LessonView";
import { loadLesson } from "@/lib/grammar/load";
import { createClient } from "@/lib/supabase/server";

/** The lesson, null when there's none with this slug, or "error" when the
 *  load failed (logged here). */
const getLesson = cache(async (slug: string) => {
  const supabase = await createClient();
  try {
    return await loadLesson(supabase, slug);
  } catch (error) {
    console.error(`LessonPage: couldn't load lesson "${slug}".`, error);
    return "error" as const;
  }
});

export async function generateMetadata({ params }: PageProps<"/grammar/[slug]">): Promise<Metadata> {
  const lesson = await getLesson((await params).slug);
  if (lesson === "error" || !lesson) return { title: "Grammar - moink" };
  return { title: `${lesson.name_en} - moink` };
}

export default async function LessonPage({ params }: PageProps<"/grammar/[slug]">) {
  const { slug } = await params;
  const lesson = await getLesson(slug);
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
  return <LessonView lesson={lesson} />;
}
