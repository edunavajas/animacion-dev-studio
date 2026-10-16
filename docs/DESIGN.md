# Diseño

## Dos direcciones, y la que se eligió

Antes de implementar la interfaz se plantearon dos direcciones y se eligió una.

### A · «Mesa de trabajo oscura» (descartada)

Fondo casi negro, panel de preview a sangre, acento cian, todo con bordes finos y
tipografía pequeña. Es lo que hace por defecto casi cualquier herramienta de vídeo.

**Por qué se descartó:** reproduce el *look* de una herramienta profesional, pero
la usuaria (editora, no técnica) abre esta app cinco minutos para cambiar un texto.
Un entorno oscuro tipo suite de edición subraya "esto es un programa complicado" y
además choca con el mood de referencia. Es, literalmente, la dirección que habría
salido sola.

### B · «Superficie clara y aireada» (elegida)

Fondo gris-lavanda muy claro (`#f2f2f8`), un panel blanco grande con radio generoso
(26 px), una paleta contenida con un único acento índigo, mucho aire y **una sola
acción primaria por pantalla**.

**Por qué:** es el mood de `reference-style.png`, y encaja con el uso real: un
formulario con la preview al lado, no un panel de control. La app parece un
formulario bien hecho, no un editor. La transparencia se ve sobre cuadros neutros,
que es lo que hace falta para confiar en el alpha.

Se mantiene también como tema oscuro (mismos tokens, invertidos) porque el sistema
del usuario manda.

## Referencias y qué se tomó de cada una

De [`gztchan/awesome-design`](https://github.com/gztchan/awesome-design), que es un
directorio: dentro de *Toolkit* están Figma, Sketch y Framer X. Se eligieron esos
tres como referencia de **herramientas creativas de escritorio**.

| Referencia | Qué se tomó (principio, no copia) |
|---|---|
| **Figma** | El artefacto (la composición) es el protagonista; el panel de edición es una banda fina y predecible. Los estados vacíos *enseñan* en vez de quedarse en blanco. |
| **Sketch** | Un inspector a la derecha, tranquilo y escaneable; jerarquía por peso y tinta, no por saltos de tamaño. El acento se reserva para estado (selección, foco). |
| **Framer X** | La preview siempre visible y los paneles agrupados enseñan el modelo. La edición es inmediata y no destructiva. |

## Reglas anti-«hecho por IA» aplicadas

Tomadas de `taste-skill` (su método anti-genérico) y de la lista de *tells*:

- **Sin** pastillas/insignias decorativas, ni chips «Nuevo/Pro/Beta».
- **Sin** degradados morados, sin *glassmorphism* generalizado, sin brillos, sin
  emojis como iconos.
- **Sin** tarjetas dentro de tarjetas ni sombras pesadas. Las superficies se
  separan por **escalón de tono**; la sombra queda para flotantes reales (menú,
  diálogo).
- **Sin** texto de relleno. El microcopy es concreto: «Elige una carpeta de salida
  para poder exportar», «Se guardará en …».
- **Un solo juego de iconos**: Lucide, un único grosor (1.75).
- Una sola familia tipográfica (Inter, variable, autoalojada) con dos pesos.
- Movimiento **con propósito** (120–220 ms, *easings* suaves) y respeto de
  `prefers-reduced-motion`.

> Nota de honestidad: el índigo está en la lista de colores «delator» de
> `taste-skill`… cuando aparece en **degradados** de héroe. Aquí es el color de
> marca del canal, se usa plano y ocupa menos del 5 % de la pantalla (acción
> primaria, selección, foco). El propio `taste-skill` contempla esa excepción.

## Tokens

Definidos en `src/renderer/src/app.css`, en `:root`, con el tema oscuro por
`prefers-color-scheme`.

| Grupo | Valores |
|---|---|
| Superficies | `--bg #f2f2f8`, `--surface #ffffff`, `--surface-sunken #ececf4`, `--border #e3e3ed` |
| Tinta | `--ink #1b1b29` (15.6:1), `--muted #55556e` (6.6:1), `--tertiary #6e6e86` (4.6:1) |
| Acento | `--accent #5646e0` (6.3:1 sobre blanco), `--accent-tint #eae6fb` |
| Estados | éxito `#1b6e52`/`#ddf3ea`, aviso `#8a5a00`/`#fbf1d4`, error `#a13361`/`#fbe7ee` |
| Radios | 4 / 8 / 12 / 18 / 26 / full — una escala, no un valor único en todo |
| Espaciado | base 4: 4, 8, 12, 16, 24, 32, 48, 64 |
| Tipografía | 11, 12, 13, 14, 16, 19, 24, 32 px (saltos claros, sin nueve tamaños casi iguales) |
| Movimiento | 120 / 160 / 220 ms · `cubic-bezier(0.22, 1, 0.36, 1)` |
| Velo de modales | `--scrim` y `--overlay-surface` cambian por tema: en oscuro el velo oscurece poco, así que el diálogo sube un escalón de tono |

Tipografía: **Inter** variable (subconjunto latino, 47 KB), autoalojada en
`src/renderer/src/assets/fonts/`. Sin CDN: la app es offline.

## Auditoría de accesibilidad

Contra las reglas de `web-design-guidelines` (Vercel):

- `svelte-check`: **0 errores, 0 avisos**.
- Foco visible siempre (`:focus-visible`), nunca se elimina sin reemplazo.
- Todos los controles tienen etiqueta; los botones de solo icono tienen
  `aria-label`.
- Contraste AA en todos los pares de texto (ratios en la tabla de arriba).
- `prefers-reduced-motion` respetado.
- Atajos: `Cmd/Ctrl+E` exporta, `Espacio` reproduce o pausa.
- Estados de carga, error y vacío con texto; los avisos usan `aria-live="polite"`.

## Cómo revisar el diseño

```bash
npm run build
STUDIO_THEME=light npx electron . --screenshot=/tmp/ui.png   # captura la ventana
STUDIO_SHOT_EXPORT=1 npx electron . --screenshot=/tmp/exp.png # …con el diálogo abierto
```

Capturas de referencia: [`preview-example.png`](preview-example.png),
[`preview-library.png`](preview-library.png), [`preview-export.png`](preview-export.png).
