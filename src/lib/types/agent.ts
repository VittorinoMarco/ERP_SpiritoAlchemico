import type { RecordModel } from 'pocketbase';

/**
 * maturata  = calcolata e dovuta (all'incasso: fattura → pagata)
 * liquidata = pagata all'agente (immutabile)
 * stornata  = annullata perché l'ordine è stato annullato (resta a storico, non entra nei totali)
 */
export type CommissionStato = 'maturata' | 'liquidata' | 'stornata';

export interface AgentCommission extends RecordModel {
  agente: string;
  ordine: string;
  importo: number;
  percentuale: number;
  totale_ordine: number;
  stato: CommissionStato;
  data_maturata: string;
  data_liquidazione?: string;
  data_storno?: string;
  motivo_storno?: string;
}

export const COMMISSION_STATO_LABELS: Record<CommissionStato, string> = {
  maturata: 'Maturata',
  liquidata: 'Liquidata',
  stornata: 'Stornata'
};

export const COMMISSION_STATO_BADGE: Record<CommissionStato, string> = {
  maturata: 'bg-amber-100 text-amber-800',
  liquidata: 'bg-green-100 text-green-800',
  stornata: 'bg-gray-100 text-gray-600 line-through'
};
