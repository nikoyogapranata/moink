/** A point's study status. Always "not started" for now; it'll read
 *  user_grammar once practice exists. */
export function StatusDot() {
  return (
    <span title="Not started" className="inline-flex shrink-0">
      <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full border-[1.5px] border-bark-muted" />
      <span className="sr-only">Not started</span>
    </span>
  );
}
