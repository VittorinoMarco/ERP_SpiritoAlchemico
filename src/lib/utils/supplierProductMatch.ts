import type { Product } from '$lib/types/product';

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Suggerisce prodotti ERP in base alla descrizione in fattura. */
export function bestProductCandidates(desc: string, products: Product[], limit = 6): Product[] {
  const d = norm(desc);
  if (!d) return [];

  const scored = products
    .filter((p) => p.attivo !== false)
    .map((p) => {
      const nome = norm(p.nome || '');
      const sku = norm(p.sku || '');
      let score = 0;
      const words = d.split(/\s+/).filter((t) => t.length > 2);
      for (const w of words) {
        if (nome.includes(w)) score += 2;
        if (sku && (sku === w || sku.includes(w))) score += 8;
      }
      for (let len = Math.min(20, nome.length); len >= 4; len -= 2) {
        const sub = nome.slice(0, len);
        if (sub.length >= 4 && d.includes(sub)) {
          score += 4;
          break;
        }
      }
      return { p, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((x) => x.p);
}

export function firstMatchProductId(desc: string, products: Product[]): string {
  const c = bestProductCandidates(desc, products, 1);
  return c[0]?.id ?? '';
}
