<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { ClientResponseError } from 'pocketbase';
  import { pb } from '$lib/pocketbase';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import {
    ArrowLeft,
    Trash2,
    Paperclip,
    ExternalLink,
    Plus,
    Loader2
  } from 'lucide-svelte';
  import type { AdminTask, AdminTaskPriorita, AdminTaskStato, TaskAttachment } from '$lib/types/adminTask';
  import {
    TASK_STATO_LABELS,
    TASK_PRIORITA_LABELS,
    BOARD_STATO_ORDER
  } from '$lib/constants/adminTasks';

  let task: AdminTask | null = null;
  let attachments: TaskAttachment[] = [];
  let subtasks: AdminTask[] = [];
  let users: { id: string; name?: string; email?: string }[] = [];
  let loading = true;
  let saving = false;
  let error = '';
  let collectionMissing = false;

  let titolo = '';
  let descrizione = '';
  let stato: AdminTaskStato = 'da_fare';
  let priorita: AdminTaskPriorita = 'media';
  let assegnatario = '';
  let scadenza = '';
  let inizio = '';
  let etichetteRaw = '';
  let fileInput: FileList | null = null;

  $: taskId = $page.params.id ?? '';

  function parseEtichette(s: string): string[] {
    return s
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
  }

  async function loadUsers() {
    try {
      const list = await pb.collection('users').getFullList<{ id: string; name?: string; email?: string }>({
        sort: 'name'
      });
      users = list;
    } catch {
      users = [];
    }
  }

  async function load() {
    if (!taskId) return;
    loading = true;
    error = '';
    collectionMissing = false;
    try {
      const t = await pb.collection('admin_tasks').getOne<AdminTask>(taskId, {
        expand: 'assegnatario,creato_da,parent'
      });
      task = t;
      titolo = t.titolo ?? '';
      descrizione = t.descrizione ?? '';
      stato = (t.stato as AdminTaskStato) ?? 'da_fare';
      priorita = (t.priorita as AdminTaskPriorita) ?? 'media';
      assegnatario = t.assegnatario ?? '';
      scadenza = t.scadenza?.slice(0, 10) ?? '';
      inizio = t.inizio?.slice(0, 10) ?? '';
      etichetteRaw = Array.isArray(t.etichette) ? t.etichette.join(', ') : '';

      const [att, subs] = await Promise.all([
        pb.collection('task_attachments').getFullList<TaskAttachment>({
          filter: `task = "${taskId}"`,
          sort: '-created',
          expand: 'caricato_da'
        }),
        pb.collection('admin_tasks').getFullList<AdminTask>({
          filter: `parent = "${taskId}"`,
          sort: 'priorita,-created',
          expand: 'assegnatario'
        })
      ]);
      attachments = att;
      subtasks = subs;
    } catch (e) {
      if (e instanceof ClientResponseError && (e.status === 404 || e.response?.message?.includes?.('missing'))) {
        collectionMissing = true;
      } else {
        error = e instanceof Error ? e.message : 'Errore caricamento';
      }
      task = null;
    } finally {
      loading = false;
    }
  }

  async function save() {
    if (!task || saving) return;
    saving = true;
    error = '';
    try {
      await pb.collection('admin_tasks').update(task.id, {
        titolo,
        descrizione: descrizione || undefined,
        stato,
        priorita,
        assegnatario: assegnatario || undefined,
        scadenza: scadenza || undefined,
        inizio: inizio || undefined,
        etichette: parseEtichette(etichetteRaw)
      });
      await load();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Salvataggio fallito';
    } finally {
      saving = false;
    }
  }

  async function uploadAttachment() {
    if (!task || !fileInput?.[0]) return;
    saving = true;
    try {
      const fd = new FormData();
      fd.append('task', task.id);
      fd.append('file', fileInput[0]);
      const uid = pb.authStore.model?.id;
      if (uid) fd.append('caricato_da', uid);
      await pb.collection('task_attachments').create(fd);
      fileInput = null;
      await load();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Upload fallito';
    } finally {
      saving = false;
    }
  }

  async function removeAttachment(id: string) {
    if (!confirm('Eliminare questo allegato?')) return;
    try {
      await pb.collection('task_attachments').delete(id);
      await load();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Eliminazione fallita';
    }
  }

  function attachmentUrl(a: TaskAttachment): string {
    return pb.files.getUrl(a as unknown as Parameters<typeof pb.files.getUrl>[0], a.file);
  }

  async function addSubtask() {
    if (!task) return;
    saving = true;
    try {
      const uid = pb.authStore.model?.id;
      const created = await pb.collection('admin_tasks').create({
        titolo: 'Nuovo sotto-task',
        stato: 'da_fare',
        priorita: 'media',
        parent: task.id,
        creato_da: uid,
        ordine_colonna: 0,
        etichette: []
      });
      goto(`/tasks/${created.id}`);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Creazione fallita';
    } finally {
      saving = false;
    }
  }

  async function deleteTask() {
    if (!task || !confirm('Eliminare questa task e i sotto-task? Gli allegati verranno eliminati dal database.')) return;
    try {
      for (const s of subtasks) {
        await pb.collection('admin_tasks').delete(s.id);
      }
      for (const a of attachments) {
        await pb.collection('task_attachments').delete(a.id);
      }
      await pb.collection('admin_tasks').delete(task.id);
      goto('/tasks');
    } catch (e) {
      error = e instanceof Error ? e.message : 'Eliminazione fallita';
    }
  }

  onMount(() => {
    loadUsers();
  });

  $: if (taskId) {
    void load();
  }
</script>

<svelte:head>
  <title>{task?.titolo ?? 'Task'} | ERP</title>
</svelte:head>

<div class="max-w-3xl mx-auto space-y-4 pb-24">
  <div class="flex items-center gap-3 flex-wrap">
    <Button variant="ghost" size="sm" className="!px-2" onclick={() => goto('/tasks')}>
      <ArrowLeft class="h-4 w-4" />
    </Button>
    <h1 class="text-xl font-bold text-[#1A1A1A] flex-1 min-w-0 truncate">
      {task?.titolo ?? 'Task'}
    </h1>
  </div>
  {#if task?.parent}
    <p class="text-sm text-[#6B7280]">
      Sotto-task di
      <button
        type="button"
        class="text-[#F5D547] font-medium underline"
        onclick={() => goto(`/tasks/${task.parent}`)}
      >
        apri task padre
      </button>
    </p>
  {/if}

  {#if collectionMissing}
    <Card>
      <p class="text-sm text-amber-800">
        Collection <code class="bg-black/5 px-1 rounded">admin_tasks</code> non trovata. Crea le collection in PocketBase come da
        <code class="bg-black/5 px-1 rounded">docs/POCKETBASE_SCHEMA.md</code>.
      </p>
    </Card>
  {:else if loading}
    <div class="flex justify-center py-12 text-[#6B7280]">
      <Loader2 class="h-8 w-8 animate-spin" />
    </div>
  {:else if !task}
    <Card><p class="text-sm text-[#6B7280]">Task non trovata.</p></Card>
  {:else}
    {#if error}
      <p class="text-sm text-rose-600">{error}</p>
    {/if}

    <Card>
      <div class="space-y-4">
        <Input label="Titolo" bind:value={titolo} />
        <div>
          <label class="block text-xs font-medium text-[#6B7280] mb-1" for="desc">Descrizione</label>
          <textarea
            id="desc"
            rows="6"
            class="w-full rounded-2xl border border-black/10 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5D547]"
            bind:value={descrizione}
          ></textarea>
        </div>
        <div class="grid sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-medium text-[#6B7280] mb-1" for="stato">Stato</label>
            <select
              id="stato"
              class="w-full rounded-2xl border border-black/10 px-4 py-2.5 text-sm"
              bind:value={stato}
            >
              {#each BOARD_STATO_ORDER as s}
                <option value={s}>{TASK_STATO_LABELS[s]}</option>
              {/each}
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium text-[#6B7280] mb-1" for="pri">Priorità</label>
            <select id="pri" class="w-full rounded-2xl border border-black/10 px-4 py-2.5 text-sm" bind:value={priorita}>
              {#each ['bassa', 'media', 'alta', 'critica'] as p}
                <option value={p}>{TASK_PRIORITA_LABELS[p as AdminTaskPriorita]}</option>
              {/each}
            </select>
          </div>
        </div>
        <div>
          <label class="block text-xs font-medium text-[#6B7280] mb-1" for="ass">Assegnatario</label>
          <select
            id="ass"
            class="w-full rounded-2xl border border-black/10 px-4 py-2.5 text-sm"
            bind:value={assegnatario}
          >
            <option value="">— Nessuno —</option>
            {#each users as u}
              <option value={u.id}>{u.name || u.email || u.id}</option>
            {/each}
          </select>
        </div>
        <div class="grid sm:grid-cols-2 gap-4">
          <Input id="task-inizio" type="date" label="Inizio" bind:value={inizio} />
          <Input id="task-scadenza" type="date" label="Scadenza" bind:value={scadenza} />
        </div>
        <Input label="Etichette (separate da virgola)" bind:value={etichetteRaw} />
        <div class="flex gap-2 flex-wrap">
          <Button variant="primary" size="sm" onclick={save} disabled={saving}>
            {#if saving}
              <Loader2 class="h-4 w-4 animate-spin" />
            {/if}
            Salva
          </Button>
        </div>
      </div>
    </Card>

    <Card>
      <h2 class="text-sm font-semibold text-[#1A1A1A] mb-3 flex items-center gap-2">
        <Paperclip class="h-4 w-4" /> Allegati
      </h2>
      <div class="flex flex-wrap gap-2 mb-3">
        {#each attachments as a}
          <div
            class="flex items-center gap-2 rounded-xl bg-[#F3F4F6] px-3 py-2 text-sm"
          >
            <a
              href={attachmentUrl(a)}
              target="_blank"
              rel="noreferrer"
              class="text-[#1A1A1A] underline flex items-center gap-1"
            >
              File <ExternalLink class="h-3 w-3" />
            </a>
            <button
              type="button"
              class="text-rose-600 p-1"
              onclick={() => removeAttachment(a.id)}
              aria-label="Elimina allegato"
            >
              <Trash2 class="h-4 w-4" />
            </button>
          </div>
        {:else}
          <p class="text-sm text-[#6B7280]">Nessun allegato.</p>
        {/each}
      </div>
      <div class="flex flex-wrap items-end gap-2">
        <input
          type="file"
          class="text-sm"
          bind:files={fileInput}
        />
        <Button variant="secondary" size="sm" onclick={uploadAttachment} disabled={saving || !fileInput?.[0]}>
          Carica
        </Button>
      </div>
    </Card>

    <Card>
      <div class="flex items-center justify-between gap-2 mb-3">
        <h2 class="text-sm font-semibold text-[#1A1A1A]">Sotto-task</h2>
        <Button variant="secondary" size="sm" onclick={addSubtask}>
          <Plus class="h-4 w-4" /> Nuovo
        </Button>
      </div>
      <ul class="space-y-2">
        {#each subtasks as s}
          <li>
            <button
              type="button"
              class="w-full text-left rounded-xl border border-black/5 px-3 py-2 text-sm hover:bg-[#FFFBF0] transition-colors"
              onclick={() => goto(`/tasks/${s.id}`)}
            >
              <span class="font-medium text-[#1A1A1A]">{s.titolo}</span>
              <span class="text-[#6B7280] ml-2">{TASK_STATO_LABELS[s.stato as AdminTaskStato]}</span>
            </button>
          </li>
        {:else}
          <li class="text-sm text-[#6B7280]">Nessun sotto-task.</li>
        {/each}
      </ul>
    </Card>

    <div class="flex justify-end">
      <Button variant="ghost" size="sm" className="!text-rose-600" onclick={deleteTask}>
        <Trash2 class="h-4 w-4" /> Elimina task
      </Button>
    </div>
  {/if}
</div>
