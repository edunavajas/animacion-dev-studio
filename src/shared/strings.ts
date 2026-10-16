/**
 * Todos los textos visibles de la app, en español.
 * Preparado para i18n: basta con añadir `en.ts` con la misma forma y un selector.
 * Los textos del proceso principal y del renderer salen de aquí para no duplicar.
 */
export const strings = {
  appName: 'animacion-dev Studio',
  tagline: 'Personaliza tus animaciones y expórtalas listas para el vídeo',

  common: {
    cancel: 'Cancelar',
    close: 'Cerrar',
    retry: 'Reintentar',
    delete: 'Eliminar',
    replace: 'Reemplazar',
    accept: 'Aceptar',
    back: 'Volver',
    copy: 'Copiar',
    copied: 'Copiado',
    loading: 'Cargando…',
    reset: 'Restablecer valores',
    showInFolder: 'Mostrar en carpeta',
    open: 'Abrir',
    of: 'de'
  },

  library: {
    title: 'Tus plantillas',
    empty: {
      title: 'Arrastra aquí una plantilla',
      body: 'Suelta la carpeta que te pasaron (o un .zip). Aparecerá en esta biblioteca.',
      hint: 'También puedes usar «Añadir plantilla…»'
    },
    addTemplate: 'Añadir plantilla…',
    search: 'Buscar plantillas…',
    noResults: 'Ninguna plantilla coincide con la búsqueda.',
    importSuccess: (name: string) => `«${name}» se añadió a la biblioteca.`,
    dropActive: 'Suelta para añadir',
    context: {
      showInFolder: 'Mostrar en carpeta',
      delete: 'Eliminar plantilla'
    },
    confirmDelete: {
      title: (name: string) => `¿Eliminar «${name}»?`,
      body: 'Se quitará de la biblioteca. El archivo original no se toca.',
      confirm: 'Eliminar'
    },
    conflict: {
      title: 'Ya tienes una plantilla con este identificador',
      body: (existing: string, incoming: string) =>
        `Instalada: ${existing}. La que traes: ${incoming}.`,
      keep: 'Conservar la instalada',
      replace: 'Reemplazar por la nueva'
    }
  },

  template: {
    duration: 'Duración',
    resolution: 'Resolución',
    export: 'Exportar',
    play: 'Reproducir',
    pause: 'Pausar',
    restart: 'Reiniciar',
    loop: 'Repetir',
    background: 'Fondo',
    bgChecker: 'Cuadros',
    bgLight: 'Claro',
    bgDark: 'Oscuro',
    fieldsTitle: 'Personaliza',
    noFields: 'Esta plantilla no tiene campos que personalizar.',
    previewLoading: 'Preparando la vista previa…',
    previewError: 'No se pudo cargar la vista previa.',
    frame: (s: number, total: number) => `${s.toFixed(1)} s / ${total.toFixed(1)} s`
  },

  fields: {
    chooseFile: 'Elegir archivo…',
    changeFile: 'Cambiar archivo…',
    clearFile: 'Quitar',
    noFile: 'Ningún archivo',
    fileTooBig: (mb: number) => `El archivo supera el máximo de ${mb} MB.`,
    badExtension: (allowed: string) => `Formato no admitido. Usa: ${allowed}.`,
    tooLong: (n: number) => `Máximo ${n} caracteres.`,
    required: 'Este campo no puede quedar vacío.',
    imagePreviewAlt: 'Vista previa de la imagen elegida'
  },

  export: {
    title: 'Exportar animación',
    fileName: 'Nombre del archivo',
    outputFolder: 'Carpeta de salida',
    chooseFolder: 'Elegir carpeta…',
    format: 'Formato',
    presets: 'Qué necesitas',
    advanced: 'Opciones avanzadas',
    quality: 'Calidad',
    qualityDraft: 'Rápida (borrador)',
    qualityLooks: 'Normal',
    qualityDelivery: 'Máxima',
    start: 'Exportar',
    queue: 'Cola de exportaciones',
    emptyQueue: 'No hay exportaciones en curso.',
    progress: 'Exportando…',
    finishing: 'Terminando…',
    done: 'Listo',
    failed: 'Error',
    cancelled: 'Cancelada',
    cancel: 'Cancelar exportación',
    willSaveIn: (dir: string) => `Se guardará en ${dir}`,
    transparentNote: 'Con fondo transparente, ideal para poner encima de tu vídeo.',
    noAlphaNote: 'Este formato no conserva la transparencia.',
    doneToast: (name: string) => `«${name}» exportado.`,
    openFolder: 'Mostrar en carpeta',
    formats: {
      mov: 'MOV · ProRes 4444 (con transparencia) — para Premiere',
      webm: 'WebM · VP9 (con transparencia) — más ligero',
      'png-sequence': 'Secuencia PNG (con transparencia) — para After Effects',
      mp4: 'MP4 (sin transparencia)'
    } as Record<string, string>,
    presetList: {
      premiere: 'Para Premiere (recomendado)',
      light: 'Archivo ligero',
      ae: 'Para After Effects'
    }
  },

  errors: {
    templateNotFound: 'No se encontró la plantilla.',
    manifestMissing: 'Falta el archivo template.json en la carpeta.',
    manifestInvalid: 'El template.json tiene errores.',
    indexMissing: 'Falta el archivo index.html en la carpeta.',
    noVariables: 'El index.html no declara data-composition-variables.',
    fieldNotDeclared: (id: string) =>
      `El campo «${id}» no está declarado en el index.html. No se aplicará.`,
    declaredNotFound: (id: string) =>
      `La variable «${id}» del index.html no tiene campo en template.json.`,
    invalidJson: 'template.json no es un JSON válido.',
    unsupportedSchema: (v: unknown) => `Versión de esquema no soportada: ${String(v)}.`,
    missingField: (f: string) => `Falta el campo obligatorio «${f}».`,
    badFieldType: (id: string, t: string) => `El campo «${id}» tiene un tipo no válido: ${t}.`,
    duplicateFieldId: (id: string) => `El id de campo «${id}» está repetido.`,
    duplicateVariable: (id: string) => `La variable «${id}» está declarada dos veces.`,
    renderFailed: 'La exportación falló.',
    renderCancelled: 'Exportación cancelada.',
    diskFull: 'No queda espacio en disco en la carpeta de salida.',
    pathProblem:
      'No se pudo escribir en esa carpeta. Comprueba que existe y que tienes permiso.',
    antivirus:
      'Parece que un antivirus ha bloqueado un componente de la app. Añádela a la lista de excepciones.',
    lowRam: 'Poca memoria disponible. Se usará el modo de bajo consumo.',
    corrupt: 'La plantilla parece dañada y no se pudo leer.',
    missingAsset: (f: string) => `Falta un recurso de la plantilla: ${f}.`,
    generic: 'Algo no salió como esperábamos.',
    copyReport: 'Copiar informe de error'
  },

  diagnostics: {
    title: 'Informe de error',
    body: 'Copia este informe y mándaselo a quien te preparó las plantillas.',
    sidecarsTitle: 'Componentes',
    ok: 'Correcto',
    missing: 'No encontrado'
  },

  shortcuts: {
    export: 'Exportar',
    playPause: 'Reproducir o pausar',
    back: 'Volver a la biblioteca'
  }
} as const

export type Strings = typeof strings
