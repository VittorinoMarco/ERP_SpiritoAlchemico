import type { RecordModel } from 'pocketbase';

export type AdminTaskStato =
  | 'backlog'
  | 'da_fare'
  | 'in_corso'
  | 'in_revisione'
  | 'completato'
  | 'annullato';

export type AdminTaskPriorita = 'bassa' | 'media' | 'alta' | 'critica';

export interface AdminTask extends RecordModel {
  titolo: string;
  descrizione?: string;
  stato: AdminTaskStato;
  priorita: AdminTaskPriorita;
  assegnatario?: string;
  creato_da?: string;
  scadenza?: string;
  inizio?: string;
  etichette?: string[];
  ordine_colonna?: number;
  parent?: string;
  expand?: {
    assegnatario?: { id: string; name?: string; email?: string };
    creato_da?: { id: string; name?: string; email?: string };
    parent?: AdminTask;
  };
}

export interface TaskAttachment extends RecordModel {
  task: string;
  file: string;
  caricato_da?: string;
  expand?: {
    caricato_da?: { id: string; name?: string; email?: string };
  };
}
