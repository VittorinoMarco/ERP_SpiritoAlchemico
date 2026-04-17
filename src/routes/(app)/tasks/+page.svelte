<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { ClientResponseError } from 'pocketbase';
  import { pb } from '$lib/pocketbase';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import {
    LayoutGrid,
    List,
    GanttChart,
    CalendarDays,
    Plus,
    Loader2,
    User,
    AlertCircle
  } from 'lucide-svelte';
  import type { AdminTask, AdminTaskPriorita, AdminTaskStato } from '$lib/types/adminTask';
  import {
    BOARD_STATO_ORDER,
    TASK_STATO_LABELS,
    TASK_PRIORITA_LABELS,
    TASK_PRIORITA_BADGE
  } from '$lib/constants/adminTasks';

  type ViewMode = 'board' | 'list' | 'timeline' | 'calendar';

  let tasks: AdminTask[] = [];
  let loading = true;
  let error = '';
  let collectionMissing = false;
  let creating = false;

  let view: ViewMode = 'board';
  /** Lista: raggruppa per */
  let listGroup: 'priorita' | 'assegnatario' | 'scadenza' | 'stato' = 'priorita';
  let filterPriorita: AdminTaskPriorita | 'tutti' = 'tutti';
  let filterAssegnatario = '';

  let calYear = new Date().getFullYear();
  let calMonth = new Date().getMonth();

  function topLevel(t: AdminTask) {
    return !t.parent;
  }

  $: filtered = tasks.filter((t) => {
    if (!topLevel(t)) return false;
    if (filterPriorita !== 'tutti' && t.priorita !== filterPriorita) return false;
    if (filterAssegnatario && t.assegnatario !== filterAssegnatario) return false;
    return true;
  });

  $: byStato = (st: AdminTaskStato) =>
    filtered.filter((t) => t.stato === st).sort((a, b) => (a.ordine_colonna ?? 0) - (b.ordine_colonna ?? 0));

  async function load() {
    loading = true;
    error = '';
    collectionMissing = false;
    try {
      const list = await pb.collection('admin_tasks').getFullList<AdminTask>({
        sort: 'ordine_colonna,-created',
        expand: 'assegnatario,creato_da'
      });
      tasks = list;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (e instanceof ClientResponseError && (e.status === 404 || msg.includes('missing'))) {
        collectionMissing = true;
      } else {
        error = msg;
      }
      tasks = [];
    } finally {
      loading = false;
    }
  }

  async function createTask() {
    creating = true;
    try {
      const uid = pb.authStore.model?.id;
      const row = await pb.collection('admin_tasks').create({
        titolo: 'Nuova task',
        stato: 'backlog',
        priorita: 'media',
        creato_da: uid,
        ordine_colonna: 0,
        etichette: []
      });
      goto(`/tasks/${row.id}`);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Creazione fallita';
    } finally {
      creating = false;
    }
  }

  function userLabel(t: AdminTask): string {
    const u = t.expand?.assegnatario;
    if (!u) return '—';
    return u.name || u.email || 'Utente';
  }

  function fmtDate(d?: string): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('it-IT');
  }

  /** Timeline: task con almeno inizio o scadenza */
  $: timelineRows = filtered
    .filter((t) => t.inizio || t.scadenza)
    .sort((a, b) => {
      const da = (a.inizio || a.scadenza || '').localeCompare(b.inizio || b.scadenza || '');
      return da;
    });

  /** Calendario: task con scadenza nel mese */
  $: calStart = new Date(calYear, calMonth, 1);
  $: calEnd = new Date(calYear, calMonth + 1, 0);
  $: daysInMonth = calEnd.getDate();
  $: firstWeekday = (calStart.getDay() + 6) % 7; // lunedì=0

  function tasksOnDay(day: number): AdminTask[] {
    const d = new Date(calYear, calMonth, day);
    const iso = d.toISOString().slice(0, 10);
    return filtered.filter((t) => t.scadenza?.slice(0, 10) === iso);
  }

  $: assignees = [...new Set(tasks.map((t) => t.assegnatario).filter(Boolean))] as string[];

  $: listGrouped = (() => {
    const f = filtered;
    if (listGroup === 'priorita') {
      const keys: AdminTaskPriorita[] = ['critica', 'alta', 'media', 'bassa'];
      return keys.map((k) => ({ key: TASK_PRIORITA_LABELS[k], items: f.filter((t) => t.priorita === k) }));
    }
    if (listGroup === 'stato') {
      return BOARD_STATO_ORDER.map((k) => ({
        key: TASK_STATO_LABELS[k],
        items: f.filter((t) => t.stato === k)
      }));
    }
    if (listGroup === 'assegnatario') {
      const map = new Map<string, AdminTask[]>();
      for (const t of f) {
        const k = t.assegnatario || '_none';
        if (!map.has(k)) map.set(k, []);
        map.get(k)!.push(t);
      }
      return [...map.entries()].map(([k, items]) => ({
        key: k === '_none' ? 'Non assegnato' : userLabel(items[0]),
        items
      }));
    }
    if (listGroup === 'scadenza') {
      const withD = f.filter((t) => t.scadenza);
      const without = f.filter((t) => !t.scadenza);
      const buckets = new Map<string, AdminTask[]>();
      for (const t of withD) {
        const k = t.scadenza!.slice(0, 10);
        if (!buckets.has(k)) buckets.set(k, []);
        buckets.get(k)!.push(t);
      }
      const sorted = [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0]));
      const out = sorted.map(([k, items]) => ({
        key: new Date(k).toLocaleDateString('it-IT'),
        items
      }));
      if (without.length)
        out.push({ key: 'Senza scadenza', items: without });
      return out;
    }
    return [];
  })();

  onMount(load);
</script>

<svelte:head>
  <title>Task | ERP Spirito Alchemico</title>
</svelte:head>

<div class="space-y-4 max-w-[1600px] mx-auto pb-20">
  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
    <div>
      <h1 class="text-2xl font-bold text-[#1A1A1A] tracking-tight">Task</h1>
      <p class="text-sm text-[#6B7280]">Gestione compiti (solo amministratori)</p>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <div class="flex rounded-2xl border border-black/10 p-0.5 bg-white/80">
        <button
          type="button"
          class="rounded-xl px-3 py-1.5 text-xs font-medium transition-colors"
          class:bg-[#1A1A1A]={view === 'board'}
          class:text-white={view === 'board'}
          class:text-[#6B7280]={view !== 'board'}
          onclick={() => (view = 'board')}
          title="Board"
        >
          <LayoutGrid class="h-4 w-4 inline sm:mr-1" /><span class="hidden sm:inline">Board</span>
        </button>
        <button
          type="button"
          class="rounded-xl px-3 py-1.5 text-xs font-medium transition-colors"
          class:bg-[#1A1A1A]={view === 'list'}
          class:text-white={view === 'list'}
          class:text-[#6B7280]={view !== 'list'}
          onclick={() => (view = 'list')}
        >
          <List class="h-4 w-4 inline sm:mr-1" /><span class="hidden sm:inline">Lista</span>
        </button>
        <button
          type="button"
          class="rounded-xl px-3 py-1.5 text-xs font-medium transition-colors"
          class:bg-[#1A1A1A]={view === 'timeline'}
          class:text-white={view === 'timeline'}
          class:text-[#6B7280]={view !== 'timeline'}
          onclick={() => (view = 'timeline')}
        >
          <GanttChart class="h-4 w-4 inline sm:mr-1" /><span class="hidden sm:inline">Timeline</span>
        </button>
        <button
          type="button"
          class="rounded-xl px-3 py-1.5 text-xs font-medium transition-colors"
          class:bg-[#1A1A1A]={view === 'calendar'}
          class:text-white={view === 'calendar'}
          class:text-[#6B7280]={view !== 'calendar'}
          onclick={() => (view = 'calendar')}
        >
          <CalendarDays class="h-4 w-4 inline sm:mr-1" /><span class="hidden sm:inline">Calendario</span>
        </button>
      </div>
      <Button variant="primary" size="sm" onclick={createTask} disabled={creating || collectionMissing}>
        {#if creating}
          <Loader2 class="h-4 w-4 animate-spin" />
        {:else}
          <Plus class="h-4 w-4" />
        {/if}
        Nuova task
      </Button>
    </div>
  </div>

  {#if collectionMissing}
    <div class="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex gap-2">
      <AlertCircle class="h-5 w-5 flex-shrink-0" />
      <div>
        <p class="font-medium">Collection mancante</p>
        <p>
          Crea <code class="bg-black/5 px-1 rounded">admin_tasks</code> in PocketBase come da
          <code class="bg-black/5 px-1 rounded">docs/POCKETBASE_SCHEMA.md</code>.
        </p>
      </div>
    </div>
  {:else if loading}
    <div class="flex justify-center py-16 text-[#6B7280]">
      <Loader2 class="h-10 w-10 animate-spin" />
    </div>
  {:else}
    {#if error}
      <p class="text-sm text-rose-600">{error}</p>
    {/if}

    <!-- Filtri comuni -->
    <Card className="!p-3">
      <div class="flex flex-wrap gap-3 items-end text-sm">
        <div>
          <label class="block text-xs text-[#6B7280] mb-1" for="fp">Priorità</label>
          <select
            id="fp"
            class="rounded-xl border border-black/10 px-3 py-2 text-sm"
            bind:value={filterPriorita}
          >
            <option value="tutti">Tutte</option>
            <option value="critica">Critica</option>
            <option value="alta">Alta</option>
            <option value="media">Media</option>
            <option value="bassa">Bassa</option>
          </select>
        </div>
        <div>
          <label class="block text-xs text-[#6B7280] mb-1" for="fa">Assegnatario</label>
          <select
            id="fa"
            class="rounded-xl border border-black/10 px-3 py-2 text-sm min-w-[140px]"
            bind:value={filterAssegnatario}
          >
            <option value="">Tutti</option>
            {#each assignees as aid}
              {@const tt = tasks.find((x) => x.assegnatario === aid)}
              <option value={aid}>{tt ? userLabel(tt) : aid}</option>
            {/each}
          </select>
        </div>
        {#if view === 'list'}
          <div>
            <label class="block text-xs text-[#6B7280] mb-1" for="lg">Raggruppa per</label>
            <select id="lg" class="rounded-xl border border-black/10 px-3 py-2 text-sm" bind:value={listGroup}>
              <option value="priorita">Priorità</option>
              <option value="stato">Stato</option>
              <option value="assegnatario">Assegnatario</option>
              <option value="scadenza">Scadenza</option>
            </select>
          </div>
        {/if}
      </div>
    </Card>

    {#if view === 'board'}
      <div
        class="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory md:grid md:grid-cols-3 lg:grid-cols-6 md:overflow-visible"
      >
        {#each BOARD_STATO_ORDER.filter((s) => s !== 'annullato') as st}
          <div class="flex-shrink-0 w-[min(100%,280px)] md:w-auto snap-start flex flex-col rounded-2xl bg-white/60 border border-black/5 min-h-[200px]">
            <div class="px-3 py-2 border-b border-black/5 text-xs font-semibold text-[#6B7280]">
              {TASK_STATO_LABELS[st]}
            </div>
            <div class="p-2 space-y-2 flex-1">
              {#each byStato(st) as t}
                <button
                  type="button"
                  class="w-full text-left rounded-xl bg-[#F9FAFB] hover:bg-[#FFF3CD] border border-black/5 px-3 py-2 transition-colors"
                  onclick={() => goto(`/tasks/${t.id}`)}
                >
                  <p class="text-sm font-medium text-[#1A1A1A] line-clamp-2">{t.titolo}</p>
                  <div class="flex flex-wrap gap-1 mt-1">
                    <span
                      class="text-[10px] px-1.5 py-0.5 rounded-full {TASK_PRIORITA_BADGE[
                        t.priorita as AdminTaskPriorita
                      ]}"
                    >
                      {TASK_PRIORITA_LABELS[t.priorita as AdminTaskPriorita]}
                    </span>
                  </div>
                  <p class="text-[10px] text-[#6B7280] mt-1 flex items-center gap-1">
                    <User class="h-3 w-3" />{userLabel(t)}
                  </p>
                </button>
              {/each}
            </div>
          </div>
        {/each}
      </div>
      <p class="text-xs text-[#6B7280]">
        Apri una task per cambiare stato in dettaglio. Le task in «Annullato» non sono in board; usate la lista.
      </p>
    {:else if view === 'list'}
      <div class="space-y-6">
        {#each listGrouped as grp}
          {#if grp.items.length}
            <div>
              <h2 class="text-sm font-semibold text-[#1A1A1A] mb-2">{grp.key}</h2>
              <div class="space-y-2">
                {#each grp.items as t}
                  <button
                    type="button"
                    class="w-full flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-black/5 bg-white/80 px-4 py-3 text-left hover:bg-[#FFFBF0] transition-colors"
                    onclick={() => goto(`/tasks/${t.id}`)}
                  >
                    <span class="font-medium text-[#1A1A1A]">{t.titolo}</span>
                    <span class="text-xs text-[#6B7280]">{TASK_STATO_LABELS[t.stato as AdminTaskStato]}</span>
                    <span
                      class="text-[10px] px-2 py-0.5 rounded-full {TASK_PRIORITA_BADGE[
                        t.priorita as AdminTaskPriorita
                      ]}"
                    >
                      {TASK_PRIORITA_LABELS[t.priorita as AdminTaskPriorita]}
                    </span>
                    <span class="text-xs text-[#6B7280]">{userLabel(t)} · {fmtDate(t.scadenza)}</span>
                  </button>
                {/each}
              </div>
            </div>
          {/if}
        {/each}
      </div>
    {:else if view === 'timeline'}
      <Card>
        <h2 class="text-sm font-semibold mb-4">Timeline (inizio / scadenza)</h2>
        {#if timelineRows.length === 0}
          <p class="text-sm text-[#6B7280]">Nessuna task con date. Imposta inizio o scadenza nel dettaglio.</p>
        {:else}
          <div class="relative space-y-4 pl-4 border-l-2 border-[#F5D547]/60">
            {#each timelineRows as t}
              <div class="relative">
                <span
                  class="absolute -left-[21px] top-1.5 h-3 w-3 rounded-full bg-[#F5D547] border-2 border-white"
                ></span>
                <button
                  type="button"
                  class="w-full text-left rounded-xl bg-[#F9FAFB] px-3 py-2 hover:bg-[#FFF3CD] transition-colors"
                  onclick={() => goto(`/tasks/${t.id}`)}
                >
                  <p class="font-medium text-[#1A1A1A]">{t.titolo}</p>
                  <p class="text-xs text-[#6B7280]">
                    {t.inizio ? `Inizio ${fmtDate(t.inizio)}` : ''}
                    {t.inizio && t.scadenza ? ' · ' : ''}
                    {t.scadenza ? `Scadenza ${fmtDate(t.scadenza)}` : ''}
                  </p>
                </button>
              </div>
            {/each}
          </div>
        {/if}
      </Card>
    {:else if view === 'calendar'}
      <Card>
        <div class="flex items-center justify-between mb-4">
          <Button
            variant="ghost"
            size="sm"
            onclick={() => {
              if (calMonth === 0) {
                calMonth = 11;
                calYear -= 1;
              } else calMonth -= 1;
            }}
          >
            ←
          </Button>
          <h2 class="text-sm font-semibold capitalize">
            {calStart.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onclick={() => {
              if (calMonth === 11) {
                calMonth = 0;
                calYear += 1;
              } else calMonth += 1;
            }}
          >
            →
          </Button>
        </div>
        <div class="grid grid-cols-7 gap-1 text-center text-[10px] sm:text-xs font-medium text-[#6B7280] mb-1">
          {#each ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'] as w}
            <div>{w}</div>
          {/each}
        </div>
        <div class="grid grid-cols-7 gap-1">
          {#each Array(firstWeekday) as _}
            <div class="min-h-[72px] sm:min-h-[88px]"></div>
          {/each}
          {#each Array(daysInMonth) as _, i}
            {@const day = i + 1}
            {@const dayTasks = tasksOnDay(day)}
            <div
              class="min-h-[72px] sm:min-h-[88px] rounded-lg border border-black/5 bg-[#FAFAF9] p-1 text-left"
            >
              <span class="text-[10px] sm:text-xs font-medium text-[#1A1A1A]">{day}</span>
              <div class="mt-1 space-y-0.5 max-h-[52px] sm:max-h-[64px] overflow-y-auto scrollbar-hide">
                {#each dayTasks as t}
                  <button
                    type="button"
                    class="block w-full truncate rounded px-0.5 text-[9px] sm:text-[10px] text-left bg-[#FFF3CD] text-[#1A1A1A]"
                    onclick={() => goto(`/tasks/${t.id}`)}
                  >
                    {t.titolo}
                  </button>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      </Card>
    {/if}
  {/if}
</div>
