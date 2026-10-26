/** Choices for profiles.daily_new_words in the Training hub. */
export const DAILY_NEW_WORD_OPTIONS = [0, 5, 10, 15, 20, 30] as const;

/** Choices for profiles.daily_new_writing in the same picker. */
export const DAILY_NEW_WRITING_OPTIONS = [0, 3, 5, 10, 15, 20] as const;

export function isDailyNewWritingOption(value: unknown): value is (typeof DAILY_NEW_WRITING_OPTIONS)[number] {
  return (DAILY_NEW_WRITING_OPTIONS as readonly unknown[]).includes(value);
}

export function isDailyNewWordOption(value: unknown): value is (typeof DAILY_NEW_WORD_OPTIONS)[number] {
  return (DAILY_NEW_WORD_OPTIONS as readonly unknown[]).includes(value);
}
