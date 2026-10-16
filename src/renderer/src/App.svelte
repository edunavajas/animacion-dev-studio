<script lang="ts">
  import { onMount } from 'svelte'
  import { ui } from './lib/state.svelte'
  import Library from './lib/Library.svelte'
  import TemplateView from './lib/TemplateView.svelte'
  import Toasts from './lib/Toasts.svelte'
  import ConflictDialog from './lib/ConflictDialog.svelte'
  import ExportSheet from './lib/ExportSheet.svelte'
  import { Layers, Plus } from 'lucide-svelte'

  let dropDepth = $state(0)

  onMount(() => {
    void ui.init()
  })

  function firstPathFrom(dt: DataTransfer | null): string | null {
    if (!dt) return null
    const items = Array.from(dt.items ?? [])
    for (const item of items) {
      if (item.kind !== 'file') continue
      const file = item.getAsFile()
      if (!file) continue
      try {
        const p = window.api.pathForFile(file)
        if (p) return p
      } catch {
        /* ignora y prueba el siguiente */
      }
    }
    const file = dt.files?.[0]
    if (file) {
      try {
        return window.api.pathForFile(file)
      } catch {
        return null
      }
    }
    return null
  }

  function onDragEnter(e: DragEvent) {
    if (!e.dataTransfer?.types?.includes('Files')) return
    dropDepth++
    ui.dragActive = true
  }
  function onDragLeave() {
    dropDepth = Math.max(0, dropDepth - 1)
    if (dropDepth === 0) ui.dragActive = false
  }
  function onDragOver(e: DragEvent) {
    if (e.dataTransfer?.types?.includes('Files')) e.preventDefault()
  }
  async function onDrop(e: DragEvent) {
    e.preventDefault()
    dropDepth = 0
    ui.dragActive = false
    const path = firstPathFrom(e.dataTransfer)
    if (path) await ui.importPath(path)
  }

  function onKeydown(e: KeyboardEvent) {
    const meta = e.metaKey || e.ctrlKey
    if (meta && e.key.toLowerCase() === 'e') {
      if (ui.selected) {
        e.preventDefault()
        ui.exportSheetOpen = true
      }
    }
    if (e.key === 'Escape') {
      if (ui.exportSheetOpen) ui.exportSheetOpen = false
      else if (ui.conflict) ui.conflict = null
    }
  }
</script>

<svelte:window
  on:dragenter={onDragEnter}
  on:dragleave={onDragLeave}
  on:dragover={onDragOver}
  on:drop={onDrop}
  on:keydown={onKeydown}
/>

<div class="app">
  <header class="topbar">
    <div class="brand">
      <span class="brand__mark" aria-hidden="true"><Layers size={17} strokeWidth={1.75} /></span>
      <span class="brand__name">
        animacion-dev <span class="brand__sub">Studio</span>
      </span>
    </div>

    <div class="topbar__actions">
      {#if ui.selected}
        <button class="btn btn--ghost" onclick={() => ui.closeTemplate()}>Biblioteca</button>
        <button
          class="btn btn--primary"
          onclick={() => (ui.exportSheetOpen = true)}
          title="Exportar (Cmd/Ctrl + E)"
        >
          Exportar
        </button>
      {:else if ui.library.length > 0}
        <button class="btn btn--secondary" onclick={() => ui.addViaDialog()} disabled={ui.importing}>
          <Plus size={16} strokeWidth={1.75} /> Añadir plantilla
        </button>
      {/if}
    </div>
  </header>

  <main id="main" class="shell">
    {#if !ui.ready}
      <div class="state"><p class="state__body">Cargando…</p></div>
    {:else if ui.selected}
      <TemplateView />
    {:else}
      <Library />
    {/if}
  </main>
</div>

{#if ui.dragActive}
  <div class="dropveil" role="presentation">
    <div class="dropveil__card">
      <p class="dropveil__title">Suelta para añadir</p>
      <p class="dropveil__body">Una carpeta de plantilla o un archivo .zip</p>
    </div>
  </div>
{/if}

<ConflictDialog />
<ExportSheet />
<Toasts />

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: var(--bg);
  }

  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-4);
    height: 52px;
    padding: 0 var(--sp-5) 0 var(--sp-5);
    padding-left: 88px; /* espacio para los controles de ventana en macOS */
    flex: 0 0 auto;
    -webkit-app-region: drag;
  }

  .topbar__actions {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    -webkit-app-region: no-drag;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    font-weight: 600;
    font-size: var(--text-base);
    letter-spacing: -0.01em;
  }

  .brand__mark {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: var(--r-sm);
    background: var(--accent);
    color: var(--accent-ink);
  }

  .brand__sub {
    color: var(--tertiary);
    font-weight: 500;
  }

  .shell {
    flex: 1 1 auto;
    margin: 0 var(--sp-3) var(--sp-3);
    background: var(--surface);
    border-radius: var(--r-xl);
    box-shadow: var(--elev-1);
    overflow: hidden;
    min-height: 0;
  }

  .dropveil {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: grid;
    place-items: center;
    background: color-mix(in srgb, var(--bg) 78%, transparent);
    backdrop-filter: blur(2px);
  }

  .dropveil__card {
    padding: var(--sp-6) var(--sp-8);
    border: 2px dashed var(--accent);
    border-radius: var(--r-lg);
    background: var(--surface);
    text-align: center;
  }

  .dropveil__title {
    font-size: var(--text-lg);
    font-weight: 600;
  }

  .dropveil__body {
    color: var(--muted);
    margin-top: var(--sp-1);
  }
</style>
