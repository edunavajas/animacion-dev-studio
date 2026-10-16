import { BrowserWindow, clipboard, dialog, ipcMain, nativeTheme, shell, app } from 'electron'
import { basename, extname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { CH } from '../shared/channels'
import {
  deleteTemplate,
  ensureThumbnail,
  getEntry,
  importFromPath,
  listLibrary,
  showInFolder
} from './library'
import { RenderManager } from './render'
import { PreviewServer } from './previewServer'
import { readPrefs, setTemplateValues, writePrefs } from './prefs'
import { buildErrorReport } from './logs'
import { cores, describeSidecars, isLowMemory, totalRamGB } from './sidecars'
import type {
  AppInfo,
  ExportRequest,
  FieldValues,
  PreviewBackground
} from '../shared/types'

const EXT_BY_FORMAT: Record<string, string> = {
  mov: '.mov',
  webm: '.webm',
  mp4: '.mp4',
  'png-sequence': ''
}

function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, '-').trim()
  return cleaned || 'animacion'
}

/** Ruta de salida a partir de carpeta + nombre + formato (png-sequence = carpeta). */
export function resolveOutputPath(outputDir: string, fileName: string, format: string): string {
  const base = sanitizeFileName(fileName.replace(/\.[a-z0-9]+$/i, ''))
  const ext = EXT_BY_FORMAT[format] ?? ''
  return join(outputDir, base + ext)
}

export function registerIpc(deps: {
  getWindow: () => BrowserWindow | null
  renderManager: RenderManager
  preview: PreviewServer
}): void {
  const send = (channel: string, payload: unknown) => {
    deps.getWindow()?.webContents.send(channel, payload)
  }

  deps.renderManager.on('update', (job) => send(CH.exportUpdate, job))
  deps.renderManager.on('finished', (job) => send(CH.exportFinished, job))

  ipcMain.handle(CH.appInfo, (): AppInfo => {
    return {
      version: app.getVersion(),
      platform: process.platform,
      systemTheme: nativeTheme.shouldUseDarkColors ? 'dark' : 'light',
      sidecars: describeSidecars(),
      lowMemory: isLowMemory(),
      totalRamGB: totalRamGB(),
      cores: cores()
    }
  })

  // El tema también se aplica al marco nativo de la ventana.
  ipcMain.handle(CH.appSetTheme, (_e, theme: 'light' | 'dark') => {
    nativeTheme.themeSource = theme === 'dark' ? 'dark' : 'light'
  })

  ipcMain.handle(CH.appQuit, () => app.quit())

  ipcMain.handle(CH.diagnosticsReport, (_e, reason?: string) => buildErrorReport(reason))

  ipcMain.handle(CH.clipboardWrite, (_e, text: string) => {
    clipboard.writeText(text)
  })

  ipcMain.handle(CH.libraryList, () => listLibrary())

  ipcMain.handle(CH.libraryImport, (_e, srcPath: string, replace: boolean) =>
    importFromPath(srcPath, replace)
  )

  ipcMain.handle(CH.libraryImportDialog, async (): Promise<string[]> => {
    const win = deps.getWindow()
    const properties: Array<'openFile' | 'openDirectory'> =
      process.platform === 'darwin' ? ['openFile', 'openDirectory'] : ['openFile']
    const result = win
      ? await dialog.showOpenDialog(win, {
          title: 'Añadir plantilla',
          buttonLabel: 'Añadir',
          properties,
          filters: [{ name: 'Plantilla (.zip)', extensions: ['zip'] }]
        })
      : { canceled: true, filePaths: [] as string[] }
    return result.canceled ? [] : result.filePaths
  })

  ipcMain.handle(CH.libraryDelete, (_e, id: string) => deleteTemplate(id))
  ipcMain.handle(CH.libraryReveal, (_e, path: string) => showInFolder(path))

  ipcMain.handle(CH.libraryThumbnail, async (_e, id: string) => {
    const thumb = await ensureThumbnail(id)
    if (thumb) send(CH.libraryThumbReady, { id, thumbPath: thumb })
    return thumb
  })

  ipcMain.handle(CH.prefsGet, () => readPrefs())
  ipcMain.handle(CH.prefsSet, (_e, patch) => writePrefs(patch))

  ipcMain.handle(CH.valuesGet, async (_e, templateId: string): Promise<FieldValues> => {
    const prefs = await readPrefs()
    return prefs.values[templateId] ?? {}
  })
  ipcMain.handle(CH.valuesSet, (_e, templateId: string, values: FieldValues) =>
    setTemplateValues(templateId, values)
  )

  ipcMain.handle(CH.exportChooseFolder, async (): Promise<string | null> => {
    const win = deps.getWindow()
    if (!win) return null
    const prefs = await readPrefs()
    const result = await dialog.showOpenDialog(win, {
      title: 'Elegir carpeta de salida',
      buttonLabel: 'Usar esta carpeta',
      defaultPath: prefs.outputDir,
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || !result.filePaths[0]) return null
    await writePrefs({ outputDir: result.filePaths[0] })
    return result.filePaths[0]
  })

  ipcMain.handle(CH.exportStart, async (_e, req: ExportRequest) => {
    const entry = await getEntry(req.templateId)
    if (!entry) throw new Error('Plantilla no encontrada')
    const outputPath = resolveOutputPath(req.outputDir, req.fileName, req.format)
    return deps.renderManager.enqueue({
      manifest: entry.manifest,
      templateDir: entry.dir,
      values: req.values,
      format: req.format,
      quality: req.quality,
      outputPath
    })
  })

  ipcMain.handle(CH.exportList, () => deps.renderManager.list())
  ipcMain.handle(CH.exportCancel, (_e, id: string) => deps.renderManager.cancel(id))

  ipcMain.handle(CH.exportOpenFolder, (_e, path: string) => {
    shell.showItemInFolder(path)
  })

  ipcMain.handle(
    CH.previewStart,
    async (_e, templateId: string, values: FieldValues, background: PreviewBackground) => {
      const entry = await getEntry(templateId)
      if (!entry) throw new Error('Plantilla no encontrada')
      await deps.preview.start()
      deps.preview.setSession({
        templateDir: entry.dir,
        manifest: entry.manifest,
        values,
        background
      })
      return { url: deps.preview.frameUrl() }
    }
  )

  ipcMain.handle(
    CH.previewUpdate,
    async (_e, templateId: string, values: FieldValues, background: PreviewBackground) => {
      const entry = await getEntry(templateId)
      if (!entry) return
      deps.preview.setSession({
        templateDir: entry.dir,
        manifest: entry.manifest,
        values,
        background
      })
    }
  )

  ipcMain.handle(CH.previewStop, () => deps.preview.clearSession())
}

export { basename, extname, randomUUID }
