import type PocketBase from 'pocketbase';

/**
 * Scrive una riga di audit in `activity_log` (utente = chi agisce; la regola API impedisce di falsificarlo).
 * Non blocca mai il flusso chiamante: se il log fallisce, l'operazione principale resta valida.
 *
 * `prima`/`dopo` servono per le modifiche a dati economici sensibili (percentuali, prezzi, assegnazioni).
 */
export async function logAudit(
  pb: PocketBase,
  entry: {
    azione: string;
    collection: string;
    recordId?: string;
    messaggio: string;
    prima?: unknown;
    dopo?: unknown;
  }
): Promise<void> {
  const utente = pb.authStore.model?.id;
  if (!utente) return;
  try {
    await pb.collection('activity_log').create({
      utente,
      azione: entry.azione,
      collection_rif: entry.collection,
      record_rif: entry.recordId ?? '',
      dettagli: JSON.stringify({
        messaggio: entry.messaggio,
        ...(entry.prima !== undefined ? { prima: entry.prima } : {}),
        ...(entry.dopo !== undefined ? { dopo: entry.dopo } : {})
      })
    });
  } catch {
    /* il log non blocca il flusso */
  }
}
