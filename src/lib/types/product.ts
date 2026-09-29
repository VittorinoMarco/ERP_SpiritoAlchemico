import type { RecordModel } from 'pocketbase';

/** Valori del campo select `products.categoria` nel database reale. */
export type ProductCategory = 'amaro' | 'limoncello' | 'gin' | 'bitter' | 'vermouth';

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
  amaro: 'Amaro',
  limoncello: 'Limoncello',
  gin: 'Gin',
  bitter: 'Bitter',
  vermouth: 'Vermouth'
};

export const CATEGORY_BADGE_COLORS: Record<ProductCategory, string> = {
  amaro: 'bg-rose-100 text-rose-800',
  limoncello: 'bg-amber-100 text-amber-800',
  gin: 'bg-sky-100 text-sky-800',
  bitter: 'bg-red-100 text-red-800',
  vermouth: 'bg-violet-100 text-violet-800'
};

export const CATEGORY_OPTIONS = (Object.keys(CATEGORY_LABELS) as ProductCategory[]).map((value) => ({
  value,
  label: CATEGORY_LABELS[value]
}));
