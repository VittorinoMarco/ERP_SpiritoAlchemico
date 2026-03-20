import type PocketBase from 'pocketbase';
import type { ExpenseOrigine } from '$lib/types/expense';
import { eseguiCaricoMagazzino } from '$lib/utils/inventoryCarico';

/**
 * Crea movimenti di carico + una sola uscita (imponibile + IVA) per evitare doppia contabilità.
 */
export async function registraAcquistoFornitoreConUscita(
  pb: PocketBase,
  params: {
    dataSpesa: string;
    imponibile: number;
    ivaImporto: number;
    origine: ExpenseOrigine;
    numeroDocumento?: string;
    descrizione: string;
    note?: string;
    allegato?: File | null;
    linee: { prodottoId: string; quantita: number }[];
  }
): Promise<{ expenseId: string; movementIds: string[] }> {
  const uid = (pb.authStore.model as { id?: string } | null)?.id;
  const movementIds: string[] = [];

  for (const line of params.linee) {
    if (!line.prodottoId || line.quantita <= 0) continue;
    const { movementId } = await eseguiCaricoMagazzino(pb, {
      prodottoId: line.prodottoId,
      quantita: line.quantita,
      causale: `Acquisto fornitore${params.numeroDocumento ? ` ${params.numeroDocumento}` : ''}`,
      utenteId: uid
    });
    movementIds.push(movementId);
  }

  if (movementIds.length === 0) {
    throw new Error('Nessuna riga valida con prodotto e quantità');
  }

  const fd = new FormData();
  fd.append('tipo', 'immediata');
  fd.append('data_spesa', params.dataSpesa);
  fd.append('importo', String(Math.round(params.imponibile * 100) / 100));
  fd.append('iva_importo', String(Math.round(params.ivaImporto * 100) / 100));
  fd.append('origine', params.origine);
  fd.append('completata', 'true');
  fd.append('categoria', 'Magazzino / Fornitore');
  fd.append('descrizione', params.descrizione.slice(0, 500));
  if (params.note) fd.append('note', params.note.slice(0, 2000));
  if (params.numeroDocumento) fd.append('numero_documento', params.numeroDocumento);
  fd.append('movimenti_collegati', JSON.stringify(movementIds));
  if (uid) fd.append('creato_da', uid);
  if (params.allegato) fd.append('allegato', params.allegato);

  let expense: { id: string };
  try {
    expense = (await pb.collection('expenses').create(fd)) as { id: string };
  } catch {
    const fd2 = new FormData();
    fd2.append('tipo', 'immediata');
    fd2.append('data_spesa', params.dataSpesa);
    fd2.append('importo', String(Math.round(params.imponibile * 100) / 100));
    fd2.append('completata', 'true');
    fd2.append(
      'descrizione',
      `${params.descrizione.slice(0, 300)} · IVA €${params.ivaImporto.toFixed(2)} · mov:${movementIds.join(',')}`
    );
    if (uid) fd2.append('creato_da', uid);
    if (params.allegato) fd2.append('allegato', params.allegato);
    expense = (await pb.collection('expenses').create(fd2)) as { id: string };
  }

  const expenseId = expense.id;

  for (const mid of movementIds) {
    try {
      await pb.collection('inventory_movements').update(mid, { expense_id: expenseId });
    } catch {
      /* campo expense_id assente in inventory_movements */
    }
  }

  return { expenseId, movementIds };
}
