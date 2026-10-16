/**
 * Verificación visual de la interfaz.
 *
 *   npm run debug:ui
 *
 * Levanta un entorno EQUIVALENTE al de la app (mismos módulos del proceso
 * principal y el preload real), carga el renderer ya compilado, pulsa botones
 * por su nombre accesible y guarda capturas.
 */
import { app, BrowserWindow, nativeTheme, protocol } from 'electron'
import { join } from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { RenderManager } from '../src/main/render'
import { mimeFor, PreviewServer } from '../src/main/previewServer'
import { registerIpc } from '../src/main/ipc'
import { installBundledExamples } from '../src/main/library'
import { readPrefs, writePrefs } from '../src/main/prefs'

// Igual que la app: el protocolo `studio:` sirve las miniaturas.
protocol.registerSchemesAsPrivileged([
  { scheme: 'studio', privileges: { standard: true, secure: true, supportFetchAPI: true } }
])

app.setName('animacion-dev-studio')
app.on('window-all-closed', () => {})

const OUT = '/tmp'
const ABRIR_PLANTILLA = process.env.UI_TEMPLATE ?? 'boton-suscribirse'

async function shoot(win: BrowserWindow, name: string): Promise<void> {
  const img = await win.webContents.capturePage()
  await writeFile(join(OUT, name), img.toPNG())
  console.log('captura →', join(OUT, name))
}

async function click(win: BrowserWindow, selector: string): Promise<boolean> {
  const ok = await win.webContents.executeJavaScript(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    el.click();
    return true;
  })()`)
  console.log(`  clic ${selector}: ${ok ? 'ok' : 'NO ENCONTRADO'}`)
  return ok
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function main(): Promise<void> {
  protocol.handle('studio', async (request) => {
    try {
      const p = decodeURIComponent(new URL(request.url).searchParams.get('p') ?? '')
      if (!p || !existsSync(p)) return new Response('no encontrado', { status: 404 })
      return new Response(await readFile(p), { headers: { 'content-type': mimeFor(p) } })
    } catch {
      return new Response('error', { status: 500 })
    }
  })

  const prefs = await readPrefs()
  if (prefs.theme) nativeTheme.themeSource = prefs.theme

  const renderManager = new RenderManager()
  const preview = new PreviewServer()

  await installBundledExamples()
  await writePrefs({ lastTemplateId: ABRIR_PLANTILLA, theme: 'light' })
  nativeTheme.themeSource = 'light'

  const win = new BrowserWindow({
    width: 1200,
    height: 780,
    show: false,
    backgroundColor: '#F2F2F8',
    webPreferences: {
      preload: join(app.getAppPath(), 'out', 'preload', 'index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  registerIpc({ getWindow: () => win, renderManager, preview })

  await win.loadFile(join(app.getAppPath(), 'out', 'renderer', 'index.html'))
  await wait(9000)

  // 1. Pantalla de plantilla en claro, con el control de volumen y el botón de tema.
  await shoot(win, 'ui-light-template.png')

  // 2. Confirmación al restablecer (debe enfocar «Cancelar»).
  if (await click(win, 'button[title="Restablecer valores"]')) {
    await wait(800)
    const dialog = await win.webContents.executeJavaScript(
      `(() => { const d = document.querySelector('[role="alertdialog"]'); return d ? d.textContent.replace(/\\s+/g,' ').trim().slice(0,160) : null; })()`
    )
    console.log('  diálogo:', dialog ? 'SÍ' : 'NO', '|', dialog)
    const focused = await win.webContents.executeJavaScript(
      `document.activeElement ? document.activeElement.textContent.trim() : null`
    )
    console.log('  foco inicial en:', JSON.stringify(focused))
    await shoot(win, 'ui-confirm-reset.png')

    // Cancelar: los valores deben quedar intactos.
    const before = await win.webContents.executeJavaScript(
      `document.querySelector('input[type=text]')?.value ?? null`
    )
    await click(win, '[role="alertdialog"] .btn--secondary')
    await wait(500)
    const after = await win.webContents.executeJavaScript(
      `document.querySelector('input[type=text]')?.value ?? null`
    )
    console.log(`  cancelar conserva el valor: ${before === after ? 'SÍ' : 'NO'} (${before} → ${after})`)
  }

  // 3. Tema oscuro con el mismo botón.
  await click(win, '[aria-label^="Cambiar a tema oscuro"]')
  await wait(700)
  const theme = await win.webContents.executeJavaScript(`document.documentElement.dataset.theme`)
  console.log('  tema tras pulsar:', theme)
  await shoot(win, 'ui-dark-template.png')

  // 4. Biblioteca en oscuro, con el menú de cada tarjeta.
  await click(win, 'button.btn--ghost')
  await wait(1500)
  await shoot(win, 'ui-dark-library.png')

  // 5. Confirmación al eliminar: el botón de confirmar va en rojo.
  if (await click(win, '[aria-label^="Opciones de"]')) {
    await wait(500)
    await shoot(win, 'ui-tile-menu.png')
    if (await click(win, '[role="menuitem"]:last-child')) {
      await wait(700)
      const del = await win.webContents.executeJavaScript(
        `(() => { const d = document.querySelector('[role="alertdialog"]'); if(!d) return null; const b=d.querySelector('.btn--danger-solid'); return { text: d.textContent.replace(/\\s+/g,' ').trim().slice(0,120), confirm: b ? b.textContent.trim() : null }; })()`
      )
      console.log('  diálogo de borrado:', JSON.stringify(del))
      await shoot(win, 'ui-confirm-delete.png')
      // Se cancela: no queremos borrar nada de la biblioteca real.
      await click(win, '[role="alertdialog"] .btn--secondary')
    }
  }

  win.destroy()
  app.exit(0)
}

app.whenReady().then(() =>
  main().catch((e) => {
    console.error(e)
    app.exit(1)
  })
)
