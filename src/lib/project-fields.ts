// Field-by-field validation for project writes, shared by the projects API
// and the portfolio importer. A request body is never spread into a row:
// only the fields handled here can be written.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ProjectVisibility } from './supabase'

const VISIBILITIES: ProjectVisibility[] = ['pinned', 'published', 'hidden']
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Row = Record<string, unknown>
// error on both arms: tsconfig is not strict, so callers cannot narrow.
export type Clean = { ok: true; row: Row; error?: undefined } | { ok: false; error: string; row?: undefined }

function text(v: unknown, max: number, field: string): string | null | Error {
  if (v === undefined || v === null) return null
  if (typeof v !== 'string') return new Error(`${field} must be text`)
  const s = v.trim()
  if (s.length > max) return new Error(`${field} must be ${max} characters or fewer`)
  return s || null
}

function url(v: unknown, field: string): string | null | Error {
  const s = text(v, 500, field)
  if (s === null || s instanceof Error) return s
  try {
    const u = new URL(s)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error()
    return u.toString()
  } catch {
    return new Error(`${field} must be a full http(s) link`)
  }
}

/** Validates the writable fields present in body. partial: PATCH, where an
 *  absent field means "leave it". */
export async function cleanProject(body: Row, supabase: SupabaseClient, userId: string, partial: boolean): Promise<Clean> {
  const row: Row = {}
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k)

  if (!partial || has('title')) {
    const t = text(body.title, 120, 'Title')
    if (t instanceof Error) return { ok: false, error: t.message }
    if (!t) return { ok: false, error: 'Title is required' }
    row.title = t
  }
  for (const [k, max, label] of [['description', 4000, 'Description'], ['blurb', 160, 'Tagline'], ['year', 10, 'Year']] as const) {
    if (!partial || has(k)) {
      const v = text(body[k], max, label)
      if (v instanceof Error) return { ok: false, error: v.message }
      row[k] = k === 'description' ? (v ?? '') : v
    }
  }
  for (const [k, label] of [['github_url', 'Repository link'], ['live_url', 'Live link'], ['docs_url', 'Docs link'], ['image_url', 'Image link']] as const) {
    if (!partial || has(k)) {
      const v = url(body[k], label)
      if (v instanceof Error) return { ok: false, error: v.message }
      row[k] = v
    }
  }
  if (!partial || has('tech_stack')) {
    const ts = body.tech_stack ?? []
    if (!Array.isArray(ts) || ts.length > 30 || ts.some(t => typeof t !== 'string' || !t.trim() || t.length > 40)) {
      return { ok: false, error: 'Tech stack must be up to 30 items of 40 characters or fewer' }
    }
    row.tech_stack = Array.from(new Set((ts as string[]).map(t => t.trim())))
  }
  if (has('category_id')) {
    const c = body.category_id
    if (c === null || c === '') {
      row.category_id = null
    } else if (typeof c !== 'string' || !UUID.test(c)) {
      return { ok: false, error: 'Unknown category' }
    } else {
      // The foreign key only proves the category exists, not whose it is.
      const { data } = await supabase.from('project_categories').select('id').eq('id', c).eq('user_id', userId).maybeSingle()
      if (!data) return { ok: false, error: 'Unknown category' }
      row.category_id = c
    }
  }
  if (!partial || has('visibility')) {
    const v = body.visibility ?? 'hidden'
    if (!VISIBILITIES.includes(v as ProjectVisibility)) return { ok: false, error: 'Visibility must be pinned, published or hidden' }
    row.visibility = v
    // Older code and the AI routes read these two; keep them truthful.
    row.featured = v === 'pinned'
    row.published_to_portfolio = v !== 'hidden'
  }
  return { ok: true, row }
}

