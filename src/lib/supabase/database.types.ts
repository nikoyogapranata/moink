// Database types for the Supabase clients, in the shape `supabase gen types
// typescript` produces. Written by hand from the live schema plus
// supabase/migrations/20261025120000_learning_core.sql,
// 20261101120000_dictionary_search.sql, 20261102120000_training.sql and
// 20261109120000_writing.sql;
// regenerate with the
// CLI once it's set up, and keep this file's name so imports don't change.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/** Which card of a word: one user_words row per user, word and skill. */
export type Skill = "recognition" | "writing";

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string | null;
          display_name: string | null;
          avatar_url: string | null;
          /** A level in hsk_standard: 1 to 6 for hsk2, 1 to 7 for hsk3
           *  (7 = bands 7 to 9). */
          hsk_level_target: number | null;
          /** Which HSK the user studies: old HSK 2.0, or the HSK 3.0 2025
           *  syllabus. */
          hsk_standard: "hsk2" | "hsk3";
          xp: number;
          coins: number;
          current_streak: number;
          longest_streak: number;
          last_study_date: string | null;
          daily_new_words: number;
          /** New writing cards a day, 0 to 20. */
          daily_new_writing: number;
          timezone: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          username?: string | null;
          display_name?: string | null;
          avatar_url?: string | null;
          hsk_level_target?: number | null;
          hsk_standard?: "hsk2" | "hsk3";
          xp?: number;
          coins?: number;
          current_streak?: number;
          longest_streak?: number;
          last_study_date?: string | null;
          daily_new_words?: number;
          daily_new_writing?: number;
          timezone?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          username?: string | null;
          display_name?: string | null;
          avatar_url?: string | null;
          hsk_level_target?: number | null;
          hsk_standard?: "hsk2" | "hsk3";
          xp?: number;
          coins?: number;
          current_streak?: number;
          longest_streak?: number;
          last_study_date?: string | null;
          daily_new_words?: number;
          daily_new_writing?: number;
          timezone?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      words: {
        Row: {
          id: number;
          simplified: string;
          traditional: string | null;
          radical: string | null;
          /** Old HSK level, 1 to 6; null for a word only in HSK 3.0. */
          hsk_level: number | null;
          /** HSK 3.0 level in the 2021 standard (GF0025-2021), 1 to 7
           *  (7 = bands 7 to 9). */
          hsk3_level: number | null;
          /** HSK 3.0 level in the 2025 syllabus, 1 to 7 (7 = bands 7 to
           *  9). From 20261116120000_hsk3_2025.sql. */
          hsk3_2025_level: number | null;
          frequency: number | null;
          /** Order within the old HSK level. */
          sort_order: number | null;
          /** Order within hsk3_2025_level (rank_words_2025). */
          sort_order_2025: number | null;
          pinyin: string;
          pinyin_numeric: string | null;
          /** Search form: "zhǔn bèi" -> "zhunbei" (ü as v). */
          pinyin_plain: string | null;
          /** Search form: "zhun3 bei4" -> "zhun3bei4". */
          pinyin_num: string | null;
          /** A to Z key, generated (20261130120000_dictionary_sort.sql):
           *  "ma 1 01 妈". */
          sort_az: string | null;
          pos: string[] | null;
          meanings: string[];
          classifiers: string[] | null;
          gloss: string | null;
          gloss_status: "auto" | "reviewed";
          created_at: string;
        };
        Insert: {
          id?: never;
          simplified: string;
          traditional?: string | null;
          radical?: string | null;
          hsk_level?: number | null;
          hsk3_level?: number | null;
          hsk3_2025_level?: number | null;
          frequency?: number | null;
          sort_order?: number | null;
          sort_order_2025?: number | null;
          pinyin: string;
          pinyin_numeric?: string | null;
          pinyin_plain?: string | null;
          pinyin_num?: string | null;
          sort_az?: never;
          pos?: string[] | null;
          meanings: string[];
          classifiers?: string[] | null;
          gloss?: string | null;
          gloss_status?: "auto" | "reviewed";
          created_at?: string;
        };
        Update: {
          id?: never;
          simplified?: string;
          traditional?: string | null;
          radical?: string | null;
          hsk_level?: number | null;
          hsk3_level?: number | null;
          hsk3_2025_level?: number | null;
          frequency?: number | null;
          sort_order?: number | null;
          sort_order_2025?: number | null;
          pinyin?: string;
          pinyin_numeric?: string | null;
          pinyin_plain?: string | null;
          pinyin_num?: string | null;
          sort_az?: never;
          pos?: string[] | null;
          meanings?: string[];
          classifiers?: string[] | null;
          gloss?: string | null;
          gloss_status?: "auto" | "reviewed";
          created_at?: string;
        };
        Relationships: [];
      };
      writing_excluded: {
        /** Characters hanzi-writer has no stroke data for
         *  (scripts/check-stroke-data.ts). */
        Row: { char: string };
        Insert: { char: string };
        Update: { char?: string };
        Relationships: [];
      };
      user_words: {
        Row: {
          user_id: string;
          word_id: number;
          skill: Skill;
          due: string;
          stability: number;
          difficulty: number;
          elapsed_days: number;
          scheduled_days: number;
          learning_steps: number;
          reps: number;
          lapses: number;
          /** ts-fsrs State: 0 New, 1 Learning, 2 Review, 3 Relearning. */
          state: number;
          last_review: string | null;
          introduced_at: string;
          suspended: boolean;
        };
        Insert: {
          user_id: string;
          word_id: number;
          skill?: Skill;
          due?: string;
          stability?: number;
          difficulty?: number;
          elapsed_days?: number;
          scheduled_days?: number;
          learning_steps?: number;
          reps?: number;
          lapses?: number;
          state?: number;
          last_review?: string | null;
          introduced_at?: string;
          suspended?: boolean;
        };
        Update: {
          user_id?: string;
          word_id?: number;
          skill?: Skill;
          due?: string;
          stability?: number;
          difficulty?: number;
          elapsed_days?: number;
          scheduled_days?: number;
          learning_steps?: number;
          reps?: number;
          lapses?: number;
          state?: number;
          last_review?: string | null;
          introduced_at?: string;
          suspended?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "user_words_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_words_word_id_fkey";
            columns: ["word_id"];
            isOneToOne: false;
            referencedRelation: "words";
            referencedColumns: ["id"];
          },
        ];
      };
      reviews: {
        Row: {
          id: number;
          user_id: string;
          word_id: number;
          skill: Skill;
          /** ts-fsrs Rating: 1 Again, 2 Hard, 3 Good, 4 Easy. */
          rating: number;
          state: number;
          due: string;
          stability: number;
          difficulty: number;
          elapsed_days: number;
          last_elapsed_days: number;
          scheduled_days: number;
          learning_steps: number;
          review: string;
          duration_ms: number | null;
          mode: string;
        };
        Insert: {
          id?: never;
          user_id: string;
          word_id: number;
          skill?: Skill;
          rating: number;
          state: number;
          due: string;
          stability: number;
          difficulty: number;
          elapsed_days: number;
          last_elapsed_days: number;
          scheduled_days: number;
          learning_steps: number;
          review: string;
          duration_ms?: number | null;
          mode?: string;
        };
        // Reviews are append-only (no update policy); kept for shape.
        Update: {
          id?: never;
          user_id?: string;
          word_id?: number;
          skill?: Skill;
          rating?: number;
          state?: number;
          due?: string;
          stability?: number;
          difficulty?: number;
          elapsed_days?: number;
          last_elapsed_days?: number;
          scheduled_days?: number;
          learning_steps?: number;
          review?: string;
          duration_ms?: number | null;
          mode?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reviews_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reviews_word_id_fkey";
            columns: ["word_id"];
            isOneToOne: false;
            referencedRelation: "words";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      is_username_available: {
        Args: { name: string };
        Returns: boolean;
      };
      next_new_words: {
        Args: { p_limit?: number };
        Returns: Database["public"]["Tables"]["words"]["Row"][];
      };
      rank_words_2025: {
        Args: Record<string, never>;
        Returns: number;
      };
      pinyin_num: {
        Args: { p_text: string };
        Returns: string | null;
      };
      pinyin_plain: {
        Args: { p_text: string };
        Returns: string | null;
      };
      search_words: {
        Args: {
          p_query: string;
          p_level?: number | null;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: {
          id: number;
          simplified: string;
          pinyin: string;
          gloss: string | null;
          hsk_level: number | null;
          hsk3_level: number | null;
          hsk3_2025_level: number | null;
          total_count: number;
        }[];
      };
      word_letter_counts: {
        Args: { p_standard: string; p_level?: number | null };
        Returns: { letter: string; word_count: number }[];
      };
      word_of_the_day: {
        Args: { p_date: string };
        Returns: Database["public"]["Tables"]["words"]["Row"][];
      };
      record_review: {
        Args: {
          p_word_id: number;
          p_card: Json;
          p_log: Json;
          p_duration_ms?: number;
          p_mode?: string;
          p_skill?: Skill;
        };
        Returns: number;
      };
      new_words_remaining_today: {
        Args: { p_today_start: string };
        Returns: number;
      };
      get_review_queue: {
        Args: { p_now: string; p_today_start: string };
        Returns: {
          id: number;
          simplified: string;
          pinyin: string;
          gloss: string | null;
          hsk_level: number | null;
          hsk3_2025_level: number | null;
          classifiers: string[] | null;
          /** Card fields: null when has_card is false. */
          due: string | null;
          stability: number | null;
          difficulty: number | null;
          elapsed_days: number | null;
          scheduled_days: number | null;
          learning_steps: number | null;
          reps: number | null;
          lapses: number | null;
          state: number | null;
          last_review: string | null;
          is_new: boolean;
          /** False for words from next_new_words (no user_words row yet). */
          has_card: boolean;
        }[];
      };
      new_writing_remaining_today: {
        Args: { p_today_start: string };
        Returns: number;
      };
      get_writing_queue: {
        Args: { p_now: string; p_today_start: string };
        Returns: {
          id: number;
          simplified: string;
          pinyin: string;
          gloss: string | null;
          hsk_level: number | null;
          hsk3_2025_level: number | null;
          classifiers: string[] | null;
          /** Card fields: null when has_card is false. */
          due: string | null;
          stability: number | null;
          difficulty: number | null;
          elapsed_days: number | null;
          scheduled_days: number | null;
          learning_steps: number | null;
          reps: number | null;
          lapses: number | null;
          state: number | null;
          last_review: string | null;
          is_new: boolean;
          /** False for newly eligible words (no writing row yet). */
          has_card: boolean;
        }[];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Update"];
