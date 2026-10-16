<script lang="ts">
  import { ui } from './state.svelte'
  import { Check, TriangleAlert, Info, X } from 'lucide-svelte'
</script>

<div class="toasts" aria-live="polite" aria-atomic="false">
  {#each ui.toasts as t (t.id)}
    <div class="toast" data-kind={t.kind}>
      <span class="toast__icon" aria-hidden="true">
        {#if t.kind === 'ok'}<Check size={15} strokeWidth={2} />
        {:else if t.kind === 'error'}<TriangleAlert size={15} strokeWidth={2} />
        {:else}<Info size={15} strokeWidth={2} />{/if}
      </span>
      <span class="toast__text">{t.text}</span>
      {#if t.action}
        <button
          class="toast__action"
          onclick={() => {
            t.action?.run()
            ui.dismiss(t.id)
          }}
        >
          {t.action.label}
        </button>
      {/if}
      <button class="toast__close" onclick={() => ui.dismiss(t.id)} aria-label="Cerrar aviso">
        <X size={13} strokeWidth={2} />
      </button>
    </div>
  {/each}
</div>

<style>
  .toasts {
    position: fixed;
    right: var(--sp-4);
    bottom: var(--sp-4);
    z-index: 80;
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    max-width: 400px;
  }

  .toast {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-2) var(--sp-2) var(--sp-2) var(--sp-3);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--r-sm);
    box-shadow: var(--elev-2);
    animation: toast-in var(--dur-slow) var(--ease-out);
  }

  @keyframes toast-in {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
  }

  .toast__icon {
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    color: var(--accent);
  }

  .toast[data-kind='ok'] .toast__icon {
    color: var(--success);
  }

  .toast[data-kind='error'] .toast__icon {
    color: var(--danger);
  }

  .toast__text {
    flex: 1;
    font-size: var(--text-sm);
    min-width: 0;
  }

  .toast__action {
    flex: 0 0 auto;
    border: none;
    background: transparent;
    color: var(--accent);
    font-size: var(--text-sm);
    font-weight: 600;
    cursor: pointer;
    padding: var(--sp-1) var(--sp-2);
    border-radius: var(--r-xs);
  }

  .toast__action:hover {
    background: var(--accent-tint);
  }

  .toast__close {
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border: none;
    background: transparent;
    color: var(--tertiary);
    border-radius: var(--r-xs);
    cursor: pointer;
  }

  .toast__close:hover {
    background: var(--surface-sunken);
    color: var(--ink);
  }
</style>
