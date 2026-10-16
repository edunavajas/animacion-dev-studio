import { createWriteStream } from 'node:fs'
import { mkdir, rm, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { shell } from 'electron'
import { log } from './logs'
import type { UpdateAsset, UpdateInfo } from '../shared/types'

/** Repositorio público del que se leen las releases. */
export const RELEASE_REPO = 'edunavajas/animacion-dev-studio'
const API = `https://api.github.com/repos/${RELEASE_REPO}/releases/latest`

/**
 * Compara versiones «a.b.c» (con posibles sufijos). Devuelve true si `candidate`
 * es más nueva que `current`. No usa semver para no arrastrar una dependencia por
 * 15 líneas.
 */
export function isNewer(candidate: string, current: string): boolean {
  const parse = (v: string): number[] =>
    v
      .replace(/^v/i, '')
      .split('-')[0]
      .split('.')
      .map((n) => Number.parseInt(n, 10))
      .map((n) => (Number.isFinite(n) ? n : 0))
  const a = parse(candidate)
  const b = parse(current)
  const len = Math.max(a.length, b.length)
  for (let i = 0; i < len; i++) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    if (x !== y) return x > y
  }
  return false
}

/** Elige el instalador que corresponde a esta plataforma. */
export function pickAsset(
  assets: { name: string; browser_download_url: string; size: number; digest?: string }[],
  platform: NodeJS.Platform = process.platform
): UpdateAsset | undefined {
  const wanted = platform === 'darwin' ? /\.dmg$/i : platform === 'win32' ? /\.exe$/i : null
  if (!wanted) return undefined
  const found = assets.find((a) => wanted.test(a.name))
  if (!found) return undefined
  return {
    name: found.name,
    url: found.browser_download_url,
    size: found.size,
    digest: found.digest
  }
}

/**
 * Argumentos con los que se lanza el instalador en Windows.
 *
 * Están copiados de `electron-updater` (`NsisUpdater.doInstall`) y comprobados
 * contra las plantillas NSIS de electron-builder:
 * - `--updated` → si la app está abierta, el instalador la cierra solo en vez de
 *   preguntar (sin esto sale un diálogo de más).
 * - `/S` → instalación silenciosa, sin asistente.
 * - `--force-run` → relanza la app al terminar. En el instalador asistido esto
 *   SOLO ocurre si además es silencioso, por eso van juntos.
 */
export function windowsInstallerArgs(): string[] {
  return ['--updated', '/S', '--force-run']
}

interface GhRelease {
  tag_name?: string
  body?: string
  published_at?: string
  html_url?: string
  assets?: { name: string; browser_download_url: string; size: number; digest?: string }[]
}

/**
 * Comprueba si hay una release más nueva. Repo público ⇒ no hace falta token.
 * `currentVersion` es inyectable para poder probarlo sin depender del build.
 */
export async function checkForUpdates(currentVersion: string): Promise<UpdateInfo> {
  const base: UpdateInfo = { available: false, currentVersion }
  let res: Response
  try {
    res = await fetch(API, {
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': 'animacion-dev-studio'
      }
    })
  } catch (err) {
    log.warn('no se pudo consultar la última release', { err: String(err) })
    return { ...base, error: 'Sin conexión para comprobar actualizaciones.' }
  }
  if (!res.ok) {
    log.warn('respuesta inesperada al consultar releases', { status: res.status })
    return { ...base, error: `No se pudo comprobar (HTTP ${res.status}).` }
  }

  let release: GhRelease
  try {
    release = (await res.json()) as GhRelease
  } catch {
    return { ...base, error: 'La respuesta de GitHub no se entendió.' }
  }

  const tag = release.tag_name ?? ''
  const version = tag.replace(/^v/i, '')
  if (!version || !isNewer(version, currentVersion)) return base

  return {
    available: true,
    currentVersion,
    version,
    notes: (release.body ?? '').trim(),
    publishedAt: release.published_at,
    htmlUrl: release.html_url,
    asset: pickAsset(release.assets ?? [])
  }
}

/** Descarga un instalador con progreso. Devuelve la ruta del fichero. */
export async function downloadUpdate(
  asset: UpdateAsset,
  destDir: string,
  onProgress: (pct: number) => void,
  signal?: { aborted: boolean }
): Promise<string> {
  await mkdir(destDir, { recursive: true })
  const dest = join(destDir, asset.name)
  await rm(dest, { force: true })

  const res = await fetch(asset.url, { redirect: 'follow' })
  if (!res.ok || !res.body) throw new Error(`No se pudo descargar (HTTP ${res.status}).`)

  const total = Number(res.headers.get('content-length')) || asset.size || 0
  let received = 0
  const hash = createHash('sha256')
  const out = createWriteStream(dest)

  const reader = res.body.getReader()
  try {
    for (;;) {
      if (signal?.aborted) throw new Error('Descarga cancelada.')
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      received += value.byteLength
      hash.update(value)
      if (!out.write(Buffer.from(value))) {
        await new Promise<void>((r) => out.once('drain', () => r()))
      }
      if (total > 0) onProgress(Math.min(99, Math.round((received / total) * 100)))
    }
  } finally {
    await new Promise<void>((r) => out.end(() => r()))
  }

  // Comprobación de cordura: que exista y no esté vacío.
  const st = await stat(dest).catch(() => null)
  if (!st || st.size === 0) throw new Error('El archivo descargado está vacío.')
  if (total > 0 && st.size !== total) {
    throw new Error(`La descarga quedó incompleta (${st.size} de ${total} bytes).`)
  }

  // Integridad: GitHub publica el sha256 de cada asset. Se comprueba ANTES de
  // ejecutar nada, que es lo importante cuando el fichero es un instalador.
  if (asset.digest && asset.digest.startsWith('sha256:')) {
    const expected = asset.digest.slice('sha256:'.length).toLowerCase()
    const actual = hash.digest('hex').toLowerCase()
    if (actual !== expected) {
      await rm(dest, { force: true }).catch(() => {})
      log.error('la descarga no coincide con el sha256 publicado', { expected, actual })
      throw new Error('El archivo descargado no coincide con el que publicó GitHub. Se ha descartado.')
    }
  } else {
    log.warn('el asset no trae sha256; no se pudo comprobar la integridad', { name: asset.name })
  }

  onProgress(100)
  log.info('actualización descargada y verificada', { file: dest, bytes: st.size })
  return dest
}

/**
 * Aplica la actualización.
 *
 * - **Windows**: lanza el instalador y cierra la app para que pueda reemplazar
 *   los ficheros. Es la vía normal de software de escritorio.
 * - **macOS**: no se puede reemplazar sola sin firma de Apple (Squirrel exige
 *   que el binario nuevo esté firmado por el mismo Team ID). Se abre el `.dmg`
 *   y el usuario arrastra a Aplicaciones.
 */
export async function installUpdate(path: string): Promise<'auto' | 'manual'> {
  if (process.platform === 'win32') {
    const args = windowsInstallerArgs()
    log.info('lanzando el instalador de Windows', { path, args })
    const child = spawn(path, args, { detached: true, stdio: 'ignore', windowsHide: true })
    // Si el instalador no arranca (permisos, antivirus), hay que enterarse.
    await new Promise<void>((resolve, reject) => {
      child.once('error', (err) => {
        log.error('no se pudo lanzar el instalador', { err: String(err) })
        reject(new Error(`No se pudo abrir el instalador: ${err.message}`))
      })
      // Si sigue vivo a los 400 ms, arrancó bien.
      setTimeout(resolve, 400)
    })
    child.unref()
    return 'auto'
  }
  const err = await shell.openPath(path)
  if (err) throw new Error(err)
  return 'manual'
}
