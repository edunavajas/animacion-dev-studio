<script lang="ts">
  import { ui } from './state.svelte'
  import { fileUrl, formatDuration, resolutionLabel } from './util'
  import { FolderOpen, Trash2, Search, Plus, Film, MoreVertical } from 'lucide-svelte'
  import type { LibraryEntry } from '../../../shared/types'

  let menu = $state<{ x: number; y: number; entry: LibraryEntry } | null>(null)

  /**
   * Abre el menú de opciones. `stopPropagation` es imprescindible: si el clic
   * llega a la ventana, el manejador global cierra el menú en el mismo gesto y
   * el botón parecería no hacer nada. La posición se calcula desde el elemento
   * (no desde el puntero) para que activarlo con el teclado también lo coloque
   * bien.
   */
  function openMenu(e: MouseEvent, entry: LibraryEntry, desdePuntero = false) {
    e.preventDefault()
    e.stopPropagation()
    const MENU_W = 220
    const MENU_H = 96
    let x: number
    let y: number
    if (desdePuntero && (e.clientX || e.clientY)) {
      x = e.clientX
      y = e.clientY
    } else {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
      x = r.left
      y = r.bottom + 4
    }
    menu = {
      x: Math.max(8, Math.min(x, window.innerWidth - MENU_W - 8)),
      y: Math.max(8, Math.min(y, window.innerHeight - MENU_H - 8)),
      entry
    }
  }

  function closeMenu() {
    menu = null
  }

  async function reveal(path: string) {
    await window.api.library.reveal(path)
  }

  async function removeTemplate(entry: LibraryEntry) {
    menu = null
    ui.askConfirm({
      title: `¿Quitar «${entry.name}»?`,
      body: 'Desaparecerá de la biblioteca. El archivo original no se toca, y la plantilla se puede volver a añadir arrastrándola otra vez.',
      confirmLabel: 'Quitar',
      danger: true,
      onConfirm: () => ui.deleteTemplate(entry)
    })
  }
</script>

<svelte:window onclick={closeMenu} onscroll={closeMenu} />

<div class="library">
  <header class="library__head">
    <div>
      <h1 class="library__title">Tus plantillas</h1>
      <p class="library__count">
        {ui.library.length}
        {ui.library.length === 1 ? 'plantilla' : 'plantillas'}
      </p>
    </div>
    {#if ui.library.length > 0}
      <label class="search">
        <Search size={15} strokeWidth={1.75} aria-hidden="true" />
        <input
          class="search__input"
          type="search"
          placeholder="Buscar plantillas…"
          bind:value={ui.query}
          aria-label="Buscar plantillas"
          spellcheck="false"
        />
      </label>
    {/if}
  </header>

  {#if ui.library.length === 0}
    <div class="empty">
      <div class="empty__zone">
        <span class="empty__icon" aria-hidden="true"><Film size={26} strokeWidth={1.5} /></span>
        <h2 class="empty__title">Arrastra aquí una plantilla</h2>
        <p class="empty__body">
          Suelta la carpeta que te pasaron (o un archivo .zip). Aparecerá en esta biblioteca, lista
          para personalizar y exportar.
        </p>
        <button class="btn btn--primary btn--lg" onclick={() => ui.addViaDialog()}>
          <Plus size={17} strokeWidth={1.75} /> Añadir plantilla…
        </button>
      </div>
    </div>
  {:else if ui.filtered.length === 0}
    <div class="state">
      <p class="state__body">Ninguna plantilla coincide con la búsqueda.</p>
      <button class="btn btn--secondary" onclick={() => (ui.query = '')}>Limpiar búsqueda</button>
    </div>
  {:else}
    <ul class="grid">
      {#each ui.filtered as entry (entry.id)}
        <li class="cell">
          <button
            class="tile"
            onclick={() => ui.openTemplate(entry)}
            oncontextmenu={(e) => openMenu(e, entry, true)}
            title={entry.manifest.description ?? entry.name}
          >
            <span class="tile__thumb">
              {#if entry.thumbPath}
                <img src={fileUrl(entry.thumbPath)} alt="" loading="lazy" />
              {:else}
                <span class="tile__thumb-empty" aria-hidden="true"
                  ><Film size={22} strokeWidth={1.5}
                /></span>
              {/if}
            </span>
            <span class="tile__meta">
              <span class="tile__name">{entry.name}</span>
              <span class="tile__specs tnum">
                {formatDuration(entry.manifest.duration)} · {resolutionLabel(entry)}
              </span>
            </span>
          </button>
          <button
            class="tile__menu"
            onclick={(e) => openMenu(e, entry)}
            aria-label="Opciones de {entry.name}"
            title="Opciones"
          >
            <MoreVertical size={16} strokeWidth={1.75} />
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

{#if menu}
  <div
    class="ctxmenu"
    style="left: {menu.x}px; top: {menu.y}px"
    role="menu"
    tabindex="-1"
  >
    <button class="ctxmenu__item" role="menuitem" onclick={() => reveal(menu!.entry.dir)}>
      <FolderOpen size={15} strokeWidth={1.75} /> Mostrar en carpeta
    </button>
    <button
      class="ctxmenu__item ctxmenu__item--danger"
      role="menuitem"
      onclick={() => removeTemplate(menu!.entry)}
    >
      <Trash2 size={15} strokeWidth={1.75} /> Eliminar plantilla
    </button>
  </div>
{/if}

<style>
  .library {
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .library__head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--sp-4);
    padding: var(--sp-5) var(--sp-6) var(--sp-4);
    flex: 0 0 auto;
  }

  .library__title {
    font-size: var(--text-xl);
  }

  .library__count {
    color: var(--tertiary);
    font-size: var(--text-sm);
    margin-top: 2px;
  }

  .search {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-width: 240px;
    height: 38px;
    padding: 0 var(--sp-3);
    background: var(--surface-sunken);
    border: 1px solid transparent;
    border-radius: var(--r-sm);
    color: var(--tertiary);
  }

  .search:focus-within {
    border-color: var(--accent);
    background: var(--surface);
  }

  .search__input {
    flex: 1;
    border: none;
    background: transparent;
    outline: none;
    font-size: var(--text-base);
    color: var(--ink);
  }

  .grid {
    list-style: none;
    margin: 0;
    padding: 0 var(--sp-6) var(--sp-6);
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(232px, 1fr));
    gap: var(--sp-4);
    overflow-y: auto;
    align-content: start;
  }

  .tile {
    display: flex;
    flex-direction: column;
    width: 100%;
    padding: 0;
    border: none;
    background: transparent;
    text-align: left;
    cursor: pointer;
    border-radius: var(--r-lg);
    transition: transform var(--dur-base) var(--ease-out);
  }

  .tile:hover {
    transform: translateY(-2px);
  }

  .tile__thumb {
    display: grid;
    place-items: center;
    aspect-ratio: 16 / 9;
    width: 100%;
    border-radius: var(--r-md);
    background:
      linear-gradient(45deg, var(--surface-sunken) 25%, transparent 25%),
      linear-gradient(-45deg, var(--surface-sunken) 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, var(--surface-sunken) 75%),
      linear-gradient(-45deg, transparent 75%, var(--surface-sunken) 75%);
    background-size: 20px 20px;
    background-position: 0 0, 0 10px, 10px -10px, -10px 0;
    background-color: var(--surface);
    border: 1px solid var(--border);
    overflow: hidden;
    transition: border-color var(--dur-base) var(--ease-out);
  }

  .tile:hover .tile__thumb {
    border-color: var(--border-strong);
  }

  .tile__thumb img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
  }

  .tile__thumb-empty {
    color: var(--tertiary);
  }

  .tile__meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--sp-3) var(--sp-1) 0;
  }

  .tile__name {
    font-size: var(--text-base);
    font-weight: 600;
    letter-spacing: -0.01em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tile__specs {
    font-size: var(--text-xs);
    color: var(--tertiary);
  }

  .cell {
    position: relative;
  }

  /* Siempre visible: si solo aparece al pasar el ratón, no se descubre. */
  .tile__menu {
    position: absolute;
    top: var(--sp-2);
    right: var(--sp-2);
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    padding: 0;
    border: none;
    border-radius: var(--r-sm);
    background: transparent;
    color: var(--tertiary);
    cursor: pointer;
    transition:
      background-color var(--dur-base) var(--ease-out),
      color var(--dur-base) var(--ease-out);
  }

  .tile__menu:hover {
    background: var(--surface);
    color: var(--ink);
    box-shadow: var(--elev-1);
  }

  .empty {
    flex: 1;
    display: grid;
    place-items: center;
    padding: var(--sp-6);
  }

  .empty__zone {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-3);
    max-width: 460px;
    padding: var(--sp-8) var(--sp-7);
    border: 1.5px dashed var(--border-strong);
    border-radius: var(--r-xl);
    text-align: center;
    background: var(--surface-raised);
  }

  .empty__icon {
    display: grid;
    place-items: center;
    width: 56px;
    height: 56px;
    border-radius: var(--r-md);
    background: var(--accent-tint);
    color: var(--accent-tint-ink);
  }

  .empty__title {
    font-size: var(--text-lg);
  }

  .empty__body {
    color: var(--muted);
    max-width: 40ch;
    margin-bottom: var(--sp-2);
  }

  .ctxmenu {
    position: fixed;
    z-index: 60;
    min-width: 210px;
    padding: var(--sp-1);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    box-shadow: var(--elev-2);
  }

  .ctxmenu__item {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    width: 100%;
    padding: var(--sp-2) var(--sp-3);
    border: none;
    background: transparent;
    border-radius: var(--r-xs);
    font-size: var(--text-sm);
    text-align: left;
    cursor: pointer;
    color: var(--ink);
  }

  .ctxmenu__item:hover {
    background: var(--surface-sunken);
  }

  .ctxmenu__item--danger {
    color: var(--danger);
  }

  .ctxmenu__item--danger:hover {
    background: var(--danger-fill);
  }
</style>
