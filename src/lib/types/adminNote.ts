import type { RecordModel } from 'pocketbase';

export interface NoteFolder extends RecordModel {
  nome: string;
  /** Relation verso cartella padre (in PB può essere anche `parent`). */
  genitore?: string;
  parent?: string;
  posizione?: number;
  expand?: {
    genitore?: NoteFolder;
  };
}

export interface AdminNote extends RecordModel {
  titolo: string;
  corpo?: string;
  cartella?: string;
  /** Alias se la collection usa `folder` invece di `cartella`. */
  folder?: string;
  autore?: string;
  posizione?: number;
  expand?: {
    cartella?: NoteFolder;
    autore?: { id: string; name?: string; email?: string };
  };
}
