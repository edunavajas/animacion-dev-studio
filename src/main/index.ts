import { app, BrowserWindow, Menu, protocol, shell } from 'electron'
import { existsSync } from 'node:fs'
import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { workDir } from './paths'
import { log } from './logs'
import { RenderManager } from './render'
import { PreviewServer, mimeFor } from './previewServer'
import { installBundledExamples, listLibrary } from './library'
import { registerIpc } from './ipc'

// El protocolo `studio:` sirve archivos locales (miniaturas, etc.) sin exponer
// file:// al renderer. Debe declararse privilegiado ANTES de app.whenReady().
protocol.registerSchemesAsPrivileged([
  { scheme: 'studio', privileges: { standard: true, secure: true, supportFetchAPI: true } }
])

const isDev = !app.isPackaged
let mainWindow: BrowserWindow | null = null
const renderManager = new RenderManager()
const preview = new PreviewServer()

/** El preload puede salir como .mjs (ESM) o .js según el build; se elige el que exista. */
function preloadFile(): string {
  const base = join(app.getAppPath(), 'out', 'preload')
  for (const name of ['index.mjs', 'index.js']) {
    const candidate = join(base, name)
    if (existsSync(candidate)) return candidate
  }
  return join(base, 'index.mjs')
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 940,
    minHeight: 620,
    show: false,
    backgroundColor: '#F5F5FA',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: process.platform === 'darwin' ? { x: 16, y: 18 } : undefined,
    webPreferences: {
      preload: preloadFile(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  // Los enlaces externos se abren en el navegador, nunca dentro de la app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  // La ventana nunca navega fuera del contenido propio.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env['ELECTRON_RENDERER_URL']
    const allowed = url.startsWith('file://') || (devUrl ? url.startsWith(devUrl) : false)
    if (!allowed) {
      event.preventDefault()
      if (/^https?:/.test(url)) void shell.openExternal(url)
    }
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(app.getAppPath(), 'out', 'renderer', 'index.html'))
  }
}

function buildMenu(): void {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null)
    return
  }
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.getName(),
      submenu: [
        { role: 'about', label: `Acerca de ${app.getName()}` },
        { type: 'separator' },
        { role: 'hide', label: 'Ocultar' },
        { role: 'hideOthers', label: 'Ocultar otros' },
        { role: 'unhide', label: 'Mostrar todo' },
        { type: 'separator' },
        { role: 'quit', label: 'Salir' }
      ]
    },
    {
      label: 'Edición',
      submenu: [
        { role: 'undo', label: 'Deshacer' },
        { role: 'redo', label: 'Rehacer' },
        { type: 'separator' },
        { role: 'cut', label: 'Cortar' },
        { role: 'copy', label: 'Copiar' },
        { role: 'paste', label: 'Pegar' },
        { role: 'selectAll', label: 'Seleccionar todo' }
      ]
    },
    {
      label: 'Ventana',
      submenu: [
        { role: 'minimize', label: 'Minimizar' },
        { role: 'zoom', label: 'Zoom' },
        { role: 'close', label: 'Cerrar' }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// Una sola instancia: si ya está abierta, se enfoca la ventana existente.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(async () => {
    // Limpieza de temporales de ejecuciones anteriores (también tras un cierre sucio).
    await rm(workDir(), { recursive: true, force: true }).catch(() => {})
    log.info('app lista', { version: app.getVersion(), dev: isDev })

    // `studio://local/?p=<ruta>` → sirve un archivo local con su tipo correcto.
    protocol.handle('studio', async (request) => {
      try {
        const p = decodeURIComponent(new URL(request.url).searchParams.get('p') ?? '')
        if (!p || !existsSync(p)) return new Response('no encontrado', { status: 404 })
        const data = await readFile(p)
        return new Response(data, { headers: { 'content-type': mimeFor(p) } })
      } catch {
        return new Response('error', { status: 500 })
      }
    })

    // Primera ejecución: se instalan las plantillas de ejemplo para no arrancar en vacío.
    try {
      const existing = await listLibrary()
      if (existing.length === 0) await installBundledExamples()
    } catch (err) {
      log.warn('no se pudieron instalar los ejemplos', { err: String(err) })
    }

    buildMenu()
    registerIpc({ getWindow: () => mainWindow, renderManager, preview })
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', () => {
    preview.stop()
    void rm(workDir(), { recursive: true, force: true }).catch(() => {})
  })

  process.on('uncaughtException', (err) => log.error('uncaughtException', { err: String(err) }))
  process.on('unhandledRejection', (err) => log.error('unhandledRejection', { err: String(err) }))
}
