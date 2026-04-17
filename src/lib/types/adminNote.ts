import type { RecordModel } from 'pocketbase';

export interface NoteFolder extends RecordModel {
  nome: string;
  genitore?: string;
  posizione?: number;
  expand?: {
    genitore?: NoteFolder;
  };
}

export interface AdminNote extends RecordModel {
  titolo: string;
  corpo?: string;
  cartella?: string;
  autore?: string;
  posizione?: number;
  expand?: {
    cartella?: NoteFolder;
    autore?: { id: string; name?: string; email?: string };
  };
}
