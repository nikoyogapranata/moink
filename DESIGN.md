---
name: Moink
description: A focused Chinese learning platform for HSK 1-4 learners who want to feel sharper, not just less guilty.
colors:
  red-stamp: "#dc2626"
  ink-black: "#111111"
  ink-soft: "#3d3835"
  paper-warm: "#faf7f4"
  paper-medium: "#f2ede8"
  brush-gray: "#c8bfb8"
  muted-text: "#6b6055"
typography:
  display:
    fontFamily: "Geist, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "clamp(2rem, 5vw, 3.5rem)"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Geist, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "clamp(1.5rem, 3vw, 2rem)"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.015em"
  title:
    fontFamily: "Geist, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 500
    lineHeight: 1.3
  body:
    fontFamily: "Geist, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "0.75rem"
    fontWeight: 500
    letterSpacing: "0.04em"
rounded:
  sm: "4px"
  md: "8px"
  lg: "12px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
  2xl: "64px"
components:
  button-primary:
    backgroundColor: "{colors.ink-black}"
    textColor: "{colors.paper-warm}"
    rounded: "{rounded.md}"
    padding: "12px 24px"
  button-primary-hover:
    backgroundColor: "{colors.red-stamp}"
    textColor: "{colors.paper-warm}"
    rounded: "{rounded.md}"
    padding: "12px 24px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-black}"
    rounded: "{rounded.md}"
    padding: "12px 24px"
  chip-hsk:
    backgroundColor: "{colors.paper-medium}"
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.pill}"
    padding: "4px 10px"
  chip-hsk-active:
    backgroundColor: "{colors.red-stamp}"
    textColor: "{colors.paper-warm}"
    rounded: "{rounded.pill}"
    padding: "4px 10px"
  input:
    backgroundColor: "{colors.paper-warm}"
    textColor: "{colors.ink-black}"
    rounded: "{rounded.md}"
    padding: "10px 14px"
---

# Design System: Moink

## 1. Overview

**Creative North Star: "The Ink Study"**

A focused desk: clean paper, a single red stamp, characters written with deliberate care. Nothing competes with the work in front of you. The Moink design system is the desk, not the decoration.

Every surface is paper: warm white, slightly textured in feel if not in fact. Text is ink: high-contrast, intentional, unadorned. The red stamp appears once per surface, where it matters most, and then it is done. Motion is unhurried but not slow, like a brush drawn with purpose.

This system rejects the Duolingo gamification overload (badges and owls competing with the lesson), the generic SaaS dashboard (teal-white-rounded, hero metrics, identical card grids), and the tourist-trap China aesthetic (red lanterns, dragon motifs, overwrought clichés). It also rejects the academic/sterile tool (textbook grey, dense unlabeled tables, zero warmth). What remains is a tool that respects the learner's intelligence while remaining genuinely human.

**Key Characteristics:**
- Warm paper neutrals, high-contrast ink text, single red stamp accent used on at most 10% of any surface
- Flat by default: surfaces separated by tint and border, never by shadow
- Warm and tactile components: gently rounded, confident hover states with perceptible weight
- Geist Sans for all UI text; Geist Mono for pinyin, labels, and phonetic notation
- CJK character rendering via Hanzi Writer and a specified CJK font stack (specified at implementation)
- One job per screen; no competing elements

## 2. Colors: The Ink Study Palette

A restrained palette of warm paper neutrals, ink black, and one red stamp accent. The red earns its place every time it appears.

### Primary
- **Red Stamp** (`#dc2626`): The sole accent in the system. Used for primary actions, active navigation states, correct/positive feedback, and the Moink brand mark. Present on at most 10% of any given screen. Its scarcity is its power.

### Neutral
- **Ink Black** (`#111111`): Primary text, character display, headings, and high-emphasis labels. The highest contrast value in the system.
- **Ink Soft** (`#3d3835`): Secondary text, body paragraphs, and supporting descriptions. Warm, never purely gray.
- **Muted Text** (`#6b6055`): Tertiary text, timestamps, metadata, and placeholder copy.
- **Brush Gray** (`#c8bfb8`): Borders, dividers, and input outlines at rest. Never used as text.
- **Paper Medium** (`#f2ede8`): Slightly elevated surfaces: sidebar backgrounds, hover states on list items, chip and tag backgrounds.
- **Paper Warm** (`#faf7f4`): The primary background. Not white. The warmth is subtle but essential.

### Named Rules
**The Red Stamp Rule.** The red accent is permitted on one element per semantic region. If two elements on the same screen are both red, one of them is wrong. Rarity is the point.

**The No-White Rule.** Pure `#ffffff` is prohibited as any background or surface value. Paper Warm (`#faf7f4`) is the floor. Surfaces layer upward from there using Paper Medium.

## 3. Typography

**Display / Heading Font:** Geist (variable, sans-serif)
**Body Font:** Geist (variable, sans-serif)
**Label / Mono Font:** Geist Mono (monospace)
**CJK Display Stack:** `[Noto Serif SC / Source Han Serif / system CJK fallback — to be specified at implementation]`

**Character:** Geist's variable axis gives Moink a range from whisper-weight to authoritative bold within a single typeface. The mono variant surfaces wherever precision matters: pinyin, stroke count, HSK level tags, and learner response inputs. Chinese characters themselves are rendered via Hanzi Writer or a dedicated CJK font; they are never styled with Geist.

### Hierarchy
- **Display** (600, clamp(2rem, 5vw, 3.5rem), lh 1.1, ls -0.025em): Section heroes and landing headings. Used once per page.
- **Headline** (600, clamp(1.5rem, 3vw, 2rem), lh 1.2, ls -0.015em): Page titles, card headers, and vocabulary word displays.
- **Title** (500, 1.125rem, lh 1.3): Section labels, group headings, and quiz question stems.
- **Body** (400, 1rem, lh 1.6): Explanations, cultural descriptions, and quiz feedback. Maximum 65ch per line.
- **Label** (Geist Mono, 500, 0.75rem, ls 0.04em): HSK tags, pinyin, stroke counts, timestamps, and all metadata. Monospaced for consistent column alignment.

### Named Rules
**The One Family Rule.** Geist handles all UI text. No decorative display face is introduced to add personality. Personality comes from content and culture, not from a script font overlay.

**The CJK Separation Rule.** Chinese characters are rendered by Hanzi Writer or a specified CJK font stack, never styled with Geist. The two type systems must not compete on the same text line.

## 4. Elevation

Flat by default. Surfaces are separated by tint transition (Paper Warm to Paper Medium) and 1px Brush Gray borders, never by shadow. The system reads like paper on a desk, not floating UI panels.

**The Flat-By-Default Rule.** No element casts a shadow at rest. Interactive elements may introduce a minimal ambient shadow on hover to signal elevation. Dropdowns and popovers use one defined shadow level only. Depth is earned by state, not by decoration.

### Shadow Vocabulary
- **Interactive Hover** (`0 2px 8px rgba(17, 17, 17, 0.08)`): Applied on hover to buttons, vocabulary cards, and list items that are interactive. Signals clickability without visual weight.
- **Popover / Dropdown** (`0 8px 24px rgba(17, 17, 17, 0.12)`): Reserved for elements that genuinely float above the surface: tooltips, autocomplete results, context menus.

## 5. Components

### Buttons
Warm and tactile. The primary button is Ink Black at rest, not red, keeping the stamp rare. Red appears on hover as a deliberate moment of brand contact.

- **Shape:** Gently rounded (8px radius)
- **Primary:** Ink Black background (`#111111`), Paper Warm text, 12px 24px padding, 500 weight, 0.9rem
- **Hover / Focus:** Background transitions to Red Stamp (`#dc2626`) over 180ms ease-out-quart. Focus ring: 2px Red Stamp, offset 2px.
- **Ghost:** Transparent background, Ink Black text, 1px Brush Gray border. Hover: Paper Medium background, border deepens to Ink Soft.
- **Disabled:** 40% opacity, no pointer events, no hover state.

### Chips / Tags (HSK Level Filters)
Used for HSK level selectors (1-4) and vocabulary category tags. Monospaced to align neatly in rows.

- **Default:** Paper Medium background, Ink Soft text, pill radius, Geist Mono 0.75rem 500, 4px 10px padding
- **Active / Selected:** Red Stamp background, Paper Warm text. Only one HSK chip active at a time.
- **Hover (default only):** Paper Medium deepens slightly; Ink Black text.

### Cards / Containers
Vocabulary cards, culture feature cards, and character decomposition panels.

- **Corner Style:** Gently rounded (8px radius)
- **Background:** Paper Warm at rest; Paper Medium for nested or secondary regions
- **Shadow Strategy:** None at rest. Interactive Hover shadow on hover if the card is clickable.
- **Border:** 1px Brush Gray (`#c8bfb8`)
- **Internal Padding:** 16px for compact vocabulary cards; 24px for culture and feature cards. Never uniform across the whole app.

### Inputs / Fields
Used in search, quiz answer entry, and authentication forms.

- **Style:** Paper Warm background, 1px Brush Gray border, 8px radius, 10px 14px padding
- **Focus:** Border shifts to Ink Black, weight increases to 1.5px. No glow, no shadow ring. Restrained.
- **Error:** Border shifts to Red Stamp (`#dc2626`). Error message below the field in Red Stamp, Geist Mono 0.75rem.
- **Disabled:** Paper Medium background, Muted Text color, no interaction.

### Navigation
App shell top or side navigation across HSK levels, vocabulary, culture, and profile.

- **Style:** Paper Warm background, 1px Brush Gray border on the bottom or right edge. No shadow.
- **Typography:** Geist 500 0.9rem, Muted Text at rest.
- **Active state:** Ink Black text, Red Stamp bottom or left border at 2px. This is the only permitted use of a colored border stripe in this system, and only at 2px on a navigation item.
- **Hover:** Paper Medium background fill, Ink Black text.
- **Mobile:** Collapses to bottom tab bar. Same color rules apply; active tab uses Red Stamp icon or label.

### Flashcard / Vocabulary Card (Signature Component)
The primary learning surface. Large-scale character front; decomposition, pinyin, and stroke animation back.

- **Front face:** Single Hanzi character at ~80-120px, centered on Paper Warm. HSK chip top-right. Nothing else competes with the character.
- **Back face:** Character at headline scale, pinyin in Geist Mono label, meaning in body, radical breakdown as chips, Hanzi Writer stroke animation below.
- **Flip transition:** CSS perspective (1200px), rotateY 180deg, 380ms ease-out-quart. Respects `prefers-reduced-motion`: show back face directly without transform.

## 6. Do's and Don'ts

### Do:
- **Do** use Red Stamp (`#dc2626`) on at most one element per semantic region. The stamp marks what matters; overuse erases the mark.
- **Do** keep Paper Warm (`#faf7f4`) as the minimum background value. Never use pure `#ffffff` for any surface.
- **Do** use Geist Mono for pinyin, stroke counts, HSK tags, and all phonetic notation. Precision and column alignment are why.
- **Do** keep body text within 65ch. Learners read explanations; long line lengths cause dropout.
- **Do** respect `prefers-reduced-motion` on every Framer Motion animation and every Hanzi Writer stroke animation without exception.
- **Do** let the Chinese character be the visual hero on learning screens. No decorative element should compete with it.
- **Do** use tint (Paper Warm to Paper Medium) and 1px Brush Gray borders to separate surfaces. Shadow is for state only.
- **Do** vary internal padding across card types. Uniform padding is monotony.

### Don't:
- **Don't** run gamification overload: competing badge animations, guilt-streak countdown timers, or constant mascot presence. Moink the red panda appears with intention, as a reward, not on every screen.
- **Don't** build generic SaaS UI: teal-white-rounded layouts, hero metric dashboards, identical card grids, or B2B product conventions. This is a learning tool.
- **Don't** use tourist-trap China aesthetics: red lanterns, dragon motifs, "orient" clichés, or overwrought cultural ornamentation. Cultural references appear because they teach, not as background decoration.
- **Don't** let the UI feel academic or sterile: no textbook-grey schemes, no dense unlabeled tables, no personality-free layout.
- **Don't** use gradient text (`background-clip: text` with a gradient). Use solid Ink Black or Red Stamp for emphasis. Weight and size create hierarchy.
- **Don't** use a modal as the first solution for flashcard reveals, quiz answers, or character decomposition. Prefer inline or progressive disclosure.
- **Don't** introduce a second accent color to add energy. The red stamp is the energy. A second accent dissolves it.
- **Don't** use `border-left` or `border-right` greater than 1px as a colored accent stripe on cards or callouts. The only permitted colored border in this system is the 2px active indicator on navigation items.
