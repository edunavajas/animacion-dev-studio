<script lang="ts">
  import { ImagePlus, Trash2, FileVideo } from 'lucide-svelte'
  import { fileUrl } from './util'
  import type { FieldSpec } from '../../../shared/types'

  interface Props {
    field: FieldSpec
    value: string | number | boolean | undefined
    onchange: (id: string, value: string | number | boolean) => void
  }

  let { field, value, onchange }: Props = $props()

  let fileInput = $state<HTMLInputElement | null>(null)
  let error = $state<string | null>(null)

  const acceptFor = (f: FieldSpec): string[] =>
    (f as { accept?: string[] }).accept ??
    (f.type === 'image' ? ['png', 'jpg', 'jpeg', 'webp'] : ['mp4', 'mov', 'webm', 'm4v'])

  const maxSizeFor = (f: FieldSpec): number | undefined => (f as { maxSizeMB?: number }).maxSizeMB

  const text = $derived(typeof value === 'string' ? value : value == null ? '' : String(value))
  const color = $derived(text || ((field.default as string) ?? '#000000'))

  function set(v: string | number | boolean) {
    error = null
    onchange(field.id, v)
  }

  function onText(e: Event) {
    const v = (e.target as HTMLInputElement).value
    const max = (field as { maxLength?: number }).maxLength
    if (max && v.length > max) return
    set(v)
  }

  function pickFile() {
    fileInput?.click()
  }

  function onFile(e: Event) {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return
    const allowed = acceptFor(field)
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (allowed.length && !allowed.includes(ext)) {
      error = `Formato no admitido. Usa: ${allowed.join(', ')}.`
      input.value = ''
      return
    }
    const maxMB = maxSizeFor(field)
    if (maxMB && file.size > maxMB * 1024 * 1024) {
      error = `El archivo supera el máximo de ${maxMB} MB.`
      input.value = ''
      return
    }
    let path = ''
    try {
      path = window.api.pathForFile(file)
    } catch {
      error = 'No se pudo leer el archivo elegido.'
      input.value = ''
      return
    }
    set(path)
    input.value = ''
  }

  function clearFile() {
    set('')
  }

  const fileName = $derived(text ? text.split(/[\\/]/).pop() ?? text : '')
  const max = $derived((field as { maxLength?: number }).maxLength)
</script>

<div class="field">
  <label class="field__label" for={`f-${field.id}`}>{field.label}</label>

  {#if field.type === 'color'}
    <div class="color">
      <input
        class="color__swatch"
        type="color"
        value={color}
        oninput={(e) => set((e.target as HTMLInputElement).value.toUpperCase())}
        aria-label={field.label}
      />
      <input
        class="input color__hex"
        type="text"
        spellcheck="false"
        value={text || (field.default as string) || ''}
        oninput={onText}
        aria-label={`${field.label} (código hexadecimal)`}
      />
    </div>
  {:else if field.type === 'image' || field.type === 'video'}
    <input
      class="sr-only"
      type="file"
      bind:this={fileInput}
      accept={acceptFor(field)
        .map((e) => '.' + e)
        .join(',')}
      onchange={onFile}
      tabindex="-1"
      aria-hidden="true"
    />
    {#if text}
      <div class="file">
        {#if field.type === 'image'}
          <img class="file__thumb" src={fileUrl(text)} alt={`Vista previa de ${field.label}`} />
        {:else}
          <span class="file__thumb file__thumb--video" aria-hidden="true"
            ><FileVideo size={20} strokeWidth={1.75}
          /></span>
        {/if}
        <span class="file__name" title={fileName}>{fileName}</span>
        <button class="btn btn--icon" onclick={clearFile} aria-label="Quitar archivo" title="Quitar">
          <Trash2 size={15} strokeWidth={1.75} />
        </button>
      </div>
    {/if}
    <button class="btn btn--secondary file__pick" onclick={pickFile}>
      <ImagePlus size={16} strokeWidth={1.75} /> {text ? 'Cambiar archivo…' : 'Elegir archivo…'}
    </button>
  {:else}
    <input
      id={`f-${field.id}`}
      class="input"
      type="text"
      spellcheck="false"
      value={text}
      maxlength={max}
      placeholder={(field as { placeholder?: string }).placeholder ?? ''}
      oninput={onText}
      aria-invalid={error ? 'true' : undefined}
    />
    {#if max}
      <span class="field__help tnum">{text.length}/{max}</span>
    {/if}
  {/if}

  {#if field.help && !error}
    <span class="field__help">{field.help}</span>
  {/if}
  {#if error}
    <span class="field__error" role="alert">{error}</span>
  {/if}
</div>

<style>
  .color {
    display: flex;
    gap: var(--sp-2);
    align-items: center;
  }

  .color__swatch {
    flex: 0 0 auto;
    width: 40px;
    height: 38px;
    padding: 0;
    border: 1px solid var(--border-strong);
    border-radius: var(--r-sm);
    background: transparent;
    cursor: pointer;
  }

  .color__hex {
    font-variant-numeric: tabular-nums;
    text-transform: uppercase;
  }

  .file {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-2);
    background: var(--surface-sunken);
    border-radius: var(--r-sm);
  }

  .file__thumb {
    flex: 0 0 auto;
    width: 40px;
    height: 40px;
    border-radius: var(--r-xs);
    object-fit: cover;
    background: var(--surface);
    display: grid;
    place-items: center;
  }

  .file__thumb--video {
    color: var(--tertiary);
  }

  .file__name {
    flex: 1;
    min-width: 0;
    font-size: var(--text-xs);
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file__pick {
    align-self: flex-start;
  }
</style>
