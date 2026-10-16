import { app, BrowserWindow, Menu, nativeTheme, protocol, shell } from 'electron'
import { existsSync } from 'node:fs'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { workDir } from './paths'
import { log } from './logs'
import { RenderManager } from './render'
import { PreviewServer, mimeFor } from './previewServer'
import { installBundledExamples, listLibrary } from './library'
import { readPrefs } from './prefs'
import { describeSidecars } from './sidecars'
import { registerIpc } from './ipc'

// El protocolo `studio:` sirve archivos locales (miniaturas, etc.) sin exponer
// file:// al renderer. Debe declararse privilegiado ANTES de app.whenReady().
protocol.registerSchemesAsPrivileged([
  { scheme: 'studio', privileges: { standard: true, secure: true, supportFetchAPI: true } }
])

const isDev = !app.isPackaged
const bootAt = Date.now()
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
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#101018' : '#F2F2F8',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: process.platform === 'darwin' ? { x: 16, y: 18 } : undefined,
    webPreferences: {
      preload: preloadFile(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
    const ms = Date.now() - bootAt
    log.info('ventana lista', { ms })
    // `--bench` mide el arranque en frío hasta la primera ventana y sale.
    if (process.argv.includes('--bench')) {
      console.log(`startup: ${ms} ms`)
      app.exit(0)
    }
  })

  // `--screenshot=<ruta>`: captura la interfaz y sale. Sirve para revisar el
  // diseño a ojo y para verificación automatizada, sin permisos de pantalla.
  const shotArg = process.argv.find((a) => a.startsWith('--screenshot='))
  if (shotArg) {
    const out = shotArg.slice('--screenshot='.length)
    mainWindow.webContents.once('did-finish-load', () => {
      const delay = Number(process.env.STUDIO_SHOT_DELAY ?? 3000)
      setTimeout(() => {
        // STUDIO_SHOT_EXPORT=1 pulsa Cmd/Ctrl+E antes de capturar (revisar el diálogo).
        const capture = async () => {
          if (process.env.STUDIO_SHOT_EXPORT === '1') {
            const modifiers: Array<'meta' | 'control'> =
              process.platform === 'darwin' ? ['meta'] : ['control']
            mainWindow?.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'E', modifiers })
            mainWindow?.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'E', modifiers })
            await new Promise((r) => setTimeout(r, 900))
          }
          const img = await mainWindow!.webContents.capturePage()
          await writeFile(out, img.toPNG())
          console.log(`screenshot → ${out}`)
          app.exit(0)
        }
        capture().catch((err) => {
          console.error('no se pudo capturar', err)
          app.exit(1)
        })
      }, delay)
    })
  }

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
    const sidecars = describeSidecars()
    log.info('sidecars', sidecars)

    // STUDIO_THEME=light|dark fuerza el tema (verificación de diseño del tema).
    const forced = process.env.STUDIO_THEME
    if (forced === 'light' || forced === 'dark') {
      nativeTheme.themeSource = forced
    } else {
      // La preferencia guardada manda; si no hay, se sigue al sistema.
      const prefs = await readPrefs()
      if (prefs.theme) nativeTheme.themeSource = prefs.theme
    }

    // `--diagnose` imprime el estado de componentes y sale (soporte y CI).
    if (process.argv.includes('--diagnose')) {
      console.log(JSON.stringify({ version: app.getVersion(), packaged: app.isPackaged, sidecars }, null, 2))
      app.exit(sidecars.hyperframes.ok && sidecars.browser.ok && sidecars.ffmpeg.ok ? 0 : 1)
      return
    }

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
