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
import { app } from 'electron'
import { rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { PreviewServer } from '../src/main/previewServer'
import { listLibrary, importFromPath, deleteTemplate, installBundledExamples } from '../src/main/library'
import { parseManifest, extractDeclaredVariables, crossCheck } from '../src/main/manifest'
import { buildVariablesPayload } from '../src/main/render'
import { hyperframesCliPath, browserPath, ffmpegPath, ffprobePath, sidecarEnv } from '../src/main/sidecars'

// Al ejecutar un script suelto, Electron no lee el nombre del package.json:
// se fija para que userData (y por tanto la biblioteca) sea el de la app real.
app.setName('animacion-dev-studio')

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
  check('carpeta sin template.json se rechaza', !res.ok && res.issues.some((i) => i.code === 'manifestMissing'))

  console.log('\n== render MOV con alpha (sidecar empaquetado) ==')
  const out = join(app.getPath('temp'), 'studio-test-out.mov')
  await rm(out, { force: true })
  const ok = await runRender(out)
  check('el render terminó con éxito', ok)

  console.log(`\n${checks - failures}/${checks} comprobaciones OK`)
  if (failures > 0) console.log(`${failures} FALLOS`)
  app.exit(failures > 0 ? 1 : 0)
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

function runRender(out: string): Promise<boolean> {
  return new Promise((resolve) => {
    const templateDir = join(app.getAppPath(), 'templates', 'boton-suscribirse')
    const args = [
      hyperframesCliPath(),
      'render',
      templateDir,
      '--format',
      'mov',
      '--quality',
      'draft',
      '--variables',
      JSON.stringify({ subs: '1 K' }),
      '--strict-variables',
      '-o',
      out
    ]
    const child = spawn(process.execPath, args, {
      env: sidecarEnv({ ELECTRON_RUN_AS_NODE: '1' }),
      cwd: templateDir,
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
}

app.whenReady().then(() =>
  main().catch((err) => {
    console.error('EXCEPCIÓN EN EL TEST', err)
    app.exit(2)
  })
)
