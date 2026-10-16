# Entrega por fases

Resumen de cada fase: qué se hizo, **qué se probó de verdad**, qué **no** se pudo
probar y qué riesgos quedan abiertos. Nada de «funciona» sin evidencia.

---

## Fase 0 · Spikes — cerrada

**Se hizo.** Cuatro spikes y una decisión de stack con datos:
(a) fidelidad de preview, (b) tamaño del instalador, (c) render MOV alpha desde el
sidecar, (d) arranque en frío.

**Probado de verdad.**

- El render **exige** `chrome-headless-shell` (192 MB) y `ffmpeg`: se midió el
  directorio descargado.
- MOV ProRes 4444 con alpha verificado con `ffprobe`: `profile=4444`,
  `pix_fmt=yuva444p12le`.
- Instalador real construido: **278 MB** (dmg arm64, app 715 MB).
- Arranque del paquete: **391–825 ms** (< 2 s).
- La preview usa el **runtime real** de HyperFrames y el mismo override de
  `window.__hfVariables` que el render (verificado con captura).

**No probado.** Windows de escritorio y Premiere (no hay máquina aquí).

**Decisión.** Electron. Con datos: el coste dominante son los sidecars, que se
pagan igual con cualquier shell; Tauri añadiría además el webview del sistema como
segundo motor.

**Riesgos abiertos.** El Chromium de Electron (v44) no es el mismo build que el
`chrome-headless-shell` (v152). No se ha hecho diff pixel a pixel; sí se ha
comprobado que motor y variables son los mismos.

Detalle completo: [`PHASE0-SPIKE.md`](PHASE0-SPIKE.md).

---

## Fase 1 · Núcleo — cerrada

**Se hizo.** Esquema `template.json` v1 + validación, correspondencia 1:1 con
`data-composition-variables`, biblioteca local, importación por arrastre (carpeta o
`.zip`), miniaturas, cola de exportación con progreso y cancelación, sidecars
empaquetados, y 2 plantillas de ejemplo.

**Probado de verdad.**

- Suite de integración dentro de Electron: **26/26** (biblioteca, validación,
  correspondencia, payload de variables, rechazo de manifiestos rotos, servidor de
  preview y render).
- Exportación real de MOV 1920×1080 ProRes 4444 con alpha.
- La cancelación mata el árbol de procesos y limpia la carpeta de trabajo.

**No probado.** Premiere (no instalado).

**Riesgos abiertos.** El contrato de rutas de media está documentado solo para
rutas **relativas con barras normales**; por eso la app copia la media dentro de la
copia de trabajo y pasa siempre una ruta relativa (`media/<campo>.<ext>`).

---

## Fase 2 · Interfaz — cerrada (con una salvedad)

**Se hizo.** Pantallas de biblioteca y plantilla, preview con transporte y fondo
conmutable, formulario autogenerado, diálogo de exportación con presets y cola,
estados vacío/carga/error, sistema de diseño propio con tema claro y oscuro,
tipografía autoalojada, atajos de teclado.

**Probado de verdad.**

- `svelte-check`: **0 errores, 0 avisos** (incluye reglas de accesibilidad).
- Tres capturas revisadas a ojo: biblioteca, plantilla y exportación.
- Los fallos encontrados **revisando capturas** se corrigieron: el `<iframe>` de la
  preview no se montaba, los proxies de `$state` no cruzaban el IPC, reabrir la
  última plantilla no sembraba los valores por defecto, y las miniaturas no se
  generaban al arrancar.

**No probado.** Que **una persona no técnica** complete «importar → editar →
exportar» sin ayuda. Eso requiere una persona; no se puede simular.

**Riesgos abiertos.** El tamaño de la ventana mínimo (940×620) hace que la columna
de edición y la preview convivan justas en pantallas pequeñas.

**Desviación consciente del documento.** El brief pedía fondo «claro / oscuro /
vídeo de prueba». Se implementaron **claro, oscuro y cuadros** (el de cuadros es el
que de verdad hace falta: es el que deja ver el alfa). No se incluyó un vídeo de
prueba porque obliga a empaquetar un clip de varios MB y no aporta una verificación
que los otros tres fondos no den. Si se quiere, un `--default-background-color` con
un MP4 de 2 s deja el hueco hecho.

Detalle y tokens: [`DESIGN.md`](DESIGN.md).

---

## Fase 3 · Robustez y empaquetado — cerrada en macOS, parcial en Windows

**Se hizo.** Manejo de errores con mensajes humanos, registro rotado e informe
copiable a un clic, limpieza de temporales (también tras cancelación o cierre
sucio), una sola instancia, enlaces externos fuera de la app, `--diagnose`,
instaladores para macOS y Windows, y CI en ambas plataformas.

**Probado de verdad (con evidencia).**

- **macOS, paquete real con entorno vacío** (`env -i PATH=/usr/bin:/bin`): render
  de un MOV ProRes 4444 con alpha usando **solo** sus componentes empaquetados.
  Sin Node, sin Chrome y sin ffmpeg del sistema.
- `--diagnose` del paquete: los cuatro componentes `ok` (navegador `source:
  bundled`).
- **CI verde en los cuatro jobs** (verificación y instaladores × macOS y Windows).
  El job de Windows ejecuta la suite completa (53/53) y construye NSIS + MSI.
- **Instalador de Windows probado de verdad en CI**, no solo construido:
  - Instalación silenciosa (`/S`): la app queda en `LOCALAPPDATA\Programs` y la
    copia instalada pasa `--diagnose` con **4/4 componentes ok**.
  - Actualización con las **mismas banderas que usa la app**
    (`--updated /S --force-run`): el instalador **relanza la app solo**. Es el
    comportamiento que importa: actualizar en Windows no requiere tocar nada.
  - Medido: la instalación silenciosa tarda ~74 s.
- Descarga de la actualización verificada contra la release real: 281 MB con
  progreso, y el `sha256` comparado con el que publica GitHub (aceptada cuando
  coincide, rechazada y borrada cuando se manipula).
- La app arranca, instala los ejemplos la primera vez y genera miniaturas.

**No probado.** Que una persona use la **interfaz** en Windows (la instalación y la
actualización sí están verificadas automáticamente, pero nadie ha hecho clic). Y
Premiere. Tampoco se ha firmado ni notarizado (ver [`SIGNING.md`](SIGNING.md)).

**Riesgos abiertos.**

1. **SmartScreen / Gatekeeper** pararán la primera ejecución hasta que la usuaria
   use «clic derecho → Abrir» / «Más información → Ejecutar de todas formas». Es el
   mayor riesgo de fricción en la entrega.
2. **Antivirus** en Windows puede poner en cuarentena `chrome-headless-shell.exe`
   por ser un navegador embebido. No se ha podido probar.
3. Rutas con **OneDrive** o muy largas en Windows: el código usa las APIs del
   sistema y no asume rutas, pero no se ha probado en ese escenario.
4. El instalador **no se actualiza solo**; hay que reinstalar a mano.
