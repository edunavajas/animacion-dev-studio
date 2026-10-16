# Arquitectura

## Resumen

Una app **Electron** con el proceso principal en Node y la interfaz en Svelte 5.
El render no se reimplementa: se delega en la **CLI de HyperFrames**, que se
ejecuta como proceso hijo usando el propio Node de Electron.

```
┌─────────────────────────── Electron ───────────────────────────┐
│                                                                │
│  main (Node)                        renderer (Chromium)        │
│  ├─ biblioteca (userData)           ├─ Svelte 5 + Vite         │
│  ├─ validación de plantillas        ├─ UI (tokens propios)      │
│  ├─ RenderManager (cola)            └─ <iframe> de la preview   │
│  ├─ PreviewServer (HTTP local)                                  │
│  └─ protocolo studio:// (ficheros)                              │
│                                                                │
└───────────┬─────────────────────────────┬──────────────────────┘
            │ spawn (ELECTRON_RUN_AS_NODE)│ HTTP 127.0.0.1
            ▼                             ▼
   hyperframes CLI                  PreviewServer sirve
   + chrome-headless-shell          la composición con
   + ffmpeg / ffprobe               window.__hfVariables
   (todo empaquetado)               + el runtime real
```

## Decisión de stack

Ver [`PHASE0-SPIKE.md`](PHASE0-SPIKE.md). En corto:

El render **exige** `chrome-headless-shell` (~190 MB). Ese coste se paga con
cualquier shell. Tauri *añadiría* además el webview del sistema como segundo motor
(WKWebView en Mac, WebView2 en Windows), con dos previews distintas y ninguna
igual al render. Electron usa **un solo Chromium** para interfaz y preview en
ambas plataformas, así que el instalador sale más grande pero coherente.

## Procesos y responsabilidades

| Módulo | Responsabilidad |
|---|---|
| `src/main/index.ts` | Arranque, ventana, una sola instancia, protocolo `studio://`, menú, `--diagnose`. |
| `src/main/ipc.ts` | Contrato con el renderer (todo pasa por aquí). |
| `src/preload/index.ts` | `contextBridge`: expone `window.api`, nada más. |
| `src/main/library.ts` | Biblioteca local: importar (carpeta o `.zip`), listar, borrar a la papelera, miniaturas. |
| `src/main/manifest.ts` | Esquema `template.json` v1 y correspondencia con `data-composition-variables`. |
| `src/main/render.ts` | Cola de exportación, sidecar, progreso, cancelación, media. |
| `src/main/previewServer.ts` | Servidor HTTP local de la vista previa. |
| `src/main/sidecars.ts` | Localiza navegador/ffmpeg/CLI y monta el entorno. |
| `src/main/logs.ts` | Registro rotado e informe de error copiable. |
| `src/renderer/**` | Interfaz Svelte 5 y sistema de diseño. |

## Cómo la vista previa coincide con el render

Es la parte delicada. HyperFrames expone su **runtime real** como un bundle IIFE
(`hyperframe-runtime.js`, ~512 KB, Apache-2.0) que se puede cargar con
`<script src>`. Ese runtime:

- define `window.__hyperframes` (con `getVariables()`),
- aplica las variables como custom properties `--{id}` en el CSS,
- resuelve los bindings declarativos `data-var-text` y `data-var-src`,
- monta el motor de timing de clips (`data-start` / `data-duration`),
- expone un transporte en `window.__player` (`play`, `pause`, `seek`, `getTime`,
  `getDuration`, `isPlaying`).

El **motor de render** inyecta los valores así:

```js
page.evaluateOnNewDocument((json) => { window.__hfVariables = JSON.parse(json) }, variablesJson)
```

El **servidor de preview** hace exactamente lo mismo, en el HTML servido:

```html
<script data-hf-preview-variables>window.__hfVariables={"subs":"55 K"};</script>
<script src="/runtime.js"></script>
```

Mismo runtime, mismo override, misma composición ⇒ la preview no es una
aproximación: es el mismo motor. La interfaz embebe ese origen en un `<iframe>`, y
se escala a mano (`translate` + `scale`) porque centrar un hijo mayor que su
contenedor no es fiable en CSS.

> Se probó primero con el elemento `<hyperframes-player>` del propio paquete
> (107 KB). Se descartó: usa shadow DOM, pinta un fondo negro propio y su puerta de
> «cargando recursos» no expone eventos utilizables. Controlar el runtime
> directamente da lo mismo con menos opacidad.

## Cadena de exportación

1. Se copia la plantilla a una carpeta de trabajo (`temp/render-<uuid>`).
2. La media elegida se copia a `media/` **dentro** de esa copia, y se pasa como
   ruta relativa (`media/avatar.png`) — el contrato documentado de HyperFrames.
3. Se escribe `studio-variables.json` (objeto por `id`) y se lanza:
   ```
   hyperframes render <work> --format mov --quality looks --workers auto \
     --frames-cache-dir <userData>/frames-cache \
     --variables-file <work>/studio-variables.json --strict-variables -o <salida>
   ```
   `--low-memory-mode` se añade si el equipo tiene ≤8 GB.
4. El progreso se lee de las líneas `@hf-progress {json}` de la CLI y se traduce a
   fases humanas.
5. Cancelar mata **el árbol** de procesos (`taskkill /T` en Windows, grupo de
   procesos en Unix) y borra la carpeta de trabajo.
6. La carpeta de trabajo se limpia también al arrancar la app (restos de un cierre
   sucio).

## Robustez

- **Una exportación a la vez**; el resto esperan en cola.
- La UI se actualiza por eventos; nada bloquea el hilo de la interfaz.
- **Registro rotado** (1 MB × 3) e **informe de error copiable** con versiones,
  estado de componentes y últimas líneas.
- Errores traducidos: disco lleno, permisos, `ENOENT`, `EACCES`, fallo de
  `--strict-variables`…
- Los temporales viven en la carpeta temporal del sistema y se limpian en cada
  arranque y al salir.
- El nombre de la app, la carpeta de datos y la biblioteca son del usuario del SO
  (sin rutas asumidas).

## Seguridad

- `contextIsolation: true`, `nodeIntegration: false`, `webSecurity` activo.
- La ventana **no navega** fuera del contenido propio; los enlaces externos se
  abren en el navegador del sistema.
- `window.open` denegado.
- El servidor de preview escucha solo en `127.0.0.1`, con token, y no permite
  salir de la carpeta de la plantilla (se comprueba el prefijo de la ruta).
- Los ficheros locales se sirven por un protocolo propio (`studio://`) en vez de
  exponer `file://` al renderer.
