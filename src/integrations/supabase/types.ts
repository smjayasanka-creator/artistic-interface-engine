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
      alco_rate_proposal: {
        Row: {
          applied_at: string | null
          applied_by: string | null
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          status: string
          updated_at: string
          workflow_instance_id: string | null
        }
        Insert: {
          applied_at?: string | null
          applied_by?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          status?: string
          updated_at?: string
          workflow_instance_id?: string | null
        }
        Update: {
          applied_at?: string | null
          applied_by?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          status?: string
          updated_at?: string
          workflow_instance_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alco_rate_proposal_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alco_rate_proposal_workflow_instance_id_fkey"
            columns: ["workflow_instance_id"]
            isOneToOne: false
            referencedRelation: "workflow_instance"
            referencedColumns: ["id"]
          },
        ]
      }
      alco_rate_proposal_item: {
        Row: {
          created_at: string
          id: string
          new_cbsl_max_rate: number | null
          new_maximum_rate: number | null
          new_standard_rate: number | null
          old_cbsl_max_rate: number | null
          old_maximum_rate: number | null
          old_standard_rate: number | null
          product_id: string
          proposal_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          new_cbsl_max_rate?: number | null
          new_maximum_rate?: number | null
          new_standard_rate?: number | null
          old_cbsl_max_rate?: number | null
          old_maximum_rate?: number | null
          old_standard_rate?: number | null
          product_id: string
          proposal_id: string
        }
        Update: {
          created_at?: string
          id?: string
          new_cbsl_max_rate?: number | null
          new_maximum_rate?: number | null
          new_standard_rate?: number | null
          old_cbsl_max_rate?: number | null
          old_maximum_rate?: number | null
          old_standard_rate?: number | null
          product_id?: string
          proposal_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alco_rate_proposal_item_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "fd_product"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alco_rate_proposal_item_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "alco_rate_proposal"
            referencedColumns: ["id"]
          },
        ]
      }
      api_key: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          environment: string
          id: string
          key_hash: string
          key_prefix: string
          label: string
          last_used_at: string | null
          revoked_at: string | null
          scopes: string[]
          status: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          environment?: string
          id?: string
          key_hash: string
          key_prefix: string
          label: string
          last_used_at?: string | null
          revoked_at?: string | null
          scopes?: string[]
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          environment?: string
          id?: string
          key_hash?: string
          key_prefix?: string
          label?: string
          last_used_at?: string | null
          revoked_at?: string | null
          scopes?: string[]
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_key_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      api_transaction_log: {
        Row: {
          api_key_id: string | null
          channel: string
          company_id: string | null
          created_at: string
          direction: string
          endpoint: string
          error: string | null
          id: string
          method: string
          reference: string | null
          request: Json | null
          response: Json | null
          status_code: number | null
        }
        Insert: {
          api_key_id?: string | null
          channel: string
          company_id?: string | null
          created_at?: string
          direction: string
          endpoint: string
          error?: string | null
          id?: string
          method: string
          reference?: string | null
          request?: Json | null
          response?: Json | null
          status_code?: number | null
        }
        Update: {
          api_key_id?: string | null
          channel?: string
          company_id?: string | null
          created_at?: string
          direction?: string
          endpoint?: string
          error?: string | null
          id?: string
          method?: string
          reference?: string | null
          request?: Json | null
          response?: Json | null
          status_code?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "api_transaction_log_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_key"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_transaction_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_role: string | null
          actor_user_id: string | null
          after_data: Json | null
          before_data: Json | null
          company_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: unknown
          metadata: Json
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_role?: string | null
          actor_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          company_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: unknown
          metadata?: Json
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_role?: string | null
          actor_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          company_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: unknown
          metadata?: Json
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      bank: {
        Row: {
          active: boolean
          cefts_enabled: boolean
          code: string
          created_at: string
          id: string
          name: string
          slips_enabled: boolean
          updated_at: string
        }
        Insert: {
          active?: boolean
          cefts_enabled?: boolean
          code: string
          created_at?: string
          id?: string
          name: string
          slips_enabled?: boolean
          updated_at?: string
        }
        Update: {
          active?: boolean
          cefts_enabled?: boolean
          code?: string
          created_at?: string
          id?: string
          name?: string
          slips_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      bank_branch: {
        Row: {
          active: boolean
          address: string | null
          bank_id: string
          city: string | null
          code: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          bank_id: string
          city?: string | null
          code: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          bank_id?: string
          city?: string | null
          code?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_branch_bank_id_fkey"
            columns: ["bank_id"]
            isOneToOne: false
            referencedRelation: "bank"
            referencedColumns: ["id"]
          },
        ]
      }
      branch: {
        Row: {
          auto_eod: boolean
          branch_prefix: string | null
          code: string
          company_id: string
          created_at: string
          currency: string
          eod_locked_through: string | null
          fd_prefix: string | null
          id: string
          loan_prefix: string | null
          name: string
          opened_on: string | null
          region: string | null
          savings_prefix: string | null
        }
        Insert: {
          auto_eod?: boolean
          branch_prefix?: string | null
          code: string
          company_id: string
          created_at?: string
          currency?: string
          eod_locked_through?: string | null
          fd_prefix?: string | null
          id?: string
          loan_prefix?: string | null
          name: string
          opened_on?: string | null
          region?: string | null
          savings_prefix?: string | null
        }
        Update: {
          auto_eod?: boolean
          branch_prefix?: string | null
          code?: string
          company_id?: string
          created_at?: string
          currency?: string
          eod_locked_through?: string | null
          fd_prefix?: string | null
          id?: string
          loan_prefix?: string | null
          name?: string
          opened_on?: string | null
          region?: string | null
          savings_prefix?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "branch_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      client: {
        Row: {
          address: string | null
          avatar_color: string | null
          branch_id: string
          created_at: string
          date_of_birth: string | null
          default_commission_amount: number | null
          default_commission_pct: number | null
          district: string | null
          divisional_secretariat: string | null
          email: string | null
          entity_type: string
          external_client_id: string | null
          external_person_id: string | null
          first_name: string | null
          full_name: string
          gender: string | null
          geo_lat: number | null
          geo_lng: number | null
          gn_division: string | null
          group_id: string | null
          id: string
          is_introducer: boolean
          joined_on: string | null
          last_name: string | null
          monthly_income: number | null
          national_id: string | null
          next_of_kin_name: string | null
          next_of_kin_phone: string | null
          occupation: string | null
          officer_id: string | null
          phone: string | null
          phone_country_code: string | null
          photo_url: string | null
          province: string | null
          residency: string
          risk_grade: Database["public"]["Enums"]["risk_grade"] | null
          status: Database["public"]["Enums"]["client_status"]
        }
        Insert: {
          address?: string | null
          avatar_color?: string | null
          branch_id: string
          created_at?: string
          date_of_birth?: string | null
          default_commission_amount?: number | null
          default_commission_pct?: number | null
          district?: string | null
          divisional_secretariat?: string | null
          email?: string | null
          entity_type?: string
          external_client_id?: string | null
          external_person_id?: string | null
          first_name?: string | null
          full_name: string
          gender?: string | null
          geo_lat?: number | null
          geo_lng?: number | null
          gn_division?: string | null
          group_id?: string | null
          id?: string
          is_introducer?: boolean
          joined_on?: string | null
          last_name?: string | null
          monthly_income?: number | null
          national_id?: string | null
          next_of_kin_name?: string | null
          next_of_kin_phone?: string | null
          occupation?: string | null
          officer_id?: string | null
          phone?: string | null
          phone_country_code?: string | null
          photo_url?: string | null
          province?: string | null
          residency?: string
          risk_grade?: Database["public"]["Enums"]["risk_grade"] | null
          status?: Database["public"]["Enums"]["client_status"]
        }
        Update: {
          address?: string | null
          avatar_color?: string | null
          branch_id?: string
          created_at?: string
          date_of_birth?: string | null
          default_commission_amount?: number | null
          default_commission_pct?: number | null
          district?: string | null
          divisional_secretariat?: string | null
          email?: string | null
          entity_type?: string
          external_client_id?: string | null
          external_person_id?: string | null
          first_name?: string | null
          full_name?: string
          gender?: string | null
          geo_lat?: number | null
          geo_lng?: number | null
          gn_division?: string | null
          group_id?: string | null
          id?: string
          is_introducer?: boolean
          joined_on?: string | null
          last_name?: string | null
          monthly_income?: number | null
          national_id?: string | null
          next_of_kin_name?: string | null
          next_of_kin_phone?: string | null
          occupation?: string | null
          officer_id?: string | null
          phone?: string | null
          phone_country_code?: string | null
          photo_url?: string | null
          province?: string | null
          residency?: string
          risk_grade?: Database["public"]["Enums"]["risk_grade"] | null
          status?: Database["public"]["Enums"]["client_status"]
        }
        Relationships: [
          {
            foreignKeyName: "client_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branch"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "lending_group"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_officer_id_fkey"
            columns: ["officer_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      client_bank_account: {
        Row: {
          account_name: string
          account_no: string
          bank_name: string
          branch_name: string | null
          client_id: string
          created_at: string
          id: string
          is_primary: boolean
          swift_code: string | null
          updated_at: string
        }
        Insert: {
          account_name: string
          account_no: string
          bank_name: string
          branch_name?: string | null
          client_id: string
          created_at?: string
          id?: string
          is_primary?: boolean
          swift_code?: string | null
          updated_at?: string
        }
        Update: {
          account_name?: string
          account_no?: string
          bank_name?: string
          branch_name?: string | null
          client_id?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          swift_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_bank_account_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
        ]
      }
      client_risk_assessment: {
        Row: {
          answers: Json
          assessed_at: string
          assessed_by: string | null
          band: Database["public"]["Enums"]["risk_band_level"]
          client_id: string
          company_id: string
          created_at: string
          id: string
          max_score: number
          pct: number
          total_score: number
          updated_at: string
        }
        Insert: {
          answers?: Json
          assessed_at?: string
          assessed_by?: string | null
          band: Database["public"]["Enums"]["risk_band_level"]
          client_id: string
          company_id: string
          created_at?: string
          id?: string
          max_score: number
          pct: number
          total_score: number
          updated_at?: string
        }
        Update: {
          answers?: Json
          assessed_at?: string
          assessed_by?: string | null
          band?: Database["public"]["Enums"]["risk_band_level"]
          client_id?: string
          company_id?: string
          created_at?: string
          id?: string
          max_score?: number
          pct?: number
          total_score?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_risk_assessment_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_risk_assessment_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      company: {
        Row: {
          auto_eod_enabled: boolean
          auto_eod_time: string
          country: string
          created_at: string
          currency: string
          fy_end_day: number
          fy_end_month: number
          id: string
          is_active: boolean
          name: string
          owner_user_id: string | null
          slug: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          auto_eod_enabled?: boolean
          auto_eod_time?: string
          country?: string
          created_at?: string
          currency?: string
          fy_end_day?: number
          fy_end_month?: number
          id?: string
          is_active?: boolean
          name: string
          owner_user_id?: string | null
          slug?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          auto_eod_enabled?: boolean
          auto_eod_time?: string
          country?: string
          created_at?: string
          currency?: string
          fy_end_day?: number
          fy_end_month?: number
          id?: string
          is_active?: boolean
          name?: string
          owner_user_id?: string | null
          slug?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      company_invite: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          branch_id: string | null
          company_id: string
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["staff_role"]
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          branch_id?: string | null
          company_id: string
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["staff_role"]
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          branch_id?: string | null
          company_id?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["staff_role"]
        }
        Relationships: [
          {
            foreignKeyName: "company_invite_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branch"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_invite_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      company_subscription: {
        Row: {
          billing_cycle: string
          company_id: string
          created_at: string
          currency: string
          current_period_end: string | null
          id: string
          mrr: number
          notes: string | null
          plan_id: string
          seats: number
          started_on: string
          status: string
          trial_ends_on: string | null
          updated_at: string
        }
        Insert: {
          billing_cycle?: string
          company_id: string
          created_at?: string
          currency?: string
          current_period_end?: string | null
          id?: string
          mrr?: number
          notes?: string | null
          plan_id: string
          seats?: number
          started_on?: string
          status?: string
          trial_ends_on?: string | null
          updated_at?: string
        }
        Update: {
          billing_cycle?: string
          company_id?: string
          created_at?: string
          currency?: string
          current_period_end?: string | null
          id?: string
          mrr?: number
          notes?: string | null
          plan_id?: string
          seats?: number
          started_on?: string
          status?: string
          trial_ends_on?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_subscription_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_subscription_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plan"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_no_seq: {
        Row: {
          branch_id: string
          company_id: string
          last_no: number
          product_id: string
          segment: number
        }
        Insert: {
          branch_id: string
          company_id: string
          last_no?: number
          product_id: string
          segment: number
        }
        Update: {
          branch_id?: string
          company_id?: string
          last_no?: number
          product_id?: string
          segment?: number
        }
        Relationships: [
          {
            foreignKeyName: "contract_no_seq_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branch"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_no_seq_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_role: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_role_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_role_permission: {
        Row: {
          created_at: string
          permission_code: string
          role_id: string
        }
        Insert: {
          created_at?: string
          permission_code: string
          role_id: string
        }
        Update: {
          created_at?: string
          permission_code?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_role_permission_permission_code_fkey"
            columns: ["permission_code"]
            isOneToOne: false
            referencedRelation: "permission"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "custom_role_permission_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "custom_role"
            referencedColumns: ["id"]
          },
        ]
      }
      delegation_authority: {
        Row: {
          active: boolean
          amount_max: number
          amount_min: number
          company_id: string
          created_at: string
          id: string
          ltv_max: number
          ltv_min: number
          name: string
          rate_max: number
          rate_min: number
          security_type_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          amount_max?: number
          amount_min?: number
          company_id: string
          created_at?: string
          id?: string
          ltv_max?: number
          ltv_min?: number
          name: string
          rate_max?: number
          rate_min?: number
          security_type_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          amount_max?: number
          amount_min?: number
          company_id?: string
          created_at?: string
          id?: string
          ltv_max?: number
          ltv_min?: number
          name?: string
          rate_max?: number
          rate_min?: number
          security_type_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delegation_authority_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delegation_authority_security_type_id_fkey"
            columns: ["security_type_id"]
            isOneToOne: false
            referencedRelation: "security_type"
            referencedColumns: ["id"]
          },
        ]
      }
      delegation_authority_delegate: {
        Row: {
          authority_id: string
          created_at: string
          from_date: string
          from_user_id: string
          id: string
          reason: string | null
          to_date: string
          to_user_id: string
        }
        Insert: {
          authority_id: string
          created_at?: string
          from_date: string
          from_user_id: string
          id?: string
          reason?: string | null
          to_date: string
          to_user_id: string
        }
        Update: {
          authority_id?: string
          created_at?: string
          from_date?: string
          from_user_id?: string
          id?: string
          reason?: string | null
          to_date?: string
          to_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delegation_authority_delegate_authority_id_fkey"
            columns: ["authority_id"]
            isOneToOne: false
            referencedRelation: "delegation_authority_master"
            referencedColumns: ["id"]
          },
        ]
      }
      delegation_authority_master: {
        Row: {
          code: string
          company_id: string
          created_at: string
          created_by: string | null
          description: string | null
          effective_from: string
          effective_to: string | null
          id: string
          level: number
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          code: string
          company_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          level?: number
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          code?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          level?: number
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delegation_authority_master_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      delegation_authority_member: {
        Row: {
          authority_id: string
          created_at: string
          id: string
          is_backup: boolean
          member_ref: string
          member_type: string
        }
        Insert: {
          authority_id: string
          created_at?: string
          id?: string
          is_backup?: boolean
          member_ref: string
          member_type: string
        }
        Update: {
          authority_id?: string
          created_at?: string
          id?: string
          is_backup?: boolean
          member_ref?: string
          member_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "delegation_authority_member_authority_id_fkey"
            columns: ["authority_id"]
            isOneToOne: false
            referencedRelation: "delegation_authority_master"
            referencedColumns: ["id"]
          },
        ]
      }
      delegation_rule: {
        Row: {
          active: boolean
          amount_max: number | null
          amount_min: number | null
          branch_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          custom_role_id: string | null
          effective_from: string
          effective_to: string | null
          id: string
          name: string
          priority: number
          product_id: string | null
          rate_max: number | null
          rate_min: number | null
          region: string | null
          risk_grade: string | null
          rule_scope: string
          security_type_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          amount_max?: number | null
          amount_min?: number | null
          branch_id?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          custom_role_id?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          name: string
          priority?: number
          product_id?: string | null
          rate_max?: number | null
          rate_min?: number | null
          region?: string | null
          risk_grade?: string | null
          rule_scope: string
          security_type_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          amount_max?: number | null
          amount_min?: number | null
          branch_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          custom_role_id?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          name?: string
          priority?: number
          product_id?: string | null
          rate_max?: number | null
          rate_min?: number | null
          region?: string | null
          risk_grade?: string | null
          rule_scope?: string
          security_type_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delegation_rule_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branch"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delegation_rule_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delegation_rule_custom_role_id_fkey"
            columns: ["custom_role_id"]
            isOneToOne: false
            referencedRelation: "custom_role"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delegation_rule_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "loan_product"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delegation_rule_security_type_id_fkey"
            columns: ["security_type_id"]
            isOneToOne: false
            referencedRelation: "security_type"
            referencedColumns: ["id"]
          },
        ]
      }
      delegation_rule_step: {
        Row: {
          authority_id: string
          created_at: string
          escalate_to_authority_id: string | null
          id: string
          mode: string
          required_approvals: number
          rule_id: string
          seq: number
          sla_hours: number | null
        }
        Insert: {
          authority_id: string
          created_at?: string
          escalate_to_authority_id?: string | null
          id?: string
          mode?: string
          required_approvals?: number
          rule_id: string
          seq: number
          sla_hours?: number | null
        }
        Update: {
          authority_id?: string
          created_at?: string
          escalate_to_authority_id?: string | null
          id?: string
          mode?: string
          required_approvals?: number
          rule_id?: string
          seq?: number
          sla_hours?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "delegation_rule_step_authority_id_fkey"
            columns: ["authority_id"]
            isOneToOne: false
            referencedRelation: "delegation_authority_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delegation_rule_step_escalate_to_authority_id_fkey"
            columns: ["escalate_to_authority_id"]
            isOneToOne: false
            referencedRelation: "delegation_authority_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delegation_rule_step_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "delegation_rule"
            referencedColumns: ["id"]
          },
        ]
      }
      domain_event: {
        Row: {
          actor_user_id: string | null
          aggregate_id: string
          aggregate_type: string
          attempt_count: number
          company_id: string | null
          created_at: string
          dispatch_attempts: number
          dispatched_at: string | null
          domain: string
          event_type: string
          id: string
          idempotency_key: string | null
          last_dispatch_error: string | null
          last_error: string | null
          metadata: Json
          next_attempt_at: string
          occurred_at: string
          payload: Json
          status: Database["public"]["Enums"]["domain_event_status"]
        }
        Insert: {
          actor_user_id?: string | null
          aggregate_id: string
          aggregate_type: string
          attempt_count?: number
          company_id?: string | null
          created_at?: string
          dispatch_attempts?: number
          dispatched_at?: string | null
          domain: string
          event_type: string
          id?: string
          idempotency_key?: string | null
          last_dispatch_error?: string | null
          last_error?: string | null
          metadata?: Json
          next_attempt_at?: string
          occurred_at?: string
          payload?: Json
          status?: Database["public"]["Enums"]["domain_event_status"]
        }
        Update: {
          actor_user_id?: string | null
          aggregate_id?: string
          aggregate_type?: string
          attempt_count?: number
          company_id?: string | null
          created_at?: string
          dispatch_attempts?: number
          dispatched_at?: string | null
          domain?: string
          event_type?: string
          id?: string
          idempotency_key?: string | null
          last_dispatch_error?: string | null
          last_error?: string | null
          metadata?: Json
          next_attempt_at?: string
          occurred_at?: string
          payload?: Json
          status?: Database["public"]["Enums"]["domain_event_status"]
        }
        Relationships: [
          {
            foreignKeyName: "domain_event_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      eod_run: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          branch_id: string
          business_date: string
          closed_at: string
          closed_by: string | null
          company_id: string
          completed_at: string | null
          duration_ms: number | null
          fd_deposits: number
          gl_accounts: number
          id: string
          initiated_at: string | null
          initiated_by: string | null
          loans: number
          note: string | null
          pre_check: Json
          reports: Json
          savings_accounts: number
          started_at: string | null
          status: string
          steps: Json
          warnings: Json
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          branch_id: string
          business_date: string
          closed_at?: string
          closed_by?: string | null
          company_id: string
          completed_at?: string | null
          duration_ms?: number | null
          fd_deposits?: number
          gl_accounts?: number
          id?: string
          initiated_at?: string | null
          initiated_by?: string | null
          loans?: number
          note?: string | null
          pre_check?: Json
          reports?: Json
          savings_accounts?: number
          started_at?: string | null
          status?: string
          steps?: Json
          warnings?: Json
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          branch_id?: string
          business_date?: string
          closed_at?: string
          closed_by?: string | null
          company_id?: string
          completed_at?: string | null
          duration_ms?: number | null
          fd_deposits?: number
          gl_accounts?: number
          id?: string
          initiated_at?: string | null
          initiated_by?: string | null
          loans?: number
          note?: string | null
          pre_check?: Json
          reports?: Json
          savings_accounts?: number
          started_at?: string | null
          status?: string
          steps?: Json
          warnings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "eod_run_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branch"
            referencedColumns: ["id"]
          },
        ]
      }
      eod_step_log: {
        Row: {
          actor_user_id: string | null
          duration_ms: number | null
          ended_at: string | null
          error: string | null
          id: string
          metrics: Json
          run_id: string
          started_at: string
          status: string
          step_key: string
        }
        Insert: {
          actor_user_id?: string | null
          duration_ms?: number | null
          ended_at?: string | null
          error?: string | null
          id?: string
          metrics?: Json
          run_id: string
          started_at?: string
          status: string
          step_key: string
        }
        Update: {
          actor_user_id?: string | null
          duration_ms?: number | null
          ended_at?: string | null
          error?: string | null
          id?: string
          metrics?: Json
          run_id?: string
          started_at?: string
          status?: string
          step_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "eod_step_log_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "eod_run"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluation_section: {
        Row: {
          active: boolean
          code: string
          company_id: string | null
          component_name: string
          created_at: string
          description: string | null
          display_order: number
          fields: Json
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          company_id?: string | null
          component_name?: string
          created_at?: string
          description?: string | null
          display_order?: number
          fields?: Json
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          company_id?: string | null
          component_name?: string
          created_at?: string
          description?: string | null
          display_order?: number
          fields?: Json
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "evaluation_section_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      fd_accrual: {
        Row: {
          accrual_date: string
          cumulative_amount: number
          daily_amount: number
          deposit_id: string
          id: string
          released_at: string | null
          released_ref: string | null
        }
        Insert: {
          accrual_date: string
          cumulative_amount: number
          daily_amount: number
          deposit_id: string
          id?: string
          released_at?: string | null
          released_ref?: string | null
        }
        Update: {
          accrual_date?: string
          cumulative_amount?: number
          daily_amount?: number
          deposit_id?: string
          id?: string
          released_at?: string | null
          released_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fd_accrual_deposit_id_fkey"
            columns: ["deposit_id"]
            isOneToOne: false
            referencedRelation: "fixed_deposit"
            referencedColumns: ["id"]
          },
        ]
      }
      fd_alco_rate: {
        Row: {
          active: boolean
          cbsl_max_rate: number | null
          company_id: string
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          maximum_rate: number | null
          note: string | null
          product_id: string
          standard_rate: number | null
          superseded_by: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          cbsl_max_rate?: number | null
          company_id: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          maximum_rate?: number | null
          note?: string | null
          product_id: string
          standard_rate?: number | null
          superseded_by?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          cbsl_max_rate?: number | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          maximum_rate?: number | null
          note?: string | null
          product_id?: string
          standard_rate?: number | null
          superseded_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fd_alco_rate_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fd_alco_rate_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "fd_product"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fd_alco_rate_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "fd_alco_rate"
            referencedColumns: ["id"]
          },
        ]
      }
      fd_eod_balance: {
        Row: {
          accrued_interest: number
          branch_id: string
          business_date: string
          closing_balance: number
          company_id: string
          created_at: string
          deposit_id: string
          interest_paid: number
          principal: number
          status: string
        }
        Insert: {
          accrued_interest?: number
          branch_id: string
          business_date: string
          closing_balance?: number
          company_id: string
          created_at?: string
          deposit_id: string
          interest_paid?: number
          principal?: number
          status: string
        }
        Update: {
          accrued_interest?: number
          branch_id?: string
          business_date?: string
          closing_balance?: number
          company_id?: string
          created_at?: string
          deposit_id?: string
          interest_paid?: number
          principal?: number
          status?: string
        }
        Relationships: []
      }
      fd_eod_balance_202606: {
        Row: {
          accrued_interest: number
          branch_id: string
          business_date: string
          closing_balance: number
          company_id: string
          created_at: string
          deposit_id: string
          interest_paid: number
          principal: number
          status: string
        }
        Insert: {
          accrued_interest?: number
          branch_id: string
          business_date: string
          closing_balance?: number
          company_id: string
          created_at?: string
          deposit_id: string
          interest_paid?: number
          principal?: number
          status: string
        }
        Update: {
          accrued_interest?: number
          branch_id?: string
          business_date?: string
          closing_balance?: number
          company_id?: string
          created_at?: string
          deposit_id?: string
          interest_paid?: number
          principal?: number
          status?: string
        }
        Relationships: []
      }
      fd_eod_balance_202607: {
        Row: {
          accrued_interest: number
          branch_id: string
          business_date: string
          closing_balance: number
          company_id: string
          created_at: string
          deposit_id: string
          interest_paid: number
          principal: number
          status: string
        }
        Insert: {
          accrued_interest?: number
          branch_id: string
          business_date: string
          closing_balance?: number
          company_id: string
          created_at?: string
          deposit_id: string
          interest_paid?: number
          principal?: number
          status: string
        }
        Update: {
          accrued_interest?: number
          branch_id?: string
          business_date?: string
          closing_balance?: number
          company_id?: string
          created_at?: string
          deposit_id?: string
          interest_paid?: number
          principal?: number
          status?: string
        }
        Relationships: []
      }
      fd_eod_balance_202608: {
        Row: {
          accrued_interest: number
          branch_id: string
          business_date: string
          closing_balance: number
          company_id: string
          created_at: string
          deposit_id: string
          interest_paid: number
          principal: number
          status: string
        }
        Insert: {
          accrued_interest?: number
          branch_id: string
          business_date: string
          closing_balance?: number
          company_id: string
          created_at?: string
          deposit_id: string
          interest_paid?: number
          principal?: number
          status: string
        }
        Update: {
          accrued_interest?: number
          branch_id?: string
          business_date?: string
          closing_balance?: number
          company_id?: string
          created_at?: string
          deposit_id?: string
          interest_paid?: number
          principal?: number
          status?: string
        }
        Relationships: []
      }
      fd_eod_balance_202609: {
        Row: {
          accrued_interest: number
          branch_id: string
          business_date: string
          closing_balance: number
          company_id: string
          created_at: string
          deposit_id: string
          interest_paid: number
          principal: number
          status: string
        }
        Insert: {
          accrued_interest?: number
          branch_id: string
          business_date: string
          closing_balance?: number
          company_id: string
          created_at?: string
          deposit_id: string
          interest_paid?: number
          principal?: number
          status: string
        }
        Update: {
          accrued_interest?: number
          branch_id?: string
          business_date?: string
          closing_balance?: number
          company_id?: string
          created_at?: string
          deposit_id?: string
          interest_paid?: number
          principal?: number
          status?: string
        }
        Relationships: []
      }
      fd_interest_schedule: {
        Row: {
          deposit_id: string
          due_date: string
          gross_interest: number
          id: string
          net_interest: number
          paid: boolean
          paid_date: string | null
          seq: number
          wht_amount: number
        }
        Insert: {
          deposit_id: string
          due_date: string
          gross_interest: number
          id?: string
          net_interest: number
          paid?: boolean
          paid_date?: string | null
          seq: number
          wht_amount: number
        }
        Update: {
          deposit_id?: string
          due_date?: string
          gross_interest?: number
          id?: string
          net_interest?: number
          paid?: boolean
          paid_date?: string | null
          seq?: number
          wht_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "fd_interest_schedule_deposit_id_fkey"
            columns: ["deposit_id"]
            isOneToOne: false
            referencedRelation: "fixed_deposit"
            referencedColumns: ["id"]
          },
        ]
      }
      fd_nominee: {
        Row: {
          client_id: string | null
          deposit_id: string
          id: string
          name: string
          nic: string | null
          percentage: number
          relationship: string | null
        }
        Insert: {
          client_id?: string | null
          deposit_id: string
          id?: string
          name: string
          nic?: string | null
          percentage: number
          relationship?: string | null
        }
        Update: {
          client_id?: string | null
          deposit_id?: string
          id?: string
          name?: string
          nic?: string | null
          percentage?: number
          relationship?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fd_nominee_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fd_nominee_deposit_id_fkey"
            columns: ["deposit_id"]
            isOneToOne: false
            referencedRelation: "fixed_deposit"
            referencedColumns: ["id"]
          },
        ]
      }
      fd_number_seq: {
        Row: {
          company_id: string
          last_no: number
          period: string
        }
        Insert: {
          company_id: string
          last_no?: number
          period: string
        }
        Update: {
          company_id?: string
          last_no?: number
          period?: string
        }
        Relationships: [
          {
            foreignKeyName: "fd_number_seq_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      fd_product: {
        Row: {
          active: boolean
          allow_at_maturity: boolean
          allow_monthly: boolean
          auto_renewal_default: Database["public"]["Enums"]["fd_maturity_instruction"]
          capital_account_id: string | null
          cash_account_id: string | null
          cbsl_max_rate: number | null
          code: string
          company_id: string
          created_at: string
          deposit_liability_account_id: string | null
          id: string
          interest_expense_account_id: string | null
          interest_payable_account_id: string | null
          introducer_commission_account_id: string | null
          marketing_incentive_account_id: string | null
          max_amount: number | null
          max_tenure_months: number
          maximum_rate: number | null
          min_amount: number
          min_tenure_months: number
          name: string
          penalty_type: Database["public"]["Enums"]["fd_penalty_type"]
          penalty_value: number
          standard_rate: number | null
          unclaimed_deposit_liability_account_id: string | null
          updated_at: string
          wht_liability_account_id: string | null
          wht_payable_account_id: string | null
          wht_rate: number
        }
        Insert: {
          active?: boolean
          allow_at_maturity?: boolean
          allow_monthly?: boolean
          auto_renewal_default?: Database["public"]["Enums"]["fd_maturity_instruction"]
          capital_account_id?: string | null
          cash_account_id?: string | null
          cbsl_max_rate?: number | null
          code: string
          company_id: string
          created_at?: string
          deposit_liability_account_id?: string | null
          id?: string
          interest_expense_account_id?: string | null
          interest_payable_account_id?: string | null
          introducer_commission_account_id?: string | null
          marketing_incentive_account_id?: string | null
          max_amount?: number | null
          max_tenure_months?: number
          maximum_rate?: number | null
          min_amount?: number
          min_tenure_months?: number
          name: string
          penalty_type?: Database["public"]["Enums"]["fd_penalty_type"]
          penalty_value?: number
          standard_rate?: number | null
          unclaimed_deposit_liability_account_id?: string | null
          updated_at?: string
          wht_liability_account_id?: string | null
          wht_payable_account_id?: string | null
          wht_rate?: number
        }
        Update: {
          active?: boolean
          allow_at_maturity?: boolean
          allow_monthly?: boolean
          auto_renewal_default?: Database["public"]["Enums"]["fd_maturity_instruction"]
          capital_account_id?: string | null
          cash_account_id?: string | null
          cbsl_max_rate?: number | null
          code?: string
          company_id?: string
          created_at?: string
          deposit_liability_account_id?: string | null
          id?: string
          interest_expense_account_id?: string | null
          interest_payable_account_id?: string | null
          introducer_commission_account_id?: string | null
          marketing_incentive_account_id?: string | null
          max_amount?: number | null
          max_tenure_months?: number
          maximum_rate?: number | null
          min_amount?: number
          min_tenure_months?: number
          name?: string
          penalty_type?: Database["public"]["Enums"]["fd_penalty_type"]
          penalty_value?: number
          standard_rate?: number | null
          unclaimed_deposit_liability_account_id?: string | null
          updated_at?: string
          wht_liability_account_id?: string | null
          wht_payable_account_id?: string | null
          wht_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "fd_product_capital_account_id_fkey"
            columns: ["capital_account_id"]
            isOneToOne: false
            referencedRelation: "gl_account"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fd_product_cash_account_id_fkey"
            columns: ["cash_account_id"]
            isOneToOne: false
            referencedRelation: "gl_account"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fd_product_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fd_product_deposit_liability_account_id_fkey"
            columns: ["deposit_liability_account_id"]
            isOneToOne: false
            referencedRelation: "gl_account"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fd_product_interest_expense_account_id_fkey"
            columns: ["interest_expense_account_id"]
            isOneToOne: false
            referencedRelation: "gl_account"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fd_product_interest_payable_account_id_fkey"
            columns: ["interest_payable_account_id"]
            isOneToOne: false
            referencedRelation: "gl_account"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fd_product_introducer_commission_account_id_fkey"
            columns: ["introducer_commission_account_id"]
            isOneToOne: false
            referencedRelation: "gl_account"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fd_product_marketing_incentive_account_id_fkey"
            columns: ["marketing_incentive_account_id"]
            isOneToOne: false
            referencedRelation: "gl_account"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fd_product_unclaimed_deposit_liability_account_id_fkey"
            columns: ["unclaimed_deposit_liability_account_id"]
            isOneToOne: false
            referencedRelation: "gl_account"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fd_product_wht_liability_account_id_fkey"
            columns: ["wht_liability_account_id"]
            isOneToOne: false
            referencedRelation: "gl_account"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fd_product_wht_payable_account_id_fkey"
            columns: ["wht_payable_account_id"]
            isOneToOne: false
            referencedRelation: "gl_account"
            referencedColumns: ["id"]
          },
        ]
      }
      fd_rate_tier: {
        Row: {
          annual_rate: number
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          note: string | null
          product_id: string
          superseded_by: string | null
          tenure_months: number
        }
        Insert: {
          annual_rate: number
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          note?: string | null
          product_id: string
          superseded_by?: string | null
          tenure_months: number
        }
        Update: {
          annual_rate?: number
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          note?: string | null
          product_id?: string
          superseded_by?: string | null
          tenure_months?: number
        }
        Relationships: [
          {
            foreignKeyName: "fd_rate_tier_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "fd_product"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fd_rate_tier_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "fd_rate_tier"
            referencedColumns: ["id"]
          },
        ]
      }
      fd_transaction: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          deposit_id: string
          id: string
          idempotency_key: string | null
          reference: string | null
          txn_date: string
          type: Database["public"]["Enums"]["fd_txn_type"]
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          deposit_id: string
          id?: string
          idempotency_key?: string | null
          reference?: string | null
          txn_date: string
          type: Database["public"]["Enums"]["fd_txn_type"]
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          deposit_id?: string
          id?: string
          idempotency_key?: string | null
          reference?: string | null
          txn_date?: string
          type?: Database["public"]["Enums"]["fd_txn_type"]
        }
        Relationships: [
          {
            foreignKeyName: "fd_transaction_deposit_id_fkey"
            columns: ["deposit_id"]
            isOneToOne: false
            referencedRelation: "fixed_deposit"
            referencedColumns: ["id"]
          },
        ]
      }
      fixed_deposit: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          branch_id: string
          certificate_no: string
          client_id: string
          close_reason: string | null
          closed_at: string | null
          company_id: string
          created_at: string
          created_by: string | null
          dispatch_option: Database["public"]["Enums"]["fd_dispatch_option"]
          id: string
          idempotency_key: string | null
          interest_payment_mode: Database["public"]["Enums"]["fd_interest_payment_mode"]
          interest_savings_account_id: string | null
          introducer_commission_amount: number | null
          introducer_commission_payment_mode:
            | Database["public"]["Enums"]["introducer_commission_mode"]
            | null
          introducer_id: string | null
          marketing_officer_id: string | null
          maturity_date: string
          maturity_instruction: Database["public"]["Enums"]["fd_maturity_instruction"]
          parent_fd_id: string | null
          payout_bank_account_id: string | null
          payout_option: Database["public"]["Enums"]["fd_payout_option"]
          principal: number
          product_id: string
          rate_at_booking: number
          settlement_account: string | null
          status: Database["public"]["Enums"]["fd_status"]
          tenure_months: number
          updated_at: string
          value_date: string
          wht_rate_at_booking: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          branch_id: string
          certificate_no: string
          client_id: string
          close_reason?: string | null
          closed_at?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          dispatch_option?: Database["public"]["Enums"]["fd_dispatch_option"]
          id?: string
          idempotency_key?: string | null
          interest_payment_mode?: Database["public"]["Enums"]["fd_interest_payment_mode"]
          interest_savings_account_id?: string | null
          introducer_commission_amount?: number | null
          introducer_commission_payment_mode?:
            | Database["public"]["Enums"]["introducer_commission_mode"]
            | null
          introducer_id?: string | null
          marketing_officer_id?: string | null
          maturity_date: string
          maturity_instruction: Database["public"]["Enums"]["fd_maturity_instruction"]
          parent_fd_id?: string | null
          payout_bank_account_id?: string | null
          payout_option: Database["public"]["Enums"]["fd_payout_option"]
          principal: number
          product_id: string
          rate_at_booking: number
          settlement_account?: string | null
          status?: Database["public"]["Enums"]["fd_status"]
          tenure_months: number
          updated_at?: string
          value_date: string
          wht_rate_at_booking: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          branch_id?: string
          certificate_no?: string
          client_id?: string
          close_reason?: string | null
          closed_at?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          dispatch_option?: Database["public"]["Enums"]["fd_dispatch_option"]
          id?: string
          idempotency_key?: string | null
          interest_payment_mode?: Database["public"]["Enums"]["fd_interest_payment_mode"]
          interest_savings_account_id?: string | null
          introducer_commission_amount?: number | null
          introducer_commission_payment_mode?:
            | Database["public"]["Enums"]["introducer_commission_mode"]
            | null
          introducer_id?: string | null
          marketing_officer_id?: string | null
          maturity_date?: string
          maturity_instruction?: Database["public"]["Enums"]["fd_maturity_instruction"]
          parent_fd_id?: string | null
          payout_bank_account_id?: string | null
          payout_option?: Database["public"]["Enums"]["fd_payout_option"]
          principal?: number
          product_id?: string
          rate_at_booking?: number
          settlement_account?: string | null
          status?: Database["public"]["Enums"]["fd_status"]
          tenure_months?: number
          updated_at?: string
          value_date?: string
          wht_rate_at_booking?: number
        }
        Relationships: [
          {
            foreignKeyName: "fixed_deposit_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branch"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_deposit_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_deposit_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_deposit_interest_savings_account_id_fkey"
            columns: ["interest_savings_account_id"]
            isOneToOne: false
            referencedRelation: "savings_account"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_deposit_introducer_id_fkey"
            columns: ["introducer_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_deposit_marketing_officer_id_fkey"
            columns: ["marketing_officer_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_deposit_parent_fd_id_fkey"
            columns: ["parent_fd_id"]
            isOneToOne: false
            referencedRelation: "fixed_deposit"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_deposit_payout_bank_account_id_fkey"
            columns: ["payout_bank_account_id"]
            isOneToOne: false
            referencedRelation: "client_bank_account"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_deposit_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "fd_product"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_deposit_settlement_account_fkey"
            columns: ["settlement_account"]
            isOneToOne: false
            referencedRelation: "gl_account"
            referencedColumns: ["id"]
          },
        ]
      }
      fx_rate: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          from_currency: string
          id: string
          note: string | null
          rate: number
          rate_type: string
          source: string | null
          to_currency: string
          updated_at: string
          valid_from: string
          valid_to: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          from_currency: string
          id?: string
          note?: string | null
          rate: number
          rate_type?: string
          source?: string | null
          to_currency: string
          updated_at?: string
          valid_from?: string
          valid_to?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          from_currency?: string
          id?: string
          note?: string | null
          rate?: number
          rate_type?: string
          source?: string | null
          to_currency?: string
          updated_at?: string
          valid_from?: string
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fx_rate_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      gl_account: {
        Row: {
          branch_ids: string[] | null
          code: string
          company_id: string
          id: string
          is_active: boolean
          name: string
          normal_balance: number
          subcategory: string | null
          type: Database["public"]["Enums"]["account_type"]
        }
        Insert: {
          branch_ids?: string[] | null
          code: string
          company_id: string
          id?: string
          is_active?: boolean
          name: string
          normal_balance: number
          subcategory?: string | null
          type: Database["public"]["Enums"]["account_type"]
        }
        Update: {
          branch_ids?: string[] | null
          code?: string
          company_id?: string
          id?: string
          is_active?: boolean
          name?: string
          normal_balance?: number
          subcategory?: string | null
          type?: Database["public"]["Enums"]["account_type"]
        }
        Relationships: [
          {
            foreignKeyName: "gl_account_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      gl_eod_balance: {
        Row: {
          account_id: string
          branch_id: string
          business_date: string
          closing_balance: number
          company_id: string
          created_at: string
          credit_total: number
          debit_total: number
          opening_balance: number
        }
        Insert: {
          account_id: string
          branch_id: string
          business_date: string
          closing_balance?: number
          company_id: string
          created_at?: string
          credit_total?: number
          debit_total?: number
          opening_balance?: number
        }
        Update: {
          account_id?: string
          branch_id?: string
          business_date?: string
          closing_balance?: number
          company_id?: string
          created_at?: string
          credit_total?: number
          debit_total?: number
          opening_balance?: number
        }
        Relationships: []
      }
      gl_eod_balance_202606: {
        Row: {
          account_id: string
          branch_id: string
          business_date: string
          closing_balance: number
          company_id: string
          created_at: string
          credit_total: number
          debit_total: number
          opening_balance: number
        }
        Insert: {
          account_id: string
          branch_id: string
          business_date: string
          closing_balance?: number
          company_id: string
          created_at?: string
          credit_total?: number
          debit_total?: number
          opening_balance?: number
        }
        Update: {
          account_id?: string
          branch_id?: string
          business_date?: string
          closing_balance?: number
          company_id?: string
          created_at?: string
          credit_total?: number
          debit_total?: number
          opening_balance?: number
        }
        Relationships: []
      }
      gl_eod_balance_202607: {
        Row: {
          account_id: string
          branch_id: string
          business_date: string
          closing_balance: number
          company_id: string
          created_at: string
          credit_total: number
          debit_total: number
          opening_balance: number
        }
        Insert: {
          account_id: string
          branch_id: string
          business_date: string
          closing_balance?: number
          company_id: string
          created_at?: string
          credit_total?: number
          debit_total?: number
          opening_balance?: number
        }
        Update: {
          account_id?: string
          branch_id?: string
          business_date?: string
          closing_balance?: number
          company_id?: string
          created_at?: string
          credit_total?: number
          debit_total?: number
          opening_balance?: number
        }
        Relationships: []
      }
      gl_eod_balance_202608: {
        Row: {
          account_id: string
          branch_id: string
          business_date: string
          closing_balance: number
          company_id: string
          created_at: string
          credit_total: number
          debit_total: number
          opening_balance: number
        }
        Insert: {
          account_id: string
          branch_id: string
          business_date: string
          closing_balance?: number
          company_id: string
          created_at?: string
          credit_total?: number
          debit_total?: number
          opening_balance?: number
        }
        Update: {
          account_id?: string
          branch_id?: string
          business_date?: string
          closing_balance?: number
          company_id?: string
          created_at?: string
          credit_total?: number
          debit_total?: number
          opening_balance?: number
        }
        Relationships: []
      }
      gl_eod_balance_202609: {
        Row: {
          account_id: string
          branch_id: string
          business_date: string
          closing_balance: number
          company_id: string
          created_at: string
          credit_total: number
          debit_total: number
          opening_balance: number
        }
        Insert: {
          account_id: string
          branch_id: string
          business_date: string
          closing_balance?: number
          company_id: string
          created_at?: string
          credit_total?: number
          debit_total?: number
          opening_balance?: number
        }
        Update: {
          account_id?: string
          branch_id?: string
          business_date?: string
          closing_balance?: number
          company_id?: string
          created_at?: string
          credit_total?: number
          debit_total?: number
          opening_balance?: number
        }
        Relationships: []
      }
      hardening_checklist_item: {
        Row: {
          created_at: string
          item_id: string
          note: string | null
          owner: string | null
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          item_id: string
          note?: string | null
          owner?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          item_id?: string
          note?: string | null
          owner?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      journal_entry: {
        Row: {
          branch_id: string
          created_at: string
          description: string | null
          entry_date: string
          id: string
          idempotency_key: string | null
          loan_id: string | null
          posted_by: string | null
          reference: string
          source_module: string | null
          source_ref: string | null
        }
        Insert: {
          branch_id: string
          created_at?: string
          description?: string | null
          entry_date?: string
          id?: string
          idempotency_key?: string | null
          loan_id?: string | null
          posted_by?: string | null
          reference: string
          source_module?: string | null
          source_ref?: string | null
        }
        Update: {
          branch_id?: string
          created_at?: string
          description?: string | null
          entry_date?: string
          id?: string
          idempotency_key?: string | null
          loan_id?: string | null
          posted_by?: string | null
          reference?: string
          source_module?: string | null
          source_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_entry_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branch"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entry_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loan"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entry_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "v_loan_outstanding"
            referencedColumns: ["loan_id"]
          },
          {
            foreignKeyName: "journal_entry_posted_by_fkey"
            columns: ["posted_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      lending_group: {
        Row: {
          branch_id: string
          color: string | null
          created_at: string
          cycle: number
          id: string
          leader_client_id: string | null
          meeting_day: string | null
          meeting_place: string | null
          name: string
          officer_id: string | null
          target_today: number
        }
        Insert: {
          branch_id: string
          color?: string | null
          created_at?: string
          cycle?: number
          id?: string
          leader_client_id?: string | null
          meeting_day?: string | null
          meeting_place?: string | null
          name: string
          officer_id?: string | null
          target_today?: number
        }
        Update: {
          branch_id?: string
          color?: string | null
          created_at?: string
          cycle?: number
          id?: string
          leader_client_id?: string | null
          meeting_day?: string | null
          meeting_place?: string | null
          name?: string
          officer_id?: string | null
          target_today?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_group_leader"
            columns: ["leader_client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lending_group_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branch"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lending_group_officer_id_fkey"
            columns: ["officer_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      loan: {
        Row: {
          annual_rate_pct: number
          application_id: string | null
          application_no: string | null
          approved_at: string | null
          approved_by: string | null
          branch_id: string
          client_id: string
          closed_at: string | null
          contract_no: string | null
          created_at: string
          disbursed_at: string | null
          disbursement_channel: string | null
          disbursement_entry_id: string | null
          disbursement_reference: string | null
          frequency: Database["public"]["Enums"]["repayment_frequency"]
          id: string
          idempotency_key: string | null
          net_disbursed: number | null
          officer_id: string | null
          principal: number
          product_id: string
          purpose: string | null
          schedule_overrides: Json | null
          schedule_type: string
          status: Database["public"]["Enums"]["loan_status"]
          submitted_at: string | null
          term_months: number
        }
        Insert: {
          annual_rate_pct: number
          application_id?: string | null
          application_no?: string | null
          approved_at?: string | null
          approved_by?: string | null
          branch_id: string
          client_id: string
          closed_at?: string | null
          contract_no?: string | null
          created_at?: string
          disbursed_at?: string | null
          disbursement_channel?: string | null
          disbursement_entry_id?: string | null
          disbursement_reference?: string | null
          frequency?: Database["public"]["Enums"]["repayment_frequency"]
          id?: string
          idempotency_key?: string | null
          net_disbursed?: number | null
          officer_id?: string | null
          principal: number
          product_id: string
          purpose?: string | null
          schedule_overrides?: Json | null
          schedule_type?: string
          status?: Database["public"]["Enums"]["loan_status"]
          submitted_at?: string | null
          term_months: number
        }
        Update: {
          annual_rate_pct?: number
          application_id?: string | null
          application_no?: string | null
          approved_at?: string | null
          approved_by?: string | null
          branch_id?: string
          client_id?: string
          closed_at?: string | null
          contract_no?: string | null
          created_at?: string
          disbursed_at?: string | null
          disbursement_channel?: string | null
          disbursement_entry_id?: string | null
          disbursement_reference?: string | null
          frequency?: Database["public"]["Enums"]["repayment_frequency"]
          id?: string
          idempotency_key?: string | null
          net_disbursed?: number | null
          officer_id?: string | null
          principal?: number
          product_id?: string
          purpose?: string | null
          schedule_overrides?: Json | null
          schedule_type?: string
          status?: Database["public"]["Enums"]["loan_status"]
          submitted_at?: string | null
          term_months?: number
        }
        Relationships: [
          {
            foreignKeyName: "loan_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "loan_application"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branch"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_officer_id_fkey"
            columns: ["officer_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "loan_product"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_accrual: {
        Row: {
          accrual_date: string
          company_id: string
          created_at: string
          cumulative_amount: number
          daily_amount: number
          entry_id: string | null
          id: string
          loan_id: string
          outstanding_principal: number
        }
        Insert: {
          accrual_date: string
          company_id: string
          created_at?: string
          cumulative_amount: number
          daily_amount: number
          entry_id?: string | null
          id?: string
          loan_id: string
          outstanding_principal: number
        }
        Update: {
          accrual_date?: string
          company_id?: string
          created_at?: string
          cumulative_amount?: number
          daily_amount?: number
          entry_id?: string | null
          id?: string
          loan_id?: string
          outstanding_principal?: number
        }
        Relationships: [
          {
            foreignKeyName: "loan_accrual_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_accrual_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entry"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_accrual_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loan"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_accrual_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "v_loan_outstanding"
            referencedColumns: ["loan_id"]
          },
        ]
      }
      loan_alco_rate: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          equipment_vehicle: string | null
          id: string
          max_period_months: number
          max_rate: number
          min_period_months: number
          min_rate: number
          note: string | null
          product_id: string
          security_type_id: string | null
          superseded_by: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          equipment_vehicle?: string | null
          id?: string
          max_period_months: number
          max_rate: number
          min_period_months: number
          min_rate: number
          note?: string | null
          product_id: string
          security_type_id?: string | null
          superseded_by?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          equipment_vehicle?: string | null
          id?: string
          max_period_months?: number
          max_rate?: number
          min_period_months?: number
          min_rate?: number
          note?: string | null
          product_id?: string
          security_type_id?: string | null
          superseded_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loan_alco_rate_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_alco_rate_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "loan_product"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_alco_rate_security_type_id_fkey"
            columns: ["security_type_id"]
            isOneToOne: false
            referencedRelation: "security_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_alco_rate_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "loan_alco_rate"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_alco_rate_proposal: {
        Row: {
          active: boolean
          applied_at: string | null
          applied_by: string | null
          company_id: string
          created_at: string
          created_by: string
          effective_from: string
          equipment_vehicle: string | null
          id: string
          max_period_months: number
          max_rate: number
          min_period_months: number
          min_rate: number
          note: string | null
          product_id: string
          security_type_id: string | null
          status: string
          updated_at: string
          workflow_instance_id: string | null
        }
        Insert: {
          active?: boolean
          applied_at?: string | null
          applied_by?: string | null
          company_id: string
          created_at?: string
          created_by: string
          effective_from?: string
          equipment_vehicle?: string | null
          id?: string
          max_period_months: number
          max_rate: number
          min_period_months: number
          min_rate: number
          note?: string | null
          product_id: string
          security_type_id?: string | null
          status?: string
          updated_at?: string
          workflow_instance_id?: string | null
        }
        Update: {
          active?: boolean
          applied_at?: string | null
          applied_by?: string | null
          company_id?: string
          created_at?: string
          created_by?: string
          effective_from?: string
          equipment_vehicle?: string | null
          id?: string
          max_period_months?: number
          max_rate?: number
          min_period_months?: number
          min_rate?: number
          note?: string | null
          product_id?: string
          security_type_id?: string | null
          status?: string
          updated_at?: string
          workflow_instance_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loan_alco_rate_proposal_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "loan_product"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_alco_rate_proposal_security_type_id_fkey"
            columns: ["security_type_id"]
            isOneToOne: false
            referencedRelation: "security_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_alco_rate_proposal_workflow_instance_id_fkey"
            columns: ["workflow_instance_id"]
            isOneToOne: false
            referencedRelation: "workflow_instance"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_application: {
        Row: {
          application_no: string
          branch_id: string
          channel: string | null
          client_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          currency: string
          decided_at: string | null
          disbursed_at: string | null
          frequency: Database["public"]["Enums"]["repayment_frequency"] | null
          id: string
          loan_id: string | null
          metadata: Json
          officer_id: string | null
          product_id: string | null
          purpose: string | null
          requested_principal: number
          requested_rate_pct: number | null
          requested_tenor_months: number
          status: Database["public"]["Enums"]["loan_application_status"]
          submitted_at: string | null
          updated_at: string
          workflow_instance_id: string | null
        }
        Insert: {
          application_no?: string
          branch_id: string
          channel?: string | null
          client_id?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          decided_at?: string | null
          disbursed_at?: string | null
          frequency?: Database["public"]["Enums"]["repayment_frequency"] | null
          id?: string
          loan_id?: string | null
          metadata?: Json
          officer_id?: string | null
          product_id?: string | null
          purpose?: string | null
          requested_principal?: number
          requested_rate_pct?: number | null
          requested_tenor_months?: number
          status?: Database["public"]["Enums"]["loan_application_status"]
          submitted_at?: string | null
          updated_at?: string
          workflow_instance_id?: string | null
        }
        Update: {
          application_no?: string
          branch_id?: string
          channel?: string | null
          client_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          decided_at?: string | null
          disbursed_at?: string | null
          frequency?: Database["public"]["Enums"]["repayment_frequency"] | null
          id?: string
          loan_id?: string | null
          metadata?: Json
          officer_id?: string | null
          product_id?: string | null
          purpose?: string | null
          requested_principal?: number
          requested_rate_pct?: number | null
          requested_tenor_months?: number
          status?: Database["public"]["Enums"]["loan_application_status"]
          submitted_at?: string | null
          updated_at?: string
          workflow_instance_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loan_application_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branch"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_application_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_application_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_application_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loan"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_application_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "v_loan_outstanding"
            referencedColumns: ["loan_id"]
          },
          {
            foreignKeyName: "loan_application_officer_id_fkey"
            columns: ["officer_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_application_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "loan_product"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_application_workflow_instance_id_fkey"
            columns: ["workflow_instance_id"]
            isOneToOne: false
            referencedRelation: "workflow_instance"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_application_applicant: {
        Row: {
          address: string | null
          application_id: string
          application_no: string
          client_id: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          national_id: string | null
          phone: string | null
          role: string
          snapshot: Json
          updated_at: string
        }
        Insert: {
          address?: string | null
          application_id: string
          application_no: string
          client_id?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          national_id?: string | null
          phone?: string | null
          role?: string
          snapshot?: Json
          updated_at?: string
        }
        Update: {
          address?: string | null
          application_id?: string
          application_no?: string
          client_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          national_id?: string | null
          phone?: string | null
          role?: string
          snapshot?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loan_application_applicant_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "loan_application"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_application_applicant_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_application_approval: {
        Row: {
          application_id: string
          application_no: string
          comment: string | null
          decided_at: string
          decided_by: string | null
          decision: string
          id: string
          metadata: Json
          step_key: string | null
          transition_key: string | null
          workflow_instance_id: string | null
        }
        Insert: {
          application_id: string
          application_no: string
          comment?: string | null
          decided_at?: string
          decided_by?: string | null
          decision: string
          id?: string
          metadata?: Json
          step_key?: string | null
          transition_key?: string | null
          workflow_instance_id?: string | null
        }
        Update: {
          application_id?: string
          application_no?: string
          comment?: string | null
          decided_at?: string
          decided_by?: string | null
          decision?: string
          id?: string
          metadata?: Json
          step_key?: string | null
          transition_key?: string | null
          workflow_instance_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loan_application_approval_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "loan_application"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_application_approval_workflow_instance_id_fkey"
            columns: ["workflow_instance_id"]
            isOneToOne: false
            referencedRelation: "workflow_instance"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_application_business: {
        Row: {
          application_id: string
          application_no: string
          business_address: string | null
          business_name: string | null
          created_at: string
          extra: Json
          id: string
          monthly_turnover: number | null
          ownership_type: string | null
          registration_no: string | null
          sector: string | null
          updated_at: string
          years_in_operation: number | null
        }
        Insert: {
          application_id: string
          application_no: string
          business_address?: string | null
          business_name?: string | null
          created_at?: string
          extra?: Json
          id?: string
          monthly_turnover?: number | null
          ownership_type?: string | null
          registration_no?: string | null
          sector?: string | null
          updated_at?: string
          years_in_operation?: number | null
        }
        Update: {
          application_id?: string
          application_no?: string
          business_address?: string | null
          business_name?: string | null
          created_at?: string
          extra?: Json
          id?: string
          monthly_turnover?: number | null
          ownership_type?: string | null
          registration_no?: string | null
          sector?: string | null
          updated_at?: string
          years_in_operation?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "loan_application_business_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "loan_application"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_application_collateral: {
        Row: {
          application_id: string
          application_no: string
          created_at: string
          documents: Json
          id: string
          notes: string | null
          security_type_id: string | null
          updated_at: string
          values: Json
        }
        Insert: {
          application_id: string
          application_no: string
          created_at?: string
          documents?: Json
          id?: string
          notes?: string | null
          security_type_id?: string | null
          updated_at?: string
          values?: Json
        }
        Update: {
          application_id?: string
          application_no?: string
          created_at?: string
          documents?: Json
          id?: string
          notes?: string | null
          security_type_id?: string | null
          updated_at?: string
          values?: Json
        }
        Relationships: [
          {
            foreignKeyName: "loan_application_collateral_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "loan_application"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_application_collateral_security_type_id_fkey"
            columns: ["security_type_id"]
            isOneToOne: false
            referencedRelation: "security_type"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_application_document: {
        Row: {
          application_id: string
          application_no: string
          document_type: string
          file_name: string
          id: string
          mime_type: string | null
          size_bytes: number | null
          storage_bucket: string
          storage_path: string
          uploaded_at: string
          uploaded_by: string | null
          version: number
        }
        Insert: {
          application_id: string
          application_no: string
          document_type: string
          file_name: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_bucket?: string
          storage_path: string
          uploaded_at?: string
          uploaded_by?: string | null
          version?: number
        }
        Update: {
          application_id?: string
          application_no?: string
          document_type?: string
          file_name?: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_bucket?: string
          storage_path?: string
          uploaded_at?: string
          uploaded_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "loan_application_document_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "loan_application"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_application_employment: {
        Row: {
          application_id: string
          application_no: string
          created_at: string
          employer_address: string | null
          employer_name: string | null
          employer_phone: string | null
          employment_type: string | null
          extra: Json
          id: string
          monthly_income: number | null
          position: string | null
          updated_at: string
          years_of_service: number | null
        }
        Insert: {
          application_id: string
          application_no: string
          created_at?: string
          employer_address?: string | null
          employer_name?: string | null
          employer_phone?: string | null
          employment_type?: string | null
          extra?: Json
          id?: string
          monthly_income?: number | null
          position?: string | null
          updated_at?: string
          years_of_service?: number | null
        }
        Update: {
          application_id?: string
          application_no?: string
          created_at?: string
          employer_address?: string | null
          employer_name?: string | null
          employer_phone?: string | null
          employment_type?: string | null
          extra?: Json
          id?: string
          monthly_income?: number | null
          position?: string | null
          updated_at?: string
          years_of_service?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "loan_application_employment_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "loan_application"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_application_evaluation: {
        Row: {
          application_id: string
          application_no: string
          created_at: string
          data: Json
          id: string
          product_snapshot: Json | null
          updated_at: string
        }
        Insert: {
          application_id: string
          application_no: string
          created_at?: string
          data?: Json
          id?: string
          product_snapshot?: Json | null
          updated_at?: string
        }
        Update: {
          application_id?: string
          application_no?: string
          created_at?: string
          data?: Json
          id?: string
          product_snapshot?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loan_application_evaluation_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "loan_application"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_application_existing_facility: {
        Row: {
          application_id: string
          application_no: string
          created_at: string
          extra: Json
          facility_type: string | null
          id: string
          lender_name: string
          maturity_date: string | null
          monthly_instalment: number | null
          original_amount: number | null
          outstanding_balance: number | null
          status: string | null
          updated_at: string
        }
        Insert: {
          application_id: string
          application_no: string
          created_at?: string
          extra?: Json
          facility_type?: string | null
          id?: string
          lender_name: string
          maturity_date?: string | null
          monthly_instalment?: number | null
          original_amount?: number | null
          outstanding_balance?: number | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          application_id?: string
          application_no?: string
          created_at?: string
          extra?: Json
          facility_type?: string | null
          id?: string
          lender_name?: string
          maturity_date?: string | null
          monthly_instalment?: number | null
          original_amount?: number | null
          outstanding_balance?: number | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loan_application_existing_facility_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "loan_application"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_application_guarantor: {
        Row: {
          application_id: string
          application_no: string
          coverage_amount: number | null
          created_at: string
          extra: Json
          full_name: string
          guarantor_client_id: string | null
          id: string
          national_id: string | null
          phone: string | null
          relationship: string | null
          updated_at: string
        }
        Insert: {
          application_id: string
          application_no: string
          coverage_amount?: number | null
          created_at?: string
          extra?: Json
          full_name: string
          guarantor_client_id?: string | null
          id?: string
          national_id?: string | null
          phone?: string | null
          relationship?: string | null
          updated_at?: string
        }
        Update: {
          application_id?: string
          application_no?: string
          coverage_amount?: number | null
          created_at?: string
          extra?: Json
          full_name?: string
          guarantor_client_id?: string | null
          id?: string
          national_id?: string | null
          phone?: string | null
          relationship?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loan_application_guarantor_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "loan_application"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_application_guarantor_guarantor_client_id_fkey"
            columns: ["guarantor_client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_application_note: {
        Row: {
          application_id: string
          application_no: string
          author_id: string | null
          created_at: string
          id: string
          note: string
        }
        Insert: {
          application_id: string
          application_no: string
          author_id?: string | null
          created_at?: string
          id?: string
          note: string
        }
        Update: {
          application_id?: string
          application_no?: string
          author_id?: string | null
          created_at?: string
          id?: string
          note?: string
        }
        Relationships: [
          {
            foreignKeyName: "loan_application_note_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "loan_application"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_application_status_history: {
        Row: {
          actor_id: string | null
          application_id: string
          application_no: string
          created_at: string
          from_status:
            | Database["public"]["Enums"]["loan_application_status"]
            | null
          id: string
          reason: string | null
          to_status: Database["public"]["Enums"]["loan_application_status"]
          transition_key: string | null
        }
        Insert: {
          actor_id?: string | null
          application_id: string
          application_no: string
          created_at?: string
          from_status?:
            | Database["public"]["Enums"]["loan_application_status"]
            | null
          id?: string
          reason?: string | null
          to_status: Database["public"]["Enums"]["loan_application_status"]
          transition_key?: string | null
        }
        Update: {
          actor_id?: string | null
          application_id?: string
          application_no?: string
          created_at?: string
          from_status?:
            | Database["public"]["Enums"]["loan_application_status"]
            | null
          id?: string
          reason?: string | null
          to_status?: Database["public"]["Enums"]["loan_application_status"]
          transition_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loan_application_status_history_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "loan_application"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_applied_charge: {
        Row: {
          amount: number
          capitalize: boolean
          charge_id: string
          created_at: string
          id: string
          loan_id: string
          supplier_client_id: string | null
        }
        Insert: {
          amount?: number
          capitalize?: boolean
          charge_id: string
          created_at?: string
          id?: string
          loan_id: string
          supplier_client_id?: string | null
        }
        Update: {
          amount?: number
          capitalize?: boolean
          charge_id?: string
          created_at?: string
          id?: string
          loan_id?: string
          supplier_client_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loan_applied_charge_charge_id_fkey"
            columns: ["charge_id"]
            isOneToOne: false
            referencedRelation: "loan_charge"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_applied_charge_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loan"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_applied_charge_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "v_loan_outstanding"
            referencedColumns: ["loan_id"]
          },
          {
            foreignKeyName: "loan_applied_charge_supplier_client_id_fkey"
            columns: ["supplier_client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_charge: {
        Row: {
          active: boolean
          amount: number
          capitalize: boolean
          capitalized_receivable_account_id: string | null
          charge_type: Database["public"]["Enums"]["loan_charge_type"]
          company_id: string
          created_at: string
          created_by: string | null
          credit_account_id: string
          id: string
          name: string
          origin: Database["public"]["Enums"]["loan_charge_origin"]
          receivable_account_id: string
          supplier_client_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          amount?: number
          capitalize?: boolean
          capitalized_receivable_account_id?: string | null
          charge_type?: Database["public"]["Enums"]["loan_charge_type"]
          company_id: string
          created_at?: string
          created_by?: string | null
          credit_account_id: string
          id?: string
          name: string
          origin?: Database["public"]["Enums"]["loan_charge_origin"]
          receivable_account_id: string
          supplier_client_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          amount?: number
          capitalize?: boolean
          capitalized_receivable_account_id?: string | null
          charge_type?: Database["public"]["Enums"]["loan_charge_type"]
          company_id?: string
          created_at?: string
          created_by?: string | null
          credit_account_id?: string
          id?: string
          name?: string
          origin?: Database["public"]["Enums"]["loan_charge_origin"]
          receivable_account_id?: string
          supplier_client_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loan_charge_capitalized_receivable_account_id_fkey"
            columns: ["capitalized_receivable_account_id"]
            isOneToOne: false
            referencedRelation: "gl_account"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_charge_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_charge_credit_account_id_fkey"
            columns: ["credit_account_id"]
            isOneToOne: false
            referencedRelation: "gl_account"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_charge_receivable_account_id_fkey"
            columns: ["receivable_account_id"]
            isOneToOne: false
            referencedRelation: "gl_account"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_charge_supplier_client_id_fkey"
            columns: ["supplier_client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_charge_product: {
        Row: {
          charge_id: string
          product_id: string
        }
        Insert: {
          charge_id: string
          product_id: string
        }
        Update: {
          charge_id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loan_charge_product_charge_id_fkey"
            columns: ["charge_id"]
            isOneToOne: false
            referencedRelation: "loan_charge"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_charge_product_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "loan_product"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_eod_balance: {
        Row: {
          arrears: number
          branch_id: string
          business_date: string
          closing_principal: number
          company_id: string
          created_at: string
          disbursed: number
          fees_paid: number
          interest_accrued: number
          interest_paid: number
          loan_id: string
          opening_principal: number
          principal_paid: number
          status: string
        }
        Insert: {
          arrears?: number
          branch_id: string
          business_date: string
          closing_principal?: number
          company_id: string
          created_at?: string
          disbursed?: number
          fees_paid?: number
          interest_accrued?: number
          interest_paid?: number
          loan_id: string
          opening_principal?: number
          principal_paid?: number
          status: string
        }
        Update: {
          arrears?: number
          branch_id?: string
          business_date?: string
          closing_principal?: number
          company_id?: string
          created_at?: string
          disbursed?: number
          fees_paid?: number
          interest_accrued?: number
          interest_paid?: number
          loan_id?: string
          opening_principal?: number
          principal_paid?: number
          status?: string
        }
        Relationships: []
      }
      loan_eod_balance_202606: {
        Row: {
          arrears: number
          branch_id: string
          business_date: string
          closing_principal: number
          company_id: string
          created_at: string
          disbursed: number
          fees_paid: number
          interest_accrued: number
          interest_paid: number
          loan_id: string
          opening_principal: number
          principal_paid: number
          status: string
        }
        Insert: {
          arrears?: number
          branch_id: string
          business_date: string
          closing_principal?: number
          company_id: string
          created_at?: string
          disbursed?: number
          fees_paid?: number
          interest_accrued?: number
          interest_paid?: number
          loan_id: string
          opening_principal?: number
          principal_paid?: number
          status: string
        }
        Update: {
          arrears?: number
          branch_id?: string
          business_date?: string
          closing_principal?: number
          company_id?: string
          created_at?: string
          disbursed?: number
          fees_paid?: number
          interest_accrued?: number
          interest_paid?: number
          loan_id?: string
          opening_principal?: number
          principal_paid?: number
          status?: string
        }
        Relationships: []
      }
      loan_eod_balance_202607: {
        Row: {
          arrears: number
          branch_id: string
          business_date: string
          closing_principal: number
          company_id: string
          created_at: string
          disbursed: number
          fees_paid: number
          interest_accrued: number
          interest_paid: number
          loan_id: string
          opening_principal: number
          principal_paid: number
          status: string
        }
        Insert: {
          arrears?: number
          branch_id: string
          business_date: string
          closing_principal?: number
          company_id: string
          created_at?: string
          disbursed?: number
          fees_paid?: number
          interest_accrued?: number
          interest_paid?: number
          loan_id: string
          opening_principal?: number
          principal_paid?: number
          status: string
        }
        Update: {
          arrears?: number
          branch_id?: string
          business_date?: string
          closing_principal?: number
          company_id?: string
          created_at?: string
          disbursed?: number
          fees_paid?: number
          interest_accrued?: number
          interest_paid?: number
          loan_id?: string
          opening_principal?: number
          principal_paid?: number
          status?: string
        }
        Relationships: []
      }
      loan_eod_balance_202608: {
        Row: {
          arrears: number
          branch_id: string
          business_date: string
          closing_principal: number
          company_id: string
          created_at: string
          disbursed: number
          fees_paid: number
          interest_accrued: number
          interest_paid: number
          loan_id: string
          opening_principal: number
          principal_paid: number
          status: string
        }
        Insert: {
          arrears?: number
          branch_id: string
          business_date: string
          closing_principal?: number
          company_id: string
          created_at?: string
          disbursed?: number
          fees_paid?: number
          interest_accrued?: number
          interest_paid?: number
          loan_id: string
          opening_principal?: number
          principal_paid?: number
          status: string
        }
        Update: {
          arrears?: number
          branch_id?: string
          business_date?: string
          closing_principal?: number
          company_id?: string
          created_at?: string
          disbursed?: number
          fees_paid?: number
          interest_accrued?: number
          interest_paid?: number
          loan_id?: string
          opening_principal?: number
          principal_paid?: number
          status?: string
        }
        Relationships: []
      }
      loan_eod_balance_202609: {
        Row: {
          arrears: number
          branch_id: string
          business_date: string
          closing_principal: number
          company_id: string
          created_at: string
          disbursed: number
          fees_paid: number
          interest_accrued: number
          interest_paid: number
          loan_id: string
          opening_principal: number
          principal_paid: number
          status: string
        }
        Insert: {
          arrears?: number
          branch_id: string
          business_date: string
          closing_principal?: number
          company_id: string
          created_at?: string
          disbursed?: number
          fees_paid?: number
          interest_accrued?: number
          interest_paid?: number
          loan_id: string
          opening_principal?: number
          principal_paid?: number
          status: string
        }
        Update: {
          arrears?: number
          branch_id?: string
          business_date?: string
          closing_principal?: number
          company_id?: string
          created_at?: string
          disbursed?: number
          fees_paid?: number
          interest_accrued?: number
          interest_paid?: number
          loan_id?: string
          opening_principal?: number
          principal_paid?: number
          status?: string
        }
        Relationships: []
      }
      loan_evaluation: {
        Row: {
          company_id: string
          created_at: string
          data: Json
          id: string
          loan_id: string
          product_snapshot: Json | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          data?: Json
          id?: string
          loan_id: string
          product_snapshot?: Json | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          data?: Json
          id?: string
          loan_id?: string
          product_snapshot?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loan_evaluation_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_evaluation_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: true
            referencedRelation: "loan"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_evaluation_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: true
            referencedRelation: "v_loan_outstanding"
            referencedColumns: ["loan_id"]
          },
        ]
      }
      loan_installment: {
        Row: {
          due_date: string
          fee_due: number
          fee_paid: number
          id: string
          interest_due: number
          interest_paid: number
          is_manual: boolean
          loan_id: string
          principal_due: number
          principal_paid: number
          seq: number
          state: Database["public"]["Enums"]["installment_state"]
        }
        Insert: {
          due_date: string
          fee_due?: number
          fee_paid?: number
          id?: string
          interest_due?: number
          interest_paid?: number
          is_manual?: boolean
          loan_id: string
          principal_due?: number
          principal_paid?: number
          seq: number
          state?: Database["public"]["Enums"]["installment_state"]
        }
        Update: {
          due_date?: string
          fee_due?: number
          fee_paid?: number
          id?: string
          interest_due?: number
          interest_paid?: number
          is_manual?: boolean
          loan_id?: string
          principal_due?: number
          principal_paid?: number
          seq?: number
          state?: Database["public"]["Enums"]["installment_state"]
        }
        Relationships: [
          {
            foreignKeyName: "loan_installment_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loan"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_installment_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "v_loan_outstanding"
            referencedColumns: ["loan_id"]
          },
        ]
      }
      loan_installment_reclass: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          entry_id: string | null
          id: string
          installment_id: string
          loan_id: string
          reclass_date: string
        }
        Insert: {
          amount: number
          company_id: string
          created_at?: string
          entry_id?: string | null
          id?: string
          installment_id: string
          loan_id: string
          reclass_date: string
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          entry_id?: string | null
          id?: string
          installment_id?: string
          loan_id?: string
          reclass_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "loan_installment_reclass_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_installment_reclass_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entry"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_installment_reclass_installment_id_fkey"
            columns: ["installment_id"]
            isOneToOne: true
            referencedRelation: "loan_installment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_installment_reclass_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loan"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_installment_reclass_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "v_loan_outstanding"
            referencedColumns: ["loan_id"]
          },
        ]
      }
      loan_product: {
        Row: {
          accrued_interest_account_id: string | null
          annual_rate_pct: number
          bad_debt_expense_account_id: string | null
          cash_account_id: string | null
          code: string
          color: string | null
          company_id: string
          fee_income_account_id: string | null
          frequency: Database["public"]["Enums"]["repayment_frequency"]
          id: string
          interest_income_account_id: string | null
          interest_method: Database["public"]["Enums"]["interest_method"]
          interest_receivable_account_id: string | null
          is_active: boolean
          loan_loss_provision_account_id: string | null
          max_principal: number | null
          max_term_months: number
          min_principal: number
          min_term_months: number
          name: string
          principal_account_id: string | null
          processing_fee_pct: number
          required_documents: string[]
          segment: string
          suspended_interest_account_id: string | null
          termination_fee: number
          termination_fee_pct: number
        }
        Insert: {
          accrued_interest_account_id?: string | null
          annual_rate_pct: number
          bad_debt_expense_account_id?: string | null
          cash_account_id?: string | null
          code: string
          color?: string | null
          company_id: string
          fee_income_account_id?: string | null
          frequency?: Database["public"]["Enums"]["repayment_frequency"]
          id?: string
          interest_income_account_id?: string | null
          interest_method?: Database["public"]["Enums"]["interest_method"]
          interest_receivable_account_id?: string | null
          is_active?: boolean
          loan_loss_provision_account_id?: string | null
          max_principal?: number | null
          max_term_months?: number
          min_principal?: number
          min_term_months?: number
          name: string
          principal_account_id?: string | null
          processing_fee_pct?: number
          required_documents?: string[]
          segment?: string
          suspended_interest_account_id?: string | null
          termination_fee?: number
          termination_fee_pct?: number
        }
        Update: {
          accrued_interest_account_id?: string | null
          annual_rate_pct?: number
          bad_debt_expense_account_id?: string | null
          cash_account_id?: string | null
          code?: string
          color?: string | null
          company_id?: string
          fee_income_account_id?: string | null
          frequency?: Database["public"]["Enums"]["repayment_frequency"]
          id?: string
          interest_income_account_id?: string | null
          interest_method?: Database["public"]["Enums"]["interest_method"]
          interest_receivable_account_id?: string | null
          is_active?: boolean
          loan_loss_provision_account_id?: string | null
          max_principal?: number | null
          max_term_months?: number
          min_principal?: number
          min_term_months?: number
          name?: string
          principal_account_id?: string | null
          processing_fee_pct?: number
          required_documents?: string[]
          segment?: string
          suspended_interest_account_id?: string | null
          termination_fee?: number
          termination_fee_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "loan_product_accrued_interest_account_id_fkey"
            columns: ["accrued_interest_account_id"]
            isOneToOne: false
            referencedRelation: "gl_account"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_product_bad_debt_expense_account_id_fkey"
            columns: ["bad_debt_expense_account_id"]
            isOneToOne: false
            referencedRelation: "gl_account"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_product_cash_account_id_fkey"
            columns: ["cash_account_id"]
            isOneToOne: false
            referencedRelation: "gl_account"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_product_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_product_fee_income_account_id_fkey"
            columns: ["fee_income_account_id"]
            isOneToOne: false
            referencedRelation: "gl_account"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_product_interest_income_account_id_fkey"
            columns: ["interest_income_account_id"]
            isOneToOne: false
            referencedRelation: "gl_account"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_product_interest_receivable_account_id_fkey"
            columns: ["interest_receivable_account_id"]
            isOneToOne: false
            referencedRelation: "gl_account"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_product_loan_loss_provision_account_id_fkey"
            columns: ["loan_loss_provision_account_id"]
            isOneToOne: false
            referencedRelation: "gl_account"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_product_principal_account_id_fkey"
            columns: ["principal_account_id"]
            isOneToOne: false
            referencedRelation: "gl_account"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_product_suspended_interest_account_id_fkey"
            columns: ["suspended_interest_account_id"]
            isOneToOne: false
            referencedRelation: "gl_account"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_product_evaluation_section: {
        Row: {
          company_id: string
          created_at: string
          display_order: number
          enabled_fields: Json | null
          id: string
          is_mandatory: boolean
          is_visible: boolean
          loan_product_id: string
          section_id: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          display_order?: number
          enabled_fields?: Json | null
          id?: string
          is_mandatory?: boolean
          is_visible?: boolean
          loan_product_id: string
          section_id: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          display_order?: number
          enabled_fields?: Json | null
          id?: string
          is_mandatory?: boolean
          is_visible?: boolean
          loan_product_id?: string
          section_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loan_product_evaluation_section_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_product_evaluation_section_loan_product_id_fkey"
            columns: ["loan_product_id"]
            isOneToOne: false
            referencedRelation: "loan_product"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_product_evaluation_section_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "evaluation_section"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_security: {
        Row: {
          created_at: string
          documents: Json
          id: string
          loan_id: string
          notes: string | null
          security_type_id: string
          updated_at: string
          values: Json
        }
        Insert: {
          created_at?: string
          documents?: Json
          id?: string
          loan_id: string
          notes?: string | null
          security_type_id: string
          updated_at?: string
          values?: Json
        }
        Update: {
          created_at?: string
          documents?: Json
          id?: string
          loan_id?: string
          notes?: string | null
          security_type_id?: string
          updated_at?: string
          values?: Json
        }
        Relationships: [
          {
            foreignKeyName: "loan_security_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loan"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_security_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "v_loan_outstanding"
            referencedColumns: ["loan_id"]
          },
          {
            foreignKeyName: "loan_security_security_type_id_fkey"
            columns: ["security_type_id"]
            isOneToOne: false
            referencedRelation: "security_type"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_write_off: {
        Row: {
          branch_id: string
          charges_recovered: number
          charges_written_off: number
          client_id: string
          company_id: string
          created_at: string
          created_by: string | null
          facility_no: string | null
          id: string
          interest_recovered: number
          interest_written_off: number
          is_fully_recovered: boolean
          loan_id: string
          principal_recovered: number
          principal_written_off: number
          reason: string
          total_recovered: number
          total_written_off: number
          updated_at: string
          used_provision: boolean
          write_off_date: string
        }
        Insert: {
          branch_id: string
          charges_recovered?: number
          charges_written_off?: number
          client_id: string
          company_id: string
          created_at?: string
          created_by?: string | null
          facility_no?: string | null
          id?: string
          interest_recovered?: number
          interest_written_off?: number
          is_fully_recovered?: boolean
          loan_id: string
          principal_recovered?: number
          principal_written_off?: number
          reason: string
          total_recovered?: number
          total_written_off?: number
          updated_at?: string
          used_provision?: boolean
          write_off_date?: string
        }
        Update: {
          branch_id?: string
          charges_recovered?: number
          charges_written_off?: number
          client_id?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          facility_no?: string | null
          id?: string
          interest_recovered?: number
          interest_written_off?: number
          is_fully_recovered?: boolean
          loan_id?: string
          principal_recovered?: number
          principal_written_off?: number
          reason?: string
          total_recovered?: number
          total_written_off?: number
          updated_at?: string
          used_provision?: boolean
          write_off_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "loan_write_off_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branch"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_write_off_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_write_off_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_write_off_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: true
            referencedRelation: "loan"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_write_off_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: true
            referencedRelation: "v_loan_outstanding"
            referencedColumns: ["loan_id"]
          },
        ]
      }
      loan_write_off_recovery: {
        Row: {
          amount: number
          branch_id: string
          charges_portion: number
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          interest_portion: number
          journal_entry_id: string | null
          notes: string | null
          payment_method: string
          principal_portion: number
          recovery_date: string
          reference: string | null
          write_off_id: string
        }
        Insert: {
          amount: number
          branch_id: string
          charges_portion?: number
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          interest_portion?: number
          journal_entry_id?: string | null
          notes?: string | null
          payment_method: string
          principal_portion?: number
          recovery_date?: string
          reference?: string | null
          write_off_id: string
        }
        Update: {
          amount?: number
          branch_id?: string
          charges_portion?: number
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          interest_portion?: number
          journal_entry_id?: string | null
          notes?: string | null
          payment_method?: string
          principal_portion?: number
          recovery_date?: string
          reference?: string | null
          write_off_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loan_write_off_recovery_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branch"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_write_off_recovery_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_write_off_recovery_write_off_id_fkey"
            columns: ["write_off_id"]
            isOneToOne: false
            referencedRelation: "loan_write_off"
            referencedColumns: ["id"]
          },
        ]
      }
      passbook_issue: {
        Row: {
          account_id: string
          company_id: string
          created_at: string
          id: string
          issued_by: string | null
          issued_on: string
          notes: string | null
          serial_no: number
          series_prefix: string | null
          stock_id: string
          updated_at: string
          void_reason: string | null
          voided: boolean
        }
        Insert: {
          account_id: string
          company_id: string
          created_at?: string
          id?: string
          issued_by?: string | null
          issued_on?: string
          notes?: string | null
          serial_no: number
          series_prefix?: string | null
          stock_id: string
          updated_at?: string
          void_reason?: string | null
          voided?: boolean
        }
        Update: {
          account_id?: string
          company_id?: string
          created_at?: string
          id?: string
          issued_by?: string | null
          issued_on?: string
          notes?: string | null
          serial_no?: number
          series_prefix?: string | null
          stock_id?: string
          updated_at?: string
          void_reason?: string | null
          voided?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "passbook_issue_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "savings_account"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "passbook_issue_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "passbook_issue_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "passbook_issue_stock_id_fkey"
            columns: ["stock_id"]
            isOneToOne: false
            referencedRelation: "passbook_stock"
            referencedColumns: ["id"]
          },
        ]
      }
      passbook_stock: {
        Row: {
          branch_id: string
          company_id: string
          created_at: string
          id: string
          notes: string | null
          product_id: string | null
          quantity_issued: number
          quantity_received: number
          quantity_void: number
          received_by: string | null
          received_on: string
          serial_from: number
          serial_to: number
          series_prefix: string | null
          status: Database["public"]["Enums"]["passbook_stock_status"]
          supplier: string | null
          updated_at: string
        }
        Insert: {
          branch_id: string
          company_id: string
          created_at?: string
          id?: string
          notes?: string | null
          product_id?: string | null
          quantity_issued?: number
          quantity_received: number
          quantity_void?: number
          received_by?: string | null
          received_on?: string
          serial_from: number
          serial_to: number
          series_prefix?: string | null
          status?: Database["public"]["Enums"]["passbook_stock_status"]
          supplier?: string | null
          updated_at?: string
        }
        Update: {
          branch_id?: string
          company_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          product_id?: string | null
          quantity_issued?: number
          quantity_received?: number
          quantity_void?: number
          received_by?: string | null
          received_on?: string
          serial_from?: number
          serial_to?: number
          series_prefix?: string | null
          status?: Database["public"]["Enums"]["passbook_stock_status"]
          supplier?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "passbook_stock_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branch"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "passbook_stock_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "passbook_stock_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "savings_product"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "passbook_stock_received_by_fkey"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      permission: {
        Row: {
          code: string
          created_at: string
          description: string | null
          label: string
          module: string
          sort_order: number
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          label: string
          module: string
          sort_order?: number
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          label?: string
          module?: string
          sort_order?: number
        }
        Relationships: []
      }
      posting: {
        Row: {
          account_id: string
          credit: number
          debit: number
          entry_id: string
          id: number
        }
        Insert: {
          account_id: string
          credit?: number
          debit?: number
          entry_id: string
          id?: number
        }
        Update: {
          account_id?: string
          credit?: number
          debit?: number
          entry_id?: string
          id?: number
        }
        Relationships: [
          {
            foreignKeyName: "posting_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "gl_account"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posting_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entry"
            referencedColumns: ["id"]
          },
        ]
      }
      repayment: {
        Row: {
          allocated_fees: number
          allocated_interest: number
          allocated_principal: number
          amount: number
          channel: Database["public"]["Enums"]["payment_channel"]
          entry_id: string
          id: string
          idempotency_key: string | null
          loan_id: string
          notes: string | null
          received_at: string
          received_by: string | null
          reference: string | null
          unallocated_amount: number
        }
        Insert: {
          allocated_fees?: number
          allocated_interest?: number
          allocated_principal?: number
          amount: number
          channel: Database["public"]["Enums"]["payment_channel"]
          entry_id: string
          id?: string
          idempotency_key?: string | null
          loan_id: string
          notes?: string | null
          received_at?: string
          received_by?: string | null
          reference?: string | null
          unallocated_amount?: number
        }
        Update: {
          allocated_fees?: number
          allocated_interest?: number
          allocated_principal?: number
          amount?: number
          channel?: Database["public"]["Enums"]["payment_channel"]
          entry_id?: string
          id?: string
          idempotency_key?: string | null
          loan_id?: string
          notes?: string | null
          received_at?: string
          received_by?: string | null
          reference?: string | null
          unallocated_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "repayment_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entry"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repayment_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loan"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repayment_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "v_loan_outstanding"
            referencedColumns: ["loan_id"]
          },
          {
            foreignKeyName: "repayment_received_by_fkey"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      risk_band: {
        Row: {
          band: Database["public"]["Enums"]["risk_band_level"]
          company_id: string
          created_at: string
          id: string
          max_pct: number
          min_pct: number
          updated_at: string
        }
        Insert: {
          band: Database["public"]["Enums"]["risk_band_level"]
          company_id: string
          created_at?: string
          id?: string
          max_pct: number
          min_pct: number
          updated_at?: string
        }
        Update: {
          band?: Database["public"]["Enums"]["risk_band_level"]
          company_id?: string
          created_at?: string
          id?: string
          max_pct?: number
          min_pct?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "risk_band_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      risk_factor: {
        Row: {
          active: boolean
          applies_to: Database["public"]["Enums"]["risk_applies_to"]
          code: string
          company_id: string
          created_at: string
          id: string
          label: string
          multi_select: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          applies_to?: Database["public"]["Enums"]["risk_applies_to"]
          code: string
          company_id: string
          created_at?: string
          id?: string
          label: string
          multi_select?: boolean
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          applies_to?: Database["public"]["Enums"]["risk_applies_to"]
          code?: string
          company_id?: string
          created_at?: string
          id?: string
          label?: string
          multi_select?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "risk_factor_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      risk_option: {
        Row: {
          active: boolean
          band: Database["public"]["Enums"]["risk_band_level"]
          created_at: string
          factor_id: string
          id: string
          label: string
          score: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          band?: Database["public"]["Enums"]["risk_band_level"]
          created_at?: string
          factor_id: string
          id?: string
          label: string
          score?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          band?: Database["public"]["Enums"]["risk_band_level"]
          created_at?: string
          factor_id?: string
          id?: string
          label?: string
          score?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "risk_option_factor_id_fkey"
            columns: ["factor_id"]
            isOneToOne: false
            referencedRelation: "risk_factor"
            referencedColumns: ["id"]
          },
        ]
      }
      savings_account: {
        Row: {
          account_no: string
          approved_at: string | null
          approved_by: string | null
          available_balance: number
          balance: number
          branch_id: string
          client_id: string
          closed_by: string | null
          closed_on: string | null
          closure_reason: string | null
          communication_preference: string | null
          company_id: string
          created_at: string
          currency: string
          external_ref: string | null
          fees_snapshot: Json | null
          id: string
          interest_accrued: number
          last_txn_at: string | null
          mandate_snapshot: Json | null
          opened_by: string | null
          opened_on: string
          opened_via: string | null
          product_id: string
          product_snapshot: Json | null
          rate_override_approved_by: string | null
          rate_override_pct: number | null
          rate_override_reason: string | null
          rate_snapshot: Json | null
          special_instructions: string | null
          statement_preference: string | null
          status: Database["public"]["Enums"]["savings_account_status"]
          uncleared_balance: number
          updated_at: string
        }
        Insert: {
          account_no: string
          approved_at?: string | null
          approved_by?: string | null
          available_balance?: number
          balance?: number
          branch_id: string
          client_id: string
          closed_by?: string | null
          closed_on?: string | null
          closure_reason?: string | null
          communication_preference?: string | null
          company_id: string
          created_at?: string
          currency?: string
          external_ref?: string | null
          fees_snapshot?: Json | null
          id?: string
          interest_accrued?: number
          last_txn_at?: string | null
          mandate_snapshot?: Json | null
          opened_by?: string | null
          opened_on?: string
          opened_via?: string | null
          product_id: string
          product_snapshot?: Json | null
          rate_override_approved_by?: string | null
          rate_override_pct?: number | null
          rate_override_reason?: string | null
          rate_snapshot?: Json | null
          special_instructions?: string | null
          statement_preference?: string | null
          status?: Database["public"]["Enums"]["savings_account_status"]
          uncleared_balance?: number
          updated_at?: string
        }
        Update: {
          account_no?: string
          approved_at?: string | null
          approved_by?: string | null
          available_balance?: number
          balance?: number
          branch_id?: string
          client_id?: string
          closed_by?: string | null
          closed_on?: string | null
          closure_reason?: string | null
          communication_preference?: string | null
          company_id?: string
          created_at?: string
          currency?: string
          external_ref?: string | null
          fees_snapshot?: Json | null
          id?: string
          interest_accrued?: number
          last_txn_at?: string | null
          mandate_snapshot?: Json | null
          opened_by?: string | null
          opened_on?: string
          opened_via?: string | null
          product_id?: string
          product_snapshot?: Json | null
          rate_override_approved_by?: string | null
          rate_override_pct?: number | null
          rate_override_reason?: string | null
          rate_snapshot?: Json | null
          special_instructions?: string | null
          statement_preference?: string | null
          status?: Database["public"]["Enums"]["savings_account_status"]
          uncleared_balance?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "savings_account_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_account_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branch"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_account_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_account_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_account_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_account_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_account_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "savings_product"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_account_rate_override_approved_by_fkey"
            columns: ["rate_override_approved_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      savings_account_holder: {
        Row: {
          account_id: string
          client_id: string | null
          company_id: string
          created_at: string
          full_name: string | null
          id: string
          is_signatory: boolean
          nic: string | null
          ownership_pct: number
          relation: string | null
          role: string
          signing_order: number | null
          updated_at: string
        }
        Insert: {
          account_id: string
          client_id?: string | null
          company_id: string
          created_at?: string
          full_name?: string | null
          id?: string
          is_signatory?: boolean
          nic?: string | null
          ownership_pct?: number
          relation?: string | null
          role: string
          signing_order?: number | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          client_id?: string | null
          company_id?: string
          created_at?: string
          full_name?: string | null
          id?: string
          is_signatory?: boolean
          nic?: string | null
          ownership_pct?: number
          relation?: string | null
          role?: string
          signing_order?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "savings_account_holder_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "savings_account"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_account_holder_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_account_holder_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      savings_account_mandate: {
        Row: {
          account_id: string
          active: boolean
          approved_at: string | null
          approved_by: string | null
          company_id: string
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          min_signatories: number | null
          rule_details: Json | null
          signing_rule: string
          updated_at: string
        }
        Insert: {
          account_id: string
          active?: boolean
          approved_at?: string | null
          approved_by?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          min_signatories?: number | null
          rule_details?: Json | null
          signing_rule: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          active?: boolean
          approved_at?: string | null
          approved_by?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          min_signatories?: number | null
          rule_details?: Json | null
          signing_rule?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "savings_account_mandate_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "savings_account"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_account_mandate_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_account_mandate_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_account_mandate_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      savings_account_nominee: {
        Row: {
          account_id: string
          company_id: string
          contact: string | null
          created_at: string
          full_name: string
          id: string
          nic: string | null
          percentage: number
          relation: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          company_id: string
          contact?: string | null
          created_at?: string
          full_name: string
          id?: string
          nic?: string | null
          percentage: number
          relation?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          company_id?: string
          contact?: string | null
          created_at?: string
          full_name?: string
          id?: string
          nic?: string | null
          percentage?: number
          relation?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "savings_account_nominee_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "savings_account"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_account_nominee_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      savings_alco_rate: {
        Row: {
          active: boolean
          annual_rate: number
          company_id: string
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          max_balance: number | null
          min_balance: number
          note: string | null
          product_id: string
          superseded_by: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          annual_rate: number
          company_id: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          max_balance?: number | null
          min_balance?: number
          note?: string | null
          product_id: string
          superseded_by?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          annual_rate?: number
          company_id?: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          max_balance?: number | null
          min_balance?: number
          note?: string | null
          product_id?: string
          superseded_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "savings_alco_rate_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_alco_rate_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "savings_product"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_alco_rate_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "savings_alco_rate"
            referencedColumns: ["id"]
          },
        ]
      }
      savings_auto_collection_config: {
        Row: {
          afternoon_enabled: boolean
          afternoon_time: string
          company_id: string
          created_at: string
          id: string
          max_retries: number
          morning_enabled: boolean
          morning_time: string
          timezone_override: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          afternoon_enabled?: boolean
          afternoon_time?: string
          company_id: string
          created_at?: string
          id?: string
          max_retries?: number
          morning_enabled?: boolean
          morning_time?: string
          timezone_override?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          afternoon_enabled?: boolean
          afternoon_time?: string
          company_id?: string
          created_at?: string
          id?: string
          max_retries?: number
          morning_enabled?: boolean
          morning_time?: string
          timezone_override?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "savings_auto_collection_config_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_auto_collection_config_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      savings_auto_collection_dispatch: {
        Row: {
          business_date: string
          company_id: string
          dispatched_at: string
          http_request_id: number | null
          id: string
          run_window: string
        }
        Insert: {
          business_date: string
          company_id: string
          dispatched_at?: string
          http_request_id?: number | null
          id?: string
          run_window: string
        }
        Update: {
          business_date?: string
          company_id?: string
          dispatched_at?: string
          http_request_id?: number | null
          id?: string
          run_window?: string
        }
        Relationships: [
          {
            foreignKeyName: "savings_auto_collection_dispatch_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      savings_auto_collection_result: {
        Row: {
          collected: number
          created_at: string
          gl_entry_id: string | null
          id: string
          loan_id: string
          loan_repayment_id: string | null
          mandate_id: string
          reason: string | null
          requested: number
          run_id: string
          savings_account_id: string
          savings_txn_id: string | null
          status: string
        }
        Insert: {
          collected?: number
          created_at?: string
          gl_entry_id?: string | null
          id?: string
          loan_id: string
          loan_repayment_id?: string | null
          mandate_id: string
          reason?: string | null
          requested?: number
          run_id: string
          savings_account_id: string
          savings_txn_id?: string | null
          status: string
        }
        Update: {
          collected?: number
          created_at?: string
          gl_entry_id?: string | null
          id?: string
          loan_id?: string
          loan_repayment_id?: string | null
          mandate_id?: string
          reason?: string | null
          requested?: number
          run_id?: string
          savings_account_id?: string
          savings_txn_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "savings_auto_collection_result_gl_entry_id_fkey"
            columns: ["gl_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entry"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_auto_collection_result_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loan"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_auto_collection_result_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "v_loan_outstanding"
            referencedColumns: ["loan_id"]
          },
          {
            foreignKeyName: "savings_auto_collection_result_loan_repayment_id_fkey"
            columns: ["loan_repayment_id"]
            isOneToOne: false
            referencedRelation: "repayment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_auto_collection_result_mandate_id_fkey"
            columns: ["mandate_id"]
            isOneToOne: false
            referencedRelation: "savings_loan_mandate"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_auto_collection_result_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "savings_auto_collection_run"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_auto_collection_result_savings_account_id_fkey"
            columns: ["savings_account_id"]
            isOneToOne: false
            referencedRelation: "savings_account"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_auto_collection_result_savings_txn_id_fkey"
            columns: ["savings_txn_id"]
            isOneToOne: false
            referencedRelation: "savings_transaction"
            referencedColumns: ["id"]
          },
        ]
      }
      savings_auto_collection_run: {
        Row: {
          business_date: string
          company_id: string
          completed_at: string | null
          counts: Json
          error: string | null
          id: string
          run_window: string
          started_at: string
          status: string
          totals: Json
          triggered_by: string | null
        }
        Insert: {
          business_date: string
          company_id: string
          completed_at?: string | null
          counts?: Json
          error?: string | null
          id?: string
          run_window: string
          started_at?: string
          status?: string
          totals?: Json
          triggered_by?: string | null
        }
        Update: {
          business_date?: string
          company_id?: string
          completed_at?: string | null
          counts?: Json
          error?: string | null
          id?: string
          run_window?: string
          started_at?: string
          status?: string
          totals?: Json
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "savings_auto_collection_run_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_auto_collection_run_triggered_by_fkey"
            columns: ["triggered_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      savings_charge: {
        Row: {
          active: boolean
          amount: number
          company_id: string
          created_at: string
          frequency: Database["public"]["Enums"]["savings_charge_frequency"]
          id: string
          income_account_id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          amount: number
          company_id: string
          created_at?: string
          frequency?: Database["public"]["Enums"]["savings_charge_frequency"]
          id?: string
          income_account_id: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          amount?: number
          company_id?: string
          created_at?: string
          frequency?: Database["public"]["Enums"]["savings_charge_frequency"]
          id?: string
          income_account_id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "savings_charge_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_charge_income_account_id_fkey"
            columns: ["income_account_id"]
            isOneToOne: false
            referencedRelation: "gl_account"
            referencedColumns: ["id"]
          },
        ]
      }
      savings_charge_product: {
        Row: {
          charge_id: string
          created_at: string
          product_id: string
        }
        Insert: {
          charge_id: string
          created_at?: string
          product_id: string
        }
        Update: {
          charge_id?: string
          created_at?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "savings_charge_product_charge_id_fkey"
            columns: ["charge_id"]
            isOneToOne: false
            referencedRelation: "savings_charge"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_charge_product_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "savings_product"
            referencedColumns: ["id"]
          },
        ]
      }
      savings_eod_balance: {
        Row: {
          account_id: string
          branch_id: string
          business_date: string
          closing_balance: number
          company_id: string
          created_at: string
          deposits: number
          fees: number
          interest: number
          opening_balance: number
          txn_count: number
          withdrawals: number
        }
        Insert: {
          account_id: string
          branch_id: string
          business_date: string
          closing_balance?: number
          company_id: string
          created_at?: string
          deposits?: number
          fees?: number
          interest?: number
          opening_balance?: number
          txn_count?: number
          withdrawals?: number
        }
        Update: {
          account_id?: string
          branch_id?: string
          business_date?: string
          closing_balance?: number
          company_id?: string
          created_at?: string
          deposits?: number
          fees?: number
          interest?: number
          opening_balance?: number
          txn_count?: number
          withdrawals?: number
        }
        Relationships: []
      }
      savings_eod_balance_202606: {
        Row: {
          account_id: string
          branch_id: string
          business_date: string
          closing_balance: number
          company_id: string
          created_at: string
          deposits: number
          fees: number
          interest: number
          opening_balance: number
          txn_count: number
          withdrawals: number
        }
        Insert: {
          account_id: string
          branch_id: string
          business_date: string
          closing_balance?: number
          company_id: string
          created_at?: string
          deposits?: number
          fees?: number
          interest?: number
          opening_balance?: number
          txn_count?: number
          withdrawals?: number
        }
        Update: {
          account_id?: string
          branch_id?: string
          business_date?: string
          closing_balance?: number
          company_id?: string
          created_at?: string
          deposits?: number
          fees?: number
          interest?: number
          opening_balance?: number
          txn_count?: number
          withdrawals?: number
        }
        Relationships: []
      }
      savings_eod_balance_202607: {
        Row: {
          account_id: string
          branch_id: string
          business_date: string
          closing_balance: number
          company_id: string
          created_at: string
          deposits: number
          fees: number
          interest: number
          opening_balance: number
          txn_count: number
          withdrawals: number
        }
        Insert: {
          account_id: string
          branch_id: string
          business_date: string
          closing_balance?: number
          company_id: string
          created_at?: string
          deposits?: number
          fees?: number
          interest?: number
          opening_balance?: number
          txn_count?: number
          withdrawals?: number
        }
        Update: {
          account_id?: string
          branch_id?: string
          business_date?: string
          closing_balance?: number
          company_id?: string
          created_at?: string
          deposits?: number
          fees?: number
          interest?: number
          opening_balance?: number
          txn_count?: number
          withdrawals?: number
        }
        Relationships: []
      }
      savings_eod_balance_202608: {
        Row: {
          account_id: string
          branch_id: string
          business_date: string
          closing_balance: number
          company_id: string
          created_at: string
          deposits: number
          fees: number
          interest: number
          opening_balance: number
          txn_count: number
          withdrawals: number
        }
        Insert: {
          account_id: string
          branch_id: string
          business_date: string
          closing_balance?: number
          company_id: string
          created_at?: string
          deposits?: number
          fees?: number
          interest?: number
          opening_balance?: number
          txn_count?: number
          withdrawals?: number
        }
        Update: {
          account_id?: string
          branch_id?: string
          business_date?: string
          closing_balance?: number
          company_id?: string
          created_at?: string
          deposits?: number
          fees?: number
          interest?: number
          opening_balance?: number
          txn_count?: number
          withdrawals?: number
        }
        Relationships: []
      }
      savings_eod_balance_202609: {
        Row: {
          account_id: string
          branch_id: string
          business_date: string
          closing_balance: number
          company_id: string
          created_at: string
          deposits: number
          fees: number
          interest: number
          opening_balance: number
          txn_count: number
          withdrawals: number
        }
        Insert: {
          account_id: string
          branch_id: string
          business_date: string
          closing_balance?: number
          company_id: string
          created_at?: string
          deposits?: number
          fees?: number
          interest?: number
          opening_balance?: number
          txn_count?: number
          withdrawals?: number
        }
        Update: {
          account_id?: string
          branch_id?: string
          business_date?: string
          closing_balance?: number
          company_id?: string
          created_at?: string
          deposits?: number
          fees?: number
          interest?: number
          opening_balance?: number
          txn_count?: number
          withdrawals?: number
        }
        Relationships: []
      }
      savings_hold: {
        Row: {
          account_id: string
          active: boolean
          amount: number
          approval_state: string
          approved_at: string | null
          approved_by: string | null
          company_id: string
          created_at: string
          created_by: string | null
          doc_ref: string | null
          effective_from: string
          expires_at: string | null
          hold_type: string
          id: string
          linked_loan_id: string | null
          reason: string
          reason_code: string | null
          release_requested_at: string | null
          release_requested_by: string | null
          release_requested_reason: string | null
          release_status: string
          release_workflow_instance_id: string | null
          released_at: string | null
          released_by: string | null
          released_reason: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          active?: boolean
          amount?: number
          approval_state?: string
          approved_at?: string | null
          approved_by?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          doc_ref?: string | null
          effective_from?: string
          expires_at?: string | null
          hold_type: string
          id?: string
          linked_loan_id?: string | null
          reason: string
          reason_code?: string | null
          release_requested_at?: string | null
          release_requested_by?: string | null
          release_requested_reason?: string | null
          release_status?: string
          release_workflow_instance_id?: string | null
          released_at?: string | null
          released_by?: string | null
          released_reason?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          active?: boolean
          amount?: number
          approval_state?: string
          approved_at?: string | null
          approved_by?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          doc_ref?: string | null
          effective_from?: string
          expires_at?: string | null
          hold_type?: string
          id?: string
          linked_loan_id?: string | null
          reason?: string
          reason_code?: string | null
          release_requested_at?: string | null
          release_requested_by?: string | null
          release_requested_reason?: string | null
          release_status?: string
          release_workflow_instance_id?: string | null
          released_at?: string | null
          released_by?: string | null
          released_reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "savings_hold_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "savings_account"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_hold_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_hold_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_hold_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_hold_linked_loan_id_fkey"
            columns: ["linked_loan_id"]
            isOneToOne: false
            referencedRelation: "loan"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_hold_linked_loan_id_fkey"
            columns: ["linked_loan_id"]
            isOneToOne: false
            referencedRelation: "v_loan_outstanding"
            referencedColumns: ["loan_id"]
          },
          {
            foreignKeyName: "savings_hold_release_requested_by_fkey"
            columns: ["release_requested_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_hold_release_workflow_instance_id_fkey"
            columns: ["release_workflow_instance_id"]
            isOneToOne: false
            referencedRelation: "workflow_instance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_hold_released_by_fkey"
            columns: ["released_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      savings_interest_accrual: {
        Row: {
          account_id: string
          accrual_date: string
          company_id: string
          created_at: string
          day_count: number
          eligible_balance: number
          gross_interest: number
          id: string
          rate_pct: number
        }
        Insert: {
          account_id: string
          accrual_date: string
          company_id: string
          created_at?: string
          day_count?: number
          eligible_balance: number
          gross_interest: number
          id?: string
          rate_pct: number
        }
        Update: {
          account_id?: string
          accrual_date?: string
          company_id?: string
          created_at?: string
          day_count?: number
          eligible_balance?: number
          gross_interest?: number
          id?: string
          rate_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "savings_interest_accrual_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "savings_account"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_interest_accrual_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      savings_interest_posting: {
        Row: {
          account_id: string
          company_id: string
          created_at: string
          gl_entry_id: string | null
          gross_interest: number
          id: string
          idempotency_key: string
          net_interest: number
          period_end: string
          period_start: string
          savings_txn_id: string | null
          wht_amount: number
          wht_rule_id: string | null
          wht_txn_id: string | null
        }
        Insert: {
          account_id: string
          company_id: string
          created_at?: string
          gl_entry_id?: string | null
          gross_interest: number
          id?: string
          idempotency_key: string
          net_interest: number
          period_end: string
          period_start: string
          savings_txn_id?: string | null
          wht_amount?: number
          wht_rule_id?: string | null
          wht_txn_id?: string | null
        }
        Update: {
          account_id?: string
          company_id?: string
          created_at?: string
          gl_entry_id?: string | null
          gross_interest?: number
          id?: string
          idempotency_key?: string
          net_interest?: number
          period_end?: string
          period_start?: string
          savings_txn_id?: string | null
          wht_amount?: number
          wht_rule_id?: string | null
          wht_txn_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "savings_interest_posting_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "savings_account"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_interest_posting_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_interest_posting_gl_entry_id_fkey"
            columns: ["gl_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entry"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_interest_posting_savings_txn_id_fkey"
            columns: ["savings_txn_id"]
            isOneToOne: false
            referencedRelation: "savings_transaction"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_interest_posting_wht_txn_id_fkey"
            columns: ["wht_txn_id"]
            isOneToOne: false
            referencedRelation: "savings_transaction"
            referencedColumns: ["id"]
          },
        ]
      }
      savings_loan_mandate: {
        Row: {
          afternoon_run: boolean
          allow_partial: boolean
          approved_at: string | null
          approved_by: string | null
          cancelled_at: string | null
          cancelled_reason: string | null
          client_id: string
          company_id: string
          consent_date: string | null
          consent_reference: string | null
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          fixed_amount: number | null
          id: string
          ignore_debit_block: boolean
          loan_id: string
          mandate_type: string
          max_amount_per_run: number | null
          min_protected_balance: number
          morning_run: boolean
          priority: number
          savings_account_id: string
          status: string
          suspended_at: string | null
          suspended_reason: string | null
          updated_at: string
        }
        Insert: {
          afternoon_run?: boolean
          allow_partial?: boolean
          approved_at?: string | null
          approved_by?: string | null
          cancelled_at?: string | null
          cancelled_reason?: string | null
          client_id: string
          company_id: string
          consent_date?: string | null
          consent_reference?: string | null
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          fixed_amount?: number | null
          id?: string
          ignore_debit_block?: boolean
          loan_id: string
          mandate_type?: string
          max_amount_per_run?: number | null
          min_protected_balance?: number
          morning_run?: boolean
          priority?: number
          savings_account_id: string
          status?: string
          suspended_at?: string | null
          suspended_reason?: string | null
          updated_at?: string
        }
        Update: {
          afternoon_run?: boolean
          allow_partial?: boolean
          approved_at?: string | null
          approved_by?: string | null
          cancelled_at?: string | null
          cancelled_reason?: string | null
          client_id?: string
          company_id?: string
          consent_date?: string | null
          consent_reference?: string | null
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          fixed_amount?: number | null
          id?: string
          ignore_debit_block?: boolean
          loan_id?: string
          mandate_type?: string
          max_amount_per_run?: number | null
          min_protected_balance?: number
          morning_run?: boolean
          priority?: number
          savings_account_id?: string
          status?: string
          suspended_at?: string | null
          suspended_reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "savings_loan_mandate_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_loan_mandate_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_loan_mandate_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_loan_mandate_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_loan_mandate_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loan"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_loan_mandate_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "v_loan_outstanding"
            referencedColumns: ["loan_id"]
          },
          {
            foreignKeyName: "savings_loan_mandate_savings_account_id_fkey"
            columns: ["savings_account_id"]
            isOneToOne: false
            referencedRelation: "savings_account"
            referencedColumns: ["id"]
          },
        ]
      }
      savings_number_seq: {
        Row: {
          company_id: string
          last_no: number
          period: string
        }
        Insert: {
          company_id: string
          last_no?: number
          period: string
        }
        Update: {
          company_id?: string
          last_no?: number
          period?: string
        }
        Relationships: [
          {
            foreignKeyName: "savings_number_seq_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      savings_product: {
        Row: {
          accrual_frequency: string
          active: boolean
          adjustment_account_id: string | null
          capitalization_frequency: string
          cash_account_id: string | null
          closure_fee: number
          code: string
          company_id: string
          created_at: string
          currency: string
          day_count: number
          deposit_liability_account_id: string | null
          dormancy_days: number
          dormant_treatment: string
          fee_income_account_id: string | null
          id: string
          interest_expense_account_id: string | null
          interest_rate_pct: number
          interest_rounding: string
          min_balance: number
          min_earn_balance: number
          min_opening_balance: number
          name: string
          opening_fee: number
          passbook_required: boolean
          passbook_series_prefix: string | null
          segment: string
          unclaimed_deposit_liability_account_id: string | null
          updated_at: string
          wht_payable_account_id: string | null
        }
        Insert: {
          accrual_frequency?: string
          active?: boolean
          adjustment_account_id?: string | null
          capitalization_frequency?: string
          cash_account_id?: string | null
          closure_fee?: number
          code: string
          company_id: string
          created_at?: string
          currency?: string
          day_count?: number
          deposit_liability_account_id?: string | null
          dormancy_days?: number
          dormant_treatment?: string
          fee_income_account_id?: string | null
          id?: string
          interest_expense_account_id?: string | null
          interest_rate_pct?: number
          interest_rounding?: string
          min_balance?: number
          min_earn_balance?: number
          min_opening_balance?: number
          name: string
          opening_fee?: number
          passbook_required?: boolean
          passbook_series_prefix?: string | null
          segment?: string
          unclaimed_deposit_liability_account_id?: string | null
          updated_at?: string
          wht_payable_account_id?: string | null
        }
        Update: {
          accrual_frequency?: string
          active?: boolean
          adjustment_account_id?: string | null
          capitalization_frequency?: string
          cash_account_id?: string | null
          closure_fee?: number
          code?: string
          company_id?: string
          created_at?: string
          currency?: string
          day_count?: number
          deposit_liability_account_id?: string | null
          dormancy_days?: number
          dormant_treatment?: string
          fee_income_account_id?: string | null
          id?: string
          interest_expense_account_id?: string | null
          interest_rate_pct?: number
          interest_rounding?: string
          min_balance?: number
          min_earn_balance?: number
          min_opening_balance?: number
          name?: string
          opening_fee?: number
          passbook_required?: boolean
          passbook_series_prefix?: string | null
          segment?: string
          unclaimed_deposit_liability_account_id?: string | null
          updated_at?: string
          wht_payable_account_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "savings_product_adjustment_account_id_fkey"
            columns: ["adjustment_account_id"]
            isOneToOne: false
            referencedRelation: "gl_account"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_product_cash_account_id_fkey"
            columns: ["cash_account_id"]
            isOneToOne: false
            referencedRelation: "gl_account"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_product_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_product_deposit_liability_account_id_fkey"
            columns: ["deposit_liability_account_id"]
            isOneToOne: false
            referencedRelation: "gl_account"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_product_fee_income_account_id_fkey"
            columns: ["fee_income_account_id"]
            isOneToOne: false
            referencedRelation: "gl_account"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_product_interest_expense_account_id_fkey"
            columns: ["interest_expense_account_id"]
            isOneToOne: false
            referencedRelation: "gl_account"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_product_unclaimed_deposit_liability_account_id_fkey"
            columns: ["unclaimed_deposit_liability_account_id"]
            isOneToOne: false
            referencedRelation: "gl_account"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_product_wht_payable_account_id_fkey"
            columns: ["wht_payable_account_id"]
            isOneToOne: false
            referencedRelation: "gl_account"
            referencedColumns: ["id"]
          },
        ]
      }
      savings_standing_order: {
        Row: {
          amount: number
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          company_id: string
          consent_ref: string | null
          created_at: string
          created_by: string | null
          end_date: string | null
          frequency: Database["public"]["Enums"]["standing_order_frequency"]
          from_account_id: string
          id: string
          last_run_at: string | null
          last_run_error: string | null
          last_run_status: string | null
          max_runs: number | null
          narration: string | null
          next_run_date: string
          reference_prefix: string | null
          runs_completed: number
          status: Database["public"]["Enums"]["standing_order_status"]
          to_account_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          company_id: string
          consent_ref?: string | null
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          frequency: Database["public"]["Enums"]["standing_order_frequency"]
          from_account_id: string
          id?: string
          last_run_at?: string | null
          last_run_error?: string | null
          last_run_status?: string | null
          max_runs?: number | null
          narration?: string | null
          next_run_date: string
          reference_prefix?: string | null
          runs_completed?: number
          status?: Database["public"]["Enums"]["standing_order_status"]
          to_account_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          company_id?: string
          consent_ref?: string | null
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          frequency?: Database["public"]["Enums"]["standing_order_frequency"]
          from_account_id?: string
          id?: string
          last_run_at?: string | null
          last_run_error?: string | null
          last_run_status?: string | null
          max_runs?: number | null
          narration?: string | null
          next_run_date?: string
          reference_prefix?: string | null
          runs_completed?: number
          status?: Database["public"]["Enums"]["standing_order_status"]
          to_account_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "savings_standing_order_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_standing_order_from_account_id_fkey"
            columns: ["from_account_id"]
            isOneToOne: false
            referencedRelation: "savings_account"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_standing_order_to_account_id_fkey"
            columns: ["to_account_id"]
            isOneToOne: false
            referencedRelation: "savings_account"
            referencedColumns: ["id"]
          },
        ]
      }
      savings_transaction: {
        Row: {
          account_id: string
          amount: number
          approval_state: string | null
          approved_at: string | null
          approved_by: string | null
          channel: Database["public"]["Enums"]["savings_channel"]
          cleared_on: string | null
          clearing_status: string
          company_id: string
          created_at: string
          external_ref: string | null
          gl_entry_id: string | null
          id: string
          idempotency_key: string | null
          narration: string | null
          payment_details: Json | null
          payment_method: string | null
          performed_by: string | null
          reference: string | null
          reversed_by_txn_id: string | null
          reverses_txn_id: string | null
          running_balance: number
          txn_date: string
          txn_type: Database["public"]["Enums"]["savings_txn_type"]
        }
        Insert: {
          account_id: string
          amount: number
          approval_state?: string | null
          approved_at?: string | null
          approved_by?: string | null
          channel?: Database["public"]["Enums"]["savings_channel"]
          cleared_on?: string | null
          clearing_status?: string
          company_id: string
          created_at?: string
          external_ref?: string | null
          gl_entry_id?: string | null
          id?: string
          idempotency_key?: string | null
          narration?: string | null
          payment_details?: Json | null
          payment_method?: string | null
          performed_by?: string | null
          reference?: string | null
          reversed_by_txn_id?: string | null
          reverses_txn_id?: string | null
          running_balance: number
          txn_date?: string
          txn_type: Database["public"]["Enums"]["savings_txn_type"]
        }
        Update: {
          account_id?: string
          amount?: number
          approval_state?: string | null
          approved_at?: string | null
          approved_by?: string | null
          channel?: Database["public"]["Enums"]["savings_channel"]
          cleared_on?: string | null
          clearing_status?: string
          company_id?: string
          created_at?: string
          external_ref?: string | null
          gl_entry_id?: string | null
          id?: string
          idempotency_key?: string | null
          narration?: string | null
          payment_details?: Json | null
          payment_method?: string | null
          performed_by?: string | null
          reference?: string | null
          reversed_by_txn_id?: string | null
          reverses_txn_id?: string | null
          running_balance?: number
          txn_date?: string
          txn_type?: Database["public"]["Enums"]["savings_txn_type"]
        }
        Relationships: [
          {
            foreignKeyName: "savings_transaction_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "savings_account"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_transaction_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_transaction_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_transaction_gl_entry_id_fkey"
            columns: ["gl_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entry"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_transaction_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_transaction_reversed_by_txn_id_fkey"
            columns: ["reversed_by_txn_id"]
            isOneToOne: false
            referencedRelation: "savings_transaction"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_transaction_reverses_txn_id_fkey"
            columns: ["reverses_txn_id"]
            isOneToOne: false
            referencedRelation: "savings_transaction"
            referencedColumns: ["id"]
          },
        ]
      }
      savings_wht_rule: {
        Row: {
          active: boolean
          approved_at: string | null
          approved_by: string | null
          company_id: string
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          entity_type: string
          exemption_expiry: string | null
          exemption_ref: string | null
          exemption_type: string | null
          id: string
          jurisdiction: string
          product_id: string | null
          rate_pct: number
          residency: string
          tax_type: string
          threshold: number
          updated_at: string
          wht_gl_account_id: string | null
        }
        Insert: {
          active?: boolean
          approved_at?: string | null
          approved_by?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          effective_from: string
          effective_to?: string | null
          entity_type: string
          exemption_expiry?: string | null
          exemption_ref?: string | null
          exemption_type?: string | null
          id?: string
          jurisdiction: string
          product_id?: string | null
          rate_pct: number
          residency: string
          tax_type: string
          threshold?: number
          updated_at?: string
          wht_gl_account_id?: string | null
        }
        Update: {
          active?: boolean
          approved_at?: string | null
          approved_by?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          entity_type?: string
          exemption_expiry?: string | null
          exemption_ref?: string | null
          exemption_type?: string | null
          id?: string
          jurisdiction?: string
          product_id?: string | null
          rate_pct?: number
          residency?: string
          tax_type?: string
          threshold?: number
          updated_at?: string
          wht_gl_account_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "savings_wht_rule_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_wht_rule_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_wht_rule_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_wht_rule_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "savings_product"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_wht_rule_wht_gl_account_id_fkey"
            columns: ["wht_gl_account_id"]
            isOneToOne: false
            referencedRelation: "gl_account"
            referencedColumns: ["id"]
          },
        ]
      }
      screening_config: {
        Row: {
          auto_escalate_direct: boolean
          company_id: string
          created_at: string
          tier1_min_score: number
          tier2_min_score: number
          updated_at: string
        }
        Insert: {
          auto_escalate_direct?: boolean
          company_id: string
          created_at?: string
          tier1_min_score?: number
          tier2_min_score?: number
          updated_at?: string
        }
        Update: {
          auto_escalate_direct?: boolean
          company_id?: string
          created_at?: string
          tier1_min_score?: number
          tier2_min_score?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "screening_config_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      security_type: {
        Row: {
          active: boolean
          category: string
          company_id: string
          created_at: string
          fields: Json
          id: string
          kind: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          category: string
          company_id: string
          created_at?: string
          fields?: Json
          id?: string
          kind: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string
          company_id?: string
          created_at?: string
          fields?: Json
          id?: string
          kind?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "security_type_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          branch_id: string
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          phone: string | null
          role: Database["public"]["Enums"]["staff_role"]
          user_id: string | null
        }
        Insert: {
          branch_id: string
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          is_active?: boolean
          phone?: string | null
          role?: Database["public"]["Enums"]["staff_role"]
          user_id?: string | null
        }
        Update: {
          branch_id?: string
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          phone?: string | null
          role?: Database["public"]["Enums"]["staff_role"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branch"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plan: {
        Row: {
          active: boolean
          code: string
          created_at: string
          currency: string
          features: Json
          id: string
          name: string
          price_annual: number
          price_monthly: number
          seat_limit: number | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          currency?: string
          features?: Json
          id?: string
          name: string
          price_annual?: number
          price_monthly?: number
          seat_limit?: number | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          currency?: string
          features?: Json
          id?: string
          name?: string
          price_annual?: number
          price_monthly?: number
          seat_limit?: number | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      user_custom_role: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          role_id: string
          staff_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          role_id: string
          staff_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          role_id?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_custom_role_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "custom_role"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_custom_role_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      workflow_action: {
        Row: {
          acted_at: string
          actor_user_id: string
          comment: string | null
          created_at: string
          decision: Database["public"]["Enums"]["workflow_action_decision"]
          due_at: string | null
          escalated_at: string | null
          id: string
          instance_id: string
          step_order: number
        }
        Insert: {
          acted_at?: string
          actor_user_id: string
          comment?: string | null
          created_at?: string
          decision: Database["public"]["Enums"]["workflow_action_decision"]
          due_at?: string | null
          escalated_at?: string | null
          id?: string
          instance_id: string
          step_order: number
        }
        Update: {
          acted_at?: string
          actor_user_id?: string
          comment?: string | null
          created_at?: string
          decision?: Database["public"]["Enums"]["workflow_action_decision"]
          due_at?: string | null
          escalated_at?: string | null
          id?: string
          instance_id?: string
          step_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "workflow_action_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "workflow_instance"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_definition: {
        Row: {
          company_id: string
          created_at: string
          description: string | null
          id: string
          is_enabled: boolean
          name: string
          transaction_type: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_enabled?: boolean
          name: string
          transaction_type: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_enabled?: boolean
          name?: string
          transaction_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_definition_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_instance: {
        Row: {
          amount: number | null
          applied_rule_id: string | null
          chain_snapshot: Json | null
          company_id: string
          completed_at: string | null
          created_at: string
          current_step: number
          id: string
          initiated_at: string
          initiated_by: string
          reference_id: string | null
          reference_label: string
          status: Database["public"]["Enums"]["workflow_instance_status"]
          transaction_type: string
          updated_at: string
          workflow_id: string
        }
        Insert: {
          amount?: number | null
          applied_rule_id?: string | null
          chain_snapshot?: Json | null
          company_id: string
          completed_at?: string | null
          created_at?: string
          current_step?: number
          id?: string
          initiated_at?: string
          initiated_by: string
          reference_id?: string | null
          reference_label: string
          status?: Database["public"]["Enums"]["workflow_instance_status"]
          transaction_type: string
          updated_at?: string
          workflow_id: string
        }
        Update: {
          amount?: number | null
          applied_rule_id?: string | null
          chain_snapshot?: Json | null
          company_id?: string
          completed_at?: string | null
          created_at?: string
          current_step?: number
          id?: string
          initiated_at?: string
          initiated_by?: string
          reference_id?: string | null
          reference_label?: string
          status?: Database["public"]["Enums"]["workflow_instance_status"]
          transaction_type?: string
          updated_at?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_instance_applied_rule_id_fkey"
            columns: ["applied_rule_id"]
            isOneToOne: false
            referencedRelation: "delegation_rule"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_instance_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_instance_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflow_definition"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_step: {
        Row: {
          approver_kind: Database["public"]["Enums"]["workflow_approver_kind"]
          branch_id: string | null
          created_at: string
          custom_role_id: string | null
          escalation_custom_role_id: string | null
          escalation_role: Database["public"]["Enums"]["staff_role"] | null
          id: string
          name: string
          required_approvals: number
          role: Database["public"]["Enums"]["staff_role"] | null
          sla_action: Database["public"]["Enums"]["workflow_sla_action"]
          sla_hours: number | null
          step_order: number
          updated_at: string
          user_id: string | null
          workflow_id: string
        }
        Insert: {
          approver_kind: Database["public"]["Enums"]["workflow_approver_kind"]
          branch_id?: string | null
          created_at?: string
          custom_role_id?: string | null
          escalation_custom_role_id?: string | null
          escalation_role?: Database["public"]["Enums"]["staff_role"] | null
          id?: string
          name: string
          required_approvals?: number
          role?: Database["public"]["Enums"]["staff_role"] | null
          sla_action?: Database["public"]["Enums"]["workflow_sla_action"]
          sla_hours?: number | null
          step_order: number
          updated_at?: string
          user_id?: string | null
          workflow_id: string
        }
        Update: {
          approver_kind?: Database["public"]["Enums"]["workflow_approver_kind"]
          branch_id?: string | null
          created_at?: string
          custom_role_id?: string | null
          escalation_custom_role_id?: string | null
          escalation_role?: Database["public"]["Enums"]["staff_role"] | null
          id?: string
          name?: string
          required_approvals?: number
          role?: Database["public"]["Enums"]["staff_role"] | null
          sla_action?: Database["public"]["Enums"]["workflow_sla_action"]
          sla_hours?: number | null
          step_order?: number
          updated_at?: string
          user_id?: string | null
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_step_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branch"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_step_custom_role_id_fkey"
            columns: ["custom_role_id"]
            isOneToOne: false
            referencedRelation: "custom_role"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_step_escalation_custom_role_id_fkey"
            columns: ["escalation_custom_role_id"]
            isOneToOne: false
            referencedRelation: "custom_role"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_step_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflow_definition"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_loan_outstanding: {
        Row: {
          loan_id: string | null
          outstanding_principal: number | null
          principal: number | null
          principal_repaid: number | null
        }
        Relationships: []
      }
      v_par_aging: {
        Row: {
          bucket: string | null
          principal_at_risk: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      _app_row_company_ok: { Args: { _app_id: string }; Returns: boolean }
      accrue_savings_interest_daily: {
        Args: { _business_date?: string; _company_id: string }
        Returns: Json
      }
      assert_savings_txn_permission: {
        Args: { _company_id: string; _txn_type: string }
        Returns: undefined
      }
      can_backdate_repayment: { Args: { _loan_id: string }; Returns: boolean }
      cancel_loan_application: {
        Args: {
          _application_id: string
          _reason: string
          _transition_key: string
        }
        Returns: Json
      }
      capitalize_savings_interest: {
        Args: { _company_id: string; _force?: boolean; _period_end?: string }
        Returns: Json
      }
      claim_pending_domain_events: {
        Args: { _limit?: number }
        Returns: {
          actor_user_id: string | null
          aggregate_id: string
          aggregate_type: string
          attempt_count: number
          company_id: string | null
          created_at: string
          dispatch_attempts: number
          dispatched_at: string | null
          domain: string
          event_type: string
          id: string
          idempotency_key: string | null
          last_dispatch_error: string | null
          last_error: string | null
          metadata: Json
          next_attempt_at: string
          occurred_at: string
          payload: Json
          status: Database["public"]["Enums"]["domain_event_status"]
        }[]
        SetofOptions: {
          from: "*"
          to: "domain_event"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      close_savings_account: {
        Args: {
          _account_id: string
          _external_ref?: string
          _idempotency_key?: string
          _payout_channel?: string
          _reason: string
        }
        Returns: Json
      }
      company_id_of_branch: { Args: { _branch_id: string }; Returns: string }
      compute_trial_balance: {
        Args: { _as_at: string; _company_id: string }
        Returns: {
          account_id: string
          balance: number
          code: string
          credits: number
          debits: number
          name: string
        }[]
      }
      current_business_date: { Args: never; Returns: string }
      current_company_id: { Args: never; Returns: string }
      current_staff_branch: { Args: never; Returns: string }
      current_staff_id: { Args: never; Returns: string }
      current_staff_role: {
        Args: never
        Returns: Database["public"]["Enums"]["staff_role"]
      }
      decide_loan_application: {
        Args: {
          _application_id: string
          _comment?: string
          _decision: string
          _step_key?: string
          _transition_key?: string
          _workflow_instance_id?: string
        }
        Returns: Json
      }
      disburse_loan_from_application: {
        Args: {
          _application_id: string
          _idempotency_key?: string
          _payment_channel?: string
          _payment_reference?: string
        }
        Returns: string
      }
      dispatch_savings_auto_collections: {
        Args: { _apikey: string; _webhook_url: string }
        Returns: Json
      }
      emit_audit: {
        Args: {
          _action: string
          _after?: Json
          _before?: Json
          _company_id: string
          _entity_id: string
          _entity_type: string
          _metadata?: Json
        }
        Returns: string
      }
      emit_domain_event: {
        Args: {
          _aggregate_id: string
          _aggregate_type: string
          _company_id: string
          _domain: string
          _event_type: string
          _idempotency_key?: string
          _metadata?: Json
          _payload?: Json
        }
        Returns: string
      }
      ensure_eod_partitions: { Args: { _month: string }; Returns: undefined }
      eod_approve_and_run: { Args: { _run_id: string }; Returns: undefined }
      eod_close: {
        Args: { _branch_id: string; _business_date: string }
        Returns: string
      }
      eod_finalize: {
        Args: { _run_id: string; _status: string }
        Returns: undefined
      }
      eod_initiate: {
        Args: { _branch_id: string; _business_date: string }
        Returns: string
      }
      eod_precheck: {
        Args: { _branch_id: string; _business_date: string }
        Returns: Json
      }
      eod_record_step: {
        Args: {
          _error: string
          _metrics: Json
          _run_id: string
          _status: string
          _step_key: string
        }
        Returns: undefined
      }
      eod_reopen: {
        Args: { _branch_id: string; _business_date: string; _reason: string }
        Returns: undefined
      }
      eod_save_reports: {
        Args: { _reports: Json; _run_id: string }
        Returns: undefined
      }
      execute_savings_loan_mandate: {
        Args: { _mandate_id: string; _run_id: string }
        Returns: Json
      }
      execute_savings_standing_order: {
        Args: { _business_date?: string; _id: string }
        Returns: Json
      }
      finalize_savings_hold_release: {
        Args: { _decision: string; _instance_id: string }
        Returns: undefined
      }
      hardening_autocheck: { Args: never; Returns: Json }
      has_authority: {
        Args: { _authority_id: string; _user_id: string }
        Returns: boolean
      }
      has_permission:
        | { Args: { _permission: string; _user_id: string }; Returns: boolean }
        | {
            Args: { _company_id: string; _permission: string; _user_id: string }
            Returns: boolean
          }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_capitalization_date: {
        Args: { _date: string; _freq: string }
        Returns: boolean
      }
      is_company_admin: { Args: { _company_id: string }; Returns: boolean }
      is_company_member: { Args: { _company_id: string }; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      list_audit_log: {
        Args: {
          _action_prefix?: string
          _company_id: string
          _entity_type?: string
          _limit?: number
          _offset?: number
        }
        Returns: {
          action: string
          actor_user_id: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          metadata: Json
        }[]
      }
      list_cron_jobs: {
        Args: never
        Returns: {
          active: boolean
          command: string
          jobid: number
          jobname: string
          last_end: string
          last_return_message: string
          last_start: string
          last_status: string
          schedule: string
        }[]
      }
      loan_arrears_snapshot:
        | {
            Args: { _loan_id: string }
            Returns: {
              arrears: number
              full_installment: number
              next_due: string
            }[]
          }
        | {
            Args: { _as_of?: string; _loan_id: string }
            Returns: {
              arrears: number
              full_installment: number
              next_due: string
            }[]
          }
      mark_domain_event_dispatched: {
        Args: { _id: string }
        Returns: undefined
      }
      mark_domain_event_failed: {
        Args: { _error: string; _id: string }
        Returns: undefined
      }
      mark_savings_dormant: { Args: { _account_id: string }; Returns: string }
      next_contract_no:
        | {
            Args: {
              _branch_id: string
              _company_id: string
              _product_id: string
              _segment: number
            }
            Returns: string
          }
        | {
            Args: {
              _branch_id: string
              _company_id: string
              _product_id: string
              _segment: number
            }
            Returns: string
          }
      next_fd_certificate_no: { Args: { _company_id: string }; Returns: string }
      next_loan_application_no: { Args: never; Returns: string }
      next_savings_account_no: {
        Args: { _company_id: string }
        Returns: string
      }
      next_standing_order_date: {
        Args: {
          _freq: Database["public"]["Enums"]["standing_order_frequency"]
          _from: string
        }
        Returns: string
      }
      open_savings_account: {
        Args: {
          _branch_id: string
          _channel?: string
          _client_id: string
          _communication_preference?: string
          _external_ref?: string
          _holders?: Json
          _idempotency_key?: string
          _mandate?: Json
          _narration?: string
          _nominees?: Json
          _opening_deposit: number
          _product_id: string
          _special_instructions?: string
          _statement_preference?: string
        }
        Returns: Json
      }
      post_entry: {
        Args: {
          _branch_id?: string
          _description: string
          _entry_date: string
          _idempotency_key?: string
          _lines: Json
          _loan_id?: string
          _reference: string
          _source_module?: string
          _source_ref?: string
        }
        Returns: string
      }
      post_entry_system: {
        Args: {
          _branch_id?: string
          _company_id: string
          _description: string
          _entry_date: string
          _idempotency_key?: string
          _lines: Json
          _loan_id?: string
          _reference: string
          _source_module?: string
          _source_ref?: string
        }
        Returns: string
      }
      post_manual_journal: {
        Args: {
          p_description: string
          p_entry_date: string
          p_lines: Json
          p_reference: string
        }
        Returns: Json
      }
      post_savings_transfer: {
        Args: {
          _amount: number
          _channel?: string
          _from_account_id: string
          _idempotency_key?: string
          _narration?: string
          _reference?: string
          _to_account_id: string
        }
        Returns: Json
      }
      record_repayment: {
        Args: {
          _amount: number
          _channel: string
          _idempotency_key?: string
          _loan_id: string
          _notes?: string
          _received_at?: string
          _reference?: string
        }
        Returns: Json
      }
      record_savings_txn: {
        Args: {
          _account_id: string
          _amount: number
          _channel?: string
          _external_ref?: string
          _idempotency_key?: string
          _narration?: string
          _payment_details?: Json
          _payment_method?: string
          _reference?: string
          _txn_type: string
        }
        Returns: string
      }
      record_write_off_recovery: {
        Args: {
          _amount: number
          _charges: number
          _idempotency_key?: string
          _interest: number
          _notes?: string
          _payment_method: string
          _principal: number
          _recovery_date: string
          _reference?: string
          _write_off_id: string
        }
        Returns: string
      }
      request_savings_hold_release: {
        Args: { _hold_id: string; _instance_id: string; _reason: string }
        Returns: undefined
      }
      reschedule_loan: {
        Args: { _loan_id: string; _new_installments: Json; _reason: string }
        Returns: string
      }
      resolve_loan_approval_chain: { Args: { _loan_id: string }; Returns: Json }
      resolve_loan_approval_chain_raw: {
        Args: {
          _annual_rate_pct: number
          _client_id: string
          _principal: number
          _product_id: string
        }
        Returns: Json
      }
      resolve_savings_wht_rule: {
        Args: { _account_id: string; _as_of: string; _company_id: string }
        Returns: {
          rate_pct: number
          rule_id: string
          threshold: number
          wht_gl_account_id: string
        }[]
      }
      return_loan_application: {
        Args: {
          _application_id: string
          _reason: string
          _transition_key: string
        }
        Returns: Json
      }
      reverse_savings_txn: {
        Args: { _reason: string; _txn_id: string }
        Returns: string
      }
      run_savings_auto_collection: {
        Args: {
          _business_date?: string
          _company_id: string
          _triggered_by?: string
          _window: string
        }
        Returns: Json
      }
      run_savings_standing_orders: {
        Args: { _business_date?: string; _company_id: string }
        Returns: Json
      }
      savings_active_hold_amount: {
        Args: { _account_id: string }
        Returns: number
      }
      savings_round: {
        Args: { _amount: number; _dp?: number; _mode: string }
        Returns: number
      }
      seed_default_risk_scheme: {
        Args: { _company_id: string }
        Returns: undefined
      }
      set_cron_job_active: {
        Args: { _active: boolean; _jobid: number }
        Returns: undefined
      }
      start_dynamic_loan_workflow: { Args: { _loan_id: string }; Returns: Json }
      submit_loan_application: {
        Args: { _application_id: string; _transition_key: string }
        Returns: Json
      }
      transfer_savings_to_unclaimed: {
        Args: { _account_id: string; _idempotency_key?: string }
        Returns: string
      }
      upsert_fd_alco_rate_version: {
        Args: {
          _active?: boolean
          _cbsl_max_rate: number
          _effective_from?: string
          _maximum_rate: number
          _note?: string
          _product_id: string
          _standard_rate: number
        }
        Returns: string
      }
      upsert_fd_rate_tier_version: {
        Args: {
          _annual_rate: number
          _effective_from?: string
          _note?: string
          _product_id: string
          _tenure_months: number
        }
        Returns: string
      }
      upsert_loan_alco_rate_version: {
        Args: {
          _active?: boolean
          _effective_from?: string
          _equipment_vehicle: string
          _max_period_months: number
          _max_rate: number
          _min_period_months: number
          _min_rate: number
          _note?: string
          _product_id: string
          _security_type_id: string
        }
        Returns: string
      }
      upsert_savings_alco_rate_version: {
        Args: {
          _active?: boolean
          _annual_rate: number
          _effective_from?: string
          _max_balance: number
          _min_balance: number
          _note?: string
          _product_id: string
        }
        Returns: string
      }
      write_off_loan: {
        Args: {
          _idempotency_key?: string
          _loan_id: string
          _reason: string
          _use_provision?: boolean
        }
        Returns: string
      }
    }
    Enums: {
      account_type: "asset" | "liability" | "equity" | "income" | "expense"
      app_role: "loan_officer" | "branch_manager" | "admin" | "platform_admin"
      client_status:
        | "pending_kyc"
        | "active"
        | "dormant"
        | "blacklisted"
        | "exited"
      domain_event_status: "pending" | "dispatched" | "failed" | "skipped"
      fd_dispatch_option: "post" | "branch" | "digital"
      fd_interest_payment_mode: "bank_transfer" | "credit_savings"
      fd_maturity_instruction:
        | "payout"
        | "renew_principal"
        | "renew_principal_interest"
      fd_payout_option: "monthly" | "at_maturity"
      fd_penalty_type: "rate_reduction" | "reprice_minus_margin"
      fd_status:
        | "pending"
        | "active"
        | "matured"
        | "prematurely_closed"
        | "renewed"
      fd_txn_type:
        | "opening"
        | "interest_payout"
        | "premature_closure"
        | "maturity_payout"
        | "renewal"
        | "deposit_receipt"
        | "withdrawal"
      installment_state:
        | "upcoming"
        | "due"
        | "paid"
        | "partial"
        | "overdue"
        | "waived"
        | "cancelled"
      interest_method: "flat" | "declining_balance"
      introducer_commission_mode: "cash" | "bank_transfer" | "credit_savings"
      loan_application_status:
        | "draft"
        | "submitted"
        | "under_review"
        | "approved"
        | "rejected"
        | "disbursed"
        | "cancelled"
      loan_charge_origin: "inhouse" | "outside"
      loan_charge_type: "fixed" | "variable" | "manual"
      loan_status:
        | "draft"
        | "submitted"
        | "approved"
        | "rejected"
        | "disbursed"
        | "active"
        | "closed"
        | "written_off"
      passbook_stock_status:
        | "in_stock"
        | "partially_issued"
        | "exhausted"
        | "void"
      payment_channel: "cash" | "mpesa" | "bank" | "internal"
      repayment_frequency: "weekly" | "biweekly" | "monthly" | "daily"
      risk_applies_to: "both" | "individual" | "corporate"
      risk_band_level: "low" | "medium" | "high"
      risk_grade: "low" | "medium" | "high"
      savings_account_status:
        | "active"
        | "dormant"
        | "frozen"
        | "closed"
        | "pending_funding"
        | "debit_blocked"
        | "credit_blocked"
        | "fully_blocked"
      savings_channel:
        | "branch"
        | "atm"
        | "ceft"
        | "internet_banking"
        | "mobile"
        | "api"
        | "other"
      savings_charge_frequency: "one_time" | "monthly" | "annual"
      savings_txn_type:
        | "deposit"
        | "withdrawal"
        | "interest"
        | "fee"
        | "opening"
        | "closure"
        | "adjustment"
        | "reversal"
        | "transfer_in"
        | "transfer_out"
        | "loan_deduction"
        | "wht"
        | "hold"
        | "hold_release"
      staff_role:
        | "loan_officer"
        | "branch_manager"
        | "teller"
        | "operations"
        | "admin"
      standing_order_frequency:
        | "daily"
        | "weekly"
        | "monthly"
        | "quarterly"
        | "yearly"
      standing_order_status: "active" | "paused" | "cancelled" | "completed"
      workflow_action_decision: "approve" | "decline" | "send_back"
      workflow_approver_kind: "role" | "branch_role" | "user"
      workflow_instance_status:
        | "pending"
        | "approved"
        | "declined"
        | "cancelled"
      workflow_sla_action: "flag" | "escalate"
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
    Enums: {
      account_type: ["asset", "liability", "equity", "income", "expense"],
      app_role: ["loan_officer", "branch_manager", "admin", "platform_admin"],
      client_status: [
        "pending_kyc",
        "active",
        "dormant",
        "blacklisted",
        "exited",
      ],
      domain_event_status: ["pending", "dispatched", "failed", "skipped"],
      fd_dispatch_option: ["post", "branch", "digital"],
      fd_interest_payment_mode: ["bank_transfer", "credit_savings"],
      fd_maturity_instruction: [
        "payout",
        "renew_principal",
        "renew_principal_interest",
      ],
      fd_payout_option: ["monthly", "at_maturity"],
      fd_penalty_type: ["rate_reduction", "reprice_minus_margin"],
      fd_status: [
        "pending",
        "active",
        "matured",
        "prematurely_closed",
        "renewed",
      ],
      fd_txn_type: [
        "opening",
        "interest_payout",
        "premature_closure",
        "maturity_payout",
        "renewal",
        "deposit_receipt",
        "withdrawal",
      ],
      installment_state: [
        "upcoming",
        "due",
        "paid",
        "partial",
        "overdue",
        "waived",
        "cancelled",
      ],
      interest_method: ["flat", "declining_balance"],
      introducer_commission_mode: ["cash", "bank_transfer", "credit_savings"],
      loan_application_status: [
        "draft",
        "submitted",
        "under_review",
        "approved",
        "rejected",
        "disbursed",
        "cancelled",
      ],
      loan_charge_origin: ["inhouse", "outside"],
      loan_charge_type: ["fixed", "variable", "manual"],
      loan_status: [
        "draft",
        "submitted",
        "approved",
        "rejected",
        "disbursed",
        "active",
        "closed",
        "written_off",
      ],
      passbook_stock_status: [
        "in_stock",
        "partially_issued",
        "exhausted",
        "void",
      ],
      payment_channel: ["cash", "mpesa", "bank", "internal"],
      repayment_frequency: ["weekly", "biweekly", "monthly", "daily"],
      risk_applies_to: ["both", "individual", "corporate"],
      risk_band_level: ["low", "medium", "high"],
      risk_grade: ["low", "medium", "high"],
      savings_account_status: [
        "active",
        "dormant",
        "frozen",
        "closed",
        "pending_funding",
        "debit_blocked",
        "credit_blocked",
        "fully_blocked",
      ],
      savings_channel: [
        "branch",
        "atm",
        "ceft",
        "internet_banking",
        "mobile",
        "api",
        "other",
      ],
      savings_charge_frequency: ["one_time", "monthly", "annual"],
      savings_txn_type: [
        "deposit",
        "withdrawal",
        "interest",
        "fee",
        "opening",
        "closure",
        "adjustment",
        "reversal",
        "transfer_in",
        "transfer_out",
        "loan_deduction",
        "wht",
        "hold",
        "hold_release",
      ],
      staff_role: [
        "loan_officer",
        "branch_manager",
        "teller",
        "operations",
        "admin",
      ],
      standing_order_frequency: [
        "daily",
        "weekly",
        "monthly",
        "quarterly",
        "yearly",
      ],
      standing_order_status: ["active", "paused", "cancelled", "completed"],
      workflow_action_decision: ["approve", "decline", "send_back"],
      workflow_approver_kind: ["role", "branch_role", "user"],
      workflow_instance_status: [
        "pending",
        "approved",
        "declined",
        "cancelled",
      ],
      workflow_sla_action: ["flag", "escalate"],
    },
  },
} as const
