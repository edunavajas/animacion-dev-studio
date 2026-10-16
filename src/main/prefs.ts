import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname } from 'node:path'
import { prefsFile } from './paths'
import type { FieldValues, PreviewBackground } from '../shared/types'

export interface Prefs {
  /** Última carpeta de salida elegida (se recuerda). */
  outputDir?: string
  /** Última plantilla abierta. */
  lastTemplateId?: string
  /** Valores por plantilla, para reabrirla igual. */
  values: Record<string, FieldValues>
  /** Preferencia de fondo de la preview. */
  background?: PreviewBackground
  /** Volumen maestro de la vista previa (0..1). */
  volume?: number
  /** Vista previa silenciada. */
  muted?: boolean
  /** Tema elegido a mano. Si falta, se usa el del sistema la primera vez. */
  theme?: 'light' | 'dark'
}

const EMPTY: Prefs = { values: {} }

let cache: Prefs | null = null

export async function readPrefs(): Promise<Prefs> {
  if (cache) return cache
  const file = prefsFile()
  if (!existsSync(file)) {
    cache = { ...EMPTY }
    return cache
  }
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8')) as Partial<Prefs>
    cache = { ...EMPTY, ...parsed, values: parsed.values ?? {} }
  } catch {
    cache = { ...EMPTY }
  }
  return cache
}

export async function writePrefs(patch: Partial<Prefs>): Promise<Prefs> {
  const current = await readPrefs()
  cache = { ...current, ...patch, values: { ...current.values, ...(patch.values ?? {}) } }
  const file = prefsFile()
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify(cache, null, 2), 'utf8')
  return cache
}

export async function setTemplateValues(templateId: string, values: FieldValues): Promise<void> {
  const current = await readPrefs()
  await writePrefs({ values: { ...current.values, [templateId]: values } })
}
