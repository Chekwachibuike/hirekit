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
  // Skip type-checking and linting during `next build` — run them separately
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: true },
  // Reduce on-demand compile work in dev
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
}

module.exports = nextConfig
