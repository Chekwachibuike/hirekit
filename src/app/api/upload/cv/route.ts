export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { generate, parseJsonResponse, AI_MODELS } from '@/lib/ai/client'
import { SYSTEM_PROMPTS } from '@/lib/ai/prompts'
import { createSupabaseRouteHandlerClient } from '@/lib/supabase-server'
import type { PersonalInfo } from '@/lib/supabase'


type ParsedCV = Omit<PersonalInfo, 'id'>

export async function POST(req: NextRequest) {
  const supabase = createSupabaseRouteHandlerClient(req)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null

  if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
  if (file.type !== 'application/pdf') return NextResponse.json({ error: 'Only PDF files are accepted' }, { status: 400 })
  if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: 'File too large (max 5 MB)' }, { status: 400 })

  // ── Step 1: parse PDF text ─────────────────────────────────
  // Dynamic require bypasses webpack's CJS interop that drops the default export.
  // The .default ?? module fallback handles both bundled and raw CJS cases.
  let rawText: string
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParseLib = require('pdf-parse')
    const pdfParse: (buf: Buffer) => Promise<{ text: string }> = pdfParseLib.default ?? pdfParseLib
    const buffer = Buffer.from(await file.arrayBuffer())
    const parsed = await pdfParse(buffer)
    rawText = parsed.text ?? ''
  } catch (err) {
    console.error('[upload/cv] pdf-parse failed:', err)
    return NextResponse.json({ error: 'Failed to read PDF. Make sure it is a text-based PDF, not a scanned image.' }, { status: 422 })
  }

  const trimmedText = rawText.replace(/\s+/g, ' ').trim()
  console.log(`[upload/cv] extracted ${trimmedText.length} chars from "${file.name}"`)

  if (!trimmedText) {
    return NextResponse.json({ error: 'No text found in this PDF. It appears to be a scanned image — please use a text-based PDF or paste your CV text manually.' }, { status: 422 })
  }

  // ── Step 2: AI extraction ─────────────────────────────────
  let data: ParsedCV
  try {
    const prompt = `Parse this CV and return the JSON object as instructed.\n\nCV TEXT:\n${trimmedText}`
    const raw = await generate(prompt, {
      model: AI_MODELS.pro,
      systemPrompt: SYSTEM_PROMPTS.cvParsing,
      temperature: 0.1,
      maxTokens: 4096,
    })
    data = parseJsonResponse<ParsedCV>(raw)
  } catch (err) {
    console.error('[upload/cv] AI extraction failed:', err)
    return NextResponse.json({ error: 'AI failed to parse the CV. Check your GROQ_API_KEY or try again.' }, { status: 502 })
  }

  // ── Step 3: save to DB (best-effort, non-blocking) ─────────
  const label = file.name.replace(/\.pdf$/i, '')
  const { error: dbErr } = await supabase
    .from('cv_versions')
    .insert({ user_id: user.id, label, cv_markdown: data.cv_markdown ?? '' })
    .select()
    .single()

  if (dbErr) {
    // Not fatal — the parsed data is still returned. Most likely cause: migration not run.
    console.warn('[upload/cv] cv_versions insert failed (run migration 003?):', dbErr.message)
  }

  return NextResponse.json({
    parsed: data,
    file_name: file.name,
    char_count: rawText.length,
  })
}
