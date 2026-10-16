<script lang="ts">
  import { ui } from './state.svelte'
  import { clickOutside } from './util'

  const c = $derived(ui.confirm)

  let cancelBtn = $state<HTMLButtonElement | null>(null)

  // En una acción destructiva el foco va a «Cancelar»: así un Intro despistado
  // no borra ni restablece nada.
  $effect(() => {
    if (c) queueMicrotask(() => cancelBtn?.focus())
  })
</script>

{#if c}
  <div class="overlay" use:clickOutside={() => ui.resolveConfirm(false)}>
    <div
      class="dialog"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="cf-title"
      aria-describedby={c.body ? 'cf-body' : undefined}
      tabindex="-1"
    >
      <h2 id="cf-title" class="dialog__title">{c.title}</h2>
      {#if c.body}
        <p id="cf-body" class="dialog__body">{c.body}</p>
      {/if}
      <div class="dialog__actions">
        <button class="btn btn--secondary" bind:this={cancelBtn} onclick={() => ui.resolveConfirm(false)}>
          {c.cancelLabel ?? 'Cancelar'}
        </button>
        <button
          class="btn {c.danger ? 'btn--danger-solid' : 'btn--primary'}"
          onclick={() => ui.resolveConfirm(true)}
        >
          {c.confirmLabel}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 78;
    display: grid;
    place-items: center;
    padding: var(--sp-5);
    background: var(--scrim);
  }

  .dialog {
    width: min(440px, 100%);
    padding: var(--sp-5);
    background: var(--overlay-surface);
    border: 1px solid var(--border);
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

  .dialog__actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--sp-2);
    margin-top: var(--sp-5);
  }
</style>
