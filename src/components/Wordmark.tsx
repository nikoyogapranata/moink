import Image from "next/image";
import Link from "next/link";

/** Bao-head logo plus the lowercase "moink" wordmark, as a link. */
export function Wordmark({ href = "/" }: { href?: string }) {
  return (
    <Link
      href={href}
      className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust"
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
  );
}
