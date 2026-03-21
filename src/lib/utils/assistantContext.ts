import type PocketBase from 'pocketbase';
import { CATEGORY_LABELS, type Product, type ProductCategory } from '$lib/types/product';
import type { Inventory } from '$lib/types/inventory';
import type { Client } from '$lib/types/client';
import { SOGLIA_SOTTO_SCORTA, isSottoScortaGiacenza } from '$lib/constants/inventory';

const MAX_INVENTORY_DETAIL_ROWS = 300;

function eur(n: number | null | undefined): string {
  return (Number(n) || 0).toFixed(2);
}

/** Evita di rompere le tabelle Markdown (| e newline). */
function mdCell(s: string): string {
  return String(s ?? '')
    .replace(/\|/g, '·')
    .replace(/\r?\n/g, ' ')
    .trim();
}

/**
 * Raccoglie un riepilogo ricco dall’ERP (PocketBase) per l’assistente AI:
 * prodotti con prezzi per canale, magazzino riga per riga con quantità, clienti per tipo, ordini/fatture.
 */
export async function buildAssistantDataSnapshot(pb: PocketBase): Promise<string> {
  const ts = new Date().toLocaleString('it-IT', {
    timeZone: 'Europe/Rome',
    dateStyle: 'short',
    timeStyle: 'medium'
  });
  const lines: string[] = [
    `[Dati ERP — lettura al ${ts} (ora Italia)]`,
    'Usa SOLO le informazioni qui sotto per numeri, prezzi, quantità e confronti tra canali (listino / HORECA / e-commerce / diretto).',
    'Se manca un dettaglio non presente qui, dillo chiaramente e indica la pagina dell’app (Prodotti, Magazzino, Ordini, …).'
  ];

  const push = async (label: string, fn: () => Promise<string>) => {
    try {
      lines.push(await fn());
    } catch {
      lines.push(`### ${label}\n(lettura non disponibile — permessi o rete)`);
    }
  };

  await push('Prodotti', async () => {
    const active = await pb.collection('products').getFullList<Product>({
      filter: 'attivo = true',
      sort: 'nome'
    });
    const inactiveMeta = await pb.collection('products').getList(1, 1, { filter: 'attivo = false' });
    const rows = active.map((p) => {
      const cat = CATEGORY_LABELS[p.categoria as ProductCategory] ?? p.categoria;
      return (
        `| ${mdCell(p.nome)} | ${mdCell(p.sku)} | ${mdCell(cat)} | €${eur(p.prezzo_listino)} | €${eur(p.prezzo_horeca)} | €${eur(p.prezzo_ecommerce)} |`
      );
    });
    const table =
      rows.length > 0
        ? [
            '| Prodotto | SKU | Cat. | Listino (diretto/ref.) | HORECA | E-commerce |',
            '| --- | --- | --- | --- | --- | --- |',
            ...rows
          ].join('\n')
        : '_Nessun prodotto attivo._';
    return [
      '### Prodotti (anagrafica attiva)',
      `- **Attivi:** ${active.length} · **Inattivi in DB:** ${inactiveMeta.totalItems}`,
      '_Per simulare fatturato: usa **listino** come vendita diretta/ref., **HORECA** e **e-commerce** come prezzi per quei canali (come in “Nuovo ordine”)._',
      table
    ].join('\n');
  });

  await push('Clienti', async () => {
    const all = await pb.collection('clients').getFullList<Client>({ sort: 'ragione_sociale' });
    const byTipo: Record<string, number> = { horeca: 0, ecommerce: 0, distributore: 0, altro: 0 };
    for (const c of all) {
      const t = String(c.tipo ?? '');
      if (t in byTipo) byTipo[t] += 1;
      else byTipo.altro += 1;
    }
    const sample = all.slice(0, 45);
    const linesCli = sample.map((c) => {
      const city = c.citta ?? '';
      return `  · ${c.ragione_sociale} | tipo: ${c.tipo}${city ? ` | ${city}` : ''}`;
    });
    const more =
      all.length > sample.length
        ? `\n_(elenco nomi: prime ${sample.length} su ${all.length}; totale sopra è completo)_`
        : '';
    return [
      '### Clienti',
      `- **Totale anagrafica:** ${all.length}`,
      `- **Per tipo:** HORECA ${byTipo.horeca}, e-commerce ${byTipo.ecommerce}, distributore ${byTipo.distributore}${byTipo.altro ? `, altro/non mappato ${byTipo.altro}` : ''}`,
      linesCli.join('\n') || '  _(nessuno)_',
      more
    ].join('\n');
  });

  await push('Magazzino', async () => {
    const inv = await pb.collection('inventory').getFullList({ expand: 'prodotto' });
    type InvRow = Inventory & { expand?: { prodotto?: Product } };
    const list = inv as InvRow[];
    const truncated = list.length > MAX_INVENTORY_DETAIL_ROWS;
    const shown = truncated ? list.slice(0, MAX_INVENTORY_DETAIL_ROWS) : list;

    let sumPezzi = 0;
    let sumValoreListino = 0;
    const rows: string[] = [];
    let sottoTot = 0;
    for (const row of list) {
      const g0 = Number(row.giacenza) || 0;
      sumPezzi += g0;
      const p0 = row.expand?.prodotto;
      sumValoreListino += g0 * (Number(p0?.prezzo_listino) || 0);
      if (isSottoScortaGiacenza(g0)) sottoTot += 1;
    }

    for (const row of shown) {
      const p = row.expand?.prodotto;
      const nome = p?.nome ?? String(row.prodotto);
      const g = Number(row.giacenza) || 0;
      const listino = Number(p?.prezzo_listino) || 0;
      const ph = Number(p?.prezzo_horeca) || 0;
      const pe = Number(p?.prezzo_ecommerce) || 0;
      const min = row.giacenza_minima != null ? String(row.giacenza_minima) : '—';
      const ubi = row.ubicazione ? row.ubicazione : '—';
      const flag = isSottoScortaGiacenza(g) ? '⚠ sotto scorta' : 'ok';
      rows.push(
        `| ${mdCell(nome)} | **${g}** | ${min} | ${mdCell(ubi)} | €${eur(listino)} | €${eur(ph)} | €${eur(pe)} | €${eur(g * listino)} | ${flag} |`
      );
    }

    const table =
      rows.length > 0
        ? [
            '| Prodotto | Giacenza (pz) | Giac. min. | Ubicazione | Listino € | HORECA € | E-comm € | Valore a listino | Stato |',
            '| --- | ---: | --- | --- | ---: | ---: | ---: | ---: | --- |',
            ...rows
          ].join('\n')
        : '_Nessuna riga magazzino._';

    const truncNote = truncated
      ? `\n_Righe magazzino mostrate: **${shown.length}** su **${list.length}** (troncato per limite; apri Magazzino per elenco completo)._`
      : '';

    return [
      '### Magazzino (dettaglio per prodotto)',
      `- **Righe giacenza:** ${list.length} · **Pezzi totali in magazzino (somma giacenze):** ${sumPezzi}`,
      `- **Valore stimato a prezzo listino** (giacenza × listino): **€${eur(sumValoreListino)}**`,
      `- **Sotto scorta** (giacenza ≤ ${SOGLIA_SOTTO_SCORTA}): **${sottoTot}** righe (su tutto il magazzino)`,
      '_Per “quanto incasserei se vendessi tutto”: moltiplica ogni giacenza per il prezzo del canale scelto (listino vs HORECA vs e-commerce) usando la tabella._',
      table,
      truncNote
    ].join('\n');
  });

  await push('Ordini', async () => {
    const r = await pb.collection('orders').getList(1, 25, {
      sort: '-data_ordine',
      expand: 'cliente'
    });
    const rows = r.items.map((o: Record<string, unknown>) => {
      const exp = o.expand as { cliente?: { ragione_sociale?: string } } | undefined;
      const num = (o.numero_ordine as string) ?? String(o.id);
      const st = (o.stato as string) ?? '';
      const canale = (o.canale as string) ?? '';
      const tot = o.totale != null ? eur(o.totale as number) : '—';
      const d = (o.data_ordine as string) ?? '';
      const cli = exp?.cliente?.ragione_sociale ?? '';
      return `  · ${num} | ${st} | canale **${canale}** | €${tot} | ${d}${cli ? ` | ${cli}` : ''}`;
    });
    return [
      '### Ultimi ordini (max 25)',
      `- **Totale ordini in DB (stima):** ${r.totalItems}`,
      rows.join('\n') || '  _(nessuno)_'
    ].join('\n');
  });

  await push('Fatture', async () => {
    const r = await pb.collection('invoices').getList(1, 15, {
      sort: '-data_emissione',
      expand: 'cliente'
    });
    const rows = r.items.map((inv: Record<string, unknown>) => {
      const exp = inv.expand as { cliente?: { ragione_sociale?: string } } | undefined;
      const num = (inv.numero_fattura as string) ?? String(inv.id);
      const st = (inv.stato as string) ?? '';
      const tot = inv.totale as number | undefined;
      const c = exp?.cliente?.ragione_sociale ?? '';
      return `  · ${num} | ${st} | €${eur(tot)}${c ? ` | ${c}` : ''}`;
    });
    return ['### Ultime fatture (max 15)', rows.join('\n') || '  _(nessuna)_'].join('\n');
  });

  return lines.join('\n\n');
}
