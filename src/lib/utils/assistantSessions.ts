/**
 * Storico chat Assistente AI su PocketBase (collection `ai_chat_sessions`).
 * Non usa più localStorage.
 */
import { browser } from '$app/environment';
import { ClientResponseError } from 'pocketbase';
import { pb } from '$lib/pocketbase';

export const AI_CHAT_COLLECTION = 'ai_chat_sessions';

export type StoredChatMessage = { role: 'user' | 'assistant'; content: string };

export type AssistantSession = {
  id: string;
  title: string;
  messages: StoredChatMessage[];
  updatedAt: string;
};

function authUserId(): string | null {
  if (!browser) return null;
  return (pb.authStore.model as { id?: string } | null)?.id ?? null;
}

function normalizeMessages(raw: unknown): StoredChatMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (m): m is StoredChatMessage =>
      !!m &&
      typeof m === 'object' &&
      (m as StoredChatMessage).role !== undefined &&
      ((m as StoredChatMessage).role === 'user' || (m as StoredChatMessage).role === 'assistant') &&
      typeof (m as StoredChatMessage).content === 'string'
  );
}

export function recordToAssistantSession(r: Record<string, unknown>): AssistantSession {
  return {
    id: String(r.id ?? ''),
    title: typeof r.titolo === 'string' ? r.titolo.trim() || 'Nuova chat' : 'Nuova chat',
    messages: normalizeMessages(r.messaggi),
    updatedAt:
      typeof r.updated === 'string'
        ? r.updated
        : typeof r.created === 'string'
          ? r.created
          : new Date().toISOString()
  };
}

export function isAiChatCollectionMissingError(e: unknown): boolean {
  if (e instanceof ClientResponseError && e.status === 404) return true;
  const msg = e instanceof Error ? e.message : String(e);
  return /404|not found|wasn't found|unknown collection/i.test(msg);
}

/** Elenco sessioni dell’utente corrente (più recenti prima). */
export async function listSessions(): Promise<AssistantSession[]> {
  const userId = authUserId();
  if (!userId) return [];
  const rows = await pb.collection(AI_CHAT_COLLECTION).getFullList({
    filter: `utente = "${userId}"`,
    sort: '-updated'
  });
  return rows.map((r) => recordToAssistantSession(r as unknown as Record<string, unknown>));
}

export async function getSession(sessionId: string): Promise<AssistantSession | null> {
  const userId = authUserId();
  if (!userId) return null;
  try {
    const r = await pb.collection(AI_CHAT_COLLECTION).getOne(sessionId);
    const rec = r as Record<string, unknown>;
    if (rec.utente !== userId) return null;
    return recordToAssistantSession(rec);
  } catch {
    return null;
  }
}

/** Crea una sessione vuota sul server. */
export async function createSession(): Promise<AssistantSession> {
  const userId = authUserId();
  if (!userId) throw new Error('Utente non autenticato');
  const r = await pb.collection(AI_CHAT_COLLECTION).create({
    utente: userId,
    titolo: 'Nuova chat',
    messaggi: []
  });
  return recordToAssistantSession(r as unknown as Record<string, unknown>);
}

export async function updateSession(session: AssistantSession): Promise<void> {
  const userId = authUserId();
  if (!userId) throw new Error('Utente non autenticato');
  await pb.collection(AI_CHAT_COLLECTION).update(session.id, {
    titolo: session.title,
    messaggi: session.messages
  });
}

export async function deleteSession(sessionId: string): Promise<void> {
  await pb.collection(AI_CHAT_COLLECTION).delete(sessionId);
}

export function titleFromFirstMessage(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return 'Nuova chat';
  return t.length > 48 ? `${t.slice(0, 45)}…` : t;
}
