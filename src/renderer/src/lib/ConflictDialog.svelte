<script lang="ts">
  import { ui } from './state.svelte'
  import { clickOutside } from './util'

  const c = $derived(ui.conflict)
</script>

{#if c}
  <div class="overlay" use:clickOutside={() => (ui.conflict = null)}>
    <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="cf-title">
      <h2 id="cf-title" class="dialog__title">Ya tienes una plantilla con este identificador</h2>
      <p class="dialog__body">
        Instalada: <strong>{c.existing.name}</strong>
        {#if c.existing.manifest.version}(v{c.existing.manifest.version}){/if} · la que traes:
        <strong>{c.incoming.name}</strong>
        {#if c.incoming.version}(v{c.incoming.version}){/if}.
      </p>
      {#if c.issues.some((i) => i.level === 'warning')}
        <p class="dialog__warn">
          {c.issues.filter((i) => i.level === 'warning').length} aviso(s) de validación en la plantilla
          nueva.
        </p>
      {/if}
      <div class="dialog__actions">
        <button class="btn btn--secondary" onclick={() => ui.resolveConflict(false)}>
          Conservar la instalada
        </button>
        <button class="btn btn--primary" onclick={() => ui.resolveConflict(true)}>
          Reemplazar por la nueva
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 75;
    display: grid;
    place-items: center;
    padding: var(--sp-5);
    background: color-mix(in srgb, #101018 42%, transparent);
  }

  .dialog {
    width: min(460px, 100%);
    padding: var(--sp-5);
    background: var(--surface);
    border-radius: var(--r-lg);
    box-shadow: var(--elev-3);
  }

  .dialog__title {
    font-size: var(--text-lg);
    margin-bottom: var(--sp-2);
  }

  .dialog__body {
    color: var(--muted);
    font-size: var(--text-sm);
  }

  .dialog__warn {
    margin-top: var(--sp-2);
    font-size: var(--text-xs);
    color: var(--warning);
  }

  .dialog__actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--sp-2);
    margin-top: var(--sp-5);
  }
</style>
