// ATS-friendly PDF export — client-side only.
//
// Why this exists: html2canvas + jsPDF rasterizes the page into an image, so
// the "PDF" is a picture of text. Applicant Tracking Systems (ATS) parse PDFs
// by extracting their text layer — an image PDF reads as EMPTY to them, and
// the text can't be selected or searched either. The browser's own print
// engine (Ctrl+P → Save as PDF) produces true vector text, embedded fonts,
// and native page-break handling — the same qualities a LaTeX pipeline gives,
// with zero dependencies.
//
// How it works: clone the target element into a print-only wrapper, inject a
// print stylesheet that hides the rest of the app, open the print dialog,
// then clean up. The user picks "Save as PDF" as the destination.

export function printElementAsPdf(selector: string, title?: string) {
  const el = document.querySelector(selector) as HTMLElement | null
  if (!el) return

  // Clone so we can strip screen-only styling without touching the live node
  const clone = el.cloneNode(true) as HTMLElement
  clone.style.boxShadow = 'none'
  clone.style.borderRadius = '0'
  clone.style.border = 'none'
  clone.style.maxWidth = 'none'
  clone.style.margin = '0'

  const wrapper = document.createElement('div')
  wrapper.className = 'hk-print-area'
  wrapper.appendChild(clone)

  const style = document.createElement('style')
  style.textContent = `
    .hk-print-area { display: none; }
    @media print {
      body > *:not(.hk-print-area) { display: none !important; }
      .hk-print-area {
        display: block !important;
        position: absolute; inset: 0;
        background: #fff;
      }
      @page { size: A4; margin: 14mm 16mm; }
      /* Keep headings attached to the content that follows them */
      .hk-print-area h1, .hk-print-area h2, .hk-print-area h3 { break-after: avoid; }
      .hk-print-area li, .hk-print-area p { break-inside: avoid; }
    }
  `

  const prevTitle = document.title
  if (title) document.title = title  // becomes the default PDF filename

  document.body.appendChild(style)
  document.body.appendChild(wrapper)

  const cleanup = () => {
    wrapper.remove()
    style.remove()
    document.title = prevTitle
    window.removeEventListener('afterprint', cleanup)
  }
  window.addEventListener('afterprint', cleanup)

  window.print()

  // Safety net — some browsers don't fire afterprint reliably
  setTimeout(cleanup, 60000)
}
