'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import useSWR from 'swr'
import {
  User, Mail, Phone, MapPin, Linkedin, Github, Globe,
  Plus, Trash2, Upload, CheckCircle, Loader2, Save,
  FileText, ChevronDown, ChevronUp,
} from 'lucide-react'
import { fetcher } from '@/lib/fetcher'
import type { PersonalInfo, WorkExperience, Education } from '@/lib/supabase'

// ── Helpers ──────────────────────────────────────────────────

type FormState = Omit<PersonalInfo, 'id'>

const emptyForm = (): FormState => ({
  full_name: '', email: '', phone: '', location: '',
  linkedin: '', github: '', portfolio_url: '',
  summary: '', skills: [], experience: [], education: [],
  cv_markdown: '', cv_file_name: '',
})

const emptyExp = (): WorkExperience => ({
  company: '', role: '', start: '', end: '', bullets: [''],
})

const emptyEdu = (): Education => ({
  institution: '', degree: '', field: '', year: '', grade: '',
})

// ── Sub-components ────────────────────────────────────────────

function Section({ title, children, defaultOpen = true }: {
  title: string; children: React.ReactNode; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{
      background: 'var(--c-bg-2)', border: '1px solid var(--c-border)',
      borderRadius: 'var(--r-lg)', overflow: 'hidden', marginBottom: 16,
    }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 20px', background: 'none', border: 'none',
          cursor: 'pointer', color: 'var(--c-text)', fontWeight: 600, fontSize: 14,
        }}
      >
        {title}
        {open ? <ChevronUp size={14} color="var(--c-text-muted)" /> : <ChevronDown size={14} color="var(--c-text-muted)" />}
      </button>
      {open && <div style={{ padding: '0 20px 20px' }}>{children}</div>}
    </div>
  )
}

function Field({ id, label, icon: Icon, children }: {
  id: string; label: string; icon?: React.ElementType; children: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label htmlFor={id} style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 5 }}>
        {Icon && <Icon size={11} />}{label}
      </label>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 'var(--r-md)',
  border: '1px solid var(--c-border)', background: 'var(--c-bg-3)',
  color: 'var(--c-text)', fontSize: 13, outline: 'none',
  boxSizing: 'border-box',
}

// ── Main Page ─────────────────────────────────────────────────

export default function PersonalInfoPage() {
  const [form, setForm] = useState<FormState>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [uploadedFile, setUploadedFile] = useState<string | null>(null)
  const [skillInput, setSkillInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')

  // Cached across navigations — revisiting this page shows the last-loaded
  // data instantly instead of refetching from scratch every time.
  const { data: swrData, isLoading: loading, mutate } =
    useSWR<{ data: PersonalInfo | null }>('/api/personal-info', fetcher)

  // Seed the editable form from the cache exactly once per successful load —
  // re-running this on every background revalidation would clobber in-progress edits.
  const loaded = useRef(false)
  useEffect(() => {
    if (swrData?.data && !loaded.current) {
      setForm({ ...emptyForm(), ...swrData.data })
      loaded.current = true
    }
  }, [swrData])

  const set = (key: keyof FormState, value: unknown) =>
    setForm(f => ({ ...f, [key]: value }))

  // ── PDF Upload ────────────────────────────────────────────

  // The dropzone and the paste box post to the same endpoint; only the field
  // differs, so parsing and applying the result is shared.
  const parseCv = useCallback(async (body: FormData) => {
    setUploading(true)
    setError(null)
    try {
      const res = await fetch('/api/upload/cv', { method: 'POST', body })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Upload failed')
      const { parsed, file_name } = json
      setForm(f => ({
        ...f,
        full_name:     parsed.full_name     || f.full_name,
        email:         parsed.email         || f.email,
        phone:         parsed.phone         || f.phone,
        location:      parsed.location      || f.location,
        linkedin:      parsed.linkedin      || f.linkedin,
        github:        parsed.github        || f.github,
        portfolio_url: parsed.portfolio_url || f.portfolio_url,
        summary:       parsed.summary       || f.summary,
        skills:        parsed.skills?.length ? parsed.skills : f.skills,
        experience:    parsed.experience?.length ? parsed.experience : f.experience,
        education:     parsed.education?.length  ? parsed.education  : f.education,
        cv_markdown:   parsed.cv_markdown   || f.cv_markdown,
        cv_file_name:  file_name,
      }))
      setUploadedFile(file_name)
      setPasteOpen(false)
      setPasteText('')
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Upload failed'
      setError(message)
      // A scan has no text layer, so pasting is the only way through.
      if (/paste/i.test(message)) setPasteOpen(true)
    } finally {
      setUploading(false)
    }
  }, [])

  const onDrop = useCallback(async (files: File[]) => {
    const file = files[0]
    if (!file) return
    const fd = new FormData()
    fd.append('file', file)
    await parseCv(fd)
  }, [parseCv])

  const onPasteSubmit = useCallback(async () => {
    const fd = new FormData()
    fd.append('text', pasteText)
    await parseCv(fd)
  }, [parseCv, pasteText])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { 'application/pdf': ['.pdf'] }, multiple: false, disabled: uploading,
  })

  // ── Skills ────────────────────────────────────────────────

  const addSkill = () => {
    const s = skillInput.trim()
    if (s && !form.skills.includes(s)) set('skills', [...form.skills, s])
    setSkillInput('')
  }

  const removeSkill = (i: number) =>
    set('skills', form.skills.filter((_, idx) => idx !== i))

  // ── Experience ────────────────────────────────────────────

  const setExp = (i: number, key: keyof WorkExperience, val: string | string[]) =>
    set('experience', form.experience.map((e, idx) => idx === i ? { ...e, [key]: val } : e))

  const addExpBullet = (i: number) =>
    setExp(i, 'bullets', [...form.experience[i].bullets, ''])

  const setExpBullet = (ei: number, bi: number, val: string) =>
    setExp(ei, 'bullets', form.experience[ei].bullets.map((b, idx) => idx === bi ? val : b))

  const removeExpBullet = (ei: number, bi: number) =>
    setExp(ei, 'bullets', form.experience[ei].bullets.filter((_, idx) => idx !== bi))

  // ── Education ─────────────────────────────────────────────

  const setEdu = (i: number, key: keyof Education, val: string) =>
    set('education', form.education.map((e, idx) => idx === i ? { ...e, [key]: val } : e))

  // ── Save ──────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const res = await fetch('/api/personal-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Save failed')
      // Update the cache so the cv-builder page (which reads the same
      // '/api/personal-info' key) doesn't show stale data on next visit.
      mutate({ data: json.data }, { revalidate: false })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--c-text-muted)' }}>
        <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 760, padding: '28px 32px 60px' }}>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--c-text)', margin: 0 }}>Personal Info</h1>
          <p style={{ fontSize: 13, color: 'var(--c-text-muted)', marginTop: 4 }}>
            This powers your CV, cover letters, and all AI features.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '9px 18px', borderRadius: 'var(--r-md)',
            background: saved ? 'var(--c-teal-fill)' : 'var(--c-violet-fill)',
            color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
            fontSize: 13, fontWeight: 600, opacity: saving ? 0.7 : 1,
            transition: 'background 0.2s',
          }}
        >
          {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : saved ? <CheckCircle size={14} /> : <Save size={14} />}
          {saving ? 'Saving…' : saved ? 'Saved!' : 'Save'}
        </button>
      </div>

      {error && (
        <div style={{ background: 'var(--c-danger-bg)', border: '1px solid var(--c-danger-border)', color: 'var(--c-danger-text)', borderRadius: 'var(--r-md)', padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* PDF Upload */}
      <Section title="Upload CV / Resume" defaultOpen={true}>
        <div
          {...getRootProps()}
          style={{
            border: `2px dashed ${isDragActive ? 'var(--c-violet)' : 'var(--c-border)'}`,
            borderRadius: 'var(--r-lg)',
            padding: '32px 20px',
            textAlign: 'center',
            cursor: uploading ? 'not-allowed' : 'pointer',
            background: isDragActive ? 'var(--c-violet-dim)' : 'var(--c-bg-3)',
            transition: 'all 0.15s',
          }}
        >
          <input {...getInputProps()} aria-label="Upload your CV (PDF)" />
          {uploading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, color: 'var(--c-violet)' }}>
              <Loader2 size={28} style={{ animation: 'spin 1s linear infinite' }} />
              <span style={{ fontSize: 13, fontWeight: 500 }}>Parsing your CV with AI…</span>
            </div>
          ) : uploadedFile ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <CheckCircle size={28} color="var(--c-teal)" />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-teal)' }}>Parsed: {uploadedFile}</span>
              <span style={{ fontSize: 12, color: 'var(--c-text-muted)' }}>Drop another PDF to replace</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <Upload size={28} color="var(--c-text-dim)" />
              <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--c-text)' }}>
                {isDragActive ? 'Drop your CV here' : 'Drag & drop your CV (PDF)'}
              </span>
              <span style={{ fontSize: 12, color: 'var(--c-text-muted)' }}>
                AI will extract all fields automatically · max 5 MB
              </span>
            </div>
          )}
        </div>

        <div style={{ marginTop: 10, textAlign: 'center' }}>
          <button
            type="button"
            onClick={() => setPasteOpen(o => !o)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--c-violet)', fontWeight: 500, padding: 4 }}
          >
            {pasteOpen ? 'Hide paste box' : 'Paste CV text instead'}
          </button>
        </div>

        {pasteOpen && (
          <div style={{ marginTop: 8 }}>
            <textarea
              value={pasteText}
              onChange={e => setPasteText(e.target.value)}
              placeholder="Paste the full text of your CV here. Use this when the PDF is a scan and has no text layer."
              rows={10}
              disabled={uploading}
              style={{
                width: '100%', padding: 12, fontSize: 13, lineHeight: 1.6,
                borderRadius: 'var(--r-md)', border: '1px solid var(--c-border)',
                background: 'var(--c-bg-3)', color: 'var(--c-text)',
                resize: 'vertical', fontFamily: 'inherit',
              }}
            />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--c-text-muted)' }}>
                {pasteText.trim().length} characters, 80 minimum
              </span>
              <button
                type="button"
                onClick={onPasteSubmit}
                disabled={uploading || pasteText.trim().length < 80}
                style={{
                  padding: '8px 16px', fontSize: 13, fontWeight: 600,
                  borderRadius: 'var(--r-md)', border: 'none',
                  background: uploading || pasteText.trim().length < 80 ? 'var(--c-bg-4)' : 'var(--c-violet-fill)',
                  color: uploading || pasteText.trim().length < 80 ? 'var(--c-text-muted)' : '#fff',
                  cursor: uploading || pasteText.trim().length < 80 ? 'not-allowed' : 'pointer',
                }}
              >
                {uploading ? 'Parsing…' : 'Parse text'}
              </button>
            </div>
          </div>
        )}

        {form.cv_markdown && (
          <details style={{ marginTop: 12 }}>
            <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--c-violet)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 5 }}>
              <FileText size={12} /> View extracted markdown
            </summary>
            <pre style={{
              marginTop: 10, padding: 14, background: 'var(--c-bg-4)',
              borderRadius: 'var(--r-md)', fontSize: 11, color: 'var(--c-text-muted)',
              whiteSpace: 'pre-wrap', overflowX: 'auto', maxHeight: 300, overflowY: 'auto',
              border: '1px solid var(--c-border)',
            }}>
              {form.cv_markdown}
            </pre>
          </details>
        )}
      </Section>

      {/* Basic Info */}
      <Section title="Basic Information">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field id="pi-full-name" label="Full Name" icon={User}>
            <input id="pi-full-name" style={inputStyle} value={form.full_name} onChange={e => set('full_name', e.target.value)} placeholder="Your full name" />
          </Field>
          <Field id="pi-email" label="Email" icon={Mail}>
            <input id="pi-email" style={inputStyle} type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="you@example.com" />
          </Field>
          <Field id="pi-phone" label="Phone" icon={Phone}>
            <input id="pi-phone" style={inputStyle} value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+234 ..." />
          </Field>
          <Field id="pi-location" label="Location" icon={MapPin}>
            <input id="pi-location" style={inputStyle} value={form.location} onChange={e => set('location', e.target.value)} placeholder="City, Country" />
          </Field>
          <Field id="pi-linkedin" label="LinkedIn" icon={Linkedin}>
            <input id="pi-linkedin" style={inputStyle} value={form.linkedin ?? ''} onChange={e => set('linkedin', e.target.value)} placeholder="linkedin.com/in/..." />
          </Field>
          <Field id="pi-github" label="GitHub" icon={Github}>
            <input id="pi-github" style={inputStyle} value={form.github ?? ''} onChange={e => set('github', e.target.value)} placeholder="github.com/..." />
          </Field>
          <Field id="pi-portfolio" label="Portfolio URL" icon={Globe}>
            <input id="pi-portfolio" style={{ ...inputStyle, gridColumn: 'span 2' }} value={form.portfolio_url ?? ''} onChange={e => set('portfolio_url', e.target.value)} placeholder="https://yoursite.com" />
          </Field>
        </div>
      </Section>

      {/* Summary */}
      <Section title="Professional Summary">
        <textarea
          aria-label="Professional summary"
          style={{ ...inputStyle, minHeight: 110, resize: 'vertical', lineHeight: 1.6 }}
          value={form.summary}
          onChange={e => set('summary', e.target.value)}
          placeholder="A brief paragraph about your background, strengths, and what you're looking for…"
        />
      </Section>

      {/* Skills */}
      <Section title={`Skills (${form.skills.length})`}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            aria-label="Add a skill"
            style={{ ...inputStyle, flex: 1 }}
            value={skillInput}
            onChange={e => setSkillInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSkill() } }}
            placeholder="Type a skill and press Enter"
          />
          <button
            type="button" onClick={addSkill}
            style={{ padding: '8px 14px', borderRadius: 'var(--r-md)', background: 'var(--c-violet-fill)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
          >
            Add
          </button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
          {form.skills.map((skill, i) => (
            <span key={i} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '4px 10px', borderRadius: 999,
              background: 'var(--c-violet-dim)', border: '1px solid rgba(124,92,252,0.2)',
              color: 'var(--c-violet)', fontSize: 12, fontWeight: 500,
            }}>
              {skill}
              <button type="button" onClick={() => removeSkill(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-violet)', padding: 0, lineHeight: 1, fontSize: 14 }}>×</button>
            </span>
          ))}
          {form.skills.length === 0 && (
            <span style={{ fontSize: 12, color: 'var(--c-text-dim)' }}>No skills added yet</span>
          )}
        </div>
      </Section>

      {/* Experience */}
      <Section title={`Work Experience (${form.experience.length})`}>
        {form.experience.map((exp, ei) => (
          <div key={ei} style={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', padding: 16, marginBottom: 12, background: 'var(--c-bg-3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-text-muted)' }}>Role {ei + 1}</span>
              <button aria-label="Remove role" type="button" onClick={() => set('experience', form.experience.filter((_, idx) => idx !== ei))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-text-dim)', padding: 2 }}>
                <Trash2 size={13} />
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <Field id={`exp-company-${ei}`} label="Company">
                <input id={`exp-company-${ei}`} style={inputStyle} value={exp.company} onChange={e => setExp(ei, 'company', e.target.value)} placeholder="Company name" />
              </Field>
              <Field id={`exp-role-${ei}`} label="Role / Title">
                <input id={`exp-role-${ei}`} style={inputStyle} value={exp.role} onChange={e => setExp(ei, 'role', e.target.value)} placeholder="e.g. Frontend Developer" />
              </Field>
              <Field id={`exp-start-${ei}`} label="Start">
                <input id={`exp-start-${ei}`} style={inputStyle} value={exp.start} onChange={e => setExp(ei, 'start', e.target.value)} placeholder="Jan 2023" />
              </Field>
              <Field id={`exp-end-${ei}`} label="End">
                <input id={`exp-end-${ei}`} style={inputStyle} value={exp.end} onChange={e => setExp(ei, 'end', e.target.value)} placeholder="Dec 2024 or Present" />
              </Field>
            </div>
            <Field id={`exp-bullets-${ei}`} label="Responsibilities / Achievements">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 4 }}>
                {exp.bullets.map((b, bi) => (
                  <div key={bi} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ color: 'var(--c-text-dim)', fontSize: 16, lineHeight: 1 }}>·</span>
                    <input
                      id={bi === 0 ? `exp-bullets-${ei}` : undefined}
                      aria-label={`Achievement bullet ${bi + 1}`}
                      style={{ ...inputStyle, flex: 1 }}
                      value={b}
                      onChange={e => setExpBullet(ei, bi, e.target.value)}
                      placeholder="Achieved X by doing Y, resulting in Z…"
                    />
                    {exp.bullets.length > 1 && (
                      <button aria-label="Remove bullet" type="button" onClick={() => removeExpBullet(ei, bi)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-text-dim)', padding: 2 }}>
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                ))}
                <button type="button" onClick={() => addExpBullet(ei)}
                  style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--c-violet)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', fontWeight: 500 }}>
                  <Plus size={12} /> Add bullet
                </button>
              </div>
            </Field>
          </div>
        ))}
        <button type="button"
          onClick={() => set('experience', [...form.experience, emptyExp()])}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 'var(--r-md)', border: '1px dashed var(--c-border)', background: 'transparent', color: 'var(--c-text-muted)', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
          <Plus size={13} /> Add Role
        </button>
      </Section>

      {/* Education */}
      <Section title={`Education (${form.education.length})`}>
        {form.education.map((edu, i) => (
          <div key={i} style={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', padding: 16, marginBottom: 12, background: 'var(--c-bg-3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-text-muted)' }}>Entry {i + 1}</span>
              <button aria-label="Remove education entry" type="button" onClick={() => set('education', form.education.filter((_, idx) => idx !== i))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-text-dim)', padding: 2 }}>
                <Trash2 size={13} />
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field id={`edu-institution-${i}`} label="Institution">
                <input id={`edu-institution-${i}`} style={inputStyle} value={edu.institution} onChange={e => setEdu(i, 'institution', e.target.value)} placeholder="University / College" />
              </Field>
              <Field id={`edu-degree-${i}`} label="Degree">
                <input id={`edu-degree-${i}`} style={inputStyle} value={edu.degree} onChange={e => setEdu(i, 'degree', e.target.value)} placeholder="B.Sc., M.Sc., HND…" />
              </Field>
              <Field id={`edu-field-${i}`} label="Field of Study">
                <input id={`edu-field-${i}`} style={inputStyle} value={edu.field} onChange={e => setEdu(i, 'field', e.target.value)} placeholder="Computer Science" />
              </Field>
              <Field id={`edu-year-${i}`} label="Year Completed">
                <input id={`edu-year-${i}`} style={inputStyle} value={edu.year} onChange={e => setEdu(i, 'year', e.target.value)} placeholder="2024" />
              </Field>
              <Field id={`edu-grade-${i}`} label="Grade (optional)">
                <input id={`edu-grade-${i}`} style={inputStyle} value={edu.grade ?? ''} onChange={e => setEdu(i, 'grade', e.target.value)} placeholder="First Class, 3.8 GPA…" />
              </Field>
            </div>
          </div>
        ))}
        <button type="button"
          onClick={() => set('education', [...form.education, emptyEdu()])}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 'var(--r-md)', border: '1px dashed var(--c-border)', background: 'transparent', color: 'var(--c-text-muted)', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
          <Plus size={13} /> Add Education
        </button>
      </Section>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        input:focus, textarea:focus { border-color: var(--c-violet) !important; box-shadow: 0 0 0 3px var(--c-violet-dim); }
      `}</style>
    </div>
  )
}
