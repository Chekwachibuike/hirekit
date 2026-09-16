'use client'
import { useState, useRef } from 'react'
import useSWR from 'swr'
import {
  Plus, X, ExternalLink, MoreHorizontal, Calendar,
  MapPin, DollarSign, Search, Briefcase, Edit3, Trash2, Check, Loader2
} from 'lucide-react'
import { fetcher } from '../../lib/fetcher'
import { STATUS_CONFIG } from '../../lib/mock'
import type { JobApplication, AppStatus } from '../../lib/supabase'
import Button from '@/components/ui/Button'
import Field, { labelStyle, inputStyle, focusOn, focusOff } from '@/components/ui/Field'

// ── Column order ────────────────────────────────────────────
const COLUMNS: AppStatus[] = ['draft', 'applied', 'interview', 'offer', 'rejected', 'ghosted']

const COLUMN_META = {
  draft:     { label: 'Draft',     emoji: '📝' },
  applied:   { label: 'Applied',   emoji: '📤' },
  interview: { label: 'Interview', emoji: '🎯' },
  offer:     { label: 'Offer',     emoji: '🎉' },
  rejected:  { label: 'Rejected',  emoji: '❌' },
  ghosted:   { label: 'Ghosted',   emoji: '👻' },
}

// ── Empty application template ───────────────────────────────
const emptyApp = (): Omit<JobApplication, 'id' | 'created_at' | 'updated_at'> => ({
  company: '', role: '', location: '', status: 'draft',
  applied_date: new Date().toISOString().split('T')[0],
  salary_range: '', notes: '', job_url: '',
  contact_name: '', contact_email: '',
})

export default function ApplicationsPage() {
  const { data, isLoading: loading, mutate } =
    useSWR<{ data: JobApplication[] }>('/api/applications', fetcher)
  const apps = data?.data ?? []

  const [search, setSearch]     = useState('')
  const [dragging, setDragging] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<AppStatus | null>(null)
  const [modal, setModal]       = useState<'add' | 'edit' | null>(null)
  const [editing, setEditing]   = useState<JobApplication | null>(null)
  const [form, setForm]         = useState(emptyApp())
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const [saving, setSaving]     = useState(false)
  const dragId = useRef<string | null>(null)

  // ── Filter ──────────────────────────────────────────────────
  const filtered = apps.filter(a =>
    a.company.toLowerCase().includes(search.toLowerCase()) ||
    a.role.toLowerCase().includes(search.toLowerCase())
  )

  function getColApps(status: AppStatus) {
    return filtered.filter(a => a.status === status)
  }

  // ── Status update (shared by drag-drop and the card's "Move to" menu) ──
  async function updateStatus(id: string, status: AppStatus) {
    const updated_at = new Date().toISOString()
    mutate(cur => ({ data: (cur?.data ?? []).map(a => a.id === id ? { ...a, status, updated_at } : a) }), { revalidate: false })
    try {
      await fetch('/api/applications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
    } catch {
      mutate()
    }
  }

  // ── Drag & Drop ─────────────────────────────────────────────
  function onDragStart(id: string) {
    dragId.current = id
    setDragging(id)
  }

  function onDragEnd() {
    setDragging(null)
    setDragOver(null)
    dragId.current = null
  }

  function onDrop(status: AppStatus) {
    if (!dragId.current) return
    updateStatus(dragId.current, status)
    setDragging(null)
    setDragOver(null)
  }

  // ── Add / Edit ──────────────────────────────────────────────
  function openAdd() {
    setForm(emptyApp())
    setEditing(null)
    setModal('add')
  }

  function openEdit(app: JobApplication) {
    setEditing(app)
    setForm({
      company: app.company, role: app.role, location: app.location || '',
      status: app.status, applied_date: app.applied_date || '',
      salary_range: app.salary_range || '', notes: app.notes || '',
      job_url: app.job_url || '', contact_name: app.contact_name || '',
      contact_email: app.contact_email || '',
    })
    setModal('edit')
    setMenuOpen(null)
  }

  async function saveApp() {
    if (!form.company || !form.role) return
    setSaving(true)
    try {
      if (modal === 'edit' && editing) {
        const res = await fetch('/api/applications', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editing.id, ...form }),
        })
        const json = await res.json()
        if (res.ok) mutate(cur => ({ data: (cur?.data ?? []).map(a => a.id === editing.id ? json.data : a) }), { revalidate: false })
      } else {
        const res = await fetch('/api/applications', {
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

  async function deleteApp(id: string) {
    setMenuOpen(null)
    mutate(cur => ({ data: (cur?.data ?? []).filter(a => a.id !== id) }), { revalidate: false })
    await fetch(`/api/applications?id=${id}`, { method: 'DELETE' })
  }

  function moveApp(id: string, status: AppStatus) {
    updateStatus(id, status)
    setMenuOpen(null)
  }

  const totalApps = apps.length
  const interviews = apps.filter(a => a.status === 'interview').length
  const offers = apps.filter(a => a.status === 'offer').length

  return (
    <div style={{ height: 'calc(100vh - var(--topbar-h))', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Top bar ── */}
      <div style={{
        padding: '22px 32px 18px',
        borderBottom: '1px solid var(--c-border)',
        background: 'var(--c-bg)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--c-text)', letterSpacing: '-0.03em', marginBottom: 6, fontFamily: 'var(--font-display)' }}>
              Applications
            </h1>
            <div style={{ display: 'flex', gap: 16, fontSize: 12.5, color: 'var(--c-text-muted)' }}>
              <span><strong style={{ color: 'var(--c-violet)', fontFamily: 'var(--font-mono)' }}>{totalApps}</strong> total</span>
              <span><strong style={{ color: 'var(--c-gold)', fontFamily: 'var(--font-mono)' }}>{interviews}</strong> interviews</span>
              <span><strong style={{ color: 'var(--c-teal)', fontFamily: 'var(--font-mono)' }}>{offers}</strong> offers</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            {/* Search */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--c-surface)', border: '1px solid var(--c-border-md)',
              borderRadius: 'var(--r-md)', padding: '8px 12px',
              transition: 'border-color 0.15s, box-shadow 0.15s',
            }}>
              <Search size={14} color="var(--c-text-muted)" />
              <input
                aria-label="Search applications"
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search companies, roles…"
                style={{
                  background: 'none', border: 'none', outline: 'none',
                  color: 'var(--c-text)', fontSize: 13, width: 180,
                  fontFamily: 'var(--font-body)',
                }}
                onFocus={e => { const p = e.target.parentElement!; p.style.borderColor = 'var(--c-violet)'; p.style.boxShadow = 'var(--ring)' }}
                onBlur={e => { const p = e.target.parentElement!; p.style.borderColor = 'var(--c-border-md)'; p.style.boxShadow = 'none' }}
              />
            </div>

            <Button onClick={openAdd}><Plus size={16} /> Add Application</Button>
          </div>
        </div>
      </div>

      {/* ── Kanban board ── */}
      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--c-text-muted)' }}>
          <Loader2 size={22} style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      ) : (
      <div style={{
        flex: 1, overflowX: 'auto', overflowY: 'hidden',
        padding: '20px 24px',
        display: 'flex', gap: 14,
      }}>
        {COLUMNS.map(status => {
          const st = STATUS_CONFIG[status]
          const colApps = getColApps(status)
          const isOver = dragOver === status

          return (
            <div
              key={status}
              onDragOver={e => { e.preventDefault(); setDragOver(status) }}
              onDrop={() => onDrop(status)}
              onDragLeave={() => setDragOver(null)}
              style={{
                width: 272, flexShrink: 0,
                background: 'var(--c-surface)',
                border: `1px solid ${isOver ? st.color : 'var(--c-border)'}`,
                boxShadow: isOver ? `0 0 0 3px color-mix(in srgb, ${st.color} 18%, transparent), var(--shadow-md)` : 'var(--shadow-sm)',
                borderRadius: 'var(--r-xl)',
                display: 'flex', flexDirection: 'column',
                maxHeight: '100%',
                transition: 'box-shadow 0.15s, border-color 0.15s',
              }}
            >
              {/* Column header */}
              <div style={{ padding: '14px 16px 12px', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: st.color, boxShadow: `0 0 0 3px color-mix(in srgb, ${st.color} 18%, transparent)` }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text)' }}>
                      {COLUMN_META[status].label}
                    </span>
                  </div>
                  <span style={{
                    minWidth: 22, height: 20, borderRadius: 999,
                    background: `color-mix(in srgb, ${st.color} 13%, transparent)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700, color: st.color,
                    padding: '0 7px', fontFamily: 'var(--font-mono)',
                  }}>
                    {colApps.length}
                  </span>
                </div>
              </div>

              {/* Cards */}
              <div style={{
                flex: 1, overflowY: 'auto',
                padding: '2px 10px 10px',
                display: 'flex', flexDirection: 'column', gap: 9,
              }}>
                {colApps.map(app => (
                  <KanbanCard
                    key={app.id}
                    app={app}
                    isDragging={dragging === app.id}
                    menuOpen={menuOpen === app.id}
                    onMenuToggle={() => setMenuOpen(menuOpen === app.id ? null : app.id)}
                    onEdit={() => openEdit(app)}
                    onDelete={() => deleteApp(app.id)}
                    onMove={(s) => moveApp(app.id, s)}
                    onDragStart={() => onDragStart(app.id)}
                    onDragEnd={onDragEnd}
                    statusConfig={STATUS_CONFIG}
                  />
                ))}

                {/* Empty state */}
                {colApps.length === 0 && (
                  <div style={{
                    padding: '22px 12px', textAlign: 'center',
                    color: 'var(--c-text-dim)', fontSize: 12,
                    border: `1px dashed ${isOver ? st.color : 'var(--c-border-md)'}`,
                    borderRadius: 'var(--r-lg)',
                    background: isOver ? `color-mix(in srgb, ${st.color} 8%, transparent)` : 'transparent',
                    transition: 'all 0.15s',
                  }}>
                    {isOver ? 'Release to drop' : 'Drop cards here'}
                  </div>
                )}
              </div>

              {/* Add to column */}
              <div style={{ padding: '6px 10px 12px', flexShrink: 0 }}>
                <button onClick={() => {
                  setForm({ ...emptyApp(), status })
                  setEditing(null)
                  setModal('add')
                }} style={{
                  width: '100%', padding: '8px',
                  background: 'transparent',
                  border: `1px dashed var(--c-border-md)`,
                  borderRadius: 'var(--r-md)',
                  color: 'var(--c-text-dim)', fontSize: 12, fontWeight: 500,
                  cursor: 'pointer', transition: 'all 0.15s',
                  fontFamily: 'var(--font-body)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = st.color
                    e.currentTarget.style.color = st.color
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'var(--c-border-md)'
                    e.currentTarget.style.color = 'var(--c-text-dim)'
                  }}
                >
                  <Plus size={13} /> Add here
                </button>
              </div>
            </div>
          )
        })}
      </div>
      )}

      {/* ── Add / Edit Modal ── */}
      {modal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'var(--c-overlay)',
          backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 20,
          animation: 'fadeIn 0.15s ease',
        }} onClick={() => setModal(null)}>
          <div style={{
            background: 'var(--c-surface)',
            border: '1px solid var(--c-border)',
            borderRadius: 'var(--r-2xl)',
            boxShadow: 'var(--shadow-xl)',
            padding: '26px 28px',
            width: 520, maxHeight: '88vh', overflowY: 'auto',
            animation: 'fadeUp 0.22s cubic-bezier(0.22,1,0.36,1)',
          }} onClick={e => e.stopPropagation()}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--c-text)', fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}>
                {modal === 'edit' ? 'Edit Application' : 'New Application'}
              </h2>
              <button aria-label="Close" onClick={() => setModal(null)} style={{
                background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-text-muted)',
                padding: 6, borderRadius: 8, display: 'flex', transition: 'background 0.15s',
              }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--c-bg-4)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field id="app-company" label="Company *" value={form.company} onChange={v => setForm(f => ({ ...f, company: v }))} placeholder="e.g. Andela" />
                <Field id="app-role" label="Role *" value={form.role} onChange={v => setForm(f => ({ ...f, role: v }))} placeholder="e.g. Fullstack Engineer" />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field id="app-location" label="Location" value={form.location} onChange={v => setForm(f => ({ ...f, location: v }))} placeholder="Lagos / Remote" />
                <div>
                  <label htmlFor="app-status" style={labelStyle}>Status</label>
                  <select id="app-status" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as AppStatus }))} style={inputStyle}
                    onFocus={e => focusOn(e.target)} onBlur={e => focusOff(e.target)}>
                    {COLUMNS.map(s => <option key={s} value={s}>{COLUMN_META[s].emoji} {STATUS_CONFIG[s].label}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field id="app-date" label="Applied Date" value={form.applied_date} onChange={v => setForm(f => ({ ...f, applied_date: v }))} type="date" />
                <Field id="app-salary" label="Salary Range" value={form.salary_range || ''} onChange={v => setForm(f => ({ ...f, salary_range: v }))} placeholder="e.g. $80k–$110k" />
              </div>

              <Field id="app-job-url" label="Job URL" value={form.job_url || ''} onChange={v => setForm(f => ({ ...f, job_url: v }))} placeholder="https://..." />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field id="app-contact-name" label="Contact Name" value={form.contact_name || ''} onChange={v => setForm(f => ({ ...f, contact_name: v }))} placeholder="Recruiter name" />
                <Field id="app-contact-email" label="Contact Email" value={form.contact_email || ''} onChange={v => setForm(f => ({ ...f, contact_email: v }))} placeholder="recruiter@company.com" />
              </div>

              <div>
                <label htmlFor="app-notes" style={labelStyle}>Notes</label>
                <textarea
                  id="app-notes"
                  value={form.notes || ''}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Interview notes, follow-up tasks, anything…"
                  rows={3}
                  style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
                  onFocus={e => focusOn(e.target)} onBlur={e => focusOff(e.target)}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
              <Button variant="ghost" onClick={() => setModal(null)}>Cancel</Button>
              <Button onClick={saveApp} disabled={!form.company || !form.role || saving}>
                {saving ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={15} />}
                {modal === 'edit' ? 'Save Changes' : 'Add Application'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ── Kanban Card ──────────────────────────────────────────────
function KanbanCard({ app, isDragging, menuOpen, onMenuToggle, onEdit, onDelete, onMove, onDragStart, onDragEnd, statusConfig }: {
  app: JobApplication
  isDragging: boolean
  menuOpen: boolean
  onMenuToggle: () => void
  onEdit: () => void
  onDelete: () => void
  onMove: (s: AppStatus) => void
  onDragStart: () => void
  onDragEnd: () => void
  statusConfig: typeof STATUS_CONFIG
}) {
  const st = statusConfig[app.status]

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      style={{
        background: 'var(--c-surface)',
        border: '1px solid var(--c-border)',
        borderRadius: 'var(--r-lg)',
        boxShadow: isDragging ? 'var(--shadow-lg)' : 'var(--shadow-xs)',
        padding: '13px 14px',
        cursor: 'grab',
        opacity: isDragging ? 0.6 : 1,
        transform: isDragging ? 'rotate(2deg) scale(1.02)' : 'none',
        transition: 'box-shadow 0.15s, border-color 0.15s, transform 0.05s',
        position: 'relative',
        userSelect: 'none',
        borderLeft: `2.5px solid ${st.color}`,
      }}
      onMouseEnter={e => {
        if (!isDragging) { e.currentTarget.style.borderColor = 'var(--c-border-md)'; e.currentTarget.style.boxShadow = 'var(--shadow-md)' }
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--c-border)'; e.currentTarget.style.boxShadow = 'var(--shadow-xs)'
        e.currentTarget.style.borderLeftColor = st.color
      }}
    >
      {/* Company logo placeholder + name */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 9 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flex: 1, minWidth: 0 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8, flexShrink: 0,
            background: `color-mix(in srgb, ${st.color} 14%, transparent)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11.5, fontWeight: 700, color: st.color,
            fontFamily: 'var(--font-mono)',
          }}>
            {app.company.slice(0, 2).toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {app.company}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--c-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {app.role}
            </div>
          </div>
        </div>

        {/* Menu */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button aria-label="Card options" onClick={e => { e.stopPropagation(); onMenuToggle() }} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--c-text-dim)', padding: 3, borderRadius: 5,
            display: 'flex', transition: 'color 0.15s, background 0.15s',
          }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--c-text)'; e.currentTarget.style.background = 'var(--c-bg-4)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--c-text-dim)'; e.currentTarget.style.background = 'transparent' }}
          >
            <MoreHorizontal size={15} />
          </button>

          {menuOpen && (
            <div style={{
              position: 'absolute', right: 0, top: '100%', zIndex: 50, marginTop: 4,
              background: 'var(--c-surface)', border: '1px solid var(--c-border-md)',
              borderRadius: 'var(--r-md)', padding: '5px',
              minWidth: 170, boxShadow: 'var(--shadow-lg)',
              animation: 'fadeUp 0.15s ease',
            }}>
              <MenuItem icon={Edit3} label="Edit" onClick={onEdit} />
              {app.job_url && (
                <MenuItem icon={ExternalLink} label="Open job post" onClick={() => window.open(app.job_url, '_blank')} />
              )}
              <div style={{ height: 1, background: 'var(--c-border)', margin: '5px 0' }} />
              <div style={{ padding: '4px 8px 3px', fontSize: 10, color: 'var(--c-text-dim)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Move to
              </div>
              {(Object.keys(STATUS_CONFIG) as AppStatus[])
                .filter(s => s !== app.status)
                .map(s => (
                  <MenuItem key={s} label={`${COLUMN_META[s].emoji} ${STATUS_CONFIG[s].label}`} onClick={() => onMove(s)} color={STATUS_CONFIG[s].color} />
                ))
              }
              <div style={{ height: 1, background: 'var(--c-border)', margin: '5px 0' }} />
              <MenuItem icon={Trash2} label="Delete" onClick={onDelete} color="var(--c-red)" />
            </div>
          )}
        </div>
      </div>

      {/* Meta chips */}
      {(app.location || app.salary_range || app.applied_date) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {app.location && <MetaChip icon={MapPin}>{app.location}</MetaChip>}
          {app.salary_range && <MetaChip icon={DollarSign} color="var(--c-teal)">{app.salary_range}</MetaChip>}
          {app.applied_date && <MetaChip icon={Calendar}>{new Date(app.applied_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</MetaChip>}
        </div>
      )}

      {/* Notes preview */}
      {app.notes && (
        <div style={{
          marginTop: 9, padding: '7px 9px',
          background: 'var(--c-surface-2)', borderRadius: 7,
          border: '1px solid var(--c-border)',
          fontSize: 11.5, color: 'var(--c-text-muted)',
          lineHeight: 1.45,
          overflow: 'hidden', display: '-webkit-box',
          WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        }}>
          {app.notes}
        </div>
      )}
    </div>
  )
}

// ── Meta chip ────────────────────────────────────────────────
function MetaChip({ icon: Icon, color, children }: { icon: React.ElementType; color?: string; children: React.ReactNode }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 8px', borderRadius: 6,
      background: 'var(--c-surface-2)', border: '1px solid var(--c-border)',
      fontSize: 11, color: color ?? 'var(--c-text-muted)', fontWeight: 500,
    }}>
      <Icon size={11} />
      {children}
    </span>
  )
}

// ── Reusable menu item ───────────────────────────────────────
function MenuItem({ icon: Icon, label, onClick, color }: {
  icon?: any; label: string; onClick: () => void; color?: string
}) {
  return (
    <button onClick={e => { e.stopPropagation(); onClick() }} style={{
      width: '100%', display: 'flex', alignItems: 'center', gap: 9,
      padding: '7px 10px', borderRadius: 7, border: 'none',
      background: 'transparent', color: color || 'var(--c-text-muted)',
      fontSize: 12.5, cursor: 'pointer', transition: 'background 0.1s',
      fontFamily: 'var(--font-body)', textAlign: 'left',
    }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--c-bg-4)'}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
    >
      {Icon && <Icon size={13} />}
      {label}
    </button>
  )
}
