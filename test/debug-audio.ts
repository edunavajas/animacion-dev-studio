/**
 * Sonda de audio de la vista previa.
 *
 *   npm run debug:audio
 *
 * Levanta el servidor de preview con un fixture de vídeo CON sonido y comprueba,
 * dentro de Electron de verdad, si el elemento <video> de la composición está
 * reproduciéndose, si está silenciado y si el control de volumen llega hasta él.
 */
import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { PreviewServer } from '../src/main/previewServer'
import { parseManifest, extractDeclaredVariables } from '../src/main/manifest'
import { readFile } from 'node:fs/promises'
import type { TemplateManifest } from '../src/shared/types'

app.setName('animacion-dev-studio')

const TPL = '/tmp/audio-test/tpl'

async function main(): Promise<void> {
  const raw = JSON.parse(await readFile(join(TPL, 'template.json'), 'utf8'))
  const { manifest } = parseManifest(raw)
  const html = await readFile(join(TPL, 'index.html'), 'utf8')
  const { vars } = extractDeclaredVariables(html)
  console.log('\nmanifiesto:', manifest ? 'ok' : 'FALLA', '| variables declaradas:', vars.map((v) => v.id).join(', '))

  const server = new PreviewServer()
  const url = await server.start()
  server.setSession({
    templateDir: TPL,
    manifest: manifest as TemplateManifest,
    values: {},
    background: { kind: 'dark' }
  })

  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    show: false,
    webPreferences: { offscreen: false }
  })
  win.webContents.on('console-message', (_e, level, message) => {
    console.log(`   [consola:${level}] ${message}`)
  })
  await win.loadURL(url.split('?')[0] + '/')

  // Espera a que el host anuncie ready y la media arranque.
  await new Promise((r) => setTimeout(r, 6000))

  console.log('\n=== ¿existe el transporte del runtime? ===')
  console.log(
    JSON.stringify(
      await win.webContents.executeJavaScript(`(() => {
        const cw = document.getElementById('frame').contentWindow;
        return {
          playerReady: !!cw.__playerReady,
          player: typeof cw.__player,
          playerKeys: cw.__player ? Object.keys(cw.__player) : [],
          timelines: cw.__timelines ? Object.keys(cw.__timelines) : []
        };
      })()`),
      null,
      2
    )
  )

  console.log('\n=== llamando a __player.play() a mano ===')
  console.log(
    JSON.stringify(
      await win.webContents.executeJavaScript(`(async () => {
        const cw = document.getElementById('frame').contentWindow;
        const p = cw.__player;
        if (!p) return { error: 'sin __player' };
        try { await p.play(); } catch (e) { return { error: String(e) }; }
        await new Promise(r => setTimeout(r, 1200));
        const v = cw.document.getElementById('v');
        return { paused: v.paused, t: v.currentTime, isPlaying: p.isPlaying ? p.isPlaying() : null };
      })()`),
      null,
      2
    )
  )

  const probe = `(() => {
    const host = document.getElementById('frame');
    const doc = host && host.contentDocument;
    const v = doc && doc.getElementById('v');
    if (!v) return { found: false };
    return {
      found: true,
      paused: v.paused,
      muted: v.muted,
      volume: v.volume,
      currentTime: v.currentTime,
      readyState: v.readyState,
      duration: v.duration,
      // Chromium: bytes de audio realmente decodificados (>0 = hay pista sonando)
      audioBytes: v.webkitAudioDecodedByteCount,
      pausedAttr: v.hasAttribute('muted')
    };
  })()`

  const before = await win.webContents.executeJavaScript(probe)
  console.log('\n=== estado inicial de la media ===')
  console.log(JSON.stringify(before, null, 2))

  // Cambia el volumen a 0.25 por el protocolo real (mensaje al host), como hará la app.
  await win.webContents.executeJavaScript(
    `window.postMessage({type:'volume', value:0.25}, '*'); true`
  )
  await new Promise((r) => setTimeout(r, 900))
  const after = await win.webContents.executeJavaScript(probe)
  console.log('\n=== tras pedir volumen 0.25 ===')
  console.log(JSON.stringify({ volume: after.volume, muted: after.muted, audioBytes: after.audioBytes }, null, 2))

  // Silencia por el mismo protocolo
  await win.webContents.executeJavaScript(
    `window.postMessage({type:'muted', value:true}, '*'); true`
  )
  await new Promise((r) => setTimeout(r, 600))
  const muted = await win.webContents.executeJavaScript(probe)
  console.log('\n=== tras pedir silencio ===')
  console.log(JSON.stringify({ muted: muted.muted, volume: muted.volume }, null, 2))

  console.log('\n=== veredicto ===')
  const ok = before.found && !before.paused && before.readyState >= 2
  console.log('la media se reproduce:', ok ? 'SÍ' : 'NO', `(paused=${before.paused} readyState=${before.readyState})`)
  console.log('silencio por defecto:', before.muted ? 'SÍ (problema)' : 'no')
  console.log('audio decodificándose:', before.audioBytes > 0 ? `SÍ (${before.audioBytes} bytes)` : 'no')
  console.log('el volumen se aplica:', after.volume === 0.25 ? 'SÍ' : 'NO')
  console.log('el silencio se aplica:', muted.muted ? 'SÍ' : 'NO')

  server.stop()
  app.exit(0)
}

app.whenReady().then(() => main().catch((e) => { console.error(e); app.exit(1) }))
