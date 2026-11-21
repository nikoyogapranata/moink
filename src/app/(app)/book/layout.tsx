import { Inter } from "next/font/google";

import "./book.css";

/** The pinyin (ruby rt) font, and nothing else: book.css uses it as
 *  --font-pinyin. latin-ext has the tone marks (ā ǎ ǚ …). */
const fontPinyin = Inter({
  variable: "--font-pinyin",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

/** The HSK Book pages: the reader's styles and pinyin font. `contents`, so
 *  the wrapper adds no box and the pages lay out as before. */
export default function BookLayout({ children }: LayoutProps<"/book">) {
  return <div className={`${fontPinyin.variable} contents`}>{children}</div>;
}
