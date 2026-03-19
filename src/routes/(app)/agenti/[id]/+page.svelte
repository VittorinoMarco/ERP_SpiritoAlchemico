<script lang="ts">
  import { page } from '$app/stores';
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { pb } from '$lib/pocketbase';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Modal from '$lib/components/ui/Modal.svelte';
  import BarChart from '$lib/components/charts/BarChart.svelte';
  import {
    ArrowLeft,
    Users,
    ShoppingCart,
    Euro,
    Percent,
    Settings,
    CheckCircle,
    ChevronRight,
    UserPlus,
    UserMinus
  } from 'lucide-svelte';
  import type { AgentCommission, CommissionStato } from '$lib/types/agent';
  import { COMMISSION_STATO_LABELS, COMMISSION_STATO_BADGE } from '$lib/types/agent';

  const agentId = $page.params.id;

  type TabId = 'overview' | 'provvigioni';

  let agent: {
    id: string;
    nome?: string;
    cognome?: string;
    email?: string;
    provvigione_percentuale?: number;
  } | null = null;
  let clients: { id: string; ragione_sociale?: string }[] = [];
  let orders: { id: string; numero_ordine?: string; data_ordine?: string; totale?: number; stato?: string }[] = [];
  let commissions: (AgentCommission & { expand?: { ordine?: { numero_ordine?: string } } })[] = [];
  let loading = true;
  let activeTab: TabId = 'overview';
  let configModalOpen = false;
  let provvigionePercentuale = '';
  let savingConfig = false;
  let liquidateModalOpen = false;
  let liquidateDate = '';
  let liquidating = false;
  /** 'all' = tutte le maturate; altrimenti id selezionati */
  let liquidateTarget: 'all' | string[] = 'all';
  let selectedCommissionIds: string[] = [];
  let addClientModalOpen = false;
  let availableClients: { id: string; ragione_sociale?: string }[] = [];
  let selectedClientToAdd = '';
  let addingClient = false;
  let removingClientId: string | null = null;
  /** Nome/email dalla lista agenti (sessionStorage) se PocketBase non espone i campi su getOne */
  let fallbackDisplayName = '';
  let fallbackEmail = '';

  const today = new Date().toISOString().split('T')[0];

  function nameFromUserRecord(u: Record<string, unknown> | null | undefined): string {
    if (!u) return '';
    const nome = u.nome as string | undefined;
    const cognome = u.cognome as string | undefined;
    const parts = [nome, cognome].filter(Boolean);
    const joined = parts.length ? parts.join(' ') : '';
    const n =
      (u.name as string | undefined) ||
      joined ||
      (u.username as string | undefined) ||
      (u.email as string | undefined);
    return n && String(n).trim() ? String(n).trim() : '';
  }

  function agentName(): string {
    if (!agent) {
      return fallbackDisplayName || `Agente (${agentId.slice(0, 8)}…)`;
    }
    const fromRecord = nameFromUserRecord(agent as unknown as Record<string, unknown>);
    if (fromRecord) return fromRecord;
    if (fallbackDisplayName) return fallbackDisplayName;
    return `Agente (${agentId.slice(0, 8)}…)`;
  }

  function agentSubtitleEmail(): string {
    const e = agent?.email;
    if (e && String(e).trim()) return String(e).trim();
    return fallbackEmail;
  }

  /** Unisce su `agent` i campi profilo da un altro record users (stessa API, stesso id). */
  function mergeAgentProfile(from: Record<string, unknown> | null | undefined) {
    if (!agent || !from || (from.id as string) !== agentId) return;
    const merged = { ...agent } as Record<string, unknown>;
    if (!nameFromUserRecord(merged)) {
      merged.nome = merged.nome || from.nome;
      merged.cognome = merged.cognome || from.cognome;
      merged.name = merged.name || from.name;
    }
    const fe = merged.email as string | undefined;
    if (!fe || !String(fe).trim()) {
      merged.email = (from.email as string | undefined) || fe;
    }
    agent = merged as typeof agent;
  }

  function formatDate(s: string | null | undefined): string {
    if (!s) return '—';
    try {
      return new Date(s).toLocaleDateString('it-IT', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    } catch {
      return '—';
    }
  }

  function formatEuro(n: number): string {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);
  }

  /** Imponibile usato per la provvigione (campo DB o ricavo da importo e %) */
  function commissionImponibileBase(c: AgentCommission): number {
    const t = Number((c as any).totale_ordine);
    if (!Number.isNaN(t) && t > 0) return Math.round(t * 100) / 100;
    const pct = Number(c.percentuale) || 0;
    const imp = Number(c.importo) || 0;
    if (pct > 0 && imp > 0) return Math.round((imp * 100 * 100) / pct) / 100;
    return 0;
  }

  $: ordiniNumeroById = new Map(orders.map((o) => [o.id, o.numero_ordine ?? '']));

  function commissionNumeroOrdine(c: AgentCommission & { expand?: { ordine?: { numero_ordine?: string } } }): string {
    const fromExpand = c.expand?.ordine?.numero_ordine;
    if (fromExpand) return fromExpand;
    const oid = (c as any).ordine;
    if (oid && typeof oid === 'string') {
      const n = ordiniNumeroById.get(oid);
      if (n) return n;
    }
    return '—';
  }

  function commissionOrdineId(c: AgentCommission): string | null {
    const oid = (c as any).ordine;
    return oid && typeof oid === 'string' ? oid : null;
  }

  function toggleCommissionSelect(id: string) {
    if (selectedCommissionIds.includes(id)) {
      selectedCommissionIds = selectedCommissionIds.filter((x) => x !== id);
    } else {
      selectedCommissionIds = [...selectedCommissionIds, id];
    }
  }

  function selectAllMaturate() {
    selectedCommissionIds = maturate.map((c) => c.id);
  }

  function clearCommissionSelection() {
    selectedCommissionIds = [];
  }

  $: maturate = commissions.filter((c) => c.stato === 'maturata');
  $: liquidate = commissions.filter((c) => c.stato === 'liquidata');
  $: totaleMaturate = maturate.reduce((s, c) => s + (c.importo ?? 0), 0);
  $: totaleLiquidate = liquidate.reduce((s, c) => s + (c.importo ?? 0), 0);
  $: provvigioneTotale = totaleMaturate + totaleLiquidate;

  $: selectedMaturateList = maturate.filter((c) => selectedCommissionIds.includes(c.id));
  $: totaleSelectedMaturate = selectedMaturateList.reduce((s, c) => s + (c.importo ?? 0), 0);

  $: liquidateModalCount =
    liquidateTarget === 'all'
      ? maturate.length
      : (liquidateTarget as string[]).length;
  $: liquidateModalTotal =
    liquidateTarget === 'all'
      ? totaleMaturate
      : maturate
          .filter((c) => (liquidateTarget as string[]).includes(c.id))
          .reduce((s, c) => s + (c.importo ?? 0), 0);

  $: performanceMensile = (() => {
    const byMonth: Record<string, number> = {};
    for (const o of orders) {
      if (o.stato !== 'consegnato' && o.stato !== 'completato') continue;
      const d = o.data_ordine ?? '';
      if (!d) continue;
      const key = d.slice(0, 7);
      byMonth[key] = (byMonth[key] ?? 0) + (Number(o.totale) || 0);
    }
    const keys = Object.keys(byMonth).sort();
    const last6 = keys.slice(-6);
    return {
      labels: last6.map((k) => {
        const [y, m] = k.split('-');
        return new Date(parseInt(y, 10), parseInt(m, 10) - 1).toLocaleDateString('it-IT', {
          month: 'short',
          year: '2-digit'
        });
      }),
      values: last6.map((k) => byMonth[k] ?? 0)
    };
  })();

  $: perfChartConfig = {
    data: {
      labels: performanceMensile.labels,
      datasets: [
        {
          label: 'Fatturato',
          data: performanceMensile.values,
          backgroundColor: '#F5D547',
          borderRadius: 6
        }
      ]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false } },
        y: { grid: { color: '#E5E7EB' }, beginAtZero: true }
      }
    }
  };

  onMount(async () => {
    if (browser) {
      try {
        fallbackDisplayName = sessionStorage.getItem(`agentDisplay:${agentId}`) ?? '';
        fallbackEmail = sessionStorage.getItem(`agentEmail:${agentId}`) ?? '';
      } catch {
        fallbackDisplayName = '';
        fallbackEmail = '';
      }
    }
    try {
      const [oneResult, listResult] = await Promise.allSettled([
        pb.collection('users').getOne(agentId),
        // Stessa query “lista agenti”: PB spesso espone nome/email qui anche quando getOne è ridotto
        pb.collection('users').getFullList({ filter: `ruolo = "agente" && id = "${agentId}"` })
      ]);
      agent =
        oneResult.status === 'fulfilled'
          ? (oneResult.value as typeof agent)
          : listResult.status === 'fulfilled' && listResult.value[0]
            ? (listResult.value[0] as typeof agent)
            : null;
      let profileRow: Record<string, unknown> | undefined =
        listResult.status === 'fulfilled' && listResult.value[0]
          ? (listResult.value[0] as Record<string, unknown>)
          : undefined;
      if (!profileRow) {
        try {
          const byId = await pb.collection('users').getFullList({ filter: `id = "${agentId}"` });
          profileRow = byId[0] as Record<string, unknown> | undefined;
        } catch {
          profileRow = undefined;
        }
      }
      if (agent && profileRow) mergeAgentProfile(profileRow);
      else if (!agent && profileRow) {
        agent = profileRow as typeof agent;
      }
      provvigionePercentuale = String(agent?.provvigione_percentuale ?? 0);

      const [clientsResult, ordersResult, commResult] = await Promise.allSettled([
        pb.collection('clients').getFullList({ filter: `agente = "${agentId}"` }),
        pb.collection('orders').getFullList({
          filter: `agente = "${agentId}"`,
          sort: '-data_ordine',
          expand: 'agente'
        }),
        pb.collection('agent_commissions').getFullList({
          filter: `agente = "${agentId}"`,
          expand: 'agente,ordine',
          sort: '-data_maturata'
        })
      ]);

      clients = clientsResult.status === 'fulfilled' ? clientsResult.value : [];
      const ordersList = ordersResult.status === 'fulfilled' ? ordersResult.value : [];
      orders = ordersList;

      // Arricchisci profilo da expand ordine (se presente)
      const agFromOrder = (ordersList as any[])[0]?.expand?.agente;
      if (agFromOrder) mergeAgentProfile(agFromOrder as Record<string, unknown>);

      let commList =
        commResult.status === 'fulfilled' ? commResult.value : [];
      if (commResult.status === 'rejected') {
        try {
          commList = await pb.collection('agent_commissions').getFullList({
            filter: `agente = "${agentId}"`,
            expand: 'agente,ordine',
            sort: '-created'
          });
          commList = (commList as any[]).sort(
            (a, b) => (b.data_maturata ?? b.created ?? '').localeCompare(a.data_maturata ?? a.created ?? '')
          );
        } catch {
          commList = [];
        }
      }

      // Nome/email da expand provvigioni (utile se zero ordini ma ci sono commissioni)
      const agFromComm = (commList as any[]).find((c) => c.expand?.agente)?.expand?.agente;
      if (agFromComm) mergeAgentProfile(agFromComm as Record<string, unknown>);

      const ordersById = new Map(
        (ordersList as any[]).map((o) => [o.id, { numero_ordine: o.numero_ordine }])
      );
      commissions = (commList as any[]).map((c) => {
        const base = { ...c } as (typeof commissions)[0];
        base.expand = { ...base.expand };
        if (!base.expand?.ordine && base.ordine) {
          const ord = ordersById.get(base.ordine);
          base.expand.ordine = ord ? { numero_ordine: ord.numero_ordine } : undefined;
        }
        return base;
      });
    } catch {
      agent = null;
      clients = [];
      orders = [];
      commissions = [];
    } finally {
      loading = false;
    }
  });

  async function saveConfig() {
    if (!agent || savingConfig) return;
    const pct = parseFloat(provvigionePercentuale);
    if (isNaN(pct) || pct < 0 || pct > 100) return;
    savingConfig = true;
    try {
      await pb.collection('users').update(agentId, { provvigione_percentuale: pct });
      agent = await pb.collection('users').getOne(agentId) as typeof agent;
      configModalOpen = false;
    } catch (e) {
      console.error(e);
    } finally {
      savingConfig = false;
    }
  }

  async function liquidaProvvigioni() {
    if (!liquidateDate || liquidating) return;
    const toLiquidate =
      liquidateTarget === 'all'
        ? maturate
        : maturate.filter((c) => (liquidateTarget as string[]).includes(c.id));
    if (toLiquidate.length === 0) return;
    liquidating = true;
    try {
      for (const c of toLiquidate) {
        await pb.collection('agent_commissions').update(c.id, {
          stato: 'liquidata',
          data_liquidazione: liquidateDate
        });
      }
      let commList: any[];
      try {
        commList = await pb.collection('agent_commissions').getFullList({
          filter: `agente = "${agentId}"`,
          expand: 'ordine',
          sort: '-data_maturata'
        });
      } catch {
        commList = await pb.collection('agent_commissions').getFullList({
          filter: `agente = "${agentId}"`,
          sort: '-created'
        });
        commList = commList.sort(
          (a: any, b: any) => (b.data_maturata ?? b.created ?? '').localeCompare(a.data_maturata ?? a.created ?? '')
        );
      }
      const ordersById = new Map(orders.map((o) => [o.id, { numero_ordine: o.numero_ordine }]));
      commissions = commList.map((c: any) => {
        const base = { ...c } as (typeof commissions)[0];
        base.expand = { ...base.expand };
        if (!base.expand?.ordine && base.ordine) {
          const ord = ordersById.get(base.ordine);
          base.expand.ordine = ord ? { numero_ordine: ord.numero_ordine } : undefined;
        }
        return base;
      });
      liquidateModalOpen = false;
      liquidateDate = '';
      liquidateTarget = 'all';
      selectedCommissionIds = [];
    } catch (e) {
      console.error(e);
    } finally {
      liquidating = false;
    }
  }

  function openLiquidateAll() {
    liquidateTarget = 'all';
    liquidateDate = today;
    liquidateModalOpen = true;
  }

  function openLiquidateSelected() {
    if (selectedCommissionIds.length === 0) return;
    liquidateTarget = [...selectedCommissionIds];
    liquidateDate = today;
    liquidateModalOpen = true;
  }

  async function openAddClientModal() {
    addClientModalOpen = true;
    selectedClientToAdd = '';
    try {
      const all = await pb.collection('clients').getFullList();
      availableClients = (all as any[]).filter((c) => c.agente !== agentId);
    } catch {
      availableClients = [];
    }
  }

  async function assignClient() {
    if (!selectedClientToAdd || addingClient) return;
    addingClient = true;
    try {
      await pb.collection('clients').update(selectedClientToAdd, { agente: agentId });
      const updated = await pb.collection('clients').getFullList({ filter: `agente = "${agentId}"` });
      clients = updated;
      addClientModalOpen = false;
    } catch (e) {
      console.error(e);
    } finally {
      addingClient = false;
    }
  }

  async function removeClient(clientId: string) {
    if (removingClientId) return;
    removingClientId = clientId;
    try {
      await pb.collection('clients').update(clientId, { agente: '' });
      clients = clients.filter((c) => c.id !== clientId);
    } catch (e) {
      console.error(e);
    } finally {
      removingClientId = null;
    }
  }
</script>

<svelte:head>
  <title>Agente {agentName()} | ERP Spirito Alchemico</title>
</svelte:head>

<div class="space-y-6">
  <div class="flex items-center gap-4">
    <button
      type="button"
      class="p-2 rounded-2xl text-[#6B7280] hover:bg-black/5 transition-colors"
      onclick={() => goto('/agenti')}
      aria-label="Indietro"
    >
      <ArrowLeft class="h-5 w-5" />
    </button>
    <div class="flex-1">
      <h1 class="text-3xl font-bold text-[#1A1A1A] tracking-tight">{agentName()}</h1>
      <p class="text-sm text-[#6B7280] mt-0.5">{agentSubtitleEmail() || '—'}</p>
    </div>
    <Button
      variant="ghost"
      size="sm"
      className="rounded-2xl"
      onclick={() => {
        provvigionePercentuale = String(agent?.provvigione_percentuale ?? 0);
        configModalOpen = true;
      }}
    >
      <Settings class="h-4 w-4" />
      Config. Provvigione
    </Button>
  </div>

  {#if loading}
    <Card>
      <div class="py-16 text-center">
        <p class="text-sm text-[#6B7280]">Caricamento...</p>
      </div>
    </Card>
  {:else if !agent}
    <Card>
      <div class="py-16 text-center">
        <p class="text-sm text-[#6B7280]">Agente non trovato</p>
        <Button variant="ghost" className="mt-4" onclick={() => goto('/agenti')}>
          Torna agli agenti
        </Button>
      </div>
    </Card>
  {:else}
    <!-- Dashboard riepilogo provvigioni -->
    <div class="flex flex-wrap gap-4">
      <div class="rounded-2xl bg-[#1A1A1A] px-5 py-4 text-white">
        <p class="text-xs text-white/70">Provvigione totale</p>
        <p class="text-2xl font-bold">{formatEuro(provvigioneTotale)}</p>
      </div>
      <div class="rounded-2xl bg-[#FFF3CD] px-5 py-4">
        <p class="text-xs text-[#6B7280]">Da riscuotere</p>
        <p class="text-2xl font-bold text-[#F5D547]">{formatEuro(totaleMaturate)}</p>
      </div>
      <div class="rounded-2xl bg-green-50 px-5 py-4">
        <p class="text-xs text-[#6B7280]">Liquidate</p>
        <p class="text-2xl font-bold text-green-600">{formatEuro(totaleLiquidate)}</p>
      </div>
      <div class="rounded-2xl bg-[#E5E7EB] px-5 py-4">
        <p class="text-xs text-[#6B7280]">Percentuale</p>
        <p class="text-2xl font-bold text-[#1A1A1A]">{agent?.provvigione_percentuale ?? 0}%</p>
      </div>
    </div>

    <div class="flex gap-2">
      <button
        type="button"
        class="rounded-full px-5 py-2.5 text-sm font-medium transition-all {activeTab === 'overview'
          ? 'bg-[#F5D547] text-[#1A1A1A]'
          : 'bg-[#E5E7EB] text-[#6B7280] hover:bg-[#D1D5DB]'}"
        onclick={() => (activeTab = 'overview')}
      >
        Panoramica
      </button>
      <button
        type="button"
        class="rounded-full px-5 py-2.5 text-sm font-medium transition-all {activeTab === 'provvigioni'
          ? 'bg-[#F5D547] text-[#1A1A1A]'
          : 'bg-[#E5E7EB] text-[#6B7280] hover:bg-[#D1D5DB]'}"
        onclick={() => (activeTab = 'provvigioni')}
      >
        Provvigioni
      </button>
    </div>

    {#if activeTab === 'overview'}
      <div class="grid gap-6 lg:grid-cols-3">
        <Card>
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-sm font-medium text-[#1A1A1A]">Clienti assegnati</h2>
            <Button
              variant="ghost"
              size="sm"
              className="rounded-xl"
              onclick={() => openAddClientModal()}
            >
              <UserPlus class="h-4 w-4" />
              Aggiungi
            </Button>
          </div>
          <div class="space-y-2 max-h-64 overflow-y-auto">
            {#each clients.slice(0, 20) as c}
              <div
                class="flex items-center justify-between py-2 border-b border-black/5 last:border-0 group rounded-lg px-2 -mx-2"
              >
                <div
                  class="flex-1 min-w-0 cursor-pointer hover:bg-[#FFFDE7] rounded-lg py-1 -my-1 px-1 -mx-1"
                  onclick={() => goto(`/clienti/${c.id}`)}
                  role="button"
                  tabindex="0"
                  onkeydown={(e) => e.key === 'Enter' && goto(`/clienti/${c.id}`)}
                >
                  <span class="text-sm font-medium text-[#1A1A1A]">{c.ragione_sociale ?? '—'}</span>
                </div>
                <button
                  type="button"
                  class="p-1.5 rounded-lg text-[#6B7280] hover:bg-red-50 hover:text-red-600 transition-colors"
                  onclick={(e) => { e.stopPropagation(); removeClient(c.id); }}
                  disabled={removingClientId === c.id}
                  title="Rimuovi da questo agente"
                  aria-label="Rimuovi cliente"
                >
                  <UserMinus class="h-4 w-4" />
                </button>
              </div>
            {/each}
          </div>
          {#if clients.length > 20}
            <p class="text-xs text-[#6B7280] mt-2">+{clients.length - 20} altri</p>
          {/if}
          {#if clients.length === 0}
            <p class="py-8 text-center text-sm text-[#6B7280]">Nessun cliente assegnato</p>
          {/if}
        </Card>

        <Card>
          <h2 class="text-sm font-medium text-[#1A1A1A] mb-4">Ordini recenti</h2>
          <div class="space-y-2 max-h-64 overflow-y-auto">
            {#each orders.slice(0, 10) as o}
              <div
                class="flex items-center justify-between py-2 border-b border-black/5 last:border-0 cursor-pointer hover:bg-[#FFFDE7] rounded-lg px-2 -mx-2"
                onclick={() => goto(`/ordini/${o.id}`)}
                role="button"
                tabindex="0"
                onkeydown={(e) => e.key === 'Enter' && goto(`/ordini/${o.id}`)}
              >
                <div>
                  <span class="text-sm font-medium text-[#1A1A1A]">{o.numero_ordine ?? '—'}</span>
                  <span class="text-xs text-[#6B7280] ml-2">{formatDate(o.data_ordine)}</span>
                </div>
                <span class="text-sm font-bold text-[#1A1A1A]">{formatEuro(o.totale ?? 0)}</span>
              </div>
            {/each}
          </div>
          {#if orders.length === 0}
            <p class="py-8 text-center text-sm text-[#6B7280]">Nessun ordine</p>
          {/if}
        </Card>

        <Card className="lg:col-span-1">
          <h2 class="text-sm font-medium text-[#1A1A1A] mb-4">Performance mensile</h2>
          <div class="h-48">
            <BarChart config={perfChartConfig} />
          </div>
        </Card>
      </div>
    {/if}

    {#if activeTab === 'provvigioni'}
      <Card>
        <p class="text-sm text-[#6B7280] mb-4">
          <strong class="text-[#1A1A1A]">Una provvigione per ordine.</strong> L’importo è calcolato sull’
          <strong>imponibile totale dell’ordine</strong> (totale con IVA ÷ 1,22 oppure campo imponibile), non sulle singole righe prodotto.
        </p>
        <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div class="flex flex-wrap gap-4">
            <div>
              <p class="text-xs text-[#6B7280]">Maturate</p>
              <p class="text-xl font-bold text-[#F5D547]">{formatEuro(totaleMaturate)}</p>
            </div>
            <div>
              <p class="text-xs text-[#6B7280]">Liquidate</p>
              <p class="text-xl font-bold text-green-600">{formatEuro(totaleLiquidate)}</p>
            </div>
            {#if selectedCommissionIds.length > 0}
              <div>
                <p class="text-xs text-[#6B7280]">Selezionate</p>
                <p class="text-xl font-bold text-[#1A1A1A]">{formatEuro(totaleSelectedMaturate)}</p>
              </div>
            {/if}
          </div>
          {#if maturate.length > 0}
            <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap">
              <Button
                variant="ghost"
                size="sm"
                className="rounded-2xl text-xs"
                onclick={selectAllMaturate}
              >
                Seleziona tutte (maturate)
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="rounded-2xl text-xs"
                onclick={clearCommissionSelection}
                disabled={selectedCommissionIds.length === 0}
              >
                Deseleziona
              </Button>
              <Button
                variant="primary"
                size="sm"
                className="rounded-2xl !bg-[#1A1A1A]"
                disabled={selectedCommissionIds.length === 0}
                onclick={openLiquidateSelected}
              >
                <CheckCircle class="h-4 w-4" />
                Liquida selezionate
              </Button>
              <Button
                variant="primary"
                size="sm"
                className="rounded-2xl !bg-[#6B7280]"
                onclick={openLiquidateAll}
              >
                <CheckCircle class="h-4 w-4" />
                Liquida tutte
              </Button>
            </div>
          {/if}
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-black/5">
                <th class="px-2 py-3 w-10" aria-label="Seleziona"></th>
                <th class="px-4 py-3 text-left text-xs font-medium text-[#6B7280]">Ordine</th>
                <th class="px-4 py-3 text-right text-xs font-medium text-[#6B7280]">Imponibile base</th>
                <th class="px-4 py-3 text-right text-xs font-medium text-[#6B7280]">%</th>
                <th class="px-4 py-3 text-right text-xs font-medium text-[#6B7280]">Importo</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-[#6B7280]">Stato</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-[#6B7280]">Data</th>
              </tr>
            </thead>
            <tbody>
              {#each commissions as c}
                <tr class="border-b border-black/5 last:border-0 hover:bg-[#FFFDE7]">
                  <td class="px-2 py-3 align-middle">
                    {#if c.stato === 'maturata'}
                      <input
                        type="checkbox"
                        class="h-4 w-4 rounded border-black/20"
                        checked={selectedCommissionIds.includes(c.id)}
                        onchange={() => toggleCommissionSelect(c.id)}
                        aria-label="Seleziona provvigione"
                      />
                    {/if}
                  </td>
                  <td class="px-4 py-3 font-medium text-[#1A1A1A]">
                    {#if commissionOrdineId(c)}
                      <a
                        href="/ordini/{commissionOrdineId(c)}"
                        class="text-[#1A1A1A] underline decoration-[#F5D547] hover:text-[#6B7280]"
                      >{commissionNumeroOrdine(c)}</a>
                    {:else}
                      {commissionNumeroOrdine(c)}
                    {/if}
                  </td>
                  <td class="px-4 py-3 text-right text-[#6B7280]">{formatEuro(commissionImponibileBase(c))}</td>
                  <td class="px-4 py-3 text-right text-[#6B7280]">{c.percentuale ?? 0}%</td>
                  <td class="px-4 py-3 text-right font-bold text-[#1A1A1A]">{formatEuro(c.importo ?? 0)}</td>
                  <td class="px-4 py-3">
                    <span
                      class="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium {COMMISSION_STATO_BADGE[
                        c.stato as CommissionStato
                      ] ?? 'bg-gray-100'}"
                    >
                      {COMMISSION_STATO_LABELS[c.stato as CommissionStato]}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-[#6B7280]">
                    {c.stato === 'liquidata' && c.data_liquidazione
                      ? formatDate(c.data_liquidazione)
                      : formatDate(c.data_maturata)}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        {#if commissions.length === 0}
          <p class="py-12 text-center text-sm text-[#6B7280]">Nessuna provvigione</p>
        {/if}
      </Card>
    {/if}
  {/if}
</div>

<!-- Modal Config Provvigione -->
<Modal
  open={configModalOpen}
  title="Configurazione provvigione"
  size="sm"
  on:close={() => (configModalOpen = false)}
>
  <form onsubmit={(e) => { e.preventDefault(); saveConfig(); }} class="space-y-5">
    <div>
      <label for="pct" class="block text-sm font-medium text-[#1A1A1A] mb-2">
        Percentuale provvigione (%)
      </label>
      <input
        id="pct"
        type="number"
        min="0"
        max="100"
        step="0.5"
        bind:value={provvigionePercentuale}
        class="w-full rounded-2xl border border-black/5 bg-white/80 px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#F5D547]"
      />
    </div>
    <div class="flex justify-end gap-3">
      <Button type="button" variant="ghost" onclick={() => (configModalOpen = false)}>
        Annulla
      </Button>
      <Button type="submit" variant="primary" disabled={savingConfig}>
        {savingConfig ? 'Salvataggio...' : 'Salva'}
      </Button>
    </div>
  </form>
</Modal>

<!-- Modal Aggiungi Cliente -->
<Modal
  open={addClientModalOpen}
  title="Assegna cliente all'agente"
  size="sm"
  on:close={() => (addClientModalOpen = false)}
>
  <form onsubmit={(e) => { e.preventDefault(); assignClient(); }} class="space-y-5">
    <div>
      <label for="client_select" class="block text-sm font-medium text-[#1A1A1A] mb-2">
        Seleziona cliente da assegnare
      </label>
      <select
        id="client_select"
        bind:value={selectedClientToAdd}
        class="w-full rounded-2xl border border-black/5 bg-white/80 px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#F5D547]"
      >
        <option value="">— Seleziona —</option>
        {#each availableClients as c}
          <option value={c.id}>{c.ragione_sociale ?? c.id}</option>
        {/each}
      </select>
      {#if availableClients.length === 0 && addClientModalOpen}
        <p class="text-xs text-[#6B7280] mt-2">Tutti i clienti sono già assegnati a questo agente.</p>
      {/if}
    </div>
    <div class="flex justify-end gap-3">
      <Button type="button" variant="ghost" onclick={() => (addClientModalOpen = false)}>
        Annulla
      </Button>
      <Button type="submit" variant="primary" disabled={addingClient || !selectedClientToAdd}>
        {addingClient ? 'Salvataggio...' : 'Assegna'}
      </Button>
    </div>
  </form>
</Modal>

<!-- Modal Liquida Provvigioni -->
<Modal
  open={liquidateModalOpen}
  title="Liquida provvigioni"
  size="sm"
  on:close={() => {
    liquidateModalOpen = false;
    liquidateTarget = 'all';
  }}
>
  <form onsubmit={(e) => { e.preventDefault(); liquidaProvvigioni(); }} class="space-y-5">
    <p class="text-sm text-[#6B7280]">
      Segna come liquidate <strong>{liquidateModalCount}</strong> provvigioni per un totale di
      <strong>{formatEuro(liquidateModalTotal)}</strong>.
      {#if liquidateTarget !== 'all'}
        <span class="block mt-1 text-xs">(solo le righe selezionate)</span>
      {/if}
    </p>
    <div>
      <label for="liq_date" class="block text-sm font-medium text-[#1A1A1A] mb-2">
        Data liquidazione
      </label>
      <input
        id="liq_date"
        type="date"
        bind:value={liquidateDate}
        required
        class="w-full rounded-2xl border border-black/5 bg-white/80 px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#F5D547]"
      />
    </div>
    <div class="flex justify-end gap-3">
      <Button type="button" variant="ghost" onclick={() => (liquidateModalOpen = false)}>
        Annulla
      </Button>
      <Button type="submit" variant="primary" disabled={liquidating || !liquidateDate}>
        {liquidating ? 'Elaborazione...' : 'Conferma'}
      </Button>
    </div>
  </form>
</Modal>
