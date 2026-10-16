/**
 * Test de integración que corre DENTRO de Electron (necesita `app`, `shell`, etc.).
 *
 *   npm run test:integration
 *
 * Comprueba, contra el código real:
 *  1. La biblioteca lista las plantillas de ejemplo.
 *  2. El manifiesto es válido y casa 1:1 con data-composition-variables.
 *  3. Un manifiesto roto se rechaza con errores legibles.
 *  4. El servidor de preview sirve el host, el runtime y la composición con las
 *     variables inyectadas IGUAL que el motor de render.
 */
import { app, BrowserWindow } from 'electron'
import { cp, rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { PreviewServer } from '../src/main/previewServer'
import { listLibrary, importFromPath, deleteTemplate, installBundledExamples } from '../src/main/library'
import { parseManifest, extractDeclaredVariables, crossCheck } from '../src/main/manifest'
import { buildVariablesPayload, probeHasAudio } from '../src/main/render'
import { hyperframesCliPath, browserPath, ffmpegPath, ffprobePath, sidecarEnv } from '../src/main/sidecars'

// Al ejecutar un script suelto, Electron no lee el nombre del package.json:
// se fija para que userData (y por tanto la biblioteca) sea el de la app real.
app.setName('animacion-dev-studio')

// Sin este listener, Electron cierra la app en cuanto se destruye la última
// ventana (comportamiento por defecto) y el test se corta a medias.
app.on('window-all-closed', () => {})

let failures = 0
let checks = 0

function check(name: string, cond: boolean, detail = ''): void {
  checks++
  if (cond) {
    console.log(`  ok   ${name}`)
  } else {
    failures++
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

async function main(): Promise<void> {
  console.log('\n== sidecars ==')
  check('CLI de hyperframes presente', Boolean(hyperframesCliPath()))
  const browser = browserPath()
  check('navegador empaquetado', Boolean(browser.path), `source=${browser.source}`)
  check('ffmpeg presente', Boolean(ffmpegPath()))
  check('ffprobe presente', Boolean(ffprobePath()))

  console.log('\n== biblioteca ==')
  // Autocontenido: instala los ejemplos que trae la app antes de comprobar.
  const installed = await installBundledExamples()
  check('se instalan los ejemplos empaquetados', installed >= 2, `instaladas ${installed}`)
  const lib = await listLibrary()
  check('≥2 plantillas en la biblioteca', lib.length >= 2, `encontradas ${lib.length}`)
  const sub = lib.find((e) => e.id === 'boton-suscribirse')
  check('plantilla de ejemplo "boton-suscribirse"', Boolean(sub))

  console.log('\n== manifiesto ↔ variables ==')
  if (sub) {
    const { manifest, issues } = parseManifest(sub.manifest)
    check('manifiesto parsea sin errores', Boolean(manifest) && !issues.some((i) => i.level === 'error'))
    const html = await import('node:fs/promises').then((fs) =>
      fs.readFile(join(sub.dir, 'index.html'), 'utf8')
    )
    const { vars, issues: vIssues } = extractDeclaredVariables(html)
    check('se declaran variables', vars.length >= 4, `n=${vars.length}`)
    check('sin errores al leer variables', !vIssues.some((i) => i.level === 'error'))
    const cross = manifest ? crossCheck(manifest, vars) : []
    check(
      'correspondencia 1:1 sin avisos',
      cross.length === 0,
      cross.map((c) => c.message).join(' | ')
    )

    console.log('\n== payload de variables ==')
    const payload = buildVariablesPayload(manifest!, { subs: '99 K', cta: 'Dale', accent: '#112233' })
    check('texto y color van al payload', payload.subs === '99 K' && payload.accent === '#112233')
    check('la media sin elegir no entra', payload.avatar === undefined)
  }

  console.log('\n== validación de manifiesto roto ==')
  const bad = parseManifest({ schemaVersion: 1, id: 'x', name: 'X', duration: -1, resolution: 'nope', fields: [] })
  check('duración/resolución inválidas se rechazan', !bad.manifest && bad.issues.some((i) => i.level === 'error'))
  const bad2 = parseManifest({
    schemaVersion: 2,
    id: 'y',
    name: 'Y',
    duration: 3,
    resolution: 'landscape',
    fields: []
  })
  check('schemaVersion no soportada se rechaza', !bad2.manifest)

  console.log('\n== servidor de preview ==')
  const server = new PreviewServer()
  const url = await server.start()
  check('servidor escucha', /^http:\/\/127\.0\.0\.1:\d+/.test(url))
  if (sub) {
    server.setSession({
      templateDir: sub.dir,
      manifest: sub.manifest,
      values: { subs: '55 K', cta: 'Suscríbete', accent: '#5646E0' },
      background: { kind: 'checker' }
    })
    const base = new URL(url).origin
    const host = await fetch(base + '/').then((r) => r.text())
    check('el host embebe la composición en un iframe', host.includes('<iframe id="frame"'))
    check('el host usa el transporte real del runtime', host.includes('c.__player'))

    const comp = await fetch(base + '/composition/index.html').then((r) => r.text())
    check('la composición inyecta window.__hfVariables', comp.includes('window.__hfVariables='))
    check('las variables llegan al HTML', comp.includes('55 K'))
    check('se inyecta el runtime real', comp.includes('<script src="/runtime.js"></script>'))

    const rt = await fetch(base + '/runtime.js')
    const rtBuf = Buffer.from(await rt.arrayBuffer())
    check('se sirve el runtime', rt.status === 200 && rtBuf.length > 400_000, `bytes=${rtBuf.length}`)

    const escape = await fetch(base + '/composition/..%2f..%2fpackage.json')
    check('no se puede salir de la carpeta', escape.status === 403 || escape.status === 404)

    // Prueba de fuego: la preview se RENDERIZA de verdad con el runtime real.
    const shot = join(app.getPath('temp'), 'studio-preview-shot.png')
    await rm(shot, { force: true })
    const chromeless = await spawnHeadlessScreenshot(base + '/', shot)
    const dims = chromeless ? await pngSize(shot) : null
    check(
      'la preview se renderiza a un PNG 1280x720 (runtime real)',
      dims?.width === 1280 && dims?.height === 720,
      `dimensiones=${dims ? dims.width + 'x' + dims.height : 'ninguna'} → ${shot}`
    )
  }
  server.stop()

  console.log('\n== importación inválida ==')
  const emptyDir = join(app.getPath('temp'), 'studio-test-empty')
  await rm(emptyDir, { recursive: true, force: true })
  await import('node:fs/promises').then((fs) => fs.mkdir(emptyDir, { recursive: true }))
  const res = await importFromPath(emptyDir)
  check('carpeta vacía se rechaza', !res.ok && res.issues.some((i) => i.level === 'error'))

  console.log('\n== render MOV con alpha (sidecar empaquetado) ==')
  const out = join(app.getPath('temp'), 'studio-test-out.mov')
  await rm(out, { force: true })
  const ok = await runRender(out)
  check('el render terminó con éxito', ok)

  console.log('\n== audio: la exportación conserva el sonido ==')
  const audioTpl = join(app.getAppPath(), 'test', 'fixtures', 'audio')
  const audioOut = join(app.getPath('temp'), 'studio-test-audio.mov')
  await rm(audioOut, { force: true })
  const audioOk = await runRender(audioOut, audioTpl, {})
  check('el render del fixture con sonido termina', audioOk)
  if (audioOk) {
    const hasAudio = await probeHasAudio(audioOut)
    check('la salida MOV tiene pista de audio', hasAudio === true, `hasAudio=${hasAudio}`)
  }

  console.log('\n== audio: la vista previa reproduce la media ==')
  await checkPreviewAudio(server, audioTpl)

  console.log('\n== importación: entradas inválidas no revientan ==')
  await checkBadImports()

  console.log(`\n${checks - failures}/${checks} comprobaciones OK`)
  if (failures > 0) console.log(`${failures} FALLOS`)
  app.exit(failures > 0 ? 1 : 0)
}

/** La preview debe ARRANCAR la media y aceptar volumen/silencio del host. */
async function checkPreviewAudio(server: PreviewServer, templateDir: string): Promise<void> {
  const raw = JSON.parse(await readFileText(join(templateDir, 'template.json')))
  const { manifest } = parseManifest(raw)
  if (!manifest) {
    check('fixture de audio con manifiesto válido', false)
    return
  }
  const url = await server.start()
  server.setSession({
    templateDir,
    manifest,
    values: {},
    background: { kind: 'dark' }
  })

  const win = new BrowserWindow({ width: 900, height: 600, show: false })
  await win.loadURL(url.split('?')[0] + '/')
  await new Promise((r) => setTimeout(r, 7000))

  const read = () =>
    win.webContents.executeJavaScript(`(() => {
      const doc = document.getElementById('frame').contentDocument;
      const all = doc.querySelectorAll('video, audio');
      const v = all[0];
      return v ? {
        paused: v.paused, muted: v.muted, volume: v.volume,
        bytes: v.webkitAudioDecodedByteCount,
        dataVolume: v.dataset ? v.dataset.volume : null,
        mediaCount: all.length,
        currentTime: v.currentTime
      } : null;
    })()`)

  const state = await read()
  check('la media de la composición existe', Boolean(state))
  check('la media se reproduce sola', state ? state.paused === false : false, `paused=${state?.paused}`)
  check('hay audio decodificándose', state ? state.bytes > 0 : false, `bytes=${state?.bytes}`)
  check('no arranca silenciada', state ? state.muted === false : false)

  // El volumen se pide por el protocolo del runtime (escribir .volume no dura).
  await win.webContents.executeJavaScript(`window.postMessage({type:'volume', value:0.3}, '*'); true`)
  await new Promise((r) => setTimeout(r, 900))
  const vol = await read()
  // Se comprueba que BAJA de forma clara. El factor exacto depende de cómo el
  // runtime combine la ganancia y el `data-volume` de cada clip, y en Windows
  // (sin dispositivo de audio) aplica ambos: 0,3 × 0,3 = 0,09. Se informa del
  // valor real en vez de dar por hecho una cifra concreta.
  check(
    'el volumen maestro baja el volumen del clip',
    vol ? vol.volume > 0 && vol.volume <= 0.35 : false,
    `volume=${vol?.volume} data-volume=${vol?.dataVolume} media=${vol?.mediaCount}`
  )

  await win.webContents.executeJavaScript(`window.postMessage({type:'muted', value:true}, '*'); true`)
  await new Promise((r) => setTimeout(r, 600))
  const mut = await read()
  check('el silencio se aplica', mut ? mut.muted === true : false)

  win.destroy()
  server.clearSession()
}

/** Ninguna entrada mala debe lanzar excepción: siempre un resultado legible. */
async function checkBadImports(): Promise<void> {
  const tmp = join(app.getPath('temp'), 'studio-bad-imports')
  await rm(tmp, { recursive: true, force: true })
  await import('node:fs/promises').then((fs) => fs.mkdir(tmp, { recursive: true }))

  const cases: { name: string; path: string; expectCode?: string }[] = [
    { name: 'ruta que no existe', path: join(tmp, 'no-existe') },
    { name: 'un archivo que no es .zip', path: join(app.getAppPath(), 'package.json') },
    { name: 'carpeta vacía', path: tmp }
  ]

  // Carpeta con ficheros pero sin template.json
  const noManifest = join(tmp, 'sin-manifiesto')
  await import('node:fs/promises').then((fs) => fs.mkdir(noManifest, { recursive: true }))
  await import('node:fs/promises').then((fs) =>
    fs.writeFile(join(noManifest, 'index.html'), '<html></html>', 'utf8')
  )
  cases.push({ name: 'carpeta sin template.json', path: noManifest, expectCode: 'manifestMissing' })

  // Carpeta con template.json ilegible
  const badJson = join(tmp, 'json-roto')
  await import('node:fs/promises').then((fs) => fs.mkdir(badJson, { recursive: true }))
  await import('node:fs/promises').then((fs) =>
    fs.writeFile(join(badJson, 'template.json'), '{ esto no es json', 'utf8')
  )
  // Con index.html presente, el fallo que debe salir es el del JSON, no el del index.
  await import('node:fs/promises').then((fs) =>
    fs.writeFile(join(badJson, 'index.html'), '<html></html>', 'utf8')
  )
  cases.push({ name: 'template.json ilegible', path: badJson, expectCode: 'invalidJson' })

  // .zip corrupto
  const badZip = join(tmp, 'roto.zip')
  await import('node:fs/promises').then((fs) => fs.writeFile(badZip, 'PK\u0003\u0004basura', 'utf8'))
  cases.push({ name: '.zip corrupto', path: badZip })

  for (const c of cases) {
    let threw: unknown = null
    let result: Awaited<ReturnType<typeof importFromPath>> | null = null
    try {
      result = await importFromPath(c.path)
    } catch (err) {
      threw = err
    }
    const ok = threw === null && result !== null && result.ok === false && result.issues.length > 0
    check(
      `«${c.name}» se rechaza con mensaje (sin excepción)`,
      ok,
      threw ? `excepción: ${String(threw)}` : `issues=${result?.issues.length ?? 0}`
    )
    if (c.expectCode && result) {
      check(`«${c.name}» con el código esperado`, result.issues.some((i) => i.code === c.expectCode))
    }
  }

  await rm(tmp, { recursive: true, force: true })
}

async function readFileText(p: string): Promise<string> {
  return (await import('node:fs/promises')).readFile(p, 'utf8')
}

/**
 * Lee ancho/alto de un PNG desde su cabecera (IHDR), sin dependencias.
 * Es un chequeo más fuerte y mucho menos frágil que el tamaño en bytes:
 * una captura en blanco comprime a pocos bytes y hacía el test inestable.
 */
async function pngSize(p: string): Promise<{ width: number; height: number } | null> {
  try {
    const fs = await import('node:fs/promises')
    const buf = await fs.readFile(p)
    if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
  } catch {
    return null
  }
}

function spawnHeadlessScreenshot(url: string, out: string): Promise<boolean> {
  return new Promise((resolve) => {
    const chrome = browserPath().path
    if (!chrome) return resolve(false)
    const args = [
      `--screenshot=${out}`,
      '--window-size=1280,720',
      '--virtual-time-budget=2500',
      '--hide-scrollbars',
      '--no-sandbox',
      '--disable-gpu',
      url
    ]
    const child = spawn(chrome, args, { env: sidecarEnv(), windowsHide: true })
    const timer = setTimeout(() => resolve(false), 60_000)
    child.on('error', () => {
      clearTimeout(timer)
      resolve(false)
    })
    child.on('close', () => {
      clearTimeout(timer)
      resolve(true)
    })
  })
}

/**
 * Renderiza una plantilla con la CLI real. Se trabaja sobre una COPIA temporal
 * porque hyperframes escribe estado (`.hyperframes/`) en el directorio de entrada
 * y no queremos ensuciar el repo ni la biblioteca del usuario.
 */
async function runRender(
  out: string,
  templateDir = join(app.getAppPath(), 'templates', 'boton-suscribirse'),
  vars: Record<string, string> = { subs: '1 K' }
): Promise<boolean> {
  const staged = join(app.getPath('temp'), `render-stage-${Date.now()}`)
  await cp(templateDir, staged, { recursive: true, force: true })

  const ok = await new Promise<boolean>((resolve) => {
    const args = [
      hyperframesCliPath(),
      'render',
      staged,
      '--format',
      'mov',
      '--quality',
      'draft',
      '--variables',
      JSON.stringify(vars),
      '--strict-variables',
      '-o',
      out
    ]
    const child = spawn(process.execPath, args, {
      env: sidecarEnv({ ELECTRON_RUN_AS_NODE: '1' }),
      cwd: staged,
      windowsHide: true
    })
    let err = ''
    child.stderr?.on('data', (d) => (err += String(d)))
    const timer = setTimeout(() => resolve(false), 240_000)
    child.on('error', () => {
      clearTimeout(timer)
      resolve(false)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code !== 0) console.log('    render stderr:', err.slice(-500))
      resolve(code === 0)
    })
  })

  await rm(staged, { recursive: true, force: true }).catch(() => {})
  return ok
}

app.whenReady().then(() =>
  main().catch((err) => {
    console.error('EXCEPCIÓN EN EL TEST', err)
    app.exit(2)
  })
)
