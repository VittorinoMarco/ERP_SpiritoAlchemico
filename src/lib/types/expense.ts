/** Tipo di uscita / nota spese */
export type ExpenseTipo = 'immediata' | 'programmata' | 'futura';

/** Origine contabile (evita doppia registrazione con magazzino) */
export type ExpenseOrigine = 'manuale' | 'acquisto_magazzino' | 'fattura_fornitore';

export const EXPENSE_ORIGINE_LABELS: Record<ExpenseOrigine, string> = {
  manuale: 'Manuale',
  acquisto_magazzino: 'Acquisto magazzino',
  fattura_fornitore: 'Fattura fornitore (import)'
};

export const EXPENSE_TIPO_LABELS: Record<ExpenseTipo, string> = {
  immediata: 'Immediata (già sostenuta)',
  programmata: 'Programmata (data definita)',
  futura: 'Futura / prevista'
};

export const EXPENSE_TIPO_BADGE: Record<ExpenseTipo, string> = {
  immediata: 'bg-zinc-800 text-white',
  programmata: 'bg-amber-100 text-amber-900',
  futura: 'bg-sky-100 text-sky-900'
};

export interface Expense {
  id: string;
  tipo: ExpenseTipo;
  /** Data di competenza / scadenza prevista */
  data_spesa: string;
  /** Imponibile totale (senza IVA) */
  importo: number;
  /** IVA in euro (separata dall’imponibile), es. 22% */
  iva_importo?: number;
  descrizione?: string;
  categoria?: string;
  note?: string;
  /** Nome file su PocketBase */
  allegato?: string;
  /** Per programmata/futura: segnala quando è stata pagata/registrata */
  completata?: boolean;
  creato_da?: string;
  /** Da magazzino / import fattura */
  origine?: ExpenseOrigine | string;
  numero_documento?: string;
  /** JSON string o array: id movimenti magazzino collegati */
  movimenti_collegati?: string | string[];
  created?: string;
  updated?: string;
}
