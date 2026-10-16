#!/usr/bin/env node
/**
 * Prepara los sidecars que hacen que la app funcione OFFLINE y sin instalar nada:
 *
 *  1. Copia el runtime y el reproductor REALES de hyperframes a resources/player.
 *  2. Descarga chrome-headless-shell (el navegador del render) a resources/chrome.
 *  3. Comprueba que ffmpeg/ffprobe están disponibles (vienen de npm).
 *
 * Idempotente: si ya está, no vuelve a descargar. Usa SKIP_CHROME=1 para omitir
 * la descarga (p. ej. en un entorno sin red para el resto del build).
 */
import { createRequire } from 'node:module'
import { cp, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const resources = join(root, 'resources')

async function copyPlayer() {
  const pkgJson = require.resolve('hyperframes/package.json')
  const dist = join(dirname(pkgJson), 'dist')
  const outDir = join(resources, 'player')
  await mkdir(outDir, { recursive: true })
  const files = ['hyperframe-runtime.js']
  for (const f of files) {
    const src = join(dist, f)
    if (!existsSync(src)) throw new Error(`Falta el bundle del reproductor: ${src}`)
    await cp(src, join(outDir, f), { force: true })
    const st = await stat(join(outDir, f))
    console.log(`  player  ${f}  ${(st.size / 1024).toFixed(0)} KB`)
  }
}

async function fetchChrome() {
  if (process.env.SKIP_CHROME === '1') {
    console.log('  chrome  omitido (SKIP_CHROME=1)')
    return
  }
  const outDir = join(resources, 'chrome')
  await mkdir(outDir, { recursive: true })
  const {
    install,
    Browser,
    resolveBuildId,
    detectBrowserPlatform
  } = await import('@puppeteer/browsers')

  // CHROME_PLATFORM permite preparar varias arquitecturas (p. ej. "mac_arm,mac").
  const platforms = (process.env.CHROME_PLATFORM || String(detectBrowserPlatform()))
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  const buildId = process.env.CHROME_BUILD_ID || '152.0.7977.30'

  for (const platform of platforms) {
    const marker = join(outDir, `.${platform}-ok`)
    if (existsSync(marker) && process.env.FORCE_CHROME !== '1') {
      console.log(`  chrome  ${platform} ya presente`)
      continue
    }
    const resolved = await resolveBuildId(Browser.CHROMEHEADLESSSHELL, platform, buildId).catch(
      () => buildId
    )
    console.log(`  chrome  descargando chrome-headless-shell@${resolved} (${platform})…`)
    const result = await install({
      browser: Browser.CHROMEHEADLESSSHELL,
      buildId: resolved,
      cacheDir: outDir,
      platform
    })
    console.log(`  chrome  ${platform} listo → ${result.executablePath}`)
    await writeFile(marker, `${resolved}\n`, 'utf8')
  }
}

async function copyTemplates() {
  const src = join(root, 'templates')
  const outDir = join(resources, 'templates')
  await mkdir(outDir, { recursive: true })
  await cp(src, outDir, { recursive: true, force: true })
  const dirs = (await readdir(outDir, { withFileTypes: true })).filter((d) => d.isDirectory())
  console.log(`  plantillas  ${dirs.length} de ejemplo → resources/templates`)
}

/**
 * ffprobe-static trae binarios de TODAS las plataformas (233 MB). Se dejan solo
 * los de destino: KEEP_PLATFORMS="darwin/arm64,darwin/x64" para builds cruzados.
 */
async function pruneFfprobe() {
  const base = join(root, 'node_modules', 'ffprobe-static', 'bin')
  if (!existsSync(base)) return
  const keep = (process.env.KEEP_PLATFORMS || `${process.platform}/${process.arch}`)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  for (const plat of await readdir(base)) {
    const platDir = join(base, plat)
    if (!(await stat(platDir)).isDirectory()) continue
    for (const arch of await readdir(platDir)) {
      const key = `${plat}/${arch}`
      if (keep.includes(key)) continue
      await rm(join(platDir, arch), { recursive: true, force: true })
      console.log(`  ffprobe podado ${key}`)
    }
  }
}

async function checkFfmpeg() {
  try {
    const ffmpeg = require('ffmpeg-static')
    const ffprobe = require('ffprobe-static').path
    console.log(`  ffmpeg  ${existsSync(ffmpeg) ? 'ok' : 'FALTA'} → ${ffmpeg}`)
    console.log(`  ffprobe ${existsSync(ffprobe) ? 'ok' : 'FALTA'} → ${ffprobe}`)
  } catch (err) {
    console.warn('  ffmpeg  aviso: no se pudo resolver ffmpeg-static/ffprobe-static', err.message)
  }
}

console.log('Preparando sidecars…')
await copyPlayer()
await copyTemplates()
await fetchChrome()
await pruneFfprobe()
await checkFfmpeg()
await writeFile(
  join(resources, '.sidecars-ok'),
  `preparado ${new Date().toISOString()} en ${process.platform}-${process.arch}\n`,
  'utf8'
)
console.log('Sidecars listos.')
