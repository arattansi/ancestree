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
      bloodline_anchors: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          person_id: string
          tree_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          person_id: string
          tree_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          person_id?: string
          tree_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bloodline_anchors_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "bloodline_anchors_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "bloodline_anchors_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bloodline_anchors_tree_id_fkey"
            columns: ["tree_id"]
            isOneToOne: false
            referencedRelation: "my_trees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bloodline_anchors_tree_id_fkey"
            columns: ["tree_id"]
            isOneToOne: false
            referencedRelation: "trees"
            referencedColumns: ["id"]
          },
        ]
      }
      claims: {
        Row: {
          claimant_user_id: string
          created_at: string
          dispute_reason: string | null
          id: string
          person_id: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          claimant_user_id: string
          created_at?: string
          dispute_reason?: string | null
          id?: string
          person_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          status: string
          updated_at?: string
        }
        Update: {
          claimant_user_id?: string
          created_at?: string
          dispute_reason?: string | null
          id?: string
          person_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
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
          {
            foreignKeyName: "claims_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "claims_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["auth_user_id"]
          },
        ]
      }
      connection_suggestions: {
        Row: {
          created_at: string
          created_by: string
          id: string
          related_person_id: string
          resolved_at: string | null
          resolved_by: string | null
          source: string
          status: string
          subject_person_id: string
          suggested_type: string
          tree_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          related_person_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          source: string
          status?: string
          subject_person_id: string
          suggested_type: string
          tree_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          related_person_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          source?: string
          status?: string
          subject_person_id?: string
          suggested_type?: string
          tree_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "connection_suggestions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "connection_suggestions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "connection_suggestions_related_person_id_fkey"
            columns: ["related_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connection_suggestions_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "connection_suggestions_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "connection_suggestions_subject_person_id_fkey"
            columns: ["subject_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connection_suggestions_tree_id_fkey"
            columns: ["tree_id"]
            isOneToOne: false
            referencedRelation: "my_trees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connection_suggestions_tree_id_fkey"
            columns: ["tree_id"]
            isOneToOne: false
            referencedRelation: "trees"
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
          shared_across_trees: boolean
          tree_id: string
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
          shared_across_trees?: boolean
          tree_id: string
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
          shared_across_trees?: boolean
          tree_id?: string
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
            foreignKeyName: "documents_tree_id_fkey"
            columns: ["tree_id"]
            isOneToOne: false
            referencedRelation: "my_trees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_tree_id_fkey"
            columns: ["tree_id"]
            isOneToOne: false
            referencedRelation: "trees"
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
          resolved_at: string | null
          resolved_by: string | null
          status: string
          tree_id: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by: string
          id?: string
          is_flag?: boolean
          person_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          tree_id: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string
          id?: string
          is_flag?: boolean
          person_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          tree_id?: string
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
          {
            foreignKeyName: "entry_comments_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "entry_comments_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "entry_comments_tree_id_fkey"
            columns: ["tree_id"]
            isOneToOne: false
            referencedRelation: "my_trees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_comments_tree_id_fkey"
            columns: ["tree_id"]
            isOneToOne: false
            referencedRelation: "trees"
            referencedColumns: ["id"]
          },
        ]
      }
      entry_revisions: {
        Row: {
          after: Json
          before: Json
          created_at: string
          editor_user_id: string | null
          id: string
          person_id: string
          reverted_at: string | null
          reverted_by: string | null
        }
        Insert: {
          after: Json
          before: Json
          created_at?: string
          editor_user_id?: string | null
          id?: string
          person_id: string
          reverted_at?: string | null
          reverted_by?: string | null
        }
        Update: {
          after?: Json
          before?: Json
          created_at?: string
          editor_user_id?: string | null
          id?: string
          person_id?: string
          reverted_at?: string | null
          reverted_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entry_revisions_editor_user_id_fkey"
            columns: ["editor_user_id"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "entry_revisions_editor_user_id_fkey"
            columns: ["editor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "entry_revisions_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_revisions_reverted_by_fkey"
            columns: ["reverted_by"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "entry_revisions_reverted_by_fkey"
            columns: ["reverted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["auth_user_id"]
          },
        ]
      }
      historical_names: {
        Row: {
          country_code: string | null
          created_at: string
          end_date: string | null
          id: number
          name: string
          place_id: number | null
          source: string
          start_date: string | null
        }
        Insert: {
          country_code?: string | null
          created_at?: string
          end_date?: string | null
          id?: never
          name: string
          place_id?: number | null
          source?: string
          start_date?: string | null
        }
        Update: {
          country_code?: string | null
          created_at?: string
          end_date?: string | null
          id?: never
          name?: string
          place_id?: number | null
          source?: string
          start_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "historical_names_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      invite_requests: {
        Row: {
          created_at: string
          email: string
          email_sent: boolean | null
          first_name: string
          id: string
          invite_id: string | null
          last_name: string
          reviewed_at: string | null
          reviewed_by: string | null
          source: string
          status: string
          tree_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          email_sent?: boolean | null
          first_name: string
          id?: string
          invite_id?: string | null
          last_name: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: string
          status?: string
          tree_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          email_sent?: boolean | null
          first_name?: string
          id?: string
          invite_id?: string | null
          last_name?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: string
          status?: string
          tree_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invite_requests_invite_id_fkey"
            columns: ["invite_id"]
            isOneToOne: false
            referencedRelation: "invites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invite_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "invite_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "invite_requests_tree_id_fkey"
            columns: ["tree_id"]
            isOneToOne: false
            referencedRelation: "my_trees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invite_requests_tree_id_fkey"
            columns: ["tree_id"]
            isOneToOne: false
            referencedRelation: "trees"
            referencedColumns: ["id"]
          },
        ]
      }
      invites: {
        Row: {
          accepted_by_user_id: string | null
          archived_at: string | null
          created_at: string
          created_by: string
          expires_at: string | null
          founds_tree: boolean
          id: string
          invited_email: string | null
          joins_as: string
          person_id: string | null
          status: string
          token: string
          tree_id: string
          updated_at: string
        }
        Insert: {
          accepted_by_user_id?: string | null
          archived_at?: string | null
          created_at?: string
          created_by: string
          expires_at?: string | null
          founds_tree?: boolean
          id?: string
          invited_email?: string | null
          joins_as?: string
          person_id?: string | null
          status?: string
          token?: string
          tree_id: string
          updated_at?: string
        }
        Update: {
          accepted_by_user_id?: string | null
          archived_at?: string | null
          created_at?: string
          created_by?: string
          expires_at?: string | null
          founds_tree?: boolean
          id?: string
          invited_email?: string | null
          joins_as?: string
          person_id?: string | null
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
            foreignKeyName: "invites_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_tree_id_fkey"
            columns: ["tree_id"]
            isOneToOne: false
            referencedRelation: "my_trees"
            referencedColumns: ["id"]
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
      name_nicknames: {
        Row: {
          canonical: string
          id: number
          variant: string
        }
        Insert: {
          canonical: string
          id?: never
          variant: string
        }
        Update: {
          canonical?: string
          id?: never
          variant?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          actor_user_id: string | null
          body: string
          claim_id: string | null
          created_at: string
          id: string
          person_id: string | null
          read_at: string | null
          recipient_user_id: string
          revision_id: string | null
          tree_id: string | null
          type: string
        }
        Insert: {
          actor_user_id?: string | null
          body: string
          claim_id?: string | null
          created_at?: string
          id?: string
          person_id?: string | null
          read_at?: string | null
          recipient_user_id: string
          revision_id?: string | null
          tree_id?: string | null
          type: string
        }
        Update: {
          actor_user_id?: string | null
          body?: string
          claim_id?: string | null
          created_at?: string
          id?: string
          person_id?: string | null
          read_at?: string | null
          recipient_user_id?: string
          revision_id?: string | null
          tree_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "notifications_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "notifications_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "notifications_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "notifications_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "entry_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_tree_id_fkey"
            columns: ["tree_id"]
            isOneToOne: false
            referencedRelation: "my_trees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_tree_id_fkey"
            columns: ["tree_id"]
            isOneToOne: false
            referencedRelation: "trees"
            referencedColumns: ["id"]
          },
        ]
      }
      people: {
        Row: {
          ancestral_lands_birth: string | null
          ancestral_lands_death: string | null
          city_of_birth: string | null
          country_of_birth: string
          created_at: string
          created_by: string
          date_of_birth: string | null
          date_of_birth_precision: string
          date_of_death: string | null
          date_of_death_precision: string
          email: string | null
          email_visible: boolean
          first_name: string | null
          hidden_from_visitors: boolean
          id: string
          is_deceased: boolean
          last_name: string
          lineage_type: string | null
          maiden_name: string | null
          middle_name: string | null
          owner_user_id: string
          photo_crop: Json | null
          photo_path: string | null
          place_id_birth: number | null
          place_id_death: number | null
          place_of_death: string | null
          pos_dx: number | null
          pos_dy: number | null
          pos_x: number | null
          pos_y: number | null
          preferred_name: string | null
          sex: string | null
          tree_id: string
          updated_at: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          ancestral_lands_birth?: string | null
          ancestral_lands_death?: string | null
          city_of_birth?: string | null
          country_of_birth: string
          created_at?: string
          created_by: string
          date_of_birth?: string | null
          date_of_birth_precision?: string
          date_of_death?: string | null
          date_of_death_precision?: string
          email?: string | null
          email_visible?: boolean
          first_name?: string | null
          hidden_from_visitors?: boolean
          id?: string
          is_deceased: boolean
          last_name: string
          lineage_type?: string | null
          maiden_name?: string | null
          middle_name?: string | null
          owner_user_id: string
          photo_crop?: Json | null
          photo_path?: string | null
          place_id_birth?: number | null
          place_id_death?: number | null
          place_of_death?: string | null
          pos_dx?: number | null
          pos_dy?: number | null
          pos_x?: number | null
          pos_y?: number | null
          preferred_name?: string | null
          sex?: string | null
          tree_id: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          ancestral_lands_birth?: string | null
          ancestral_lands_death?: string | null
          city_of_birth?: string | null
          country_of_birth?: string
          created_at?: string
          created_by?: string
          date_of_birth?: string | null
          date_of_birth_precision?: string
          date_of_death?: string | null
          date_of_death_precision?: string
          email?: string | null
          email_visible?: boolean
          first_name?: string | null
          hidden_from_visitors?: boolean
          id?: string
          is_deceased?: boolean
          last_name?: string
          lineage_type?: string | null
          maiden_name?: string | null
          middle_name?: string | null
          owner_user_id?: string
          photo_crop?: Json | null
          photo_path?: string | null
          place_id_birth?: number | null
          place_id_death?: number | null
          place_of_death?: string | null
          pos_dx?: number | null
          pos_dy?: number | null
          pos_x?: number | null
          pos_y?: number | null
          preferred_name?: string | null
          sex?: string | null
          tree_id?: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
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
            foreignKeyName: "people_place_id_birth_fkey"
            columns: ["place_id_birth"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_place_id_death_fkey"
            columns: ["place_id_death"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_tree_id_fkey"
            columns: ["tree_id"]
            isOneToOne: false
            referencedRelation: "my_trees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_tree_id_fkey"
            columns: ["tree_id"]
            isOneToOne: false
            referencedRelation: "trees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "people_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["auth_user_id"]
          },
        ]
      }
      pet_comments: {
        Row: {
          body: string
          created_at: string
          created_by: string
          id: string
          pet_id: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by: string
          id?: string
          pet_id: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string
          id?: string
          pet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pet_comments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "pet_comments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "pet_comments_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
        ]
      }
      pet_companions: {
        Row: {
          created_at: string
          created_by: string
          person_id: string
          pet_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          person_id: string
          pet_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          person_id?: string
          pet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pet_companions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "pet_companions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "pet_companions_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pet_companions_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
        ]
      }
      pets: {
        Row: {
          birth_date: string | null
          city_of_birth: string | null
          country_of_birth: string | null
          created_at: string
          created_by: string
          id: string
          is_deceased: boolean
          name: string
          photo_crop: Json | null
          photo_path: string | null
          place_id_birth: number | null
          pos_dx: number | null
          pos_dy: number | null
          primary_person_id: string | null
          species: string
          species_label: string | null
          tree_id: string
          updated_at: string
          year_born: number | null
          year_died: number | null
        }
        Insert: {
          birth_date?: string | null
          city_of_birth?: string | null
          country_of_birth?: string | null
          created_at?: string
          created_by: string
          id?: string
          is_deceased?: boolean
          name: string
          photo_crop?: Json | null
          photo_path?: string | null
          place_id_birth?: number | null
          pos_dx?: number | null
          pos_dy?: number | null
          primary_person_id?: string | null
          species: string
          species_label?: string | null
          tree_id: string
          updated_at?: string
          year_born?: number | null
          year_died?: number | null
        }
        Update: {
          birth_date?: string | null
          city_of_birth?: string | null
          country_of_birth?: string | null
          created_at?: string
          created_by?: string
          id?: string
          is_deceased?: boolean
          name?: string
          photo_crop?: Json | null
          photo_path?: string | null
          place_id_birth?: number | null
          pos_dx?: number | null
          pos_dy?: number | null
          primary_person_id?: string | null
          species?: string
          species_label?: string | null
          tree_id?: string
          updated_at?: string
          year_born?: number | null
          year_died?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "pets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "pets_place_id_birth_fkey"
            columns: ["place_id_birth"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pets_primary_person_id_fkey"
            columns: ["primary_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pets_tree_id_fkey"
            columns: ["tree_id"]
            isOneToOne: false
            referencedRelation: "my_trees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pets_tree_id_fkey"
            columns: ["tree_id"]
            isOneToOne: false
            referencedRelation: "trees"
            referencedColumns: ["id"]
          },
        ]
      }
      places: {
        Row: {
          admin1_code: string | null
          ascii_name: string | null
          country_code: string | null
          feature_class: string | null
          feature_code: string | null
          id: number
          latitude: number | null
          longitude: number | null
          name: string
          population: number | null
          search_name: string | null
        }
        Insert: {
          admin1_code?: string | null
          ascii_name?: string | null
          country_code?: string | null
          feature_class?: string | null
          feature_code?: string | null
          id: number
          latitude?: number | null
          longitude?: number | null
          name: string
          population?: number | null
          search_name?: string | null
        }
        Update: {
          admin1_code?: string | null
          ascii_name?: string | null
          country_code?: string | null
          feature_class?: string | null
          feature_code?: string | null
          id?: number
          latitude?: number | null
          longitude?: number | null
          name?: string
          population?: number | null
          search_name?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          auth_user_id: string
          created_at: string
          display_name: string | null
          invited_by_user_id: string | null
          role: string
          self_person_id: string | null
          updated_at: string
        }
        Insert: {
          auth_user_id: string
          created_at?: string
          display_name?: string | null
          invited_by_user_id?: string | null
          role?: string
          self_person_id?: string | null
          updated_at?: string
        }
        Update: {
          auth_user_id?: string
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
          divorce_date: string | null
          from_person: string
          id: string
          is_divorced: boolean
          marriage_date: string | null
          to_person: string
          tree_id: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          divorce_date?: string | null
          from_person: string
          id?: string
          is_divorced?: boolean
          marriage_date?: string | null
          to_person: string
          tree_id: string
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          divorce_date?: string | null
          from_person?: string
          id?: string
          is_divorced?: boolean
          marriage_date?: string | null
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
            referencedRelation: "my_trees"
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
      share_links: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          label: string | null
          last_viewed_at: string | null
          revoked_at: string | null
          token: string
          tree_id: string
          updated_at: string
          view_count: number
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          label?: string | null
          last_viewed_at?: string | null
          revoked_at?: string | null
          token?: string
          tree_id: string
          updated_at?: string
          view_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          label?: string | null
          last_viewed_at?: string | null
          revoked_at?: string | null
          token?: string
          tree_id?: string
          updated_at?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "share_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "share_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "share_links_tree_id_fkey"
            columns: ["tree_id"]
            isOneToOne: false
            referencedRelation: "my_trees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "share_links_tree_id_fkey"
            columns: ["tree_id"]
            isOneToOne: false
            referencedRelation: "trees"
            referencedColumns: ["id"]
          },
        ]
      }
      tree_members: {
        Row: {
          created_at: string
          invited_by_user_id: string | null
          role: string
          tree_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          invited_by_user_id?: string | null
          role?: string
          tree_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          invited_by_user_id?: string | null
          role?: string
          tree_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tree_members_invited_by_user_id_fkey"
            columns: ["invited_by_user_id"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "tree_members_invited_by_user_id_fkey"
            columns: ["invited_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "tree_members_tree_id_fkey"
            columns: ["tree_id"]
            isOneToOne: false
            referencedRelation: "my_trees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tree_members_tree_id_fkey"
            columns: ["tree_id"]
            isOneToOne: false
            referencedRelation: "trees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tree_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "tree_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["auth_user_id"]
          },
        ]
      }
      tree_placements: {
        Row: {
          created_at: string
          id: string
          person_id: string
          placed_by: string | null
          pos_dx: number | null
          pos_dy: number | null
          pos_x: number | null
          pos_y: number | null
          responded_at: string | null
          status: string
          tree_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          person_id: string
          placed_by?: string | null
          pos_dx?: number | null
          pos_dy?: number | null
          pos_x?: number | null
          pos_y?: number | null
          responded_at?: string | null
          status?: string
          tree_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          person_id?: string
          placed_by?: string | null
          pos_dx?: number | null
          pos_dy?: number | null
          pos_x?: number | null
          pos_y?: number | null
          responded_at?: string | null
          status?: string
          tree_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tree_placements_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tree_placements_placed_by_fkey"
            columns: ["placed_by"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "tree_placements_placed_by_fkey"
            columns: ["placed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "tree_placements_tree_id_fkey"
            columns: ["tree_id"]
            isOneToOne: false
            referencedRelation: "my_trees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tree_placements_tree_id_fkey"
            columns: ["tree_id"]
            isOneToOne: false
            referencedRelation: "trees"
            referencedColumns: ["id"]
          },
        ]
      }
      tree_visibility: {
        Row: {
          created_at: string
          granted_by: string | null
          tree_id: string
          viewer_tree_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          tree_id: string
          viewer_tree_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          tree_id?: string
          viewer_tree_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tree_visibility_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "tree_visibility_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "tree_visibility_tree_id_fkey"
            columns: ["tree_id"]
            isOneToOne: false
            referencedRelation: "my_trees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tree_visibility_tree_id_fkey"
            columns: ["tree_id"]
            isOneToOne: false
            referencedRelation: "trees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tree_visibility_viewer_tree_id_fkey"
            columns: ["viewer_tree_id"]
            isOneToOne: false
            referencedRelation: "my_trees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tree_visibility_viewer_tree_id_fkey"
            columns: ["viewer_tree_id"]
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
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      member_directory: {
        Row: {
          auth_user_id: string | null
          created_at: string | null
          display_name: string | null
          invited_by_name: string | null
          invited_by_user_id: string | null
          joined_at: string | null
          role: string | null
          self_person_id: string | null
          tree_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_self_person_id_fkey"
            columns: ["self_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tree_members_invited_by_user_id_fkey"
            columns: ["invited_by_user_id"]
            isOneToOne: false
            referencedRelation: "member_directory"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "tree_members_invited_by_user_id_fkey"
            columns: ["invited_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["auth_user_id"]
          },
          {
            foreignKeyName: "tree_members_tree_id_fkey"
            columns: ["tree_id"]
            isOneToOne: false
            referencedRelation: "my_trees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tree_members_tree_id_fkey"
            columns: ["tree_id"]
            isOneToOne: false
            referencedRelation: "trees"
            referencedColumns: ["id"]
          },
        ]
      }
      my_trees: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string | null
          joined_at: string | null
          member_count: number | null
          name: string | null
          person_count: number | null
          role: string | null
          slug: string | null
        }
        Relationships: []
      }
      sibling_edges: {
        Row: {
          person_a: string | null
          person_b: string | null
          tree_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "relationships_to_person_fkey"
            columns: ["person_a"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relationships_to_person_fkey"
            columns: ["person_b"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tree_placements_tree_id_fkey"
            columns: ["tree_id"]
            isOneToOne: false
            referencedRelation: "my_trees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tree_placements_tree_id_fkey"
            columns: ["tree_id"]
            isOneToOne: false
            referencedRelation: "trees"
            referencedColumns: ["id"]
          },
        ]
      }
      tree_edges: {
        Row: {
          created_at: string | null
          created_by: string | null
          divorce_date: string | null
          drawn_on_tree_id: string | null
          from_person: string | null
          id: string | null
          is_divorced: boolean | null
          marriage_date: string | null
          to_person: string | null
          tree_id: string | null
          type: string | null
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
            columns: ["drawn_on_tree_id"]
            isOneToOne: false
            referencedRelation: "my_trees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relationships_tree_id_fkey"
            columns: ["drawn_on_tree_id"]
            isOneToOne: false
            referencedRelation: "trees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tree_placements_tree_id_fkey"
            columns: ["tree_id"]
            isOneToOne: false
            referencedRelation: "my_trees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tree_placements_tree_id_fkey"
            columns: ["tree_id"]
            isOneToOne: false
            referencedRelation: "trees"
            referencedColumns: ["id"]
          },
        ]
      }
      tree_people: {
        Row: {
          ancestral_lands_birth: string | null
          ancestral_lands_death: string | null
          blurred: boolean | null
          city_of_birth: string | null
          country_of_birth: string | null
          created_at: string | null
          created_by: string | null
          date_of_birth: string | null
          date_of_birth_precision: string | null
          date_of_death: string | null
          date_of_death_precision: string | null
          email: string | null
          email_visible: boolean | null
          first_name: string | null
          hidden_from_visitors: boolean | null
          home_tree_id: string | null
          id: string | null
          is_deceased: boolean | null
          is_home: boolean | null
          last_name: string | null
          lineage_type: string | null
          maiden_name: string | null
          middle_name: string | null
          owner_user_id: string | null
          photo_crop: Json | null
          photo_path: string | null
          place_id_birth: number | null
          place_id_death: number | null
          place_of_death: string | null
          placement_id: string | null
          placement_status: string | null
          pos_dx: number | null
          pos_dy: number | null
          pos_x: number | null
          pos_y: number | null
          preferred_name: string | null
          sex: string | null
          tree_id: string | null
          updated_at: string | null
          verified_at: string | null
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
            foreignKeyName: "people_place_id_birth_fkey"
            columns: ["place_id_birth"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_place_id_death_fkey"
            columns: ["place_id_death"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_tree_id_fkey"
            columns: ["home_tree_id"]
            isOneToOne: false
            referencedRelation: "my_trees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_tree_id_fkey"
            columns: ["home_tree_id"]
            isOneToOne: false
            referencedRelation: "trees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tree_placements_person_id_fkey"
            columns: ["id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tree_placements_tree_id_fkey"
            columns: ["tree_id"]
            isOneToOne: false
            referencedRelation: "my_trees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tree_placements_tree_id_fkey"
            columns: ["tree_id"]
            isOneToOne: false
            referencedRelation: "trees"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      add_people_with_connections: {
        Args: {
          p_edges?: Json
          p_people: Json
          p_self_index?: number
          p_suggestions?: Json
          p_tree?: string
        }
        Returns: Json
      }
      admin_delete_member: { Args: { p_user_id: string }; Returns: undefined }
      can_delete_person: { Args: { p_person_id: string }; Returns: boolean }
      can_invite_to_claim: { Args: { p_person_id: string }; Returns: boolean }
      claim_person: { Args: { p_person_id: string }; Returns: Json }
      claim_person_as_self: {
        Args: {
          p_first: string
          p_last: string
          p_person_id: string
          p_tree?: string
        }
        Returns: Json
      }
      connect_people: {
        Args: {
          p_divorce_date?: string
          p_from: string
          p_is_divorced?: boolean
          p_marriage_date?: string
          p_to: string
          p_tree?: string
          p_type: string
        }
        Returns: string
      }
      delete_tree: { Args: { p_tree: string }; Returns: Json }
      dispute_claim: {
        Args: { p_claim_id: string; p_reason?: string }
        Returns: undefined
      }
      ensure_profile: {
        Args: { p_display_name?: string }
        Returns: {
          auth_user_id: string
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
      found_tree: {
        Args: { p_name: string }
        Returns: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          slug: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "trees"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      invite_preview: {
        Args: { p_token: string }
        Returns: {
          claim_person_name: string
          founds_tree: boolean
          inviter_name: string
          joins_as: string
          tree_name: string
          valid: boolean
        }[]
      }
      my_growth_rights: { Args: { p_tree?: string }; Returns: Json }
      person_claim_candidates: {
        Args: never
        Returns: {
          ancestral_lands_birth: string | null
          ancestral_lands_death: string | null
          city_of_birth: string | null
          country_of_birth: string
          created_at: string
          created_by: string
          date_of_birth: string | null
          date_of_birth_precision: string
          date_of_death: string | null
          date_of_death_precision: string
          email: string | null
          email_visible: boolean
          first_name: string | null
          hidden_from_visitors: boolean
          id: string
          is_deceased: boolean
          last_name: string
          lineage_type: string | null
          maiden_name: string | null
          middle_name: string | null
          owner_user_id: string
          photo_crop: Json | null
          photo_path: string | null
          place_id_birth: number | null
          place_id_death: number | null
          place_of_death: string | null
          pos_dx: number | null
          pos_dy: number | null
          pos_x: number | null
          pos_y: number | null
          preferred_name: string | null
          sex: string | null
          tree_id: string
          updated_at: string
          verified_at: string | null
          verified_by: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "people"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      place_people: {
        Args: { p_person_ids: string[]; p_tree: string }
        Returns: {
          placed_person_id: string
          placement_status: string
        }[]
      }
      redeem_invite: {
        Args: { p_display_name?: string; p_token: string }
        Returns: {
          auth_user_id: string
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
      redeem_invite_tree: {
        Args: { p_display_name?: string; p_token: string }
        Returns: Json
      }
      remove_tree_member: {
        Args: { p_tree: string; p_user_id: string }
        Returns: boolean
      }
      rename_tree: {
        Args: { p_name: string; p_tree: string }
        Returns: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          slug: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "trees"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      resolve_claim: {
        Args: { p_action: string; p_claim_id: string }
        Returns: undefined
      }
      resolve_connection_suggestion: {
        Args: { p_id: string; p_resolution: string }
        Returns: undefined
      }
      resolve_entry_flag: {
        Args: { p_comment_id: string; p_resolved?: boolean }
        Returns: undefined
      }
      resolve_implied_connection: {
        Args: {
          p_related: string
          p_resolution: string
          p_source: string
          p_subject: string
          p_type: string
        }
        Returns: undefined
      }
      respond_to_placement: {
        Args: { p_accept: boolean; p_placement_id: string }
        Returns: undefined
      }
      revert_entry_edit: { Args: { p_revision_id: string }; Returns: string[] }
      search_self_candidates: {
        Args: { p_first: string; p_last: string; p_tree?: string }
        Returns: {
          city_of_birth: string
          country_of_birth: string
          date_of_birth: string
          date_of_death: string
          first_name: string
          id: string
          is_deceased: boolean
          last_name: string
          maiden_name: string
          parent_names: string
          preferred_name: string
          score: number
        }[]
      }
      set_entry_verified: {
        Args: { p_person_id: string; p_verified?: boolean }
        Returns: undefined
      }
      set_home_tree: {
        Args: { p_person: string; p_tree: string }
        Returns: undefined
      }
      set_member_role: {
        Args: { p_role: string; p_tree: string; p_user: string }
        Returns: string
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
