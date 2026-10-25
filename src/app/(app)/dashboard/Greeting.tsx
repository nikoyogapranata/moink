"use client";

import { useSyncExternalStore } from "react";

import { useAppUser } from "@/components/app/AppShell";

const GREETINGS = {
  morning: { hanzi: "早上好", pinyin: "zǎoshang hǎo" },
  afternoon: { hanzi: "下午好", pinyin: "xiàwǔ hǎo" },
  evening: { hanzi: "晚上好", pinyin: "wǎnshang hǎo" },
} as const;

type TimeOfDay = keyof typeof GREETINGS;

// The hour only matters on the client (the server doesn't know the user's
// time zone). The server snapshot is null, so the server render and the
// hydration pass agree, then React re-renders with the local time.
const noSubscribe = () => () => {};
function localTimeOfDay(): TimeOfDay {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

export function Greeting() {
  const user = useAppUser();
  const timeOfDay = useSyncExternalStore(noSubscribe, localTimeOfDay, () => null);
  const name =
    user.fullName?.trim().split(/\s+/)[0]?.toLowerCase() || user.username;

  const greeting = timeOfDay ? GREETINGS[timeOfDay] : null;

  return (
    // Fixed line height either way, so swapping in the greeting doesn't
    // move anything.
    <h1 className="font-heading text-h1 font-bold text-bark lg:text-[1.875rem] lg:leading-[2.375rem]">
      {greeting ? (
        <>
          <span lang="zh-CN" title={greeting.pinyin}>
            {greeting.hanzi}
          </span>
          , {name}
        </>
      ) : (
        <span aria-hidden="true">&nbsp;</span>
      )}
    </h1>
  );
}
