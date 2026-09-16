import type { Metadata } from 'next'
import { DM_Sans, JetBrains_Mono, Space_Grotesk } from 'next/font/google'
import '../styles/tokens.css'
import ShellWrapper from '../components/layout/ShellWrapper'

// next/font downloads and self-hosts these at build time, so pages no longer
// make a render-blocking request to fonts.googleapis.com/fonts.gstatic.com.
const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-body',
  display: 'swap',
})

const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
})

// Display face for headings/logo — wired to --font-display in tokens.css.
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-space',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'HireKit — Job Application Suite',
  description: 'CV builder, job tracker, and AI cover letter writer',
}

// Runs before first paint: stamps data-theme on <html> from the stored
// preference (or the OS setting for `auto`) so there is no theme flash.
const THEME_SCRIPT = `
(function(){
  try {
    var m = localStorage.getItem('hirekit-theme') || 'auto';
    var dark = m === 'dark' || (m === 'auto' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  } catch (e) {
    document.documentElement.dataset.theme = 'light';
  }
})();
`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${dmSans.variable} ${jetBrainsMono.variable} ${spaceGrotesk.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <ShellWrapper>{children}</ShellWrapper>
      </body>
    </html>
  )
}
