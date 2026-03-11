<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { pb } from '$lib/pocketbase';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import {
    ArrowLeft,
    FileText,
    Copy,
    ChevronRight
  } from 'lucide-svelte';
  import type { Order, OrderStato, OrderItem } from '$lib/types/order';
  import { STATO_LABELS, STATO_BADGE_COLORS, STATO_STEPS, CANALE_LABELS, CANALE_BADGE_COLORS } from '$lib/types/order';

  const orderId = $page.params.id;

  let order: (Order & {
    expand?: {
      cliente?: { ragione_sociale?: string };
      agente?: { nome?: string; cognome?: string; email?: string };
    };
  }) | null = null;
  let items: (OrderItem & { expand?: { prodotto?: { nome?: string; sku?: string } } })[] = [];
  let agents: { id: string; name?: string; email?: string }[] = [];
  let loading = true;
  let updating = false;

  export let data: { user?: { id?: string; role?: string } | null } = { user: null };
  $: user = data.user ?? (pb.authStore.model as { id?: string; role?: string } | null);
  $: isAdmin = (user?.role || (user as any)?.ruolo) === 'admin';

  $: currentStepIndex = order
    ? STATO_STEPS.indexOf(order.stato as OrderStato)
    : -1;

  onMount(async () => {
    try {
      order = await pb.collection('orders').getOne(orderId, { expand: 'cliente,agente' });
      items = await pb.collection('order_items').getFullList({
        filter: `ordine = "${orderId}"`,
        expand: 'prodotto'
      });
      if (isAdmin) {
        const usersList = await pb.collection('users').getFullList({ filter: 'ruolo = "agente"' });
        agents = usersList.map((u: any) => ({
          id: u.id,
          name: u.nome ? [u.nome, u.cognome].filter(Boolean).join(' ') : u.email,
          email: u.email
        }));
      }
    } catch {
      order = null;
      items = [];
    } finally {
      loading = false;
    }
  });

  async function logActivity(azione: string, dettagli: string) {
    try {
      await pb.collection('activity_log').create({
        utente: user?.id,
        azione,
        collection_rif: 'orders',
        record_rif: orderId,
        dettagli: JSON.stringify({ messaggio: dettagli })
      });
    } catch {
      // ignore
    }
  }

  async function changeStato(newStato: OrderStato) {
    if (!order || updating) return;
    const oldStato = order.stato;
    if (newStato === oldStato) return;
    const stepIdx = STATO_STEPS.indexOf(newStato);
    const oldIdx = STATO_STEPS.indexOf(oldStato as OrderStato);
    if (stepIdx < 0 || stepIdx <= oldIdx) return;
    if (newStato === 'confermato' && oldStato === 'bozza') {
      for (const item of items) {
        await pb.collection('inventory_movements').create({
          prodotto: item.prodotto,
          tipo: 'scarico',
          quantita: item.quantita,
          causale: `Ordine ${order.numero_ordine}`,
          ordine_rif: orderId,
          utente: user?.id
        });
      }
    }
    if (newStato === 'consegnato' && order.agente) {
      try {
        const existing = await pb.collection('agent_commissions').getList(1, 1, {
          filter: `ordine = "${orderId}"`
        });
        if (existing.totalItems === 0) {
          const agenteUser = await pb.collection('users').getOne(order.agente);
          const pct = (agenteUser as any).provvigione_percentuale ?? 0;
          const totale = Number(order.totale) || 0;
          const importo = (totale * pct) / 100;
          if (importo > 0) {
            await pb.collection('agent_commissions').create({
              agente: order.agente,
              ordine: orderId,
              totale_ordine: totale,
              percentuale: pct,
              importo,
              stato: 'maturata',
              data_maturata: new Date().toISOString().split('T')[0]
            });
          }
        }
      } catch (e) {
        console.error('Errore creazione provvigione:', e);
      }
    }
    updating = true;
    try {
      order = await pb.collection('orders').update(orderId, { stato: newStato }) as typeof order;
      await logActivity('stato_cambiato', `Da ${oldStato} a ${newStato}`);
    } catch {
      // revert?
    } finally {
      updating = false;
    }
  }

  async function generaFattura() {
    if (!order || order.stato === 'bozza' || order.stato === 'annullato') return;
    try {
      const inv = await pb.collection('invoices').create({
        numero_fattura: `FAT-${Date.now()}`,
        ordine: orderId,
        cliente: order.cliente,
        data_emissione: new Date().toISOString().split('T')[0],
        data_scadenza: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        totale_imponibile: Number(order.totale) || 0,
        iva: 0,
        totale: Number(order.totale) || 0,
        stato: 'emessa'
      });
      await logActivity('fattura_generata', `Fattura ${inv.numero_fattura}`);
      goto('/ordini');
    } catch (e) {
      console.error(e);
    }
  }

  async function duplicaOrdine() {
    if (!order) return;
    try {
      const newOrder = await pb.collection('orders').create({
        numero_ordine: `ORD-${Date.now()}`,
        cliente: order.cliente,
        agente: order.agente,
        data_ordine: new Date().toISOString().split('T')[0],
        stato: 'bozza',
        canale: order.canale,
        totale: order.totale,
        note: order.note ? `(Duplicato da ${order.numero_ordine}) ${order.note}` : `Duplicato da ${order.numero_ordine}`
      });
      for (const item of items) {
        await pb.collection('order_items').create({
          ordine: newOrder.id,
          prodotto: item.prodotto,
          quantita: item.quantita,
          prezzo_unitario: item.prezzo_unitario,
          sconto_percentuale: item.sconto_percentuale ?? 0,
          totale_riga: item.totale_riga
        });
      }
      await logActivity('duplicato', `Ordine duplicato in ${newOrder.numero_ordine}`);
      goto(`/ordini/${newOrder.id}`);
    } catch (e) {
      console.error(e);
    }
  }

  function formatDate(s: string | null | undefined): string {
    if (!s) return '—';
    try {
      return new Date(s).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
      return '—';
    }
  }

  function formatEuro(n: number): string {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);
  }

  function agentName(ag: { nome?: string; cognome?: string; email?: string } | undefined): string {
    if (!ag) return '—';
    if (ag.nome) return [ag.nome, ag.cognome].filter(Boolean).join(' ');
    return ag.email ?? '—';
  }

  function canAdvanceTo(stato: OrderStato): boolean {
    if (!order || order.stato === 'annullato') return false;
    const idx = STATO_STEPS.indexOf(stato);
    const currentIdx = STATO_STEPS.indexOf(order.stato as OrderStato);
    return idx === currentIdx + 1;
  }
</script>

<svelte:head>
  <title>Ordine {order?.numero_ordine ?? ''} | ERP Spirito Alchemico</title>
</svelte:head>

<div class="space-y-6">
  <div class="flex items-center gap-4">
    <button
      type="button"
      class="p-2 rounded-2xl text-[#6B7280] hover:bg-black/5 transition-colors"
      onclick={() => goto('/ordini')}
      aria-label="Indietro"
    >
      <ArrowLeft class="h-5 w-5" />
    </button>
    <h1 class="text-3xl font-bold text-[#1A1A1A] tracking-tight">
      Ordine {order?.numero_ordine ?? ''}
    </h1>
  </div>

  {#if loading}
    <Card>
      <div class="py-16 text-center">
        <p class="text-sm text-[#6B7280]">Caricamento...</p>
      </div>
    </Card>
  {:else if !order}
    <Card>
      <div class="py-16 text-center">
        <p class="text-sm text-[#6B7280]">Ordine non trovato</p>
        <Button variant="ghost" className="mt-4" onclick={() => goto('/ordini')}>
          Torna agli ordini
        </Button>
      </div>
    </Card>
  {:else}
    <!-- Stepper -->
    <Card>
      <div class="flex items-center max-w-2xl">
        {#each STATO_STEPS as stato, i}
          {@const stepIdx = STATO_STEPS.indexOf(stato as OrderStato)}
          {@const currentIdx = STATO_STEPS.indexOf(order.stato as OrderStato)}
          {@const isCompleted = currentIdx > stepIdx}
          {@const isActive = order.stato === stato}
          {@const isNext = canAdvanceTo(stato as OrderStato)}
          <div class="flex items-center flex-1">
            <button
              type="button"
              class="flex flex-col items-center gap-1 {isActive
                ? 'cursor-default'
                : isCompleted
                  ? 'cursor-default'
                  : isNext
                    ? 'cursor-pointer'
                    : 'cursor-not-allowed opacity-50'}"
              disabled={!isNext || updating}
              onclick={() => isNext && changeStato(stato as OrderStato)}
            >
              <span
                class="h-10 w-10 rounded-full flex items-center justify-center text-sm font-medium transition-colors {isCompleted
                  ? 'bg-[#F5D547] text-[#1A1A1A]'
                  : isActive
                    ? 'bg-[#1A1A1A] text-white'
                    : 'bg-[#E5E7EB] text-[#9CA3AF]'}"
              >
                {isCompleted ? '✓' : i + 1}
              </span>
              <span class="text-xs font-medium text-[#6B7280]">{STATO_LABELS[stato as OrderStato]}</span>
            </button>
            {#if i < STATO_STEPS.length - 1}
              <div class="flex-1 h-0.5 mx-1 min-w-[20px] {isCompleted ? 'bg-[#F5D547]' : 'bg-[#E5E7EB]'}"></div>
            {/if}
          </div>
        {/each}
      </div>
    </Card>

    <div class="grid gap-6 lg:grid-cols-3">
      <!-- Dati ordine -->
      <Card className="lg:col-span-2">
        <div class="flex flex-wrap items-center gap-2 mb-4">
          <span
            class="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium {STATO_BADGE_COLORS[
              order.stato as OrderStato
            ] ?? 'bg-gray-100'}"
          >
            {STATO_LABELS[order.stato as OrderStato]}
          </span>
          <span
            class="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium {CANALE_BADGE_COLORS[
              order.canale as import('$lib/types/order').OrderCanale
            ] ?? 'bg-gray-100'}"
          >
            {CANALE_LABELS[order.canale as import('$lib/types/order').OrderCanale]}
          </span>
        </div>
        <dl class="grid gap-2 sm:grid-cols-2">
          <div class="flex justify-between sm:block">
            <dt class="text-sm text-[#6B7280]">Data</dt>
            <dd class="text-sm font-medium text-[#1A1A1A]">{formatDate(order.data_ordine)}</dd>
          </div>
          <div class="flex justify-between sm:block">
            <dt class="text-sm text-[#6B7280]">Cliente</dt>
            <dd class="text-sm font-medium text-[#1A1A1A]">{order.expand?.cliente?.ragione_sociale ?? '—'}</dd>
          </div>
          <div class="flex justify-between sm:block">
            <dt class="text-sm text-[#6B7280]">Agente</dt>
            <dd class="text-sm font-medium text-[#1A1A1A]">{agentName(order.expand?.agente)}</dd>
          </div>
          <div class="flex justify-between sm:block">
            <dt class="text-sm text-[#6B7280]">Totale</dt>
            <dd class="text-lg font-bold text-[#1A1A1A]">{formatEuro(Number(order.totale) || 0)}</dd>
          </div>
        </dl>
        {#if order.note}
          <div class="mt-4 pt-4 border-t border-black/5">
            <dt class="text-sm text-[#6B7280]">Note</dt>
            <dd class="text-sm text-[#1A1A1A] mt-1">{order.note}</dd>
          </div>
        {/if}
      </Card>

      <!-- Azioni -->
      <Card>
        <div class="flex flex-col gap-3">
          {#if order.stato !== 'bozza' && order.stato !== 'annullato'}
            <Button
              variant="secondary"
              className="rounded-2xl w-full !bg-[#F5D547] !text-[#1A1A1A]"
              onclick={generaFattura}
            >
              <FileText class="h-4 w-4" />
              Genera Fattura
            </Button>
          {/if}
          <Button variant="ghost" className="rounded-2xl w-full" onclick={duplicaOrdine}>
            <Copy class="h-4 w-4" />
            Duplica Ordine
          </Button>
          {#if canAdvanceTo('confermato')}
            <Button
              variant="primary"
              className="rounded-2xl w-full !bg-[#1A1A1A]"
              disabled={updating}
              onclick={() => changeStato('confermato')}
            >
              Conferma Ordine
            </Button>
          {:else if canAdvanceTo('spedito')}
            <Button
              variant="primary"
              className="rounded-2xl w-full !bg-[#1A1A1A]"
              disabled={updating}
              onclick={() => changeStato('spedito')}
            >
              Segna Spedito
            </Button>
          {:else if canAdvanceTo('consegnato')}
            <Button
              variant="primary"
              className="rounded-2xl w-full !bg-[#1A1A1A]"
              disabled={updating}
              onclick={() => changeStato('consegnato')}
            >
              Segna Consegnato
            </Button>
          {/if}
        </div>
      </Card>
    </div>

    <!-- Righe ordine -->
    <Card>
      <h2 class="text-sm font-medium text-[#1A1A1A] mb-4">Righe ordine</h2>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-black/5">
              <th class="px-4 py-3 text-left text-xs font-medium text-[#6B7280]">Prodotto</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-[#6B7280]">Qtà</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-[#6B7280]">Prezzo</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-[#6B7280]">Sconto %</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-[#6B7280]">Totale</th>
            </tr>
          </thead>
          <tbody>
            {#each items as item}
              <tr class="border-b border-black/5 last:border-0 hover:bg-[#FFFDE7]">
                <td class="px-4 py-3 font-medium text-[#1A1A1A]">
                  {item.expand?.prodotto?.nome ?? '—'} ({item.expand?.prodotto?.sku ?? '—'})
                </td>
                <td class="px-4 py-3 text-right text-[#6B7280]">{item.quantita}</td>
                <td class="px-4 py-3 text-right text-[#6B7280]">{formatEuro(item.prezzo_unitario)}</td>
                <td class="px-4 py-3 text-right text-[#6B7280]">{item.sconto_percentuale ?? 0}%</td>
                <td class="px-4 py-3 text-right font-medium text-[#1A1A1A]">{formatEuro(item.totale_riga)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      {#if items.length === 0}
        <p class="py-8 text-center text-sm text-[#6B7280]">Nessuna riga</p>
      {/if}
    </Card>
  {/if}
</div>
