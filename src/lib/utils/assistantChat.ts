export type ChatRole = 'user' | 'assistant' | 'system';

export type ChatMessage = { role: ChatRole; content: string };

const SYSTEM_PROMPT = `Sei l'assistente AI dell'ERP Spirito Alchemico (distilleria artigianale).
Aiuti con: ordini, clienti, magazzino, fatture, provvigioni, flussi operativi.
Rispondi sempre in italiano, in modo chiaro e pratico.

IMPORTANTE: riceverai un messaggio di sistema aggiuntivo con etichetta "[Dati ERP — lettura al ...]" con tabelle Markdown, prezzi (listino / HORECA / e-commerce) e giacenze per riga.
Per numeri, confronti di fatturato potenziale per canale, quantità in magazzino e ordini recenti: usa SOLO quei dati.
Se manca un dettaglio nel riepilogo, dillo e indica la pagina dell'app.

FORMATO RISPOSTA (sempre Markdown leggibile):
- Inizia con una riga breve di sintesi.
- Usa **elenchi puntati** o **tabelle Markdown** quando confronti canali (diretto/listino vs HORECA vs e-commerce) o elenchi prodotti.
- Evita muri di testo: sottotitoli ### se la risposta è lunga.
- Evidenzia numeri chiave in **grassetto**.`;

export type AssistantChatOptions = {
  /** Snapshot testuale da PocketBase (buildAssistantDataSnapshot). */
  dataSnapshot?: string;
};

function buildMessages(
  messages: ChatMessage[],
  dataSnapshot?: string
): { role: string; content: string }[] {
  const base: { role: string; content: string }[] = [{ role: 'system', content: SYSTEM_PROMPT }];
  if (dataSnapshot?.trim()) {
    base.push({ role: 'system', content: dataSnapshot.trim() });
  }
  for (const m of messages) {
    if (m.role === 'system') continue;
    base.push({ role: m.role, content: m.content });
  }
  return base;
}

export async function sendAssistantChat(
  apiKey: string,
  messages: ChatMessage[],
  options?: AssistantChatOptions
): Promise<string> {
  if (!apiKey?.trim()) throw new Error('API key mancante');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: buildMessages(messages, options?.dataSnapshot),
      temperature: 0.5,
      max_tokens: 3500
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || 'Errore API OpenAI');
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() ?? 'Nessuna risposta';
}

/**
 * Streaming SSE: chiama onChunk con il testo cumulativo ad ogni delta.
 * Restituisce il testo completo a fine stream.
 */
export async function sendAssistantChatStream(
  apiKey: string,
  messages: ChatMessage[],
  options: AssistantChatOptions & { onChunk: (fullText: string) => void }
): Promise<string> {
  if (!apiKey?.trim()) throw new Error('API key mancante');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: buildMessages(messages, options.dataSnapshot),
      temperature: 0.5,
      max_tokens: 3500,
      stream: true
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || 'Errore API OpenAI');
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('Stream non disponibile');

  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n');
    buffer = parts.pop() ?? '';
    for (const line of parts) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      const data = t.slice(5).trim();
      if (data === '[DONE]') continue;
      try {
        const json = JSON.parse(data) as {
          choices?: { delta?: { content?: string } }[];
        };
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) {
          full += delta;
          options.onChunk(full);
        }
      } catch {
        // ignora righe non-JSON
      }
    }
  }

  const tail = buffer.trim();
  if (tail.startsWith('data:')) {
    const data = tail.slice(5).trim();
    if (data && data !== '[DONE]') {
      try {
        const json = JSON.parse(data) as { choices?: { delta?: { content?: string } }[] };
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) {
          full += delta;
          options.onChunk(full);
        }
      } catch {
        /* ignore */
      }
    }
  }

  return full.trim() || 'Nessuna risposta';
}
