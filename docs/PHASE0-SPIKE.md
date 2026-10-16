# Fase 0 · Spikes — Informe

> Objetivo: fijar el stack con datos, no con intuiciones. Todo lo de abajo está
> verificado en esta máquina (macOS 15, arm64, Node 22.17.1, hyperframes 0.8.164)
> salvo lo marcado como **NO verificado**.

## (a) Fidelidad de preview: webview del sistema vs Chromium

**Hallazgo que reordena la decisión.** HyperFrames no tiene un "runtime de
render" propietario que haya que reproducir: expone su **runtime real** como
bundles IIFE cargables con `<script src>`:

| Bundle | Ruta en el paquete | Tamaño |
|---|---|---|
| Runtime de composición | `dist/hyperframe-runtime.js` | 524 335 B |
| Elemento `<hyperframes-player>` | `dist/hyperframes-player.global.js` | 109 269 B |

El runtime define `window.__hyperframes` (con `getVariables()`), `window.__timelines`,
el motor de timing de clips (`data-start`/`data-duration`), y los bindings
declarativos `data-var-text` / `data-var-src`.

**Cómo el render inyecta las variables** (`chunk-A356JY2J.js:5432`):

```js
await page.evaluateOnNewDocument((json)=>{ try{ window.__hfVariables=JSON.parse(json); }catch{} }, variablesJson);
```

**Cómo el Studio inyecta las variables** (`chunk-CXVBPW5F.js`):

```js
const tag = `<script data-hf-preview-variables>window.__hfVariables=${json};</script>`;
```

Es **el mismo mecanismo**. Por tanto, si servimos la composición con
`window.__hfVariables` y el runtime real, la preview usa exactamente el mismo
motor que el render.

**Prueba ejecutada** (spike, `chrome-headless-shell --dump-dom` sobre una
composición con `data-var-text`):

```html
<h1 class="clip" data-var-text="title"
    style="color: rgb(255,0,0); visibility: visible; position: absolute;">HOLA MUNDO</h1>
```

El runtime leyó `window.__hfVariables`, aplicó `data-var-text`, ejecutó el motor
de visibilidad de clips y la variable `color` llegó al CSS. **Preview ≡ motor de render.**

**Riesgo Tauri (por qué se descarta):** el runtime apunta a Chromium (lee
`iframe.contentDocument` para inyectar; misma familia que `chrome-headless-shell`).
Tauri usaría WKWebView en mi Mac y WebView2 en el Windows de la editora → **dos
motores distintos**, dos previews distintas, y ninguno es el del render. Bajo
Electron, UI y preview son **un solo Chromium** en ambas plataformas.

## (b) Tamaño real del instalador (los sidecars mandan)

Medido en `~/.cache/hyperframes/` y `node_modules/`:

| Componente | Tamaño |
|---|---|
| `chrome-headless-shell` (Chrome-for-Testing 152.0.7977.30) | **194 MB** (binario 160 MB) |
| `hyperframes` (dist) | 22 MB |
| deps de `hyperframes` (incluye `sharp`, `esbuild` nativos) | ~95 MB |
| ffmpeg + ffprobe estáticos | ~70 MB |
| Electron runtime | ~200 MB |
| **Total desempaquetado estimado** | **~580 MB** |

Cifra honesta: **el instalador supera con holgura los 250 MB**, y el motivo son
los sidecars, no el shell. Tauri "ahorraría" ~200 MB de Electron pero **añade**
el webview del sistema como segundo motor y no elimina los 194 MB de Chromium.
No hay ganancia real → **Electron**.

## (c) Render MOV con alpha desde el sidecar empaquetado (Mac)

Ejecutado con la CLI real:

```
hyperframes render --format mov -o out.mov        # ProRes 4444, alpha fijo
```

Verificación con `ffprobe`:

```
MOV : codec_name=prores  profile=4444  pix_fmt=yuva444p12le   ← plano alfa presente
```

- 1 s @1920×1080 → **1.2 MB**, esquina decodificada `0000 0000` (transparente).
- **No existen** flags `--pixel-format` ni `--prores-profile`: MOV siempre usa
  ProRes 4444 con alpha. No hay que configurar códec.
- Matiz importante: **WebM/MOV solo llevan alpha si la composición lo "necesita"**.
  Una composición opaca renderizada a webm sale `yuv420p` sin `ALPHA_MODE`.
  La app no puede forzar alpha por flag: hay que autorizar contenido transparente.
- Límite: `--resolution 4k` **no** combina con mov/webm (la ruta de supersampling
  no tiene canal alfa).

## (d) Arranque en frío

Pendiente de medir sobre el binario Electron ya construido (Fase 3). Objetivo
del brief: **<2 s**. Se medirá con `scripts/bench-startup.mjs` y se reportará.

## Adquisición del navegador (offline — crítico)

- El paquete npm **no** trae navegador. Se descarga **en el primer `render`**
  (no en install, no en `doctor`) a
  `~/.cache/hyperframes/chrome/chrome-headless-shell/<plataforma>-<build>/`.
- Descarga desde `storage.googleapis.com/chrome-for-testing-public`.
- Comando explícito: `hyperframes browser ensure`. Para fijar el binario:
  **env `HYPERFRAMES_BROWSER_PATH`** (o `PRODUCER_HEADLESS_SHELL_PATH`).
  No hay flag `--browser` en `render`.
- ffmpeg/ffprobe: detectados del sistema; override con
  `HYPERFRAMES_FFMPEG_PATH` / `HYPERFRAMES_FFPROBE_PATH`.

**Consecuencia:** para funcionar offline y sin nada instalado en el PC de la
editora, el instalador **debe** incluir `chrome-headless-shell` + ffmpeg/ffprobe
y apuntar los env vars a ellos. Lo hace `scripts/fetch-sidecars.mjs`.

> Trampa detectada en el spike: el runtime espera 45 s si la composición no
> registra un timeline en `window.__timelines`. Las plantillas deben registrar
> un timeline (o marcar el host con `data-no-timeline`). Se respeta en las 2
> plantillas de ejemplo.

## Decisión final

| Criterio | Tauri 2 | **Electron** |
|---|---|---|
| Chromium del render incluido | Sí (añadido, 194 MB) | Sí (familia compartida con UI) |
| Motores web en la app | **2** (sistema + Chromium) | **1** (Chromium) |
| Preview ≡ render | Riesgo alto (WebKit/WebView2) | Alta (mismo runtime + familia Chromium) |
| Preview idéntica Mac↔Windows | No (WKWebView ≠ WebView2) | Sí |
| Ahorro de tamaño real | ~0 (los sidecars mandan) | — |
| CI Windows sin Mac local | Complejo (Rust cross) | Probado (`electron-builder`) |

**Electron.** Instalador grande, sí, pero es el precio del navegador del render,
que hay que pagar con cualquier shell.

## NO verificado (honestidad)

- Fidelidad pixel a pixel `chrome-headless-shell` vs Chromium de Electron
  (misma familia; se asume equivalente, no se ha diff-eado).
- Prueba en Windows 11 real y en Premiere (Fase 3, requiere VM/máquina).
- Descarga real del navegador (ya estaba en caché); tamaño/tiempo provienen del
  código de `@puppeteer/browsers`, no de una descarga observada.
