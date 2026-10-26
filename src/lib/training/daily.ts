/** Choices for profiles.daily_new_words in the Training hub. */
export const DAILY_NEW_WORD_OPTIONS = [0, 5, 10, 15, 20, 30] as const;

export function isDailyNewWordOption(value: unknown): value is (typeof DAILY_NEW_WORD_OPTIONS)[number] {
  return (DAILY_NEW_WORD_OPTIONS as readonly unknown[]).includes(value);
}
