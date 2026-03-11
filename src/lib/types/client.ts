import type { RecordModel } from 'pocketbase';

export type ClientTipo = 'horeca' | 'ecommerce' | 'distributore';

export interface Client extends RecordModel {
  ragione_sociale: string;
  tipo: ClientTipo;
  partita_iva?: string;
  codice_sdi?: string;
  pec?: string;
  indirizzo?: string;
  citta?: string;
  provincia?: string;
  cap?: string;
  telefono?: string;
  email?: string;
  agente?: string;
  note?: string;
  coordinate?: unknown;
}

export const TIPO_LABELS: Record<ClientTipo, string> = {
  horeca: 'HORECA',
  ecommerce: 'E-commerce',
  distributore: 'Distributore'
};

export const TIPO_BADGE_COLORS: Record<ClientTipo, string> = {
  horeca: 'bg-amber-100 text-amber-800',
  ecommerce: 'bg-sky-100 text-sky-800',
  distributore: 'bg-violet-100 text-violet-800'
};
