import { createRequire } from 'node:module'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import os from 'node:os'
import { resourcesDir } from './paths'
import type { AppInfo } from '../shared/types'

const require = createRequire(import.meta.url)

/** Los binarios nativos no pueden vivir dentro del asar; se resuelven a `app.asar.unpacked`. */
function unpacked(p: string): string {
  return p.replace('app.asar', 'app.asar.unpacked')
}

/** Busca recursivamente ejecutables por nombre y devuelve todas las coincidencias. */
function findBinaries(root: string, names: string[], depth = 4): string[] {
  const found: string[] = []
  const walk = (dir: string, d: number): void => {
    if (d < 0 || !existsSync(dir)) return
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    const subdirs: string[] = []
    for (const entry of entries) {
      const full = join(dir, entry)
      let st
      try {
        st = statSync(full)
      } catch {
        continue
      }
      if (st.isFile() && names.includes(entry.toLowerCase())) found.push(full)
      else if (st.isDirectory()) subdirs.push(full)
    }
    for (const sub of subdirs) walk(sub, d - 1)
  }
  walk(root, depth)
  return found
}

/** Token de arquitectura que aparece en la ruta del navegador empaquetado. */
function archToken(): string {
  if (process.arch === 'arm64') return process.platform === 'darwin' ? 'arm' : 'arm64'
  return process.platform === 'darwin' ? 'x64' : 'x64'
}

/** De todas las copias del navegador, se queda con la de esta arquitectura. */
function pickForArch(candidates: string[]): string | null {
  if (!candidates.length) return null
  if (candidates.length === 1) return candidates[0]
  const token = archToken()
  const exact = candidates.find((p) => p.toLowerCase().includes(token))
  return exact ?? candidates[0]
}

let cachedCli: string | null = null

/** Ruta al CLI de hyperframes (bin/hyperframes.mjs dentro del paquete npm). */
export function hyperframesCliPath(): string {
  if (cachedCli) return cachedCli
  const pkgJson = require.resolve('hyperframes/package.json')
  cachedCli = unpacked(join(dirname(pkgJson), 'bin', 'hyperframes.mjs'))
  return cachedCli
}

const CHROME_NAMES = ['chrome-headless-shell', 'chrome-headless-shell.exe', 'google-chrome', 'chrome']

let cachedBrowser: { path: string; source: string } | null = null

/**
 * Localiza el navegador del render. Prioridad:
 * 1. El que empaquetamos en `resources/chrome/` (offline, sin instalar nada).
 * 2. La caché que hyperframes ya tenga en el equipo (por si el usuario lo usó antes).
 */
export function browserPath(): { path: string; source: string } {
  if (cachedBrowser) return cachedBrowser
  const bundled = pickForArch(findBinaries(join(resourcesDir(), 'chrome'), CHROME_NAMES))
  if (bundled) {
    cachedBrowser = { path: bundled, source: 'bundled' }
    return cachedBrowser
  }
  const cacheRoot = join(os.homedir(), '.cache', 'hyperframes', 'chrome')
  const cached = pickForArch(findBinaries(cacheRoot, CHROME_NAMES))
  if (cached) {
    cachedBrowser = { path: cached, source: 'cache' }
    return cachedBrowser
  }
  cachedBrowser = { path: '', source: 'missing' }
  return cachedBrowser
}

export function ffmpegPath(): string {
  try {
    return unpacked(require('ffmpeg-static') as string)
  } catch {
    return ''
  }
}

export function ffprobePath(): string {
  try {
    return unpacked((require('ffprobe-static') as { path: string }).path)
  } catch {
    return ''
  }
}

/** Espacio de RAM total en GB (para decidir el modo de bajo consumo). */
export function totalRamGB(): number {
  return Math.round((os.totalmem() / 1024 ** 3) * 10) / 10
}

export function isLowMemory(): boolean {
  return totalRamGB() <= 8
}

export function cores(): number {
  return os.cpus()?.length ?? 4
}

/**
 * Entorno para ejecutar el CLI como sidecar:
 * - Node de Electron (`ELECTRON_RUN_AS_NODE`) → no empaquetamos un Node aparte.
 * - Apunta navegador y ffmpeg a nuestros binarios empaquetados (offline).
 */
export function sidecarEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...extra }
  const browser = browserPath()
  if (browser.path) {
    env.HYPERFRAMES_BROWSER_PATH = browser.path
    env.PRODUCER_HEADLESS_SHELL_PATH = browser.path
  }
  const ff = ffmpegPath()
  const fp = ffprobePath()
  if (ff) env.HYPERFRAMES_FFMPEG_PATH = ff
  if (fp) env.HYPERFRAMES_FFPROBE_PATH = fp
  // Silencia telemetría/actualizaciones del CLI; la app es offline por diseño.
  env.HYPERFRAMES_NO_UPDATE_CHECK = '1'
  env.NO_COLOR = '1'
  return env
}

export function describeSidecars(): AppInfo['sidecars'] {
  const cli = hyperframesCliPath()
  const browser = browserPath()
  const ff = ffmpegPath()
  const fp = ffprobePath()
  return {
    hyperframes: { path: cli, ok: existsSync(cli) },
    browser: { path: browser.path, ok: Boolean(browser.path), source: browser.source },
    ffmpeg: { path: ff, ok: Boolean(ff) && existsSync(ff) },
    ffprobe: { path: fp, ok: Boolean(fp) && existsSync(fp) }
  }
}
