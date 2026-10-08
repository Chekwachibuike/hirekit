'use client'
import { useState } from 'react'
import useSWR from 'swr'
import {
  Plus, X, Github, ExternalLink, Globe, Trash2, Edit3, Check, Layers, Loader2,
  Pin, Eye, EyeOff, ArrowUp, ArrowDown, Download, Link2, RefreshCw, Copy, Settings2, BookOpen,
} from 'lucide-react'
import { fetcher } from '@/lib/fetcher'
import type { Project, ProjectCategory, ProjectVisibility, PortfolioConnection } from '@/lib/supabase'

// Projects are the source of truth for the portfolio: pinned ones fill its
// main grid in the order set here, published ones its secondary list, and
// hidden ones stay in HireKit. A connected portfolio reads them through the
// public feed and rebuilds when they change (see the Portfolio panel).

type Form = {
  title: string; blurb: string; description: string; category_id: string | null
  tech_stack: string[]; github_url: string; live_url: string; docs_url: string
  image_url: string; year: string; visibility: ProjectVisibility
}

const emptyForm = (): Form => ({
  title: '', blurb: '', description: '', category_id: null, tech_stack: [],
  github_url: '', live_url: '', docs_url: '', image_url: '', year: String(new Date().getFullYear()),
  visibility: 'hidden',
})

const VIS: Record<ProjectVisibility, { label: string; hint: string; icon: React.ElementType; color: string }> = {
  pinned:    { label: 'Pinned',    hint: 'Main grid on your portfolio, in the order below', icon: Pin,    color: 'var(--c-gold)' },
  published: { label: 'Published', hint: 'Listed on your portfolio, below the pinned ones', icon: Eye,    color: 'var(--c-teal)' },
  hidden:    { label: 'Hidden',    hint: 'Only in HireKit',                                 icon: EyeOff, color: 'var(--c-text-dim)' },
}

const PALETTE = ['var(--c-violet)', 'var(--c-teal)', 'var(--c-coral)', 'var(--c-gold)', '#4DA6FF', '#9C6EFA']

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error ?? 'Something went wrong')
  return json
}

export default function ProjectsPage() {
  const { data, isLoading: loading, mutate } = useSWR<{ data: Project[] }>('/api/projects', fetcher)
  const { data: catData, mutate: mutateCats } = useSWR<{ data: ProjectCategory[] }>('/api/project-categories', fetcher)
  const { data: connData, mutate: mutateConn } = useSWR<{ data: PortfolioConnection }>('/api/portfolio-connection', fetcher)

  const projects = data?.data ?? []
  const categories = catData?.data ?? []
  const conn = connData?.data

  const [filter, setFilter]       = useState<string>('all')
  const [modal, setModal]         = useState<'add' | 'edit' | null>(null)
  const [editing, setEditing]     = useState<Project | null>(null)
  const [form, setForm]           = useState<Form>(emptyForm())
  const [techInput, setTechInput] = useState('')
  const [saving, setSaving]       = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [pageError, setPageError] = useState<string | null>(null)
  const [manageCats, setManageCats] = useState(false)
  const [showPanel, setShowPanel] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  const catColor = (id: string | null) => {
    const i = categories.findIndex(c => c.id === id)
    return i < 0 ? 'var(--c-text-muted)' : PALETTE[i % PALETTE.length]
  }
  const catName = (id: string | null) => categories.find(c => c.id === id)?.name ?? 'Uncategorised'

  const inFilter = (p: Project) =>
    filter === 'all' ? true : filter === 'none' ? !p.category_id : p.category_id === filter

  const pinned = projects.filter(p => p.visibility === 'pinned')
    .sort((a, b) => (a.pin_order ?? 1e9) - (b.pin_order ?? 1e9))
  const groups: { vis: ProjectVisibility; items: Project[] }[] = [
    { vis: 'pinned', items: pinned.filter(inFilter) },
    { vis: 'published', items: projects.filter(p => p.visibility === 'published' && inFilter(p)) },
    { vis: 'hidden', items: projects.filter(p => (p.visibility ?? 'hidden') === 'hidden' && inFilter(p)) },
  ]

  // ── Project edits ───────────────────────────────────────────
  function openAdd() {
    setForm({ ...emptyForm(), category_id: filter !== 'all' && filter !== 'none' ? filter : null })
    setEditing(null); setTechInput(''); setFormError(null); setModal('add')
  }

  function openEdit(p: Project) {
    setEditing(p)
    setForm({
      title: p.title, blurb: p.blurb ?? '', description: p.description ?? '',
      category_id: p.category_id ?? null, tech_stack: [...(p.tech_stack ?? [])],
      github_url: p.github_url ?? '', live_url: p.live_url ?? '', docs_url: p.docs_url ?? '',
      image_url: p.image_url ?? '', year: p.year ?? '', visibility: p.visibility ?? 'hidden',
    })
    setTechInput(''); setFormError(null); setModal('edit')
  }

  async function saveProject() {
    if (!form.title.trim()) return
    setSaving(true); setFormError(null)
    try {
      if (modal === 'edit' && editing) {
        const json = await send('/api/projects', 'PATCH', { id: editing.id, ...form })
        mutate(cur => ({ data: (cur?.data ?? []).map(p => p.id === editing.id ? json.data : p) }), { revalidate: false })
      } else {
        const json = await send('/api/projects', 'POST', form)
        mutate(cur => ({ data: [json.data, ...(cur?.data ?? [])] }), { revalidate: false })
      }
      setModal(null)
      mutateConn()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  async function setVisibility(p: Project, visibility: ProjectVisibility) {
    if (p.visibility === visibility) return
    setPageError(null)
    // Optimistic: the server assigns the real pin slot; append for now.
    mutate(cur => ({ data: (cur?.data ?? []).map(x => x.id === p.id ? { ...x, visibility, pin_order: visibility === 'pinned' ? 1e6 : null } : x) }), { revalidate: false })
    try {
      const json = await send('/api/projects', 'PATCH', { id: p.id, visibility })
      mutate(cur => ({ data: (cur?.data ?? []).map(x => x.id === p.id ? json.data : x) }), { revalidate: false })
      mutateConn()
    } catch (e) {
      setPageError(e instanceof Error ? e.message : 'Could not update')
      mutate()
    }
  }

  async function movePinned(p: Project, dir: -1 | 1) {
    const ids = pinned.map(x => x.id)
    const i = ids.indexOf(p.id)
    const j = i + dir
    if (j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    mutate(cur => ({ data: (cur?.data ?? []).map(x => ids.includes(x.id) ? { ...x, pin_order: ids.indexOf(x.id) } : x) }), { revalidate: false })
    try {
      await send('/api/projects', 'PATCH', { order: ids })
      mutateConn()
    } catch (e) {
      setPageError(e instanceof Error ? e.message : 'Could not reorder')
      mutate()
    }
  }

  async function deleteProject(p: Project) {
    if (!confirm(`Delete "${p.title}"?${p.visibility !== 'hidden' ? ' It will also disappear from your portfolio.' : ''}`)) return
    mutate(cur => ({ data: (cur?.data ?? []).filter(x => x.id !== p.id) }), { revalidate: false })
    try { await send(`/api/projects?id=${p.id}`, 'DELETE'); mutateConn() } catch { mutate() }
  }

  function addTech() {
    const t = techInput.trim()
    if (t && !form.tech_stack.includes(t)) setForm(f => ({ ...f, tech_stack: [...f.tech_stack, t] }))
    setTechInput('')
  }

  const counts = {
    pinned: projects.filter(p => p.visibility === 'pinned').length,
    published: projects.filter(p => p.visibility === 'published').length,
  }

  return (
    <div style={{ padding: '28px 32px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--c-text)', letterSpacing: '-0.02em', marginBottom: 4 }}>Projects</h1>
          <p style={{ fontSize: 12, color: 'var(--c-text-muted)' }}>
            <strong style={{ color: 'var(--c-violet)' }}>{projects.length}</strong> projects ·{' '}
            <strong style={{ color: 'var(--c-gold)' }}>{counts.pinned}</strong> pinned ·{' '}
            <strong style={{ color: 'var(--c-teal)' }}>{counts.published}</strong> published on your portfolio
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <SecondaryBtn icon={Globe} label="Portfolio" onClick={() => setShowPanel(v => !v)} active={showPanel} />
          <SecondaryBtn icon={Download} label="Import from portfolio" onClick={() => setImportOpen(true)} />
          <button onClick={openAdd} style={{
            display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', borderRadius: 'var(--r-md)',
            background: 'var(--c-gold)', border: 'none', color: 'var(--c-on-gold)', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'var(--font-body)',
          }}>
            <Plus size={15} /> Add Project
          </button>
        </div>
      </div>

      {showPanel && conn && <PortfolioPanel conn={conn} onChange={d => mutateConn({ data: d }, { revalidate: false })} />}

      {pageError && <ErrorBar text={pageError} onClose={() => setPageError(null)} />}

      {/* Category filter */}
      <div style={{ display: 'flex', gap: 7, marginBottom: manageCats ? 10 : 22, flexWrap: 'wrap', alignItems: 'center' }}>
        {[{ id: 'all', name: 'All' }, ...categories, { id: 'none', name: 'Uncategorised' }].map(cat => {
          const active = filter === cat.id
          const color = cat.id === 'all' || cat.id === 'none' ? 'var(--c-violet)' : catColor(cat.id)
          return (
            <button key={cat.id} onClick={() => setFilter(cat.id)} style={{
              padding: '5px 13px', borderRadius: 999,
              border: `1px solid ${active ? color : 'var(--c-border)'}`,
              background: active ? `color-mix(in srgb, ${color} 9%, transparent)` : 'transparent',
              color: active ? color : 'var(--c-text-muted)',
              fontSize: 12, fontWeight: active ? 600 : 400, cursor: 'pointer', fontFamily: 'var(--font-body)',
            }}>
              {cat.name}
            </button>
          )
        })}
        <button onClick={() => setManageCats(v => !v)} title="Add, rename, reorder or delete categories" style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 999,
          border: '1px dashed var(--c-border-md)', background: 'transparent', color: 'var(--c-text-muted)',
          fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-body)',
        }}>
          <Settings2 size={12} /> {manageCats ? 'Done' : 'Categories'}
        </button>
      </div>

      {manageCats && (
        <CategoryManager
          categories={categories}
          onChanged={() => { mutateCats(); mutate() }}
          onError={setPageError}
        />
      )}

      {/* Sections */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 24px', color: 'var(--c-text-muted)' }}>
          <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      ) : projects.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px 24px', color: 'var(--c-text-dim)' }}>
          <Layers size={36} style={{ marginBottom: 12, opacity: 0.25 }} />
          <p style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>No projects yet</p>
          <p style={{ fontSize: 12 }}>Add one, or import the projects already on your portfolio.</p>
        </div>
      ) : groups.map(({ vis, items }) => {
        const V = VIS[vis]
        return (
          <section key={vis} style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
              <h2 style={{ fontSize: 13, fontWeight: 700, color: V.color, display: 'flex', alignItems: 'center', gap: 6 }}>
                <V.icon size={13} /> {V.label} <span style={{ color: 'var(--c-text-dim)', fontWeight: 500 }}>{items.length}</span>
              </h2>
              <span style={{ fontSize: 11, color: 'var(--c-text-dim)' }}>{V.hint}</span>
            </div>
            {items.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--c-text-dim)', padding: '10px 0' }}>
                {vis === 'pinned' ? 'Pin your best work to lead your portfolio with it.' : 'Nothing here.'}
              </p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
                {items.map(p => (
                  <ProjectCard
                    key={p.id}
                    p={p}
                    color={catColor(p.category_id)}
                    category={catName(p.category_id)}
                    position={vis === 'pinned' ? pinned.findIndex(x => x.id === p.id) : -1}
                    pinnedCount={pinned.length}
                    reorderable={vis === 'pinned' && filter === 'all'}
                    onEdit={() => openEdit(p)}
                    onDelete={() => deleteProject(p)}
                    onVisibility={v => setVisibility(p, v)}
                    onMove={d => movePinned(p, d)}
                  />
                ))}
              </div>
            )}
          </section>
        )
      })}

      {/* Add / Edit modal */}
      {modal && (
        <Modal title={modal === 'edit' ? 'Edit Project' : 'New Project'} onClose={() => setModal(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
            <MField id="proj-title" label="Title *">
              <input id="proj-title" value={form.title} maxLength={120} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. PocketAir" style={inp} />
            </MField>
            <MField id="proj-blurb" label="Tagline">
              <input id="proj-blurb" value={form.blurb} maxLength={160} onChange={e => setForm(f => ({ ...f, blurb: e.target.value }))} placeholder="One line, e.g. Flight search an agent can fly for you." style={inp} />
            </MField>
            <MField id="proj-description" label="Description">
              <textarea id="proj-description" value={form.description} maxLength={4000} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What does it do, and what was hard about it?" rows={4} style={{ ...inp, resize: 'vertical', lineHeight: 1.5 }} />
            </MField>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 90px', gap: 12 }}>
              <MField id="proj-category" label="Category">
                <CategorySelect
                  id="proj-category"
                  value={form.category_id}
                  categories={categories}
                  onChange={id => setForm(f => ({ ...f, category_id: id }))}
                  onCreated={() => mutateCats()}
                />
              </MField>
              <MField id="proj-vis" label="On portfolio">
                <select id="proj-vis" value={form.visibility} onChange={e => setForm(f => ({ ...f, visibility: e.target.value as ProjectVisibility }))} style={inp}>
                  <option value="pinned">Pinned</option>
                  <option value="published">Published</option>
                  <option value="hidden">Hidden</option>
                </select>
              </MField>
              <MField id="proj-year" label="Year">
                <input id="proj-year" value={form.year} maxLength={10} onChange={e => setForm(f => ({ ...f, year: e.target.value }))} style={inp} />
              </MField>
            </div>

            <MField id="proj-tech" label="Tech Stack">
              <div style={{ display: 'flex', gap: 6 }}>
                <input id="proj-tech" value={techInput} maxLength={40} onChange={e => setTechInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTech() } }}
                  placeholder="React, Node… (Enter to add)" style={{ ...inp, flex: 1 }} />
                <button type="button" onClick={addTech} style={{ padding: '8px 12px', borderRadius: 'var(--r-md)', background: 'var(--c-bg-4)', border: '1px solid var(--c-border)', color: 'var(--c-text-muted)', cursor: 'pointer', fontSize: 12 }}>Add</button>
              </div>
            </MField>
            {form.tech_stack.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: -6 }}>
                {form.tech_stack.map(t => (
                  <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, padding: '3px 9px', borderRadius: 999, background: 'var(--c-bg-4)', border: '1px solid var(--c-border)', color: 'var(--c-text-muted)' }}>
                    {t}
                    <button type="button" aria-label={`Remove ${t}`} onClick={() => setForm(f => ({ ...f, tech_stack: f.tech_stack.filter(x => x !== t) }))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, fontSize: 13, lineHeight: 1 }}>×</button>
                  </span>
                ))}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <MField id="proj-live" label="Live link">
                <input id="proj-live" value={form.live_url} onChange={e => setForm(f => ({ ...f, live_url: e.target.value }))} placeholder="https://…" style={inp} />
              </MField>
              <MField id="proj-github" label="Repository">
                <input id="proj-github" value={form.github_url} onChange={e => setForm(f => ({ ...f, github_url: e.target.value }))} placeholder="https://github.com/…" style={inp} />
              </MField>
              <MField id="proj-docs" label="API docs">
                <input id="proj-docs" value={form.docs_url} onChange={e => setForm(f => ({ ...f, docs_url: e.target.value }))} placeholder="https://…/api-docs" style={inp} />
              </MField>
              <MField id="proj-image" label="Screenshot">
                <input id="proj-image" value={form.image_url} onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))} placeholder="https://…/preview.webp" style={inp} />
              </MField>
            </div>

            {formError && <p role="alert" style={{ fontSize: 12, color: 'var(--c-danger-text)' }}>{formError}</p>}
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
            <button onClick={() => setModal(null)} style={ghostBtn}>Cancel</button>
            <button onClick={saveProject} disabled={!form.title.trim() || saving} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '9px 20px', borderRadius: 'var(--r-md)',
              background: !form.title.trim() || saving ? 'var(--c-bg-4)' : 'var(--c-gold)',
              border: 'none', color: !form.title.trim() || saving ? 'var(--c-text-dim)' : 'var(--c-on-gold)', fontSize: 13, fontWeight: 600,
              cursor: !form.title.trim() || saving ? 'default' : 'pointer', fontFamily: 'var(--font-body)',
            }}>
              {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={14} />}
              {modal === 'edit' ? 'Save Changes' : 'Add Project'}
            </button>
          </div>
        </Modal>
      )}

      {importOpen && (
        <ImportModal
          initialUrl={conn?.site_url ?? ''}
          onClose={() => setImportOpen(false)}
          onImported={() => { mutate(); mutateCats(); mutateConn() }}
        />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ── Project card ──────────────────────────────────────────────────
function ProjectCard({ p, color, category, position, pinnedCount, reorderable, onEdit, onDelete, onVisibility, onMove }: {
  p: Project; color: string; category: string; position: number; pinnedCount: number; reorderable: boolean
  onEdit: () => void; onDelete: () => void; onVisibility: (v: ProjectVisibility) => void; onMove: (d: -1 | 1) => void
}) {
  const vis = p.visibility ?? 'hidden'
  return (
    <div style={{
      background: 'var(--c-bg-2)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-xl)', padding: '18px 20px',
      display: 'flex', flexDirection: 'column', gap: 11, opacity: vis === 'hidden' ? 0.8 : 1,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
            {position >= 0 && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--c-gold)', fontFamily: 'var(--font-mono)' }}>{String(position + 1).padStart(2, '0')}</span>}
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</h3>
          </div>
          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 999, fontWeight: 600, color, border: `1px solid color-mix(in srgb, ${color} 25%, transparent)`, background: `color-mix(in srgb, ${color} 8%, transparent)` }}>
            {category}
          </span>
          {p.year && <span style={{ fontSize: 10, color: 'var(--c-text-dim)', marginLeft: 6 }}>{p.year}</span>}
        </div>
        <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
          {reorderable && position >= 0 && (
            <>
              <IconBtn icon={ArrowUp} label="Move up" onClick={() => onMove(-1)} disabled={position === 0} />
              <IconBtn icon={ArrowDown} label="Move down" onClick={() => onMove(1)} disabled={position === pinnedCount - 1} />
            </>
          )}
          <IconBtn icon={Edit3} label="Edit" onClick={onEdit} />
          <IconBtn icon={Trash2} label="Delete" onClick={onDelete} danger />
        </div>
      </div>

      {(p.blurb || p.description) && (
        <p style={{ fontSize: 12, color: 'var(--c-text-muted)', lineHeight: 1.6, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
          {p.blurb || p.description}
        </p>
      )}

      {(p.tech_stack ?? []).length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {p.tech_stack.slice(0, 6).map(t => (
            <span key={t} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 999, background: 'var(--c-bg-4)', color: 'var(--c-text-muted)', border: '1px solid var(--c-border)', fontFamily: 'var(--font-mono)' }}>{t}</span>
          ))}
          {p.tech_stack.length > 6 && <span style={{ fontSize: 10, color: 'var(--c-text-dim)' }}>+{p.tech_stack.length - 6}</span>}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: 10, borderTop: '1px solid var(--c-border)' }}>
        <div style={{ display: 'flex', gap: 9 }}>
          {p.live_url && <LinkIcon href={p.live_url} icon={ExternalLink} label="Live site" />}
          {p.github_url && <LinkIcon href={p.github_url} icon={Github} label="Repository" />}
          {p.docs_url && <LinkIcon href={p.docs_url} icon={BookOpen} label="API docs" />}
        </div>
        {/* Where this shows on the portfolio — one click to change */}
        <div role="radiogroup" aria-label="Portfolio visibility" style={{ display: 'flex', background: 'var(--c-bg-4)', borderRadius: 999, padding: 2, gap: 1 }}>
          {(['pinned', 'published', 'hidden'] as const).map(v => {
            const V = VIS[v]
            const on = vis === v
            return (
              <button key={v} role="radio" aria-checked={on} title={`${V.label}: ${V.hint}`} onClick={() => onVisibility(v)} style={{
                display: 'flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 999, border: 'none',
                background: on ? 'var(--c-bg-2)' : 'transparent', color: on ? V.color : 'var(--c-text-dim)',
                fontSize: 10, fontWeight: on ? 700 : 500, cursor: 'pointer', fontFamily: 'var(--font-body)',
                boxShadow: on ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
              }}>
                <V.icon size={10} /> {V.label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Categories ────────────────────────────────────────────────────
function CategorySelect({ id, value, categories, onChange, onCreated }: {
  id: string; value: string | null; categories: ProjectCategory[]
  onChange: (id: string | null) => void; onCreated: () => void
}) {
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [err, setErr] = useState<string | null>(null)

  async function create() {
    if (!name.trim()) return
    try {
      const json = await send('/api/project-categories', 'POST', { name })
      onCreated(); onChange(json.data.id); setCreating(false); setName(''); setErr(null)
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not create') }
  }

  if (creating) {
    return (
      <div>
        <div style={{ display: 'flex', gap: 4 }}>
          <input id={id} autoFocus value={name} maxLength={40} onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); create() } if (e.key === 'Escape') setCreating(false) }}
            placeholder="New category" style={{ ...inp, flex: 1 }} />
          <button type="button" aria-label="Create category" onClick={create} style={{ ...ghostBtn, padding: '6px 9px' }}><Check size={13} /></button>
        </div>
        {err && <p style={{ fontSize: 11, color: 'var(--c-danger-text)', marginTop: 4 }}>{err}</p>}
      </div>
    )
  }
  return (
    <select id={id} value={value ?? ''} onChange={e => e.target.value === '__new' ? setCreating(true) : onChange(e.target.value || null)} style={inp}>
      <option value="">Uncategorised</option>
      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      <option value="__new">+ New category…</option>
    </select>
  )
}

function CategoryManager({ categories, onChanged, onError }: {
  categories: ProjectCategory[]; onChanged: () => void; onError: (e: string | null) => void
}) {
  const [names, setNames] = useState<Record<string, string>>({})
  const [newName, setNewName] = useState('')

  async function run(fn: () => Promise<unknown>) {
    onError(null)
    try { await fn(); onChanged() } catch (e) { onError(e instanceof Error ? e.message : 'Could not update categories') }
  }
  const move = (i: number, d: -1 | 1) => {
    const ids = categories.map(c => c.id)
    const j = i + d
    if (j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    run(() => send('/api/project-categories', 'PATCH', { order: ids }))
  }

  return (
    <div style={{ background: 'var(--c-bg-2)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-lg)', padding: 14, marginBottom: 22 }}>
      <p style={{ fontSize: 11, color: 'var(--c-text-dim)', marginBottom: 10 }}>
        Your portfolio groups projects in this order. Deleting a category keeps its projects, uncategorised.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {categories.map((c, i) => {
          const draft = names[c.id] ?? c.name
          return (
            <div key={c.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input aria-label={`Rename ${c.name}`} value={draft} maxLength={40}
                onChange={e => setNames(n => ({ ...n, [c.id]: e.target.value }))}
                onBlur={() => draft.trim() && draft !== c.name && run(() => send('/api/project-categories', 'PATCH', { id: c.id, name: draft }))}
                onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                style={{ ...inp, maxWidth: 260 }} />
              <IconBtn icon={ArrowUp} label="Move up" onClick={() => move(i, -1)} disabled={i === 0} />
              <IconBtn icon={ArrowDown} label="Move down" onClick={() => move(i, 1)} disabled={i === categories.length - 1} />
              <IconBtn icon={Trash2} label={`Delete ${c.name}`} danger onClick={() => confirm(`Delete the "${c.name}" category? Its projects stay, uncategorised.`) && run(() => send(`/api/project-categories?id=${c.id}`, 'DELETE'))} />
            </div>
          )
        })}
        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          <input aria-label="New category name" value={newName} maxLength={40} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && newName.trim()) { run(() => send('/api/project-categories', 'POST', { name: newName })); setNewName('') } }}
            placeholder="New category, e.g. AI & Automation" style={{ ...inp, maxWidth: 260 }} />
          <button type="button" disabled={!newName.trim()} onClick={() => { run(() => send('/api/project-categories', 'POST', { name: newName })); setNewName('') }} style={ghostBtn}>
            <Plus size={12} /> Add
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Portfolio connection ──────────────────────────────────────────
function PortfolioPanel({ conn, onChange }: { conn: PortfolioConnection; onChange: (c: PortfolioConnection) => void }) {
  const [site, setSite] = useState(conn.site_url ?? '')
  const [hook, setHook] = useState('')
  const [newLink, setNewLink] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function act(key: string, fn: () => Promise<{ data?: PortfolioConnection; feedUrl?: string }>) {
    setBusy(key); setErr(null)
    try {
      const r = await fn()
      if (r.data) onChange(r.data)
      if (r.feedUrl) setNewLink(r.feedUrl)
    } catch (e) { setErr(e instanceof Error ? e.message : 'Something went wrong') }
    finally { setBusy(null) }
  }

  const ago = (iso: string | null) => {
    if (!iso) return null
    const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
    return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`
  }

  return (
    <div style={{ background: 'var(--c-bg-2)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-xl)', padding: '18px 20px', marginBottom: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-text)', marginBottom: 4 }}>Your portfolio</h2>
        <p style={{ fontSize: 12, color: 'var(--c-text-muted)', lineHeight: 1.6 }}>
          Your portfolio reads your pinned and published projects from a private link, and HireKit tells it to
          rebuild when they change. Nothing hidden ever leaves HireKit.
        </p>
      </div>

      {/* 1. Site */}
      <Step n={1} title="Portfolio address">
        <div style={{ display: 'flex', gap: 6 }}>
          <input aria-label="Portfolio address" value={site} onChange={e => setSite(e.target.value)} placeholder="https://you.vercel.app" style={{ ...inp, flex: 1 }} />
          <button type="button" style={ghostBtn} disabled={busy !== null || site === (conn.site_url ?? '')}
            onClick={() => act('site', () => send('/api/portfolio-connection', 'PATCH', { site_url: site }))}>
            {busy === 'site' ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={12} />} Save
          </button>
        </div>
      </Step>

      {/* 2. Feed link */}
      <Step n={2} title="Feed link (portfolio → reads from HireKit)">
        {newLink ? (
          <div style={{ background: 'var(--c-violet-dim)', borderRadius: 'var(--r-md)', padding: 12 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-violet)', marginBottom: 6 }}>Copy this now — it is shown only once.</p>
            <div style={{ display: 'flex', gap: 6 }}>
              <input readOnly value={newLink} onFocus={e => e.target.select()} aria-label="Feed link" style={{ ...inp, flex: 1, fontFamily: 'var(--font-mono)', fontSize: 11 }} />
              <button type="button" style={ghostBtn} onClick={() => { navigator.clipboard.writeText(newLink); setCopied(true); setTimeout(() => setCopied(false), 1500) }}>
                {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p style={{ fontSize: 11, color: 'var(--c-text-muted)', marginTop: 8, lineHeight: 1.6 }}>
              In your portfolio&apos;s host (e.g. Vercel → Settings → Environment Variables), set
              {' '}<code style={code}>HIREKIT_FEED_URL</code> to this link, then redeploy once.
            </p>
          </div>
        ) : conn.token_hint ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: 'var(--c-teal)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Link2 size={13} /> Active link ending <code style={code}>…{conn.token_hint}</code>{conn.token_created_at && `, made ${ago(conn.token_created_at)}`}
            </span>
            <span style={{ display: 'flex', gap: 6 }}>
              <button type="button" style={ghostBtn} disabled={busy !== null}
                onClick={() => confirm('Make a new link? The current one stops working, so your portfolio needs the new one before its next rebuild.') && act('token', () => send('/api/portfolio-connection', 'POST', { action: 'token' }))}>
                <RefreshCw size={12} /> New link
              </button>
              <button type="button" style={{ ...ghostBtn, color: 'var(--c-danger-text)' }} disabled={busy !== null}
                onClick={() => confirm('Revoke the feed link? Your portfolio will fall back to its built-in project list.') && act('revoke', () => send('/api/portfolio-connection', 'DELETE'))}>
                Revoke
              </button>
            </span>
          </div>
        ) : (
          <button type="button" style={{ ...ghostBtn, background: 'var(--c-violet)', color: '#fff', border: 'none' }} disabled={busy !== null}
            onClick={() => act('token', () => send('/api/portfolio-connection', 'POST', { action: 'token' }))}>
            {busy === 'token' ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Link2 size={12} />} Create feed link
          </button>
        )}
      </Step>

      {/* 3. Deploy hook */}
      <Step n={3} title="Deploy hook (HireKit → tells portfolio to rebuild)">
        {conn.has_deploy_hook && (
          <p style={{ fontSize: 12, color: 'var(--c-teal)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Check size={13} /> Hook set ({conn.deploy_hook_host})
            {conn.last_rebuild_at && <span style={{ color: 'var(--c-text-muted)' }}>· last rebuild {ago(conn.last_rebuild_at)}: {conn.last_rebuild_status}</span>}
          </p>
        )}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <input aria-label="Deploy hook URL" value={hook} onChange={e => setHook(e.target.value)}
            placeholder={conn.has_deploy_hook ? 'Paste a new hook to replace it' : 'https://api.vercel.com/v1/integrations/deploy/…'}
            style={{ ...inp, flex: 1, minWidth: 260 }} />
          <button type="button" style={ghostBtn} disabled={busy !== null || !hook.trim()}
            onClick={() => act('hook', async () => { const r = await send('/api/portfolio-connection', 'PATCH', { deploy_hook_url: hook }); setHook(''); return r })}>
            <Check size={12} /> Save
          </button>
          {conn.has_deploy_hook && (
            <button type="button" style={ghostBtn} disabled={busy !== null}
              onClick={() => act('rebuild', () => send('/api/portfolio-connection', 'POST', { action: 'rebuild' }))}>
              {busy === 'rebuild' ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={12} />} Rebuild now
            </button>
          )}
        </div>
        <p style={{ fontSize: 11, color: 'var(--c-text-dim)', marginTop: 6, lineHeight: 1.6 }}>
          Vercel: project → Settings → Git → Deploy Hooks → create one for your main branch. Changes rebuild the
          site automatically, at most once every 90 seconds; use Rebuild now for anything in between.
        </p>
      </Step>

      {err && <p role="alert" style={{ fontSize: 12, color: 'var(--c-danger-text)' }}>{err}</p>}
    </div>
  )
}

// ── Import ────────────────────────────────────────────────────────
interface Candidate {
  key: string | null; title: string; blurb: string | null; category: string | null
  live: string | null; repo: string | null; pinned: boolean; exists: boolean
}

function ImportModal({ initialUrl, onClose, onImported }: { initialUrl: string; onClose: () => void; onImported: () => void }) {
  const [url, setUrl] = useState(initialUrl)
  const [items, setItems] = useState<Candidate[] | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState<{ imported: string[]; failed: { title: string; error: string }[] } | null>(null)

  async function preview() {
    setBusy(true); setErr(null); setItems(null); setDone(null)
    try {
      const json = await send('/api/projects/import', 'POST', { site_url: url, action: 'preview' })
      const list = json.data as Candidate[]
      setItems(list)
      setPicked(new Set(list.filter(c => !c.exists && c.key).map(c => c.key!)))
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not read the portfolio') }
    finally { setBusy(false) }
  }

  async function runImport() {
    setBusy(true); setErr(null)
    try {
      const json = await send('/api/projects/import', 'POST', { site_url: url, action: 'import', keys: Array.from(picked) })
      setDone(json); onImported()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Import failed') }
    finally { setBusy(false) }
  }

  return (
    <Modal title="Import from your portfolio" onClose={onClose} width={600}>
      <p style={{ fontSize: 12, color: 'var(--c-text-muted)', lineHeight: 1.6, marginBottom: 14 }}>
        Reads the projects your portfolio publishes at <code style={code}>/hirekit.json</code>. Nothing is added
        until you choose; projects already in HireKit are skipped.
      </p>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        <input aria-label="Portfolio address" value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && preview()} placeholder="https://you.vercel.app" style={{ ...inp, flex: 1 }} />
        <button type="button" onClick={preview} disabled={busy || !url.trim()} style={ghostBtn}>
          {busy && !items ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={12} />} Find projects
        </button>
      </div>

      {err && <p role="alert" style={{ fontSize: 12, color: 'var(--c-danger-text)', marginBottom: 10 }}>{err}</p>}

      {done ? (
        <div style={{ fontSize: 13, color: 'var(--c-text)', lineHeight: 1.7 }}>
          <p style={{ fontWeight: 700, color: 'var(--c-teal)' }}>Imported {done.imported.length} project{done.imported.length === 1 ? '' : 's'}.</p>
          {done.failed.map(f => <p key={f.title} style={{ fontSize: 12, color: 'var(--c-danger-text)' }}>{f.title}: {f.error}</p>)}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}><button onClick={onClose} style={ghostBtn}>Done</button></div>
        </div>
      ) : items && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 360, overflowY: 'auto' }}>
            {items.length === 0 && <p style={{ fontSize: 12, color: 'var(--c-text-dim)' }}>The portfolio lists no projects.</p>}
            {items.map(c => {
              const key = c.key ?? c.title
              const can = !c.exists && !!c.key
              return (
                <label key={key} style={{
                  display: 'flex', gap: 10, alignItems: 'flex-start', padding: '9px 11px', borderRadius: 'var(--r-md)',
                  border: '1px solid var(--c-border)', background: 'var(--c-bg-2)', cursor: can ? 'pointer' : 'default', opacity: can ? 1 : 0.55,
                }}>
                  <input type="checkbox" disabled={!can} checked={can && picked.has(c.key!)}
                    onChange={e => setPicked(s => { const n = new Set(s); if (e.target.checked) n.add(c.key!); else n.delete(c.key!); return n })}
                    style={{ marginTop: 3, accentColor: 'var(--c-gold)' }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text)' }}>{c.title}</span>
                    {c.pinned && <span style={{ fontSize: 10, color: 'var(--c-gold)', marginLeft: 6, fontWeight: 700 }}>PINNED</span>}
                    {c.category && <span style={{ fontSize: 10, color: 'var(--c-text-dim)', marginLeft: 6 }}>{c.category}</span>}
                    {c.exists && <span style={{ fontSize: 10, color: 'var(--c-teal)', marginLeft: 6 }}>Already in HireKit</span>}
                    {c.blurb && <span style={{ display: 'block', fontSize: 11, color: 'var(--c-text-muted)', marginTop: 2 }}>{c.blurb}</span>}
                  </span>
                </label>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 18, justifyContent: 'flex-end', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--c-text-dim)', marginRight: 'auto' }}>{picked.size} selected</span>
            <button onClick={onClose} style={ghostBtn}>Cancel</button>
            <button onClick={runImport} disabled={busy || picked.size === 0} style={{ ...ghostBtn, background: picked.size ? 'var(--c-gold)' : 'var(--c-bg-4)', color: picked.size ? 'var(--c-on-gold)' : 'var(--c-text-dim)', border: 'none' }}>
              {busy ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={12} />} Import {picked.size || ''}
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}

// ── Small pieces ──────────────────────────────────────────────────
const inp: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 'var(--r-md)',
  border: '1px solid var(--c-border)', background: 'var(--c-bg-2)',
  color: 'var(--c-text)', fontSize: 13, outline: 'none',
  fontFamily: 'var(--font-body)', boxSizing: 'border-box',
}

const ghostBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 5, padding: '7px 13px', borderRadius: 'var(--r-md)',
  background: 'transparent', border: '1px solid var(--c-border-md)', color: 'var(--c-text-muted)',
  fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap',
}

const code: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 11, background: 'var(--c-bg-4)', padding: '1px 5px', borderRadius: 4 }

function Modal({ title, onClose, children, width = 560 }: { title: string; onClose: () => void; children: React.ReactNode; width?: number }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'var(--c-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div role="dialog" aria-label={title} style={{ background: 'var(--c-bg-3)', border: '1px solid var(--c-border-md)', borderRadius: 'var(--r-xl)', padding: '26px 28px', width, maxWidth: 'calc(100vw - 32px)', maxHeight: '88vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--c-text)' }}>{title}</h2>
          <button aria-label="Close" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-text-muted)', padding: 4 }}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  )
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

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12 }}>
      <span style={{ width: 22, height: 22, flexShrink: 0, borderRadius: '50%', background: 'var(--c-bg-4)', color: 'var(--c-text-muted)', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{n}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-text)', marginBottom: 7 }}>{title}</p>
        {children}
      </div>
    </div>
  )
}

function ErrorBar({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <div role="alert" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: 'var(--c-danger-text)', background: 'var(--c-danger-bg)', border: '1px solid var(--c-danger-border)', borderRadius: 'var(--r-md)', padding: '8px 12px', marginBottom: 16 }}>
      {text}
      <button aria-label="Dismiss" onClick={onClose} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}><X size={12} /></button>
    </div>
  )
}

function SecondaryBtn({ icon: Icon, label, onClick, active }: { icon: React.ElementType; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button onClick={onClick} style={{ ...ghostBtn, padding: '8px 14px', fontSize: 13, background: active ? 'var(--c-bg-4)' : 'transparent' }}>
      <Icon size={14} /> {label}
    </button>
  )
}

function LinkIcon({ href, icon: Icon, label }: { href: string; icon: React.ElementType; label: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" aria-label={label} title={label} style={{ color: 'var(--c-text-muted)', display: 'flex' }}>
      <Icon size={14} />
    </a>
  )
}

function IconBtn({ icon: Icon, onClick, danger, label, disabled }: { icon: React.ElementType; onClick: () => void; danger?: boolean; label: string; disabled?: boolean }) {
  return (
    <button aria-label={label} title={label} onClick={onClick} disabled={disabled} style={{
      background: 'none', border: 'none', cursor: disabled ? 'default' : 'pointer', padding: 5, borderRadius: 6,
      color: 'var(--c-text-dim)', display: 'flex', opacity: disabled ? 0.3 : 1,
    }}
      onMouseEnter={e => { if (!disabled) { (e.currentTarget as HTMLElement).style.color = danger ? '#E03255' : 'var(--c-text)'; (e.currentTarget as HTMLElement).style.background = 'var(--c-bg-4)' } }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--c-text-dim)'; (e.currentTarget as HTMLElement).style.background = 'none' }}
    >
      <Icon size={13} />
    </button>
  )
}
