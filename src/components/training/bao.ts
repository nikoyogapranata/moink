// Bao's poses in Training and on the Dashboard. A pose with no art of its
// own yet is null and falls back to WAVING; swap in the real image when it
// exists.
//
// The Dashboard's moods: eager (cards waiting), happy (today completed;
// the celebrate art), sleepy (the streak broke yesterday, or nothing done
// for 2 or more days).

export type BaoPose = "ready" | "happy" | "sad" | "neutral" | "cheering" | "eager" | "sleepy";

export interface BaoImage {
  src: string;
  width: number;
  height: number;
}

const WAVING: BaoImage = { src: "/images/mascot/bao/wave-1-tight.webp", width: 1278, height: 1363 };
const CELEBRATE: BaoImage = { src: "/images/mascot/bao/feature-3-celebrate.webp", width: 776, height: 900 };

const POSES: Record<BaoPose, BaoImage | null> = {
  ready: { src: "/images/mascot/bao/feature-1-confident.webp", width: 837, height: 900 },
  happy: CELEBRATE,
  sad: null,
  neutral: null,
  cheering: CELEBRATE,
  eager: null,
  sleepy: null,
};

export function baoImage(pose: BaoPose): BaoImage {
  return POSES[pose] ?? WAVING;
}
