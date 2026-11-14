import type PocketBase from 'pocketbase';
import { ClientResponseError } from 'pocketbase';
import { logAudit } from '$lib/utils/audit';
import {
  cambiaStatoCrm,
  displayCrmName,
  normalizePiva,
  unknownFieldNames,
  type CambiaStatoResult,
  type CrmActor,
  type CrmRecord,
  type CrmStato
} from '$lib/utils/crm';

export const CRM_COLLECTION = 'crm_contatti';

export function isMissingCollection(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  if (status === 404) return true;
  const message = err instanceof Error ? err.message : String(err ?? '');
  return /wasn't found|not found|missing collection/i.test(message);
}

export function pbMessage(err: unknown, fallback = 'Errore salvataggio'): string {
  const data =
    err && typeof err === 'object'
      ? ((err as { response?: { data?: unknown }; data?: unknown }).response?.data ??
        (err as { data?: unknown }).data)
      : null;
  if (data && typeof data === 'object') {
    for (const value of Object.values(data as Record<string, unknown>)) {
      const message = (value as { message?: string } | null)?.message;
      if (typeof message === 'string' && message.trim()) {
        if (/unknown field/i.test(message)) {
          return 'Manca un campo nello schema. Esegui la sincronizzazione PocketBase (pb:sync).';
        }
        return message;
      }
    }
  }
  if (err instanceof Error && err.message && !/failed to (create|update) record/i.test(err.message)) {
    return err.message;
  }
  return fallback;
}

function gateway(pb: PocketBase) {
  return {
    async reload(id: string): Promise<CrmRecord> {
      return pb.collection(CRM_COLLECTION).getOne(id);
    },
    async save(id: string, patch: { stato: CrmStato; cliente?: string }): Promise<CrmRecord> {
      try {
        return await pb.collection(CRM_COLLECTION).update(id, patch);
      } catch (err) {
        if (!patch.cliente) throw err;
        return pb.collection(CRM_COLLECTION).update(id, patch);
      }
    },
    async findClient(id: string): Promise<{ id: string } | null> {
      try {
        const row = await pb.collection('clients').getOne(id);
        return { id: row.id };
      } catch (err) {
        if (err instanceof ClientResponseError && err.status === 404) return null;
        throw err;
      }
    },
    async findClientByPiva(piva: string): Promise<{ id: string } | null> {
      const normalized = normalizePiva(piva);
      if (!normalized) return null;
      try {
        const row = await pb.collection('clients').getFirstListItem(`partita_iva = "${normalized}"`);
        return { id: row.id };
      } catch (err) {
        if (err instanceof ClientResponseError && err.status === 404) return null;
        throw err;
      }
    },
    async createClient(data: Record<string, unknown>): Promise<{ id: string }> {
      try {
        const row = await pb.collection('clients').create(data);
        return { id: row.id };
      } catch (err) {
        const unknown = unknownFieldNames(err);
        if (!unknown.length) throw err;
        const retry = { ...data };
        let stripped = false;
        for (const key of unknown) {
          if (key in retry) {
            delete retry[key];
            stripped = true;
          }
        }
        if (!stripped) throw err;
        const row = await pb.collection('clients').create(retry);
        return { id: row.id };
      }
    }
  };
}

export async function cambiaStato(
  pb: PocketBase,
  record: CrmRecord,
  stato: CrmStato,
  actor: CrmActor
): Promise<CambiaStatoResult> {
  const result = await cambiaStatoCrm(gateway(pb), record, stato, actor);
  if (stato === 'acquisito') {
    const name = displayCrmName(result.record);
    const messaggio = result.created
      ? `Acquisito «${name}»: creato il cliente collegato`
      : result.linkedExisting
        ? `Acquisito «${name}»: cliente già collegato, nessun duplicato`
        : `Acquisito «${name}»: persona senza ragione sociale, cliente non creato`;
    await logAudit(pb, {
      azione: 'crm_acquisito',
      collection: CRM_COLLECTION,
      recordId: record.id,
      messaggio,
      dopo: { cliente: result.clienteId, created: result.created }
    });
  }
  return result;
}
