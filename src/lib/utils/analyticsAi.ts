export async function getAnalyticsInsight(
  apiKey: string,
  userQuery: string,
  dataSummary: string
): Promise<string> {
  if (!apiKey?.trim() || !userQuery?.trim()) {
    throw new Error('API key e query richiesti');
  }
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Sei un analista di business per un'azienda di distilleria artigianale. Ricevi dati aggregati e domande in linguaggio naturale. Rispondi in italiano, in modo conciso e professionale. Usa bullet points per gli insights. I dati forniti sono in formato testuale.`
        },
        {
          role: 'user',
          content: `Dati disponibili:\n${dataSummary}\n\nDomanda: ${userQuery}`
        }
      ],
      temperature: 0.3,
      max_tokens: 800
    })
  });
  if (!res.ok) throw new Error('Errore API OpenAI');
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() ?? 'Nessuna risposta';
}

export function buildDataSummary(params: {
  totaleVendite: number;
  venditePerMese: { mese: string; valore: number }[];
  venditePerCanale: { canale: string; valore: number }[];
  topProdotti: { nome: string; quantita: number; fatturato: number }[];
  topAgenti: { nome: string; fatturato: number; ordini: number }[];
  topClienti: { nome: string; fatturato: number; tipo: string }[];
  periodo: string;
}): string {
  const lines: string[] = [
    `Periodo: ${params.periodo}`,
    `Totale vendite: €${params.totaleVendite.toLocaleString('it-IT')}`,
    '',
    'Vendite per mese:',
    ...params.venditePerMese.map((v) => `- ${v.mese}: €${v.valore.toLocaleString('it-IT')}`),
    '',
    'Vendite per canale:',
    ...params.venditePerCanale.map((v) => `- ${v.canale}: €${v.valore.toLocaleString('it-IT')}`),
    '',
    'Top 5 prodotti:',
    ...params.topProdotti.slice(0, 5).map((p) => `- ${p.nome}: ${p.quantita} pz, €${p.fatturato.toLocaleString('it-IT')}`),
    '',
    'Top 5 agenti:',
    ...params.topAgenti.slice(0, 5).map((a) => `- ${a.nome}: €${a.fatturato.toLocaleString('it-IT')}, ${a.ordini} ordini`),
    '',
    'Top 5 clienti:',
    ...params.topClienti.slice(0, 5).map((c) => `- ${c.nome} (${c.tipo}): €${c.fatturato.toLocaleString('it-IT')}`)
  ];
  return lines.join('\n');
}
