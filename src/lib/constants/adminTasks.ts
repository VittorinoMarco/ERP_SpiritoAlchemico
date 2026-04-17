import type { AdminTaskStato, AdminTaskPriorita } from '$lib/types/adminTask';

/** Ordine colonne board (stati). */
export const BOARD_STATO_ORDER: AdminTaskStato[] = [
  'backlog',
  'da_fare',
  'in_corso',
  'in_revisione',
  'completato',
  'annullato'
];

export const TASK_STATO_LABELS: Record<AdminTaskStato, string> = {
  backlog: 'Backlog',
  da_fare: 'Da fare',
  in_corso: 'In corso',
  in_revisione: 'In revisione',
  completato: 'Completato',
  annullato: 'Annullato'
};

export const TASK_PRIORITA_LABELS: Record<AdminTaskPriorita, string> = {
  bassa: 'Bassa',
  media: 'Media',
  alta: 'Alta',
  critica: 'Critica'
};

export const TASK_PRIORITA_BADGE: Record<AdminTaskPriorita, string> = {
  bassa: 'bg-slate-100 text-slate-700',
  media: 'bg-blue-100 text-blue-800',
  alta: 'bg-amber-100 text-amber-900',
  critica: 'bg-red-100 text-red-800'
};
