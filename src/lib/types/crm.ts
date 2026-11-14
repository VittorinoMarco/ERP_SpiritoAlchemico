import type { RecordModel } from 'pocketbase';
import type { CrmRecord } from '$lib/utils/crm';

export type {
  CrmTipo,
  CrmStato,
  CrmFonte,
  CrmRecord,
  CrmFormInput,
  CrmActor,
  CambiaStatoResult
} from '$lib/utils/crm';

export {
  TIPI,
  STATI,
  FONTI,
  TIPO_LABELS,
  TIPO_BADGE_COLORS,
  STATO_LABELS,
  STATO_BADGE_COLORS,
  FONTE_LABELS,
  ORG_TIPI,
  PERSON_TIPI
} from '$lib/utils/crm';

export interface CrmContatto extends RecordModel, CrmRecord {
  expand?: {
    agente?: { id: string; nome?: string; cognome?: string; email?: string; name?: string };
    cliente?: { id: string; ragione_sociale?: string };
    organizzazioni?: Array<{ id: string; nome?: string; ragione_sociale?: string; tipo?: string }>;
  };
}
