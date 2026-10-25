// Turns a word's raw CC-CEDICT-style meanings into a short learner gloss.
// Each array element is one sense (it may hold "; "-separated synonyms,
// e.g. "in order; in sequence", which stay together).

// Senses dropped outright.
const SURNAME = /^surname\b/i;
// Cross-references, as the dataset phrases them: "variant of", "old /
// erhua / euphemistic / unofficial variant of", "(variant of ...)" on its
// own, and "used in". A real meaning followed by a note, like "dark
// (variant of 暗)", is kept.
const VARIANT =
  /^\(?(?:(?:old|archaic|erhua|euphemistic|unofficial)\s+)?variant of\b|^used in\b/i;
// Archaic or literary-only: a leading or trailing register tag. Doesn't
// catch "old" in ordinary text like "to cast off (old ideas etc)".
const ARCHAIC =
  /^\((?:archaic|literary|old|classical|Classical Chinese)\)|\((?:archaic|literary|old)\)\s*$|^archaic\b/i;
// Pronunciation notes: "Taiwan pr. [chéng shóu]", "also pr. [pù lù]".
const PRONUNCIATION_NOTE = /^(?:Taiwan|also) pr\./i;
// The same notes inside another sense: "how (Taiwan pr. [duó])".
const INLINE_PRONUNCIATION = /\s*\((?:Taiwan|also) pr\.[^)]*\)/gi;
// Pinyin in square brackets: "也[ye3]", "[pù lù]".
const BRACKETED = /\s*\[[^\]]*\]/g;
// Classifier note: "CL:個|个[ge4],本[ben3]".
const CLASSIFIER_NOTE = /,?\s*CL:\s*([^;]*)/i;

/** True for senses a learner never needs: surnames, variant / "used in"
 *  cross-references, archaic or literary-only senses, and pronunciation
 *  notes. Shared with the reading choice in readings.ts. */
export function isJunkSense(sense: string) {
  const s = sense.trim();
  return (
    !s ||
    SURNAME.test(s) ||
    VARIANT.test(s) ||
    ARCHAIC.test(s) ||
    PRONUNCIATION_NOTE.test(s)
  );
}

export interface GlossResult {
  /** The gloss to store. Never empty while there is at least one sense. */
  gloss: string;
  /** Classifiers pulled out of "CL:" notes (simplified forms). */
  classifiers: string[];
  /** True when every sense was dropped and the first raw sense was kept. */
  fallback: boolean;
}

function extractClassifiers(note: string) {
  return note
    .split(/[,，、]/)
    .map((part) => part.replace(BRACKETED, "").trim())
    // Traditional|simplified pairs: keep the simplified side.
    .map((part) => (part.includes("|") ? part.split("|")[1] : part).trim())
    .filter(Boolean);
}

/** Remove top-level parentheticals that are longer than the rest of the
 *  sense, e.g. "bar (loanword) (serving drinks, or providing Internet
 *  access etc)" -> "bar (loanword)". A sense that is only a parenthetical
 *  is left as is. */
function trimLongParentheticals(sense: string) {
  const groups: { start: number; end: number }[] = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < sense.length; i++) {
    if (sense[i] === "(") {
      if (depth === 0) start = i;
      depth++;
    } else if (sense[i] === ")" && depth > 0) {
      depth--;
      if (depth === 0) groups.push({ start, end: i + 1 });
    }
  }
  if (groups.length === 0) return sense;

  let outside = sense;
  for (const g of [...groups].reverse()) {
    outside = outside.slice(0, g.start) + outside.slice(g.end);
  }
  const meaningLength = outside.replace(/\s+/g, " ").trim().length;
  if (meaningLength === 0) return sense;

  let result = sense;
  for (const g of [...groups].reverse()) {
    const inner = sense.slice(g.start + 1, g.end - 1).trim();
    if (inner.length > meaningLength) {
      result = result.slice(0, g.start) + result.slice(g.end);
    }
  }
  return result.replace(/\s+/g, " ").replace(/\s+([,;])/g, "$1").trim();
}

export function buildGloss(meanings: string[], maxSenses = 2): GlossResult {
  const classifiers: string[] = [];
  const kept: string[] = [];

  for (const raw of meanings) {
    let sense = raw.trim();

    const cl = sense.match(CLASSIFIER_NOTE);
    if (cl) {
      classifiers.push(...extractClassifiers(cl[1]));
      sense = sense.replace(CLASSIFIER_NOTE, "").trim();
    }

    if (isJunkSense(sense)) continue;

    sense = sense.replace(INLINE_PRONUNCIATION, "").replace(BRACKETED, "");
    sense = trimLongParentheticals(sense).replace(/\s+/g, " ").trim();
    if (sense) kept.push(sense);
  }

  const unique = [...new Set(classifiers)];
  if (kept.length === 0) {
    return { gloss: meanings[0]?.trim() ?? "", classifiers: unique, fallback: true };
  }
  return {
    gloss: kept.slice(0, maxSenses).join("; "),
    classifiers: unique,
    fallback: false,
  };
}
