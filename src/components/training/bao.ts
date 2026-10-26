// Bao's poses in Training. A pose with no art of its own yet is null and
// falls back to WAVING; swap in the real image when it exists.

export type BaoPose = "ready" | "happy" | "sad" | "neutral" | "cheering";

export interface BaoImage {
  src: string;
  width: number;
  height: number;
}

const WAVING: BaoImage = { src: "/images/mascot/bao/wave-1-tight.webp", width: 1278, height: 1363 };

const POSES: Record<BaoPose, BaoImage | null> = {
  ready: { src: "/images/mascot/bao/feature-1-confident.webp", width: 837, height: 900 },
  happy: { src: "/images/mascot/bao/feature-3-celebrate.webp", width: 776, height: 900 },
  sad: null,
  neutral: null,
  cheering: { src: "/images/mascot/bao/feature-3-celebrate.webp", width: 776, height: 900 },
};

export function baoImage(pose: BaoPose): BaoImage {
  return POSES[pose] ?? WAVING;
}
