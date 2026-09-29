import type PocketBase from 'pocketbase';
import { roundMoney } from '$lib/utils/orders';
import { ymdLocal } from '$lib/utils/format';

/**
 * Formula unica delle provvigioni.
 *
 *   importo = arrotonda_2( imponibile × percentuale / 100 )
 *
 * Trigger: fattura (non proforma) → `pagata`.
 *
 * Piramide (decisione soci 2026-09-29): la quota del collaboratore sotto
 * è CONTENUTA nella % dell'agente padre, non aggiuntiva.
 * Esempio: padre 10%, sub 4% sull'imponibile → padre 6% + sub 4% = 10%.
 * Se la % del sub supera quella del padre, viene tagliata al tetto del padre.
 * Un solo livello (agente sopra). Livelli successivi da definire.
 */
export function imponibileProvvigione(order: {
  totale_imponibile?: number | string | null;
  totale?: number | string | null;
  iva_percentuale?: number | string | null;
}): number {
  const raw = order.totale_imponibile;
  if (raw != null && raw !== '' && Number.isFinite(Number(raw)) && Number(raw) >= 0) {
    return roundMoney(Number(raw));
  }
  const pct = Number(order.iva_percentuale ?? 22);
  const tot = Number(order.totale) || 0;
  if (pct <= 0) return roundMoney(tot);
  return roundMoney(tot / (1 + pct / 100));
}

export function importoProvvigione(imponibile: number, percentuale: number): number {
  if (imponibile <= 0 || percentuale <= 0) return 0;
  return roundMoney((imponibile * percentuale) / 100);
}

/** Split contenuto: child non può superare parent. */
export function splitPyramid(parentPct: number, childPct: number): { parent: number; child: number } {
  const p = Math.max(0, Number(parentPct) || 0);
  const c = Math.max(0, Math.min(Number(childPct) || 0, p));
  return { parent: roundMoney(p - c), child: roundMoney(c) };
}

function relationId(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && v && 'id' in v) return String((v as { id: string }).id);
  return null;
}

type OrderMoney = {
  totale_imponibile?: number | string | null;
  totale?: number | string | null;
  iva_percentuale?: number | string | null;
};

/**
 * Crea la riga se manca. Idempotente su (ordine, agente).
 * `percentuale` esplicita congela lo split piramide; altrimenti legge users.
 */
export async function ensureCommissionForOrder(
  pb: PocketBase,
  opts: {
    orderId: string;
    agenteId: string;
    order: OrderMoney;
    percentuale?: number;
  }
): Promise<{ created: boolean; importo: number; percentuale: number } | null> {
  const existing = await pb.collection('agent_commissions').getList(1, 1, {
    filter: `ordine = "${opts.orderId}" && agente = "${opts.agenteId}"`
  });
  if (existing.totalItems > 0) {
    const row = existing.items[0] as { importo?: number; percentuale?: number };
    return {
      created: false,
      importo: Number(row.importo) || 0,
      percentuale: Number(row.percentuale) || 0
    };
  }
  let percentuale = opts.percentuale;
  if (percentuale == null) {
    const agente = await pb.collection('users').getOne(opts.agenteId);
    percentuale = Number((agente as { provvigione_percentuale?: number }).provvigione_percentuale) || 0;
  }
  const imponibile = imponibileProvvigione(opts.order);
  const importo = importoProvvigione(imponibile, percentuale);
  if (importo <= 0) return null;
  await pb.collection('agent_commissions').create({
    agente: opts.agenteId,
    ordine: opts.orderId,
    totale_ordine: imponibile,
    percentuale,
    importo,
    stato: 'maturata',
    data_maturata: ymdLocal(new Date())
  });
  return { created: true, importo, percentuale };
}

function agenteIdFromOrder(order: { agente?: unknown }): string | null {
  return relationId(order.agente);
}

export type CommissionEnsureResult = {
  created: boolean;
  importo: number;
  percentuale: number;
  agenteId: string;
};

/** Chiamata quando una FATTURA (non proforma) passa a pagata. */
export async function ensureCommissionOnInvoicePaid(
  pb: PocketBase,
  invoice: { stato?: string; ordine?: string; tipo?: string | null }
): Promise<CommissionEnsureResult[] | null> {
  if (invoice.stato !== 'pagata' || !invoice.ordine) return null;
  if (invoice.tipo === 'proforma') return null;
  const order = await pb.collection('orders').getOne(invoice.ordine);
  const takerId = agenteIdFromOrder(order as { agente?: unknown });
  if (!takerId) return null;
  const money = order as OrderMoney;
  const taker = await pb.collection('users').getOne(takerId);
  const padreId = relationId((taker as { agente_padre?: unknown }).agente_padre);
  const out: CommissionEnsureResult[] = [];

  if (padreId && padreId !== takerId) {
    const padre = await pb.collection('users').getOne(padreId);
    const parentPct = Number((padre as { provvigione_percentuale?: number }).provvigione_percentuale) || 0;
    const childPct = Number((taker as { provvigione_percentuale?: number }).provvigione_percentuale) || 0;
    const split = splitPyramid(parentPct, childPct);
    const child = await ensureCommissionForOrder(pb, {
      orderId: invoice.ordine,
      agenteId: takerId,
      order: money,
      percentuale: split.child
    });
    const parent = await ensureCommissionForOrder(pb, {
      orderId: invoice.ordine,
      agenteId: padreId,
      order: money,
      percentuale: split.parent
    });
    if (child) out.push({ ...child, agenteId: takerId });
    if (parent) out.push({ ...parent, agenteId: padreId });
    return out.length ? out : null;
  }

  const one = await ensureCommissionForOrder(pb, {
    orderId: invoice.ordine,
    agenteId: takerId,
    order: money
  });
  return one ? [{ ...one, agenteId: takerId }] : null;
}
