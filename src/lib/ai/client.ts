// AI client — server-side only. Never import in a Client Component.
// Rule: only import from files inside /src/app/api/** or /src/lib/ai/**
import Groq from 'groq-sdk'

if (!process.env.GROQ_API_KEY) {
  throw new Error('GROQ_API_KEY is not set. Add it to .env.local (no NEXT_PUBLIC_ prefix).')
}

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! })

// Groq retires models on its own schedule, and a retired id fails every AI
// feature at once with a 404. The llama-3.1-8b-instant / llama-3.3-70b-versatile
// pair that shipped here was decommissioned; these replaced them.
// GET /api/ai/models lists what the current key can actually use.
export const AI_MODELS = {
  // Fast + free tier — extraction, analysis, short tasks
  flash: 'openai/gpt-oss-20b',
  // High quality — cover letters, interview prep, project suggestions
  pro: 'openai/gpt-oss-120b',
} as const

export type AiModel = (typeof AI_MODELS)[keyof typeof AI_MODELS]

interface GenerateOptions {
  model?: AiModel
  systemPrompt?: string
  temperature?: number
  maxTokens?: number
}

export async function generate(
  prompt: string,
  options: GenerateOptions = {}
): Promise<string> {
  const {
    model = AI_MODELS.flash,
    systemPrompt,
    temperature = 0.7,
    maxTokens = 2048,
  } = options

  const messages: Groq.Chat.ChatCompletionMessageParam[] = []

  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt })
  }
  messages.push({ role: 'user', content: prompt })

  const completion = await groq.chat.completions.create({
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
  })

  return completion.choices[0]?.message?.content ?? ''
}

/**
 * Turns a provider error into something that names the actual problem.
 *
 * Every AI route used to answer "Generation failed" for any failure, which is
 * indistinguishable between a retired model, a bad key and a rate limit — and
 * sent the user hunting with nothing to go on.
 */
export function describeAiError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)

  if (/model_not_found|does not exist|decommissioned|model_decommissioned/i.test(msg)) {
    return 'The configured AI model is no longer available from Groq. ' +
      'Open /api/ai/models to see what this key can use, then update AI_MODELS in src/lib/ai/client.ts.'
  }
  if (/rate.?limit|\b429\b/i.test(msg)) {
    return 'Groq rate limit reached — wait a minute and try again.'
  }
  if (/\b401\b|invalid api key|unauthorized/i.test(msg)) {
    return 'Groq rejected the API key — check GROQ_API_KEY in .env.local.'
  }
  if (/\b413\b|too large|context length/i.test(msg)) {
    return 'The request was too large for the model — try with less input.'
  }
  return `AI request failed: ${msg}`
}

// Parses a JSON block out of an AI response that may wrap it in markdown fences
export function parseJsonResponse<T>(raw: string): T {
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  return JSON.parse(cleaned) as T
}
