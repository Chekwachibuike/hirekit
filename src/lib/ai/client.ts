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
  /** Includes the model's hidden reasoning tokens (gpt-oss reasons before
   *  it answers), so a long JSON answer needs headroom beyond its own size. */
  maxTokens?: number
  /** Groq JSON mode: the reply is guaranteed to be one syntactically valid
   *  JSON object. The prompt must mention JSON and ask for an object. */
  json?: boolean
  /** gpt-oss reasoning budget; 'low' leaves more of maxTokens for the answer. */
  reasoningEffort?: 'low' | 'medium' | 'high'
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
    json = false,
    reasoningEffort,
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
    ...(json ? { response_format: { type: 'json_object' as const } } : {}),
    ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
  })

  const choice = completion.choices[0]
  // Cut off by the token limit: whatever came back is incomplete, and
  // parsing half a JSON document only produces a confusing syntax error.
  if (choice?.finish_reason === 'length') {
    throw new Error('The AI reply was cut off before it finished. Try again.')
  }
  return choice?.message?.content ?? ''
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

/**
 * Parses the JSON out of an AI reply. Models wrap it in markdown fences or
 * add a sentence before or after it despite being told not to, so this takes
 * the span from the first opening bracket to the last closing one.
 */
export function parseJsonResponse<T>(raw: string): T {
  const cleaned = raw.replace(/```(?:json)?\s*/gi, '').trim()
  try {
    return JSON.parse(cleaned) as T
  } catch (first) {
    const start = cleaned.search(/[[{]/)
    const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'))
    if (start >= 0 && end > start) {
      try { return JSON.parse(cleaned.slice(start, end + 1)) as T } catch { /* fall through */ }
    }
    throw first
  }
}

/**
 * generate() + parse, in JSON mode, with one retry. A model occasionally
 * writes malformed JSON (an unescaped quote inside an answer option was
 * enough to fail interview prep); a second attempt almost always succeeds,
 * and costs nothing when the first one was fine.
 *
 * check: optional shape test; return an error message to reject the reply.
 */
export async function generateJson<T>(
  prompt: string,
  options: Omit<GenerateOptions, 'json'> = {},
  check?: (value: T) => string | null,
): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await generate(prompt, { ...options, json: true })
      const value = parseJsonResponse<T>(raw)
      const problem = check?.(value)
      if (problem) throw new Error(problem)
      return value
    } catch (err) {
      lastError = err
      // Provider problems (bad key, retired model, rate limit) are not fixed
      // by asking again; only a bad reply is worth a second try.
      if (/\b(401|404|413|429)\b|rate.?limit|model_not_found|decommissioned|api key/i.test(String(err))) break
    }
  }
  throw lastError
}
