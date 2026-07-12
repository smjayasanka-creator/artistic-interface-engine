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
      branch: {
        Row: {
          branch_prefix: string | null
          code: string
          company_id: string
          created_at: string
          currency: string
          fd_prefix: string | null
          id: string
          loan_prefix: string | null
          name: string
          opened_on: string | null
          region: string | null
          savings_prefix: string | null
        }
        Insert: {
          branch_prefix?: string | null
          code: string
          company_id: string
          created_at?: string
          currency?: string
          fd_prefix?: string | null
          id?: string
          loan_prefix?: string | null
          name: string
          opened_on?: string | null
          region?: string | null
          savings_prefix?: string | null
        }
        Update: {
          branch_prefix?: string | null
          code?: string
          company_id?: string
          created_at?: string
          currency?: string
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
          district: string | null
          divisional_secretariat: string | null
          email: string | null
          first_name: string | null
          full_name: string
          gender: string | null
          geo_lat: number | null
          geo_lng: number | null
          gn_division: string | null
          group_id: string | null
          id: string
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
          risk_grade: Database["public"]["Enums"]["risk_grade"] | null
          status: Database["public"]["Enums"]["client_status"]
        }
        Insert: {
          address?: string | null
          avatar_color?: string | null
          branch_id: string
          created_at?: string
          date_of_birth?: string | null
          district?: string | null
          divisional_secretariat?: string | null
          email?: string | null
          first_name?: string | null
          full_name: string
          gender?: string | null
          geo_lat?: number | null
          geo_lng?: number | null
          gn_division?: string | null
          group_id?: string | null
          id?: string
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
          risk_grade?: Database["public"]["Enums"]["risk_grade"] | null
          status?: Database["public"]["Enums"]["client_status"]
        }
        Update: {
          address?: string | null
          avatar_color?: string | null
          branch_id?: string
          created_at?: string
          date_of_birth?: string | null
          district?: string | null
          divisional_secretariat?: string | null
          email?: string | null
          first_name?: string | null
          full_name?: string
          gender?: string | null
          geo_lat?: number | null
          geo_lng?: number | null
          gn_division?: string | null
          group_id?: string | null
          id?: string
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
      company: {
        Row: {
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
      fd_accrual: {
        Row: {
          accrual_date: string
          cumulative_amount: number
          daily_amount: number
          deposit_id: string
          id: string
        }
        Insert: {
          accrual_date: string
          cumulative_amount: number
          daily_amount: number
          deposit_id: string
          id?: string
        }
        Update: {
          accrual_date?: string
          cumulative_amount?: number
          daily_amount?: number
          deposit_id?: string
          id?: string
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
          deposit_id: string
          id: string
          name: string
          nic: string | null
          percentage: number
          relationship: string | null
        }
        Insert: {
          deposit_id: string
          id?: string
          name: string
          nic?: string | null
          percentage: number
          relationship?: string | null
        }
        Update: {
          deposit_id?: string
          id?: string
          name?: string
          nic?: string | null
          percentage?: number
          relationship?: string | null
        }
        Relationships: [
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
          code: string
          company_id: string
          created_at: string
          id: string
          max_amount: number | null
          min_amount: number
          name: string
          penalty_type: Database["public"]["Enums"]["fd_penalty_type"]
          penalty_value: number
          updated_at: string
          wht_rate: number
        }
        Insert: {
          active?: boolean
          allow_at_maturity?: boolean
          allow_monthly?: boolean
          auto_renewal_default?: Database["public"]["Enums"]["fd_maturity_instruction"]
          code: string
          company_id: string
          created_at?: string
          id?: string
          max_amount?: number | null
          min_amount?: number
          name: string
          penalty_type?: Database["public"]["Enums"]["fd_penalty_type"]
          penalty_value?: number
          updated_at?: string
          wht_rate?: number
        }
        Update: {
          active?: boolean
          allow_at_maturity?: boolean
          allow_monthly?: boolean
          auto_renewal_default?: Database["public"]["Enums"]["fd_maturity_instruction"]
          code?: string
          company_id?: string
          created_at?: string
          id?: string
          max_amount?: number | null
          min_amount?: number
          name?: string
          penalty_type?: Database["public"]["Enums"]["fd_penalty_type"]
          penalty_value?: number
          updated_at?: string
          wht_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "fd_product_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      fd_rate_tier: {
        Row: {
          annual_rate: number
          created_at: string
          effective_from: string
          effective_to: string | null
          id: string
          product_id: string
          tenure_months: number
        }
        Insert: {
          annual_rate: number
          created_at?: string
          effective_from: string
          effective_to?: string | null
          id?: string
          product_id: string
          tenure_months: number
        }
        Update: {
          annual_rate?: number
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          product_id?: string
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
        ]
      }
      fd_transaction: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          deposit_id: string
          id: string
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
          id: string
          maturity_date: string
          maturity_instruction: Database["public"]["Enums"]["fd_maturity_instruction"]
          parent_fd_id: string | null
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
          id?: string
          maturity_date: string
          maturity_instruction: Database["public"]["Enums"]["fd_maturity_instruction"]
          parent_fd_id?: string | null
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
          id?: string
          maturity_date?: string
          maturity_instruction?: Database["public"]["Enums"]["fd_maturity_instruction"]
          parent_fd_id?: string | null
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
            foreignKeyName: "fixed_deposit_parent_fd_id_fkey"
            columns: ["parent_fd_id"]
            isOneToOne: false
            referencedRelation: "fixed_deposit"
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
          loan_id: string | null
          posted_by: string | null
          reference: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          description?: string | null
          entry_date?: string
          id?: string
          loan_id?: string | null
          posted_by?: string | null
          reference: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          description?: string | null
          entry_date?: string
          id?: string
          loan_id?: string | null
          posted_by?: string | null
          reference?: string
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
          approved_at: string | null
          approved_by: string | null
          branch_id: string
          client_id: string
          closed_at: string | null
          created_at: string
          disbursed_at: string | null
          frequency: Database["public"]["Enums"]["repayment_frequency"]
          id: string
          officer_id: string | null
          principal: number
          product_id: string
          purpose: string | null
          status: Database["public"]["Enums"]["loan_status"]
          submitted_at: string | null
          term_months: number
        }
        Insert: {
          annual_rate_pct: number
          approved_at?: string | null
          approved_by?: string | null
          branch_id: string
          client_id: string
          closed_at?: string | null
          created_at?: string
          disbursed_at?: string | null
          frequency?: Database["public"]["Enums"]["repayment_frequency"]
          id?: string
          officer_id?: string | null
          principal: number
          product_id: string
          purpose?: string | null
          status?: Database["public"]["Enums"]["loan_status"]
          submitted_at?: string | null
          term_months: number
        }
        Update: {
          annual_rate_pct?: number
          approved_at?: string | null
          approved_by?: string | null
          branch_id?: string
          client_id?: string
          closed_at?: string | null
          created_at?: string
          disbursed_at?: string | null
          frequency?: Database["public"]["Enums"]["repayment_frequency"]
          id?: string
          officer_id?: string | null
          principal?: number
          product_id?: string
          purpose?: string | null
          status?: Database["public"]["Enums"]["loan_status"]
          submitted_at?: string | null
          term_months?: number
        }
        Relationships: [
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
      loan_installment: {
        Row: {
          due_date: string
          fee_due: number
          fee_paid: number
          id: string
          interest_due: number
          interest_paid: number
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
      loan_product: {
        Row: {
          annual_rate_pct: number
          cash_account_id: string | null
          color: string | null
          company_id: string
          fee_income_account_id: string | null
          frequency: Database["public"]["Enums"]["repayment_frequency"]
          id: string
          interest_income_account_id: string | null
          interest_method: Database["public"]["Enums"]["interest_method"]
          is_active: boolean
          max_principal: number | null
          max_term_months: number
          min_principal: number
          min_term_months: number
          name: string
          principal_account_id: string | null
          processing_fee_pct: number
          required_documents: string[]
          termination_fee: number
          termination_fee_pct: number
        }
        Insert: {
          annual_rate_pct: number
          cash_account_id?: string | null
          color?: string | null
          company_id: string
          fee_income_account_id?: string | null
          frequency?: Database["public"]["Enums"]["repayment_frequency"]
          id?: string
          interest_income_account_id?: string | null
          interest_method?: Database["public"]["Enums"]["interest_method"]
          is_active?: boolean
          max_principal?: number | null
          max_term_months?: number
          min_principal?: number
          min_term_months?: number
          name: string
          principal_account_id?: string | null
          processing_fee_pct?: number
          required_documents?: string[]
          termination_fee?: number
          termination_fee_pct?: number
        }
        Update: {
          annual_rate_pct?: number
          cash_account_id?: string | null
          color?: string | null
          company_id?: string
          fee_income_account_id?: string | null
          frequency?: Database["public"]["Enums"]["repayment_frequency"]
          id?: string
          interest_income_account_id?: string | null
          interest_method?: Database["public"]["Enums"]["interest_method"]
          is_active?: boolean
          max_principal?: number | null
          max_term_months?: number
          min_principal?: number
          min_term_months?: number
          name?: string
          principal_account_id?: string | null
          processing_fee_pct?: number
          required_documents?: string[]
          termination_fee?: number
          termination_fee_pct?: number
        }
        Relationships: [
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
            foreignKeyName: "loan_product_principal_account_id_fkey"
            columns: ["principal_account_id"]
            isOneToOne: false
            referencedRelation: "gl_account"
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
          amount: number
          channel: Database["public"]["Enums"]["payment_channel"]
          entry_id: string
          id: string
          loan_id: string
          received_at: string
          received_by: string | null
        }
        Insert: {
          amount: number
          channel: Database["public"]["Enums"]["payment_channel"]
          entry_id: string
          id?: string
          loan_id: string
          received_at?: string
          received_by?: string | null
        }
        Update: {
          amount?: number
          channel?: Database["public"]["Enums"]["payment_channel"]
          entry_id?: string
          id?: string
          loan_id?: string
          received_at?: string
          received_by?: string | null
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
      savings_account: {
        Row: {
          account_no: string
          available_balance: number
          balance: number
          branch_id: string
          client_id: string
          closed_by: string | null
          closed_on: string | null
          closure_reason: string | null
          company_id: string
          created_at: string
          currency: string
          external_ref: string | null
          id: string
          interest_accrued: number
          last_txn_at: string | null
          opened_by: string | null
          opened_on: string
          product_id: string
          status: Database["public"]["Enums"]["savings_account_status"]
          updated_at: string
        }
        Insert: {
          account_no: string
          available_balance?: number
          balance?: number
          branch_id: string
          client_id: string
          closed_by?: string | null
          closed_on?: string | null
          closure_reason?: string | null
          company_id: string
          created_at?: string
          currency?: string
          external_ref?: string | null
          id?: string
          interest_accrued?: number
          last_txn_at?: string | null
          opened_by?: string | null
          opened_on?: string
          product_id: string
          status?: Database["public"]["Enums"]["savings_account_status"]
          updated_at?: string
        }
        Update: {
          account_no?: string
          available_balance?: number
          balance?: number
          branch_id?: string
          client_id?: string
          closed_by?: string | null
          closed_on?: string | null
          closure_reason?: string | null
          company_id?: string
          created_at?: string
          currency?: string
          external_ref?: string | null
          id?: string
          interest_accrued?: number
          last_txn_at?: string | null
          opened_by?: string | null
          opened_on?: string
          product_id?: string
          status?: Database["public"]["Enums"]["savings_account_status"]
          updated_at?: string
        }
        Relationships: [
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
          active: boolean
          closure_fee: number
          code: string
          company_id: string
          created_at: string
          currency: string
          dormancy_days: number
          id: string
          interest_rate_pct: number
          min_balance: number
          min_opening_balance: number
          name: string
          opening_fee: number
          passbook_required: boolean
          passbook_series_prefix: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          closure_fee?: number
          code: string
          company_id: string
          created_at?: string
          currency?: string
          dormancy_days?: number
          id?: string
          interest_rate_pct?: number
          min_balance?: number
          min_opening_balance?: number
          name: string
          opening_fee?: number
          passbook_required?: boolean
          passbook_series_prefix?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          closure_fee?: number
          code?: string
          company_id?: string
          created_at?: string
          currency?: string
          dormancy_days?: number
          id?: string
          interest_rate_pct?: number
          min_balance?: number
          min_opening_balance?: number
          name?: string
          opening_fee?: number
          passbook_required?: boolean
          passbook_series_prefix?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "savings_product_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
        ]
      }
      savings_transaction: {
        Row: {
          account_id: string
          amount: number
          channel: Database["public"]["Enums"]["savings_channel"]
          company_id: string
          created_at: string
          external_ref: string | null
          id: string
          idempotency_key: string | null
          narration: string | null
          performed_by: string | null
          reference: string | null
          running_balance: number
          txn_date: string
          txn_type: Database["public"]["Enums"]["savings_txn_type"]
        }
        Insert: {
          account_id: string
          amount: number
          channel?: Database["public"]["Enums"]["savings_channel"]
          company_id: string
          created_at?: string
          external_ref?: string | null
          id?: string
          idempotency_key?: string | null
          narration?: string | null
          performed_by?: string | null
          reference?: string | null
          running_balance: number
          txn_date?: string
          txn_type: Database["public"]["Enums"]["savings_txn_type"]
        }
        Update: {
          account_id?: string
          amount?: number
          channel?: Database["public"]["Enums"]["savings_channel"]
          company_id?: string
          created_at?: string
          external_ref?: string | null
          id?: string
          idempotency_key?: string | null
          narration?: string | null
          performed_by?: string | null
          reference?: string | null
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
            foreignKeyName: "savings_transaction_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "savings_transaction_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "staff"
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
      current_company_id: { Args: never; Returns: string }
      current_staff_branch: { Args: never; Returns: string }
      current_staff_id: { Args: never; Returns: string }
      hardening_autocheck: { Args: never; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_company_admin: { Args: { _company_id: string }; Returns: boolean }
      is_company_member: { Args: { _company_id: string }; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      next_fd_certificate_no: { Args: { _company_id: string }; Returns: string }
      next_savings_account_no: {
        Args: { _company_id: string }
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
      interest_method: "flat" | "declining_balance"
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
      risk_grade: "low" | "medium" | "high"
      savings_account_status: "active" | "dormant" | "frozen" | "closed"
      savings_channel:
        | "branch"
        | "atm"
        | "ceft"
        | "internet_banking"
        | "mobile"
        | "api"
        | "other"
      savings_txn_type:
        | "deposit"
        | "withdrawal"
        | "interest"
        | "fee"
        | "opening"
        | "closure"
        | "adjustment"
      staff_role:
        | "loan_officer"
        | "branch_manager"
        | "teller"
        | "operations"
        | "admin"
      workflow_action_decision: "approve" | "decline"
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
      ],
      interest_method: ["flat", "declining_balance"],
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
      risk_grade: ["low", "medium", "high"],
      savings_account_status: ["active", "dormant", "frozen", "closed"],
      savings_channel: [
        "branch",
        "atm",
        "ceft",
        "internet_banking",
        "mobile",
        "api",
        "other",
      ],
      savings_txn_type: [
        "deposit",
        "withdrawal",
        "interest",
        "fee",
        "opening",
        "closure",
        "adjustment",
      ],
      staff_role: [
        "loan_officer",
        "branch_manager",
        "teller",
        "operations",
        "admin",
      ],
      workflow_action_decision: ["approve", "decline"],
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
