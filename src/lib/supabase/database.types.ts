// Database types for the Supabase clients, in the shape `supabase gen types
// typescript` produces. Written by hand from the live schema plus
// supabase/migrations/20261025120000_learning_core.sql and
// 20261101120000_dictionary_search.sql; regenerate with the
// CLI once it's set up, and keep this file's name so imports don't change.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string | null;
          display_name: string | null;
          avatar_url: string | null;
          hsk_level_target: number | null;
          xp: number;
          coins: number;
          current_streak: number;
          longest_streak: number;
          last_study_date: string | null;
          daily_new_words: number;
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
          xp?: number;
          coins?: number;
          current_streak?: number;
          longest_streak?: number;
          last_study_date?: string | null;
          daily_new_words?: number;
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
          xp?: number;
          coins?: number;
          current_streak?: number;
          longest_streak?: number;
          last_study_date?: string | null;
          daily_new_words?: number;
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
          /** Old HSK level, 1 to 6. */
          hsk_level: number;
          /** HSK 3.0 level, 1 to 9. Not filled yet. */
          hsk3_level: number | null;
          frequency: number | null;
          sort_order: number | null;
          pinyin: string;
          pinyin_numeric: string | null;
          /** Search form: "zhǔn bèi" -> "zhunbei" (ü as v). */
          pinyin_plain: string | null;
          /** Search form: "zhun3 bei4" -> "zhun3bei4". */
          pinyin_num: string | null;
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
          hsk_level: number;
          hsk3_level?: number | null;
          frequency?: number | null;
          sort_order?: number | null;
          pinyin: string;
          pinyin_numeric?: string | null;
          pinyin_plain?: string | null;
          pinyin_num?: string | null;
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
          hsk_level?: number;
          hsk3_level?: number | null;
          frequency?: number | null;
          sort_order?: number | null;
          pinyin?: string;
          pinyin_numeric?: string | null;
          pinyin_plain?: string | null;
          pinyin_num?: string | null;
          pos?: string[] | null;
          meanings?: string[];
          classifiers?: string[] | null;
          gloss?: string | null;
          gloss_status?: "auto" | "reviewed";
          created_at?: string;
        };
        Relationships: [];
      };
      user_words: {
        Row: {
          user_id: string;
          word_id: number;
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
          hsk_level: number;
          hsk3_level: number | null;
          total_count: number;
        }[];
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
        };
        Returns: number;
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
