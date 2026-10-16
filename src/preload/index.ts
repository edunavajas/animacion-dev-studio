import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { CH } from '../shared/channels'
import type {
  AppInfo,
  ExportRequest,
  FieldValues,
  ImportResult,
  LibraryEntry,
  PreviewBackground,
  RenderJob
} from '../shared/types'

type Unsub = () => void

function sub<T>(channel: string, cb: (payload: T) => void): Unsub {
  const listener = (_e: unknown, payload: T) => cb(payload)
  ipcRenderer.on(channel, listener as never)
  return () => ipcRenderer.removeListener(channel, listener as never)
}

export interface PrefsShape {
  outputDir?: string
  lastTemplateId?: string
  values: Record<string, FieldValues>
  background?: PreviewBackground
}

const api = {
  appInfo: (): Promise<AppInfo> => ipcRenderer.invoke(CH.appInfo),
  quit: (): Promise<void> => ipcRenderer.invoke(CH.appQuit),
  diagnosticsReport: (reason?: string): Promise<string> =>
    ipcRenderer.invoke(CH.diagnosticsReport, reason),

  copyText: (text: string): Promise<void> => ipcRenderer.invoke(CH.clipboardWrite, text),

  /** Ruta real de un archivo soltado (Electron ≥32 ya no expone File.path). */
  pathForFile: (file: File): string => webUtils.getPathForFile(file),

  library: {
    list: (): Promise<LibraryEntry[]> => ipcRenderer.invoke(CH.libraryList),
    import: (path: string, replace = false): Promise<ImportResult> =>
      ipcRenderer.invoke(CH.libraryImport, path, replace),
    importDialog: (): Promise<string[]> => ipcRenderer.invoke(CH.libraryImportDialog),
    remove: (id: string): Promise<void> => ipcRenderer.invoke(CH.libraryDelete, id),
    reveal: (path: string): Promise<void> => ipcRenderer.invoke(CH.libraryReveal, path),
    thumbnail: (id: string): Promise<string | null> => ipcRenderer.invoke(CH.libraryThumbnail, id),
    onThumbReady: (cb: (p: { id: string; thumbPath: string }) => void): Unsub =>
      sub(CH.libraryThumbReady, cb)
  },

  prefs: {
    get: (): Promise<PrefsShape> => ipcRenderer.invoke(CH.prefsGet),
    set: (patch: Partial<PrefsShape>): Promise<PrefsShape> => ipcRenderer.invoke(CH.prefsSet, patch)
  },

  values: {
    get: (templateId: string): Promise<FieldValues> => ipcRenderer.invoke(CH.valuesGet, templateId),
    set: (templateId: string, values: FieldValues): Promise<void> =>
      ipcRenderer.invoke(CH.valuesSet, templateId, values)
  },

  exporter: {
    chooseFolder: (): Promise<string | null> => ipcRenderer.invoke(CH.exportChooseFolder),
    start: (req: ExportRequest): Promise<RenderJob> => ipcRenderer.invoke(CH.exportStart, req),
    list: (): Promise<RenderJob[]> => ipcRenderer.invoke(CH.exportList),
    cancel: (id: string): Promise<void> => ipcRenderer.invoke(CH.exportCancel, id),
    openFolder: (path: string): Promise<void> => ipcRenderer.invoke(CH.exportOpenFolder, path),
    onUpdate: (cb: (job: RenderJob) => void): Unsub => sub(CH.exportUpdate, cb),
    onFinished: (cb: (job: RenderJob) => void): Unsub => sub(CH.exportFinished, cb)
  },

  preview: {
    start: (
      templateId: string,
      values: FieldValues,
      background: PreviewBackground
    ): Promise<{ url: string }> => ipcRenderer.invoke(CH.previewStart, templateId, values, background),
    update: (templateId: string, values: FieldValues, background: PreviewBackground): Promise<void> =>
      ipcRenderer.invoke(CH.previewUpdate, templateId, values, background),
    stop: (): Promise<void> => ipcRenderer.invoke(CH.previewStop)
  }
}

export type StudioApi = typeof api

contextBridge.exposeInMainWorld('api', api)
