import type PocketBase from 'pocketbase';

/**
 * Esegue un carico magazzino: movimento + aggiornamento giacenza (stessa logica della pagina Magazzino).
 */
export async function eseguiCaricoMagazzino(
  pb: PocketBase,
  opts: {
    prodottoId: string;
    quantita: number;
    causale?: string;
    utenteId?: string;
    /** Collegamento contabile uscite (opzionale, richiede campo su PB) */
    expenseId?: string;
  }
): Promise<{ movementId: string; inventoryId: string; giacenza: number }> {
  const { prodottoId, quantita, causale, utenteId, expenseId } = opts;
  if (!prodottoId || quantita <= 0) throw new Error('Prodotto e quantità obbligatori');

  const payload: Record<string, unknown> = {
    prodotto: prodottoId,
    tipo: 'carico',
    quantita: Math.abs(Math.floor(quantita)),
    causale: causale?.trim() || undefined,
    utente: utenteId
  };
  if (expenseId) payload.expense_id = expenseId;

  let mov;
  try {
    mov = await pb.collection('inventory_movements').create(payload);
  } catch (e) {
    // Campo expense_id assente in schema: riprova senza
    if (expenseId) {
      delete payload.expense_id;
      mov = await pb.collection('inventory_movements').create(payload);
    } else {
      throw e;
    }
  }

  const invList = await pb.collection('inventory').getFullList({
    filter: `prodotto = "${prodottoId}"`
  });
  const delta = Math.abs(Math.floor(quantita));
  let inv = invList[0] as { id: string; giacenza?: number } | undefined;
  let giacenza: number;

  if (inv) {
    giacenza = Math.max(0, (inv.giacenza ?? 0) + delta);
    await pb.collection('inventory').update(inv.id, { giacenza });
  } else {
    giacenza = delta;
    inv = await pb.collection('inventory').create({
      prodotto: prodottoId,
      giacenza: delta,
      giacenza_minima: 0
    });
  }

  return {
    movementId: (mov as { id: string }).id,
    inventoryId: inv!.id,
    giacenza
  };
}
