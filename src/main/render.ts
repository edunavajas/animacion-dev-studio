import { EventEmitter } from 'node:events'
import { spawn, type ChildProcess } from 'node:child_process'
import { cp, mkdir, rm, writeFile, readdir, copyFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { framesCacheDir, workDir } from './paths'
import { hyperframesCliPath, isLowMemory, sidecarEnv } from './sidecars'
import { log } from './logs'
import type { ExportFormat, FieldSpec, FieldValues, RenderJob, TemplateManifest } from '../shared/types'

/* ------------------------------------------------------------------ */
/* Utilidades de media                                                  */
/* ------------------------------------------------------------------ */

function sanitizeName(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]/g, '_')
}

/** Extensiones de media declaradas por los campos del manifiesto. */
export function mediaFields(manifest: TemplateManifest): FieldSpec[] {
  return manifest.fields.filter((f) => f.type === 'image' || f.type === 'video')
}

/**
 * Construye el mapa de media (ruta relativa dentro del proyecto → ruta absoluta
 * del archivo elegido por el usuario). Las media se pasan SIEMPRE como ruta
 * relativa con barras normales, que es el contrato documentado de hyperframes.
 */
export function buildMediaMap(
  manifest: TemplateManifest,
  values: FieldValues
): { relative: string; absolute: string; fieldId: string }[] {
  const out: { relative: string; absolute: string; fieldId: string }[] = []
  for (const field of mediaFields(manifest)) {
    const value = values[field.id]
    if (typeof value !== 'string' || !value) continue
    const ext = sanitizeName(extname(value).replace(/^\./, '').toLowerCase())
    const relative = `media/${sanitizeName(field.id)}.${ext}`
    out.push({ relative, absolute: value, fieldId: field.id })
  }
  return out
}

/**
 * Valores de variables que se pasan a la CLI: los campos de media se sustituyen
 * por su ruta relativa; el resto se pasan tal cual.
 */
export function buildVariablesPayload(
  manifest: TemplateManifest,
  values: FieldValues
): Record<string, string | number | boolean> {
  const mediaByField = new Map(buildMediaMap(manifest, values).map((m) => [m.fieldId, m.relative]))
  const payload: Record<string, string | number | boolean> = {}
  for (const field of manifest.fields) {
    if (mediaByField.has(field.id)) {
      payload[field.id] = mediaByField.get(field.id) as string
      continue
    }
    const v = values[field.id]
    if (v === undefined || v === null || v === '') continue
    payload[field.id] = v
  }
  return payload
}

/** Copia la plantilla a un directorio de trabajo e inyecta la media elegida. */
export async function stageTemplate(
  templateDir: string,
  manifest: TemplateManifest,
  values: FieldValues
): Promise<{ workRoot: string; media: { relative: string; absolute: string }[] }> {
  const workRoot = join(workDir(), `render-${randomUUID()}`)
  await mkdir(workRoot, { recursive: true })
  await cp(templateDir, workRoot, { recursive: true, force: true })
  const media = buildMediaMap(manifest, values)
  if (media.length) {
    await mkdir(join(workRoot, 'media'), { recursive: true })
    for (const m of media) {
      await copyFile(m.absolute, join(workRoot, m.relative))
    }
  }
  return { workRoot, media: media.map(({ relative, absolute }) => ({ relative, absolute })) }
}

/* ------------------------------------------------------------------ */
/* Progreso                                                            */
/* ------------------------------------------------------------------ */

interface HfProgress {
  code: string
  pct?: number
  done?: number
  total?: number
}

/** Traduce el código de fase de hyperframes a texto humano en español. */
export function describePhase(p: HfProgress): string {
  const n = (a?: number, b?: number) => (a !== undefined && b !== undefined ? ` (${a}/${b})` : '')
  switch (p.code) {
    case 'compile':
      return 'Preparando la composición…'
    case 'extract_video':
      return 'Preparando los vídeos…'
    case 'process_audio':
      return 'Procesando el audio…'
    case 'start_browsers':
      return 'Arrancando el motor de vídeo…'
    case 'capture':
      return `Generando fotogramas${n(p.done, p.total)}…`
    case 'encode':
      return `Codificando vídeo${n(p.done, p.total)}…`
    case 'assemble':
      return 'Montando el archivo final…'
    default:
      return 'Exportando…'
  }
}

/* ------------------------------------------------------------------ */
/* Gestor de exportaciones                                             */
/* ------------------------------------------------------------------ */

interface InternalJob extends RenderJob {
  child?: ChildProcess
  cancelRequested?: boolean
  manifest: TemplateManifest
  templateDir: string
  values: FieldValues
  requestId: string
}

export interface RenderEvents {
  update: (job: RenderJob) => void
  finished: (job: RenderJob) => void
}

const CODES_ES: Record<string, string> = {
  ENOENT: 'No se encontró un componente necesario de la exportación.',
  EACCES: 'Permiso denegado al escribir la salida.',
  ENOSPC: 'No queda espacio en disco.'
}

/**
 * Cola secuencial: una exportación a la vez, el resto esperan. Nunca bloquea la
 * UI porque todo ocurre en un proceso hijo y el progreso se emite por eventos.
 */
export class RenderManager extends EventEmitter {
  private jobs = new Map<string, InternalJob>()
  private order: string[] = []
  private running: string | null = null

  enqueue(params: {
    manifest: TemplateManifest
    templateDir: string
    values: FieldValues
    format: ExportFormat
    quality: 'draft' | 'looks' | 'delivery'
    outputPath: string
  }): RenderJob {
    const id = randomUUID()
    const job: InternalJob = {
      id,
      templateId: params.manifest.id,
      templateName: params.manifest.name,
      format: params.format,
      quality: params.quality,
      outputPath: params.outputPath,
      status: 'queued',
      progress: 0,
      detail: 'En cola…',
      queuedAt: Date.now(),
      isDirectory: params.format === 'png-sequence',
      manifest: params.manifest,
      templateDir: params.templateDir,
      values: params.values,
      requestId: randomUUID()
    }
    this.jobs.set(id, job)
    this.order.push(id)
    log.info('Exportación en cola', { id, template: job.templateId, format: params.format })
    this.publish(job)
    queueMicrotask(() => this.pump())
    return strip(job)
  }

  list(): RenderJob[] {
    return this.order.map((id) => strip(this.jobs.get(id)!)).filter(Boolean)
  }

  get(id: string): RenderJob | undefined {
    const j = this.jobs.get(id)
    return j ? strip(j) : undefined
  }

  cancel(id: string): void {
    const job = this.jobs.get(id)
    if (!job) return
    if (job.status === 'queued') {
      job.status = 'cancelled'
      job.detail = 'Cancelada'
      job.endedAt = Date.now()
      this.finish(job)
      return
    }
    if (job.status === 'running' && job.child) {
      job.cancelRequested = true
      job.detail = 'Cancelando…'
      this.publish(job)
      killTree(job.child)
    }
  }

  private pump(): void {
    if (this.running) return
    const next = this.order.find((id) => this.jobs.get(id)?.status === 'queued')
    if (!next) return
    this.running = next
    void this.run(this.jobs.get(next)!)
  }

  private publish(job: InternalJob): void {
    this.emit('update', strip(job))
  }

  private finish(job: InternalJob): void {
    if (this.running === job.id) this.running = null
    job.endedAt = job.endedAt ?? Date.now()
    if (job.startedAt) job.elapsedMs = job.endedAt - job.startedAt
    this.emit('finished', strip(job))
    this.pump()
  }

  private async run(job: InternalJob): Promise<void> {
    job.status = 'running'
    job.startedAt = Date.now()
    job.progress = Math.max(job.progress, 1)
    job.detail = 'Preparando…'
    this.publish(job)

    let workRoot: string | null = null
    try {
      const staged = await stageTemplate(job.templateDir, job.manifest, job.values)
      workRoot = staged.workRoot

      const varsPath = join(workRoot, 'studio-variables.json')
      await writeFile(varsPath, JSON.stringify(buildVariablesPayload(job.manifest, job.values)), 'utf8')

      await mkdir(framesCacheDir(), { recursive: true })
      const outDir = job.isDirectory ? job.outputPath : dirnameOf(job.outputPath)
      if (outDir) await mkdir(outDir, { recursive: true })

      const args = [
        hyperframesCliPath(),
        'render',
        workRoot,
        '--format',
        job.format,
        '--quality',
        job.quality,
        '--workers',
        'auto',
        '--frames-cache-dir',
        framesCacheDir(),
        '--variables-file',
        varsPath,
        '--strict-variables',
        '-o',
        job.outputPath
      ]
      if (isLowMemory()) args.push('--low-memory-mode')
      if (job.manifest.fps) args.push('--fps', String(job.manifest.fps))

      log.info('spawn render', { args: args.slice(1) })
      const child = spawn(process.execPath, args, {
        env: sidecarEnv({ ELECTRON_RUN_AS_NODE: '1' }),
        cwd: workRoot,
        windowsHide: true
      })
      job.child = child

      let stderr = ''
      const onLine = (line: string) => {
        const m = /@hf-progress\s+(\{.*\})/.exec(line)
        if (m) {
          try {
            const p = JSON.parse(m[1]) as HfProgress
            if (typeof p.pct === 'number') job.progress = Math.min(99, Math.round(p.pct))
            job.detail = describePhase(p)
            this.publish(job)
          } catch {
            /* línea de progreso ilegible: se ignora */
          }
        }
      }
      child.stdout?.setEncoding('utf8')
      child.stdout?.on('data', (chunk: string) => {
        for (const line of chunk.split('\n')) onLine(line)
      })
      child.stderr?.setEncoding('utf8')
      child.stderr?.on('data', (chunk: string) => {
        stderr += chunk
        for (const line of chunk.split('\n')) onLine(line)
      })

      const code: number | null = await new Promise((resolve) => {
        child.on('error', (err) => {
          stderr += `\n${err.message}`
          resolve(-1)
        })
        child.on('close', (c) => resolve(c))
      })

      if (job.cancelRequested) {
        job.status = 'cancelled'
        job.detail = 'Cancelada'
        job.progress = 0
      } else if (code === 0) {
        job.status = 'done'
        job.progress = 100
        job.detail = 'Listo'
      } else {
        job.status = 'error'
        job.error = humanizeFailure(stderr, code)
        job.detail = 'Error'
        log.error('render falló', { code, stderr: stderr.slice(-2000) })
      }
    } catch (err) {
      job.status = 'error'
      job.error = humanizeFailure(String(err instanceof Error ? err.message : err), null)
      job.detail = 'Error'
      log.error('render excepción', { err: String(err) })
    } finally {
      job.child = undefined
      if (workRoot) {
        // Limpieza de temporales, también tras cancelación o error.
        await rm(workRoot, { recursive: true, force: true }).catch(() => {})
      }
      this.finish(job)
    }
  }
}

function strip(job: InternalJob): RenderJob {
  const {
    child: _child,
    cancelRequested: _cancel,
    manifest: _m,
    templateDir: _t,
    values: _v,
    requestId: _r,
    ...rest
  } = job
  return { ...rest }
}

function dirnameOf(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))
  return i > 0 ? p.slice(0, i) : ''
}

/** Traduce el volcado de error del CLI a un mensaje humano. */
export function humanizeFailure(stderr: string, code: number | null): string {
  const s = stderr || ''
  if (/strict-variables|undeclared|unknown variable|type mismatch/i.test(s)) {
    const line = s.split('\n').find((l) => /strict-variables|undeclared|type mismatch/i.test(l))
    return `Revisa los campos de la plantilla: ${(line ?? '').trim()}`
  }
  if (/ENOSPC|no space left/i.test(s)) return 'No queda espacio en disco.'
  if (/ENOENT|not found/i.test(s)) return 'Falta un componente de la exportación.'
  if (/EACCES|permission denied/i.test(s)) return 'Sin permiso para escribir en esa carpeta.'
  if (/timeout/i.test(s)) return 'La exportación tardó demasiado y se detuvo.'
  for (const [k, v] of Object.entries(CODES_ES)) if (s.includes(k)) return v
  const first = s.split('\n').find((l) => l.trim() && !l.startsWith('    at '))
  return first?.trim() || `La exportación falló (código ${code ?? '?'}).`
}

/** Mata el árbol de procesos del render (hijos incluidos) en ambas plataformas. */
export function killTree(child: ChildProcess): void {
  if (!child.pid) return
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true })
  } else {
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch {
      try {
        child.kill('SIGTERM')
      } catch {
        /* ya terminó */
      }
    }
    // Red de seguridad: si no muere en 3 s, SIGKILL al grupo.
    setTimeout(() => {
      try {
        process.kill(-(child.pid as number), 'SIGKILL')
      } catch {
        /* ya terminó */
      }
    }, 3000).unref?.()
  }
}

/* ------------------------------------------------------------------ */
/* Miniatura                                                           */
/* ------------------------------------------------------------------ */

/**
 * Genera una miniatura con `hyperframes snapshot` (un solo fotograma). Devuelve
 * la ruta del PNG o null si no se pudo. No bloquea: se llama en segundo plano.
 */
export async function generateThumbnail(templateDir: string, at = 0.5): Promise<string | null> {
  const outDir = join(templateDir, '.studio-thumb')
  await rm(outDir, { recursive: true, force: true }).catch(() => {})
  await mkdir(outDir, { recursive: true }).catch(() => {})
  const args = [hyperframesCliPath(), 'snapshot', templateDir, '-o', outDir, '--at', String(at), '--no-end']
  const ok = await new Promise<boolean>((resolve) => {
    const child = spawn(process.execPath, args, {
      env: sidecarEnv({ ELECTRON_RUN_AS_NODE: '1' }),
      windowsHide: true
    })
    const timer = setTimeout(() => {
      killTree(child)
      resolve(false)
    }, 90_000)
    child.on('error', () => {
      clearTimeout(timer)
      resolve(false)
    })
    child.on('close', (c) => {
      clearTimeout(timer)
      resolve(c === 0)
    })
  })
  if (!ok) return null
  try {
    const files = (await readdir(outDir)).filter((f) => f.toLowerCase().endsWith('.png'))
    if (!files.length) return null
    const target = join(templateDir, 'thumb.png')
    await copyFile(join(outDir, files[0]), target)
    await rm(outDir, { recursive: true, force: true }).catch(() => {})
    return target
  } catch {
    return null
  }
}
