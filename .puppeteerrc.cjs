// Puppeteer's own supported config file (not an npm setting, so no warning
// like .npmrc's puppeteer_skip_download produced). whatsapp-web.js pulls in
// puppeteer transitively; this stops it from downloading a private ~300MB
// Chromium on install — we point it at the system's Edge/Chrome instead,
// see src/lib/whatsapp-client.ts.
/** @type {import('puppeteer').Configuration} */
module.exports = {
  skipDownload: true,
}
