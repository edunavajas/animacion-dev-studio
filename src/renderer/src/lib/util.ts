import type { LibraryEntry } from '../../../shared/types'

/** URL interna para servir un archivo local (protocolo `studio:` registrado en el proceso principal). */
export function fileUrl(path: string): string {
  return `studio://local/?p=${encodeURIComponent(path)}`
}

export function formatDuration(seconds: number): string {
  return `${seconds.toFixed(seconds % 1 === 0 ? 0 : 1)} s`
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`
}

export function resolutionLabel(entry: LibraryEntry): string {
  const { width, height } = entry.manifest
  return `${width}×${height}`
}

/**
 * Acción: llama a `cb` cuando se pulsa el propio nodo (no sus hijos).
 * Se usa para cerrar overlays al pulsar fuera, sin ensuciar el marcado con
 * manejadores en elementos no interactivos.
 */
export function clickOutside(node: HTMLElement, cb: () => void) {
  const onDown = (e: MouseEvent) => {
    if (e.target === node) cb()
  }
  node.addEventListener('mousedown', onDown)
  return {
    destroy() {
      node.removeEventListener('mousedown', onDown)
    }
  }
}
