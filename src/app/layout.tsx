import type { Metadata } from "next";
import { Baloo_2, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

import { NavProgress } from "@/components/app/NavProgress";
import { ThemeController } from "@/components/app/Theme";
import { THEME_SCRIPT } from "@/lib/theme";

const fontHeading = Baloo_2({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: ["500", "700"],
  display: "swap",
});

const fontBody = Plus_Jakarta_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "moink - Learn Chinese the fun way",
  description:
    "Learn old HSK vocabulary with Bao, your daily study buddy. Flashcards, quizzes, streaks, and friendly competition.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  // data-theme is set before the first paint by the inline script (and kept
  // by ThemeController), so React's server value for <html> can't match:
  // suppressHydrationWarning accepts the DOM's.
  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-scroll-behavior="smooth"
      className={`${fontHeading.variable} ${fontBody.variable} h-full antialiased motion-safe:scroll-smooth`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeController />
        <NavProgress />
        {children}
      </body>
    </html>
  );
}
