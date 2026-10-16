import type {
  AppInfo,
  ExportFormat,
  FieldValues,
  ImportResult,
  LibraryEntry,
  PreviewBackground,
  RenderJob
} from '../../../shared/types'

export interface Toast {
  id: number
  text: string
  kind: 'ok' | 'error' | 'info'
  action?: { label: string; run: () => void }
}

export interface Conflict {
  existing: LibraryEntry
  incoming: { id: string; name: string; version?: string }
  sourcePath: string
  issues: ImportResult['issues']
}

/** Ajustes de exportación recordados entre sesiones. */
export interface ExportSettings {
  format: ExportFormat
  quality: 'draft' | 'looks' | 'delivery'
  presetId: string
}

const PRESET_TO_VALUE: Record<string, { format: ExportFormat; quality: ExportSettings['quality'] }> = {
  premiere: { format: 'mov', quality: 'looks' },
  light: { format: 'webm', quality: 'looks' },
  ae: { format: 'png-sequence', quality: 'looks' }
}

let toastSeq = 0

class UiState {
  ready = $state(false)
  info = $state<AppInfo | null>(null)
  library = $state<LibraryEntry[]>([])
  query = $state('')
  selectedId = $state<string | null>(null)
  values = $state<FieldValues>({})
  background = $state<PreviewBackground>({ kind: 'checker' })
  jobs = $state<RenderJob[]>([])
  toasts = $state<Toast[]>([])
  conflict = $state<Conflict | null>(null)
  importing = $state(false)
  dragActive = $state(false)
  exportSheetOpen = $state(false)
  outputDir = $state<string | null>(null)
  exportSettings = $state<ExportSettings>({ format: 'mov', quality: 'looks', presetId: 'premiere' })

  get selected(): LibraryEntry | null {
    return this.library.find((e) => e.id === this.selectedId) ?? null
  }

  get filtered(): LibraryEntry[] {
    const q = this.query.trim().toLowerCase()
    if (!q) return this.library
    return this.library.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.id.toLowerCase().includes(q) ||
        (e.manifest.description ?? '').toLowerCase().includes(q)
    )
  }

  get activeJob(): RenderJob | undefined {
    return this.jobs.find((j) => j.status === 'running')
  }

  notify(text: string, kind: Toast['kind'] = 'info', action?: Toast['action']): void {
    const id = ++toastSeq
    this.toasts = [...this.toasts, { id, text, kind, action }]
    setTimeout(() => this.dismiss(id), kind === 'error' ? 9000 : 4500)
  }

  dismiss(id: number): void {
    this.toasts = this.toasts.filter((t) => t.id !== id)
  }

  setPreset(presetId: string): void {
    const v = PRESET_TO_VALUE[presetId]
    if (!v) return
    this.exportSettings = { presetId, format: v.format, quality: v.quality }
  }

  /* ------------------------------------------------------------ acciones */

  async init(): Promise<void> {
    this.info = await window.api.appInfo()
    await this.reloadLibrary()
    const prefs = await window.api.prefs.get()
    this.outputDir = prefs.outputDir ?? null
    if (prefs.background) this.background = prefs.background
    if (prefs.lastTemplateId && this.library.some((e) => e.id === prefs.lastTemplateId)) {
      // Se reabre con openTemplate para que también siembre los valores por defecto.
      const entry = this.library.find((e) => e.id === prefs.lastTemplateId)!
      await this.openTemplate(entry)
    }
    window.api.library.onThumbReady(({ id, thumbPath }) => {
      this.library = this.library.map((e) => (e.id === id ? { ...e, thumbPath } : e))
    })
    window.api.exporter.onUpdate((job) => this.upsertJob(job))
    window.api.exporter.onFinished((job) => {
      this.upsertJob(job)
      if (job.status === 'done') {
        this.notify(`«${job.templateName}» exportado.`, 'ok', {
          label: 'Mostrar en carpeta',
          run: () => void window.api.exporter.openFolder(job.outputPath)
        })
      } else if (job.status === 'error') {
        const message = job.error || 'La exportación falló.'
        this.notify(message, 'error', {
          label: 'Copiar informe',
          run: () => void this.copyErrorReport(`${job.templateName}: ${message}`)
        })
      } else if (job.status === 'cancelled') {
        this.notify('Exportación cancelada.', 'info')
      }
    })
    this.jobs = await window.api.exporter.list()
    this.ready = true
    // Miniaturas que falten (p. ej. plantillas ya instaladas sin thumb.png).
    void this.ensureThumbnails()
  }

  /** Genera en segundo plano las miniaturas que falten (2 a la vez, una por sesión). */
  async ensureThumbnails(): Promise<void> {
    const pending = this.library.filter((e) => !e.thumbPath).map((e) => e.id)
    const workers = 2
    const run = async (): Promise<void> => {
      for (;;) {
        const id = pending.shift()
        if (!id) return
        await window.api.library.thumbnail(id)
      }
    }
    await Promise.all(Array.from({ length: Math.min(workers, pending.length) }, run))
  }

  /** Copia un informe de error para que el usuario lo pueda enviar. */
  async copyErrorReport(reason?: string): Promise<void> {
    const report = await window.api.diagnosticsReport(reason)
    await window.api.copyText(report)
    this.notify('Informe copiado. Pégalo en un mensaje y mándalo.', 'ok')
  }

  upsertJob(job: RenderJob): void {
    const idx = this.jobs.findIndex((j) => j.id === job.id)
    if (idx === -1) this.jobs = [...this.jobs, job]
    else this.jobs = this.jobs.map((j) => (j.id === job.id ? job : j))
  }

  async reloadLibrary(): Promise<void> {
    this.library = await window.api.library.list()
  }

  async importPath(path: string, replace = false): Promise<void> {
    this.importing = true
    this.dragActive = false
    try {
      const result = await window.api.library.import(path, replace)
      if (result.conflict && !replace) {
        this.conflict = { ...result.conflict, sourcePath: path, issues: result.issues }
        return
      }
      if (!result.ok) {
        const first = result.issues.find((i) => i.level === 'error')
        const message = first?.message ?? 'No se pudo añadir la plantilla.'
        this.notify(message, 'error', {
          label: 'Copiar informe',
          run: () => void this.copyErrorReport(`Importar: ${message}`)
        })
        return
      }
      await this.reloadLibrary()
      const warnings = result.issues.filter((i) => i.level === 'warning')
      this.notify(`«${result.entry!.name}» se añadió a la biblioteca.`, 'ok')
      if (warnings.length) {
        this.notify(`${warnings.length} aviso(s) en la plantilla: ${warnings[0].message}`, 'info')
      }
      void window.api.library.thumbnail(result.entry!.id)
    } finally {
      this.importing = false
    }
  }

  async resolveConflict(replace: boolean): Promise<void> {
    const c = this.conflict
    this.conflict = null
    if (!c) return
    if (replace) await this.importPath(c.sourcePath, true)
  }

  async addViaDialog(): Promise<void> {
    const paths = await window.api.library.importDialog()
    for (const p of paths) await this.importPath(p)
  }

  async openTemplate(entry: LibraryEntry): Promise<void> {
    this.selectedId = entry.id
    const saved = await window.api.values.get(entry.id)
    const defaults: FieldValues = {}
    for (const f of entry.manifest.fields) {
      // La media no tiene valor por defecto: se elige a mano.
      if (f.type === 'image' || f.type === 'video') continue
      defaults[f.id] = (f.default as string | number | boolean | undefined) ?? ''
    }
    // Se parte de los valores guardados, y lo que falte cae al defecto del manifiesto.
    this.values = { ...defaults, ...saved }
    await window.api.prefs.set({ lastTemplateId: entry.id })
  }

  async closeTemplate(): Promise<void> {
    await window.api.preview.stop()
    this.selectedId = null
  }

  async persistValues(): Promise<void> {
    if (!this.selectedId) return
    await window.api.values.set(this.selectedId, $state.snapshot(this.values))
  }

  async resetValues(): Promise<void> {
    if (!this.selected) return
    const defaults: FieldValues = {}
    for (const f of this.selected.manifest.fields) {
      if (f.type === 'image' || f.type === 'video') continue
      defaults[f.id] = (f.default as string | number | boolean | undefined) ?? ''
    }
    this.values = defaults
    await this.persistValues()
  }

  async setBackground(kind: PreviewBackground['kind']): Promise<void> {
    this.background = { kind }
    // Los proxies de $state no son clonables por IPC: se manda un objeto plano.
    await window.api.prefs.set({ background: { kind } })
  }

  async deleteTemplate(entry: LibraryEntry): Promise<void> {
    await window.api.library.remove(entry.id)
    if (this.selectedId === entry.id) this.selectedId = null
    await this.reloadLibrary()
    this.notify(`«${entry.name}» se quitó de la biblioteca.`, 'info')
  }

  async exportNow(fileName: string): Promise<void> {
    if (!this.selected) return
    let dir = this.outputDir
    if (!dir) {
      dir = await window.api.exporter.chooseFolder()
      if (!dir) return
      this.outputDir = dir
    }
    const job = await window.api.exporter.start({
      templateId: this.selected.id,
      values: $state.snapshot(this.values),
      format: this.exportSettings.format,
      quality: this.exportSettings.quality,
      outputDir: dir,
      fileName
    })
    this.upsertJob(job)
    this.exportSheetOpen = false
  }
}

export const ui = new UiState()
