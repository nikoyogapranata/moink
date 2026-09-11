import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/ui/Button";

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-bark/10 bg-background">
      <nav className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 whitespace-nowrap"
        >
          <Image
            src="/images/logo/bao.png"
            alt="moink logo"
            width={36}
            height={36}
            className="h-8 w-8 rounded-lg sm:h-9 sm:w-9"
          />
          <span className="font-heading text-h1 font-bold text-bark">moink</span>
        </Link>

        <div className="flex shrink-0 items-center gap-3 sm:gap-4">
          <Link
            href="/login"
            className="hidden whitespace-nowrap font-heading text-body-sm font-medium text-bark-muted transition-colors hover:text-bark sm:block sm:text-body"
          >
            Sign in
          </Link>
          <Button asChild size="sm">
            <Link href="/login">Start learning</Link>
          </Button>
        </div>
      </nav>
    </header>
  );
}
