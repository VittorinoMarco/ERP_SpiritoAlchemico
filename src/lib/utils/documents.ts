import type PocketBase from 'pocketbase';

/** PRF-2026-0001 / FAT-2026-0001. Unicità su invoices.numero_fattura. */
export async function nextDocumentNumber(pb: PocketBase, kind: 'PRF' | 'FAT'): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `${kind}-${year}-`;
  try {
    const r = await pb.collection('invoices').getList(1, 1, {
      filter: `numero_fattura ~ "${prefix}"`,
      sort: '-numero_fattura'
    });
    const last = (r.items[0] as { numero_fattura?: string } | undefined)?.numero_fattura;
    const n = last ? parseInt(last.slice(prefix.length), 10) : 0;
    return `${prefix}${String((Number.isFinite(n) ? n : 0) + 1).padStart(4, '0')}`;
  } catch {
    return `${prefix}0001`;
  }
}

export function isProforma(inv: { tipo?: string | null } | null | undefined): boolean {
  return inv?.tipo === 'proforma';
}

export function isFatturaGestionale(inv: { tipo?: string | null } | null | undefined): boolean {
  return !inv || !inv.tipo || inv.tipo === 'fattura';
}
