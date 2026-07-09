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
      branch: {
        Row: {
          code: string
          created_at: string
          currency: string
          id: string
          name: string
          opened_on: string | null
          region: string | null
        }
        Insert: {
          code: string
          created_at?: string
          currency?: string
          id?: string
          name: string
          opened_on?: string | null
          region?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          currency?: string
          id?: string
          name?: string
          opened_on?: string | null
          region?: string | null
        }
        Relationships: []
      }
      client: {
        Row: {
          address: string | null
          avatar_color: string | null
          branch_id: string
          created_at: string
          date_of_birth: string | null
          email: string | null
          full_name: string
          gender: string | null
          group_id: string | null
          id: string
          joined_on: string | null
          monthly_income: number | null
          national_id: string | null
          next_of_kin_name: string | null
          next_of_kin_phone: string | null
          occupation: string | null
          officer_id: string | null
          phone: string | null
          risk_grade: Database["public"]["Enums"]["risk_grade"] | null
          status: Database["public"]["Enums"]["client_status"]
        }
        Insert: {
          address?: string | null
          avatar_color?: string | null
          branch_id: string
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          full_name: string
          gender?: string | null
          group_id?: string | null
          id?: string
          joined_on?: string | null
          monthly_income?: number | null
          national_id?: string | null
          next_of_kin_name?: string | null
          next_of_kin_phone?: string | null
          occupation?: string | null
          officer_id?: string | null
          phone?: string | null
          risk_grade?: Database["public"]["Enums"]["risk_grade"] | null
          status?: Database["public"]["Enums"]["client_status"]
        }
        Update: {
          address?: string | null
          avatar_color?: string | null
          branch_id?: string
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          full_name?: string
          gender?: string | null
          group_id?: string | null
          id?: string
          joined_on?: string | null
          monthly_income?: number | null
          national_id?: string | null
          next_of_kin_name?: string | null
          next_of_kin_phone?: string | null
          occupation?: string | null
          officer_id?: string | null
          phone?: string | null
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
      gl_account: {
        Row: {
          code: string
          id: string
          is_active: boolean
          name: string
          normal_balance: number
          type: Database["public"]["Enums"]["account_type"]
        }
        Insert: {
          code: string
          id?: string
          is_active?: boolean
          name: string
          normal_balance: number
          type: Database["public"]["Enums"]["account_type"]
        }
        Update: {
          code?: string
          id?: string
          is_active?: boolean
          name?: string
          normal_balance?: number
          type?: Database["public"]["Enums"]["account_type"]
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
          color: string | null
          frequency: Database["public"]["Enums"]["repayment_frequency"]
          id: string
          interest_method: Database["public"]["Enums"]["interest_method"]
          is_active: boolean
          max_principal: number | null
          max_term_months: number
          min_principal: number
          min_term_months: number
          name: string
          processing_fee_pct: number
        }
        Insert: {
          annual_rate_pct: number
          color?: string | null
          frequency?: Database["public"]["Enums"]["repayment_frequency"]
          id?: string
          interest_method?: Database["public"]["Enums"]["interest_method"]
          is_active?: boolean
          max_principal?: number | null
          max_term_months?: number
          min_principal?: number
          min_term_months?: number
          name: string
          processing_fee_pct?: number
        }
        Update: {
          annual_rate_pct?: number
          color?: string | null
          frequency?: Database["public"]["Enums"]["repayment_frequency"]
          id?: string
          interest_method?: Database["public"]["Enums"]["interest_method"]
          is_active?: boolean
          max_principal?: number | null
          max_term_months?: number
          min_principal?: number
          min_term_months?: number
          name?: string
          processing_fee_pct?: number
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
      current_staff_branch: { Args: never; Returns: string }
      current_staff_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: never; Returns: boolean }
    }
    Enums: {
      account_type: "asset" | "liability" | "equity" | "income" | "expense"
      app_role: "loan_officer" | "branch_manager" | "admin"
      client_status:
        | "pending_kyc"
        | "active"
        | "dormant"
        | "blacklisted"
        | "exited"
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
      payment_channel: "cash" | "mpesa" | "bank" | "internal"
      repayment_frequency: "weekly" | "biweekly" | "monthly" | "daily"
      risk_grade: "low" | "medium" | "high"
      staff_role:
        | "loan_officer"
        | "branch_manager"
        | "teller"
        | "operations"
        | "admin"
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
      app_role: ["loan_officer", "branch_manager", "admin"],
      client_status: [
        "pending_kyc",
        "active",
        "dormant",
        "blacklisted",
        "exited",
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
      payment_channel: ["cash", "mpesa", "bank", "internal"],
      repayment_frequency: ["weekly", "biweekly", "monthly", "daily"],
      risk_grade: ["low", "medium", "high"],
      staff_role: [
        "loan_officer",
        "branch_manager",
        "teller",
        "operations",
        "admin",
      ],
    },
  },
} as const
