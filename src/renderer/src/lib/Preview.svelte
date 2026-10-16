<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import { Play, Pause, RotateCcw, Repeat } from 'lucide-svelte'
  import { ui } from './state.svelte'
  import type { FieldValues, LibraryEntry, PreviewBackground } from '../../../shared/types'

  interface Props {
    entry: LibraryEntry
    values: FieldValues
  }

  let { entry, values }: Props = $props()

  let frame = $state<HTMLIFrameElement | null>(null)
  let frameOrigin = $state<string | null>(null)
  let playing = $state(true)
  let loop = $state(true)
  let time = $state(0)
  let reported = $state(0)
  // La duración real la reporta el reproductor; el manifiesto es el respaldo.
  const duration = $derived(reported > 0 ? reported : entry.manifest.duration)
  let loading = $state(true)
  let error = $state<string | null>(null)
  let dragging = $state(false)

  const BG_OPTIONS: { kind: PreviewBackground['kind']; label: string }[] = [
    { kind: 'checker', label: 'Cuadros' },
    { kind: 'light', label: 'Claro' },
    { kind: 'dark', label: 'Oscuro' }
  ]

  function post(msg: Record<string, unknown>) {
    frame?.contentWindow?.postMessage(msg, '*')
  }

  function onMessage(e: MessageEvent) {
    if (frameOrigin && e.origin !== frameOrigin) return
    const d = e.data as { type?: string; t?: number; duration?: number; paused?: boolean; message?: string }
    if (!d || typeof d !== 'object') return
    if (d.type === 'ready') {
      loading = false
      post({ type: 'background', kind: ui.background.kind })
      post({ type: 'theme', dark: window.matchMedia('(prefers-color-scheme: dark)').matches })
    } else if (d.type === 'time') {
      time = d.t ?? 0
      if (d.duration && d.duration > 0) reported = d.duration
      playing = !d.paused
      if (loop && !dragging && time >= duration - 0.06) {
        post({ type: 'seek', t: 0 })
        post({ type: 'play' })
      }
    } else if (d.type === 'error') {
      error = d.message ?? 'Error en la vista previa'
      loading = false
    }
  }

  async function boot() {
    loading = true
    error = null
    try {
      // Los proxies de $state no cruzan el IPC: se envían copias planas.
      const { url } = await window.api.preview.start(
        entry.id,
        $state.snapshot(values) as FieldValues,
        { kind: ui.background.kind }
      )
      frameOrigin = new URL(url).origin
      if (frame) frame.src = url
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
      loading = false
    }
  }

  onMount(() => {
    window.addEventListener('message', onMessage)
    void boot()
    return () => window.removeEventListener('message', onMessage)
  })

  onDestroy(() => {
    void window.api.preview.stop()
  })

  // Cambios de valores: debounce y recarga de la composición con las variables nuevas.
  let debounce: ReturnType<typeof setTimeout> | undefined
  $effect(() => {
    // se leen values y el fondo para registrar dependencias
    const snapshot = JSON.stringify(values)
    const bg = ui.background.kind
    if (loading) return
    clearTimeout(debounce)
    debounce = setTimeout(async () => {
      await window.api.preview.update(entry.id, JSON.parse(snapshot) as FieldValues, { kind: bg })
      post({ type: 'reload' })
    }, 280)
    return () => clearTimeout(debounce)
  })

  let lastBg = $state(ui.background.kind)
  $effect(() => {
    const bg = ui.background.kind
    if (bg !== lastBg) {
      lastBg = bg
      post({ type: 'background', kind: bg })
    }
  })

  function togglePlay() {
    if (playing) post({ type: 'pause' })
    else post({ type: 'play' })
  }

  function restart() {
    post({ type: 'seek', t: 0 })
    post({ type: 'play' })
  }

  function onScrub(e: Event) {
    const v = Number((e.target as HTMLInputElement).value)
    time = v
    post({ type: 'seek', t: v })
  }

  // Atajo: Espacio reproduce/pausa mientras esta pantalla está activa.
  function onKey(e: KeyboardEvent) {
    const target = e.target as HTMLElement | null
    if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
    if (e.code === 'Space') {
      e.preventDefault()
      togglePlay()
    }
  }
</script>

<svelte:window on:keydown={onKey} />

<div class="preview">
  <div class="preview__stage">
    <div class="preview__mat" class:preview__mat--checker={ui.background.kind === 'checker'} class:preview__mat--light={ui.background.kind === 'light'} class:preview__mat--dark={ui.background.kind === 'dark'}>
      <iframe
        bind:this={frame}
        title="Vista previa de {entry.name}"
        allow="autoplay"
      ></iframe>

      {#if loading && !error}
        <div class="preview__overlay"><span class="spinner" aria-hidden="true"></span> Preparando la vista previa…</div>
      {/if}
      {#if error}
        <div class="preview__overlay preview__overlay--error" role="alert">
          <p>No se pudo cargar la vista previa.</p>
          <p class="preview__err">{error}</p>
          <button class="btn btn--secondary" onclick={boot}>Reintentar</button>
        </div>
      {/if}
    </div>
  </div>

  <div class="transport">
    <button class="btn btn--icon" onclick={restart} title="Reiniciar" aria-label="Reiniciar">
      <RotateCcw size={16} strokeWidth={1.75} />
    </button>
    <button
      class="btn btn--icon"
      onclick={togglePlay}
      title={playing ? 'Pausar (Espacio)' : 'Reproducir (Espacio)'}
      aria-label={playing ? 'Pausar' : 'Reproducir'}
    >
      {#if playing}<Pause size={16} strokeWidth={1.75} />{:else}<Play size={16} strokeWidth={1.75} />{/if}
    </button>

    <input
      class="scrub"
      type="range"
      min="0"
      max={duration || entry.manifest.duration}
      step="0.01"
      value={time}
      oninput={onScrub}
      onpointerdown={() => (dragging = true)}
      onpointerup={() => (dragging = false)}
      aria-label="Posición de la animación"
      aria-valuetext="{time.toFixed(1)} segundos de {duration.toFixed(1)}"
    />

    <span class="transport__time tnum">{time.toFixed(1)} s / {duration.toFixed(1)} s</span>

    <button
      class="btn btn--icon"
      class:is-on={loop}
      onclick={() => (loop = !loop)}
      title="Repetir"
      aria-label="Repetir"
      aria-pressed={loop}
    >
      <Repeat size={16} strokeWidth={1.75} />
    </button>

    <div class="bgswitch" role="group" aria-label="Fondo de la vista previa">
      {#each BG_OPTIONS as opt (opt.kind)}
        <button
          class="bgswitch__btn"
          class:is-on={ui.background.kind === opt.kind}
          onclick={() => ui.setBackground(opt.kind)}
          aria-pressed={ui.background.kind === opt.kind}
        >
          {opt.label}
        </button>
      {/each}
    </div>
  </div>
</div>

<style>
  .preview {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-width: 0;
  }

  .preview__stage {
    flex: 1;
    min-height: 0;
    padding: var(--sp-5);
    display: grid;
    place-items: center;
  }

  .preview__mat {
    position: relative;
    width: 100%;
    height: 100%;
    border-radius: var(--r-md);
    overflow: hidden;
    border: 1px solid var(--border);
    background: var(--surface-sunken);
  }

  .preview__mat--checker {
    background-color: #ffffff;
    background-image:
      linear-gradient(45deg, #e7e7ef 25%, transparent 25%),
      linear-gradient(-45deg, #e7e7ef 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, #e7e7ef 75%),
      linear-gradient(-45deg, transparent 75%, #e7e7ef 75%);
    background-size: 24px 24px;
    background-position: 0 0, 0 12px, 12px -12px, -12px 0;
  }

  .preview__mat--light {
    background: #ffffff;
  }

  .preview__mat--dark {
    background: #14141c;
  }

  .preview__mat iframe {
    width: 100%;
    height: 100%;
    border: none;
    display: block;
    background: transparent;
  }

  .preview__overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--sp-2);
    background: color-mix(in srgb, var(--surface) 82%, transparent);
    color: var(--muted);
    font-size: var(--text-sm);
  }

  .preview__overlay--error {
    color: var(--danger);
  }

  .preview__err {
    font-size: var(--text-xs);
    color: var(--muted);
    max-width: 46ch;
    text-align: center;
  }

  .spinner {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: 2px solid var(--border-strong);
    border-top-color: var(--accent);
    animation: spin 0.7s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .transport {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    padding: var(--sp-3) var(--sp-5) var(--sp-5);
    flex: 0 0 auto;
  }

  .scrub {
    flex: 1;
    -webkit-appearance: none;
    appearance: none;
    height: 4px;
    border-radius: var(--r-full);
    background: var(--surface-sunken);
    cursor: pointer;
  }

  .scrub::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--accent);
    border: 2px solid var(--surface);
    box-shadow: var(--elev-1);
  }

  .transport__time {
    font-size: var(--text-xs);
    color: var(--tertiary);
    white-space: nowrap;
    min-width: 92px;
    text-align: right;
  }

  .is-on {
    color: var(--accent);
    background: var(--accent-tint);
  }

  .bgswitch {
    display: flex;
    gap: 2px;
    padding: 2px;
    background: var(--surface-sunken);
    border-radius: var(--r-sm);
  }

  .bgswitch__btn {
    padding: 5px var(--sp-2);
    border: none;
    background: transparent;
    border-radius: 6px;
    font-size: var(--text-xs);
    color: var(--muted);
    cursor: pointer;
  }

  .bgswitch__btn.is-on {
    background: var(--surface);
    color: var(--ink);
    box-shadow: var(--elev-1);
  }
</style>
