/**
 * Parsing fattura fornitore (distilleria) via OpenAI.
 * Regole: per ogni prodotto il prezzo imponibile unitario = liquido + accisa + contrassegno (per unità);
 * totale riga imponibile = prezzo_imponibile_unita * quantità. IVA (es. 22%) separata sul documento.
 */

export type SupplierInvoiceLineParsed = {
  /** Nome commerciale / descrizione in fattura */
  descrizione: string;
  quantita: number;
  /** Componenti opzionali se distinti in fattura */
  prezzo_liquido_unita?: number;
  accisa_unita?: number;
  contrassegno_unita?: number;
  /** Obbligatorio: somma imponibile per unità (liquido + accisa + contrassegno) */
  prezzo_imponibile_unita: number;
  imponibile_riga: number;
};

export type SupplierInvoiceParsed = {
  numero_documento?: string;
  data_documento?: string; // YYYY-MM-DD se possibile
  fornitore?: string;
  aliquota_iva_percentuale: number;
  righe: SupplierInvoiceLineParsed[];
  imponibile_totale?: number;
  iva_totale?: number;
  totale_ivato?: number;
  note_parsing?: string;
};

const SYSTEM = `Sei un esperto di fatture d'acquisto per una distilleria italiana.

REGOLE DI LETTURA (OBBLIGATORIE):
1) Ogni "prodotto finito" (es. Amaro, Limoncello, Bitter) in fattura può essere seguito da righe separate "Accisa" e "Contrassegni" con la STESSA quantità del prodotto.
2) Il PREZZO IMPONIBILE UNITARIO del prodotto = (importo imponibile liquido prodotto / qty) + (accisa riga / qty) + (contrassegni riga / qty). In pratica: somma dei tre totali riga diviso la quantità.
3) IMPONIBILE RIGA PRODOTTO = prezzo_imponibile_unita * quantita (deve coincidere con la somma delle tre sotto-righe imponibili).
4) L'IVA (es. 22%) è SULL'IMPONIBILE: non includere IVA nei campi imponibile. Leggi imponibile totale e IVA totale dal riepilogo fine fattura se presenti.
5) Ignora righe puramente descrittive, privacy, trasporto se non sono righe merce.
6) Numeri italiani: virgola decimale (es. 6,7200 → 6.72).

OUTPUT: SOLO JSON valido, senza markdown, con questa forma:
{
  "numero_documento": string o null,
  "data_documento": "YYYY-MM-DD" o null,
  "fornitore": string o null,
  "aliquota_iva_percentuale": number,
  "righe": [
    {
      "descrizione": string,
      "quantita": number,
      "prezzo_liquido_unita": number opzionale,
      "accisa_unita": number opzionale,
      "contrassegno_unita": number opzionale,
      "prezzo_imponibile_unita": number,
      "imponibile_riga": number
    }
  ],
  "imponibile_totale": number o null,
  "iva_totale": number o null,
  "totale_ivato": number o null,
  "note_parsing": string breve se dubbi
}`;

export async function parseSupplierInvoiceText(
  apiKey: string,
  rawText: string
): Promise<SupplierInvoiceParsed> {
  if (!apiKey?.trim()) throw new Error('API key OpenAI mancante');
  const trimmed = rawText.trim().slice(0, 120000);
  if (!trimmed) throw new Error('Testo fattura vuoto');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: `Testo estratto dalla fattura PDF (può essere disordinato):\n\n---\n${trimmed}\n---\n\nRestituisci il JSON.`
        }
      ],
      temperature: 0.1,
      max_tokens: 4000
    })
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || 'Errore API OpenAI');
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content?.trim() ?? '';
  const jsonStr = content
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  let parsed: SupplierInvoiceParsed;
  try {
    parsed = JSON.parse(jsonStr) as SupplierInvoiceParsed;
  } catch {
    throw new Error('Risposta AI non è JSON valido. Riprova o incolla il testo della fattura.');
  }

  if (!parsed.righe || !Array.isArray(parsed.righe)) {
    parsed.righe = [];
  }
  if (typeof parsed.aliquota_iva_percentuale !== 'number' || Number.isNaN(parsed.aliquota_iva_percentuale)) {
    parsed.aliquota_iva_percentuale = 22;
  }

  for (const r of parsed.righe) {
    const q = Number(r.quantita) || 0;
    const p = Number(r.prezzo_imponibile_unita) || 0;
    if (q > 0 && p > 0 && (!r.imponibile_riga || r.imponibile_riga <= 0)) {
      r.imponibile_riga = Math.round(q * p * 100) / 100;
    }
  }

  return parsed;
}
