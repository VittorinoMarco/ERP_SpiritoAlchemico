<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { pb } from '$lib/pocketbase';
  import { currentRole, currentUser } from '$lib/stores/auth';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Spinner from '$lib/components/ui/Spinner.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import { ArrowLeft, FileText, Copy, Trash2, Check, Receipt } from 'lucide-svelte';
  import type { Order, OrderStato, OrderItem, OrderCanale } from '$lib/types/order';
  import {
    STATO_LABELS,
    STATO_BADGE_COLORS,
    STATO_STEPS,
    CANALE_LABELS,
    CANALE_BADGE_COLORS
  } from '$lib/types/order';
  import { eseguiScaricoMagazzino, ripristinaGiacenzaDaOrdine } from '$lib/utils/inventoryCarico';
  import { findShortages, newOrderNumber, roundMoney } from '$lib/utils/orders';
  import { formatEuro, formatData, ymdLocal } from '$lib/utils/format';

  const STATI_CON_SCARICO: OrderStato[] = ['confermato', 'spedito', 'consegnato', 'completato'];
  const hasStockMoved = (s: string | undefined) => !!s && STATI_CON_SCARICO.includes(s as OrderStato);

  const orderId = $page.params.id as string;

  type Ordine = Order & {
    expand?: {
      cliente?: { ragione_sociale?: string };
      agente?: { nome?: string; cognome?: string; email?: string };
    };
  };
  type Riga = OrderItem & { expand?: { prodotto?: { nome?: string; sku?: string } } };

  let order: Ordine | null = null;
  let items: Riga[] = [];
  let invoice: { id: string; numero_fattura?: string; stato?: string; tipo?: string } | null = null;
  let loading = true;
  let busy = false;
  let notice = '';
  let noticeKind: 'error' | 'ok' = 'error';

  $: isAdmin = $currentRole === 'admin';
  $: isOwnOrder = !!order && !!$currentUser && agenteIdOf(order) === $currentUser.id;
  /** Solo l'admin fa avanzare lo stato. Conferma scarica magazzino; la fattura e le provvigioni si gestiscono dopo. */
  $: canOperate = isAdmin;
  $: canCancel =
    !!order &&
    order.stato !== 'annullato' &&
    // Un ordine consegnato non si "annulla": reso / nota di credito sono un flusso da definire coi soci.
    order.stato !== 'consegnato' &&
    order.stato !== 'completato' &&
    (isAdmin || (order.stato === 'bozza' && isOwnOrder));

  const idx = (s: string) => STATO_STEPS.indexOf((s === 'completato' ? 'consegnato' : s) as OrderStato);
  $: currentIdx = order ? idx(order.stato) : -1;

  function itemProdId(it: any): string | null {
    const id = it.prodotto ?? it.product ?? it.expand?.prodotto?.id;
    return id && id !== '0' ? String(id) : null;
  }

  function agenteIdOf(o: Ordine | null): string | null {
    const a = o?.agente as unknown;
    if (!a) return null;
    if (typeof a === 'string') return a;
    return typeof a === 'object' && a && 'id' in a ? String((a as { id: string }).id) : null;
  }

  function agentName(ag: { nome?: string; cognome?: string; email?: string } | undefined): string {
    if (!ag) return '—';
    return ag.nome ? [ag.nome, ag.cognome].filter(Boolean).join(' ') : (ag.email ?? '—');
  }

  function imponibileOf(o: Order): number {
    const raw = o.totale_imponibile;
    if (raw != null && (raw as unknown) !== '' && Number.isFinite(Number(raw))) return Number(raw);
    const pct = Number(o.iva_percentuale ?? 22);
    return roundMoney((Number(o.totale) || 0) / (1 + pct / 100));
  }

  async function loadOrder() {
    order = (await pb.collection('orders').getOne(orderId, { expand: 'cliente,agente' })) as Ordine;
  }

  async function loadInvoice() {
    try {
      const r = await pb.collection('invoices').getFullList({ filter: `ordine = "${orderId}"` });
      const docs = r as { id: string; tipo?: string; stato?: string; numero_fattura?: string }[];
      invoice =
        docs.find((i) => i.tipo === 'fattura') ??
        docs.find((i) => i.tipo === 'proforma' && i.stato !== 'convertita') ??
        docs[0] ??
        null;
    } catch {
      invoice = null; // ruolo senza accesso alle fatture
    }
  }

  onMount(async () => {
    try {
      await loadOrder();
      items = (await pb.collection('order_items').getFullList({
        filter: `ordine = "${orderId}"`,
        expand: 'prodotto'
      })) as unknown as Riga[];
      await loadInvoice();
    } catch {
      order = null;
    } finally {
      loading = false;
    }
  });

  function flash(msg: string, kind: 'error' | 'ok' = 'error') {
    notice = msg;
    noticeKind = kind;
  }

  async function logActivity(azione: string, dettagli: string) {
    try {
      await pb.collection('activity_log').create({
        utente: $currentUser?.id,
        azione,
        collection_rif: 'orders',
        record_rif: orderId,
        dettagli: JSON.stringify({ messaggio: dettagli })
      });
    } catch {
      /* il log non blocca il flusso */
    }
  }

  async function changeStato(newStato: OrderStato) {
    if (!order || busy || !canOperate) return;
    const oldStato = order.stato;
    if (idx(newStato) !== idx(oldStato) + 1) return;
    notice = '';
    busy = true;
    let scaricoFatto = false;
    try {
      if (newStato === 'confermato' && oldStato === 'bozza') {
        if (items.some((i) => !itemProdId(i))) {
          throw new Error('Ci sono righe senza prodotto valido: correggile prima di confermare.');
        }
        const lines = items.map((i) => ({ prodotto: itemProdId(i)!, quantita: Number(i.quantita) || 0 }));
        const shortages = await findShortages(pb, lines);
        if (shortages.length > 0) {
          const righe = shortages
            .map((s) => {
              const it = items.find((i) => itemProdId(i) === s.prodottoId);
              return `• ${it?.expand?.prodotto?.nome ?? s.prodottoId}: richiesti ${s.richiesti}, disponibili ${s.disponibili}`;
            })
            .join('\n');
          if (!confirm(`Giacenza insufficiente:\n${righe}\n\nConfermare comunque? La giacenza andrà sotto zero (vendita in eccedenza).`)) {
            busy = false;
            return;
          }
        }
        try {
          for (const l of lines) {
            if (l.quantita <= 0) continue;
            await eseguiScaricoMagazzino(pb, {
              prodottoId: l.prodotto,
              quantita: l.quantita,
              causale: `Ordine ${order.numero_ordine}`,
              ordineRif: orderId,
              utenteId: $currentUser?.id
            });
            scaricoFatto = true;
          }
        } catch (e) {
          await ripristinaGiacenzaDaOrdine(pb, orderId, {
            utenteId: $currentUser?.id,
            causalePrefix: 'Rollback conferma ordine'
          }).catch(() => {});
          throw e;
        }
      }

      try {
        await pb.collection('orders').update(orderId, { stato: newStato });
      } catch (e: any) {
        // Alcuni schemi PocketBase usano "completato" al posto di "consegnato"
        if (newStato === 'consegnato' && e?.status === 400) {
          await pb.collection('orders').update(orderId, { stato: 'completato' });
        } else {
          throw e;
        }
      }
      await loadOrder();
      await logActivity('stato_cambiato', `Da ${oldStato} a ${newStato}`);
    } catch (e: any) {
      if (scaricoFatto) {
        await ripristinaGiacenzaDaOrdine(pb, orderId, {
          utenteId: $currentUser?.id,
          causalePrefix: 'Rollback conferma ordine'
        }).catch(() => {});
      }
      flash(e?.message ?? 'Errore durante l’aggiornamento dello stato');
    } finally {
      busy = false;
    }
  }

  /**
   * All'annullamento le provvigioni maturate dell'ordine passano a "stornata" (storico conservato).
   * Quelle già liquidate NON vengono toccate: vanno compensate a mano (segnalato all'admin).
   */
  async function stornaProvvigioni(): Promise<string> {
    if (!isAdmin) return '';
    try {
      const comms = await pb.collection('agent_commissions').getFullList({ filter: `ordine = "${orderId}"` });
      let stornate = 0;
      let liquidate = 0;
      for (const c of comms as any[]) {
        if (c.stato === 'maturata') {
          await pb.collection('agent_commissions').update(c.id, {
            stato: 'stornata',
            data_storno: ymdLocal(new Date()),
            motivo_storno: `Ordine ${order?.numero_ordine ?? orderId} annullato`
          });
          stornate++;
        } else if (c.stato === 'liquidata') {
          liquidate++;
        }
      }
      const parts: string[] = [];
      if (stornate) parts.push(`${stornate} provvigione/i stornata/e`);
      if (liquidate) parts.push(`${liquidate} provvigione/i già liquidata/e: da compensare manualmente`);
      return parts.join('; ');
    } catch (e) {
      console.error('Storno provvigioni fallito', e);
      return 'Storno provvigioni non riuscito: verifica la scheda agente';
    }
  }

  async function handleAnnulla() {
    if (!order || busy || !canCancel) return;
    if (invoice) {
      flash(`Esiste la fattura ${invoice.numero_fattura ?? ''}: un ordine fatturato non si annulla dal gestionale (serve una nota di credito, flusso da definire).`);
      return;
    }
    if (!confirm(`Annullare l'ordine ${order.numero_ordine}?`)) return;
    notice = '';
    busy = true;
    try {
      if (hasStockMoved(order.stato)) {
        await ripristinaGiacenzaDaOrdine(pb, orderId, {
          utenteId: $currentUser?.id,
          causalePrefix: 'Ripristino annullamento ordine'
        });
      }
      await pb.collection('orders').update(orderId, { stato: 'annullato' });
      const provvNote = await stornaProvvigioni();
      await loadOrder();
      await logActivity('stato_cambiato', `Annullato${provvNote ? ` — ${provvNote}` : ''}`);
      if (provvNote) flash(provvNote);
    } catch (e: any) {
      flash(e?.message ?? 'Errore durante l’annullamento');
    } finally {
      busy = false;
    }
  }

  async function handleDelete() {
    if (!order || busy || !isAdmin) return;
    if (order.stato !== 'bozza' && order.stato !== 'annullato') {
      flash('Un ordine confermato non si elimina: annullalo (il magazzino e le provvigioni vengono ripristinati e lo storico resta).');
      return;
    }
    if (invoice) {
      flash(`Esiste la fattura ${invoice.numero_fattura ?? ''}: non puoi eliminare l’ordine.`);
      return;
    }
    try {
      const linked = await pb.collection('agent_commissions').getList(1, 1, { filter: `ordine = "${orderId}"` });
      if (linked.totalItems > 0) {
        flash('L’ordine ha provvigioni collegate: resta archiviato come annullato per conservare lo storico.');
        return;
      }
    } catch {
      /* se il controllo fallisce decide comunque la regola API */
    }
    if (!confirm(`Eliminare definitivamente l'ordine ${order.numero_ordine} e le sue righe?`)) return;
    busy = true;
    try {
      if (hasStockMoved(order.stato)) {
        await ripristinaGiacenzaDaOrdine(pb, orderId, {
          utenteId: $currentUser?.id,
          causalePrefix: 'Ripristino eliminazione ordine'
        });
      }
      for (const item of items) await pb.collection('order_items').delete(item.id);
      await pb.collection('orders').delete(orderId);
      goto('/ordini');
    } catch (e: any) {
      flash(e?.message ?? 'Errore durante l’eliminazione');
      busy = false;
    }
  }

  /** Prossimo numero documento: PRF/FAT-AAAA-NNNN. */
  async function nextDoc(kind: 'PRF' | 'FAT'): Promise<string> {
    const { nextDocumentNumber } = await import('$lib/utils/documents');
    return nextDocumentNumber(pb, kind);
  }

  async function generaProforma() {
    if (!order || busy || !isAdmin || order.stato === 'bozza' || order.stato === 'annullato') return;
    await loadInvoice();
    if (invoice) {
      goto(`/fatture/${invoice.id}`);
      return;
    }
    busy = true;
    notice = '';
    try {
      const imponibile = imponibileOf(order);
      const totale = Number(order.totale) || 0;
      const ivaImporto = order.iva != null && Number.isFinite(Number(order.iva)) ? Number(order.iva) : roundMoney(totale - imponibile);
      const emissione = new Date();
      const scadenza = new Date(emissione.getTime() + 30 * 24 * 60 * 60 * 1000);
      const inv = await pb.collection('invoices').create({
        numero_fattura: await nextDoc('PRF'),
        ordine: orderId,
        cliente: order.cliente,
        data_emissione: ymdLocal(emissione),
        data_scadenza: ymdLocal(scadenza),
        totale_imponibile: imponibile,
        iva: ivaImporto,
        totale,
        stato: 'emessa',
        tipo: 'proforma'
      });
      await logActivity('proforma_generata', `Proforma ${inv.numero_fattura}`);
      goto(`/fatture/${inv.id}`);
    } catch (e: any) {
      flash(e?.message ?? 'Errore nella generazione della proforma');
      busy = false;
    }
  }

  async function duplicaOrdine() {
    if (!order || busy) return;
    busy = true;
    notice = '';
    try {
      const { createOrderWithItems } = await import('$lib/utils/orders');
      const created = await createOrderWithItems(
        pb,
        {
          numero_ordine: newOrderNumber(),
          cliente: order.cliente,
          agente: agenteIdOf(order) ?? undefined,
          stato: 'bozza',
          canale: order.canale,
          totale: order.totale,
          totale_imponibile: order.totale_imponibile,
          iva: order.iva,
          iva_percentuale: order.iva_percentuale,
          note: order.note ? `(Duplicato da ${order.numero_ordine}) ${order.note}` : `Duplicato da ${order.numero_ordine}`
        },
        items
          .filter((i) => itemProdId(i))
          .map((i) => ({
            prodotto: itemProdId(i)!,
            quantita: i.quantita,
            prezzo_unitario: i.prezzo_unitario,
            sconto_percentuale: i.sconto_percentuale ?? 0,
            totale_riga: i.totale_riga
          }))
      );
      await logActivity('duplicato', `Ordine duplicato in ${created.numero_ordine}`);
      goto(`/ordini/${created.id}`);
    } catch (e: any) {
      flash(e?.message ?? 'Errore durante la duplicazione');
      busy = false;
    }
  }

  $: nextStep = order && order.stato !== 'annullato' ? STATO_STEPS[currentIdx + 1] : undefined;
  const nextLabel: Record<string, string> = {
    confermato: 'Conferma ordine',
    spedito: 'Segna come spedito',
    consegnato: 'Segna come consegnato'
  };
</script>

<svelte:head>
  <title>Ordine {order?.numero_ordine ?? ''} | ERP Spirito Alchemico</title>
</svelte:head>

<div class="flex items-center gap-3 mb-5 lg:mb-7">
  <button
    type="button"
    class="h-11 w-11 grid place-items-center rounded-2xl bg-white/80 border border-black/[0.06] hover:bg-white shrink-0"
    onclick={() => goto('/ordini')}
    aria-label="Torna agli ordini"
  >
    <ArrowLeft class="h-5 w-5" />
  </button>
  <div class="min-w-0">
    <p class="text-xs text-[#6B7280]">Ordine</p>
    <h1 class="text-xl sm:text-3xl font-bold tracking-tight truncate">{order?.numero_ordine ?? '…'}</h1>
  </div>
  {#if order}
    <div class="ml-auto flex flex-wrap gap-2 justify-end">
      <span class="inline-flex rounded-full px-3 py-1 text-xs font-semibold {STATO_BADGE_COLORS[order.stato] ?? 'bg-gray-100'}">
        {STATO_LABELS[order.stato] ?? order.stato}
      </span>
      <span
        class="hidden sm:inline-flex rounded-full px-3 py-1 text-xs font-semibold {CANALE_BADGE_COLORS[order.canale as OrderCanale] ?? 'bg-gray-100'}"
      >
        {CANALE_LABELS[order.canale as OrderCanale] ?? order.canale}
      </span>
    </div>
  {/if}
</div>

{#if loading}
  <Spinner />
{:else if !order}
  <Card>
    <EmptyState titolo="Ordine non trovato" testo="Potrebbe essere stato eliminato o non hai i permessi per vederlo.">
      <Button onclick={() => goto('/ordini')}>Torna agli ordini</Button>
    </EmptyState>
  </Card>
{:else}
  <div class="space-y-5 fade-in">
    <!-- Avanzamento -->
    <Card>
      {#if order.stato === 'annullato'}
        <p class="text-sm text-rose-700 font-medium">Ordine annullato — la giacenza è stata riallineata.</p>
      {:else}
        <ol class="flex items-start">
          {#each STATO_STEPS as stato, i}
            {@const done = currentIdx > i}
            {@const active = currentIdx === i}
            <li class="flex items-start flex-1 last:flex-none">
              <div class="flex flex-col items-center gap-1.5 w-16 sm:w-20">
                <span
                  class="h-9 w-9 sm:h-10 sm:w-10 rounded-full grid place-items-center text-sm font-semibold transition-colors {done
                    ? 'bg-[#F5D547] text-[#1A1A1A]'
                    : active
                      ? 'bg-[#1A1A1A] text-white'
                      : 'bg-[#EDEDED] text-[#9CA3AF]'}"
                >
                  {#if done}<Check class="h-4 w-4" />{:else}{i + 1}{/if}
                </span>
                <span class="text-[11px] sm:text-xs text-center {active ? 'font-semibold' : 'text-[#6B7280]'}">
                  {STATO_LABELS[stato]}
                </span>
              </div>
              {#if i < STATO_STEPS.length - 1}
                <div class="flex-1 h-0.5 mt-[18px] sm:mt-5 rounded {done ? 'bg-[#F5D547]' : 'bg-[#EDEDED]'}"></div>
              {/if}
            </li>
          {/each}
        </ol>
      {/if}
    </Card>

    <div class="grid gap-5 lg:grid-cols-[1fr_340px] items-start">
      <div class="space-y-5 min-w-0">
        <Card>
          <h2 class="text-sm font-semibold mb-4">Dati ordine</h2>
          <dl class="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            <div><dt class="text-xs text-[#6B7280]">Data</dt><dd class="text-sm font-medium mt-0.5">{formatData(order.data_ordine)}</dd></div>
            <div>
              <dt class="text-xs text-[#6B7280]">Cliente</dt>
              <dd class="text-sm font-medium mt-0.5">
                {#if order.cliente}
                  <a href="/clienti/{order.cliente}" class="hover:underline">{order.expand?.cliente?.ragione_sociale ?? '—'}</a>
                {:else}—{/if}
              </dd>
            </div>
            <div><dt class="text-xs text-[#6B7280]">Agente</dt><dd class="text-sm font-medium mt-0.5">{agentName(order.expand?.agente)}</dd></div>
            <div class="sm:hidden">
              <dt class="text-xs text-[#6B7280]">Canale</dt>
              <dd class="text-sm font-medium mt-0.5">{CANALE_LABELS[order.canale as OrderCanale] ?? order.canale}</dd>
            </div>
          </dl>
          {#if order.note}
            <div class="mt-4 pt-4 border-t border-black/5">
              <p class="text-xs text-[#6B7280]">Note</p>
              <p class="text-sm mt-1 whitespace-pre-line">{order.note}</p>
            </div>
          {/if}
        </Card>

        <Card className="!p-0 overflow-hidden">
          <h2 class="text-sm font-semibold px-5 pt-5 lg:px-6 lg:pt-6 mb-3">Righe ordine</h2>
          {#if items.length === 0}
            <p class="px-6 py-10 text-center text-sm text-[#6B7280]">Nessuna riga</p>
          {:else}
            <!-- Mobile -->
            <ul class="md:hidden divide-y divide-black/5">
              {#each items as it (it.id)}
                <li class="px-5 py-3.5 flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <p class="text-sm font-medium truncate">{it.expand?.prodotto?.nome ?? 'Prodotto rimosso'}</p>
                    <p class="text-xs text-[#6B7280] mt-0.5">
                      {it.quantita} × {formatEuro(it.prezzo_unitario)}{#if it.sconto_percentuale} · −{it.sconto_percentuale}%{/if}
                    </p>
                  </div>
                  <p class="text-sm font-semibold shrink-0">{formatEuro(it.totale_riga)}</p>
                </li>
              {/each}
            </ul>
            <!-- Desktop -->
            <div class="hidden md:block">
              <table class="w-full text-sm">
                <thead>
                  <tr class="text-left text-xs text-[#6B7280]">
                    <th class="px-6 py-2 font-medium">Prodotto</th>
                    <th class="px-3 py-2 font-medium text-right">Qtà</th>
                    <th class="px-3 py-2 font-medium text-right">Prezzo</th>
                    <th class="px-3 py-2 font-medium text-right">Sconto</th>
                    <th class="px-6 py-2 font-medium text-right">Totale</th>
                  </tr>
                </thead>
                <tbody>
                  {#each items as it (it.id)}
                    <tr class="border-t border-black/5">
                      <td class="px-6 py-3 font-medium">
                        {it.expand?.prodotto?.nome ?? 'Prodotto rimosso'}
                        <span class="text-xs text-[#9CA3AF] font-normal ml-1">{it.expand?.prodotto?.sku ?? ''}</span>
                      </td>
                      <td class="px-3 py-3 text-right">{it.quantita}</td>
                      <td class="px-3 py-3 text-right">{formatEuro(it.prezzo_unitario)}</td>
                      <td class="px-3 py-3 text-right">{it.sconto_percentuale ?? 0}%</td>
                      <td class="px-6 py-3 text-right font-semibold">{formatEuro(it.totale_riga)}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
          <div class="px-5 py-4 lg:px-6 border-t border-black/5 bg-black/[0.02] space-y-1 text-sm">
            <div class="flex justify-between text-[#6B7280]">
              <span>Imponibile</span><span>{formatEuro(imponibileOf(order))}</span>
            </div>
            <div class="flex justify-between text-[#6B7280]">
              <span>IVA {order.iva_percentuale != null ? `${order.iva_percentuale}%` : ''}</span>
              <span>{formatEuro(order.iva ?? (Number(order.totale) || 0) - imponibileOf(order))}</span>
            </div>
            <div class="flex justify-between text-base font-bold pt-1">
              <span>Totale</span><span>{formatEuro(order.totale)}</span>
            </div>
          </div>
        </Card>
      </div>

      <!-- Azioni -->
      <Card className="lg:sticky lg:top-[calc(var(--topbar-h)+1rem)]">
        <h2 class="text-sm font-semibold mb-3">Azioni</h2>
        {#if notice}
          <p
            class="mb-3 rounded-xl p-3 text-sm {noticeKind === 'error' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}"
            role="alert"
          >
            {notice}
          </p>
        {/if}
        <div class="flex flex-col gap-2.5">
          {#if canOperate && nextStep && nextLabel[nextStep]}
            <Button disabled={busy} onclick={() => changeStato(nextStep)}>{busy ? 'Attendere…' : nextLabel[nextStep]}</Button>
          {:else if !canOperate && order.stato === 'bozza'}
            <p class="text-xs text-[#6B7280] rounded-xl bg-[#FFF3CD] p-3">
              Ordine in attesa di conferma dall’amministrazione.
            </p>
          {/if}

          {#if invoice}
            <Button variant="secondary" onclick={() => goto(`/fatture/${invoice!.id}`)}>
              <Receipt class="h-4 w-4" />
              {invoice.tipo === 'proforma' ? 'Vedi proforma' : 'Vedi fattura'}
              {invoice.numero_fattura ?? ''}
            </Button>
          {:else if isAdmin && order.stato !== 'bozza' && order.stato !== 'annullato'}
            <Button variant="secondary" disabled={busy} onclick={generaProforma}>
              <FileText class="h-4 w-4" /> Genera proforma
            </Button>
          {/if}

          <Button variant="ghost" disabled={busy} onclick={duplicaOrdine}><Copy class="h-4 w-4" /> Duplica ordine</Button>

          {#if canCancel}
            <Button variant="ghost" className="!text-amber-700 hover:!bg-amber-50" disabled={busy} onclick={handleAnnulla}>
              Annulla ordine
            </Button>
          {/if}
          {#if isAdmin && (order.stato === 'bozza' || order.stato === 'annullato')}
            <Button variant="ghost" className="!text-rose-600 hover:!bg-rose-50" disabled={busy} onclick={handleDelete}>
              <Trash2 class="h-4 w-4" /> Elimina ordine
            </Button>
          {/if}
        </div>
      </Card>
    </div>
  </div>
{/if}
