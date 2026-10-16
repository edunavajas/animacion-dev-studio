/** Canalización IPC compartida entre el proceso principal y el preload. */
export const CH = {
  appInfo: 'app:info',
  appQuit: 'app:quit',
  appSetTheme: 'app:setTheme',

  diagnosticsReport: 'diagnostics:report',
  clipboardWrite: 'clipboard:write',

  libraryList: 'library:list',
  libraryImport: 'library:import',
  libraryImportDialog: 'library:importDialog',
  libraryDelete: 'library:delete',
  libraryReveal: 'library:reveal',
  libraryThumbnail: 'library:thumbnail',
  libraryThumbReady: 'library:thumbReady',

  prefsGet: 'prefs:get',
  prefsSet: 'prefs:set',

  valuesGet: 'values:get',
  valuesSet: 'values:set',

  exportChooseFolder: 'export:chooseFolder',
  exportStart: 'export:start',
  exportList: 'export:list',
  exportCancel: 'export:cancel',
  exportOpenFolder: 'export:openFolder',
  exportUpdate: 'export:update',
  exportFinished: 'export:finished',

  previewStart: 'preview:start',
  previewUpdate: 'preview:update',
  previewStop: 'preview:stop'
} as const
