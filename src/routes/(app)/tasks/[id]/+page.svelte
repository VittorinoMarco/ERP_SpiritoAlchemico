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
    Loader2,
    ListTodo,
    Users,
  } from 'lucide-svelte';
  import type { AdminTask, AdminTaskPriorita, AdminTaskStato, TaskAttachment } from '$lib/types/adminTask';
  import { taskParentId } from '$lib/utils/adminTaskHelpers';
  import {
    TASK_STATO_LABELS,
    TASK_PRIORITA_LABELS,
    BOARD_STATO_ORDER,
    TASK_PRIORITA_BADGE
  } from '$lib/constants/adminTasks';

  type UserOption = { id: string; label: string };

  let task: AdminTask | null = null;
  let attachments: TaskAttachment[] = [];
  let subtasks: AdminTask[] = [];
  let users: UserOption[] = [];
  let usersLoadError = '';
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
    usersLoadError = '';
    try {
      const list = await pb.collection('users').getFullList({
        sort: '+email',
        fields: 'id,email,nome,cognome,username,name'
      });
      users = (list as Record<string, unknown>[]).map((u) => {
        const nome = u.nome as string | undefined;
        const cognome = u.cognome as string | undefined;
        const full = [nome, cognome].filter(Boolean).join(' ').trim();
        const label =
          full ||
          (u.name as string) ||
          (u.username as string) ||
          (u.email as string) ||
          String(u.id);
        return { id: String(u.id), label };
      });
    } catch (e) {
      usersLoadError =
        e instanceof Error ? e.message : 'Impossibile caricare l’elenco utenti (controlla le regole API su `users`).';
      users = [];
    }
  }

  async function loadSubtasks(): Promise<AdminTask[]> {
    try {
      return await pb.collection('admin_tasks').getFullList<AdminTask>({
        filter: `parent = "${taskId}"`,
        sort: 'priorita,-created',
        expand: 'assegnatario'
      });
    } catch {
      const all = await pb.collection('admin_tasks').getFullList<AdminTask>({
        expand: 'assegnatario'
      });
      return all.filter((t) => taskParentId(t) === taskId);
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
        loadSubtasks()
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
      const payload: Record<string, unknown> = {
        titolo,
        descrizione: descrizione || undefined,
        stato,
        priorita,
        scadenza: scadenza || undefined,
        inizio: inizio || undefined,
        etichette: parseEtichette(etichetteRaw)
      };
      payload.assegnatario = assegnatario ? assegnatario : null;
      await pb.collection('admin_tasks').update(task.id, payload);
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

  function subtaskAssigneeLabel(s: AdminTask): string {
    const u = s.expand?.assegnatario;
    if (!u) return '';
    return (u as { name?: string; email?: string }).name || (u as { email?: string }).email || '';
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

<div class="max-w-6xl mx-auto space-y-4 pb-24 px-1 sm:px-0">
  <div class="flex items-start gap-3 flex-wrap">
    <Button variant="ghost" size="sm" className="!px-2 min-h-[44px] min-w-[44px]" onclick={() => goto('/tasks')}>
      <ArrowLeft class="h-4 w-4" />
    </Button>
    <div class="flex-1 min-w-0">
      <h1 class="text-xl sm:text-2xl font-bold text-[#1A1A1A] break-words">
        {task?.titolo ?? 'Task'}
      </h1>
      {#if task?.parent}
        <p class="text-sm text-[#6B7280] mt-1">
          Sotto-task ·
          <button
            type="button"
            class="text-[#B8860B] font-medium underline underline-offset-2"
            onclick={() => goto(`/tasks/${task.parent}`)}
          >
            Apri task principale
          </button>
        </p>
      {/if}
    </div>
  </div>

  {#if collectionMissing}
    <Card>
      <p class="text-sm text-amber-800">
        Collection <code class="bg-black/5 px-1 rounded">admin_tasks</code> non trovata. Crea le collection in PocketBase come da
        <code class="bg-black/5 px-1 rounded">docs/POCKETBASE_SCHEMA.md</code>.
      </p>
    </Card>
  {:else if loading}
    <div class="flex justify-center py-16 text-[#6B7280]">
      <Loader2 class="h-10 w-10 animate-spin" />
    </div>
  {:else if !task}
    <Card><p class="text-sm text-[#6B7280]">Task non trovata.</p></Card>
  {:else}
    {#if error}
      <p class="text-sm text-rose-600">{error}</p>
    {/if}
    {#if usersLoadError}
      <p class="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">{usersLoadError}</p>
    {/if}

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 lg:items-start">
      <!-- Colonna sinistra: dettaglio -->
      <div class="space-y-4 min-w-0">
        <Card>
          <div class="space-y-4">
            <Input id="task-titolo" label="Titolo" bind:value={titolo} />
            <div>
              <label class="block text-xs font-medium text-[#6B7280] mb-1" for="desc">Descrizione</label>
              <textarea
                id="desc"
                rows="8"
                class="w-full rounded-2xl border border-black/10 px-4 py-3 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#F5D547] min-h-[160px]"
                bind:value={descrizione}
                placeholder="Dettagli, criteri di accettazione, link…"
              ></textarea>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-medium text-[#6B7280] mb-1" for="stato">Stato</label>
                <select
                  id="stato"
                  class="w-full rounded-2xl border border-black/10 px-4 py-2.5 text-sm min-h-[44px] bg-white"
                  bind:value={stato}
                >
                  {#each BOARD_STATO_ORDER as s}
                    <option value={s}>{TASK_STATO_LABELS[s]}</option>
                  {/each}
                </select>
              </div>
              <div>
                <label class="block text-xs font-medium text-[#6B7280] mb-1" for="pri">Priorità</label>
                <select
                  id="pri"
                  class="w-full rounded-2xl border border-black/10 px-4 py-2.5 text-sm min-h-[44px] bg-white"
                  bind:value={priorita}
                >
                  {#each ['bassa', 'media', 'alta', 'critica'] as p}
                    <option value={p}>{TASK_PRIORITA_LABELS[p as AdminTaskPriorita]}</option>
                  {/each}
                </select>
              </div>
            </div>
            <div>
              <label class="flex items-center gap-2 text-xs font-medium text-[#6B7280] mb-1" for="ass">
                <Users class="h-3.5 w-3.5" /> Assegnatario
              </label>
              <select
                id="ass"
                class="w-full rounded-2xl border border-black/10 px-4 py-2.5 text-sm min-h-[44px] bg-white"
                bind:value={assegnatario}
              >
                <option value="">— Nessuno —</option>
                {#each users as u}
                  <option value={u.id}>{u.label}</option>
                {/each}
              </select>
              {#if users.length === 0 && !usersLoadError}
                <p class="text-[10px] text-amber-700 mt-1">Nessun utente in elenco.</p>
              {/if}
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input id="task-inizio" type="date" label="Inizio" bind:value={inizio} />
              <Input id="task-scadenza" type="date" label="Scadenza" bind:value={scadenza} />
            </div>
            <Input label="Etichette (separate da virgola)" bind:value={etichetteRaw} />
            <div class="flex gap-2 flex-wrap pt-1">
              <Button variant="primary" size="sm" onclick={save} disabled={saving}>
                {#if saving}
                  <Loader2 class="h-4 w-4 animate-spin" />
                {:else}
                  Salva modifiche
                {/if}
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <!-- Colonna destra: sotto-task + allegati -->
      <div class="space-y-4 min-w-0">
        <Card className="!p-0 overflow-hidden border-[#F5D547]/30">
          <div class="px-4 py-3 bg-gradient-to-r from-[#FFF9E6] to-white border-b border-black/5 flex items-center justify-between gap-2 flex-wrap">
            <h2 class="text-sm font-semibold text-[#1A1A1A] flex items-center gap-2">
              <ListTodo class="h-4 w-4 text-[#B8860B]" />
              Sotto-task
            </h2>
            <Button variant="secondary" size="sm" onclick={addSubtask} disabled={saving}>
              <Plus class="h-4 w-4" /> Aggiungi
            </Button>
          </div>
          <ul class="divide-y divide-black/5 max-h-[min(50vh,420px)] overflow-y-auto">
            {#each subtasks as s}
              <li>
                <button
                  type="button"
                  class="w-full text-left px-4 py-3 text-sm hover:bg-[#FFFBF0] transition-colors flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-3 min-h-[52px]"
                  onclick={() => goto(`/tasks/${s.id}`)}
                >
                  <span class="font-medium text-[#1A1A1A] line-clamp-2">{s.titolo}</span>
                  <span class="flex flex-wrap items-center gap-2 flex-shrink-0">
                    <span
                      class="text-[10px] px-2 py-0.5 rounded-full {TASK_PRIORITA_BADGE[
                        s.priorita as AdminTaskPriorita
                      ]}"
                    >
                      {TASK_PRIORITA_LABELS[s.priorita as AdminTaskPriorita]}
                    </span>
                    <span class="text-xs text-[#6B7280]">{TASK_STATO_LABELS[s.stato as AdminTaskStato]}</span>
                    {#if subtaskAssigneeLabel(s)}
                      <span class="text-[10px] text-[#9CA3AF] truncate max-w-[120px]">{subtaskAssigneeLabel(s)}</span>
                    {/if}
                  </span>
                </button>
              </li>
            {:else}
              <li class="px-4 py-8 text-sm text-[#6B7280] text-center">Nessun sotto-task. Aggiungine uno per suddividere il lavoro.</li>
            {/each}
          </ul>
        </Card>

        <Card>
          <h2 class="text-sm font-semibold text-[#1A1A1A] mb-3 flex items-center gap-2">
            <Paperclip class="h-4 w-4" /> Allegati
          </h2>
          <div class="flex flex-wrap gap-2 mb-4">
            {#each attachments as a}
              <div
                class="flex items-center gap-2 rounded-xl bg-[#F3F4F6] px-3 py-2 text-sm max-w-full"
              >
                <a
                  href={attachmentUrl(a)}
                  target="_blank"
                  rel="noreferrer"
                  class="text-[#1A1A1A] underline flex items-center gap-1 truncate min-w-0"
                >
                  Scarica <ExternalLink class="h-3 w-3 flex-shrink-0" />
                </a>
                <button
                  type="button"
                  class="text-rose-600 p-1.5 min-w-[40px] min-h-[40px] flex items-center justify-center"
                  onclick={() => removeAttachment(a.id)}
                  aria-label="Elimina allegato"
                >
                  <Trash2 class="h-4 w-4" />
                </button>
              </div>
            {:else}
              <p class="text-sm text-[#6B7280] w-full">Nessun allegato.</p>
            {/each}
          </div>
          <div class="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-end gap-3">
            <label class="flex-1 min-w-0">
              <span class="sr-only">Scegli file</span>
              <input
                type="file"
                class="block w-full text-sm text-[#6B7280] file:mr-3 file:rounded-xl file:border-0 file:bg-[#FFF3CD] file:px-4 file:py-2 file:text-sm file:font-medium file:text-[#1A1A1A]"
                bind:files={fileInput}
              />
            </label>
            <Button variant="secondary" size="sm" onclick={uploadAttachment} disabled={saving || !fileInput?.[0]}>
              Carica file
            </Button>
          </div>
        </Card>

        <div class="flex justify-end pt-2">
          <Button variant="ghost" size="sm" className="!text-rose-600" onclick={deleteTask}>
            <Trash2 class="h-4 w-4" /> Elimina task
          </Button>
        </div>
      </div>
    </div>
  {/if}
</div>
