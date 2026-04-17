import type { AdminTask } from '$lib/types/adminTask';

/** Relation verso task padre: `parent` (schema) o `genitore`. */
export function taskParentId(t: AdminTask & Record<string, unknown>): string {
  const v = t.parent ?? t.genitore;
  return v ? String(v) : '';
}
