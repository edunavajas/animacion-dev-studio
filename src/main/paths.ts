import { app } from 'electron'
import { join } from 'node:path'

export const isDev = !app.isPackaged

/** Raíz de recursos empaquetados: `resources/` en dev, `process.resourcesPath` al empaquetar. */
export function resourcesDir(): string {
  return isDev ? join(app.getAppPath(), 'resources') : process.resourcesPath
}

/** Biblioteca local de plantillas (datos de usuario del SO). */
export function libraryDir(): string {
  return join(app.getPath('userData'), 'library')
}

/** Carpeta de trabajo temporal para media copiada (imágenes/vídeos elegidos). */
export function workDir(): string {
  return join(app.getPath('temp'), 'animacion-dev-studio')
}

/** Caché de fotogramas extraídos del render (persistente entre exportaciones). */
export function framesCacheDir(): string {
  return join(app.getPath('userData'), 'frames-cache')
}

export function logsDir(): string {
  return join(app.getPath('userData'), 'logs')
}

/** Preferencias (carpeta de salida recordada, valores por plantilla…). */
export function prefsFile(): string {
  return join(app.getPath('userData'), 'prefs.json')
}
