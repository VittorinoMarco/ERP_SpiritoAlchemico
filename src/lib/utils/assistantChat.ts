export type ChatRole = 'user' | 'assistant' | 'system';

export type ChatMessage = { role: ChatRole; content: string };

const SYSTEM_PROMPT = `Sei l'assistente AI dell'ERP Spirito Alchemico (distilleria artigianale).
Aiuti con: ordini, clienti, magazzino, fatture, provvigioni, flussi operativi.
Rispondi sempre in italiano, in modo chiaro e pratico.
Se non hai dati real-time dal gestionale, dichiara che stai ragionando in generale e suggerisci di verificare nell'app.`;

export async function sendAssistantChat(
  apiKey: string,
  messages: ChatMessage[]
): Promise<string> {
  if (!apiKey?.trim()) throw new Error('API key mancante');

  const bodyMessages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...messages.filter((m) => m.role !== 'system')
  ];

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: bodyMessages.map(({ role, content }) => ({ role, content })),
      temperature: 0.5,
      max_tokens: 1200
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || 'Errore API OpenAI');
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() ?? 'Nessuna risposta';
}
