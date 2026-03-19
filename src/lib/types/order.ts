import type { RecordModel } from 'pocketbase';

export type OrderStato = 'bozza' | 'confermato' | 'spedito' | 'consegnato' | 'completato' | 'annullato';
export type OrderCanale = 'horeca' | 'ecommerce' | 'diretto';

export interface Order extends RecordModel {
  numero_ordine?: string;
  cliente: string;
  agente?: string;
  data_ordine: string;
  stato: OrderStato;
  canale: OrderCanale;
  totale: number;
  totale_imponibile?: number;
  iva?: number;
  iva_percentuale?: number;
  note?: string;
  ddt_numero?: string;
}

export interface OrderItem extends RecordModel {
  ordine: string;
  prodotto: string;
  quantita: number;
  prezzo_unitario: number;
  sconto_percentuale?: number;
  totale_riga: number;
}

export const STATO_LABELS: Record<OrderStato, string> = {
  bozza: 'Bozza',
  confermato: 'Confermato',
  spedito: 'Spedito',
  consegnato: 'Consegnato',
  completato: 'Consegnato',
  annullato: 'Annullato'
};

export const STATO_BADGE_COLORS: Record<OrderStato, string> = {
  bozza: 'bg-amber-100 text-amber-800',
  confermato: 'bg-sky-100 text-sky-800',
  spedito: 'bg-indigo-100 text-indigo-800',
  consegnato: 'bg-green-100 text-green-800',
  completato: 'bg-green-100 text-green-800',
  annullato: 'bg-rose-100 text-rose-800'
};

export const CANALE_LABELS: Record<OrderCanale, string> = {
  horeca: 'HORECA',
  ecommerce: 'E-commerce',
  diretto: 'Diretto'
};

export const CANALE_BADGE_COLORS: Record<OrderCanale, string> = {
  horeca: 'bg-amber-100 text-amber-800',
  ecommerce: 'bg-sky-100 text-sky-800',
  diretto: 'bg-violet-100 text-violet-800'
};

export const STATO_STEPS: OrderStato[] = ['bozza', 'confermato', 'spedito', 'consegnato'];
// completato è equivalente a consegnato (usato da PocketBase)
export const STATO_CONSEGNATO_VALUES = ['consegnato', 'completato'] as const;
