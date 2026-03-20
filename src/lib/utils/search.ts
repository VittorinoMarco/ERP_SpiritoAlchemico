import { pb } from '$lib/pocketbase';

export type SearchResultType = 'products' | 'clients' | 'orders' | 'invoices' | 'inventory';

export interface SearchResult {
  id: string;
  type: SearchResultType;
  title: string;
  subtitle: string;
  url: string;
  aiInterpreted?: boolean;
}

export interface AIFilterResponse {
  products?: string;
  clients?: string;
  orders?: string;
  invoices?: string;
  inventory?: string;
}

function buildTextFilter(term: string, fields: string[]): string {
  if (!term?.trim()) return '';
  const t = term.trim().replace(/"/g, '\\"');
  return fields.map((f) => `${f} ~ "${t}"`).join(' || ');
}

export async function interpretWithAI(
  query: string,
  apiKey: string
): Promise<{ filters: AIFilterResponse; used: boolean }> {
  if (!apiKey?.trim() || !query?.trim()) {
    return { filters: {}, used: false };
  }
  try {
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
            content: `Sei un assistente che traduce query in linguaggio naturale in filtri PocketBase.
Rispondi SOLO con un JSON valido, nessun altro testo.
Formato: { "products": "filter o vuoto", "clients": "filter", "orders": "filter", "invoices": "filter", "inventory": "filter" }
Usa la sintassi PocketBase: ~ per contains, && per AND, || per OR.
Esempi:
- "Bar Roma" → clients: "ragione_sociale ~ \\"Bar Roma\\" || email ~ \\"Bar Roma\\""
- "ordini marzo" → orders: "data_ordine >= \\"2025-03-01\\" && data_ordine <= \\"2025-03-31\\""
- "sotto scorta" / "esaurimento" → inventory: "giacenza <= 6" (in app la soglia è fissa a 6)
- "fatture non pagate" → invoices: "stato != \\"pagata\\""
Se non applicabile, usa stringa vuota "".`
          },
          {
            role: 'user',
            content: query
          }
        ],
        temperature: 0.2,
        max_tokens: 500
      })
    });
    if (!res.ok) throw new Error('OpenAI API error');
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error('No response');
    const parsed = JSON.parse(content.replace(/```json\n?|\n?```/g, '')) as AIFilterResponse;
    return { filters: parsed, used: true };
  } catch {
    return { filters: {}, used: false };
  }
}

export async function searchPocketBase(
  query: string,
  aiFilters?: AIFilterResponse,
  aiUsed?: boolean
): Promise<SearchResult[]> {
  const q = query.trim();
  const results: SearchResult[] = [];
  const ai = aiUsed ?? false;

  if (!q && !aiFilters) return results;

  const productFilter = aiFilters?.products || (q ? buildTextFilter(q, ['nome', 'sku', 'descrizione']) : '');
  const clientFilter = aiFilters?.clients || (q ? buildTextFilter(q, ['ragione_sociale', 'email', 'citta']) : '');
  const orderFilter = aiFilters?.orders || (q ? buildTextFilter(q, ['numero_ordine', 'note']) : '');
  const invoiceFilter =
    aiFilters?.invoices || (q ? buildTextFilter(q, ['numero_fattura']) : '');

  const promises: Promise<void>[] = [];

  if (productFilter) {
    promises.push(
      pb
        .collection('products')
        .getList(1, 5, { filter: productFilter })
        .then((r) => {
          for (const item of r.items as any[]) {
            results.push({
              id: item.id,
              type: 'products',
              title: item.nome ?? '—',
              subtitle: item.sku ?? '',
              url: `/prodotti/${item.id}`,
              aiInterpreted: ai
            });
          }
        })
        .catch(() => {})
    );
  }

  if (clientFilter) {
    promises.push(
      pb
        .collection('clients')
        .getList(1, 5, { filter: clientFilter })
        .then((r) => {
          for (const item of r.items as any[]) {
            results.push({
              id: item.id,
              type: 'clients',
              title: item.ragione_sociale ?? '—',
              subtitle: item.email ?? item.citta ?? '',
              url: `/clienti/${item.id}`,
              aiInterpreted: ai
            });
          }
        })
        .catch(() => {})
    );
  }

  if (orderFilter) {
    promises.push(
      pb
        .collection('orders')
        .getList(1, 5, { filter: orderFilter, expand: 'cliente', sort: '-data_ordine' })
        .then((r) => {
          for (const item of r.items as any[]) {
            const cliente = (item as any).expand?.cliente;
            results.push({
              id: item.id,
              type: 'orders',
              title: item.numero_ordine ?? '—',
              subtitle: cliente?.ragione_sociale ?? item.data_ordine ?? '',
              url: `/ordini/${item.id}`,
              aiInterpreted: ai
            });
          }
        })
        .catch(() => {})
    );
  }

  if (invoiceFilter) {
    promises.push(
      pb
        .collection('invoices')
        .getList(1, 5, { filter: invoiceFilter, expand: 'cliente', sort: '-data_emissione' })
        .then((r) => {
          for (const item of r.items as any[]) {
            const cliente = (item as any).expand?.cliente;
            results.push({
              id: item.id,
              type: 'invoices',
              title: item.numero_fattura ?? '—',
              subtitle: cliente?.ragione_sociale ?? item.data_emissione ?? '',
              url: `/fatture/${item.id}`,
              aiInterpreted: ai
            });
          }
        })
        .catch(() => {})
    );
  }

  if (aiFilters?.inventory) {
    promises.push(
      pb
        .collection('inventory')
        .getList(1, 5, { filter: aiFilters.inventory, expand: 'prodotto' })
        .then((r) => {
          for (const item of r.items as any[]) {
            const p = (item as any).expand?.prodotto;
            results.push({
              id: item.id,
              type: 'inventory',
              title: p?.nome ?? '—',
              subtitle: `Giacenza: ${item.giacenza ?? 0} (min: ${item.giacenza_minima ?? 0})`,
              url: '/magazzino',
              aiInterpreted: true
            });
          }
        })
        .catch(() => {})
    );
  }

  await Promise.all(promises);
  const typeOrder: SearchResultType[] = ['products', 'clients', 'orders', 'invoices', 'inventory'];
  results.sort((a, b) => typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type));
  return results;
}
