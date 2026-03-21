import type PocketBase from 'pocketbase';

/**
 * Raccoglie un riepilogo compatto dall’ERP (PocketBase) da allegare all’assistente AI
 * così le risposte usano numeri ed elenchi aggiornati al momento della richiesta.
 */
export async function buildAssistantDataSnapshot(pb: PocketBase): Promise<string> {
  const ts = new Date().toLocaleString('it-IT', {
    timeZone: 'Europe/Rome',
    dateStyle: 'short',
    timeStyle: 'medium'
  });
  const lines: string[] = [
    `[Dati ERP — lettura al ${ts} (ora Italia)]`,
    'Usa SOLO le informazioni qui sotto per numeri, conteggi e elenchi “attuali”. Se qui non c’è un dettaglio, indica che non è nel riepilogo e suggerisci la pagina dell’app.'
  ];

  const push = async (label: string, fn: () => Promise<string>) => {
    try {
      lines.push(await fn());
    } catch {
      lines.push(`${label}: (lettura non disponibile — permessi o rete)`);
    }
  };

  await push('Prodotti', async () => {
    const r = await pb.collection('products').getList(1, 1, { filter: 'attivo = true' });
    return `Prodotti attivi in anagrafica: **${r.totalItems}**`;
  });

  await push('Clienti', async () => {
    const r = await pb.collection('clients').getList(1, 1, {});
    return `Clienti in anagrafica: **${r.totalItems}**`;
  });

  await push('Ordini', async () => {
    const r = await pb.collection('orders').getList(1, 20, {
      sort: '-data_ordine',
      expand: 'cliente'
    });
    const rows = r.items.map((o: Record<string, unknown>) => {
      const exp = o.expand as { cliente?: { ragione_sociale?: string } } | undefined;
      const num = (o.numero_ordine as string) ?? String(o.id);
      const st = (o.stato as string) ?? '';
      const d = (o.data_ordine as string) ?? '';
      const cli = exp?.cliente?.ragione_sociale ?? '';
      return `  · ${num} | ${st} | ${d}${cli ? ` | ${cli}` : ''}`;
    });
    return `Ultimi ordini (max 20, totale stimato in DB **${r.totalItems}**):\n${rows.join('\n') || '  (nessuno)'}`;
  });

  await push('Magazzino', async () => {
    const r = await pb.collection('inventory').getList(1, 400, { expand: 'prodotto' });
    const items = r.items as { giacenza?: number; expand?: { prodotto?: { nome?: string } }; prodotto?: string }[];
    const low = items.filter((i) => (i.giacenza ?? 0) <= 6);
    const names = low
      .slice(0, 15)
      .map((i) => i.expand?.prodotto?.nome ?? i.prodotto)
      .filter(Boolean)
      .join(', ');
    const note = r.totalItems > items.length ? ` (campione su ${items.length} righe)` : '';
    return `Righe giacenza${note}: **${r.totalItems}**. Sotto scorta (giacenza≤6): **${low.length}**${names ? `. Esempi: ${names}` : ''}`;
  });

  await push('Fatture', async () => {
    const r = await pb.collection('invoices').getList(1, 12, {
      sort: '-data_emissione',
      expand: 'cliente'
    });
    const rows = r.items.map((inv: Record<string, unknown>) => {
      const exp = inv.expand as { cliente?: { ragione_sociale?: string } } | undefined;
      const num = (inv.numero_fattura as string) ?? String(inv.id);
      const st = (inv.stato as string) ?? '';
      const tot = inv.totale as number | undefined;
      const c = exp?.cliente?.ragione_sociale ?? '';
      return `  · ${num} | ${st} | €${tot ?? '—'}${c ? ` | ${c}` : ''}`;
    });
    return `Ultime fatture (max 12):\n${rows.join('\n') || '  (nessuna)'}`;
  });

  return lines.join('\n');
}
