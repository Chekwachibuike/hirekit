'use client'

export const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 600,
  color: 'var(--c-text-muted)', letterSpacing: '0.04em',
  marginBottom: 6,
}

export const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px',
  background: 'var(--c-bg-2)',
  border: '1px solid var(--c-border-md)',
  borderRadius: 'var(--r-md)',
  color: 'var(--c-text)', fontSize: 13.5, outline: 'none',
  fontFamily: 'var(--font-body)',
  transition: 'border-color 0.15s, box-shadow 0.15s',
}

function focusOn(el: HTMLElement) {
  el.style.borderColor = 'var(--c-violet)'
  el.style.boxShadow = 'var(--ring)'
}
function focusOff(el: HTMLElement) {
  el.style.borderColor = 'var(--c-border-md)'
  el.style.boxShadow = 'none'
}

interface FieldProps {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}

/** Labeled text input with a violet focus ring. Shared across all forms. */
export default function Field({ id, label, value, onChange, placeholder, type = 'text' }: FieldProps) {
  return (
    <div>
      <label htmlFor={id} style={labelStyle}>{label}</label>
      <input
        id={id}
        type={type} value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={inputStyle}
        onFocus={(e) => focusOn(e.target)}
        onBlur={(e) => focusOff(e.target)}
      />
    </div>
  )
}

export { focusOn, focusOff }
