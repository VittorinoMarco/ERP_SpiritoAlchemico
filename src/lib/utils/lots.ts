import type PocketBase from 'pocketbase';

/** Lotto interno progressivo: L001, L002, … (uso magazzino). Il lotto dogana è un campo a parte. */
export function formatLottoInterno(n: number): string {
  const pad = n < 1000 ? 3 : String(n).length;
  return `L${String(n).padStart(pad, '0')}`;
}

export function parseLottoInterno(raw: string | null | undefined): number | null {
  const m = String(raw ?? '')
    .trim()
    .match(/^L(\d+)$/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function nextLottoInterno(pb: PocketBase): Promise<string> {
  let max = 0;
  try {
    const rows = await pb.collection('inventory_movements').getFullList({
      fields: 'lotto_interno',
      filter: 'lotto_interno != ""'
    });
    for (const r of rows as { lotto_interno?: string }[]) {
      const n = parseLottoInterno(r.lotto_interno);
      if (n != null && n > max) max = n;
    }
  } catch {
    /* campo assente: si parte da L001 */
  }
  return formatLottoInterno(max + 1);
}
