import type PocketBase from 'pocketbase';
import { nextLottoInterno } from '$lib/utils/lots';

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
    /** Ordine di origine (usato dai ripristini: permette di calcolare il netto scarichi - carichi) */
    ordineRif?: string;
    /** Lotto interno (L001…). Se omesso sul carico, viene assegnato il prossimo. Non sui ripristini ordine. */
    lottoInterno?: string;
    /** Lotto/numero dogana (tracciabilità). Opzionale. */
    lottoDogana?: string;
    /** Non assegnare un nuovo L00N (ripristino giacenza da annullo). */
    skipNuovoLotto?: boolean;
  }
): Promise<{ movementId: string; inventoryId: string; giacenza: number }> {
  const { prodottoId, quantita, causale, utenteId, expenseId, ordineRif, lottoDogana, skipNuovoLotto } = opts;
  if (!prodottoId || quantita <= 0) throw new Error('Prodotto e quantità obbligatori');

  const payload: Record<string, unknown> = {
    prodotto: prodottoId,
    tipo: 'carico',
    quantita: Math.abs(Math.floor(quantita)),
    causale: causale?.trim() || undefined,
    utente: utenteId
  };
  if (expenseId) payload.expense_id = expenseId;
  if (ordineRif) payload.ordine_rif = ordineRif;

  let lottoInterno = opts.lottoInterno?.trim() || '';
  if (!skipNuovoLotto && !lottoInterno) {
    lottoInterno = await nextLottoInterno(pb);
  }
  if (lottoInterno) payload.lotto_interno = lottoInterno;
  if (lottoDogana?.trim()) payload.lotto_dogana = lottoDogana.trim();

  let mov;
  try {
    mov = await pb.collection('inventory_movements').create(payload);
  } catch (e) {
    // Campo opzionale assente in schema: riprova senza
    delete payload.expense_id;
    delete payload.ordine_rif;
    delete payload.lotto_interno;
    delete payload.lotto_dogana;
    mov = await pb.collection('inventory_movements').create(payload);
  }

  const invList = await pb.collection('inventory').getFullList({
    filter: `prodotto = "${prodottoId}"`
  });
  const delta = Math.abs(Math.floor(quantita));
  let inv = invList[0] as { id: string; giacenza?: number } | undefined;
  let giacenza: number;

  if (inv) {
    // Modificatore PocketBase (`giacenza+`): il valore viene letto e scritto dal SERVER nella stessa richiesta
    // (finestra di ms, invece dell'andata/ritorno del client) e restituisce la giacenza aggiornata.
    // ATTENZIONE: non è un lock: due richieste esattamente simultanee possono ancora perdere un aggiornamento
    // (verificato con scripts/test-pocketbase-permissions.mjs). La soluzione completa richiede un hook server.
    const patch: Record<string, unknown> = { 'giacenza+': delta };
    if (lottoInterno) patch.lotto = lottoInterno;
    if (lottoDogana?.trim()) patch.lotto_dogana = lottoDogana.trim();
    const updated = await pb.collection('inventory').update(inv.id, patch);
    giacenza = Number((updated as { giacenza?: number }).giacenza ?? (inv.giacenza ?? 0) + delta);
  } else {
    giacenza = delta;
    inv = await pb.collection('inventory').create({
      prodotto: prodottoId,
      giacenza: delta,
      giacenza_minima: 0,
      ...(lottoInterno ? { lotto: lottoInterno } : {}),
      ...(lottoDogana?.trim() ? { lotto_dogana: lottoDogana.trim() } : {})
    });
  }

  return {
    movementId: (mov as { id: string }).id,
    inventoryId: inv!.id,
    giacenza
  };
}

/**
 * Scarico magazzino: movimento + aggiornamento giacenza (stessa logica della pagina Magazzino).
 */
export async function eseguiScaricoMagazzino(
  pb: PocketBase,
  opts: {
    prodottoId: string;
    quantita: number;
    causale?: string;
    utenteId?: string;
    ordineRif?: string;
  }
): Promise<{ movementId: string; inventoryId: string; giacenza: number }> {
  const { prodottoId, quantita, causale, utenteId, ordineRif } = opts;
  if (!prodottoId || quantita <= 0) throw new Error('Prodotto e quantità obbligatori');

  const qty = Math.abs(Math.floor(quantita));
  const payload: Record<string, unknown> = {
    prodotto: prodottoId,
    tipo: 'scarico',
    quantita: qty,
    causale: causale?.trim() || undefined,
    utente: utenteId
  };
  if (ordineRif) payload.ordine_rif = ordineRif;

  let mov;
  try {
    mov = await pb.collection('inventory_movements').create(payload);
  } catch (e) {
    if (ordineRif) {
      delete payload.ordine_rif;
      mov = await pb.collection('inventory_movements').create(payload);
    } else {
      throw e;
    }
  }

  const invList = await pb.collection('inventory').getFullList({
    filter: `prodotto = "${prodottoId}"`
  });
  let inv = invList[0] as { id: string; giacenza?: number } | undefined;
  let giacenza: number;

  if (inv) {
    // Decremento lato server (`giacenza-`, vedi nota sopra) e SENZA azzerare a 0: la giacenza deve restare
    // coerente con la somma dei movimenti.
    // Prima `Math.max(0, …)` faceva sparire l'eccedenza (giacenza 5, ordine 10 → 0) e al ripristino
    // (+10) si creava stock fantasma. Se si vende oltre la giacenza, il valore va negativo (visibile).
    const updated = await pb.collection('inventory').update(inv.id, { 'giacenza-': qty });
    giacenza = Number((updated as { giacenza?: number }).giacenza ?? (inv.giacenza ?? 0) - qty);
  } else {
    giacenza = -qty;
    inv = await pb.collection('inventory').create({
      prodotto: prodottoId,
      giacenza,
      giacenza_minima: 0
    });
  }

  return {
    movementId: (mov as { id: string }).id,
    inventoryId: inv!.id,
    giacenza
  };
}

/**
 * Dopo annullamento / eliminazione ordine già confermato: reintegra giacenza per ogni scarico legato all'ordine.
 */
export async function ripristinaGiacenzaDaOrdine(
  pb: PocketBase,
  orderId: string,
  opts?: { utenteId?: string; causalePrefix?: string }
): Promise<void> {
  if (!orderId) return;
  let movs: { prodotto?: string; quantita?: number; tipo?: string }[] = [];
  try {
    movs = await pb.collection('inventory_movements').getFullList({
      filter: `ordine_rif = "${orderId}"`
    });
  } catch {
    return;
  }
  // Netto per prodotto = scarichi - carichi già ripristinati per lo stesso ordine (idempotente).
  const net = new Map<string, number>();
  for (const m of movs) {
    if (!m.prodotto) continue;
    const q = Number(m.quantita) || 0;
    if (m.tipo === 'scarico') net.set(m.prodotto, (net.get(m.prodotto) ?? 0) + q);
    else if (m.tipo === 'carico') net.set(m.prodotto, (net.get(m.prodotto) ?? 0) - q);
  }
  const prefix = opts?.causalePrefix ?? 'Ripristino giacenza (ordine annullato/eliminato)';
  for (const [pid, q] of net) {
    if (q <= 0) continue;
    await eseguiCaricoMagazzino(pb, {
      prodottoId: pid,
      quantita: q,
      causale: `${prefix} · ordine ${orderId}`,
      utenteId: opts?.utenteId,
      ordineRif: orderId,
      skipNuovoLotto: true
    });
  }
}
