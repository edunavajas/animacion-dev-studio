<script lang="ts">
  import { ui } from './state.svelte'
  import { clickOutside } from './util'
  import { Download, X, LoaderCircle, CircleCheck, TriangleAlert, ExternalLink } from 'lucide-svelte'

  const fase = $derived(ui.update.phase)
  const info = $derived(ui.update.info)
  const version = $derived(info?.version ?? '')
</script>

{#if ui.updateBannerVisible}
  <div class="banner" role="status">
    <span class="banner__icon" aria-hidden="true"><Download size={16} strokeWidth={1.75} /></span>
    <span class="banner__text">
      Hay una versión nueva{version ? ` (${version})` : ''}. Estás en la {info?.currentVersion}.
    </span>
    {#if info?.htmlUrl}
      <button class="btn btn--ghost btn--sm" onclick={() => ui.openReleasePage()}>
        <ExternalLink size={14} strokeWidth={1.75} /> Novedades
      </button>
    {/if}
    <button class="btn btn--primary btn--sm" onclick={() => ui.downloadUpdateNow()}>Descargar</button>
    <button class="btn btn--icon btn--sm" onclick={() => ui.dismissUpdate()} aria-label="Descartar aviso">
      <X size={15} strokeWidth={1.75} />
    </button>
  </div>
{/if}

{#if ui.updateDialogVisible}
  <div class="overlay" use:clickOutside={() => fase === 'error' && ui.dismissUpdate()}>
    <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="up-title" tabindex="-1">
      {#if fase === 'downloading'}
        <h2 id="up-title" class="dialog__title">Descargando la actualización…</h2>
        <p class="dialog__body">No cierres la app. Son unos {Math.round((info?.asset?.size ?? 0) / 1048576)} MB.</p>
        <div
          class="progress"
          role="progressbar"
          aria-valuenow={ui.update.progress}
          aria-valuemin="0"
          aria-valuemax="100"
          aria-label="Progreso de la descarga"
        >
          <span class="progress__fill" style="width: {ui.update.progress}%"></span>
        </div>
        <p class="dialog__pct tnum">{ui.update.progress} %</p>
        <div class="dialog__actions">
          <button class="btn btn--secondary" onclick={() => ui.cancelUpdate()}>Cancelar</button>
        </div>
      {:else if fase === 'ready'}
        <h2 id="up-title" class="dialog__title">
          <CircleCheck size={18} strokeWidth={2} /> Actualización lista
        </h2>
        {#if ui.update.manualInstall}
          <p class="dialog__body">
            Se va a abrir el instalador. Arrastra <strong>animacion-dev Studio</strong> a la carpeta
            Aplicaciones y reemplaza la que tienes.
          </p>
        {:else}
          <p class="dialog__body">
            Se cerrará la aplicación y se abrirá el instalador. Al terminar, ábrela otra vez.
          </p>
        {/if}
        <div class="dialog__actions">
          <button class="btn btn--secondary" onclick={() => ui.dismissUpdate()}>Más tarde</button>
          <button class="btn btn--primary" onclick={() => ui.installUpdateNow()}>
            {ui.update.manualInstall ? 'Abrir instalador' : 'Instalar ahora'}
          </button>
        </div>
      {:else if fase === 'installing'}
        <h2 id="up-title" class="dialog__title">
          <span class="spin" aria-hidden="true"><LoaderCircle size={18} strokeWidth={2} /></span>
          Abriendo el instalador…
        </h2>
        <p class="dialog__body">Sigue las indicaciones que aparezcan en pantalla.</p>
      {:else if fase === 'error'}
        <h2 id="up-title" class="dialog__title">
          <TriangleAlert size={18} strokeWidth={2} /> No se pudo actualizar
        </h2>
        <p class="dialog__body">{ui.update.error}</p>
        <div class="dialog__actions">
          <button class="btn btn--ghost" onclick={() => ui.copyErrorReport(`Actualización: ${ui.update.error}`)}>
            Copiar informe
          </button>
          <button class="btn btn--secondary" onclick={() => ui.dismissUpdate()}>Cerrar</button>
          <button class="btn btn--primary" onclick={() => ui.downloadUpdateNow()}>Reintentar</button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .banner {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    margin: var(--sp-1) var(--sp-3) 0;
    padding: var(--sp-2) var(--sp-3);
    background: var(--accent-tint);
    color: var(--accent-tint-ink);
    border-radius: var(--r-md);
    font-size: var(--text-sm);
    flex: 0 0 auto;
  }

  .banner__icon {
    display: grid;
    place-items: center;
    flex: 0 0 auto;
  }

  .banner__text {
    flex: 1;
    min-width: 0;
  }

  .btn--sm {
    min-height: 30px;
    font-size: var(--text-xs);
  }

  .overlay {
    position: fixed;
    inset: 0;
    z-index: 80;
    display: grid;
    place-items: center;
    padding: var(--sp-5);
    background: var(--scrim);
  }

  .dialog {
    width: min(460px, 100%);
    padding: var(--sp-5);
    background: var(--overlay-surface);
    border: 1px solid var(--border);
    border-radius: var(--r-lg);
    box-shadow: var(--elev-3);
  }

  .dialog__title {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    font-size: var(--text-lg);
    margin-bottom: var(--sp-2);
  }

  .dialog__body {
    color: var(--muted);
    font-size: var(--text-sm);
  }

  .dialog__pct {
    margin-top: var(--sp-2);
    font-size: var(--text-xs);
    color: var(--tertiary);
    text-align: right;
  }

  .dialog__actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--sp-2);
    margin-top: var(--sp-5);
  }

  .progress {
    margin-top: var(--sp-4);
    height: 6px;
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

  .spin {
    display: inline-grid;
    place-items: center;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
