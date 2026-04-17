import type { AdminNote, NoteFolder } from '$lib/types/adminNote';

/** Cartella padre: supporta `genitore` (schema doc) o `parent` (PocketBase di default). */
export function folderParentId(f: NoteFolder & Record<string, unknown>): string {
  const v = f.genitore ?? f.parent;
  return v ? String(v) : '';
}

/** Nota → cartella: `cartella` o `folder`. */
export function noteCartellaId(n: AdminNote): string {
  const v = n.cartella ?? n.folder;
  return v ? String(v) : '';
}

export function sortFolders(a: NoteFolder, b: NoteFolder): number {
  const pa = a.posizione ?? 0;
  const pb = b.posizione ?? 0;
  if (pa !== pb) return pa - pb;
  return (a.nome ?? '').localeCompare(b.nome ?? '', 'it');
}
