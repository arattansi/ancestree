export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      claims: {
        Row: {
          claimant_user_id: string
          created_at: string
          id: string
          person_id: string
          resolved_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          claimant_user_id: string
          created_at?: string
          id?: string
          person_id: string
          resolved_at?: string | null
          status: string
          updated_at?: string
        }
        Update: {
          claimant_user_id?: string
          created_at?: string
          id?: string
          person_id?: string
          resolved_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "claims_claimant_user_id_fkey"
            columns: ["claimant_user_id"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "claims_claimant_user_id_fkey"
            columns: ["claimant_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "claims_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          created_at: string
          file_name: string
          file_path: string
          id: string
          mime_type: string
          person_id: string
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_path: string
          id?: string
          mime_type: string
          person_id: string
          updated_at?: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_path?: string
          id?: string
          mime_type?: string
          person_id?: string
          updated_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["auth_user_id"]
          },
        ]
      }
      entry_comments: {
        Row: {
          body: string
          created_at: string
          created_by: string
          id: string
          is_flag: boolean
          person_id: string
          status: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by: string
          id?: string
          is_flag?: boolean
          person_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string
          id?: string
          is_flag?: boolean
          person_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "entry_comments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "entry_comments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "entry_comments_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      invites: {
        Row: {
          accepted_by_user_id: string | null
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          status: string
          token: string
          tree_id: string
          updated_at: string
        }
        Insert: {
          accepted_by_user_id?: string | null
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          status?: string
          token?: string
          tree_id: string
          updated_at?: string
        }
        Update: {
          accepted_by_user_id?: string | null
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          status?: string
          token?: string
          tree_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invites_accepted_by_user_id_fkey"
            columns: ["accepted_by_user_id"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "invites_accepted_by_user_id_fkey"
            columns: ["accepted_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "invites_tree_id_fkey"
            columns: ["tree_id"]
            isOneToOne: false
            referencedRelation: "trees"
            referencedColumns: ["id"]
          },
        ]
      }
      people: {
        Row: {
          city_of_birth: string | null
          country_of_birth: string
          created_at: string
          created_by: string
          date_of_birth: string | null
          date_of_death: string | null
          family_name: string
          given_name: string | null
          id: string
          is_deceased: boolean
          lineage_type: string | null
          owner_user_id: string
          photo_path: string | null
          place_of_death: string | null
          pos_x: number | null
          pos_y: number | null
          preferred_name: string | null
          tree_id: string
          updated_at: string
        }
        Insert: {
          city_of_birth?: string | null
          country_of_birth: string
          created_at?: string
          created_by: string
          date_of_birth?: string | null
          date_of_death?: string | null
          family_name: string
          given_name?: string | null
          id?: string
          is_deceased: boolean
          lineage_type?: string | null
          owner_user_id: string
          photo_path?: string | null
          place_of_death?: string | null
          pos_x?: number | null
          pos_y?: number | null
          preferred_name?: string | null
          tree_id: string
          updated_at?: string
        }
        Update: {
          city_of_birth?: string | null
          country_of_birth?: string
          created_at?: string
          created_by?: string
          date_of_birth?: string | null
          date_of_death?: string | null
          family_name?: string
          given_name?: string | null
          id?: string
          is_deceased?: boolean
          lineage_type?: string | null
          owner_user_id?: string
          photo_path?: string | null
          place_of_death?: string | null
          pos_x?: number | null
          pos_y?: number | null
          preferred_name?: string | null
          tree_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "people_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "people_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "people_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "people_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "people_tree_id_fkey"
            columns: ["tree_id"]
            isOneToOne: false
            referencedRelation: "trees"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          auth_user_id: string
          can_invite: boolean
          created_at: string
          display_name: string | null
          invited_by_user_id: string | null
          role: string
          self_person_id: string | null
          updated_at: string
        }
        Insert: {
          auth_user_id: string
          can_invite?: boolean
          created_at?: string
          display_name?: string | null
          invited_by_user_id?: string | null
          role?: string
          self_person_id?: string | null
          updated_at?: string
        }
        Update: {
          auth_user_id?: string
          can_invite?: boolean
          created_at?: string
          display_name?: string | null
          invited_by_user_id?: string | null
          role?: string
          self_person_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_invited_by_user_id_fkey"
            columns: ["invited_by_user_id"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "profiles_invited_by_user_id_fkey"
            columns: ["invited_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "profiles_self_person_id_fkey"
            columns: ["self_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      relationships: {
        Row: {
          created_at: string
          created_by: string
          from_person: string
          id: string
          to_person: string
          tree_id: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          from_person: string
          id?: string
          to_person: string
          tree_id: string
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          from_person?: string
          id?: string
          to_person?: string
          tree_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "relationships_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "relationships_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "relationships_from_person_fkey"
            columns: ["from_person"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relationships_to_person_fkey"
            columns: ["to_person"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relationships_tree_id_fkey"
            columns: ["tree_id"]
            isOneToOne: false
            referencedRelation: "trees"
            referencedColumns: ["id"]
          },
        ]
      }
      trees: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      member_directory: {
        Row: {
          auth_user_id: string | null
          can_invite: boolean | null
          created_at: string | null
          display_name: string | null
          invited_by_name: string | null
          invited_by_user_id: string | null
          role: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_invited_by_user_id_fkey"
            columns: ["invited_by_user_id"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "profiles_invited_by_user_id_fkey"
            columns: ["invited_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["auth_user_id"]
          },
        ]
      }
    }
    Functions: {
      ensure_profile: {
        Args: { p_display_name?: string }
        Returns: {
          auth_user_id: string
          can_invite: boolean
          created_at: string
          display_name: string | null
          invited_by_user_id: string | null
          role: string
          self_person_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      invite_preview: {
        Args: { p_token: string }
        Returns: {
          inviter_name: string
          tree_name: string
          valid: boolean
        }[]
      }
      redeem_invite: {
        Args: { p_display_name?: string; p_token: string }
        Returns: {
          auth_user_id: string
          can_invite: boolean
          created_at: string
          display_name: string | null
          invited_by_user_id: string | null
          role: string
          self_person_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
