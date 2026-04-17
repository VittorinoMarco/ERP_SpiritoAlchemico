<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { ClientResponseError } from 'pocketbase';
  import { pb } from '$lib/pocketbase';
  import Button from '$lib/components/ui/Button.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import ChatMarkdown from '$lib/components/assistant/ChatMarkdown.svelte';
  import {
    Plus,
    FolderPlus,
    Trash2,
    Menu,
    X,
    Loader2,
    PanelLeft,
    Eye,
    Pencil
  } from 'lucide-svelte';
  import type { NoteFolder, AdminNote } from '$lib/types/adminNote';

  let folders: NoteFolder[] = [];
  let notes: AdminNote[] = [];
  let loading = true;
  let saving = false;
  let error = '';
  let collectionMissing = false;

  let selectedFolderId: string | null = null;
  let selectedNoteId: string | null = null;
  let mobileDrawerOpen = false;
  let previewMode = false;

  let editTitolo = '';
  let editCorpo = '';

  function childrenOf(parentId: string | null): NoteFolder[] {
    return folders
      .filter((f) => (f.genitore || '') === (parentId || ''))
      .sort((a, b) => (a.posizione ?? 0) - (b.posizione ?? 0));
  }

  $: filteredNotes = (() => {
    if (selectedFolderId === null) {
      return [...notes].sort((a, b) => (b.updated ?? '').localeCompare(a.updated ?? ''));
    }
    if (selectedFolderId === '__root__') {
      return notes
        .filter((n) => !n.cartella)
        .sort((a, b) => (a.posizione ?? 0) - (b.posizione ?? 0));
    }
    return notes
      .filter((n) => n.cartella === selectedFolderId)
      .sort((a, b) => (a.posizione ?? 0) - (b.posizione ?? 0));
  })();

  $: selectedNote = selectedNoteId ? notes.find((n) => n.id === selectedNoteId) ?? null : null;

  async function load() {
    loading = true;
    error = '';
    collectionMissing = false;
    try {
      const [f, n] = await Promise.all([
        pb.collection('note_folders').getFullList<NoteFolder>({ sort: 'posizione' }),
        pb.collection('admin_notes').getFullList<AdminNote>({
          sort: '-updated',
          expand: 'autore,cartella'
        })
      ]);
      folders = f;
      notes = n;
      if (selectedNoteId && !notes.some((x) => x.id === selectedNoteId)) {
        selectedNoteId = null;
        editTitolo = '';
        editCorpo = '';
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (e instanceof ClientResponseError && (e.status === 404 || msg.includes('missing'))) {
        collectionMissing = true;
      } else {
        error = msg;
      }
      folders = [];
      notes = [];
    } finally {
      loading = false;
    }
  }

  function selectNote(n: AdminNote) {
    selectedNoteId = n.id;
    editTitolo = n.titolo ?? '';
    editCorpo = n.corpo ?? '';
    previewMode = false;
    mobileDrawerOpen = false;
  }

  async function saveNote() {
    if (!selectedNoteId || saving) return;
    saving = true;
    error = '';
    try {
      await pb.collection('admin_notes').update(selectedNoteId, {
        titolo: editTitolo,
        corpo: editCorpo
      });
      await load();
      await tick();
      const n = notes.find((x) => x.id === selectedNoteId);
      if (n) selectNote(n);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Salvataggio fallito';
    } finally {
      saving = false;
    }
  }

  async function createNote() {
    saving = true;
    error = '';
    try {
      const uid = pb.authStore.model?.id;
      let cartella: string | undefined;
      if (selectedFolderId && selectedFolderId !== '__root__' && selectedFolderId !== null) {
        cartella = selectedFolderId;
      }
      const same = notes.filter((n) => n.cartella === cartella);
      const maxPos = same.length ? Math.max(...same.map((n) => n.posizione ?? 0)) : 0;
      const row = await pb.collection('admin_notes').create({
        titolo: 'Nuova nota',
        corpo: '',
        autore: uid,
        cartella,
        posizione: maxPos + 1
      });
      await load();
      await tick();
      const created = notes.find((x) => x.id === row.id);
      if (created) selectNote(created);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Creazione fallita';
    } finally {
      saving = false;
    }
  }

  async function createFolder() {
    const nome = typeof window !== 'undefined' ? window.prompt('Nome cartella?') : null;
    if (!nome?.trim()) return;
    saving = true;
    try {
      const maxPos = folders.length ? Math.max(...folders.map((f) => f.posizione ?? 0)) : 0;
      await pb.collection('note_folders').create({
        nome: nome.trim(),
        posizione: maxPos + 1
      });
      await load();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Errore';
    } finally {
      saving = false;
    }
  }

  async function deleteNote() {
    if (!selectedNoteId || typeof window === 'undefined') return;
    if (!window.confirm('Eliminare questa nota?')) return;
    try {
      await pb.collection('admin_notes').delete(selectedNoteId);
      selectedNoteId = null;
      editTitolo = '';
      editCorpo = '';
      await load();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Eliminazione fallita';
    }
  }

  onMount(load);
</script>

<svelte:head>
  <title>Note | ERP Spirito Alchemico</title>
</svelte:head>

<div class="flex flex-col md:flex-row gap-0 min-h-[calc(100vh-7rem)] rounded-3xl overflow-hidden border border-black/5 bg-white/80 shadow-sm">
  <!-- Mobile top bar -->
  <div
    class="md:hidden flex items-center justify-between px-3 py-2.5 border-b border-black/5 bg-white/95 sticky top-0 z-30"
  >
    <button
      type="button"
      class="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-[#1A1A1A] bg-[#F3F4F6]"
      onclick={() => (mobileDrawerOpen = !mobileDrawerOpen)}
    >
      {#if mobileDrawerOpen}
        <X class="h-5 w-5" />
      {:else}
        <Menu class="h-5 w-5" />
      {/if}
      Cartelle e note
    </button>
    <Button variant="primary" size="sm" onclick={createNote} disabled={saving || collectionMissing}>
      <Plus class="h-4 w-4" />
    </Button>
  </div>

  <!-- Overlay mobile -->
  {#if mobileDrawerOpen}
    <button
      type="button"
      class="md:hidden fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
      aria-label="Chiudi menu"
      onclick={() => (mobileDrawerOpen = false)}
    ></button>
  {/if}

  <!-- Sidebar: cartelle + elenco note -->
  <aside
    class="flex flex-col bg-[#FAFAF9] border-black/5 z-50 md:z-0
      fixed md:relative inset-x-0 top-0 md:top-auto bottom-0 md:bottom-auto
      h-[85vh] md:h-auto md:max-h-[calc(100vh-8rem)] md:w-80 lg:w-96 flex-shrink-0
      md:border-r border-t md:border-t-0 rounded-t-3xl md:rounded-none
      {mobileDrawerOpen ? 'flex' : 'hidden'} md:flex"
  >
    <div class="p-3 border-b border-black/5 flex gap-2 flex-shrink-0">
      <Button variant="secondary" size="sm" className="flex-1 !py-2" onclick={createNote} disabled={saving}>
        <Plus class="h-4 w-4" />
        Nuova nota
      </Button>
      <Button variant="ghost" size="sm" className="!px-3" onclick={createFolder} disabled={saving} title="Nuova cartella">
        <FolderPlus class="h-4 w-4" />
      </Button>
    </div>

    <div class="px-2 py-2 space-y-0.5 flex-shrink-0 border-b border-black/5">
      <p class="px-2 text-[10px] font-semibold uppercase tracking-wide text-[#9CA3AF]">Viste</p>
      <button
        type="button"
        class="w-full text-left rounded-xl px-3 py-2 text-sm font-medium transition-colors"
        class:bg-[#FFF3CD]={selectedFolderId === null}
        class:text-[#1A1A1A]={selectedFolderId === null}
        class:text-[#6B7280]={selectedFolderId !== null}
        onclick={() => {
          selectedFolderId = null;
        }}
      >
        Tutte le note
      </button>
      <button
        type="button"
        class="w-full text-left rounded-xl px-3 py-2 text-sm transition-colors"
        class:bg-[#FFF3CD]={selectedFolderId === '__root__'}
        class:text-[#1A1A1A]={selectedFolderId === '__root__'}
        class:text-[#6B7280]={selectedFolderId !== '__root__'}
        onclick={() => {
          selectedFolderId = '__root__';
        }}
      >
        Senza cartella
      </button>
      {#each childrenOf(null) as folder}
        <button
          type="button"
          class="w-full text-left rounded-xl px-3 py-2 text-sm transition-colors truncate"
          class:bg-[#FFF3CD]={selectedFolderId === folder.id}
          class:text-[#1A1A1A]={selectedFolderId === folder.id}
          class:text-[#6B7280]={selectedFolderId !== folder.id}
          onclick={() => {
            selectedFolderId = folder.id;
          }}
        >
          {folder.nome}
        </button>
      {/each}
    </div>

    <div class="flex-1 overflow-y-auto p-2 min-h-0">
      <p class="px-2 pb-1 text-[10px] font-semibold uppercase text-[#9CA3AF]">Note</p>
      {#if loading}
        <div class="flex justify-center py-8 text-[#6B7280]">
          <Loader2 class="h-6 w-6 animate-spin" />
        </div>
      {:else}
        {#each filteredNotes as n}
          <button
            type="button"
            class="w-full text-left rounded-xl px-3 py-2.5 mb-1 text-sm transition-colors border border-transparent hover:bg-white hover:border-neutral-200"
            class:bg-white={selectedNoteId === n.id}
            class:border-neutral-300={selectedNoteId === n.id}
            class:shadow-sm={selectedNoteId === n.id}
            onclick={() => selectNote(n)}
          >
            <span class="font-medium text-[#1A1A1A] line-clamp-2">{n.titolo || 'Senza titolo'}</span>
            <span class="block text-[10px] text-[#9CA3AF] mt-0.5 truncate">
              {n.updated ? new Date(n.updated).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }) : ''}
            </span>
          </button>
        {:else}
          <p class="px-3 py-4 text-sm text-[#6B7280]">Nessuna nota in questa vista.</p>
        {/each}
      {/if}
    </div>
  </aside>

  <!-- Editor -->
  <main class="flex-1 flex flex-col min-w-0 min-h-[60vh] md:min-h-[calc(100vh-8rem)] bg-white/60">
    {#if collectionMissing}
      <div class="p-6 text-sm text-amber-800">
        Crea le collection <code class="bg-black/5 px-1 rounded">note_folders</code> e
        <code class="bg-black/5 px-1 rounded">admin_notes</code> in PocketBase (vedi docs/POCKETBASE_SCHEMA.md).
      </div>
    {:else if loading && !selectedNote}
      <div class="flex-1 flex items-center justify-center text-[#6B7280] py-16">
        <Loader2 class="h-10 w-10 animate-spin" />
      </div>
    {:else if !selectedNote}
      <div class="flex-1 flex flex-col items-center justify-center p-8 text-center text-[#6B7280]">
        <PanelLeft class="h-10 w-10 mb-2 opacity-40" />
        <p class="text-sm max-w-xs">Seleziona una nota dalla barra laterale o creane una nuova.</p>
        <Button variant="primary" size="sm" className="mt-4" onclick={createNote}>Nuova nota</Button>
      </div>
    {:else if selectedNote}
      <div
        class="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2 px-3 sm:px-4 py-3 border-b border-black/5 bg-white/95 sticky top-0 z-10"
      >
        <div class="flex-1 min-w-0">
          <Input id="note-titolo" bind:value={editTitolo} placeholder="Titolo" />
        </div>
        <div class="flex items-center gap-2 flex-shrink-0">
          <Button variant="ghost" size="sm" onclick={() => (previewMode = !previewMode)} title="Anteprima / modifica">
            {#if previewMode}
              <Pencil class="h-4 w-4" />
            {:else}
              <Eye class="h-4 w-4" />
            {/if}
          </Button>
          <Button variant="primary" size="sm" onclick={saveNote} disabled={saving}>
            {#if saving}
              <Loader2 class="h-4 w-4 animate-spin" />
            {:else}
              Salva
            {/if}
          </Button>
          <Button variant="ghost" size="sm" className="!text-rose-600" onclick={deleteNote}>
            <Trash2 class="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div class="flex-1 flex flex-col min-h-0 p-3 sm:p-4 overflow-hidden">
        {#if previewMode}
          <div class="flex-1 overflow-y-auto rounded-2xl border border-black/5 bg-[#FAFAF9] p-4 text-sm min-h-[200px]">
            <ChatMarkdown content={editCorpo || '_Vuoto_'} />
          </div>
        {:else}
          <textarea
            class="flex-1 w-full min-h-[240px] md:min-h-[320px] resize-y rounded-2xl border border-black/10 px-4 py-3 text-base sm:text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#F5D547]"
            placeholder="Scrivi in Markdown…"
            bind:value={editCorpo}
          ></textarea>
        {/if}
        {#if error}
          <p class="text-xs text-rose-600 mt-2">{error}</p>
        {/if}
        <p class="text-[10px] text-[#9CA3AF] mt-3">
          {selectedNote.expand?.autore?.name || selectedNote.expand?.autore?.email || 'Autore sconosciuto'}
          ·
          {selectedNote.updated
            ? new Date(selectedNote.updated).toLocaleString('it-IT')
            : ''}
        </p>
      </div>
    {/if}
  </main>
</div>
