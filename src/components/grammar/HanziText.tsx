// Text mixing English and Chinese: each run of Chinese (with the full-width
// punctuation around it) in the CJK font, marked lang="zh-CN". No hooks,
// so server and client components can both use it.

const RUNS = /([\p{Script=Han}　-〿＀-￯]+)/u;
const HAS_HAN = /\p{Script=Han}/u;

export function hanziRuns(text: string) {
  return text.split(RUNS).map((part, i) =>
    HAS_HAN.test(part) ? (
      <span key={i} lang="zh-CN" className="font-hanzi">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

export function HanziText({ children, className = "" }: { children: string; className?: string }) {
  return <span className={className}>{hanziRuns(children)}</span>;
}
