import type { RecordModel } from 'pocketbase';

export type ProductCategory = 'liquore' | 'amaro' | 'gin';

export interface Product extends RecordModel {
  nome: string;
  sku: string;
  descrizione?: string;
  categoria: ProductCategory;
  prezzo_listino: number;
  prezzo_horeca: number;
  prezzo_ecommerce: number;
  volume_ml?: number;
  gradazione?: number;
  immagine?: string;
  attivo: boolean;
}

export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  liquore: 'Liquore',
  amaro: 'Amaro',
  gin: 'Gin'
};

export const CATEGORY_BADGE_COLORS: Record<ProductCategory, string> = {
  liquore: 'bg-amber-100 text-amber-800',
  amaro: 'bg-rose-100 text-rose-800',
  gin: 'bg-sky-100 text-sky-800'
};
