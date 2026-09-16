'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { ChevronDown, ChevronRight, Loader2, Check, BrainCircuit, Target } from 'lucide-react'
import { fetcher } from '@/lib/fetcher'
import {
  SKILL_DOMAINS, LEVELS, ROLE_PROFILES, ALL_SKILLS_COUNT,
  roleReadiness, type SkillLevel,
} from '@/lib/skills-taxonomy'

type Levels = Record<string, SkillLevel>

export default function SkillsPage() {
  const { data, isLoading } = useSWR<{ data: { levels: Levels } }>('/api/skill-assessment', fetcher)

  const [levels, setLevels]   = useState<Levels>({})
  const [loaded, setLoaded]   = useState(false)
  const [saving, setSaving]   = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [open, setOpen]       = useState<Record<string, boolean>>({ [SKILL_DOMAINS[0].id]: true })
  const [activeRole, setActiveRole] = useState(ROLE_PROFILES[2].id) // fullstack default
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Hydrate local state once from the server copy
  useEffect(() => {
    if (data && !loaded) {
      setLevels(data.data.levels ?? {})
      setLoaded(true)
    }
  }, [data, loaded])

  // Debounced autosave — one POST 1.2s after the last click, not one per click
  function setLevel(id: string, value: SkillLevel) {
    setLevels(prev => {
      const next = { ...prev }
      if (prev[id] === value) delete next[id]  // clicking the same level unsets it
      else next[id] = value
      scheduleSave(next)
      return next
    })
  }

  function scheduleSave(next: Levels) {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      setSaving(true)
      try {
        await fetch('/api/skill-assessment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ levels: next }),
        })
        setSavedAt(Date.now())
      } finally {
        setSaving(false)
      }
    }, 1200)
  }

  const assessedCount = Object.keys(levels).length
  const role = ROLE_PROFILES.find(r => r.id === activeRole) ?? ROLE_PROFILES[0]
  const readiness = useMemo(() => roleReadiness(role, levels), [role, levels])

  // Top gaps become the Interview Prep focus — carried via query param
  const prepHref = `/interview-prep?role=${encodeURIComponent(
    readiness.gaps.length > 0
      ? `${role.name} (focus on: ${readiness.gaps.slice(0, 5).map(g => g.name).join(', ')})`
      : role.name
  )}`

  if (isLoading || !loaded) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 10, color: 'var(--c-text-muted)' }}>
        <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
        <span style={{ fontSize: 13 }}>Loading your assessment…</span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  return (
    <div style={{ height: 'calc(100vh - var(--topbar-h))', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '22px 32px 16px', borderBottom: '1px solid var(--c-border)', flexShrink: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--c-text)', letterSpacing: '-0.02em', marginBottom: 3 }}>Skills Audit</h1>
          <p style={{ fontSize: 12, color: 'var(--c-text-muted)' }}>
            Rate yourself honestly on {ALL_SKILLS_COUNT} microskills — see how ready you are for each role
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--c-text-dim)', flexShrink: 0 }}>
          {saving
            ? <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</span>
            : savedAt
            ? <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--c-teal)' }}><Check size={12} /> Saved</span>
            : null}
          <span>{assessedCount} / {ALL_SKILLS_COUNT} rated</span>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── Left: checklist ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px', minWidth: 0 }}>

          {/* Level legend */}
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 18, padding: '10px 14px', background: 'var(--c-bg-2)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)' }}>
            {LEVELS.map(l => (
              <span key={l.value} style={{ fontSize: 11, color: 'var(--c-text-muted)' }}>
                {l.emoji} <strong style={{ color: 'var(--c-text)' }}>{l.label}</strong> — {l.desc}
              </span>
            ))}
            <span style={{ fontSize: 11, color: 'var(--c-text-dim)' }}>Click a level again to unset it.</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 720 }}>
            {SKILL_DOMAINS.map(domain => {
              const isOpen = !!open[domain.id]
              const rated = domain.skills.filter(s => levels[s.id]).length
              return (
                <div key={domain.id} style={{ background: 'var(--c-bg-2)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
                  <button
                    onClick={() => setOpen(o => ({ ...o, [domain.id]: !o[domain.id] }))}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                      padding: '13px 16px', background: 'none', border: 'none',
                      cursor: 'pointer', fontFamily: 'var(--font-body)', textAlign: 'left',
                    }}>
                    {isOpen ? <ChevronDown size={15} color="var(--c-text-muted)" /> : <ChevronRight size={15} color="var(--c-text-muted)" />}
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-text)', flex: 1 }}>{domain.name}</span>
                    <span style={{ fontSize: 11, color: rated === domain.skills.length ? 'var(--c-teal)' : 'var(--c-text-dim)', fontWeight: 600 }}>
                      {rated}/{domain.skills.length}
                    </span>
                  </button>

                  {isOpen && (
                    <div style={{ borderTop: '1px solid var(--c-border)' }}>
                      {domain.skills.map(skill => {
                        const current = levels[skill.id] ?? 0
                        return (
                          <div key={skill.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px 9px 40px', borderBottom: '1px solid var(--c-border)' }}>
                            <span style={{ fontSize: 13, color: current > 0 ? 'var(--c-text)' : 'var(--c-text-muted)', flex: 1, minWidth: 0 }}>
                              {skill.name}
                            </span>
                            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                              {LEVELS.map(l => {
                                const active = current === l.value
                                return (
                                  <button
                                    key={l.value}
                                    onClick={() => setLevel(skill.id, l.value)}
                                    title={`${l.label} — ${l.desc}`}
                                    aria-label={`${skill.name}: ${l.label}`}
                                    style={{
                                      width: 32, height: 26, borderRadius: 7,
                                      border: `1px solid ${active ? 'rgba(124,92,252,0.4)' : 'var(--c-border)'}`,
                                      background: active ? 'var(--c-violet-dim)' : 'transparent',
                                      fontSize: 13, cursor: 'pointer',
                                      opacity: active || current === 0 ? 1 : 0.35,
                                      transition: 'all 0.12s',
                                    }}>
                                    {l.emoji}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Right: role readiness ── */}
        <div style={{ width: 340, flexShrink: 0, borderLeft: '1px solid var(--c-border)', overflowY: 'auto', padding: '20px 22px', background: 'var(--c-bg-3)' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-text-dim)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Target size={12} /> Role readiness
          </p>

          {/* Role tabs */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
            {ROLE_PROFILES.map(r => {
              const rd = roleReadiness(r, levels)
              const active = r.id === activeRole
              return (
                <button key={r.id} onClick={() => setActiveRole(r.id)} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '11px 14px', borderRadius: 'var(--r-md)',
                  background: active ? 'var(--c-violet-dim)' : 'var(--c-bg-2)',
                  border: `1px solid ${active ? 'rgba(124,92,252,0.3)' : 'var(--c-border)'}`,
                  cursor: 'pointer', fontFamily: 'var(--font-body)', textAlign: 'left',
                }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: active ? 'var(--c-violet)' : 'var(--c-text)' }}>{r.name}</p>
                    <p style={{ fontSize: 10, color: 'var(--c-text-dim)', marginTop: 2 }}>{rd.met}/{rd.total} requirements met</p>
                  </div>
                  <span style={{
                    fontSize: 15, fontWeight: 800,
                    color: rd.percent >= 75 ? 'var(--c-teal)' : rd.percent >= 45 ? 'var(--c-gold)' : '#E03255',
                  }}>{rd.percent}%</span>
                </button>
              )
            })}
          </div>

          {/* Readiness bar */}
          <div style={{ height: 8, background: 'var(--c-bg-4)', borderRadius: 999, overflow: 'hidden', marginBottom: 6 }}>
            <div style={{
              height: '100%', borderRadius: 999, width: `${readiness.percent}%`,
              background: readiness.percent >= 75 ? 'var(--c-teal)' : readiness.percent >= 45 ? 'var(--c-gold)' : '#E03255',
              transition: 'width 0.5s ease',
            }} />
          </div>
          <p style={{ fontSize: 11, color: 'var(--c-text-muted)', marginBottom: 18 }}>
            {readiness.percent >= 75 ? 'Interview-ready — polish the remaining gaps.'
              : readiness.percent >= 45 ? 'Solid base — close the top gaps below.'
              : assessedCount === 0 ? 'Rate your skills on the left to see your readiness.'
              : 'Focus on the fundamentals below first.'}
          </p>

          {/* Gaps */}
          {readiness.gaps.length > 0 && assessedCount > 0 && (
            <>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-text-dim)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>
                Top gaps for {role.name}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
                {readiness.gaps.slice(0, 8).map(g => (
                  <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--c-bg-2)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)' }}>
                    <span style={{ fontSize: 12, color: 'var(--c-text)', flex: 1, minWidth: 0 }}>{g.name}</span>
                    <span style={{ fontSize: 10, color: 'var(--c-text-dim)', flexShrink: 0 }}>
                      {LEVELS.find(l => l.value === g.have)?.emoji ?? '—'} → {LEVELS.find(l => l.value === g.need)?.emoji}
                    </span>
                  </div>
                ))}
                {readiness.gaps.length > 8 && (
                  <p style={{ fontSize: 11, color: 'var(--c-text-dim)', textAlign: 'center' }}>+{readiness.gaps.length - 8} more</p>
                )}
              </div>

              <Link href={prepHref} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                padding: '10px 14px', borderRadius: 'var(--r-md)',
                background: 'var(--c-violet)', color: '#fff',
                fontSize: 12, fontWeight: 600, textDecoration: 'none',
                fontFamily: 'var(--font-body)',
              }}>
                <BrainCircuit size={13} /> Practice these gaps in Interview Prep
              </Link>
            </>
          )}
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
