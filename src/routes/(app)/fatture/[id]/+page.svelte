<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { pb } from '$lib/pocketbase';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Modal from '$lib/components/ui/Modal.svelte';
  import { ArrowLeft, FileDown, CheckCircle } from 'lucide-svelte';
  import type { Invoice, InvoiceStato } from '$lib/types/invoice';
  import { STATO_LABELS, STATO_BADGE_COLORS } from '$lib/types/invoice';
  import type { OrderItem } from '$lib/types/order';
  import { generateInvoicePdf } from '$lib/utils/pdfInvoice';

  const invoiceId = $page.params.id;

  let invoice: (Invoice & {
    expand?: {
      cliente?: {
        ragione_sociale?: string;
        partita_iva?: string;
        codice_fiscale?: string;
        indirizzo?: string;
        citta?: string;
        cap?: string;
        provincia?: string;
      };
      ordine?: {
        numero_ordine?: string;
        data_ordine?: string;
        totale?: number;
        note?: string;
      };
    };
  }) | null = null;
  let orderItems: (OrderItem & {
    expand?: { prodotto?: { nome?: string; sku?: string } };
  })[] = [];
  let loading = true;
  let pagamentoModalOpen = false;
  let dataPagamento = '';
  let saving = false;

  const today = new Date().toISOString().split('T')[0];

  $: isScaduta = invoice && invoice.data_scadenza < today && invoice.stato !== 'pagata';

  onMount(async () => {
    try {
      invoice = await pb.collection('invoices').getOne(invoiceId, {
        expand: 'cliente,ordine'
      });
      if (invoice?.ordine) {
        orderItems = await pb.collection('order_items').getFullList({
          filter: `ordine = "${invoice.ordine}"`,
          expand: 'prodotto'
        });
      }
    } catch {
      invoice = null;
      orderItems = [];
    } finally {
      loading = false;
    }
  });

  async function segnaPagata() {
    if (!invoice || !dataPagamento || saving) return;
    saving = true;
    try {
      invoice = await pb.collection('invoices').update(invoiceId, {
        stato: 'pagata',
        data_pagamento: dataPagamento
      }) as typeof invoice;
      pagamentoModalOpen = false;
      dataPagamento = '';
    } catch (e) {
      console.error(e);
    } finally {
      saving = false;
    }
  }

  function downloadPdf() {
    if (!invoice) return;
    const cliente = invoice.expand?.cliente;
    const righe = orderItems.map((item) => ({
      descrizione: `${item.expand?.prodotto?.nome ?? '—'} (${item.expand?.prodotto?.sku ?? '—'})`,
      quantita: item.quantita,
      prezzo_unitario: item.prezzo_unitario,
      sconto_percentuale: item.sconto_percentuale ?? 0,
      totale_riga: item.totale_riga
    }));
    if (righe.length === 0) {
      righe.push({
        descrizione: 'Ordine ' + (invoice.expand?.ordine?.numero_ordine ?? ''),
        quantita: 1,
        prezzo_unitario: invoice.totale ?? 0,
        sconto_percentuale: 0,
        totale_riga: invoice.totale ?? 0
      });
    }
    generateInvoicePdf({
      numero_fattura: invoice.numero_fattura ?? '—',
      data_emissione: formatDateShort(invoice.data_emissione),
      data_scadenza: formatDateShort(invoice.data_scadenza),
      cliente: {
        ragione_sociale: cliente?.ragione_sociale ?? '—',
        partita_iva: cliente?.partita_iva,
        codice_fiscale: cliente?.codice_fiscale,
        indirizzo: cliente?.indirizzo,
        citta: cliente?.citta,
        cap: cliente?.cap,
        provincia: cliente?.provincia
      },
      righe,
      totale_imponibile: invoice.totale_imponibile ?? 0,
      iva: invoice.iva ?? 0,
      totale: invoice.totale ?? 0
    });
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

  function formatDateShort(s: string | null | undefined): string {
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
</script>

<svelte:head>
  <title>Fattura {invoice?.numero_fattura ?? ''} | ERP Spirito Alchemico</title>
</svelte:head>

<div class="space-y-6">
  <div class="flex items-center gap-4">
    <button
      type="button"
      class="p-2 rounded-2xl text-[#6B7280] hover:bg-black/5 transition-colors"
      onclick={() => goto('/fatture')}
      aria-label="Indietro"
    >
      <ArrowLeft class="h-5 w-5" />
    </button>
    <h1 class="text-3xl font-bold text-[#1A1A1A] tracking-tight">
      Fattura {invoice?.numero_fattura ?? ''}
    </h1>
  </div>

  {#if loading}
    <Card>
      <div class="py-16 text-center">
        <p class="text-sm text-[#6B7280]">Caricamento...</p>
      </div>
    </Card>
  {:else if !invoice}
    <Card>
      <div class="py-16 text-center">
        <p class="text-sm text-[#6B7280]">Fattura non trovata</p>
        <Button variant="ghost" className="mt-4" onclick={() => goto('/fatture')}>
          Torna alle fatture
        </Button>
      </div>
    </Card>
  {:else}
    <div class="grid gap-6 lg:grid-cols-3">
      <!-- Dati fattura -->
      <Card className="lg:col-span-2 {isScaduta ? 'ring-2 ring-rose-200' : ''}">
        <div class="flex flex-wrap items-center gap-2 mb-4">
          <span
            class="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium {isScaduta
              ? 'bg-rose-100 text-rose-800'
              : STATO_BADGE_COLORS[invoice.stato as InvoiceStato] ?? 'bg-gray-100'}"
          >
            {isScaduta ? 'Scaduta' : STATO_LABELS[invoice.stato as InvoiceStato]}
          </span>
          {#if invoice.stato === 'pagata' && invoice.data_pagamento}
            <span class="text-sm text-[#6B7280]">
              Pagata il {formatDate(invoice.data_pagamento)}
            </span>
          {/if}
        </div>
        <dl class="grid gap-2 sm:grid-cols-2">
          <div class="flex justify-between sm:block">
            <dt class="text-sm text-[#6B7280]">Data emissione</dt>
            <dd class="text-sm font-medium text-[#1A1A1A]">{formatDate(invoice.data_emissione)}</dd>
          </div>
          <div class="flex justify-between sm:block">
            <dt class="text-sm text-[#6B7280]">Data scadenza</dt>
            <dd class="text-sm font-medium text-[#1A1A1A]">{formatDate(invoice.data_scadenza)}</dd>
          </div>
          <div class="flex justify-between sm:block sm:col-span-2">
            <dt class="text-sm text-[#6B7280]">Cliente</dt>
            <dd class="text-sm font-medium text-[#1A1A1A]">
              {invoice.expand?.cliente?.ragione_sociale ?? '—'}
            </dd>
          </div>
          <div class="flex justify-between sm:block">
            <dt class="text-sm text-[#6B7280]">Imponibile</dt>
            <dd class="text-sm font-medium text-[#1A1A1A]">
              {formatEuro(invoice.totale_imponibile ?? 0)}
            </dd>
          </div>
          <div class="flex justify-between sm:block">
            <dt class="text-sm text-[#6B7280]">IVA</dt>
            <dd class="text-sm font-medium text-[#1A1A1A]">{formatEuro(invoice.iva ?? 0)}</dd>
          </div>
          <div class="flex justify-between sm:block">
            <dt class="text-sm text-[#6B7280]">Totale</dt>
            <dd class="text-lg font-bold text-[#1A1A1A]">{formatEuro(invoice.totale ?? 0)}</dd>
          </div>
        </dl>
      </Card>

      <!-- Azioni -->
      <Card>
        <div class="flex flex-col gap-3">
          <Button
            variant="secondary"
            className="rounded-2xl w-full !bg-[#F5D547] !text-[#1A1A1A]"
            onclick={downloadPdf}
          >
            <FileDown class="h-4 w-4" />
            Scarica PDF
          </Button>
          {#if invoice.stato === 'emessa'}
            <Button
              variant="primary"
              className="rounded-2xl w-full !bg-[#1A1A1A]"
              onclick={() => {
                dataPagamento = today;
                pagamentoModalOpen = true;
              }}
            >
              <CheckCircle class="h-4 w-4" />
              Segna come Pagata
            </Button>
          {/if}
        </div>
      </Card>
    </div>

    <!-- Ordine collegato -->
    {#if invoice.expand?.ordine}
      <Card>
        <h2 class="text-sm font-medium text-[#1A1A1A] mb-4">Ordine collegato</h2>
        <div class="flex flex-wrap gap-4 mb-4">
          <div>
            <span class="text-xs text-[#6B7280]">N. Ordine</span>
            <p class="font-medium text-[#1A1A1A]">
              {invoice.expand.ordine.numero_ordine ?? '—'}
            </p>
          </div>
          <div>
            <span class="text-xs text-[#6B7280]">Data ordine</span>
            <p class="font-medium text-[#1A1A1A]">
              {formatDate(invoice.expand.ordine.data_ordine)}
            </p>
          </div>
          <div>
            <span class="text-xs text-[#6B7280]">Totale</span>
            <p class="font-bold text-[#1A1A1A]">
              {formatEuro(invoice.expand.ordine.totale ?? 0)}
            </p>
          </div>
        </div>
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
              {#each orderItems as item}
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
      </Card>
    {:else}
      <Card>
        <h2 class="text-sm font-medium text-[#1A1A1A] mb-4">Righe fattura</h2>
        <p class="text-sm text-[#6B7280]">Nessun ordine collegato. La fattura mostra il totale complessivo.</p>
      </Card>
    {/if}
  {/if}
</div>

<!-- Modal Segna Pagata -->
<Modal
  open={pagamentoModalOpen}
  title="Segna come Pagata"
  size="sm"
  on:close={() => (pagamentoModalOpen = false)}
>
  <form onsubmit={(e) => { e.preventDefault(); segnaPagata(); }} class="space-y-5">
    <div>
      <label for="data_pagamento" class="block text-sm font-medium text-[#1A1A1A] mb-2">
        Data pagamento
      </label>
      <input
        id="data_pagamento"
        type="date"
        bind:value={dataPagamento}
        required
        class="w-full rounded-2xl border border-black/5 bg-white/80 px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#F5D547]"
      />
    </div>
    <div class="flex justify-end gap-3">
      <Button type="button" variant="ghost" onclick={() => (pagamentoModalOpen = false)}>
        Annulla
      </Button>
      <Button type="submit" variant="primary" disabled={saving || !dataPagamento}>
        {saving ? 'Salvataggio...' : 'Conferma'}
      </Button>
    </div>
  </form>
</Modal>
