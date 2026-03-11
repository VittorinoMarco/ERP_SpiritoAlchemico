import type { RecordModel } from 'pocketbase';

export type CommissionStato = 'maturata' | 'liquidata';

export interface AgentCommission extends RecordModel {
  agente: string;
  ordine: string;
  importo: number;
  percentuale: number;
  totale_ordine: number;
  stato: CommissionStato;
  data_maturata: string;
  data_liquidazione?: string;
}

export const COMMISSION_STATO_LABELS: Record<CommissionStato, string> = {
  maturata: 'Maturata',
  liquidata: 'Liquidata'
};

export const COMMISSION_STATO_BADGE: Record<CommissionStato, string> = {
  maturata: 'bg-amber-100 text-amber-800',
  liquidata: 'bg-green-100 text-green-800'
};
