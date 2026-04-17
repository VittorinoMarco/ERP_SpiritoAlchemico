<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { ClientResponseError } from 'pocketbase';
  import { pb } from '$lib/pocketbase';
  import Button from '$lib/components/ui/Button.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import Modal from '$lib/components/ui/Modal.svelte';
  import ChatMarkdown from '$lib/components/assistant/ChatMarkdown.svelte';
  import FolderTree from '$lib/components/notes/FolderTree.svelte';
  import {
    Plus,
    FolderPlus,
    Trash2,
    Menu,
    X,
    Loader2,
    StickyNote,
    Eye,
    Pencil,
    FolderOpen
  } from 'lucide-svelte';
  import type { NoteFolder, AdminNote } from '$lib/types/adminNote';
  import { noteCartellaId, folderParentId, sortFolders } from '$lib/utils/noteFolderHelpers';

  type UserRow = { id: string; label: string };

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
  /** Cartella della nota in modifica (per spostare). */
  let editCartella = '';

  let folderModalOpen = false;
  let newFolderNome = '';
  let newFolderParent = '';

  function selectFolder(id: string) {
    selectedFolderId = id;
    mobileDrawerOpen = false;
  }

  $: filteredNotes = (() => {
    if (selectedFolderId === null) {
      return [...notes].sort((a, b) => (b.updated ?? '').localeCompare(a.updated ?? ''));
    }
    if (selectedFolderId === '__root__') {
      return notes
        .filter((n) => !noteCartellaId(n))
        .sort((a, b) => (a.posizione ?? 0) - (b.posizione ?? 0));
    }
    return notes
      .filter((n) => noteCartellaId(n) === selectedFolderId)
      .sort((a, b) => (a.posizione ?? 0) - (b.posizione ?? 0));
  })();

  $: selectedNote = selectedNoteId ? notes.find((n) => n.id === selectedNoteId) ?? null : null;

  $: rootFolderCount = folders.filter((f) => !folderParentId(f)).length;

  /** Se nessuna cartella è root (dati legacy), mostra tutte in lista piatta. */
  $: showFlatFolders = folders.length > 0 && rootFolderCount === 0;

  async function load() {
    loading = true;
    error = '';
    collectionMissing = false;
    try {
      let f: NoteFolder[] = [];
      try {
        f = await pb.collection('note_folders').getFullList<NoteFolder>({ sort: 'posizione' });
      } catch {
        f = await pb.collection('note_folders').getFullList<NoteFolder>({ sort: '-created' });
      }
      folders = f;
      const n = await pb.collection('admin_notes').getFullList<AdminNote>({
        sort: '-updated',
        expand: 'autore,cartella'
      });
      notes = n;
      if (selectedNoteId && !notes.some((x) => x.id === selectedNoteId)) {
        selectedNoteId = null;
        editTitolo = '';
        editCorpo = '';
        editCartella = '';
      } else if (selectedNoteId) {
        const sn = notes.find((x) => x.id === selectedNoteId);
        if (sn) {
          editTitolo = sn.titolo ?? '';
          editCorpo = sn.corpo ?? '';
          editCartella = noteCartellaId(sn);
        }
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
    editCartella = noteCartellaId(n);
    previewMode = false;
    mobileDrawerOpen = false;
  }

  async function saveNote() {
    if (!selectedNoteId || saving) return;
    saving = true;
    error = '';
    try {
      const payload: Record<string, unknown> = {
        titolo: editTitolo,
        corpo: editCorpo
      };
      if (editCartella) {
        payload.cartella = editCartella;
      } else {
        payload.cartella = null;
      }
      await pb.collection('admin_notes').update(selectedNoteId, payload);
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
      const same = notes.filter((n) => noteCartellaId(n) === (cartella || ''));
      const maxPos = same.length ? Math.max(...same.map((n) => n.posizione ?? 0)) : 0;
      const row = await pb.collection('admin_notes').create({
        titolo: 'Nuova nota',
        corpo: '',
        autore: uid,
        cartella: cartella || undefined,
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

  async function submitNewFolder() {
    if (!newFolderNome.trim()) return;
    saving = true;
    try {
      const maxPos = folders.length ? Math.max(...folders.map((f) => f.posizione ?? 0)) : 0;
      const body: Record<string, unknown> = {
        nome: newFolderNome.trim(),
        posizione: maxPos + 1
      };
      if (newFolderParent) {
        body.genitore = newFolderParent;
      }
      await pb.collection('note_folders').create(body);
      newFolderNome = '';
      newFolderParent = '';
      folderModalOpen = false;
      await load();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Errore creazione cartella';
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
      editCartella = '';
      await load();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Eliminazione fallita';
    }
  }

  function folderLabelById(id: string): string {
    return folders.find((x) => x.id === id)?.nome ?? id;
  }

  onMount(load);
</script>

<svelte:head>
  <title>Note | ERP Spirito Alchemico</title>
</svelte:head>

<div
  class="flex flex-col lg:flex-row gap-0 min-h-[calc(100vh-6rem)] lg:min-h-[calc(100vh-7rem)] rounded-3xl overflow-hidden border border-black/5 bg-gradient-to-br from-white to-[#FAFAF9] shadow-sm"
>
  <!-- Mobile top bar -->
  <div
    class="lg:hidden flex items-center justify-between px-3 py-2.5 border-b border-black/5 bg-white/95 sticky top-0 z-30 backdrop-blur-sm"
  >
    <button
      type="button"
      class="inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-[#1A1A1A] bg-[#F3F4F6] active:scale-[0.98] transition-transform min-h-[44px]"
      onclick={() => (mobileDrawerOpen = !mobileDrawerOpen)}
    >
      {#if mobileDrawerOpen}
        <X class="h-5 w-5" />
      {:else}
        <Menu class="h-5 w-5" />
      {/if}
      <span>Cartelle</span>
    </button>
    <Button variant="primary" size="sm" onclick={createNote} disabled={saving || collectionMissing}>
      <Plus class="h-4 w-4" />
      Nuova
    </Button>
  </div>

  {#if mobileDrawerOpen}
    <button
      type="button"
      class="lg:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
      aria-label="Chiudi menu"
      onclick={() => (mobileDrawerOpen = false)}
    ></button>
  {/if}

  <!-- Sidebar -->
  <aside
    class="flex flex-col bg-[#F4F3F0] border-black/5 z-50 lg:z-0
      fixed lg:relative inset-x-0 bottom-0 lg:bottom-auto
      top-[52px] lg:top-auto
      max-h-[min(78vh,calc(100vh-8rem))] lg:max-h-[calc(100vh-8rem)] w-full lg:w-[min(100%,22rem)] xl:w-96 flex-shrink-0
      lg:border-r border-t lg:border-t-0 rounded-t-3xl lg:rounded-none shadow-xl lg:shadow-none
      {mobileDrawerOpen ? 'flex' : 'hidden'} lg:flex"
  >
    <div class="p-3 border-b border-black/5 flex gap-2 flex-shrink-0 bg-white/50">
      <Button variant="secondary" size="sm" className="flex-1 !py-2.5" onclick={createNote} disabled={saving}>
        <Plus class="h-4 w-4" />
        Nuova nota
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="!px-3 min-w-[44px]"
        onclick={() => {
          folderModalOpen = true;
          newFolderNome = '';
          newFolderParent = '';
        }}
        disabled={saving}
        title="Nuova cartella"
      >
        <FolderPlus class="h-4 w-4" />
      </Button>
    </div>

    <div class="px-3 py-3 space-y-1 flex-shrink-0 border-b border-black/5 bg-white/30">
      <p class="px-1 text-[10px] font-bold uppercase tracking-wider text-[#9CA3AF] mb-2">Navigazione</p>
      <button
        type="button"
        class="w-full text-left rounded-xl px-3 py-2.5 text-sm font-medium transition-all min-h-[44px] flex items-center gap-2"
        class:bg-[#1A1A1A]={selectedFolderId === null}
        class:text-white={selectedFolderId === null}
        class:shadow-md={selectedFolderId === null}
        class:text-[#6B7280]={selectedFolderId !== null}
        class:hover:bg-white={selectedFolderId !== null}
        onclick={() => {
          selectedFolderId = null;
          mobileDrawerOpen = false;
        }}
      >
        <StickyNote class="h-4 w-4 flex-shrink-0 opacity-80" />
        Tutte le note
      </button>
      <button
        type="button"
        class="w-full text-left rounded-xl px-3 py-2.5 text-sm transition-all min-h-[44px] flex items-center gap-2"
        class:bg-[#FFF3CD]={selectedFolderId === '__root__'}
        class:text-[#1A1A1A]={selectedFolderId === '__root__'}
        class:font-medium={selectedFolderId === '__root__'}
        class:text-[#6B7280]={selectedFolderId !== '__root__'}
        class:hover:bg-white={selectedFolderId !== '__root__'}
        onclick={() => {
          selectedFolderId = '__root__';
          mobileDrawerOpen = false;
        }}
      >
        <FolderOpen class="h-4 w-4 flex-shrink-0" />
        Senza cartella
      </button>

      <p class="px-1 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-[#9CA3AF]">Cartelle</p>
      {#if loading}
        <div class="flex justify-center py-6 text-[#6B7280]">
          <Loader2 class="h-6 w-6 animate-spin" />
        </div>
      {:else if folders.length === 0}
        <p class="text-xs text-[#6B7280] px-2 py-2 leading-relaxed">
          Nessuna cartella. Crea la prima con l’icona <FolderPlus class="inline h-3.5 w-3.5" />.
        </p>
      {:else if showFlatFolders}
        {#each [...folders].sort(sortFolders) as folder}
          <button
            type="button"
            class="w-full text-left rounded-xl px-3 py-2.5 text-sm min-h-[44px] transition-colors flex items-center gap-2"
            class:bg-[#FFF3CD]={selectedFolderId === folder.id}
            class:font-medium={selectedFolderId === folder.id}
            class:text-[#1A1A1A]={selectedFolderId === folder.id}
            class:text-[#6B7280]={selectedFolderId !== folder.id}
            class:hover:bg-white={selectedFolderId !== folder.id}
            onclick={() => selectFolder(folder.id)}
          >
            <span class="text-base" aria-hidden="true">📁</span>
            <span class="truncate">{folder.nome}</span>
          </button>
        {/each}
      {:else}
        <FolderTree allFolders={folders} parentId={null} {selectedFolderId} onSelect={selectFolder} />
      {/if}
    </div>

    <div class="flex-1 overflow-y-auto p-2 min-h-0 overscroll-contain">
      <p class="px-2 pb-2 text-[10px] font-bold uppercase tracking-wider text-[#9CA3AF]">Note in vista</p>
      {#if loading}
        <div class="flex justify-center py-8 text-[#6B7280]">
          <Loader2 class="h-6 w-6 animate-spin" />
        </div>
      {:else}
        {#each filteredNotes as n}
          <button
            type="button"
            class="w-full text-left rounded-xl px-3 py-3 mb-1.5 text-sm transition-all border min-h-[48px]"
            class:bg-white={selectedNoteId === n.id}
            class:border-[#F5D547]={selectedNoteId === n.id}
            class:shadow-sm={selectedNoteId === n.id}
            class:border-transparent={selectedNoteId !== n.id}
            class:hover:border-neutral-200={selectedNoteId !== n.id}
            onclick={() => selectNote(n)}
          >
            <span class="font-medium text-[#1A1A1A] line-clamp-2 block">{n.titolo || 'Senza titolo'}</span>
            <span class="block text-[10px] text-[#9CA3AF] mt-1">
              {n.updated
                ? new Date(n.updated).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })
                : ''}
            </span>
          </button>
        {:else}
          <p class="px-3 py-6 text-sm text-[#6B7280] text-center leading-relaxed">Nessuna nota qui. Crea una nuova nota.</p>
        {/each}
      {/if}
    </div>
  </aside>

  <!-- Editor -->
  <main class="flex-1 flex flex-col min-w-0 min-h-[50vh] lg:min-h-[calc(100vh-8rem)] bg-white/70">
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
      <div class="flex-1 flex flex-col items-center justify-center p-6 sm:p-8 text-center text-[#6B7280]">
        <div class="rounded-2xl bg-[#F3F4F6] p-4 mb-4">
          <StickyNote class="h-12 w-12 text-[#D1D5DB]" />
        </div>
        <p class="text-sm max-w-sm leading-relaxed">Seleziona una nota dalla colonna sinistra o creane una nuova.</p>
        <Button variant="primary" size="sm" className="mt-6" onclick={createNote}>Nuova nota</Button>
      </div>
    {:else if selectedNote}
      <div
        class="flex flex-col gap-3 px-3 sm:px-5 py-3 sm:py-4 border-b border-black/5 bg-white/95 sticky top-0 z-10 backdrop-blur-sm"
      >
        <div class="w-full">
          <Input id="note-titolo" bind:value={editTitolo} placeholder="Titolo nota" />
        </div>
        <div class="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div class="flex-1 min-w-0">
            <label class="block text-xs font-medium text-[#6B7280] mb-1" for="note-cartella">Cartella</label>
            <select
              id="note-cartella"
              class="w-full rounded-2xl border border-black/10 px-4 py-2.5 text-sm bg-white min-h-[44px]"
              bind:value={editCartella}
            >
              <option value="">Nessuna (root)</option>
              {#each folders as f}
                <option value={f.id}>{f.nome}</option>
              {/each}
            </select>
          </div>
          <div class="flex items-center gap-2 flex-shrink-0 flex-wrap">
            <Button variant="ghost" size="sm" onclick={() => (previewMode = !previewMode)} title="Anteprima Markdown">
              {#if previewMode}
                <Pencil class="h-4 w-4" />
                <span class="hidden sm:inline">Modifica</span>
              {:else}
                <Eye class="h-4 w-4" />
                <span class="hidden sm:inline">Anteprima</span>
              {/if}
            </Button>
            <Button variant="primary" size="sm" onclick={saveNote} disabled={saving}>
              {#if saving}
                <Loader2 class="h-4 w-4 animate-spin" />
              {:else}
                Salva
              {/if}
            </Button>
            <Button variant="ghost" size="sm" className="!text-rose-600" onclick={deleteNote} title="Elimina">
              <Trash2 class="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
      <div class="flex-1 flex flex-col min-h-0 p-3 sm:p-5 overflow-hidden">
        {#if previewMode}
          <div class="flex-1 overflow-y-auto rounded-2xl border border-black/5 bg-[#FAFAF9] p-4 sm:p-5 text-sm min-h-[200px] max-h-[calc(100vh-16rem)]">
            <ChatMarkdown content={editCorpo || '_Vuoto_'} />
          </div>
        {:else}
          <textarea
            class="flex-1 w-full min-h-[min(50vh,420px)] lg:min-h-[320px] resize-y rounded-2xl border border-black/10 px-4 py-3 text-base sm:text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#F5D547]"
            placeholder="Scrivi in Markdown…"
            bind:value={editCorpo}
          ></textarea>
        {/if}
        {#if error}
          <p class="text-xs text-rose-600 mt-2">{error}</p>
        {/if}
        <p class="text-[10px] text-[#9CA3AF] mt-3 flex flex-wrap gap-x-2 gap-y-1">
          <span
            >{selectedNote.expand?.autore?.name ||
              selectedNote.expand?.autore?.email ||
              'Autore sconosciuto'}</span
          >
          <span class="text-[#D1D5DB]">·</span>
          <span>
            {selectedNote.updated ? new Date(selectedNote.updated).toLocaleString('it-IT') : ''}
          </span>
          {#if noteCartellaId(selectedNote)}
            <span class="text-[#D1D5DB]">·</span>
            <span class="text-[#6B7280]">📁 {folderLabelById(noteCartellaId(selectedNote))}</span>
          {/if}
        </p>
      </div>
    {/if}
  </main>
</div>

<Modal open={folderModalOpen} title="Nuova cartella" size="sm" on:close={() => (folderModalOpen = false)}>
  <div class="space-y-4 -mt-2">
    <Input id="folder-nome" label="Nome" bind:value={newFolderNome} placeholder="Es. Progetti 2026" />
    <div>
      <label class="block text-sm font-medium text-[#1A1A1A] mb-1" for="folder-parent">Cartella padre (opzionale)</label>
      <select
        id="folder-parent"
        class="w-full rounded-2xl border border-black/10 px-4 py-2.5 text-sm min-h-[44px]"
        bind:value={newFolderParent}
      >
        <option value="">— Nessuna (livello principale) —</option>
        {#each folders as f}
          <option value={f.id}>{f.nome}</option>
        {/each}
      </select>
    </div>
    <div class="flex justify-end gap-2 pt-2">
      <Button variant="ghost" size="sm" onclick={() => (folderModalOpen = false)}>Annulla</Button>
      <Button variant="primary" size="sm" onclick={submitNewFolder} disabled={saving || !newFolderNome.trim()}>
        Crea cartella
      </Button>
    </div>
  </div>
</Modal>
