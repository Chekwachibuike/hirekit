'use client'
import { useState } from 'react'
import useSWR from 'swr'
import {
  Plus, X, Github, ExternalLink, Star, Globe,
  Trash2, Edit3, Check, Layers, Loader2,
} from 'lucide-react'
import { fetcher } from '@/lib/fetcher'
import type { Project } from '@/lib/supabase'

const CATEGORIES = ['all', 'frontend', 'backend', 'fullstack', 'embedded', 'iot', 'pcb', 'other'] as const
type Category = typeof CATEGORIES[number]

const CATEGORY_COLORS: Record<string, string> = {
  frontend:  'var(--c-violet)',
  backend:   'var(--c-teal)',
  fullstack: 'var(--c-coral)',
  embedded:  'var(--c-gold)',
  iot:       '#4DA6FF',
  pcb:       '#9C6EFA',
  other:     'var(--c-text-muted)',
}

const emptyProject = (): Omit<Project, 'id' | 'created_at'> => ({
  title: '', description: '', category: 'fullstack',
  tech_stack: [], github_url: '', live_url: '',
  featured: false, published_to_portfolio: false,
})

export default function ProjectsPage() {
  // Cached under '/api/projects' — instant on revisit, every mutation below
  // updates this same cache so the grid stays in sync without a full refetch.
  const { data, isLoading: loading, mutate } =
    useSWR<{ data: Project[] }>('/api/projects', fetcher)
  const projects = data?.data ?? []

  const [filter, setFilter]       = useState<Category>('all')
  const [modal, setModal]         = useState<'add' | 'edit' | null>(null)
  const [editing, setEditing]     = useState<Project | null>(null)
  const [form, setForm]           = useState(emptyProject())
  const [techInput, setTechInput] = useState('')
  const [saving, setSaving]       = useState(false)

  const filtered = filter === 'all' ? projects : projects.filter(p => p.category === filter)

  function openAdd() {
    setForm(emptyProject())
    setEditing(null)
    setTechInput('')
    setModal('add')
  }

  function openEdit(p: Project) {
    setEditing(p)
    setForm({
      title: p.title, description: p.description,
      category: p.category, tech_stack: [...p.tech_stack],
      github_url: p.github_url ?? '', live_url: p.live_url ?? '',
      featured: p.featured, published_to_portfolio: p.published_to_portfolio,
    })
    setTechInput('')
    setModal('edit')
  }

  async function saveProject() {
    if (!form.title) return
    setSaving(true)
    try {
      if (modal === 'edit' && editing) {
        const res = await fetch('/api/projects', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editing.id, ...form }),
        })
        const json = await res.json()
        if (res.ok) mutate(cur => ({ data: (cur?.data ?? []).map(p => p.id === editing.id ? json.data : p) }), { revalidate: false })
      } else {
        const res = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
        const json = await res.json()
        if (res.ok) mutate(cur => ({ data: [json.data, ...(cur?.data ?? [])] }), { revalidate: false })
      }
      setModal(null)
    } finally {
      setSaving(false)
    }
  }

  async function deleteProject(id: string) {
    mutate(cur => ({ data: (cur?.data ?? []).filter(p => p.id !== id) }), { revalidate: false })
    await fetch(`/api/projects?id=${id}`, { method: 'DELETE' })
  }

  function addTech() {
    const t = techInput.trim()
    if (t && !form.tech_stack.includes(t)) setForm(f => ({ ...f, tech_stack: [...f.tech_stack, t] }))
    setTechInput('')
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--c-text)', letterSpacing: '-0.02em', marginBottom: 4 }}>Projects</h1>
          <p style={{ fontSize: 12, color: 'var(--c-text-muted)' }}>
            <strong style={{ color: 'var(--c-violet)' }}>{projects.length}</strong> projects · <strong style={{ color: 'var(--c-teal)' }}>{projects.filter(p => p.published_to_portfolio).length}</strong> published
          </p>
        </div>
        <button onClick={openAdd} style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '8px 16px', borderRadius: 'var(--r-md)',
          background: 'var(--c-gold)', border: 'none',
          color: '#fff', fontSize: 13, fontWeight: 600,
          cursor: 'pointer', fontFamily: 'var(--font-body)',
        }}>
          <Plus size={15} /> Add Project
        </button>
      </div>

      {/* Category filter */}
      <div style={{ display: 'flex', gap: 7, marginBottom: 22, flexWrap: 'wrap' }}>
        {CATEGORIES.map(cat => (
          <button key={cat} onClick={() => setFilter(cat)} style={{
            padding: '5px 13px', borderRadius: 999,
            border: `1px solid ${filter === cat ? (CATEGORY_COLORS[cat] ?? 'var(--c-violet)') : 'var(--c-border)'}`,
            background: filter === cat ? `${CATEGORY_COLORS[cat] ?? 'var(--c-violet)'}14` : 'transparent',
            color: filter === cat ? (CATEGORY_COLORS[cat] ?? 'var(--c-violet)') : 'var(--c-text-muted)',
            fontSize: 12, fontWeight: filter === cat ? 600 : 400,
            cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'var(--font-body)',
            textTransform: 'capitalize',
          }}>
            {cat}
          </button>
        ))}
      </div>

      {/* Projects grid */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '64px 24px', color: 'var(--c-text-muted)' }}>
          <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px 24px', color: 'var(--c-text-dim)' }}>
          <Layers size={36} style={{ marginBottom: 12, opacity: 0.25 }} />
          <p style={{ fontSize: 14, fontWeight: 500 }}>No projects in this category</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {filtered.map(p => {
            const color = CATEGORY_COLORS[p.category] ?? 'var(--c-text-muted)'
            return (
              <div key={p.id} style={{
                background: 'var(--c-bg-2)', border: '1px solid var(--c-border)',
                borderRadius: 'var(--r-xl)', padding: '20px',
                display: 'flex', flexDirection: 'column', gap: 12,
                transition: 'border-color 0.15s',
              }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--c-border-md)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--c-border)'}
              >
                {/* Card header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                      <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.title}
                      </h3>
                      {p.featured && <Star size={12} color="var(--c-gold)" fill="var(--c-gold)" />}
                    </div>
                    <span style={{
                      fontSize: 10, padding: '2px 8px', borderRadius: 999, fontWeight: 600,
                      background: `${color}14`, color, textTransform: 'capitalize',
                      border: `1px solid ${color}25`,
                    }}>
                      {p.category}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0, marginLeft: 8 }}>
                    <IconBtn icon={Edit3} onClick={() => openEdit(p)} />
                    <IconBtn icon={Trash2} onClick={() => deleteProject(p.id)} danger />
                  </div>
                </div>

                {/* Description */}
                <p style={{
                  fontSize: 12, color: 'var(--c-text-muted)', lineHeight: 1.6,
                  overflow: 'hidden', display: '-webkit-box',
                  WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                }}>
                  {p.description}
                </p>

                {/* Tech stack */}
                {p.tech_stack.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {p.tech_stack.map(t => (
                      <span key={t} style={{
                        fontSize: 10, padding: '2px 7px', borderRadius: 999,
                        background: 'var(--c-bg-4)', color: 'var(--c-text-muted)',
                        border: '1px solid var(--c-border)', fontFamily: 'var(--font-mono)',
                      }}>
                        {t}
                      </span>
                    ))}
                  </div>
                )}

                {/* Footer */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: 8, borderTop: '1px solid var(--c-border)' }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {p.github_url && (
                      <a href={p.github_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--c-text-muted)', transition: 'color 0.15s', display: 'flex' }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--c-text)'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--c-text-muted)'}
                      >
                        <Github size={14} />
                      </a>
                    )}
                    {p.live_url && (
                      <a href={p.live_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--c-text-muted)', transition: 'color 0.15s', display: 'flex' }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--c-teal)'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--c-text-muted)'}
                      >
                        <ExternalLink size={14} />
                      </a>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {p.published_to_portfolio && (
                      <span style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 3, color: 'var(--c-teal)' }}>
                        <Globe size={10} /> Published
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add / Edit modal */}
      {modal && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setModal(null)}
        >
          <div
            style={{ background: 'var(--c-bg-3)', border: '1px solid var(--c-border-md)', borderRadius: 'var(--r-xl)', padding: '28px', width: 520, maxHeight: '85vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
              <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--c-text)' }}>
                {modal === 'edit' ? 'Edit Project' : 'New Project'}
              </h2>
              <button onClick={() => setModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-text-muted)', padding: 4 }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
              <MField id="proj-title" label="Title *">
                <input id="proj-title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. VoltAir Flight Booking" style={inp} />
              </MField>

              <MField id="proj-description" label="Description *">
                <textarea id="proj-description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What does this project do?" rows={3} style={{ ...inp, resize: 'vertical', lineHeight: 1.5 }} />
              </MField>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <MField id="proj-category" label="Category">
                  <select id="proj-category" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as Project['category'] }))} style={inp}>
                    {(['frontend', 'backend', 'fullstack', 'embedded', 'iot', 'pcb', 'other'] as const).map(c => (
                      <option key={c} value={c} style={{ textTransform: 'capitalize' }}>{c}</option>
                    ))}
                  </select>
                </MField>
                <MField id="proj-tech" label="Tech Stack">
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      id="proj-tech"
                      value={techInput}
                      onChange={e => setTechInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTech() } }}
                      placeholder="React, Node…"
                      style={{ ...inp, flex: 1 }}
                    />
                    <button type="button" onClick={addTech} style={{ padding: '8px 12px', borderRadius: 'var(--r-md)', background: 'var(--c-bg-4)', border: '1px solid var(--c-border)', color: 'var(--c-text-muted)', cursor: 'pointer', fontSize: 12 }}>
                      Add
                    </button>
                  </div>
                </MField>
              </div>

              {form.tech_stack.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {form.tech_stack.map(t => (
                    <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, padding: '3px 9px', borderRadius: 999, background: 'var(--c-bg-4)', border: '1px solid var(--c-border)', color: 'var(--c-text-muted)' }}>
                      {t}
                      <button type="button" onClick={() => setForm(f => ({ ...f, tech_stack: f.tech_stack.filter(x => x !== t) }))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, fontSize: 13, lineHeight: 1 }}>×</button>
                    </span>
                  ))}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <MField id="proj-github" label="GitHub URL">
                  <input id="proj-github" value={form.github_url ?? ''} onChange={e => setForm(f => ({ ...f, github_url: e.target.value }))} placeholder="https://github.com/…" style={inp} />
                </MField>
                <MField id="proj-live" label="Live URL">
                  <input id="proj-live" value={form.live_url ?? ''} onChange={e => setForm(f => ({ ...f, live_url: e.target.value }))} placeholder="https://…" style={inp} />
                </MField>
              </div>

              <div style={{ display: 'flex', gap: 20 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--c-text-muted)' }}>
                  <input type="checkbox" checked={form.featured} onChange={e => setForm(f => ({ ...f, featured: e.target.checked }))} style={{ accentColor: 'var(--c-gold)' }} />
                  Featured
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--c-text-muted)' }}>
                  <input type="checkbox" checked={form.published_to_portfolio} onChange={e => setForm(f => ({ ...f, published_to_portfolio: e.target.checked }))} style={{ accentColor: 'var(--c-teal)' }} />
                  Published to portfolio
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
              <button onClick={() => setModal(null)} style={{ padding: '9px 18px', borderRadius: 'var(--r-md)', background: 'transparent', border: '1px solid var(--c-border-md)', color: 'var(--c-text-muted)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                Cancel
              </button>
              <button onClick={saveProject} disabled={!form.title || saving} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '9px 20px', borderRadius: 'var(--r-md)',
                background: !form.title || saving ? 'var(--c-bg-4)' : 'var(--c-gold)',
                border: 'none', color: '#fff', fontSize: 13, fontWeight: 600,
                cursor: !form.title || saving ? 'default' : 'pointer',
                fontFamily: 'var(--font-body)',
              }}>
                {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={14} />}
                {modal === 'edit' ? 'Save Changes' : 'Add Project'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

const inp: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 'var(--r-md)',
  border: '1px solid var(--c-border)', background: 'var(--c-bg-2)',
  color: 'var(--c-text)', fontSize: 13, outline: 'none',
  fontFamily: 'var(--font-body)', boxSizing: 'border-box',
}

function MField({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--c-text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function IconBtn({ icon: Icon, onClick, danger }: { icon: React.ElementType; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} style={{
      background: 'none', border: 'none', cursor: 'pointer', padding: 5, borderRadius: 6,
      color: danger ? 'var(--c-text-dim)' : 'var(--c-text-dim)',
      display: 'flex', transition: 'all 0.15s',
    }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = danger ? '#E03255' : 'var(--c-text)'; (e.currentTarget as HTMLElement).style.background = 'var(--c-bg-4)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--c-text-dim)'; (e.currentTarget as HTMLElement).style.background = 'none' }}
    >
      <Icon size={13} />
    </button>
  )
}
