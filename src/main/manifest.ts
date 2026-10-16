import { strings as S } from '../shared/strings'
import type { FieldSpec, ImportIssue, TemplateManifest } from '../shared/types'

/** Una variable declarada por la composición en data-composition-variables. */
export interface DeclaredVariable {
  id: string
  type: string
  label?: string
  default?: unknown
}

export const RESOLUTION_DIMS: Record<TemplateManifest['resolution'], { width: number; height: number }> = {
  landscape: { width: 1920, height: 1080 },
  portrait: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 }
}

/** Tipos de variable que entiende hyperframes → tipo de campo de la app. */
const HF_TO_FIELD: Record<string, FieldSpec['type']> = {
  string: 'text',
  color: 'color',
  number: 'number',
  boolean: 'toggle',
  enum: 'select'
}

const V1_FIELD_TYPES: FieldSpec['type'][] = ['text', 'image', 'video', 'color']
const RESERVED_FIELD_TYPES: FieldSpec['type'][] = ['number', 'select', 'toggle']

const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function defaultAcceptFor(type: FieldSpec['type']): string[] {
  if (type === 'image') return ['png', 'jpg', 'jpeg', 'webp']
  if (type === 'video') return ['mp4', 'mov', 'webm', 'm4v']
  return []
}

/** Tipo de variable hyperframes que corresponde a un campo del manifiesto. */
export function hyperframesTypeFor(field: FieldSpec): string {
  switch (field.type) {
    case 'color':
      return 'color'
    case 'number':
      return 'number'
    case 'toggle':
      return 'boolean'
    case 'select':
      return 'enum'
    default:
      // text, image y video se pasan como string (las media, como ruta)
      return 'string'
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

/**
 * Extrae el valor de un atributo HTML de forma tolerante (el JSON embebido
 * suele ir entre comillas simples y contener comillas dobles).
 */
function extractAttr(html: string, attr: string): string | null {
  const re = new RegExp(`${attr}\\s*=\\s*(["'])`, 'i')
  const m = re.exec(html)
  if (!m) return null
  const quote = m[1]
  const start = m.index + m[0].length
  const tagEnd = html.indexOf('>', start)
  const searchEnd = tagEnd === -1 ? html.length : tagEnd
  const end = html.lastIndexOf(quote, searchEnd)
  if (end <= start) return null
  return decodeEntities(html.slice(start, end))
}

/** Lee las variables declaradas en el index.html. */
export function extractDeclaredVariables(html: string): { vars: DeclaredVariable[]; issues: ImportIssue[] } {
  const raw = extractAttr(html, 'data-composition-variables')
  if (raw === null) {
    return { vars: [], issues: [{ level: 'warning', code: 'noVariables', message: S.errors.noVariables }] }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {
      vars: [],
      issues: [
        {
          level: 'error',
          code: 'varsInvalidJson',
          message: 'data-composition-variables no contiene un JSON válido.',
          where: 'index.html'
        }
      ]
    }
  }
  if (!Array.isArray(parsed)) {
    return {
      vars: [],
      issues: [
        {
          level: 'error',
          code: 'varsNotArray',
          message: 'data-composition-variables debe ser un array de declaraciones.',
          where: 'index.html'
        }
      ]
    }
  }
  const vars: DeclaredVariable[] = []
  const issues: ImportIssue[] = []
  const seen = new Set<string>()
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue
    const obj = item as Record<string, unknown>
    const id = typeof obj.id === 'string' ? obj.id : ''
    if (!id) continue
    if (seen.has(id)) {
      issues.push({ level: 'warning', code: 'dupVar', message: S.errors.duplicateVariable(id), where: 'index.html' })
      continue
    }
    seen.add(id)
    vars.push({
      id,
      type: typeof obj.type === 'string' ? obj.type : 'string',
      label: typeof obj.label === 'string' ? obj.label : undefined,
      default: obj.default
    })
  }
  return { vars, issues }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Valida y normaliza un template.json. Devuelve el manifiesto o una lista de errores. */
export function parseManifest(raw: unknown): { manifest?: TemplateManifest; issues: ImportIssue[] } {
  const issues: ImportIssue[] = []
  const fail = (code: string, message: string, where = 'template.json') => {
    issues.push({ level: 'error', code, message, where })
    return { issues }
  }

  if (!isPlainObject(raw)) return fail('manifestInvalid', S.errors.manifestInvalid)

  const schemaVersion = raw.schemaVersion
  if (schemaVersion !== 1) {
    return fail('schemaVersion', S.errors.unsupportedSchema(schemaVersion))
  }

  const id = typeof raw.id === 'string' ? raw.id.trim() : ''
  if (!id) return fail('id', S.errors.missingField('id'))
  if (!ID_RE.test(id)) {
    issues.push({
      level: 'warning',
      code: 'idFormat',
      message: `Se recomienda que el id «${id}» sea minúsculas y guiones (kebab-case).`,
      where: 'template.json'
    })
  }

  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  if (!name) return fail('name', S.errors.missingField('name'))

  const duration = typeof raw.duration === 'number' ? raw.duration : Number(raw.duration)
  if (!Number.isFinite(duration) || duration <= 0) return fail('duration', S.errors.missingField('duration'))

  const resolution = raw.resolution
  if (resolution !== 'landscape' && resolution !== 'portrait' && resolution !== 'square') {
    return fail('resolution', `«resolution» debe ser landscape, portrait o square.`)
  }

  if (!Array.isArray(raw.fields)) return fail('fields', S.errors.missingField('fields'))

  const fields: FieldSpec[] = []
  const seenIds = new Set<string>()
  for (const f of raw.fields as unknown[]) {
    if (!isPlainObject(f)) continue
    const fid = typeof f.id === 'string' ? f.id.trim() : ''
    if (!fid) {
      issues.push({ level: 'error', code: 'fieldId', message: S.errors.missingField('fields[].id'), where: 'template.json' })
      continue
    }
    if (seenIds.has(fid)) {
      issues.push({ level: 'error', code: 'dupField', message: S.errors.duplicateFieldId(fid), where: 'template.json' })
      continue
    }
    seenIds.add(fid)
    const type = f.type
    const validTypes = [...V1_FIELD_TYPES, ...RESERVED_FIELD_TYPES]
    if (typeof type !== 'string' || !validTypes.includes(type as FieldSpec['type'])) {
      issues.push({
        level: 'error',
        code: 'fieldType',
        message: S.errors.badFieldType(fid, String(type)),
        where: 'template.json'
      })
      continue
    }
    const label = typeof f.label === 'string' && f.label.trim() ? f.label.trim() : fid
    if (!V1_FIELD_TYPES.includes(type as FieldSpec['type'])) {
      issues.push({
        level: 'warning',
        code: 'reservedType',
        message: `El campo «${fid}» usa el tipo «${type}», reservado: se mostrará como texto en esta versión.`,
        where: 'template.json'
      })
    }
    fields.push({
      id: fid,
      type: type as FieldSpec['type'],
      label,
      help: typeof f.help === 'string' ? f.help : undefined,
      default: (f.default as string | number | boolean | undefined) ?? undefined,
      required: f.required === true,
      ...(type === 'text'
        ? { maxLength: typeof f.maxLength === 'number' ? f.maxLength : undefined, placeholder: typeof f.placeholder === 'string' ? f.placeholder : undefined }
        : {}),
      ...(type === 'image' || type === 'video'
        ? {
            accept: Array.isArray(f.accept) ? (f.accept as string[]).map((a) => String(a).toLowerCase().replace(/^\./, '')) : undefined,
            maxSizeMB: typeof f.maxSizeMB === 'number' ? f.maxSizeMB : undefined
          }
        : {})
    } as FieldSpec)
  }

  const manifest: TemplateManifest = {
    schemaVersion: 1,
    id,
    name,
    description: typeof raw.description === 'string' ? raw.description : undefined,
    version: typeof raw.version === 'string' ? raw.version : undefined,
    author: typeof raw.author === 'string' ? raw.author : undefined,
    duration,
    resolution,
    width: typeof raw.width === 'number' ? raw.width : RESOLUTION_DIMS[resolution].width,
    height: typeof raw.height === 'number' ? raw.height : RESOLUTION_DIMS[resolution].height,
    fps: typeof raw.fps === 'number' ? raw.fps : 30,
    fields
  }

  return { manifest, issues }
}

/**
 * Comprueba la correspondencia 1:1 entre los campos del manifiesto y las
 * variables declaradas en el index.html. Avisa de discrepancias (no bloquea).
 */
export function crossCheck(manifest: TemplateManifest, vars: DeclaredVariable[]): ImportIssue[] {
  const issues: ImportIssue[] = []
  const varById = new Map(vars.map((v) => [v.id, v]))
  for (const field of manifest.fields) {
    const v = varById.get(field.id)
    if (!v) {
      issues.push({
        level: 'warning',
        code: 'fieldNotDeclared',
        message: S.errors.fieldNotDeclared(field.id),
        where: 'template.json ↔ index.html'
      })
      continue
    }
    const expected = hyperframesTypeFor(field)
    if (v.type && v.type !== expected) {
      issues.push({
        level: 'warning',
        code: 'typeMismatch',
        message: `«${field.id}»: el campo es ${field.type} (variable ${expected}) pero el index.html declara «${v.type}».`,
        where: 'template.json ↔ index.html'
      })
    }
  }
  const fieldIds = new Set(manifest.fields.map((f) => f.id))
  for (const v of vars) {
    if (!fieldIds.has(v.id)) {
      issues.push({
        level: 'warning',
        code: 'declaredNotFound',
        message: S.errors.declaredNotFound(v.id),
        where: 'index.html'
      })
    }
  }
  return issues
}

export { HF_TO_FIELD }
