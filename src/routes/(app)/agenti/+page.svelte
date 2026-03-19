<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { pb } from '$lib/pocketbase';
  import Card from '$lib/components/ui/Card.svelte';
  import { Users, ShoppingCart, Euro, Percent, ChevronRight } from 'lucide-svelte';
  import type { AgentCommission, CommissionStato } from '$lib/types/agent';
  import { COMMISSION_STATO_LABELS, COMMISSION_STATO_BADGE } from '$lib/types/agent';

  type TabId = 'agenti' | 'provvigioni';
  let activeTab: TabId = 'agenti';

  type AgentWithStats = {
    id: string;
    nome?: string;
    cognome?: string;
    email?: string;
    provvigione_percentuale?: number;
    nClienti: number;
    ordiniMese: number;
    fatturatoMese: number;
    provvigioniMaturate: number;
  };

  let agents: AgentWithStats[] = [];
  let allCommissions: (AgentCommission & {
    expand?: { agente?: { nome?: string; cognome?: string; email?: string }; ordine?: { numero_ordine?: string } };
  })[] = [];
  let loading = true;

  const now = new Date();
  const meseStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const meseEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

  $: totaleMaturateGlobale = allCommissions
    .filter((c) => c.stato === 'maturata')
    .reduce((s, c) => s + (c.importo ?? 0), 0);
  $: totaleLiquidateGlobale = allCommissions
    .filter((c) => c.stato === 'liquidata')
    .reduce((s, c) => s + (c.importo ?? 0), 0);

  function agentName(a: AgentWithStats): string {
    if (a.nome) return [a.nome, a.cognome].filter(Boolean).join(' ');
    return a.email ?? '—';
  }

  function agentLabel(ag: { nome?: string; cognome?: string; email?: string } | undefined): string {
    if (!ag) return '—';
    if (ag.nome) return [ag.nome, ag.cognome].filter(Boolean).join(' ');
    return ag.email ?? '—';
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

  onMount(async () => {
    try {
      // Usa allSettled così gli agenti (da users) caricano anche se agent_commissions fallisce (es. 400)
      const [
        usersResult,
        clientsResult,
        ordersResult,
        invoicesResult,
        commissionsMaturateResult,
        commissionsAllResult
      ] = await Promise.allSettled([
        pb.collection('users').getFullList({ filter: 'ruolo = "agente"' }),
        pb.collection('clients').getFullList(),
        pb.collection('orders').getFullList({ expand: 'cliente' }),
        pb.collection('invoices').getFullList({ expand: 'ordine' }),
        pb.collection('agent_commissions').getFullList({ filter: 'stato = "maturata"' }),
        pb.collection('agent_commissions').getFullList({
          expand: 'agente,ordine',
          sort: '-data_maturata'
        })
      ]);

      const usersList = usersResult.status === 'fulfilled' ? usersResult.value : [];
      const clientsList = clientsResult.status === 'fulfilled' ? clientsResult.value : [];
      const ordersList = ordersResult.status === 'fulfilled' ? ordersResult.value : [];
      const invoicesList = invoicesResult.status === 'fulfilled' ? invoicesResult.value : [];
      let commissionsMaturate =
        commissionsMaturateResult.status === 'fulfilled' ? commissionsMaturateResult.value : [];
      let commissionsAll =
        commissionsAllResult.status === 'fulfilled' ? commissionsAllResult.value : [];

      // Fallback: se agent_commissions con expand/sort=-data_maturata dà 400 (campo mancante, ecc.)
      // riprova con sort=-created (campo sempre presente)
      if (commissionsAllResult.status === 'rejected' && commissionsAll.length === 0) {
        try {
          commissionsAll = await pb.collection('agent_commissions').getFullList({
            expand: 'agente,ordine',
            sort: '-created'
          });
          commissionsAll = (commissionsAll as any[]).sort(
            (a, b) => (b.data_maturata ?? b.created ?? '').localeCompare(a.data_maturata ?? a.created ?? '')
          );
        } catch {
          try {
            commissionsAll = await pb.collection('agent_commissions').getFullList({ sort: '-created' });
            commissionsAll = (commissionsAll as any[]).sort(
              (a, b) => (b.data_maturata ?? b.created ?? '').localeCompare(a.data_maturata ?? a.created ?? '')
            );
          } catch {
            commissionsAll = [];
          }
        }
      }
      if (commissionsMaturateResult.status === 'rejected' && commissionsMaturate.length === 0) {
        try {
          commissionsMaturate = await pb.collection('agent_commissions').getFullList({
            filter: 'stato = "maturata"'
          });
        } catch {
          commissionsMaturate = [];
        }
      }

      const agentsMap = new Map<string, AgentWithStats>();
      for (const u of (usersList as any[])) {
        agentsMap.set(u.id, {
          id: u.id,
          nome: u.nome,
          cognome: u.cognome,
          email: u.email,
          provvigione_percentuale: u.provvigione_percentuale ?? 0,
          nClienti: 0,
          ordiniMese: 0,
          fatturatoMese: 0,
          provvigioniMaturate: 0
        });
      }

      for (const c of clientsList as any[]) {
        if (c.agente && agentsMap.has(c.agente)) {
          const a = agentsMap.get(c.agente)!;
          a.nClienti += 1;
        }
      }

      for (const o of ordersList as any[]) {
        if (o.agente && agentsMap.has(o.agente) && o.stato === 'consegnato') {
          const a = agentsMap.get(o.agente)!;
          const d = o.data_ordine ?? '';
          if (d >= meseStart && d <= meseEnd) {
            a.ordiniMese += 1;
          }
        }
      }

      for (const inv of invoicesList as any[]) {
        const ord = (inv as any).expand?.ordine;
        const agenteId = ord?.agente;
        if (agenteId && agentsMap.has(agenteId) && inv.data_emissione >= meseStart && inv.data_emissione <= meseEnd) {
          const a = agentsMap.get(agenteId)!;
          a.fatturatoMese += Number(inv.totale) || 0;
        }
      }

      for (const comm of commissionsMaturate as any[]) {
        if (comm.agente && agentsMap.has(comm.agente)) {
          const a = agentsMap.get(comm.agente)!;
          a.provvigioniMaturate += Number(comm.importo) || 0;
        }
      }

      agents = Array.from(agentsMap.values());

      // Se expand è mancante (fallback), arricchisci con dati da usersList e ordersList
      const usersById = new Map(
        (usersList as any[]).map((u) => [u.id, { nome: u.nome, cognome: u.cognome, email: u.email }])
      );
      const ordersById = new Map(
        (ordersList as any[]).map((o) => [o.id, { numero_ordine: o.numero_ordine }])
      );
      allCommissions = (commissionsAll as any[]).map((c) => {
        const base = { ...c } as (typeof allCommissions)[0];
        base.expand = { ...base.expand };
        if (!base.expand?.agente && base.agente) {
          const ag = usersById.get(base.agente);
          base.expand.agente = ag ? { nome: ag.nome, cognome: ag.cognome, email: ag.email } : undefined;
        }
        if (!base.expand?.ordine && base.ordine) {
          const ord = ordersById.get(base.ordine);
          base.expand.ordine = ord ? { numero_ordine: ord.numero_ordine } : undefined;
        }
        return base;
      });
    } catch {
      agents = [];
      allCommissions = [];
    } finally {
      loading = false;
    }
  });
</script>

<svelte:head>
  <title>Agenti | ERP Spirito Alchemico</title>
</svelte:head>

<div class="space-y-6">
  <h1 class="text-3xl font-bold text-[#1A1A1A] tracking-tight">Agenti e Provvigioni</h1>

  <div class="flex gap-2">
    <button
      type="button"
      class="rounded-full px-5 py-2.5 text-sm font-medium transition-all {activeTab === 'agenti'
        ? 'bg-[#F5D547] text-[#1A1A1A]'
        : 'bg-[#E5E7EB] text-[#6B7280] hover:bg-[#D1D5DB]'}"
      onclick={() => (activeTab = 'agenti')}
    >
      Agenti
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

  {#if loading}
    <Card>
      <div class="py-16 text-center">
        <p class="text-sm text-[#6B7280]">Caricamento...</p>
      </div>
    </Card>
  {:else if activeTab === 'agenti'}
    <section class="page-grid">
      {#each agents as agent (agent.id)}
        <Card
          className="cursor-pointer hover:shadow-md transition-shadow"
          onclick={() => goto(`/agenti/${agent.id}`)}
          role="button"
          tabindex="0"
          onkeydown={(e) => e.key === 'Enter' && goto(`/agenti/${agent.id}`)}
        >
          <div class="flex items-start justify-between">
            <div>
              <h2 class="text-lg font-bold text-[#1A1A1A]">{agentName(agent)}</h2>
              <p class="text-sm text-[#6B7280] mt-0.5">{agent.email ?? '—'}</p>
            </div>
            <ChevronRight class="h-5 w-5 text-[#9CA3AF]" />
          </div>
          <div class="grid grid-cols-2 gap-3 mt-4">
            <div class="flex items-center gap-2">
              <span class="h-8 w-8 rounded-xl bg-[#FFF3CD] flex items-center justify-center">
                <Users class="h-4 w-4 text-[#9CA3AF]" />
              </span>
              <div>
                <p class="text-xs text-[#6B7280]">Clienti</p>
                <p class="text-sm font-bold text-[#1A1A1A]">{agent.nClienti}</p>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <span class="h-8 w-8 rounded-xl bg-[#FFF3CD] flex items-center justify-center">
                <ShoppingCart class="h-4 w-4 text-[#9CA3AF]" />
              </span>
              <div>
                <p class="text-xs text-[#6B7280]">Ordini mese</p>
                <p class="text-sm font-bold text-[#1A1A1A]">{agent.ordiniMese}</p>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <span class="h-8 w-8 rounded-xl bg-[#FFF3CD] flex items-center justify-center">
                <Euro class="h-4 w-4 text-[#9CA3AF]" />
              </span>
              <div>
                <p class="text-xs text-[#6B7280]">Fatturato mese</p>
                <p class="text-sm font-bold text-[#1A1A1A]">{formatEuro(agent.fatturatoMese)}</p>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <span class="h-8 w-8 rounded-xl bg-[#FFF3CD] flex items-center justify-center">
                <Percent class="h-4 w-4 text-[#9CA3AF]" />
              </span>
              <div>
                <p class="text-xs text-[#6B7280]">Provv. maturate</p>
                <p class="text-sm font-bold text-[#F5D547]">{formatEuro(agent.provvigioniMaturate)}</p>
              </div>
            </div>
          </div>
        </Card>
      {/each}
    </section>

    {#if agents.length === 0}
      <Card>
        <div class="py-16 text-center">
          <p class="text-sm text-[#6B7280]">Nessun agente trovato</p>
        </div>
      </Card>
    {/if}
  {:else}
    <!-- Tab Provvigioni -->
    <Card>
      <div class="flex flex-wrap gap-4 mb-4">
        <div class="rounded-2xl bg-[#FFF3CD] px-4 py-3">
          <p class="text-xs text-[#6B7280]">Totale maturate</p>
          <p class="text-2xl font-bold text-[#F5D547]">{formatEuro(totaleMaturateGlobale)}</p>
        </div>
        <div class="rounded-2xl bg-green-50 px-4 py-3">
          <p class="text-xs text-[#6B7280]">Totale liquidate</p>
          <p class="text-2xl font-bold text-green-600">{formatEuro(totaleLiquidateGlobale)}</p>
        </div>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-black/5">
              <th class="px-4 py-3 text-left text-xs font-medium text-[#6B7280]">Agente</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-[#6B7280]">Ordine</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-[#6B7280]">Totale ordine</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-[#6B7280]">%</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-[#6B7280]">Importo</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-[#6B7280]">Stato</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-[#6B7280]">Data</th>
            </tr>
          </thead>
          <tbody>
            {#each allCommissions as c}
              <tr
                class="border-b border-black/5 last:border-0 hover:bg-[#FFFDE7] cursor-pointer"
                onclick={() => c.agente && goto(`/agenti/${c.agente}`)}
                role="button"
                tabindex="0"
                onkeydown={(e) => e.key === 'Enter' && c.agente && goto(`/agenti/${c.agente}`)}
              >
                <td class="px-4 py-3 font-medium text-[#1A1A1A]">
                  {agentLabel(c.expand?.agente)}
                </td>
                <td class="px-4 py-3 text-[#6B7280]">{c.expand?.ordine?.numero_ordine ?? '—'}</td>
                <td class="px-4 py-3 text-right text-[#6B7280]">{formatEuro(c.totale_ordine ?? 0)}</td>
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
      {#if allCommissions.length === 0}
        <p class="py-12 text-center text-sm text-[#6B7280]">Nessuna provvigione</p>
      {/if}
    </Card>
  {/if}
</div>
