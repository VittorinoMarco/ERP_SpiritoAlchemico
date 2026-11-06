/** Fattura vera: escluse proforma e proforma già convertite. Un tipo vuoto è una fattura storica. */
export function isFatturaContabile(inv: { tipo?: string | null; stato?: string | null } | null | undefined): boolean {
  if (!inv || inv.stato === 'convertita' || inv.tipo === 'proforma') return false;
  return !inv.tipo || inv.tipo === 'fattura';
}

export function isVenditaAttiva(order: { stato?: string | null } | null | undefined): boolean {
  return !!order?.stato && order.stato !== 'bozza' && order.stato !== 'annullato';
}

/** Vendita confermata per cui non si emette fattura. */
export function isNonFatturato(order: { stato?: string | null; con_fattura?: boolean | null } | null | undefined): boolean {
  return isVenditaAttiva(order) && order?.con_fattura === false;
}

export function sumTotale(rows: { totale?: number | string | null }[]): number {
  return rows.reduce((sum, row) => sum + (Number(row.totale) || 0), 0);
}
