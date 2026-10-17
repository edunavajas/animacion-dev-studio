# Skills y guías de diseño — recopilatorio

Índice para tener a mano **qué usar cuando hay que diseñar algo**. Dos bloques:
las fuentes externas (con enlace **verificado**) y las skills que ya tienes
instaladas (con su ruta local; ninguna declara repositorio de origen, así que no se
le atribuye uno).

---

## 1 · Fuentes externas (enlaces comprobados)

| Guía | Enlace | Para qué sirve de verdad |
|---|---|---|
| **taste-skill** | https://github.com/leonxlnx/taste-skill | Método anti-genérico y la lista de *tells* de UI hecha por IA. Su parte más útil es la de **prohibiciones** |
| **web-design-guidelines** (Vercel) | https://github.com/vercel-labs/agent-skills (→ `skills/web-design-guidelines`) | Checklist **auditable**: foco, contraste AA, formularios, animación, anti-patrones |
| **awesome-design** | https://github.com/gztchan/awesome-design | Directorio de referencias. Ojo: **no** es una galería de productos; dentro de *Toolkit* están Figma, Sketch, Framer X |
| **HyperFrames** | https://github.com/heygen-com/hyperframes | El motor de composiciones de esta app (no es diseño, pero se consulta a menudo) |

> ⚠️ **Aviso de taste-skill sobre sí misma:** dice que **no es para dashboards ni
> UI de aplicación** y recomienda `minimalist-skill` o `soft-skill` para producto.
> Úsala para el listón de calidad y las prohibiciones, **no** para decidir el layout
> del chrome.
>
> ⚠️ **Sobre el color de marca:** taste-skill veta el violeta/índigo… cuando aparece
> en **degradados**. Un acento plano de marca es la excepción que ella misma
> contempla (`--allow palette-purple`). La regla que sí importa: **menos del 5 % de
> la pantalla**.

---

## 2 · Skills instaladas (ruta local, sin upstream declarado)

Ninguna de estas declara su repositorio en el `SKILL.md`. El enlace que aparece en
alguna es un **ejemplo de su contenido**, no su origen. Rutas:

`~/.agents/skills/<nombre>` · `~/.claude/skills/<nombre>` · `~/.config/opencode/skills/<nombre>`

### Decidir la dirección
| Skill | Ruta | Qué aporta |
|---|---|---|
| `design-taste-frontend` | `~/.agents/skills/` | Anti-slop para landings, portfolios y rediseños. Auditoría previa obligatoria |
| `design-taste-frontend-v1` | `~/.agents/skills/` | Versión original, conservada por compatibilidad |
| `hallmark` | `~/.claude/skills/` | Anti-slop para páginas nuevas, auditorías, rediseños y **extraer el diseño de una URL o captura** |
| `high-end-visual-design` | `~/.agents/skills/` | Convierte decisiones difusas en reglas: fuentes, espaciado, sombras, animación |
| `gpt-taste` | `~/.agents/skills/` | Exige aleatoriedad real y estructura AIDA; útil para landings, no para apps |

### Estilos concretos
| Skill | Ruta | Estilo |
|---|---|---|
| `minimalist-ui` | `~/.agents/skills/` | Editorial, monocromo cálido, bento, sin gradientes |
| `industrial-brutalist-ui` | `~/.agents/skills/` | Suizo + terminal militar, retícula rígida |
| `apple-design` | `~/.agents/skills/` | Materiales, springs, gestos, tipografía óptica |

### Construir
| Skill | Ruta | Qué aporta |
|---|---|---|
| `frontend-design` | `~/.agents/skills/` | Componentes y páginas con calidad de producción |
| `image-to-code` | `~/.agents/skills/` | Genera la imagen de diseño primero y luego implementa **contra** ella |
| `imagegen-frontend-web` / `-mobile` | `~/.agents/skills/` | Referencias visuales por sección (web) o por pantalla (móvil) |

### Auditar
| Skill | Ruta | Qué audita |
|---|---|---|
| `accessibility` | `~/.agents/skills/` | **WCAG 2.1** de verdad (no solo lo que pilla `svelte-check`) |
| `web-quality-audit` | `~/.agents/skills/` | Rendimiento, accesibilidad, SEO y buenas prácticas |
| `redesign-existing-projects` | `~/.agents/skills/` | Sube de nivel un proyecto existente sin romperlo |
| `review-animations` | `~/.agents/skills/` | Calidad del movimiento con criterio exigente |

### Movimiento
| Skill | Ruta | Qué aporta |
|---|---|---|
| `animate` | `~/.agents/skills/` | Decide **si** animar, con qué curva y duración |
| `emil-design-eng` | `~/.agents/skills/` | Filosofía de detalle de Emil Kowalski (sin repo verificado) |
| `find-animation-opportunities` | `~/.agents/skills/` | Dónde **falta** animación y qué descartar |
| `animation-vocabulary` | `~/.agents/skills/` | El nombre exacto del efecto que tienes en la cabeza |

### Explorar y decidir
| Skill | Ruta | Qué aporta |
|---|---|---|
| `prototype` | `~/.agents/skills/` | Varias versiones distintas de una pieza, con selector visual |
| `pick-ui-library` | `~/.agents/skills/` | Elegir librería (tablas, gráficas, toasts…) con criterio |

---

## 3 · El prompt

Copia desde aquí. Está pensado para **una tarea de diseño de UI**, no para
marketing.

```text
Vas a diseñar/rediseñar [QUÉ]. Antes de escribir código, sigue este orden y no
te saltes pasos.

1) ENTIENDE
   - Lee el brief y lista las restricciones reales (audiencia, plataforma,
     si es una app de uso diario o una landing, cuánto tiempo pasa el usuario).
   - Si hay una imagen o URL de referencia, LÉELA con la herramienta de imagen y
     escribe el "mood" (superficies, radio, tipografía, paleta, aire). No copies
     el layout; extrae principios.

2) DIRECCIÓN (obligatorio: 2 propuestas, 1 elegida)
   - Propón DOS direcciones visuales distintas y breves.
   - Elige una y justifica por qué encaja con el uso real. Escribe la que
     descartas y por qué: eso evita el autoengaño.

3) REGLAS ANTI-SLOP (veto)
   - Nada de: pastillas/insignias decorativas, chips "Nuevo/Pro/Beta",
     degradados morados, glassmorphism generalizado, glows, emojis como iconos,
     tarjetas dentro de tarjetas, sombras pesadas, bordes de 1px en todo,
     rejillas de 3 tarjetas idénticas, texto de relleno.
   - Un solo set de iconos, a un solo grosor.
   - Una sola familia tipográfica, con 2 pesos como máximo.
   - Un solo acento, y que ocupe menos del 5 % de la pantalla.

4) TOKENS ANTES QUE PANTALLAS
   - Define en :root: color (claro y oscuro), escala tipográfica, escala de
     espaciado, radios, elevación y duraciones/easings (120–200 ms).
   - Separa superficies por ESCALÓN DE TONO, no por bordes ni sombras.
   - Comprueba contraste AA de cada par texto/fondo y anota el ratio.

5) CONSTRUYE
   - Una acción principal por pantalla. Jerarquía clara. Cero jerga.
   - Foco visible siempre. prefers-reduced-motion respetado.
   - Estados vacío, carga y error cuidados (y que el vacío ENSEÑE).
   - Si el proyecto lo permite, usa `frontend-design` para construir y
     `image-to-code` si necesitas una referencia visual previa.

6) AUDITA (no al final del todo: también a mitad)
   - Pasa `accessibility` (WCAG 2.1) y `web-quality-audit`.
   - Revisa el movimiento con `review-animations` si hay animación.
   - Repasa la checklist de web-design-guidelines:
     https://github.com/vercel-labs/agent-skills (skills/web-design-guidelines)
   - Lista los fallos encontrados con su gravedad. Arregla los críticos.

7) MIRA EL RESULTADO DE VERDAD
   - Haz capturas de la interfaz real (no de un mockup) y revísalas.
   - Arregla lo que se vea mal. Repite hasta que aguante una mirada.
   - No digas "está limpio" sin haberlo mirado.

Reglas de honestidad:
   - No inventes enlaces, créditos ni procedencias.
   - Si una guía no aplica a este tipo de producto, dilo y no la fuerces.
   - Si algo del brief es inviable, explica por qué y propón alternativa.
```

---

## 4 · Qué hice en este proyecto (y qué cambiaría)

En `animacion-dev Studio` usé el **contenido** de las tres guías del brief, pero
**no cargué ninguna de las skills instaladas**. Funcionó, pero fue menos eficiente:
tuve que rellenar a mano lo que `design-taste-frontend` o `hallmark` ya traen
empaquetado.

Lo que sí marcó la diferencia, y no viene de ninguna guía: **mirar capturas de la
app real** y corregir. Así aparecieron los fallos que ninguna checklist detecta
(el botón `···` que se cerraba solo, el modal que no se separaba en tema oscuro,
el hijo más grande que su contenedor que no se centra en CSS).

**Para la próxima:** cargar `design-taste-frontend` (o `hallmark`) al empezar,
`accessibility` en la auditoría, y `review-animations` si hay movimiento.
