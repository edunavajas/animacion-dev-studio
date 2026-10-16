/**
 * Tipos compartidos entre el proceso principal (Node) y el renderer (Chromium).
 * Este archivo es la única fuente de verdad del contrato de datos.
 */

/** Tipos de campo soportados por la UI en v1. */
export type FieldTypeV1 = 'text' | 'image' | 'video' | 'color'

/**
 * Tipos reservados: el esquema los acepta y valida, pero la UI v1 aún no los
 * dibuja como editor dedicado. Documentados aquí para no romper el esquema.
 */
export type FieldTypeReserved = 'number' | 'select' | 'toggle'

export type FieldType = FieldTypeV1 | FieldTypeReserved

export interface FieldBase {
  /** Debe coincidir 1:1 con un id declarado en data-composition-variables. */
  id: string
  type: FieldType
  label: string
  /** Texto de ayuda opcional bajo el campo. */
  help?: string
  /** Valor por defecto. Para media debe quedar vacío. */
  default?: string | number | boolean
  /** Si es true no se puede exportar con el campo vacío. */
  required?: boolean
}

export interface TextFieldSpec extends FieldBase {
  type: 'text'
  maxLength?: number
  placeholder?: string
}

export interface ImageFieldSpec extends FieldBase {
  type: 'image'
  /** Extensiones aceptadas, minúsculas, sin punto. Por defecto png/jpg/jpeg/webp. */
  accept?: string[]
  maxSizeMB?: number
}

export interface VideoFieldSpec extends FieldBase {
  type: 'video'
  accept?: string[]
  maxSizeMB?: number
}

export interface ColorFieldSpec extends FieldBase {
  type: 'color'
}

export type FieldSpec =
  | TextFieldSpec
  | ImageFieldSpec
  | VideoFieldSpec
  | ColorFieldSpec
  | FieldBase

export type Resolution = 'landscape' | 'portrait' | 'square'

export interface TemplateManifest {
  schemaVersion: 1
  /** Identificador estable, kebab-case, único en la biblioteca. */
  id: string
  name: string
  description?: string
  /** Versión de la plantilla (para el diálogo de reemplazo). */
  version?: string
  author?: string
  /** Duración en segundos. Debe coincidir con data-duration del root. */
  duration: number
  resolution: Resolution
  width?: number
  height?: number
  fps?: number
  fields: FieldSpec[]
}

/** Valores que el usuario introduce. Las claves son field.id. */
export type FieldValues = Record<string, string | number | boolean>

export interface LibraryEntry {
  id: string
  name: string
  manifest: TemplateManifest
  /** Ruta absoluta a la carpeta de la plantilla en la biblioteca. */
  dir: string
  /** Ruta a la miniatura (o null si no hay). */
  thumbPath: string | null
  /** Ruta al index.html. */
  indexPath: string
  importedAt: string
  /** Etiqueta de origen legible (carpeta de la que se importó). */
  origin: string
  sizeBytes: number
}

export interface ImportIssue {
  level: 'error' | 'warning'
  /** Clave i18n o texto ya resuelto. */
  code: string
  message: string
  where?: string
}

export interface ImportResult {
  ok: boolean
  entry?: LibraryEntry
  issues: ImportIssue[]
  /** Si ya existe una plantilla con el mismo id, se pide decisión. */
  conflict?: {
    existing: LibraryEntry
    incoming: { id: string; name: string; version?: string }
  }
}

export type ExportFormat = 'mov' | 'webm' | 'png-sequence' | 'mp4'

export interface ExportPreset {
  id: string
  label: string
  format: ExportFormat
  quality: 'draft' | 'looks' | 'delivery'
  /** Descripción corta para la UI. */
  hint: string
}

export type RenderStatus = 'queued' | 'running' | 'done' | 'error' | 'cancelled'

export interface RenderJob {
  id: string
  templateId: string
  templateName: string
  format: ExportFormat
  quality: string
  outputPath: string
  status: RenderStatus
  /** 0..100 */
  progress: number
  /** Texto de fase legible ("Capturando fotogramas…"). */
  detail: string
  queuedAt: number
  startedAt?: number
  endedAt?: number
  elapsedMs?: number
  error?: string
  /** Estructura de la salida (fichero o carpeta). */
  isDirectory?: boolean
  /** Si la salida tiene pista de audio (comprobado con ffprobe). */
  hasAudio?: boolean
}

export interface AppInfo {
  version: string
  platform: NodeJS.Platform
  /** Tema del sistema, para la primera vez (después manda la preferencia). */
  systemTheme: 'light' | 'dark'
  /** Estado de los sidecars, para diagnóstico. */
  sidecars: {
    hyperframes: { path: string; ok: boolean }
    browser: { path: string; ok: boolean; source: string }
    ffmpeg: { path: string; ok: boolean }
    ffprobe: { path: string; ok: boolean }
  }
  lowMemory: boolean
  totalRamGB: number
  cores: number
}

export interface SaveValuesPayload {
  templateId: string
  values: FieldValues
}

/** Payload del diálogo de exportación. */
export interface ExportRequest {
  templateId: string
  values: FieldValues
  format: ExportFormat
  quality: 'draft' | 'looks' | 'delivery'
  outputDir: string
  fileName: string
}

export interface PreviewBackground {
  kind: 'checker' | 'light' | 'dark'
}

/* ------------------------------------------------------------------ */
/* Actualizaciones                                                     */
/* ------------------------------------------------------------------ */

export type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'installing'
  | 'error'

export interface UpdateAsset {
  name: string
  url: string
  size: number
  /** sha256 que publica GitHub, para comprobar la descarga antes de ejecutarla. */
  digest?: string
}

export interface UpdateInfo {
  /** Si hay una versión más nueva que la instalada. */
  available: boolean
  currentVersion: string
  /** Versión publicada, sin la «v» del tag. */
  version?: string
  notes?: string
  publishedAt?: string
  htmlUrl?: string
  /** Instalador de esta plataforma. */
  asset?: UpdateAsset
  /** Motivo si la comprobación no se pudo completar. */
  error?: string
}

export interface UpdateState {
  phase: UpdatePhase
  info?: UpdateInfo
  /** 0..100 */
  progress: number
  downloadedPath?: string
  error?: string
  /** En macOS no se puede instalar solo: hay que abrir el .dmg y arrastrar. */
  manualInstall?: boolean
}
