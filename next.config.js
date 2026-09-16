/** @type {import('next').NextConfig} */
const nextConfig = {
  // Desktop builds (desktop/build.ps1 sets DESKTOP_BUILD=1) produce a
  // self-contained server in .next/standalone containing only the
  // node_modules files the server actually imports. Normal dev/start
  // workflows are unaffected.
  ...(process.env.DESKTOP_BUILD ? { output: 'standalone' } : {}),
  experimental: {
    serverComponentsExternalPackages: [
      'pdf-parse', 'whatsapp-web.js', 'puppeteer', 'qrcode', 'nodemailer', 'googleapis',
    ],
  },
  // Skip type-checking and linting during `next build` — run them separately.
  // Type-checking inside the build shares one Node heap with the whole
  // compilation graph and pushed it past ~1.8GB, dying with "JavaScript heap
  // out of memory" on a machine with little RAM free. desktop/build.ps1 now
  // runs `tsc --noEmit` as its own process first, so type errors still block
  // the build — they just no longer have to fit in the same heap.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  // Reduce on-demand compile work in dev
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
}

module.exports = nextConfig
