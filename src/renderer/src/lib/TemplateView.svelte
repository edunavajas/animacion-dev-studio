<script lang="ts">
  import { ui } from './state.svelte'
  import Preview from './Preview.svelte'
  import FieldEditor from './FieldEditor.svelte'
  import { formatDuration, resolutionLabel } from './util'
  import { RotateCcw } from 'lucide-svelte'
  import type { FieldSpec } from '../../../shared/types'

  const entry = $derived(ui.selected)

  function setField(id: string, value: string | number | boolean) {
    ui.values = { ...ui.values, [id]: value }
  }

  // Guardado con retardo para no escribir en disco en cada tecla.
  let saveTimer: ReturnType<typeof setTimeout> | undefined
  $effect(() => {
    const snapshot = JSON.stringify(ui.values)
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      void ui.persistValues()
    }, 500)
    return () => clearTimeout(saveTimer)
    // se registra la dependencia del snapshot, no de la función
    void snapshot
  })

  const editableFields = $derived(
    (entry?.manifest.fields ?? []).filter((f: FieldSpec) => f.type !== 'select' && f.type !== 'toggle')
  )
</script>

{#if entry}
  <div class="view">
    <div class="view__main">
      <header class="view__head">
        <div class="view__titles">
          <h1 class="view__title">{entry.name}</h1>
          {#if entry.manifest.description}
            <p class="view__desc">{entry.manifest.description}</p>
          {/if}
          <div class="view__specs tnum">
            {formatDuration(entry.manifest.duration)} · {resolutionLabel(entry)}
          </div>
        </div>
      </header>

      <div class="view__preview">
        <Preview {entry} values={ui.values} />
      </div>
    </div>

    <aside class="view__aside" aria-label="Personalización">
      <div class="aside__head">
        <h2 class="aside__title">Personaliza</h2>
        <button
          class="btn btn--ghost"
          onclick={() =>
            ui.askConfirm({
              title: '¿Restablecer los valores?',
              body: 'Se volverán a poner los valores originales de la plantilla. Lo que hayas escrito o elegido en estos campos se perderá.',
              confirmLabel: 'Restablecer',
              danger: true,
              onConfirm: () => ui.resetValues()
            })}
          title="Restablecer valores"
        >
          <RotateCcw size={15} strokeWidth={1.75} /> Restablecer
        </button>
      </div>

      <div class="aside__body">
        {#if editableFields.length === 0}
          <p class="aside__empty">Esta plantilla no tiene campos que personalizar.</p>
        {:else}
          {#each editableFields as field (field.id)}
            <FieldEditor {field} value={ui.values[field.id]} onchange={setField} />
          {/each}
        {/if}
      </div>

      <footer class="aside__foot">
        <button class="btn btn--primary btn--lg" onclick={() => (ui.exportSheetOpen = true)}>
          Exportar
        </button>
        <p class="aside__hint">MOV con transparencia, listo para Premiere.</p>
      </footer>
    </aside>
  </div>
{/if}

<style>
  .view {
    display: flex;
    height: 100%;
    min-height: 0;
  }

  .view__main {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .view__head {
    padding: var(--sp-5) var(--sp-6) 0;
    flex: 0 0 auto;
  }

  .view__title {
    font-size: var(--text-xl);
  }

  .view__desc {
    color: var(--muted);
    font-size: var(--text-sm);
    margin-top: var(--sp-1);
    max-width: 62ch;
  }

  .view__specs {
    font-size: var(--text-xs);
    color: var(--tertiary);
    margin-top: var(--sp-2);
  }

  .view__preview {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .view__aside {
    flex: 0 0 356px;
    display: flex;
    flex-direction: column;
    min-height: 0;
    border-left: 1px solid var(--border);
  }

  .aside__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-2);
    padding: var(--sp-5) var(--sp-5) var(--sp-3);
    flex: 0 0 auto;
  }

  .aside__title {
    font-size: var(--text-md);
  }

  .aside__body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: var(--sp-2) var(--sp-5) var(--sp-5);
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
  }

  .aside__empty {
    color: var(--muted);
    font-size: var(--text-sm);
  }

  .aside__foot {
    flex: 0 0 auto;
    padding: var(--sp-4) var(--sp-5);
    border-top: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .aside__foot .btn {
    width: 100%;
  }

  .aside__hint {
    font-size: var(--text-xs);
    color: var(--tertiary);
    text-align: center;
  }
</style>
