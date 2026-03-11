import type { RecordModel } from 'pocketbase';

export type InvoiceStato = 'emessa' | 'pagata';

export interface Invoice extends RecordModel {
  numero_fattura?: string;
  ordine?: string;
  cliente: string;
  data_emissione: string;
  data_scadenza: string;
  data_pagamento?: string;
  totale_imponibile: number;
  iva: number;
  totale: number;
  stato: InvoiceStato;
}

export const STATO_LABELS: Record<InvoiceStato, string> = {
  emessa: 'Emessa',
  pagata: 'Pagata'
};

export const STATO_BADGE_COLORS: Record<InvoiceStato, string> = {
  emessa: 'bg-amber-100 text-amber-800',
  pagata: 'bg-green-100 text-green-800'
};
