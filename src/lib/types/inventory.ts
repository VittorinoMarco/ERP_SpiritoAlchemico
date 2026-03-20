import type { RecordModel } from 'pocketbase';

export type MovementTipo = 'carico' | 'scarico' | 'rettifica';

export interface Inventory extends RecordModel {
  prodotto: string;
  giacenza: number;
  giacenza_minima: number;
  lotto?: string;
  data_scadenza?: string;
  ubicazione?: string;
}

export interface InventoryMovement extends RecordModel {
  prodotto: string;
  tipo: MovementTipo;
  quantita: number;
  causale?: string;
  ordine_rif?: string;
  data_movimento: string;
  utente?: string;
  /** Relation → expenses: movimento generato da acquisto/fornitore già in uscite */
  expense_id?: string;
}

export const MOVIMENTO_LABELS: Record<MovementTipo, string> = {
  carico: 'Carico',
  scarico: 'Scarico',
  rettifica: 'Rettifica'
};

export const MOVIMENTO_COLORS: Record<MovementTipo, string> = {
  carico: 'bg-green-100 text-green-800',
  scarico: 'bg-rose-100 text-rose-800',
  rettifica: 'bg-amber-100 text-amber-800'
};
