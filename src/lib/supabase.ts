// Browser-side Supabase client + all shared types.
// Import from here in Client Components.
import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

// Each call to createBrowserClient() spins up its own GoTrueClient with its
// own auth-refresh timers and storage listeners. Calling it fresh in every
// component (Header, dashboard, calendar, auth page) triggers Supabase's
// "Multiple GoTrueClient instances detected" warning and duplicated background
// work. Cache a single instance per browser tab and hand the same one to
// every caller instead.
let browserClient: SupabaseClient | undefined

export function createSupabaseBrowserClient() {
  if (!browserClient) {
    browserClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return browserClient
}

// ── Types ────────────────────────────────────────────────────
export type AppStatus = 'draft' | 'applied' | 'interview' | 'offer' | 'rejected' | 'ghosted'

export interface JobApplication {
  id: string
  company: string
  role: string
  location: string
  status: AppStatus
  applied_date: string
  salary_range?: string
  notes?: string
  cover_letter_id?: string
  cv_version?: string
  job_url?: string
  contact_name?: string
  contact_email?: string
  created_at: string
  updated_at: string
}

export interface Project {
  id: string
  title: string
  description: string
  category: 'frontend' | 'backend' | 'fullstack' | 'embedded' | 'iot' | 'pcb' | 'other'
  tech_stack: string[]
  github_url?: string
  live_url?: string
  image_url?: string
  featured: boolean
  published_to_portfolio: boolean
  created_at: string
}

export interface CoverLetter {
  id: string
  title: string
  company: string
  role: string
  content: string
  tone: 'formal' | 'confident' | 'casual'
  status: 'draft' | 'final'
  created_at: string
  updated_at: string
}

export interface PersonalInfo {
  id: string
  full_name: string
  email: string
  phone: string
  location: string
  linkedin?: string
  github?: string
  portfolio_url?: string
  summary: string
  skills: string[]
  experience: WorkExperience[]
  education: Education[]
  cv_markdown?: string
  cv_file_name?: string
}

export interface WorkExperience {
  company: string
  role: string
  start: string
  end: string | 'Present'
  bullets: string[]
}

export interface Education {
  institution: string
  degree: string
  field: string
  year: string
  grade?: string
}

export interface InterviewTopic {
  id: string
  role: string
  topic: string
  subtopics: string[]
  priority: 'high' | 'medium' | 'low'
  completed: boolean
  scheduled_date?: string
  notes?: string
  created_at: string
}

export interface CalendarEvent {
  id: string
  title: string
  type: 'interview' | 'deadline' | 'study' | 'follow_up' | 'other'
  date: string
  time?: string
  application_id?: string
  notes?: string
  google_event_id?: string
  /** iCalendar RRULE body without the "RRULE:" prefix. Undefined = one-off. */
  recurrence?: string
  /** Minutes before the event to notify. null = Google default, -1 = none. */
  reminder_minutes?: number | null
  created_at: string
}

export interface ContentPost {
  id: string
  project_id?: string
  platform: 'linkedin' | 'instagram' | 'facebook'
  caption: string
  image_url?: string
  status: 'draft' | 'scheduled' | 'posted'
  scheduled_at?: string
  posted_at?: string
  created_at: string
}

export interface CvVersion {
  id: string
  label: string
  cv_markdown: string
  created_at: string
}

export interface AppMode {
  mode: 'manual' | 'auto'
}
