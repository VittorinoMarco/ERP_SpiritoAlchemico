import type PocketBase from 'pocketbase';
import { ymdLocal } from '$lib/utils/format';

export type OrderLineInput = {
  prodotto: string;
  quantita: number;
  prezzo_unitario: number;
  sconto_percentuale: number;
  totale_riga: number;
};

/** Numero ordine leggibile e praticamente univoco: ORD-AAMMGG-XXXX (es. ORD-260929-K7Q2). */
export function newOrderNumber(prefix = 'ORD'): string {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  const rand = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
  return `${prefix}-${yy}${mm}${dd}-${rand}`;
}

export const roundMoney = (n: number): number => Math.round(n * 100) / 100;

export function lineTotal(qty: number, unit: number, discountPct: number): number {
  return roundMoney(qty * unit * (1 - (discountPct || 0) / 100));
}

/**
 * Crea ordine + righe come unità: se una riga fallisce, elimina righe e ordine già creati
 * (PocketBase non offre transazioni dal client), così non restano ordini "a metà".
 */
export async function createOrderWithItems(
  pb: PocketBase,
  order: Record<string, unknown>,
  lines: OrderLineInput[]
): Promise<{ id: string; numero_ordine: string }> {
  const created = await pb.collection('orders').create({
    data_ordine: ymdLocal(new Date()),
    ...order
  });
  const createdItems: string[] = [];
  try {
    for (const l of lines) {
      const it = await pb.collection('order_items').create({
        ordine: created.id,
        prodotto: l.prodotto,
        quantita: l.quantita,
        prezzo_unitario: l.prezzo_unitario,
        sconto_percentuale: l.sconto_percentuale,
        totale_riga: l.totale_riga
      });
      createdItems.push(it.id);
    }
  } catch (e) {
    await Promise.allSettled(createdItems.map((id) => pb.collection('order_items').delete(id)));
    await pb.collection('orders').delete(created.id).catch(() => {});
    throw e;
  }
  return { id: created.id, numero_ordine: created.numero_ordine as string };
}

export type StockShortage = {
  prodottoId: string;
  richiesti: number;
  disponibili: number;
};

/** Giacenza per prodotto (somma se ci fossero più record inventory per lo stesso prodotto). */
export async function getStockMap(pb: PocketBase, productIds: string[]): Promise<Map<string, number>> {
  const ids = [...new Set(productIds.filter(Boolean))];
  const map = new Map<string, number>();
  if (ids.length === 0) return map;
  const filter = ids.map((id) => `prodotto = "${id}"`).join(' || ');
  const inv = await pb.collection('inventory').getFullList({ filter });
  for (const r of inv as unknown as { prodotto: string; giacenza?: number }[]) {
    map.set(r.prodotto, (map.get(r.prodotto) ?? 0) + (Number(r.giacenza) || 0));
  }
  return map;
}

/** Confronta quantità richieste con la giacenza e ritorna i prodotti insufficienti. */
export async function findShortages(
  pb: PocketBase,
  lines: { prodotto: string; quantita: number }[]
): Promise<StockShortage[]> {
  const need = new Map<string, number>();
  for (const l of lines) need.set(l.prodotto, (need.get(l.prodotto) ?? 0) + (Number(l.quantita) || 0));
  const stock = await getStockMap(pb, [...need.keys()]);
  const out: StockShortage[] = [];
  for (const [prodottoId, richiesti] of need) {
    const disponibili = stock.get(prodottoId) ?? 0;
    if (richiesti > disponibili) out.push({ prodottoId, richiesti, disponibili });
  }
  return out;
}
