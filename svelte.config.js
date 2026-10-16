import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

// No se fuerza `runes: true`: los componentes propios detectan el modo runes
// por su sintaxis, y así las dependencias (p. ej. lucide-svelte) siguen funcionando.
export default {
  preprocess: vitePreprocess()
}
