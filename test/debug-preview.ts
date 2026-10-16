import { app } from 'electron'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { rm } from 'node:fs/promises'
import { PreviewServer } from '../src/main/previewServer'
import { listLibrary } from '../src/main/library'
import { browserPath, sidecarEnv } from '../src/main/sidecars'

app.setName('animacion-dev-studio')

async function shot(url: string, out: string, budget: number): Promise<void> {
  await rm(out, { force: true })
  await new Promise<void>((resolve) => {
    const child = spawn(
      browserPath().path,
      [
        `--screenshot=${out}`,
        '--window-size=1280,720',
        `--virtual-time-budget=${budget}`,
        '--hide-scrollbars',
        '--no-sandbox',
        '--disable-gpu',
        url
      ],
      { env: sidecarEnv(), windowsHide: true }
    )
    child.on('close', () => resolve())
    child.on('error', () => resolve())
  })
  console.log('shot →', out)
}

app.whenReady().then(async () => {
  const server = new PreviewServer()
  const url = await server.start()
  const base = new URL(url).origin
  const lib = await listLibrary()
  const entry = lib.find((e) => e.id === 'boton-suscribirse')!
  server.setSession({
    templateDir: entry.dir,
    manifest: entry.manifest,
    values: { subs: '55 K', cta: 'Suscríbete', accent: '#5646E0' },
    background: { kind: 'checker' }
  })
  console.log('base', base)

  // 1) la composición directa (runtime inyectado, sin el elemento reproductor)
  await shot(`${base}/composition/index.html`, join(app.getPath('temp'), 'dbg-comp.png'), 3000)
  // 2) el host con el reproductor, a varios instantes
  for (const t of [400, 900, 1500, 2200]) {
    await shot(`${base}/`, join(app.getPath('temp'), `dbg-host-${t}.png`), t)
  }
  server.stop()
  app.exit(0)
})

function dumpDom(url: string, out: string): Promise<void> {
  return new Promise((resolve) => {
    const child = spawn(
      browserPath().path,
      ['--dump-dom', '--virtual-time-budget=6000', '--no-sandbox', '--disable-gpu', url],
      { env: sidecarEnv(), windowsHide: true }
    )
    let html = ''
    child.stdout?.on('data', (d) => (html += String(d)))
    child.on('close', async () => {
      const fs = await import('node:fs/promises')
      await fs.writeFile(out, html, 'utf8')
      console.log('dom →', out, html.length, 'bytes')
      resolve()
    })
    child.on('error', () => resolve())
  })
}
