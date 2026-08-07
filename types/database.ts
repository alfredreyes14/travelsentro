export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      contacts: {
        Row: {
          created_at: string
          created_by: string | null
          created_by_name: string | null
          email: string
          id: string
          name: string
          opted_out: boolean
          phone: string | null
          status: string
          tags: string[]
          updated_at: string
          updated_by: string | null
          updated_by_name: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          email: string
          id?: string
          name: string
          opted_out?: boolean
          phone?: string | null
          status?: string
          tags?: string[]
          updated_at?: string
          updated_by?: string | null
          updated_by_name?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          email?: string
          id?: string
          name?: string
          opted_out?: boolean
          phone?: string | null
          status?: string
          tags?: string[]
          updated_at?: string
          updated_by?: string | null
          updated_by_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      destinations: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          photo_storage_path: string | null
          region: string
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          photo_storage_path?: string | null
          region: string
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          photo_storage_path?: string | null
          region?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      hero_slides: {
        Row: {
          created_at: string
          cta_label: string | null
          external_link: string | null
          headline: string | null
          id: string
          image_storage_path: string | null
          package_id: string | null
          slide_type: string
          sort_order: number
          subheading: string | null
        }
        Insert: {
          created_at?: string
          cta_label?: string | null
          external_link?: string | null
          headline?: string | null
          id?: string
          image_storage_path?: string | null
          package_id?: string | null
          slide_type: string
          sort_order?: number
          subheading?: string | null
        }
        Update: {
          created_at?: string
          cta_label?: string | null
          external_link?: string | null
          headline?: string | null
          id?: string
          image_storage_path?: string | null
          package_id?: string | null
          slide_type?: string
          sort_order?: number
          subheading?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hero_slides_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      inquiries: {
        Row: {
          contact_id: string
          created_at: string
          id: string
          message: string
          package_id: string | null
          request_id: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          id?: string
          message: string
          package_id?: string | null
          request_id: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          id?: string
          message?: string
          package_id?: string | null
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inquiries_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiries_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      itinerary_days: {
        Row: {
          day_number: number
          description: string
          id: string
          package_id: string
          title: string
        }
        Insert: {
          day_number: number
          description: string
          id?: string
          package_id: string
          title: string
        }
        Update: {
          day_number?: number
          description?: string
          id?: string
          package_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "itinerary_days_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          batch_id: string | null
          body: string
          channel: string
          contact_id: string
          created_at: string
          id: string
          provider_message_id: string | null
          sent_by: string | null
          sent_by_name: string | null
          status: string
          subject: string | null
        }
        Insert: {
          batch_id?: string | null
          body: string
          channel: string
          contact_id: string
          created_at?: string
          id?: string
          provider_message_id?: string | null
          sent_by?: string | null
          sent_by_name?: string | null
          status?: string
          subject?: string | null
        }
        Update: {
          batch_id?: string | null
          body?: string
          channel?: string
          contact_id?: string
          created_at?: string
          id?: string
          provider_message_id?: string | null
          sent_by?: string | null
          sent_by_name?: string | null
          status?: string
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      package_inclusions: {
        Row: {
          id: string
          kind: string
          label: string
          package_id: string
          sort_order: number
        }
        Insert: {
          id?: string
          kind: string
          label: string
          package_id: string
          sort_order?: number
        }
        Update: {
          id?: string
          kind?: string
          label?: string
          package_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "package_inclusions_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      package_photos: {
        Row: {
          alt_text: string | null
          display_order: number
          id: string
          package_id: string
          storage_path: string
        }
        Insert: {
          alt_text?: string | null
          display_order?: number
          id?: string
          package_id: string
          storage_path: string
        }
        Update: {
          alt_text?: string | null
          display_order?: number
          id?: string
          package_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "package_photos_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      package_travel_dates: {
        Row: {
          additional_fee: number | null
          created_at: string
          id: string
          package_id: string
          travel_date: string
        }
        Insert: {
          additional_fee?: number | null
          created_at?: string
          id?: string
          package_id: string
          travel_date: string
        }
        Update: {
          additional_fee?: number | null
          created_at?: string
          id?: string
          package_id?: string
          travel_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "package_travel_dates_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      packages: {
        Row: {
          created_at: string
          deleted_at: string | null
          destination_id: string | null
          discount_amount: number | null
          duration_label: string | null
          id: string
          is_featured: boolean
          is_published: boolean
          name: string
          price_per_pax: number
          remarks: string | null
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          destination_id?: string | null
          discount_amount?: number | null
          duration_label?: string | null
          id?: string
          is_featured?: boolean
          is_published?: boolean
          name: string
          price_per_pax: number
          remarks?: string | null
          slug?: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          destination_id?: string | null
          discount_amount?: number | null
          duration_label?: string | null
          id?: string
          is_featured?: boolean
          is_published?: boolean
          name?: string
          price_per_pax?: number
          remarks?: string | null
          slug?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "packages_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
        ]
      }
      partners: {
        Row: {
          created_at: string
          id: string
          link_url: string | null
          logo_storage_path: string
          partner_type: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          link_url?: string | null
          logo_storage_path: string
          partner_type: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          link_url?: string | null
          logo_storage_path?: string
          partner_type?: string
          sort_order?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          can_edit_crm: boolean
          can_manage_packages: boolean
          can_message_customers: boolean
          created_at: string
          email: string
          id: string
          is_active: boolean
          name: string | null
          role: string
        }
        Insert: {
          can_edit_crm?: boolean
          can_manage_packages?: boolean
          can_message_customers?: boolean
          created_at?: string
          email: string
          id: string
          is_active?: boolean
          name?: string | null
          role?: string
        }
        Update: {
          can_edit_crm?: boolean
          can_manage_packages?: boolean
          can_message_customers?: boolean
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean
          name?: string | null
          role?: string
        }
        Relationships: []
      }
      testimonials: {
        Row: {
          created_at: string
          customer_name: string
          id: string
          photo_storage_path: string | null
          quote: string
          rating: number
          sort_order: number
        }
        Insert: {
          created_at?: string
          customer_name: string
          id?: string
          photo_storage_path?: string | null
          quote: string
          rating: number
          sort_order?: number
        }
        Update: {
          created_at?: string
          customer_name?: string
          id?: string
          photo_storage_path?: string | null
          quote?: string
          rating?: number
          sort_order?: number
        }
        Relationships: []
      }
      value_props: {
        Row: {
          created_at: string
          description: string
          id: string
          sort_order: number
          title: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          sort_order?: number
          title: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          sort_order?: number
          title?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_notification_recipients: {
        Args: never
        Returns: {
          email: string
        }[]
      }
      has_permission: { Args: { perm: string; uid: string }; Returns: boolean }
      record_inquiry: {
        Args: {
          p_email: string
          p_message: string
          p_name: string
          p_package_id?: string
          p_phone: string
          p_request_id: string
        }
        Returns: {
          contact_id: string
          inquiry_id: string
          is_new: boolean
        }[]
      }
      set_contact_opted_out: {
        Args: { p_contact_id: string }
        Returns: undefined
      }
      write_package_children: {
        Args: {
          p_inclusions: Json
          p_itinerary: Json
          p_package_id: string
          p_travel_dates: Json
        }
        Returns: undefined
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

