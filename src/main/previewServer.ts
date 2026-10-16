import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { resourcesDir } from './paths'
import { log } from './logs'
import type { FieldValues, PreviewBackground, TemplateManifest } from '../shared/types'
import { buildMediaMap } from './render'

/**
 * Servidor de vista previa.
 *
 * Sirve, en un MISMO origen:
 *  - `/player.js`      → el elemento <hyperframes-player> real (Apache-2.0).
 *  - `/runtime.js`     → el runtime real de hyperframes.
 *  - `/composition/*`  → los ficheros de la plantilla; los .html se sirven con
 *                        `window.__hfVariables` inyectado IGUAL que hace el
 *                        motor de render, así la preview coincide con el render.
 *  - `/media/*`        → la media elegida por el usuario, mapeada a su ruta real.
 *
 * El renderer embebe este origen en un <iframe> y habla por postMessage.
 */
export interface PreviewState {
  templateDir: string
  manifest: TemplateManifest
  values: FieldValues
  background: PreviewBackground
}

interface Session {
  templateUrl: string
  templateDir: string
  manifest: TemplateManifest
  values: FieldValues
  background: PreviewBackground
  media: Map<string, string>
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.m4v': 'video/x-m4v',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4'
}

export function mimeFor(p: string): string {
  return MIME[extname(p).toLowerCase()] ?? 'application/octet-stream'
}

/** Inyecta variables + runtime al inicio del <head>, igual que el motor de render. */
export function injectPreview(html: string, values: Record<string, unknown>): string {
  const json = JSON.stringify(values).replace(/</g, '\\u003c')
  const tags =
    `<script data-hf-preview-variables>window.__hfVariables=${json};</script>` +
    `<script src="/runtime.js"></script>`
  const headOpen = html.search(/<head[^>]*>/i)
  if (headOpen !== -1) {
    const end = html.indexOf('>', headOpen)
    return `${html.slice(0, end + 1)}\n${tags}${html.slice(end + 1)}`
  }
  const htmlOpen = html.search(/<html[^>]*>/i)
  if (htmlOpen !== -1) {
    const end = html.indexOf('>', htmlOpen)
    return `${html.slice(0, end + 1)}<head>${tags}</head>${html.slice(end + 1)}`
  }
  return tags + html
}

/** Página anfitriona: embebe la composición y la controla con el transporte real del runtime. */
export function hostPage(compositionSrc: string, width: number, height: number): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<style>
  html, body { margin: 0; height: 100%; background: transparent; overflow: hidden; }
  #stage { position: fixed; inset: 0; display: grid; place-items: center; }
  #stage.checker { background-color: #ffffff;
    background-image:
      linear-gradient(45deg, #E7E7EF 25%, transparent 25%),
      linear-gradient(-45deg, #E7E7EF 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, #E7E7EF 75%),
      linear-gradient(-45deg, transparent 75%, #E7E7EF 75%);
    background-size: 24px 24px;
    background-position: 0 0, 0 12px, 12px -12px, -12px 0; }
  #stage.light { background: #FFFFFF; }
  #stage.dark { background: #14141C; }
  /* Posicionamiento explícito: el contenedor es mayor que el hueco, así que
     no se puede confiar en el centrado del grid (los hijos que desbordan se
     alinean al inicio). Se centra y se escala a mano. */
  #wrapper { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
  #frame { border: 0; display: block; background: transparent; }
</style>
</head>
<body>
  <div id="stage" class="checker">
    <div id="wrapper">
      <iframe id="frame" title="Composición" scrolling="no" allow="autoplay"
        width="${width}" height="${height}" src="${compositionSrc}"></iframe>
    </div>
  </div>
  <script>
    (function () {
      var W = ${width}, H = ${height};
      var stage = document.getElementById('stage');
      var wrapper = document.getElementById('wrapper');
      var frame = document.getElementById('frame');
      var src = ${JSON.stringify(compositionSrc)};

      function post(msg) { try { parent.postMessage(msg, '*'); } catch (e) {} }
      function player() {
        try { var c = frame.contentWindow; return (c && c.__player) || null; } catch (e) { return null; }
      }
      // Escala la composición (W×H) al hueco disponible y la centra, sin deformar.
      function fit() {
        var r = stage.getBoundingClientRect();
        var s = Math.min(r.width / W, r.height / H);
        var x = (r.width - W * s) / 2;
        var y = (r.height - H * s) / 2;
        wrapper.style.width = W + 'px';
        wrapper.style.height = H + 'px';
        wrapper.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + s + ')';
      }
      fit();
      window.addEventListener('resize', fit);

      var announced = false;
      function announce() {
        if (announced) return;
        announced = true;
        post({ type: 'ready' });
        var p = player();
        if (p) { try { p.play(); } catch (e) {} }
      }
      setInterval(function () { if (player()) announce(); }, 40);
      // Si el runtime no aparece, no se deja el aviso de carga colgado.
      setTimeout(announce, 8000);

      setInterval(function () {
        var p = player();
        if (!p) return;
        var t = 0, d = 0, playing = false;
        try { t = p.getTime ? p.getTime() : 0; } catch (e) {}
        try { d = p.getDuration ? p.getDuration() : 0; } catch (e) {}
        try { playing = p.isPlaying ? !!p.isPlaying() : false; } catch (e) {}
        post({ type: 'time', t: t, duration: d, paused: !playing });
      }, 100);

      window.addEventListener('message', function (ev) {
        var d = ev.data || {};
        if (d.type === 'reload') { frame.src = src + '?__v=' + Date.now(); announced = false; return; }
        if (d.type === 'background') {
          stage.className = d.kind === 'light' ? 'light' : d.kind === 'dark' ? 'dark' : 'checker';
          return;
        }
        var p = player();
        if (!p) return;
        try {
          if (d.type === 'play') p.play();
          else if (d.type === 'pause') p.pause();
          else if (d.type === 'seek') p.seek(d.t);
        } catch (e) {}
      });
    })();
  </script>
</body>
</html>`
}

function safeJoin(root: string, urlPath: string): string | null {
  const decoded = decodeURIComponent(urlPath.split('?')[0])
  const target = resolve(join(root, normalize(decoded)))
  const rootResolved = resolve(root)
  if (target !== rootResolved && !target.startsWith(rootResolved + sep)) return null
  return target
}

export class PreviewServer {
  private server: Server | null = null
  private port = 0
  private session: Session | null = null
  private token = Math.random().toString(36).slice(2, 10)

  get url(): string {
    return `http://127.0.0.1:${this.port}/?t=${this.token}`
  }

  async start(): Promise<string> {
    if (this.server) return this.url
    this.server = createServer((req, res) => {
      void this.handle(req, res)
    })
    await new Promise<void>((res) => this.server!.listen(0, '127.0.0.1', () => res()))
    const addr = this.server.address()
    this.port = typeof addr === 'object' && addr ? addr.port : 0
    log.info('servidor de preview escuchando', { port: this.port })
    return this.url
  }

  stop(): void {
    this.server?.close()
    this.server = null
  }

  setSession(state: PreviewState): void {
    this.session = {
      templateUrl: 'index.html',
      templateDir: state.templateDir,
      manifest: state.manifest,
      values: state.values,
      background: state.background,
      media: new Map(
        buildMediaMap(state.manifest, state.values).map((m) => [m.relative, m.absolute])
      )
    }
  }

  clearSession(): void {
    this.session = null
  }

  /** Origen del iframe para el renderer (incluye token y cache-buster). */
  frameUrl(): string {
    return `${this.url}&v=${Date.now()}`
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = req.url ?? '/'
    // Normaliza barras repetidas (//ruta) para no fallar por un doble slash.
    const pathOnly = (url.split('?')[0] || '/').replace(/\/{2,}/g, '/')

    if (pathOnly === '/runtime.js') {
      return this.serveFile(res, join(resourcesDir(), 'player', 'hyperframe-runtime.js'))
    }

    if (pathOnly === '/' || pathOnly === '/index.html') {
      const session = this.session
      const src = `/composition/${session?.templateUrl ?? 'index.html'}`
      const width = session?.manifest.width ?? 1920
      const height = session?.manifest.height ?? 1080
      return this.send(res, 200, 'text/html; charset=utf-8', hostPage(src, width, height))
    }

    const session = this.session
    if (!session) return this.send(res, 404, 'text/plain; charset=utf-8', 'sin sesión')

    // Media elegida por el usuario (imagen/vídeo), servida desde su ruta real.
    if (pathOnly.startsWith('/composition/media/')) {
      const rel = decodeURIComponent(pathOnly.slice('/composition/media/'.length))
      const abs = session.media.get(`media/${rel}`)
      if (abs && existsSync(abs)) return this.serveFile(res, abs)
      return this.send(res, 404, 'text/plain; charset=utf-8', 'media no encontrada')
    }

    if (pathOnly.startsWith('/composition/')) {
      const rel = decodeURIComponent(pathOnly.slice('/composition/'.length))
      const abs = safeJoin(session.templateDir, rel)
      if (!abs) return this.send(res, 403, 'text/plain; charset=utf-8', 'ruta no permitida')
      if (!existsSync(abs)) return this.send(res, 404, 'text/plain; charset=utf-8', 'no encontrado')
      if (extname(abs).toLowerCase() === '.html') {
        const raw = await readFile(abs, 'utf8')
        const values = this.buildValues(session)
        return this.send(res, 200, 'text/html; charset=utf-8', injectPreview(raw, values))
      }
      return this.serveFile(res, abs)
    }

    return this.send(res, 404, 'text/plain; charset=utf-8', 'no encontrado')
  }

  private buildValues(session: Session): Record<string, unknown> {
    const mediaByField = new Map(
      buildMediaMap(session.manifest, session.values).map((m) => [m.fieldId, m.relative])
    )
    const values: Record<string, unknown> = {}
    for (const field of session.manifest.fields) {
      if (mediaByField.has(field.id)) {
        values[field.id] = mediaByField.get(field.id)
        continue
      }
      const v = session.values[field.id]
      if (v !== undefined && v !== null && v !== '') values[field.id] = v
    }
    return values
  }

  private send(res: ServerResponse, code: number, type: string, body: string | Buffer): void {
    res.writeHead(code, {
      'content-type': type,
      'cache-control': 'no-store',
      'access-control-allow-origin': '*'
    })
    res.end(body)
  }

  private async serveFile(res: ServerResponse, file: string): Promise<void> {
    try {
      const st = await stat(file)
      if (!st.isFile()) return this.send(res, 404, 'text/plain; charset=utf-8', 'no es un fichero')
      const buf = await readFile(file)
      res.writeHead(200, {
        'content-type': mimeFor(file),
        'content-length': String(buf.length),
        'cache-control': 'no-store',
        'access-control-allow-origin': '*'
      })
      res.end(buf)
    } catch {
      this.send(res, 404, 'text/plain; charset=utf-8', 'no encontrado')
    }
  }
}
