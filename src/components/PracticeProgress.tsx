'use client'
import { useState } from 'react'
import useSWR from 'swr'
import { Flame, TrendingUp, TrendingDown, Target, Loader2, Sparkles, AlertCircle } from 'lucide-react'
import { fetcher } from '@/lib/fetcher'
import type { Streak, MonthlyReport, TopicStat } from '@/lib/practice-analytics'

interface Suggestions {
  summary: string
  focus: { topic: string; why: string; study: string[] }[]
}

interface Payload {
  streak: Streak
  report: MonthlyReport
  totalAttempts: number
  suggestions: Suggestions | null
  suggestionError?: string
  error?: string
}

const card: React.CSSProperties = {
  background: 'var(--c-bg-2)', border: '1px solid var(--c-border)',
  borderRadius: 'var(--r-lg)', padding: '14px 16px',
}

function TopicRow({ s, tone }: { s: TopicStat; tone: 'up' | 'down' | 'flat' }) {
  const color = tone === 'up' ? 'var(--c-teal)' : tone === 'down' ? 'var(--c-red)' : 'var(--c-text-muted)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '4px 0' }}>
      <span style={{ flex: 1, color: 'var(--c-text)' }}>{s.topic}</span>
      <span style={{ color: 'var(--c-text-dim)', fontSize: 11 }}>{s.attempts}×</span>
      <span style={{ color, fontWeight: 600, minWidth: 74, textAlign: 'right' }}>
        {s.previousAverage !== null && `${s.previousAverage} → `}{s.average}/10
      </span>
    </div>
  )
}

export default function PracticeProgress() {
  const [suggest, setSuggest] = useState(false)
  const { data, isLoading } = useSWR<Payload>(
    `/api/practice/analytics${suggest ? '?suggest=1' : ''}`,
    fetcher,
  )

  if (isLoading) {
    return (
      <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--c-text-muted)', fontSize: 12 }}>
        <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Loading progress…
      </div>
    )
  }

  if (data?.error) {
    return (
      <div style={{ ...card, display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, color: 'var(--c-text)' }}>
        <AlertCircle size={13} style={{ color: 'var(--c-red)', flexShrink: 0, marginTop: 2 }} />
        <span style={{ lineHeight: 1.5 }}>{data.error}</span>
      </div>
    )
  }

  if (!data || data.totalAttempts === 0) {
    return (
      <div style={{ ...card, fontSize: 12, color: 'var(--c-text-muted)', lineHeight: 1.55 }}>
        No practice history yet. Answer and rate a question below — scores are
        saved from then on, and the streak and monthly breakdown build from them.
      </div>
    )
  }

  const { streak, report, suggestions } = data

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* Streak + month at a glance */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <Flame size={13} style={{ color: streak.active ? 'var(--c-coral)' : 'var(--c-text-dim)' }} />
            <span style={{ fontSize: 11, color: 'var(--c-text-muted)' }}>Streak</span>
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--c-text)', lineHeight: 1.1 }}>
            {streak.current}<span style={{ fontSize: 12, fontWeight: 500, color: 'var(--c-text-dim)' }}> day{streak.current === 1 ? '' : 's'}</span>
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--c-text-dim)', marginTop: 2 }}>
            longest {streak.longest}{!streak.active && streak.longest > 0 ? ' · broken' : ''}
          </div>
        </div>

        <div style={card}>
          <div style={{ fontSize: 11, color: 'var(--c-text-muted)', marginBottom: 4 }}>This month</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--c-text)', lineHeight: 1.1 }}>
            {report.average}<span style={{ fontSize: 12, fontWeight: 500, color: 'var(--c-text-dim)' }}>/10</span>
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--c-text-dim)', marginTop: 2 }}>
            {report.previousAverage !== null
              ? `${report.previousAverage} last month`
              : 'no prior month'}
          </div>
        </div>

        <div style={card}>
          <div style={{ fontSize: 11, color: 'var(--c-text-muted)', marginBottom: 4 }}>Answers</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--c-text)', lineHeight: 1.1 }}>{report.attempts}</div>
          <div style={{ fontSize: 10.5, color: 'var(--c-text-dim)', marginTop: 2 }}>{data.totalAttempts} all time</div>
        </div>
      </div>

      {/* Movement by topic */}
      {(report.improved.length > 0 || report.declined.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 10 }}>
          {report.improved.length > 0 && (
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <TrendingUp size={13} style={{ color: 'var(--c-teal)' }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-text)' }}>Improved</span>
              </div>
              {report.improved.map(s => <TopicRow key={s.topic} s={s} tone="up" />)}
            </div>
          )}
          {report.declined.length > 0 && (
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <TrendingDown size={13} style={{ color: 'var(--c-red)' }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-text)' }}>Slipped</span>
              </div>
              {report.declined.map(s => <TopicRow key={s.topic} s={s} tone="down" />)}
            </div>
          )}
        </div>
      )}

      {/* Weakest + dropped */}
      {report.weakest.length > 0 && (
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <Target size={13} style={{ color: 'var(--c-text-muted)' }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-text)' }}>Lowest scoring</span>
          </div>
          {report.weakest.map(s => <TopicRow key={s.topic} s={s} tone="flat" />)}
          {report.unpractised.length > 0 && (
            <p style={{ fontSize: 11, color: 'var(--c-text-dim)', marginTop: 8, lineHeight: 1.5 }}>
              Not practised this month: {report.unpractised.join(', ')}. Dropping a
              weak topic raises your average without you getting better at it.
            </p>
          )}
        </div>
      )}

      {/* What to study */}
      {suggestions ? (
        <div style={{ ...card, borderColor: 'rgba(124,92,252,0.25)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Sparkles size={13} style={{ color: 'var(--c-violet)' }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-text)' }}>What to study next</span>
          </div>
          <p style={{ fontSize: 12, color: 'var(--c-text-muted)', lineHeight: 1.6, marginBottom: 10 }}>
            {suggestions.summary}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {suggestions.focus.map(f => (
              <div key={f.topic}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--c-text)' }}>{f.topic}</div>
                <div style={{ fontSize: 11.5, color: 'var(--c-text-muted)', marginTop: 2, lineHeight: 1.5 }}>{f.why}</div>
                <ul style={{ margin: '5px 0 0 16px', padding: 0 }}>
                  {f.study.map((s, i) => (
                    <li key={i} style={{ fontSize: 11.5, color: 'var(--c-text-muted)', lineHeight: 1.6 }}>{s}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <button
          onClick={() => setSuggest(true)}
          disabled={suggest}
          style={{
            ...card, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            cursor: suggest ? 'default' : 'pointer', fontFamily: 'var(--font-body)',
            fontSize: 12, fontWeight: 600, color: 'var(--c-violet)',
          }}
        >
          {suggest
            ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Analysing…</>
            : <><Sparkles size={13} /> Suggest what to study next</>}
        </button>
      )}

      {data.suggestionError && (
        <p style={{ fontSize: 11, color: 'var(--c-red)' }}>{data.suggestionError}</p>
      )}
    </div>
  )
}
