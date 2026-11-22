/**
 * One-off: generate src/app/favicon.ico (16/32/48) from the app icon.
 *   pnpm tsx scripts/make-favicon.ts [--face16]
 *
 * Source: public/images/logo/bao.png (orange rounded square, same as the
 * navbar logo and src/app/icon.png). --face16 swaps the 16px entry for a
 * tighter crop on Bao's face, re-rounded, which reads better at that size.
 * Previews go to scripts/output/favicon/ (gitignored).
 *
 * sharp isn't a direct dependency; borrow Next's copy.
 */
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const req = createRequire(require.resolve("next/package.json"));
// No types without a direct dependency; this script isn't worth one.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sharp: any = req("sharp");

const SRC = "public/images/logo/bao.png";
// Face crop inside the 512px source: head from ears down, centred on the muzzle.
const FACE = { left: 56, top: 64, width: 400, height: 400 };
const OUT_PREVIEW = "scripts/output/favicon";

function roundedMask(size: number, radiusRatio: number): Buffer {
  const r = size * radiusRatio;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${r}" ry="${r}"/></svg>`,
  );
}

function full(size: number): Promise<Buffer> {
  return sharp(SRC).resize(size, size, { kernel: "lanczos3" }).png().toBuffer();
}

async function face(size: number): Promise<Buffer> {
  const crop = await sharp(SRC).extract(FACE).png().toBuffer();
  const rounded = await sharp(crop)
    .composite([{ input: roundedMask(FACE.width, 0.2), blend: "dest-in" }])
    .png()
    .toBuffer();
  return sharp(rounded).resize(size, size, { kernel: "lanczos3" }).png().toBuffer();
}

/** ICO container with PNG-encoded entries (supported by all current browsers). */
function buildIco(images: { size: number; png: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const dir = Buffer.alloc(16 * images.length);
  let offset = 6 + dir.length;
  images.forEach(({ size, png }, i) => {
    const o = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, o);
    dir.writeUInt8(size >= 256 ? 0 : size, o + 1);
    dir.writeUInt16LE(1, o + 4);
    dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(png.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += png.length;
  });
  return Buffer.concat([header, dir, ...images.map((i) => i.png)]);
}

/** Actual size + pixel zoom to 128px on a light and a dark tab-coloured strip. */
async function previewSheet(items: { label: string; png: Buffer; size: number }[]) {
  const cell = 160;
  const strip = async (bg: string) => {
    const layers = [];
    for (const [i, it] of items.entries()) {
      const zoom = await sharp(it.png).resize(128, 128, { kernel: "nearest" }).png().toBuffer();
      const x = i * cell + 10;
      layers.push({ input: zoom, left: x + Math.round((cell - 20 - 128) / 2), top: 10 });
      layers.push({ input: it.png, left: x + Math.round((cell - 20 - it.size) / 2), top: 150 });
    }
    return sharp({ create: { width: items.length * cell, height: 180, channels: 4, background: bg } })
      .composite(layers)
      .png()
      .toBuffer();
  };
  const w = items.length * cell;
  await sharp({ create: { width: w, height: 360, channels: 4, background: "#fff" } })
    .composite([
      { input: await strip("#F1F3F4"), left: 0, top: 0 },
      { input: await strip("#202124"), left: 0, top: 180 },
    ])
    .png()
    .toFile(path.join(OUT_PREVIEW, "compare.png"));
  console.log("preview:", items.map((i) => i.label).join(" | "));
}

async function main() {
  mkdirSync(OUT_PREVIEW, { recursive: true });
  const useFace16 = process.argv.includes("--face16");

  const full16 = await full(16);
  const face16 = await face(16);
  const p32 = await full(32);

  writeFileSync(
    "src/app/favicon.ico",
    buildIco([
      { size: 16, png: useFace16 ? face16 : full16 },
      { size: 32, png: p32 },
      { size: 48, png: await full(48) },
    ]),
  );

  await previewSheet([
    { label: "16 full", png: full16, size: 16 },
    { label: "16 face crop", png: face16, size: 16 },
    { label: "32 full", png: p32, size: 32 },
  ]);
  console.log(`favicon.ico written (16px = ${useFace16 ? "face crop" : "full icon"})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
