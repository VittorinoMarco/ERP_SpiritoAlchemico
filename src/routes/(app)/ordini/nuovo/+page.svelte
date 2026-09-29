<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { pb } from '$lib/pocketbase';
  import { currentRole, currentUser, displayName } from '$lib/stores/auth';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Spinner from '$lib/components/ui/Spinner.svelte';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import { Plus, Trash2, Search, X, Minus, TriangleAlert, Check } from 'lucide-svelte';
  import type { Client } from '$lib/types/client';
  import type { Product } from '$lib/types/product';
  import type { OrderCanale } from '$lib/types/order';
  import { CANALE_LABELS } from '$lib/types/order';
  import { formatEuro } from '$lib/utils/format';
  import {
    createOrderWithItems,
    findShortages,
    getStockMap,
    lineTotal,
    newOrderNumber,
    roundMoney
  } from '$lib/utils/orders';
  import { eseguiScaricoMagazzino, ripristinaGiacenzaDaOrdine } from '$lib/utils/inventoryCarico';

  type LineItem = {
    id: string;
    prodotto: string;
    quantita: number;
    prezzo_unitario: number;
    sconto_percentuale: number;
    totale_riga: number;
  };

  let clients: Client[] = [];
  let products: Product[] = [];
  let stock = new Map<string, number>();
  let agents: { id: string; name: string }[] = [];
  let loading = true;
  let loadError = '';

  let clientSearch = '';
  let selectedClient: Client | null = null;
  let clientOpen = false;
  let clientBox: HTMLElement;

  let lineItems: LineItem[] = [];
  let canale: OrderCanale = 'horeca';
  let agenteId = '';
  let agenteTouched = false;
  let note = '';
  let ivaPercentuale = 22;
  let saving = false;
  let error = '';

  $: isAdmin = $currentRole === 'admin';
  $: isAgente = $currentRole === 'agente';

  $: filteredClients = clients
    .filter((c) => {
      const q = clientSearch.trim().toLowerCase();
      if (!q) return true;
      return (
        c.ragione_sociale?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.citta?.toLowerCase().includes(q)
      );
    })
    .slice(0, 30);

  $: totaleImponibile = roundMoney(lineItems.reduce((s, r) => s + r.totale_riga, 0));
  $: iva = roundMoney(totaleImponibile * (ivaPercentuale / 100));
  $: totaleOrdine = roundMoney(totaleImponibile + iva);

  $: shortLines = lineItems.filter((l) => l.prodotto && l.quantita > (stock.get(l.prodotto) ?? 0));

  function productById(id: string) {
    return products.find((p) => p.id === id);
  }

  function priceFor(p: Product, c: OrderCanale): number {
    if (c === 'horeca') return p.prezzo_horeca ?? p.prezzo_listino ?? 0;
    if (c === 'ecommerce') return p.prezzo_ecommerce ?? p.prezzo_listino ?? 0;
    return p.prezzo_listino ?? 0;
  }

  function recalc(l: LineItem): LineItem {
    return { ...l, totale_riga: lineTotal(l.quantita, l.prezzo_unitario, l.sconto_percentuale) };
  }

  function addLine() {
    const first = products[0];
    if (!first) return;
    const price = priceFor(first, canale);
    lineItems = [
      ...lineItems,
      recalc({
        id: crypto.randomUUID(),
        prodotto: first.id,
        quantita: 1,
        prezzo_unitario: price,
        sconto_percentuale: 0,
        totale_riga: price
      })
    ];
  }

  function removeLine(id: string) {
    lineItems = lineItems.filter((l) => l.id !== id);
  }

  function setProduct(id: string, productId: string) {
    lineItems = lineItems.map((l) => {
      if (l.id !== id) return l;
      const p = productById(productId);
      return recalc({ ...l, prodotto: productId, prezzo_unitario: p ? priceFor(p, canale) : 0 });
    });
  }

  function setNum(id: string, field: 'quantita' | 'prezzo_unitario' | 'sconto_percentuale', raw: string) {
    let n = Number(String(raw).replace(',', '.'));
    if (!Number.isFinite(n) || n < 0) n = 0;
    if (field === 'quantita') n = Math.floor(n);
    if (field === 'sconto_percentuale') n = Math.min(100, n);
    lineItems = lineItems.map((l) => (l.id === id ? recalc({ ...l, [field]: n }) : l));
  }

  function bump(id: string, delta: number) {
    lineItems = lineItems.map((l) =>
      l.id === id ? recalc({ ...l, quantita: Math.max(1, l.quantita + delta) }) : l
    );
  }

  /** Cambio canale: riallinea i prezzi listino di tutte le righe (solo qui, non a ogni modifica). */
  function onCanaleChange() {
    lineItems = lineItems.map((l) => {
      const p = productById(l.prodotto);
      return p ? recalc({ ...l, prezzo_unitario: priceFor(p, canale) }) : l;
    });
  }

  function pickClient(c: Client) {
    selectedClient = c;
    clientSearch = '';
    clientOpen = false;
    if (c.agente && !agenteTouched && isAdmin) agenteId = c.agente;
    if (c.tipo === 'horeca' || c.tipo === 'ecommerce') {
      canale = c.tipo;
      onCanaleChange();
    }
  }

  function clearClient() {
    selectedClient = null;
    clientOpen = true;
  }

  function onWindowClick(e: MouseEvent) {
    if (clientOpen && clientBox && !clientBox.contains(e.target as Node)) clientOpen = false;
  }

  onMount(async () => {
    try {
      const [cl, pr, st] = await Promise.all([
        pb.collection('clients').getFullList({ sort: 'ragione_sociale' }),
        pb.collection('products').getFullList({ filter: 'attivo = true', sort: 'nome' }),
        pb
          .collection('inventory')
          .getFullList()
          .catch(() => [])
      ]);
      clients = cl as unknown as Client[];
      products = pr as unknown as Product[];
      const m = new Map<string, number>();
      for (const r of st as unknown as { prodotto: string; giacenza?: number }[]) {
        m.set(r.prodotto, (m.get(r.prodotto) ?? 0) + (Number(r.giacenza) || 0));
      }
      stock = m;
      if (isAdmin) {
        const usersList = await pb.collection('users').getFullList({ filter: 'ruolo = "agente"' });
        agents = usersList.map((u: any) => ({
          id: u.id,
          name: u.nome ? [u.nome, u.cognome].filter(Boolean).join(' ') : u.email
        }));
      }
      if (isAgente && $currentUser?.id) agenteId = $currentUser.id;
      const preId = $page.url.searchParams.get('cliente');
      const pre = preId ? clients.find((c) => c.id === preId) : undefined;
      if (pre) pickClient(pre);
    } catch (e: any) {
      loadError = e?.message ?? 'Impossibile caricare clienti e prodotti.';
    } finally {
      loading = false;
    }
  });

  function validate(): boolean {
    if (!selectedClient) {
      error = 'Seleziona un cliente.';
      return false;
    }
    if (lineItems.length === 0) {
      error = 'Aggiungi almeno un prodotto.';
      return false;
    }
    if (lineItems.some((l) => !l.prodotto || l.quantita <= 0)) {
      error = 'Ogni riga deve avere un prodotto e una quantità maggiore di zero.';
      return false;
    }
    return true;
  }

  async function logActivity(recordId: string, azione: string, dettagli: string) {
    try {
      await pb.collection('activity_log').create({
        utente: $currentUser?.id,
        azione,
        collection_rif: 'orders',
        record_rif: recordId,
        dettagli: JSON.stringify({ messaggio: dettagli })
      });
    } catch {
      /* il log non deve bloccare il flusso */
    }
  }

  async function save(conferma: boolean) {
    if (saving) return;
    error = '';
    if (!validate() || !selectedClient) return;

    if (conferma) {
      try {
        const shortages = await findShortages(pb, lineItems);
        if (shortages.length > 0) {
          const righe = shortages
            .map((s) => {
              const p = productById(s.prodottoId);
              return `• ${p?.nome ?? s.prodottoId}: richiesti ${s.richiesti}, disponibili ${s.disponibili}`;
            })
            .join('\n');
          if (!confirm(`Giacenza insufficiente:\n${righe}\n\nConfermare comunque? La giacenza andrà sotto zero (vendita in eccedenza).`)) return;
        }
      } catch {
        /* controllo non bloccante */
      }
    }

    saving = true;
    let createdId = '';
    try {
      const created = await createOrderWithItems(
        pb,
        {
          numero_ordine: newOrderNumber(),
          cliente: selectedClient.id,
          agente: agenteId || undefined,
          stato: 'bozza',
          canale,
          totale: totaleOrdine,
          totale_imponibile: totaleImponibile,
          iva,
          iva_percentuale: ivaPercentuale,
          note: note.trim() || undefined
        },
        lineItems.map((l) => ({
          prodotto: l.prodotto,
          quantita: l.quantita,
          prezzo_unitario: l.prezzo_unitario,
          sconto_percentuale: l.sconto_percentuale,
          totale_riga: l.totale_riga
        }))
      );
      createdId = created.id;

      if (conferma) {
        try {
          for (const l of lineItems) {
            await eseguiScaricoMagazzino(pb, {
              prodottoId: l.prodotto,
              quantita: l.quantita,
              causale: `Ordine ${created.numero_ordine}`,
              ordineRif: created.id,
              utenteId: $currentUser?.id
            });
          }
          await pb.collection('orders').update(created.id, { stato: 'confermato' });
        } catch (e) {
          // Annulla lo scarico parziale: l'ordine resta in bozza, nulla viene perso né duplicato.
          await ripristinaGiacenzaDaOrdine(pb, created.id, {
            utenteId: $currentUser?.id,
            causalePrefix: 'Rollback conferma ordine'
          }).catch(() => {});
          await logActivity(created.id, 'creato', 'Bozza creata (conferma non riuscita)');
          error = `Ordine salvato come bozza ma non confermato: ${
            (e as any)?.message ?? 'errore magazzino'
          }. Puoi confermarlo dal dettaglio.`;
          saving = false;
          setTimeout(() => goto(`/ordini/${createdId}`), 2500);
          return;
        }
      }

      await logActivity(created.id, conferma ? 'confermato' : 'creato', conferma ? 'Ordine confermato' : 'Bozza creata');
      goto(`/ordini/${created.id}`);
    } catch (e: any) {
      error = e?.message ?? 'Errore durante il salvataggio dell’ordine.';
      saving = false;
    }
  }
</script>

<svelte:window onclick={onWindowClick} />
<svelte:head><title>Nuovo ordine | ERP Spirito Alchemico</title></svelte:head>

<PageHeader
  titolo="Nuovo ordine"
  sottotitolo={isAgente
    ? 'Compila l’ordine e invialo: l’amministrazione lo confermerà e impegnerà il magazzino.'
    : 'Scegli il cliente, aggiungi i prodotti e conferma.'}
>
  <Button variant="ghost" onclick={() => goto('/ordini')}>Annulla</Button>
</PageHeader>

{#if loading}
  <div class="py-24 grid place-items-center"><Spinner /></div>
{:else if loadError}
  <Card><p class="text-sm text-rose-600">{loadError}</p></Card>
{:else}
  <div class="grid gap-5 xl:grid-cols-[1fr_360px] items-start fade-in">
    <div class="space-y-5 min-w-0">
      <!-- Cliente -->
      <Card>
        <h2 class="text-sm font-semibold mb-3">1 · Cliente</h2>
        <div class="relative" bind:this={clientBox}>
          {#if selectedClient}
            <div class="flex items-center justify-between gap-3 rounded-2xl bg-[#FFF3CD] px-4 py-3">
              <div class="min-w-0">
                <p class="font-semibold truncate">{selectedClient.ragione_sociale}</p>
                <p class="text-xs text-[#6B7280] truncate">
                  {[selectedClient.citta, selectedClient.email].filter(Boolean).join(' · ') || '—'}
                </p>
              </div>
              <button
                type="button"
                class="p-2 rounded-xl hover:bg-black/5 shrink-0"
                aria-label="Cambia cliente"
                onclick={clearClient}
              >
                <X class="h-4 w-4" />
              </button>
            </div>
          {:else}
            <div class="relative">
              <Search class="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9CA3AF]" />
              <input
                type="search"
                class="field w-full pl-11"
                placeholder="Cerca cliente per nome, città o email…"
                bind:value={clientSearch}
                onfocus={() => (clientOpen = true)}
                oninput={() => (clientOpen = true)}
                autocomplete="off"
              />
            </div>
            {#if clientOpen}
              <ul
                class="absolute z-20 mt-2 w-full max-h-72 overflow-auto rounded-2xl bg-white shadow-xl border border-black/5 p-1"
                role="listbox"
              >
                {#each filteredClients as c (c.id)}
                  <li>
                    <button
                      type="button"
                      class="w-full text-left rounded-xl px-3 py-2.5 hover:bg-[#FFF3CD] min-h-[44px]"
                      onclick={() => pickClient(c)}
                    >
                      <span class="block text-sm font-medium truncate">{c.ragione_sociale}</span>
                      <span class="block text-xs text-[#6B7280] truncate">
                        {[c.citta, c.email].filter(Boolean).join(' · ')}
                      </span>
                    </button>
                  </li>
                {:else}
                  <li class="px-3 py-4 text-sm text-[#6B7280]">
                    Nessun cliente trovato.
                    <a href="/clienti" class="underline">Crea un cliente</a>
                  </li>
                {/each}
              </ul>
            {/if}
          {/if}
        </div>
      </Card>

      <!-- Righe -->
      <Card>
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-sm font-semibold">2 · Prodotti</h2>
          <Button size="sm" variant="secondary" onclick={addLine} disabled={products.length === 0}>
            <Plus class="h-4 w-4" /> Aggiungi
          </Button>
        </div>

        {#if lineItems.length === 0}
          <button
            type="button"
            class="w-full rounded-2xl border-2 border-dashed border-black/10 py-10 text-sm text-[#6B7280] hover:border-[#F5D547] hover:bg-[#FFFDF0] transition"
            onclick={addLine}
          >
            Tocca per aggiungere il primo prodotto
          </button>
        {:else}
          <ul class="space-y-3">
            {#each lineItems as l (l.id)}
              {@const avail = stock.get(l.prodotto) ?? 0}
              <li class="rounded-2xl border border-black/[0.06] bg-white p-3 sm:p-4">
                <div class="flex items-start gap-2">
                  <select
                    class="field flex-1 min-w-0"
                    value={l.prodotto}
                    onchange={(e) => setProduct(l.id, e.currentTarget.value)}
                    aria-label="Prodotto"
                  >
                    {#each products as p (p.id)}
                      <option value={p.id}>{p.nome} ({p.sku})</option>
                    {/each}
                  </select>
                  <button
                    type="button"
                    class="h-11 w-11 shrink-0 grid place-items-center rounded-2xl text-rose-600 hover:bg-rose-50"
                    aria-label="Rimuovi riga"
                    onclick={() => removeLine(l.id)}
                  >
                    <Trash2 class="h-4 w-4" />
                  </button>
                </div>

                <div class="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
                  <div class="col-span-2 sm:col-span-1">
                    <span class="block text-xs text-[#6B7280] mb-1">Quantità</span>
                    <div class="flex items-center gap-1">
                      <button
                        type="button"
                        class="h-11 w-11 shrink-0 grid place-items-center rounded-2xl bg-black/[0.04] hover:bg-black/[0.08]"
                        aria-label="Diminuisci"
                        onclick={() => bump(l.id, -1)}
                      >
                        <Minus class="h-4 w-4" />
                      </button>
                      <input
                        class="field w-full text-center px-1"
                        type="number"
                        inputmode="numeric"
                        min="1"
                        value={l.quantita}
                        oninput={(e) => setNum(l.id, 'quantita', e.currentTarget.value)}
                      />
                      <button
                        type="button"
                        class="h-11 w-11 shrink-0 grid place-items-center rounded-2xl bg-black/[0.04] hover:bg-black/[0.08]"
                        aria-label="Aumenta"
                        onclick={() => bump(l.id, 1)}
                      >
                        <Plus class="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <label class="block">
                    <span class="block text-xs text-[#6B7280] mb-1">Prezzo unit. (€)</span>
                    <input
                      class="field w-full"
                      type="number"
                      inputmode="decimal"
                      step="0.01"
                      min="0"
                      value={l.prezzo_unitario}
                      oninput={(e) => setNum(l.id, 'prezzo_unitario', e.currentTarget.value)}
                    />
                  </label>
                  <label class="block">
                    <span class="block text-xs text-[#6B7280] mb-1">Sconto %</span>
                    <input
                      class="field w-full"
                      type="number"
                      inputmode="decimal"
                      step="0.5"
                      min="0"
                      max="100"
                      value={l.sconto_percentuale}
                      oninput={(e) => setNum(l.id, 'sconto_percentuale', e.currentTarget.value)}
                    />
                  </label>
                  <div class="col-span-2 sm:col-span-1 text-right">
                    <span class="block text-xs text-[#6B7280] mb-1">Totale riga</span>
                    <span class="text-lg font-bold">{formatEuro(l.totale_riga)}</span>
                  </div>
                </div>

                <p
                  class="mt-2 text-xs flex items-center gap-1.5 {l.quantita > avail
                    ? 'text-rose-600 font-medium'
                    : 'text-[#6B7280]'}"
                >
                  {#if l.quantita > avail}<TriangleAlert class="h-3.5 w-3.5" />{/if}
                  Disponibili in magazzino: {avail}
                </p>
              </li>
            {/each}
          </ul>
        {/if}
      </Card>

      <!-- Dettagli -->
      <Card>
        <h2 class="text-sm font-semibold mb-3">3 · Dettagli</h2>
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="block">
            <span class="block text-xs text-[#6B7280] mb-1">Canale (listino prezzi)</span>
            <select class="field w-full" bind:value={canale} onchange={onCanaleChange}>
              {#each Object.entries(CANALE_LABELS) as [k, v]}
                <option value={k}>{v}</option>
              {/each}
            </select>
          </label>
          <label class="block">
            <span class="block text-xs text-[#6B7280] mb-1">IVA %</span>
            <input
              class="field w-full"
              type="number"
              inputmode="decimal"
              min="0"
              max="100"
              bind:value={ivaPercentuale}
            />
          </label>
          {#if isAdmin}
            <label class="block sm:col-span-2">
              <span class="block text-xs text-[#6B7280] mb-1">Agente</span>
              <select
                class="field w-full"
                bind:value={agenteId}
                onchange={() => (agenteTouched = true)}
              >
                <option value="">Nessun agente (vendita diretta)</option>
                {#each agents as a}
                  <option value={a.id}>{a.name}</option>
                {/each}
              </select>
            </label>
          {:else if isAgente}
            <p class="sm:col-span-2 text-xs text-[#6B7280]">
              Agente: <span class="font-medium text-[#1A1A1A]">{displayName($currentUser)}</span>
            </p>
          {/if}
          <label class="block sm:col-span-2">
            <span class="block text-xs text-[#6B7280] mb-1">Note</span>
            <textarea class="field w-full" rows="3" bind:value={note} placeholder="Indicazioni di consegna, accordi…"></textarea>
          </label>
        </div>
      </Card>
    </div>

    <!-- Riepilogo -->
    <div class="xl:sticky xl:top-[calc(var(--topbar-h)+1rem)]">
      <Card variant="dark">
        <h2 class="text-sm font-semibold text-white/70">Riepilogo</h2>
        <dl class="mt-4 space-y-2 text-sm">
          <div class="flex justify-between"><dt class="text-white/60">Imponibile</dt><dd>{formatEuro(totaleImponibile)}</dd></div>
          <div class="flex justify-between"><dt class="text-white/60">IVA {ivaPercentuale}%</dt><dd>{formatEuro(iva)}</dd></div>
          <div class="flex justify-between pt-3 border-t border-white/10 text-lg font-bold">
            <dt>Totale</dt><dd>{formatEuro(totaleOrdine)}</dd>
          </div>
        </dl>

        {#if shortLines.length > 0}
          <p class="mt-4 rounded-xl bg-rose-500/20 text-rose-100 text-xs p-3 flex gap-2">
            <TriangleAlert class="h-4 w-4 shrink-0" />
            {shortLines.length} {shortLines.length === 1 ? 'prodotto supera' : 'prodotti superano'} la giacenza disponibile.
          </p>
        {/if}

        {#if error}
          <p class="mt-4 rounded-xl bg-rose-500/20 text-rose-100 text-sm p-3" role="alert">{error}</p>
        {/if}

        <div class="mt-5 grid gap-2">
          {#if isAgente}
            <Button variant="secondary" onclick={() => save(false)} disabled={saving}>
              <Check class="h-4 w-4" />
              {saving ? 'Invio…' : 'Invia ordine'}
            </Button>
          {:else}
            <Button variant="secondary" onclick={() => save(true)} disabled={saving}>
              <Check class="h-4 w-4" />
              {saving ? 'Salvataggio…' : 'Conferma ordine'}
            </Button>
            <Button variant="ghost" onclick={() => save(false)} disabled={saving}>Salva come bozza</Button>
          {/if}
        </div>
      </Card>
    </div>
  </div>
{/if}
