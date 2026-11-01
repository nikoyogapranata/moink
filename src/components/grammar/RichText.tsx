import { hanziRuns } from "./HanziText";

/** A lesson body: paragraphs split on blank lines, single line breaks
 *  kept, and lines starting with "•" as a bullet list. Text stops at 72ch
 *  so long lines stay readable in a wide card. */
export function RichText({ text }: { text: string }) {
  const blocks = text.split(/\n\s*\n/).filter((b) => b.trim());
  return (
    <div className="flex flex-col gap-3 font-body text-[16px] leading-[1.7] text-bark">
      {blocks.map((block, i) => {
        const lines = block.split("\n").filter((l) => l.trim());
        const bullets = lines.filter((l) => l.trimStart().startsWith("•"));
        if (bullets.length === lines.length) {
          return (
            <ul key={i} className="flex max-w-[72ch] list-disc flex-col gap-1 pl-5 marker:text-bark-muted">
              {lines.map((l, j) => (
                <li key={j}>{hanziRuns(l.trimStart().replace(/^•\s*/, ""))}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="max-w-[72ch]">
            {lines.map((l, j) => (
              <span key={j}>
                {j > 0 && <br />}
                {l.trimStart().startsWith("•") ? <>• {hanziRuns(l.trimStart().replace(/^•\s*/, ""))}</> : hanziRuns(l)}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
