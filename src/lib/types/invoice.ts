import type { RecordModel } from 'pocketbase';

export type InvoiceStato = 'emessa' | 'pagata' | 'convertita';
export type InvoiceTipo = 'proforma' | 'fattura';

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
  tipo?: InvoiceTipo;
  proforma_origine?: string;
}

export const STATO_LABELS: Record<InvoiceStato, string> = {
  emessa: 'Emessa',
  pagata: 'Pagata',
  convertita: 'Convertita in fattura'
};

export const STATO_BADGE_COLORS: Record<InvoiceStato, string> = {
  emessa: 'bg-amber-100 text-amber-800',
  pagata: 'bg-green-100 text-green-800',
  convertita: 'bg-gray-100 text-gray-600'
};

export const TIPO_LABELS: Record<InvoiceTipo, string> = {
  proforma: 'Proforma',
  fattura: 'Fattura'
};
