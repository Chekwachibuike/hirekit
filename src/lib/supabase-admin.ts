// Service-role admin client — ONLY for Next.js API Route Handlers.
// The service role key bypasses RLS, so this must never be imported in
// any file that could end up in the browser bundle.
// Rule: only import from files inside /src/app/api/** or /src/lib/actions/**
import { createClient } from '@supabase/supabase-js'

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set. Add it to .env.local (server-side only — no NEXT_PUBLIC_ prefix).')
}

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)
