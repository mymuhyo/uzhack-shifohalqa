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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      ai_clinical_briefs: {
        Row: {
          approved_at: string | null
          approved_by_doctor_id: string | null
          approved_reply_uz: string | null
          brief_date: string
          cited_record_ids: Json
          created_at: string
          deterministic_metrics: Json
          doctor_draft_uz: string
          doctor_id: string | null
          highlights: Json
          id: string
          level: number
          model: string | null
          narrative_uz: string
          patient_id: string
          prompt_hash: string | null
          provider: string | null
          source_mode: string
          workspace_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by_doctor_id?: string | null
          approved_reply_uz?: string | null
          brief_date?: string
          cited_record_ids?: Json
          created_at?: string
          deterministic_metrics: Json
          doctor_draft_uz?: string
          doctor_id?: string | null
          highlights?: Json
          id?: string
          level?: number
          model?: string | null
          narrative_uz: string
          patient_id: string
          prompt_hash?: string | null
          provider?: string | null
          source_mode: string
          workspace_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by_doctor_id?: string | null
          approved_reply_uz?: string | null
          brief_date?: string
          cited_record_ids?: Json
          created_at?: string
          deterministic_metrics?: Json
          doctor_draft_uz?: string
          doctor_id?: string | null
          highlights?: Json
          id?: string
          level?: number
          model?: string | null
          narrative_uz?: string
          patient_id?: string
          prompt_hash?: string | null
          provider?: string | null
          source_mode?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_clinical_briefs_approved_by_doctor_fk"
            columns: ["workspace_id", "approved_by_doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "ai_clinical_briefs_workspace_id_doctor_id_fkey"
            columns: ["workspace_id", "doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "ai_clinical_briefs_workspace_id_patient_id_fkey"
            columns: ["workspace_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      ai_rate_limits: {
        Row: {
          requests: number
          scope: string
          window_ends_at: string
        }
        Insert: {
          requests: number
          scope: string
          window_ends_at: string
        }
        Update: {
          requests?: number
          scope?: string
          window_ends_at?: string
        }
        Relationships: []
      }
      android_demo_access: {
        Row: {
          pairing_expires_at: string | null
          pairing_hash: string | null
          patient_id: string
          session_expires_at: string | null
          session_hash: string | null
          workspace_id: string
        }
        Insert: {
          pairing_expires_at?: string | null
          pairing_hash?: string | null
          patient_id: string
          session_expires_at?: string | null
          session_hash?: string | null
          workspace_id: string
        }
        Update: {
          pairing_expires_at?: string | null
          pairing_hash?: string | null
          patient_id?: string
          session_expires_at?: string | null
          session_hash?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "android_demo_access_workspace_id_patient_id_fkey"
            columns: ["workspace_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      audit_events: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          evidence_log_id: string
          id: string
          metadata: Json
          workspace_id: string
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          evidence_log_id: string
          id?: string
          metadata?: Json
          workspace_id: string
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          evidence_log_id?: string
          id?: string
          metadata?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_workspace_id_evidence_log_id_fkey"
            columns: ["workspace_id", "evidence_log_id"]
            isOneToOne: false
            referencedRelation: "evidence_logs"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      caregiver_acks: {
        Row: {
          activity_date: string
          created_at: string
          id: string
          kind: string
          patient_id: string
          workspace_id: string
        }
        Insert: {
          activity_date?: string
          created_at?: string
          id?: string
          kind: string
          patient_id: string
          workspace_id: string
        }
        Update: {
          activity_date?: string
          created_at?: string
          id?: string
          kind?: string
          patient_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "caregiver_acks_workspace_id_patient_id_fkey"
            columns: ["workspace_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      caregiver_audit_events: {
        Row: {
          action: string
          created_at: string
          id: string
          patient_id: string
          workspace_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          patient_id: string
          workspace_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          patient_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "caregiver_audit_events_workspace_id_patient_id_fkey"
            columns: ["workspace_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      caregiver_links: {
        Row: {
          expires_at: string
          patient_id: string
          revoked_at: string | null
          token_hash: string
          workspace_id: string
        }
        Insert: {
          expires_at: string
          patient_id: string
          revoked_at?: string | null
          token_hash: string
          workspace_id: string
        }
        Update: {
          expires_at?: string
          patient_id?: string
          revoked_at?: string | null
          token_hash?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "caregiver_links_workspace_id_patient_id_fkey"
            columns: ["workspace_id", "patient_id"]
            isOneToOne: true
            referencedRelation: "patients"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      clinic_memberships: {
        Row: {
          actor_id: string
          created_at: string
          id: string
          is_demo: boolean
          role: string
          status: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          id?: string
          is_demo?: boolean
          role: string
          status?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          id?: string
          is_demo?: boolean
          role?: string
          status?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_memberships_workspace_id_is_demo_fkey"
            columns: ["workspace_id", "is_demo"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "is_demo"]
          },
        ]
      }
      daily_step_counts: {
        Row: {
          activity_date: string
          ai_mode: string
          level: number
          patient_id: string
          source: string
          step_count: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          activity_date: string
          ai_mode?: string
          level?: number
          patient_id: string
          source?: string
          step_count: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          activity_date?: string
          ai_mode?: string
          level?: number
          patient_id?: string
          source?: string
          step_count?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_step_counts_workspace_id_patient_id_fkey"
            columns: ["workspace_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      doctors: {
        Row: {
          demo_key: string | null
          id: string
          name: string
          workspace_id: string
        }
        Insert: {
          demo_key?: string | null
          id?: string
          name: string
          workspace_id: string
        }
        Update: {
          demo_key?: string | null
          id?: string
          name?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctors_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      dorimos_scan_limits: {
        Row: {
          scans: number
          scope: string
          window_ends_at: string
        }
        Insert: {
          scans: number
          scope: string
          window_ends_at: string
        }
        Update: {
          scans?: number
          scope?: string
          window_ends_at?: string
        }
        Relationships: []
      }
      environment_identity: {
        Row: {
          description: string
          env_id: string
          singleton: boolean
          updated_at: string
        }
        Insert: {
          description?: string
          env_id: string
          singleton?: boolean
          updated_at?: string
        }
        Update: {
          description?: string
          env_id?: string
          singleton?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      evidence_logs: {
        Row: {
          ai_mode: string
          created_at: string
          entry_kind: string
          file_sha256: string | null
          id: string
          level: number
          ocr_confidence: number | null
          ocr_scan_id: string | null
          ocr_storage_path: string | null
          patient_confirmed: boolean
          payload: Json
          source: string
          task_instance_id: string
          workspace_id: string
        }
        Insert: {
          ai_mode: string
          created_at?: string
          entry_kind?: string
          file_sha256?: string | null
          id?: string
          level: number
          ocr_confidence?: number | null
          ocr_scan_id?: string | null
          ocr_storage_path?: string | null
          patient_confirmed?: boolean
          payload: Json
          source: string
          task_instance_id: string
          workspace_id: string
        }
        Update: {
          ai_mode?: string
          created_at?: string
          entry_kind?: string
          file_sha256?: string | null
          id?: string
          level?: number
          ocr_confidence?: number | null
          ocr_scan_id?: string | null
          ocr_storage_path?: string | null
          patient_confirmed?: boolean
          payload?: Json
          source?: string
          task_instance_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evidence_logs_ocr_scan_fk"
            columns: ["workspace_id", "ocr_scan_id"]
            isOneToOne: false
            referencedRelation: "vitals_ocr_scans"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "evidence_logs_workspace_id_task_instance_id_fkey"
            columns: ["workspace_id", "task_instance_id"]
            isOneToOne: false
            referencedRelation: "task_instances"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      exercise_attempts: {
        Row: {
          ai_mode: string
          ai_video_analysis: Json | null
          analyzed_frames: number | null
          client_attempt_id: string | null
          client_request_hash: string | null
          confidence: number | null
          created_at: string
          diagnostics: Json | null
          file_sha256: string | null
          flag_color: string | null
          id: string
          is_primary: boolean
          level: number
          min_angle: number | null
          motion_signature: Json | null
          movement: string
          prescription_id: string
          reason: string
          review_decision: string | null
          review_reply: string | null
          reviewed_at: string | null
          scheduled_date: string
          shallow_reps: number | null
          similar_motion: boolean
          source: string
          suspicious_segments: Json
          valid_reps: number | null
          video_consented: boolean
          video_duration_sec: number | null
          video_expires_at: string | null
          video_mime_type: string | null
          video_size_bytes: number | null
          video_storage_path: string | null
          video_uploaded_at: string | null
          workspace_id: string
        }
        Insert: {
          ai_mode: string
          ai_video_analysis?: Json | null
          analyzed_frames?: number | null
          client_attempt_id?: string | null
          client_request_hash?: string | null
          confidence?: number | null
          created_at?: string
          diagnostics?: Json | null
          file_sha256?: string | null
          flag_color?: string | null
          id?: string
          is_primary: boolean
          level: number
          min_angle?: number | null
          motion_signature?: Json | null
          movement?: string
          prescription_id: string
          reason: string
          review_decision?: string | null
          review_reply?: string | null
          reviewed_at?: string | null
          scheduled_date?: string
          shallow_reps?: number | null
          similar_motion: boolean
          source: string
          suspicious_segments?: Json
          valid_reps?: number | null
          video_consented?: boolean
          video_duration_sec?: number | null
          video_expires_at?: string | null
          video_mime_type?: string | null
          video_size_bytes?: number | null
          video_storage_path?: string | null
          video_uploaded_at?: string | null
          workspace_id: string
        }
        Update: {
          ai_mode?: string
          ai_video_analysis?: Json | null
          analyzed_frames?: number | null
          client_attempt_id?: string | null
          client_request_hash?: string | null
          confidence?: number | null
          created_at?: string
          diagnostics?: Json | null
          file_sha256?: string | null
          flag_color?: string | null
          id?: string
          is_primary?: boolean
          level?: number
          min_angle?: number | null
          motion_signature?: Json | null
          movement?: string
          prescription_id?: string
          reason?: string
          review_decision?: string | null
          review_reply?: string | null
          reviewed_at?: string | null
          scheduled_date?: string
          shallow_reps?: number | null
          similar_motion?: boolean
          source?: string
          suspicious_segments?: Json
          valid_reps?: number | null
          video_consented?: boolean
          video_duration_sec?: number | null
          video_expires_at?: string | null
          video_mime_type?: string | null
          video_size_bytes?: number | null
          video_storage_path?: string | null
          video_uploaded_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exercise_attempts_workspace_id_prescription_id_fkey"
            columns: ["workspace_id", "prescription_id"]
            isOneToOne: false
            referencedRelation: "exercise_prescriptions"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      exercise_prescriptions: {
        Row: {
          doctor_id: string | null
          id: string
          max_shallow: number
          movement: string
          pain_color: string
          patient_id: string
          target_angle: number
          target_reps: number
          workspace_id: string
        }
        Insert: {
          doctor_id?: string | null
          id?: string
          max_shallow: number
          movement?: string
          pain_color: string
          patient_id: string
          target_angle: number
          target_reps: number
          workspace_id: string
        }
        Update: {
          doctor_id?: string | null
          id?: string
          max_shallow?: number
          movement?: string
          pain_color?: string
          patient_id?: string
          target_angle?: number
          target_reps?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exercise_prescriptions_workspace_id_patient_id_doctor_id_fkey"
            columns: ["workspace_id", "patient_id", "doctor_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["workspace_id", "id", "doctor_id"]
          },
          {
            foreignKeyName: "exercise_prescriptions_workspace_id_patient_id_fkey"
            columns: ["workspace_id", "patient_id"]
            isOneToOne: true
            referencedRelation: "patients"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      exercise_segments: {
        Row: {
          ai_review: Json | null
          attempt_id: string
          clip_storage_path: string | null
          created_at: string
          cycle_index: number
          doctor_flagged: boolean
          error_codes: string[]
          from_ms: number
          id: string
          keyframe_storage_path: string | null
          peak_angle_deg: number | null
          severity: string
          summary_uz: string
          to_ms: number
          workspace_id: string
        }
        Insert: {
          ai_review?: Json | null
          attempt_id: string
          clip_storage_path?: string | null
          created_at?: string
          cycle_index: number
          doctor_flagged?: boolean
          error_codes?: string[]
          from_ms: number
          id?: string
          keyframe_storage_path?: string | null
          peak_angle_deg?: number | null
          severity: string
          summary_uz?: string
          to_ms: number
          workspace_id: string
        }
        Update: {
          ai_review?: Json | null
          attempt_id?: string
          clip_storage_path?: string | null
          created_at?: string
          cycle_index?: number
          doctor_flagged?: boolean
          error_codes?: string[]
          from_ms?: number
          id?: string
          keyframe_storage_path?: string | null
          peak_angle_deg?: number | null
          severity?: string
          summary_uz?: string
          to_ms?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exercise_segments_workspace_id_attempt_id_fkey"
            columns: ["workspace_id", "attempt_id"]
            isOneToOne: false
            referencedRelation: "exercise_attempts"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      flag_followups: {
        Row: {
          acknowledged_at: string | null
          acknowledged_note: string | null
          created_at: string
          flag_id: string
          id: string
          kind: string
          payload: Json
          workspace_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_note?: string | null
          created_at?: string
          flag_id: string
          id?: string
          kind: string
          payload?: Json
          workspace_id: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_note?: string | null
          created_at?: string
          flag_id?: string
          id?: string
          kind?: string
          payload?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flag_followups_workspace_id_flag_id_fkey"
            columns: ["workspace_id", "flag_id"]
            isOneToOne: false
            referencedRelation: "flags"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      flags: {
        Row: {
          color: string
          decision: string | null
          detail: Json
          doctor_note: string | null
          evidence_log_id: string
          id: string
          patient_reply: string | null
          reviewed_at: string | null
          rule_key: string
          workspace_id: string
        }
        Insert: {
          color: string
          decision?: string | null
          detail: Json
          doctor_note?: string | null
          evidence_log_id: string
          id?: string
          patient_reply?: string | null
          reviewed_at?: string | null
          rule_key: string
          workspace_id: string
        }
        Update: {
          color?: string
          decision?: string | null
          detail?: Json
          doctor_note?: string | null
          evidence_log_id?: string
          id?: string
          patient_reply?: string | null
          reviewed_at?: string | null
          rule_key?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flags_workspace_id_evidence_log_id_fkey"
            columns: ["workspace_id", "evidence_log_id"]
            isOneToOne: true
            referencedRelation: "evidence_logs"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      parq_screenings: {
        Row: {
          completed_at: string
          created_at: string
          guidance_uz: string
          id: string
          patient_id: string
          recommended_daily_step_goal: number | null
          recommended_movement: string | null
          responses: Json
          risk_tier: string
          workspace_id: string
          yes_count: number
        }
        Insert: {
          completed_at?: string
          created_at?: string
          guidance_uz?: string
          id?: string
          patient_id: string
          recommended_daily_step_goal?: number | null
          recommended_movement?: string | null
          responses: Json
          risk_tier: string
          workspace_id: string
          yes_count: number
        }
        Update: {
          completed_at?: string
          created_at?: string
          guidance_uz?: string
          id?: string
          patient_id?: string
          recommended_daily_step_goal?: number | null
          recommended_movement?: string | null
          responses?: Json
          risk_tier?: string
          workspace_id?: string
          yes_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "parq_screenings_workspace_id_patient_id_fkey"
            columns: ["workspace_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      patients: {
        Row: {
          demo_key: string | null
          doctor_id: string | null
          id: string
          name: string
          profile: Json
          role_kind: string
          workspace_id: string
        }
        Insert: {
          demo_key?: string | null
          doctor_id?: string | null
          id?: string
          name: string
          profile?: Json
          role_kind?: string
          workspace_id: string
        }
        Update: {
          demo_key?: string | null
          doctor_id?: string | null
          id?: string
          name?: string
          profile?: Json
          role_kind?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "patients_workspace_id_doctor_id_fkey"
            columns: ["workspace_id", "doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "patients_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_items: {
        Row: {
          box_strength_mg: number | null
          due_time: string
          id: string
          plan_id: string
          sort_order: number
          strength_unit: string
          title: string
          type: string
          workspace_id: string
        }
        Insert: {
          box_strength_mg?: number | null
          due_time: string
          id?: string
          plan_id: string
          sort_order?: number
          strength_unit?: string
          title: string
          type: string
          workspace_id: string
        }
        Update: {
          box_strength_mg?: number | null
          due_time?: string
          id?: string
          plan_id?: string
          sort_order?: number
          strength_unit?: string
          title?: string
          type?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_items_workspace_id_plan_id_fkey"
            columns: ["workspace_id", "plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      plans: {
        Row: {
          daily_step_goal: number
          doctor_id: string | null
          id: string
          patient_id: string
          start_date: string
          supply_follow_up: boolean
          vitals_target: Json
          workspace_id: string
        }
        Insert: {
          daily_step_goal?: number
          doctor_id?: string | null
          id?: string
          patient_id: string
          start_date?: string
          supply_follow_up: boolean
          vitals_target: Json
          workspace_id: string
        }
        Update: {
          daily_step_goal?: number
          doctor_id?: string | null
          id?: string
          patient_id?: string
          start_date?: string
          supply_follow_up?: boolean
          vitals_target?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plans_workspace_id_patient_id_doctor_id_fkey"
            columns: ["workspace_id", "patient_id", "doctor_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["workspace_id", "id", "doctor_id"]
          },
          {
            foreignKeyName: "plans_workspace_id_patient_id_fkey"
            columns: ["workspace_id", "patient_id"]
            isOneToOne: true
            referencedRelation: "patients"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          default_role: string | null
          full_name: string
          id: string
          phone: string | null
          preferred_locale: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_role?: string | null
          full_name: string
          id: string
          phone?: string | null
          preferred_locale?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_role?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          preferred_locale?: string
          updated_at?: string
        }
        Relationships: []
      }
      task_instances: {
        Row: {
          id: string
          plan_item_id: string
          scheduled_date: string
          status: string
          workspace_id: string
        }
        Insert: {
          id?: string
          plan_item_id: string
          scheduled_date: string
          status?: string
          workspace_id: string
        }
        Update: {
          id?: string
          plan_item_id?: string
          scheduled_date?: string
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_instances_workspace_id_plan_item_id_fkey"
            columns: ["workspace_id", "plan_item_id"]
            isOneToOne: false
            referencedRelation: "plan_items"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      teach_back_attempts: {
        Row: {
          activity_date: string
          answers: Json
          created_at: string
          id: string
          passed: boolean
          patient_id: string
          plan_id: string | null
          score: number
          total_questions: number
          workspace_id: string
        }
        Insert: {
          activity_date?: string
          answers: Json
          created_at?: string
          id?: string
          passed: boolean
          patient_id: string
          plan_id?: string | null
          score: number
          total_questions: number
          workspace_id: string
        }
        Update: {
          activity_date?: string
          answers?: Json
          created_at?: string
          id?: string
          passed?: boolean
          patient_id?: string
          plan_id?: string | null
          score?: number
          total_questions?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teach_back_attempts_workspace_id_patient_id_fkey"
            columns: ["workspace_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "teach_back_attempts_workspace_id_plan_id_fkey"
            columns: ["workspace_id", "plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      telegram_doctor_events: {
        Row: {
          attempted_at: string | null
          created_at: string
          delivery_status: string
          doctor_id: string
          id: string
          kind: string
          link_id: string
          message_text: string
          next_attempt_at: string
          ref_key: string
          workspace_id: string
        }
        Insert: {
          attempted_at?: string | null
          created_at?: string
          delivery_status?: string
          doctor_id: string
          id?: string
          kind: string
          link_id: string
          message_text: string
          next_attempt_at?: string
          ref_key: string
          workspace_id: string
        }
        Update: {
          attempted_at?: string | null
          created_at?: string
          delivery_status?: string
          doctor_id?: string
          id?: string
          kind?: string
          link_id?: string
          message_text?: string
          next_attempt_at?: string
          ref_key?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_doctor_events_workspace_id_doctor_id_link_id_fkey"
            columns: ["workspace_id", "doctor_id", "link_id"]
            isOneToOne: false
            referencedRelation: "telegram_doctor_links"
            referencedColumns: ["workspace_id", "doctor_id", "link_id"]
          },
        ]
      }
      telegram_doctor_links: {
        Row: {
          chat_id: number
          connected_at: string
          doctor_id: string
          link_id: string
          paired_message_at: number | null
          paired_update_id: number | null
          workspace_id: string
        }
        Insert: {
          chat_id: number
          connected_at?: string
          doctor_id: string
          link_id?: string
          paired_message_at?: number | null
          paired_update_id?: number | null
          workspace_id: string
        }
        Update: {
          chat_id?: number
          connected_at?: string
          doctor_id?: string
          link_id?: string
          paired_message_at?: number | null
          paired_update_id?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_doctor_links_workspace_id_doctor_id_fkey"
            columns: ["workspace_id", "doctor_id"]
            isOneToOne: true
            referencedRelation: "doctors"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      telegram_flag_notices: {
        Row: {
          attempted_at: string | null
          created_at: string
          delivery_status: string
          doctor_id: string
          flag_id: string
          link_id: string
          next_attempt_at: string
          workspace_id: string
        }
        Insert: {
          attempted_at?: string | null
          created_at?: string
          delivery_status?: string
          doctor_id: string
          flag_id: string
          link_id: string
          next_attempt_at?: string
          workspace_id: string
        }
        Update: {
          attempted_at?: string | null
          created_at?: string
          delivery_status?: string
          doctor_id?: string
          flag_id?: string
          link_id?: string
          next_attempt_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_flag_notices_workspace_id_doctor_id_link_id_fkey"
            columns: ["workspace_id", "doctor_id", "link_id"]
            isOneToOne: false
            referencedRelation: "telegram_doctor_links"
            referencedColumns: ["workspace_id", "doctor_id", "link_id"]
          },
          {
            foreignKeyName: "telegram_flag_notices_workspace_id_flag_id_fkey"
            columns: ["workspace_id", "flag_id"]
            isOneToOne: true
            referencedRelation: "flags"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      telegram_pairings: {
        Row: {
          code_hash: string
          doctor_id: string
          expires_at: string
          redeemed_at: string | null
          workspace_id: string
        }
        Insert: {
          code_hash: string
          doctor_id: string
          expires_at: string
          redeemed_at?: string | null
          workspace_id: string
        }
        Update: {
          code_hash?: string
          doctor_id?: string
          expires_at?: string
          redeemed_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_pairings_workspace_id_doctor_id_fkey"
            columns: ["workspace_id", "doctor_id"]
            isOneToOne: true
            referencedRelation: "doctors"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      telegram_patient_links: {
        Row: {
          chat_id: number
          connected_at: string
          link_id: string
          paired_message_at: number | null
          paired_update_id: number | null
          patient_id: string
          workspace_id: string
        }
        Insert: {
          chat_id: number
          connected_at?: string
          link_id?: string
          paired_message_at?: number | null
          paired_update_id?: number | null
          patient_id: string
          workspace_id: string
        }
        Update: {
          chat_id?: number
          connected_at?: string
          link_id?: string
          paired_message_at?: number | null
          paired_update_id?: number | null
          patient_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_patient_links_workspace_id_patient_id_fkey"
            columns: ["workspace_id", "patient_id"]
            isOneToOne: true
            referencedRelation: "patients"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      telegram_patient_notices: {
        Row: {
          attempted_at: string | null
          created_at: string
          delivery_status: string
          id: string
          kind: string
          link_id: string
          message_text: string
          next_attempt_at: string
          patient_id: string
          ref_id: string
          workspace_id: string
        }
        Insert: {
          attempted_at?: string | null
          created_at?: string
          delivery_status?: string
          id?: string
          kind: string
          link_id: string
          message_text: string
          next_attempt_at?: string
          patient_id: string
          ref_id: string
          workspace_id: string
        }
        Update: {
          attempted_at?: string | null
          created_at?: string
          delivery_status?: string
          id?: string
          kind?: string
          link_id?: string
          message_text?: string
          next_attempt_at?: string
          patient_id?: string
          ref_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_patient_notices_workspace_id_patient_id_link_id_fkey"
            columns: ["workspace_id", "patient_id", "link_id"]
            isOneToOne: false
            referencedRelation: "telegram_patient_links"
            referencedColumns: ["workspace_id", "patient_id", "link_id"]
          },
        ]
      }
      telegram_patient_pairings: {
        Row: {
          code_hash: string
          expires_at: string
          patient_id: string
          redeemed_at: string | null
          workspace_id: string
        }
        Insert: {
          code_hash: string
          expires_at: string
          patient_id: string
          redeemed_at?: string | null
          workspace_id: string
        }
        Update: {
          code_hash?: string
          expires_at?: string
          patient_id?: string
          redeemed_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_patient_pairings_workspace_id_patient_id_fkey"
            columns: ["workspace_id", "patient_id"]
            isOneToOne: true
            referencedRelation: "patients"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      urgent_symptoms: {
        Row: {
          created_at: string
          doctor_note: string | null
          id: string
          level: number
          note: string
          patient_id: string
          patient_reply: string | null
          review_decision: string | null
          reviewed_at: string | null
          symptom: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          doctor_note?: string | null
          id?: string
          level?: number
          note?: string
          patient_id: string
          patient_reply?: string | null
          review_decision?: string | null
          reviewed_at?: string | null
          symptom: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          doctor_note?: string | null
          id?: string
          level?: number
          note?: string
          patient_id?: string
          patient_reply?: string | null
          review_decision?: string | null
          reviewed_at?: string | null
          symptom?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "urgent_symptoms_workspace_id_patient_id_fkey"
            columns: ["workspace_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      vitals_ocr_scans: {
        Row: {
          confidence: number | null
          confirmed_at: string | null
          created_at: string
          diastolic: number | null
          evidence_log_id: string | null
          id: string
          image_sha256: string | null
          model: string | null
          patient_confirmed: boolean
          patient_id: string
          provider: string
          pulse: number | null
          quality_status: string
          raw_extraction: Json
          storage_path: string | null
          systolic: number | null
          task_instance_id: string
          workspace_id: string
        }
        Insert: {
          confidence?: number | null
          confirmed_at?: string | null
          created_at?: string
          diastolic?: number | null
          evidence_log_id?: string | null
          id?: string
          image_sha256?: string | null
          model?: string | null
          patient_confirmed?: boolean
          patient_id: string
          provider: string
          pulse?: number | null
          quality_status: string
          raw_extraction?: Json
          storage_path?: string | null
          systolic?: number | null
          task_instance_id: string
          workspace_id: string
        }
        Update: {
          confidence?: number | null
          confirmed_at?: string | null
          created_at?: string
          diastolic?: number | null
          evidence_log_id?: string | null
          id?: string
          image_sha256?: string | null
          model?: string | null
          patient_confirmed?: boolean
          patient_id?: string
          provider?: string
          pulse?: number | null
          quality_status?: string
          raw_extraction?: Json
          storage_path?: string | null
          systolic?: number | null
          task_instance_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vitals_ocr_scans_workspace_id_evidence_log_id_fkey"
            columns: ["workspace_id", "evidence_log_id"]
            isOneToOne: false
            referencedRelation: "evidence_logs"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "vitals_ocr_scans_workspace_id_patient_id_fkey"
            columns: ["workspace_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "vitals_ocr_scans_workspace_id_task_instance_id_fkey"
            columns: ["workspace_id", "task_instance_id"]
            isOneToOne: false
            referencedRelation: "task_instances"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          id: string
          is_demo: boolean
          kind: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_demo?: boolean
          kind?: string
          name?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_demo?: boolean
          kind?: string
          name?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
