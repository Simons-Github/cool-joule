export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15";
  };
  public: {
    Tables: {
      custom_foods: {
        Row: {
          brand: string | null;
          calories_per_100g: number;
          carbs_per_100g: number;
          created_at: string;
          fat_per_100g: number;
          id: string;
          name: string;
          protein_per_100g: number;
          user_id: string;
        };
        Insert: {
          brand?: string | null;
          calories_per_100g?: number;
          carbs_per_100g?: number;
          created_at?: string;
          fat_per_100g?: number;
          id?: string;
          name: string;
          protein_per_100g?: number;
          user_id: string;
        };
        Update: {
          brand?: string | null;
          calories_per_100g?: number;
          carbs_per_100g?: number;
          created_at?: string;
          fat_per_100g?: number;
          id?: string;
          name?: string;
          protein_per_100g?: number;
          user_id?: string;
        };
        Relationships: [];
      };
      food_photo_server_usage: {
        Row: {
          last_used_at: string;
          user_id: string;
        };
        Insert: {
          last_used_at?: string;
          user_id: string;
        };
        Update: {
          last_used_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      food_logs: {
        Row: {
          brand: string | null;
          calories: number;
          carbs: number;
          created_at: string;
          date: string;
          fat: number;
          food_name: string;
          id: string;
          meal_type: string;
          protein: number;
          serving_size_g: number;
          user_id: string;
        };
        Insert: {
          brand?: string | null;
          calories?: number;
          carbs?: number;
          created_at?: string;
          date?: string;
          fat?: number;
          food_name: string;
          id?: string;
          meal_type: string;
          protein?: number;
          serving_size_g?: number;
          user_id: string;
        };
        Update: {
          brand?: string | null;
          calories?: number;
          carbs?: number;
          created_at?: string;
          date?: string;
          fat?: number;
          food_name?: string;
          id?: string;
          meal_type?: string;
          protein?: number;
          serving_size_g?: number;
          user_id?: string;
        };
        Relationships: [];
      };
      user_gemini_keys: {
        Row: {
          ciphertext: string;
          key_suffix: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          ciphertext: string;
          key_suffix: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          ciphertext?: string;
          key_suffix?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          activity_level: string | null;
          age: number | null;
          created_at: string;
          current_weight: number | null;
          daily_calories: number | null;
          display_name: string | null;
          email: string | null;
          gender: string | null;
          goal: string | null;
          height_cm: number | null;
          id: string;
          onboarded: boolean;
          target_carbs: number | null;
          target_fat: number | null;
          target_protein: number | null;
          target_weight: number | null;
          updated_at: string;
        };
        Insert: {
          activity_level?: string | null;
          age?: number | null;
          created_at?: string;
          current_weight?: number | null;
          daily_calories?: number | null;
          display_name?: string | null;
          email?: string | null;
          gender?: string | null;
          goal?: string | null;
          height_cm?: number | null;
          id: string;
          onboarded?: boolean;
          target_carbs?: number | null;
          target_fat?: number | null;
          target_protein?: number | null;
          target_weight?: number | null;
          updated_at?: string;
        };
        Update: {
          activity_level?: string | null;
          age?: number | null;
          created_at?: string;
          current_weight?: number | null;
          daily_calories?: number | null;
          display_name?: string | null;
          email?: string | null;
          gender?: string | null;
          goal?: string | null;
          height_cm?: number | null;
          id?: string;
          onboarded?: boolean;
          target_carbs?: number | null;
          target_fat?: number | null;
          target_protein?: number | null;
          target_weight?: number | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      weight_logs: {
        Row: {
          created_at: string;
          date: string;
          id: string;
          user_id: string;
          weight_kg: number;
        };
        Insert: {
          created_at?: string;
          date?: string;
          id?: string;
          user_id: string;
          weight_kg: number;
        };
        Update: {
          created_at?: string;
          date?: string;
          id?: string;
          user_id?: string;
          weight_kg?: number;
        };
        Relationships: [];
      };
      server_rate_limits: {
        Row: {
          action: string;
          request_count: number;
          user_id: string;
          window_started_at: string;
        };
        Insert: {
          action: string;
          request_count?: number;
          user_id: string;
          window_started_at?: string;
        };
        Update: {
          action?: string;
          request_count?: number;
          user_id?: string;
          window_started_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      claim_food_photo_server_usage: {
        Args: { p_user_id: string };
        Returns: string | null;
      };
      claim_server_rate_limit: {
        Args: {
          p_user_id: string;
          p_action: string;
          p_max_count: number;
          p_window_seconds: number;
        };
        Returns: boolean;
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

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
