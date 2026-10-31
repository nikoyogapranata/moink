import { RetryButton } from "@/components/app/RetryButton";
import { CARD } from "@/components/app/card";

/** A Dashboard card whose data couldn't be loaded: its title, what failed,
 *  and Try again (refreshes the page's loads). The rest of the Dashboard
 *  still works. */
export function CardError({ id, title, what }: { id: string; title: string; what: string }) {
  return (
    <section aria-labelledby={id} className={`${CARD} flex flex-col items-start gap-3`}>
      <h2 id={id} className="font-heading text-h2 font-bold text-bark">
        {title}
      </h2>
      <p role="alert" className="font-body text-body text-bark">
        Couldn&apos;t load {what}.
      </p>
      <RetryButton />
    </section>
  );
}
