'use client'
import { useEffect, useState } from 'react'
import useSWR from 'swr'
import {
  BrainCircuit, Loader2, Zap, CheckCircle2, XCircle,
  PenLine, Code2, ChevronDown, ChevronUp, ExternalLink, Trophy,
} from 'lucide-react'
import { fetcher } from '@/lib/fetcher'
import type { JobApplication } from '@/lib/supabase'

// ── Types ─────────────────────────────────────────────────────────
type MCQ      = { q: string; options: string[]; answer: number; explanation: string }
type WrittenQ = { q: string; hint: string }
type LeetQ    = { title: string; difficulty: 'Easy' | 'Medium' | 'Hard'; topic: string; description: string; examples: string[]; constraints: string[] }
type Tab      = 'mcq' | 'written' | 'leetcode'
interface Questions { mcq: MCQ[]; written: WrittenQ[]; leetcode: LeetQ[] }
interface Rating    { score: number; feedback: string; model_answer: string }

const DIFF_COLOR = { Easy: '#00A885', Medium: '#D4A017', Hard: '#E03255' } as const
const DIFF_BG    = { Easy: 'rgba(0,168,133,0.1)', Medium: 'rgba(212,160,23,0.1)', Hard: 'rgba(224,50,85,0.1)' } as const

// ── Helpers ───────────────────────────────────────────────────────
function scoreColor(s: number) {
  if (s >= 8) return '#00A885'
  if (s >= 5) return '#D4A017'
  return '#E03255'
}

function lcSlug(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

// ── Sub-components ────────────────────────────────────────────────
function MCQSection({
  questions, answers, setAnswers, submitted, setSubmitted,
}: {
  questions: MCQ[]
  answers: number[]
  setAnswers: React.Dispatch<React.SetStateAction<number[]>>
  submitted: boolean
  setSubmitted: (v: boolean) => void
}) {
  const answered = answers.filter(a => a !== -1).length
  const score    = submitted ? questions.filter((q, i) => answers[i] === q.answer).length : 0

  return (
    <div style={{ maxWidth: 760 }}>
      {submitted && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14,
          background: score / questions.length >= 0.7 ? 'rgba(0,168,133,0.08)' : 'rgba(224,50,85,0.06)',
          border: `1px solid ${score / questions.length >= 0.7 ? 'rgba(0,168,133,0.25)' : 'rgba(224,50,85,0.2)'}`,
          borderRadius: 'var(--r-xl)', padding: '16px 22px', marginBottom: 28,
        }}>
          <Trophy size={28} color={scoreColor(Math.round(score / questions.length * 10))} />
          <div>
            <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--c-text)' }}>
              {score} / {questions.length} correct&nbsp;
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--c-text-muted)' }}>
                ({Math.round(score / questions.length * 100)}%)
              </span>
            </p>
            <p style={{ fontSize: 12, color: 'var(--c-text-muted)', marginTop: 2 }}>
              {score / questions.length >= 0.8 ? 'Excellent — you have a strong grasp of this domain.' :
               score / questions.length >= 0.6 ? 'Good — review the explanations for missed questions.' :
               'Keep practicing — focus on the explanations below.'}
            </p>
          </div>
          <button onClick={() => { setSubmitted(false); setAnswers(new Array(questions.length).fill(-1)) }}
            style={{ marginLeft: 'auto', padding: '6px 14px', borderRadius: 'var(--r-md)', background: 'var(--c-bg-3)', border: '1px solid var(--c-border)', color: 'var(--c-text-muted)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
            Retry
          </button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {questions.map((q, qi) => {
          const chosen  = answers[qi]
          const correct = q.answer
          const isRight = submitted && chosen === correct
          const isWrong = submitted && chosen !== -1 && chosen !== correct

          return (
            <div key={qi} style={{
              background: 'var(--c-bg-2)',
              border: `1px solid ${submitted ? (isRight ? 'rgba(0,168,133,0.35)' : isWrong ? 'rgba(224,50,85,0.3)' : 'var(--c-border)') : 'var(--c-border)'}`,
              borderRadius: 'var(--r-xl)', padding: '20px 22px',
              transition: 'border-color 0.2s',
            }}>
              <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-text-dim)', flexShrink: 0, paddingTop: 2 }}>Q{qi + 1}</span>
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-text)', lineHeight: 1.5 }}>{q.q}</p>
                {submitted && (
                  isRight
                    ? <CheckCircle2 size={18} color="#00A885" style={{ flexShrink: 0, marginLeft: 'auto' }} />
                    : isWrong
                    ? <XCircle size={18} color="#E03255" style={{ flexShrink: 0, marginLeft: 'auto' }} />
                    : null
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {q.options.map((opt, oi) => {
                  const isChosen  = chosen === oi
                  const isCorrect = oi === correct
                  let bg = 'var(--c-bg-3)'
                  let border = 'var(--c-border)'
                  let color = 'var(--c-text-muted)'
                  if (!submitted && isChosen) { bg = 'var(--c-violet-dim)'; border = 'rgba(124,92,252,0.35)'; color = 'var(--c-violet)' }
                  if (submitted && isCorrect) { bg = 'rgba(0,168,133,0.08)'; border = 'rgba(0,168,133,0.35)'; color = '#00A885' }
                  if (submitted && isChosen && !isCorrect) { bg = 'rgba(224,50,85,0.06)'; border = 'rgba(224,50,85,0.3)'; color = '#E03255' }

                  return (
                    <button key={oi} disabled={submitted}
                      onClick={() => setAnswers(a => { const n = [...a]; n[qi] = oi; return n })}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 14px', borderRadius: 'var(--r-md)',
                        background: bg, border: `1px solid ${border}`, color,
                        fontSize: 13, cursor: submitted ? 'default' : 'pointer',
                        fontFamily: 'var(--font-body)', textAlign: 'left',
                        transition: 'all 0.15s',
                      }}>
                      <span style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                        {String.fromCharCode(65 + oi)}
                      </span>
                      {opt}
                    </button>
                  )
                })}
              </div>

              {submitted && (
                <div style={{ marginTop: 14, padding: '10px 14px', background: 'var(--c-bg-4)', borderRadius: 'var(--r-md)', fontSize: 12, color: 'var(--c-text-muted)', lineHeight: 1.6 }}>
                  <strong style={{ color: 'var(--c-text)' }}>Explanation:</strong> {q.explanation}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {!submitted && (
        <div style={{ marginTop: 28, display: 'flex', alignItems: 'center', gap: 14 }}>
          <p style={{ fontSize: 12, color: 'var(--c-text-dim)' }}>{answered} / {questions.length} answered</p>
          <div style={{ flex: 1, height: 4, background: 'var(--c-bg-4)', borderRadius: 999 }}>
            <div style={{ height: '100%', borderRadius: 999, background: 'var(--c-violet)', width: `${(answered / questions.length) * 100}%`, transition: 'width 0.3s' }} />
          </div>
          <button onClick={() => setSubmitted(true)} disabled={answered < questions.length}
            style={{
              padding: '9px 22px', borderRadius: 'var(--r-md)',
              background: answered < questions.length ? 'var(--c-bg-4)' : 'var(--c-teal)',
              border: 'none', color: '#fff', fontSize: 13, fontWeight: 600,
              cursor: answered < questions.length ? 'default' : 'pointer',
              fontFamily: 'var(--font-body)',
            }}>
            Submit Quiz
          </button>
        </div>
      )}
    </div>
  )
}

function WrittenSection({
  questions, answers, setAnswers, ratings, ratingIdx, onRate,
}: {
  questions: WrittenQ[]
  answers: string[]
  setAnswers: React.Dispatch<React.SetStateAction<string[]>>
  ratings: (Rating | null)[]
  ratingIdx: number | null
  onRate: (i: number) => void
}) {
  const [showModel, setShowModel] = useState<boolean[]>(new Array(questions.length).fill(false))

  return (
    <div style={{ maxWidth: 760, display: 'flex', flexDirection: 'column', gap: 24 }}>
      {questions.map((q, qi) => {
        const rating   = ratings[qi]
        const isRating = ratingIdx === qi
        const hasAnswer = answers[qi]?.trim().length > 0

        return (
          <div key={qi} style={{ background: 'var(--c-bg-2)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-xl)', padding: '22px', transition: 'border-color 0.15s' }}>
            <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-text-dim)', paddingTop: 2, flexShrink: 0 }}>Q{qi + 1}</span>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-text)', lineHeight: 1.5 }}>{q.q}</p>
            </div>

            <div style={{ fontSize: 11, color: 'var(--c-text-dim)', marginBottom: 10, padding: '6px 10px', background: 'var(--c-bg-4)', borderRadius: 'var(--r-md)', lineHeight: 1.5 }}>
              <strong>Hint:</strong> {q.hint}
            </div>

            <textarea
              value={answers[qi] ?? ''}
              onChange={e => setAnswers(a => { const n = [...a]; n[qi] = e.target.value; return n })}
              placeholder="Type your answer here…"
              rows={5}
              style={{
                width: '100%', padding: '10px 14px',
                background: 'var(--c-bg-3)', border: '1px solid var(--c-border)',
                borderRadius: 'var(--r-md)', color: 'var(--c-text)',
                fontSize: 13, lineHeight: 1.65, resize: 'vertical',
                outline: 'none', fontFamily: 'var(--font-body)',
                boxSizing: 'border-box',
              }}
            />

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
              {rating && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 999, background: `rgba(${rating.score >= 8 ? '0,168,133' : rating.score >= 5 ? '212,160,23' : '224,50,85'},0.1)`, border: `1px solid rgba(${rating.score >= 8 ? '0,168,133' : rating.score >= 5 ? '212,160,23' : '224,50,85'},0.25)` }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: scoreColor(rating.score) }}>{rating.score}/10</span>
                </div>
              )}
              <button
                onClick={() => onRate(qi)}
                disabled={!hasAnswer || isRating || ratingIdx !== null}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 16px', borderRadius: 'var(--r-md)',
                  background: !hasAnswer || ratingIdx !== null ? 'var(--c-bg-4)' : 'var(--c-violet)',
                  border: 'none', color: '#fff', fontSize: 12, fontWeight: 600,
                  cursor: !hasAnswer || ratingIdx !== null ? 'default' : 'pointer',
                  fontFamily: 'var(--font-body)',
                }}>
                {isRating ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <BrainCircuit size={12} />}
                {isRating ? 'Rating…' : rating ? 'Re-rate' : 'Rate My Answer'}
              </button>
            </div>

            {rating && (
              <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ padding: '12px 14px', background: 'var(--c-bg-4)', borderRadius: 'var(--r-md)', fontSize: 13, color: 'var(--c-text-muted)', lineHeight: 1.6 }}>
                  <strong style={{ color: 'var(--c-text)', display: 'block', marginBottom: 4 }}>Feedback</strong>
                  {rating.feedback}
                </div>

                <button onClick={() => setShowModel(s => { const n = [...s]; n[qi] = !n[qi]; return n })}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-violet)', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-body)', padding: 0 }}>
                  {showModel[qi] ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  {showModel[qi] ? 'Hide' : 'Show'} model answer
                </button>

                {showModel[qi] && (
                  <div style={{ padding: '12px 14px', background: 'rgba(124,92,252,0.05)', border: '1px solid rgba(124,92,252,0.15)', borderRadius: 'var(--r-md)', fontSize: 13, color: 'var(--c-text-muted)', lineHeight: 1.7 }}>
                    <strong style={{ color: 'var(--c-violet)', display: 'block', marginBottom: 4 }}>Model Answer</strong>
                    {rating.model_answer}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function LeetCodeSection({ questions, role }: { questions: LeetQ[]; role: string }) {
  return (
    <div style={{ maxWidth: 800, display: 'flex', flexDirection: 'column', gap: 24 }}>
      <p style={{ fontSize: 13, color: 'var(--c-text-muted)', marginBottom: 4 }}>
        3 algorithm problems tailored to <strong style={{ color: 'var(--c-text)' }}>{role}</strong>. Read each problem, try to solve it mentally or on paper, then practice on LeetCode.
      </p>

      {questions.map((q, i) => (
        <div key={i} style={{ background: 'var(--c-bg-2)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-xl)', padding: '24px', transition: 'border-color 0.15s' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--c-violet-dim)', border: '1px solid rgba(124,92,252,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'var(--c-violet)', flexShrink: 0 }}>{i + 1}</div>
            <div style={{ flex: 1 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--c-text)', marginBottom: 8 }}>{q.title}</h3>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 999, fontWeight: 700, background: DIFF_BG[q.difficulty] ?? DIFF_BG.Medium, color: DIFF_COLOR[q.difficulty] ?? DIFF_COLOR.Medium }}>
                  {q.difficulty}
                </span>
                <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 999, background: 'var(--c-bg-4)', color: 'var(--c-text-dim)', fontWeight: 500 }}>
                  {q.topic}
                </span>
              </div>
            </div>
          </div>

          <p style={{ fontSize: 13, color: 'var(--c-text-muted)', lineHeight: 1.7, marginBottom: 16 }}>{q.description}</p>

          {q.examples?.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-text-dim)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Examples</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {q.examples.map((ex, ei) => (
                  <pre key={ei} style={{ margin: 0, padding: '10px 14px', background: 'var(--c-bg-4)', borderRadius: 'var(--r-md)', fontSize: 12, color: 'var(--c-text-muted)', fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                    {ex}
                  </pre>
                ))}
              </div>
            </div>
          )}

          {q.constraints?.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-text-dim)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Constraints</p>
              <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 3 }}>
                {q.constraints.map((c, ci) => (
                  <li key={ci} style={{ fontSize: 12, color: 'var(--c-text-muted)', fontFamily: 'var(--font-mono)' }}>{c}</li>
                ))}
              </ul>
            </div>
          )}

          <a
            href={`https://leetcode.com/problems/${lcSlug(q.title)}/`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 'var(--r-md)', background: 'var(--c-bg-4)', border: '1px solid var(--c-border)', color: 'var(--c-text-muted)', fontSize: 12, fontWeight: 600, textDecoration: 'none', transition: 'all 0.15s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--c-border-md)'; (e.currentTarget as HTMLElement).style.color = 'var(--c-text)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--c-border)'; (e.currentTarget as HTMLElement).style.color = 'var(--c-text-muted)' }}
          >
            <ExternalLink size={12} /> Practice on LeetCode
          </a>
        </div>
      ))}
    </div>
  )
}

function EmptyState() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--c-text-dim)', padding: '48px 24px', textAlign: 'center' }}>
      <BrainCircuit size={48} style={{ opacity: 0.2 }} />
      <div>
        <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--c-text-muted)', marginBottom: 6 }}>Ready when you are</p>
        <p style={{ fontSize: 13, lineHeight: 1.6, maxWidth: 360 }}>Enter the role you're interviewing for above and click Generate. You'll get 15 MCQ questions, 5 written prompts with AI scoring, and 3 LeetCode problems — all tailored to that role.</p>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────
export default function InterviewPrepPage() {
  const { data: appsData } = useSWR<{ data: JobApplication[] }>('/api/applications', fetcher)
  const apps = (appsData?.data ?? []).filter(a => a.role)

  const [role, setRole]           = useState('')
  const [generating, setGenerating] = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [questions, setQuestions] = useState<Questions | null>(null)
  const [tab, setTab]             = useState<Tab>('mcq')

  // MCQ
  const [mcqAnswers, setMcqAnswers] = useState<number[]>([])
  const [submitted, setSubmitted]   = useState(false)

  // Written
  const [writtenAnswers, setWrittenAnswers] = useState<string[]>([])
  const [ratings, setRatings]   = useState<(Rating | null)[]>([])
  const [ratingIdx, setRatingIdx] = useState<number | null>(null)

  // Prefill role from ?role= (used by Skills Audit's "practice these gaps").
  // window.location.search instead of useSearchParams() so the page keeps
  // prerendering statically without a Suspense boundary.
  useEffect(() => {
    const preset = new URLSearchParams(window.location.search).get('role')
    if (preset) {
      setRole(preset)
      window.history.replaceState({}, '', '/interview-prep')
    }
  }, [])

  async function generate() {
    if (!role.trim()) return
    setGenerating(true)
    setError(null)
    setQuestions(null)
    setSubmitted(false)
    try {
      const res  = await fetch('/api/ai/interview-prep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: role.trim() }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Generation failed')
      setQuestions(json)
      setMcqAnswers(new Array((json.mcq ?? []).length).fill(-1))
      setWrittenAnswers(new Array((json.written ?? []).length).fill(''))
      setRatings(new Array((json.written ?? []).length).fill(null))
      setTab('mcq')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }

  async function rateAnswer(idx: number) {
    if (!questions) return
    setRatingIdx(idx)
    try {
      const res  = await fetch('/api/ai/interview-prep/rate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: questions.written[idx].q, answer: writtenAnswers[idx], role }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Rating failed')
      setRatings(r => { const n = [...r]; n[idx] = json; return n })
    } catch { /* silent — rating is non-critical */ }
    finally { setRatingIdx(null) }
  }

  const tabs = questions ? [
    { key: 'mcq'      as const, label: 'Objective',  icon: CheckCircle2, count: questions.mcq.length },
    { key: 'written'  as const, label: 'Written',    icon: PenLine,      count: questions.written.length },
    { key: 'leetcode' as const, label: 'LeetCode',   icon: Code2,        count: questions.leetcode.length },
  ] : []

  return (
    <div style={{ height: 'calc(100vh - var(--topbar-h))', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '22px 32px 16px', borderBottom: '1px solid var(--c-border)', flexShrink: 0 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--c-text)', letterSpacing: '-0.02em', marginBottom: 3 }}>Interview Prep</h1>
        <p style={{ fontSize: 12, color: 'var(--c-text-muted)' }}>15 MCQ questions · 5 written prompts with AI scoring · 3 LeetCode problems — tailored to any role</p>
      </div>

      {/* Role input */}
      <div style={{ padding: '16px 32px', borderBottom: '1px solid var(--c-border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label htmlFor="ip-role" style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--c-text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
              Role you&apos;re preparing for
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                id="ip-role"
                value={role}
                onChange={e => setRole(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && generate()}
                placeholder="e.g. Senior Fullstack Engineer, Backend Developer, DevOps…"
                style={{ flex: 1, padding: '9px 14px', background: 'var(--c-bg-2)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', color: 'var(--c-text)', fontSize: 13, outline: 'none', fontFamily: 'var(--font-body)' }}
              />
              {apps.length > 0 && (
                <select
                  value=""
                  onChange={e => setRole(e.target.value)}
                  aria-label="Load role from applications"
                  style={{ padding: '9px 12px', background: 'var(--c-bg-2)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', color: 'var(--c-text-muted)', fontSize: 12, outline: 'none', fontFamily: 'var(--font-body)', cursor: 'pointer' }}
                >
                  <option value="">From my applications…</option>
                  {apps.map(a => <option key={a.id} value={a.role}>{a.role} @ {a.company}</option>)}
                </select>
              )}
            </div>
          </div>
          <button
            onClick={generate}
            disabled={generating || !role.trim()}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '9px 22px', borderRadius: 'var(--r-md)',
              background: generating || !role.trim() ? 'var(--c-bg-4)' : 'var(--c-coral)',
              border: 'none', color: '#fff', fontSize: 13, fontWeight: 600,
              cursor: generating || !role.trim() ? 'default' : 'pointer',
              fontFamily: 'var(--font-body)', opacity: generating ? 0.7 : 1,
              whiteSpace: 'nowrap',
            }}
          >
            {generating
              ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
              : <Zap size={14} />}
            {generating ? 'Generating…' : questions ? 'Regenerate' : 'Generate'}
          </button>
        </div>
        {error && (
          <div style={{ marginTop: 10, fontSize: 12, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--r-md)', padding: '8px 12px' }}>
            {error}
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {generating ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', color: 'var(--c-violet)' }} />
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-text)', marginBottom: 4 }}>Building your interview pack…</p>
              <p style={{ fontSize: 12, color: 'var(--c-text-muted)' }}>Generating 15 MCQ questions, 5 written prompts, and 3 LeetCode problems</p>
            </div>
          </div>
        ) : !questions ? (
          <EmptyState />
        ) : (
          <>
            {/* Tabs */}
            <div style={{ padding: '0 32px', borderBottom: '1px solid var(--c-border)', flexShrink: 0, display: 'flex' }}>
              {tabs.map(({ key, label, icon: Icon, count }) => (
                <button key={key} onClick={() => setTab(key)} style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '13px 20px', border: 'none', background: 'transparent',
                  borderBottom: `2px solid ${tab === key ? 'var(--c-violet)' : 'transparent'}`,
                  color: tab === key ? 'var(--c-violet)' : 'var(--c-text-muted)',
                  fontSize: 13, fontWeight: tab === key ? 600 : 400,
                  cursor: 'pointer', fontFamily: 'var(--font-body)', transition: 'color 0.15s',
                }}>
                  <Icon size={14} />
                  {label}
                  <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 999, fontWeight: 700, background: tab === key ? 'var(--c-violet-dim)' : 'var(--c-bg-4)', color: tab === key ? 'var(--c-violet)' : 'var(--c-text-dim)' }}>
                    {count}
                  </span>
                </button>
              ))}
            </div>

            {/* Tab panels */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>
              {tab === 'mcq' && (
                <MCQSection
                  questions={questions.mcq}
                  answers={mcqAnswers}
                  setAnswers={setMcqAnswers}
                  submitted={submitted}
                  setSubmitted={setSubmitted}
                />
              )}
              {tab === 'written' && (
                <WrittenSection
                  questions={questions.written}
                  answers={writtenAnswers}
                  setAnswers={setWrittenAnswers}
                  ratings={ratings}
                  ratingIdx={ratingIdx}
                  onRate={rateAnswer}
                />
              )}
              {tab === 'leetcode' && (
                <LeetCodeSection questions={questions.leetcode} role={role} />
              )}
            </div>
          </>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
