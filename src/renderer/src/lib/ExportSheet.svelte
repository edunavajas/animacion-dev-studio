<script lang="ts">
  import { ui } from './state.svelte'
  import { clickOutside } from './util'
  import { FolderOpen, X, Download, Check, TriangleAlert } from 'lucide-svelte'
  import type { ExportFormat } from '../../../shared/types'

  const FORMATS: { id: ExportFormat; label: string }[] = [
    { id: 'mov', label: 'MOV · ProRes 4444 (con transparencia) — para Premiere' },
    { id: 'webm', label: 'WebM · VP9 (con transparencia) — más ligero' },
    { id: 'png-sequence', label: 'Secuencia PNG (con transparencia) — para After Effects' },
    { id: 'mp4', label: 'MP4 (sin transparencia)' }
  ]

  const PRESETS = [
    { id: 'premiere', label: 'Para Premiere', hint: 'MOV con transparencia' },
    { id: 'light', label: 'Archivo ligero', hint: 'WebM con transparencia' },
    { id: 'ae', label: 'Para After Effects', hint: 'Secuencia PNG' }
  ]

  let fileName = $state('')
  let fileNameInput = $state<HTMLInputElement | null>(null)

  function defaultName(): string {
    const base = (ui.selected?.name ?? 'animacion')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
    return base || 'animacion'
  }

  $effect(() => {
    if (ui.exportSheetOpen) {
      fileName = defaultName()
      requestAnimationFrame(() => fileNameInput?.focus())
    }
  })

  const isLossy = $derived(ui.exportSettings.format === 'mp4')

  async function chooseFolder() {
    const dir = await window.api.exporter.chooseFolder()
    if (dir) ui.outputDir = dir
  }

  async function start() {
    await ui.exportNow(fileName || defaultName())
  }

  function statusLabel(status: string): string {
    switch (status) {
      case 'queued':
        return 'En cola'
      case 'running':
        return 'Exportando'
      case 'done':
        return 'Listo'
      case 'error':
        return 'Error'
      case 'cancelled':
        return 'Cancelada'
      default:
        return status
    }
  }
</script>

{#if ui.exportSheetOpen}
  <div class="overlay" use:clickOutside={() => (ui.exportSheetOpen = false)}>
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="exp-title">
      <header class="sheet__head">
        <h2 id="exp-title" class="sheet__title">Exportar animación</h2>
        <button
          class="btn btn--icon"
          onclick={() => (ui.exportSheetOpen = false)}
          aria-label="Cerrar"
        >
          <X size={17} strokeWidth={1.75} />
        </button>
      </header>

      <div class="sheet__body">
        <fieldset class="group">
          <legend class="group__legend">¿Qué necesitas?</legend>
          <div class="presets">
            {#each PRESETS as p (p.id)}
              <button
                class="preset"
                class:is-on={ui.exportSettings.presetId === p.id}
                onclick={() => ui.setPreset(p.id)}
                aria-pressed={ui.exportSettings.presetId === p.id}
              >
                <span class="preset__label">{p.label}</span>
                <span class="preset__hint">{p.hint}</span>
              </button>
            {/each}
          </div>
        </fieldset>

        <div class="row">
          <div class="field grow">
            <label class="field__label" for="exp-name">Nombre del archivo</label>
            <input
              id="exp-name"
              class="input"
              type="text"
              bind:this={fileNameInput}
              bind:value={fileName}
              spellcheck="false"
            />
          </div>
        </div>

        <div class="field">
          <span class="field__label">Carpeta de salida</span>
          <div class="outdir">
            <span class="outdir__path" title={ui.outputDir ?? ''}>
              {ui.outputDir ?? 'Elige una carpeta…'}
            </span>
            <button class="btn btn--secondary" onclick={chooseFolder}>
              <FolderOpen size={15} strokeWidth={1.75} /> Elegir carpeta…
            </button>
          </div>
        </div>

        <details class="adv">
          <summary class="adv__summary">Opciones avanzadas</summary>
          <div class="adv__body">
            <div class="field">
              <label class="field__label" for="exp-format">Formato</label>
              <select
                id="exp-format"
                class="select"
                value={ui.exportSettings.format}
                onchange={(e) => {
                  const format = (e.target as HTMLSelectElement).value as ExportFormat
                  ui.exportSettings = { ...ui.exportSettings, format, presetId: 'custom' }
                }}
              >
                {#each FORMATS as f (f.id)}
                  <option value={f.id}>{f.label}</option>
                {/each}
              </select>
            </div>
            <div class="field">
              <label class="field__label" for="exp-quality">Calidad</label>
              <select
                id="exp-quality"
                class="select"
                value={ui.exportSettings.quality}
                onchange={(e) =>
                  (ui.exportSettings = {
                    ...ui.exportSettings,
                    quality: (e.target as HTMLSelectElement).value as 'draft' | 'looks' | 'delivery'
                  })}
              >
                <option value="draft">Rápida (borrador)</option>
                <option value="looks">Normal</option>
                <option value="delivery">Máxima</option>
              </select>
            </div>
            <p class="adv__note">
              {#if isLossy}
                Este formato no conserva la transparencia.
              {:else}
                Con fondo transparente, ideal para poner encima de tu vídeo.
              {/if}
            </p>
          </div>
        </details>

        {#if ui.jobs.length > 0}
          <section class="queue" aria-label="Cola de exportaciones">
            <h3 class="queue__title">Cola</h3>
            <ul class="queue__list">
              {#each ui.jobs as job (job.id)}
                <li class="job">
                  <div class="job__row">
                    <span class="job__name" title={job.outputPath}>{job.templateName}</span>
                    <span class="job__status" data-status={job.status}>{statusLabel(job.status)}</span>
                  </div>
                  {#if job.status === 'running' || job.status === 'queued'}
                    <div
                      class="progress"
                      role="progressbar"
                      aria-valuenow={Math.round(job.progress)}
                      aria-valuemin="0"
                      aria-valuemax="100"
                      aria-label="Progreso de {job.templateName}"
                    >
                      <span class="progress__fill" style="width: {job.progress}%"></span>
                    </div>
                    <div class="job__row">
                      <span class="job__detail">{job.detail}</span>
                      {#if job.status === 'running'}
                        <button
                          class="btn btn--ghost btn--sm"
                          onclick={() => window.api.exporter.cancel(job.id)}
                        >
                          Cancelar
                        </button>
                      {/if}
                    </div>
                  {:else if job.status === 'done'}
                    <div class="job__row">
                      <span class="job__detail job__detail--ok">
                        <Check size={13} strokeWidth={2} /> Guardado
                      </span>
                      <button
                        class="btn btn--ghost btn--sm"
                        onclick={() => window.api.exporter.openFolder(job.outputPath)}
                      >
                        Mostrar en carpeta
                      </button>
                    </div>
                  {:else if job.status === 'error'}
                    <p class="job__detail job__detail--err">
                      <TriangleAlert size={13} strokeWidth={2} /> {job.error}
                    </p>
                  {/if}
                </li>
              {/each}
            </ul>
          </section>
        {/if}
      </div>

      <footer class="sheet__foot">
        <button class="btn btn--ghost" onclick={() => (ui.exportSheetOpen = false)}>
          Cerrar
        </button>
        <button class="btn btn--primary btn--lg" onclick={start} disabled={!ui.outputDir}>
          <Download size={17} strokeWidth={1.75} /> Exportar
        </button>
      </footer>

      {#if !ui.outputDir}
        <p class="sheet__warn">Elige una carpeta de salida para poder exportar.</p>
      {/if}
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 70;
    display: grid;
    place-items: center;
    padding: var(--sp-5);
    background: color-mix(in srgb, #101018 42%, transparent);
    overscroll-behavior: contain;
  }

  .sheet {
    width: min(560px, 100%);
    max-height: min(84vh, 760px);
    display: flex;
    flex-direction: column;
    background: var(--surface);
    border-radius: var(--r-lg);
    box-shadow: var(--elev-3);
    overflow: hidden;
  }

  .sheet__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--sp-5) var(--sp-5) var(--sp-3);
  }

  .sheet__title {
    font-size: var(--text-lg);
  }

  .sheet__body {
    flex: 1;
    overflow-y: auto;
    padding: 0 var(--sp-5) var(--sp-4);
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
  }

  .sheet__foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-3);
    padding: var(--sp-4) var(--sp-5);
    border-top: 1px solid var(--border);
  }

  .sheet__warn {
    padding: 0 var(--sp-5) var(--sp-4);
    font-size: var(--text-xs);
    color: var(--warning);
  }

  .group {
    border: none;
    margin: 0;
    padding: 0;
  }

  .group__legend {
    font-size: var(--text-sm);
    font-weight: 500;
    margin-bottom: var(--sp-2);
    padding: 0;
  }

  .presets {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--sp-2);
  }

  .preset {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--sp-3);
    border: 1px solid var(--border-strong);
    border-radius: var(--r-sm);
    background: var(--surface);
    text-align: left;
    cursor: pointer;
    transition:
      border-color var(--dur-base) var(--ease-out),
      background-color var(--dur-base) var(--ease-out);
  }

  .preset:hover {
    border-color: var(--tertiary);
  }

  .preset.is-on {
    border-color: var(--accent);
    background: var(--accent-tint);
  }

  .preset__label {
    font-size: var(--text-sm);
    font-weight: 600;
  }

  .preset__hint {
    font-size: var(--text-2xs);
    color: var(--muted);
  }

  .preset.is-on .preset__hint {
    color: var(--accent-tint-ink);
  }

  .row {
    display: flex;
    gap: var(--sp-3);
  }

  .grow {
    flex: 1;
  }

  .outdir {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-2) var(--sp-2) var(--sp-2) var(--sp-3);
    background: var(--surface-sunken);
    border-radius: var(--r-sm);
  }

  .outdir__path {
    flex: 1;
    min-width: 0;
    font-size: var(--text-xs);
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    direction: rtl;
    text-align: left;
  }

  .adv {
    border-top: 1px solid var(--border);
    padding-top: var(--sp-4);
  }

  .adv__summary {
    cursor: pointer;
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--muted);
  }

  .adv__body {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    padding-top: var(--sp-4);
  }

  .adv__note {
    font-size: var(--text-xs);
    color: var(--tertiary);
  }

  .queue__title {
    font-size: var(--text-sm);
    color: var(--muted);
    margin-bottom: var(--sp-3);
  }

  .queue__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
  }

  .job {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    padding: var(--sp-3);
    background: var(--surface-raised);
    border-radius: var(--r-sm);
  }

  .job__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-3);
  }

  .job__name {
    font-size: var(--text-sm);
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .job__status {
    font-size: var(--text-2xs);
    color: var(--muted);
    flex: 0 0 auto;
  }

  .job__detail {
    font-size: var(--text-xs);
    color: var(--tertiary);
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
  }

  .job__detail--ok {
    color: var(--success);
  }

  .job__detail--err {
    color: var(--danger);
  }

  .btn--sm {
    min-height: 28px;
    font-size: var(--text-xs);
    padding: 0 var(--sp-2);
  }

  .progress {
    height: 5px;
    border-radius: var(--r-full);
    background: var(--surface-sunken);
    overflow: hidden;
  }

  .progress__fill {
    display: block;
    height: 100%;
    background: var(--accent);
    border-radius: var(--r-full);
    transition: width var(--dur-slow) var(--ease-out);
  }
</style>
