import { createRequire } from 'node:module'
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { shell } from 'electron'
import { libraryDir, resourcesDir, workDir } from './paths'
import { log } from './logs'
import { crossCheck, extractDeclaredVariables, parseManifest } from './manifest'
import { generateThumbnail } from './render'
import { strings as S } from '../shared/strings'
import type { ImportIssue, ImportResult, LibraryEntry, TemplateManifest } from '../shared/types'

const require = createRequire(import.meta.url)

async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true })
}

async function dirSize(dir: string): Promise<number> {
  let total = 0
  const walk = async (d: string): Promise<void> => {
    let entries
    try {
      entries = await readdir(d, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const full = join(d, e.name)
      if (e.isDirectory()) await walk(full)
      else {
        try {
          total += (await stat(full)).size
        } catch {
          /* ignore */
        }
      }
    }
  }
  await walk(dir)
  return total
}

function entryFromDir(id: string, dir: string, manifest: TemplateManifest, origin: string, sizeBytes: number, importedAt: string): LibraryEntry {
  const thumb = join(dir, 'thumb.png')
  return {
    id,
    name: manifest.name,
    manifest,
    dir,
    indexPath: join(dir, 'index.html'),
    thumbPath: existsSync(thumb) ? thumb : null,
    importedAt,
    origin,
    sizeBytes
  }
}

export async function listLibrary(): Promise<LibraryEntry[]> {
  const root = libraryDir()
  await ensureDir(root)
  const entries: LibraryEntry[] = []
  const dirs = await readdir(root, { withFileTypes: true })
  for (const d of dirs) {
    if (!d.isDirectory()) continue
    const dir = join(root, d.name)
    const manifestPath = join(dir, 'template.json')
    if (!existsSync(manifestPath) || !existsSync(join(dir, 'index.html'))) continue
    try {
      const raw = JSON.parse(await readFile(manifestPath, 'utf8'))
      const { manifest } = parseManifest(raw)
      if (!manifest) continue
      const st = await stat(dir)
      entries.push(
        entryFromDir(manifest.id, dir, manifest, d.name, await dirSize(dir), st.mtime.toISOString())
      )
    } catch (err) {
      log.warn('plantilla ilegible en la biblioteca', { dir, err: String(err) })
    }
  }
  entries.sort((a, b) => a.name.localeCompare(b.name, 'es'))
  return entries
}

export async function getEntry(id: string): Promise<LibraryEntry | null> {
  const all = await listLibrary()
  return all.find((e) => e.id === id) ?? null
}

/** Resuelve la carpeta de plantilla dentro de una ruta soltada (carpeta o .zip). */
async function resolveSource(srcPath: string): Promise<{ dir: string; origin: string; temp?: string }> {
  const st = await stat(srcPath)
  if (st.isDirectory()) return { dir: srcPath, origin: basename(srcPath) }
  if (extname(srcPath).toLowerCase() === '.zip') {
    const AdmZip = require('adm-zip') as new (p: string) => { extractAllTo: (d: string) => void }
    const temp = join(workDir(), `import-${Date.now()}`)
    await mkdir(temp, { recursive: true })
    new AdmZip(srcPath).extractAllTo(temp)
    // Un .zip suele traer una carpeta raíz: si hay una sola, se usa esa.
    const children = (await readdir(temp, { withFileTypes: true })).filter((c) => c.isDirectory())
    const hasManifestHere = existsSync(join(temp, 'template.json'))
    const dir = !hasManifestHere && children.length === 1 ? join(temp, children[0].name) : temp
    return { dir, origin: basename(srcPath), temp }
  }
  throw new Error('Solo se pueden añadir carpetas o archivos .zip.')
}

/**
 * Importa una plantilla desde una ruta soltada. Valida manifiesto e index.html,
 * la copia a la biblioteca y devuelve problemas legibles.
 */
export async function importFromPath(srcPath: string, replace = false): Promise<ImportResult> {
  const issues: ImportIssue[] = []
  let source: { dir: string; origin: string; temp?: string }
  try {
    source = await resolveSource(srcPath)
  } catch (err) {
    return { ok: false, issues: [{ level: 'error', code: 'source', message: String(err instanceof Error ? err.message : err) }] }
  }

  try {
    const manifestPath = join(source.dir, 'template.json')
    const indexPath = join(source.dir, 'index.html')
    if (!existsSync(manifestPath)) {
      return { ok: false, issues: [{ level: 'error', code: 'manifestMissing', message: S.errors.manifestMissing }] }
    }
    if (!existsSync(indexPath)) {
      return { ok: false, issues: [{ level: 'error', code: 'indexMissing', message: S.errors.indexMissing }] }
    }

    let raw: unknown
    try {
      raw = JSON.parse(await readFile(manifestPath, 'utf8'))
    } catch {
      return { ok: false, issues: [{ level: 'error', code: 'invalidJson', message: S.errors.invalidJson }] }
    }

    const { manifest, issues: manifestIssues } = parseManifest(raw)
    issues.push(...manifestIssues)
    if (!manifest) return { ok: false, issues }

    const html = await readFile(indexPath, 'utf8')
    const { vars, issues: varIssues } = extractDeclaredVariables(html)
    issues.push(...varIssues)
    issues.push(...crossCheck(manifest, vars))
    if (manifestIssues.some((i) => i.level === 'error') || varIssues.some((i) => i.level === 'error')) {
      return { ok: false, issues }
    }

    const existing = await getEntry(manifest.id)
    if (existing && !replace) {
      return {
        ok: false,
        issues,
        conflict: {
          existing,
          incoming: { id: manifest.id, name: manifest.name, version: manifest.version }
        }
      }
    }

    const target = join(libraryDir(), manifest.id)
    if (existing && replace) await rm(target, { recursive: true, force: true })
    await ensureDir(libraryDir())
    await cp(source.dir, target, { recursive: true, force: true })

    const sizeBytes = await dirSize(target)
    const entry = entryFromDir(manifest.id, target, manifest, source.origin, sizeBytes, new Date().toISOString())
    log.info('plantilla importada', { id: manifest.id, dir: target, reemplazo: Boolean(existing) })
    return { ok: true, entry, issues }
  } finally {
    if (source.temp) await rm(source.temp, { recursive: true, force: true }).catch(() => {})
  }
}

/** Genera la miniatura si falta (en segundo plano). Devuelve la ruta o null. */
export async function ensureThumbnail(id: string): Promise<string | null> {
  const entry = await getEntry(id)
  if (!entry) return null
  if (entry.thumbPath) return entry.thumbPath
  // Un poco pasado el ecuador: la animación de entrada ya se ha asentado.
  const at = Math.max(0.2, entry.manifest.duration * 0.6)
  const thumb = await generateThumbnail(entry.dir, at)
  if (thumb) log.info('miniatura generada', { id })
  else log.warn('no se pudo generar la miniatura', { id })
  return thumb
}

/** Quita una plantilla de la biblioteca. Va a la papelera del sistema: recuperable. */
export async function deleteTemplate(id: string): Promise<void> {
  const target = join(libraryDir(), id)
  if (!existsSync(target)) return
  try {
    await shell.trashItem(target)
  } catch {
    // Si la papelera no está disponible (p. ej. volumen de red), se borra.
    await rm(target, { recursive: true, force: true })
  }
  log.info('plantilla a la papelera', { id })
}

export async function showInFolder(path: string): Promise<void> {
  shell.showItemInFolder(path)
}

/** Escribe una plantilla de ejemplo (solo desarrollo/tests). */
export async function writeSampleToLibrary(id: string, files: Record<string, string>): Promise<void> {
  const dir = join(libraryDir(), id)
  await ensureDir(dir)
  for (const [name, content] of Object.entries(files)) {
    const full = join(dir, name)
    await mkdir(join(full, '..'), { recursive: true })
    await writeFile(full, content, 'utf8')
  }
}

/**
 * Instala las plantillas de ejemplo que vienen con la app (primera ejecución),
 * para que la biblioteca no arranque vacía. Devuelve cuántas se añadieron.
 */
export async function installBundledExamples(): Promise<number> {
  const src = join(resourcesDir(), 'templates')
  if (!existsSync(src)) return 0
  let count = 0
  const dirs = await readdir(src, { withFileTypes: true })
  for (const d of dirs) {
    if (!d.isDirectory()) continue
    const result = await importFromPath(join(src, d.name), true)
    if (result.ok) count++
  }
  if (count) log.info('plantillas de ejemplo instaladas', { count })
  return count
}
