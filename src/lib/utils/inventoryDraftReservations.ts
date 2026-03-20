import type PocketBase from 'pocketbase';

function itemProdottoId(it: Record<string, unknown>): string | null {
  const p = it.prodotto ?? it.product;
  if (!p || p === '0') return null;
  return String(p);
}

/** Quantità impegnate in ordini in bozza (non scaricate da giacenza reale). */
export async function getQtyReservedByDraftOrders(pb: PocketBase): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  let drafts: { id: string }[] = [];
  try {
    drafts = await pb.collection('orders').getFullList({
      filter: 'stato = "bozza"',
      fields: 'id'
    });
  } catch {
    return map;
  }
  if (drafts.length === 0) return map;

  const chunk = 40;
  for (let i = 0; i < drafts.length; i += chunk) {
    const slice = drafts.slice(i, i + chunk);
    const filter = slice.map((o) => `ordine = "${o.id}"`).join(' || ');
    try {
      const items = await pb.collection('order_items').getFullList({ filter });
      for (const raw of items) {
        const it = raw as unknown as Record<string, unknown>;
        const pid = itemProdottoId(it);
        if (!pid) continue;
        const q = Number(it.quantita) || 0;
        if (q <= 0) continue;
        map.set(pid, (map.get(pid) ?? 0) + q);
      }
    } catch {
      // ignore chunk errors
    }
  }
  return map;
}
