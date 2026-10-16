import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { logsDir } from './paths'
import { describeSidecars, totalRamGB, cores } from './sidecars'

const MAX_BYTES = 1_000_000 // 1 MB por archivo
const KEEP = 3

let currentLog: string | null = null

function ensureLogFile(): string {
  if (currentLog) return currentLog
  const dir = logsDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  currentLog = join(dir, 'main.log')
  // Rotación simple al arrancar: main.log → main.1.log → main.2.log …
  if (existsSync(currentLog) && statSync(currentLog).size > MAX_BYTES) {
    for (let i = KEEP - 1; i >= 1; i--) {
      const from = join(dir, i === 1 ? 'main.log' : `main.${i - 1}.log`)
      const to = join(dir, `main.${i}.log`)
      if (existsSync(from)) {
        try {
          renameSync(from, to)
        } catch {
          /* ignore */
        }
      }
    }
  }
  return currentLog
}

function write(level: 'INFO' | 'WARN' | 'ERROR', message: string, meta?: unknown): void {
  const line =
    `${new Date().toISOString()} [${level}] ${message}` +
    (meta !== undefined ? ` ${safeJson(meta)}` : '') +
    '\n'
  try {
    appendFileSync(ensureLogFile(), line)
  } catch {
    /* el log nunca debe tumbar la app */
  }
  if (level !== 'INFO' || process.env.STUDIO_DEBUG) {
    // eslint-disable-next-line no-console
    console[level === 'ERROR' ? 'error' : 'log'](line.trimEnd())
  }
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

export const log = {
  info: (m: string, meta?: unknown) => write('INFO', m, meta),
  warn: (m: string, meta?: unknown) => write('WARN', m, meta),
  error: (m: string, meta?: unknown) => write('ERROR', m, meta)
}

function tail(file: string, lines: number): string {
  if (!existsSync(file)) return '(sin log)'
  try {
    const content = readFileSync(file, 'utf8').split('\n')
    return content.slice(Math.max(0, content.length - lines - 1)).join('\n')
  } catch {
    return '(no se pudo leer el log)'
  }
}

/**
 * Informe de error listo para copiar y enviar. Incluye versiones, estado de los
 * sidecars y las últimas líneas del log. Sin datos personales más allá de rutas.
 */
export function buildErrorReport(reason?: string): string {
  const s = describeSidecars()
  const lines = [
    `${app.getName()} ${app.getVersion()}`,
    `Electron ${process.versions.electron} · Node ${process.versions.node} · Chromium ${process.versions.chrome}`,
    `Plataforma: ${process.platform} ${process.arch}`,
    `RAM: ${totalRamGB()} GB · CPU: ${cores()} núcleos`,
    '',
    'Componentes:',
    `  hyperframes: ${s.hyperframes.ok ? 'ok' : 'FALTA'} — ${s.hyperframes.path}`,
    `  navegador:   ${s.browser.ok ? 'ok (' + s.browser.source + ')' : 'FALTA'} — ${s.browser.path}`,
    `  ffmpeg:      ${s.ffmpeg.ok ? 'ok' : 'FALTA'} — ${s.ffmpeg.path}`,
    `  ffprobe:     ${s.ffprobe.ok ? 'ok' : 'FALTA'} — ${s.ffprobe.path}`,
    '',
    reason ? `Motivo: ${reason}` : '',
    '',
    'Últimas líneas del registro:',
    tail(ensureLogFile(), 200)
  ]
  return lines.filter(Boolean).join('\n')
}
