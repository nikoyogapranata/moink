import type { ReactNode } from "react";

/** Title plus one line of muted text, for app pages. */
export function PageHeader({
  title,
  children = "Coming soon",
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <header>
      <h1 className="font-heading text-h1 font-bold text-bark lg:text-[1.875rem] lg:leading-[2.375rem]">
        {title}
      </h1>
      <p className="mt-1 font-body text-body text-bark-muted">{children}</p>
    </header>
  );
}
