<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { pb } from '$lib/pocketbase';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { Plus, Trash2, Search, ArrowLeft } from 'lucide-svelte';
  import type { Client } from '$lib/types/client';
  import type { Product } from '$lib/types/product';
  import type { OrderCanale } from '$lib/types/order';
  import { CANALE_LABELS } from '$lib/types/order';
  import { eseguiScaricoMagazzino } from '$lib/utils/inventoryCarico';

  type LineItem = {
    id: string;
    prodotto: string;
    prodottoNome?: string;
    quantita: number;
    prezzo_unitario: number;
    sconto_percentuale: number;
    totale_riga: number;
  };

  let clients: Client[] = [];
  let products: Product[] = [];
  let agents: { id: string; name?: string; email?: string }[] = [];
  let loading = true;
  let clientSearch = '';
  let selectedClient: Client | null = null;
  let clientDropdownOpen = false;
  let lineItems: LineItem[] = [];
  let canale: OrderCanale = 'horeca';
  let agenteId = '';
  let note = '';
  let ivaPercentuale = 22;
  let saving = false;
  let error = '';

  export let data: { user?: { id?: string; role?: string } | null } = { user: null };
  $: user = data.user ?? (pb.authStore.model as { id?: string; role?: string } | null);
  $: isAdmin = (user?.role || (user as any)?.ruolo) === 'admin';
  $: isAgente = (user?.role || (user as any)?.ruolo) === 'agente';

  $: filteredClients = clients.filter(
    (c) =>
      !clientSearch ||
      c.ragione_sociale?.toLowerCase().includes(clientSearch.toLowerCase()) ||
      c.email?.toLowerCase().includes(clientSearch.toLowerCase())
  );

  $: filteredProducts = products.filter(
    (p) =>
      p.attivo &&
      (p.nome?.toLowerCase().includes('') || p.sku?.toLowerCase().includes(''))
  );

  $: totaleImponibile = lineItems.reduce((s, r) => s + r.totale_riga, 0);
  $: iva = Math.round(totaleImponibile * (ivaPercentuale / 100) * 100) / 100;
  $: totaleOrdine = Math.round((totaleImponibile + iva) * 100) / 100;

  function getProductPrice(p: Product): number {
    if (canale === 'horeca') return p.prezzo_horeca ?? p.prezzo_listino ?? 0;
    if (canale === 'ecommerce') return p.prezzo_ecommerce ?? p.prezzo_listino ?? 0;
    return p.prezzo_listino ?? 0;
  }

  function addLine() {
    const first = products.find((p) => p.attivo);
    if (!first) return;
    lineItems = [
      ...lineItems,
      {
        id: crypto.randomUUID(),
        prodotto: first.id,
        prodottoNome: first.nome,
        quantita: 1,
        prezzo_unitario: getProductPrice(first),
        sconto_percentuale: 0,
        totale_riga: getProductPrice(first)
      }
    ];
  }

  function removeLine(id: string) {
    lineItems = lineItems.filter((l) => l.id !== id);
  }

  function updateLine(id: string, field: keyof LineItem, value: number | string) {
    lineItems = lineItems.map((l) => {
      if (l.id !== id) return l;
      const next = { ...l, [field]: value };
      if (field === 'prodotto') {
        const p = products.find((x) => x.id === value);
        if (p) {
          next.prezzo_unitario = getProductPrice(p);
          next.prodottoNome = p.nome;
        }
      }
      if (['quantita', 'prezzo_unitario', 'sconto_percentuale'].includes(field)) {
        const q = next.quantita;
        const pu = next.prezzo_unitario;
        const sc = next.sconto_percentuale;
        next.totale_riga = Math.round(q * pu * (1 - sc / 100) * 100) / 100;
      }
      return next;
    });
  }

  function onProductSelect(lineId: string, productId: string) {
    const p = products.find((x) => x.id === productId);
    if (p) {
      updateLine(lineId, 'prodotto', productId);
      updateLine(lineId, 'prezzo_unitario', getProductPrice(p));
      updateLine(lineId, 'prodottoNome', p.nome ?? '');
    }
  }

  $: if (canale && lineItems.length) {
    lineItems = lineItems.map((l) => {
      const p = products.find((x) => x.id === l.prodotto);
      if (!p) return l;
      const newPrice = getProductPrice(p);
      if (l.prezzo_unitario !== newPrice) {
        return {
          ...l,
          prezzo_unitario: newPrice,
          totale_riga: Math.round(l.quantita * newPrice * (1 - l.sconto_percentuale / 100) * 100) / 100
        };
      }
      return l;
    });
  }

  onMount(async () => {
    try {
      clients = await pb.collection('clients').getFullList();
      products = await pb.collection('products').getFullList({ filter: 'attivo = true' });
      if (isAdmin) {
        const usersList = await pb.collection('users').getFullList({ filter: 'ruolo = "agente"' });
        agents = usersList.map((u: any) => ({
          id: u.id,
          name: u.nome ? [u.nome, u.cognome].filter(Boolean).join(' ') : u.email,
          email: u.email
        }));
      }
      if (isAgente && user?.id) agenteId = user.id;
    } catch {
      clients = [];
      products = [];
    } finally {
      loading = false;
    }
  });

  function validateLines(): boolean {
    const invalid = lineItems.filter((l) => !l.prodotto || l.prodotto === '0');
    if (invalid.length > 0) {
      error = 'Ogni riga deve avere un prodotto selezionato.';
      return false;
    }
    return true;
  }

  async function saveAsBozza() {
    if (!selectedClient || lineItems.length === 0) {
      error = 'Seleziona un cliente e aggiungi almeno una riga.';
      return;
    }
    if (!validateLines()) return;
    saving = true;
    error = '';
    try {
      const order = await pb.collection('orders').create({
        numero_ordine: `ORD-${Date.now()}`,
        cliente: selectedClient.id,
        agente: agenteId || undefined,
        data_ordine: new Date().toISOString().split('T')[0],
        stato: 'bozza',
        canale,
        totale: totaleOrdine,
        totale_imponibile: totaleImponibile,
        iva,
        iva_percentuale: ivaPercentuale,
        note: note.trim() || undefined
      });
      for (const line of lineItems) {
        await pb.collection('order_items').create({
          ordine: order.id,
          prodotto: line.prodotto,
          quantita: line.quantita,
          prezzo_unitario: line.prezzo_unitario,
          sconto_percentuale: line.sconto_percentuale,
          totale_riga: line.totale_riga
        });
      }
      await logActivity(order.id, 'creato', 'Bozza creata');
      goto(`/ordini/${order.id}`);
    } catch (e: any) {
      error = e?.message ?? 'Errore salvataggio';
    } finally {
      saving = false;
    }
  }

  async function confermaOrdine() {
    if (!selectedClient || lineItems.length === 0) {
      error = 'Seleziona un cliente e aggiungi almeno una riga.';
      return;
    }
    if (!validateLines()) return;
    saving = true;
    error = '';
    try {
      const order = await pb.collection('orders').create({
        numero_ordine: `ORD-${Date.now()}`,
        cliente: selectedClient.id,
        agente: agenteId || undefined,
        data_ordine: new Date().toISOString().split('T')[0],
        stato: 'confermato',
        canale,
        totale: totaleOrdine,
        totale_imponibile: totaleImponibile,
        iva,
        iva_percentuale: ivaPercentuale,
        note: note.trim() || undefined
      });
      for (const line of lineItems) {
        await pb.collection('order_items').create({
          ordine: order.id,
          prodotto: line.prodotto,
          quantita: line.quantita,
          prezzo_unitario: line.prezzo_unitario,
          sconto_percentuale: line.sconto_percentuale,
          totale_riga: line.totale_riga
        });
      }
      for (const line of lineItems) {
        if (line.quantita <= 0) continue;
        await eseguiScaricoMagazzino(pb, {
          prodottoId: line.prodotto,
          quantita: line.quantita,
          causale: `Ordine ${order.numero_ordine}`,
          ordineRif: order.id,
          utenteId: user?.id
        });
      }
      await logActivity(order.id, 'confermato', 'Ordine confermato');
      goto(`/ordini/${order.id}`);
    } catch (e: any) {
      error = e?.message ?? 'Errore salvataggio';
    } finally {
      saving = false;
    }
  }

  async function logActivity(recordId: string, azione: string, dettagli: string) {
    try {
      await pb.collection('activity_log').create({
        utente: user?.id,
        azione,
        collection_rif: 'orders',
        record_rif: recordId,
        dettagli: JSON.stringify({ messaggio: dettagli })
      });
    } catch {
      // ignore
    }
  }

  function formatEuro(n: number): string {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);
  }
</script>

<svelte:head>
  <title>Nuovo Ordine | ERP Spirito Alchemico</title>
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
    <h1 class="text-3xl font-bold text-[#1A1A1A] tracking-tight">Nuovo Ordine</h1>
  </div>

  {#if loading}
    <Card>
      <div class="py-16 text-center">
        <p class="text-sm text-[#6B7280]">Caricamento...</p>
      </div>
    </Card>
  {:else}
    <div class="grid gap-6 lg:grid-cols-3">
      <div class="lg:col-span-2 space-y-6">
        <!-- Card cliente -->
        <Card>
          <h2 class="text-sm font-medium text-[#1A1A1A] mb-4">Cliente</h2>
          <div class="relative">
            <div class="relative">
              <Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]" />
              <input
                type="text"
                bind:value={clientSearch}
                onfocus={() => (clientDropdownOpen = true)}
                placeholder="Cerca cliente per ragione sociale o email..."
                class="w-full rounded-2xl border border-black/5 bg-white/80 pl-10 pr-4 py-2.5 text-sm text-[#1A1A1A] placeholder:text-[#9CA3AF] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5D547]"
              />
            </div>
            {#if clientDropdownOpen}
              <div
                class="absolute z-10 mt-1 w-full rounded-2xl border border-black/5 bg-white shadow-lg py-2 max-h-60 overflow-y-auto"
              >
                {#each filteredClients.slice(0, 10) as c}
                  <button
                    type="button"
                    class="w-full text-left px-4 py-2 text-sm text-[#1A1A1A] hover:bg-[#FFFDE7] {selectedClient?.id === c.id
                      ? 'bg-[#FFF3CD]'
                      : ''}"
                    onclick={() => {
                      selectedClient = c;
                      clientSearch = c.ragione_sociale ?? '';
                      clientDropdownOpen = false;
                    }}
                  >
                    {c.ragione_sociale}
                    {#if c.citta}
                      <span class="text-[#6B7280]"> · {c.citta}</span>
                    {/if}
                  </button>
                {/each}
                {#if filteredClients.length === 0}
                  <p class="px-4 py-2 text-sm text-[#6B7280]">Nessun cliente trovato</p>
                {/if}
              </div>
            {/if}
          </div>
          {#if selectedClient}
            <p class="mt-2 text-sm text-green-600 font-medium">
              ✓ {selectedClient.ragione_sociale}
            </p>
          {/if}
        </Card>

        <!-- Card righe -->
        <Card>
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-sm font-medium text-[#1A1A1A]">Righe prodotto</h2>
            <Button variant="ghost" size="sm" className="rounded-2xl" onclick={addLine}>
              <Plus class="h-4 w-4" />
              Aggiungi Riga
            </Button>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-black/5">
                  <th class="px-3 py-2 text-left text-xs font-medium text-[#6B7280]">Prodotto</th>
                  <th class="px-3 py-2 text-right text-xs font-medium text-[#6B7280]">Qtà</th>
                  <th class="px-3 py-2 text-right text-xs font-medium text-[#6B7280]">Prezzo</th>
                  <th class="px-3 py-2 text-right text-xs font-medium text-[#6B7280]">Sconto %</th>
                  <th class="px-3 py-2 text-right text-xs font-medium text-[#6B7280]">Totale</th>
                  <th class="px-3 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {#each lineItems as line (line.id)}
                  <tr class="border-b border-black/5 hover:bg-[#FFFDE7]">
                    <td class="px-3 py-2">
                      <select
                        class="w-full min-w-[140px] rounded-xl border border-black/5 bg-white/80 px-3 py-1.5 text-sm focus:ring-2 focus:ring-[#F5D547]"
                        value={line.prodotto}
                        onchange={(e) => onProductSelect(line.id, (e.target as HTMLSelectElement).value)}
                      >
                        {#each products.filter((p) => p.attivo) as p}
                          <option value={p.id}>{p.nome} ({p.sku})</option>
                        {/each}
                      </select>
                    </td>
                    <td class="px-3 py-2">
                      <input
                        type="number"
                        min="1"
                        class="w-20 rounded-xl border border-black/5 bg-white/80 px-3 py-1.5 text-sm text-right focus:ring-2 focus:ring-[#F5D547]"
                        value={line.quantita}
                        oninput={(e) => updateLine(line.id, 'quantita', parseInt((e.target as HTMLInputElement).value) || 1)}
                      />
                    </td>
                    <td class="px-3 py-2">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        class="w-24 rounded-xl border border-black/5 bg-white/80 px-3 py-1.5 text-sm text-right focus:ring-2 focus:ring-[#F5D547]"
                        value={line.prezzo_unitario}
                        oninput={(e) =>
                          updateLine(line.id, 'prezzo_unitario', parseFloat((e.target as HTMLInputElement).value) || 0)}
                      />
                    </td>
                    <td class="px-3 py-2">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        class="w-16 rounded-xl border border-black/5 bg-white/80 px-3 py-1.5 text-sm text-right focus:ring-2 focus:ring-[#F5D547]"
                        value={line.sconto_percentuale}
                        oninput={(e) =>
                          updateLine(line.id, 'sconto_percentuale', parseFloat((e.target as HTMLInputElement).value) || 0)}
                      />
                    </td>
                    <td class="px-3 py-2 text-right font-medium text-[#1A1A1A]">
                      {formatEuro(line.totale_riga)}
                    </td>
                    <td class="px-3 py-2">
                      <button
                        type="button"
                        class="p-1.5 rounded-lg text-[#6B7280] hover:bg-rose-100 hover:text-rose-600"
                        onclick={() => removeLine(line.id)}
                      >
                        <Trash2 class="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
          {#if lineItems.length === 0}
            <p class="py-8 text-center text-sm text-[#6B7280]">
              Nessuna riga. Clicca "Aggiungi Riga" per iniziare.
            </p>
          {/if}
        </Card>
      </div>

      <!-- Sidebar -->
      <div class="space-y-6">
        <!-- Card riepilogo -->
        <Card>
          <h2 class="text-sm font-medium text-[#1A1A1A] mb-4">Riepilogo</h2>
          <div class="mb-4">
            <label for="iva" class="block text-sm text-[#6B7280] mb-1">Aliquota IVA %</label>
            <select
              id="iva"
              bind:value={ivaPercentuale}
              class="w-full rounded-xl border border-black/5 bg-white/80 px-3 py-2 text-sm focus:ring-2 focus:ring-[#F5D547]"
            >
              <option value={0}>0%</option>
              <option value={4}>4%</option>
              <option value={10}>10%</option>
              <option value={22}>22%</option>
            </select>
          </div>
          <dl class="space-y-3">
            <div class="flex justify-between">
              <dt class="text-sm text-[#6B7280]">Imponibile</dt>
              <dd class="text-lg font-bold text-[#1A1A1A]">{formatEuro(totaleImponibile)}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-sm text-[#6B7280]">IVA ({ivaPercentuale}%)</dt>
              <dd class="text-lg font-bold text-[#1A1A1A]">{formatEuro(iva)}</dd>
            </div>
            <div class="flex justify-between pt-3 border-t border-black/5">
              <dt class="text-sm font-medium text-[#1A1A1A]">Totale ordine</dt>
              <dd class="text-2xl font-bold text-[#1A1A1A]">{formatEuro(totaleOrdine)}</dd>
            </div>
          </dl>
        </Card>

        <!-- Canale e Agente -->
        <Card>
          <div class="space-y-4">
            <div>
              <label for="canale" class="block text-sm font-medium text-[#1A1A1A] mb-1.5">Canale</label>
              <select
                id="canale"
                bind:value={canale}
                class="w-full rounded-2xl border border-black/5 bg-white/80 px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#F5D547]"
              >
                <option value="horeca">HORECA</option>
                <option value="ecommerce">E-commerce</option>
                <option value="diretto">Diretto</option>
              </select>
            </div>
            {#if isAdmin}
              <div>
                <label for="agente" class="block text-sm font-medium text-[#1A1A1A] mb-1.5">Agente</label>
                <select
                  id="agente"
                  bind:value={agenteId}
                  class="w-full rounded-2xl border border-black/5 bg-white/80 px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#F5D547]"
                >
                  <option value="">Nessun agente</option>
                  {#each agents as a}
                    <option value={a.id}>{a.name || a.email || a.id}</option>
                  {/each}
                </select>
              </div>
            {/if}
          </div>
        </Card>

        <!-- Note -->
        <Card>
          <label for="note" class="block text-sm font-medium text-[#1A1A1A] mb-1.5">Note</label>
          <textarea
            id="note"
            bind:value={note}
            rows="3"
            class="w-full rounded-2xl border border-black/5 bg-white/80 px-4 py-2.5 text-sm placeholder:text-[#9CA3AF] focus:ring-2 focus:ring-[#F5D547]"
            placeholder="Note ordine..."
          ></textarea>
        </Card>

        <!-- Bottoni -->
        <div class="flex flex-col gap-3">
          {#if error}
            <p class="text-sm text-rose-600">{error}</p>
          {/if}
          <Button
            variant="secondary"
            className="rounded-2xl w-full !bg-[#F5D547] !text-[#1A1A1A]"
            disabled={saving}
            onclick={saveAsBozza}
          >
            Salva come Bozza
          </Button>
          <Button
            variant="primary"
            className="rounded-2xl w-full !bg-[#1A1A1A]"
            disabled={saving}
            onclick={confermaOrdine}
          >
            Conferma Ordine
          </Button>
        </div>
      </div>
    </div>
  {/if}
</div>
