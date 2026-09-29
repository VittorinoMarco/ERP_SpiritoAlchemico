import type PocketBase from 'pocketbase';

export type CompanyProfile = {
  id: string;
  ragione_sociale?: string;
  partita_iva?: string;
  codice_fiscale?: string;
  regime_fiscale?: string;
  indirizzo?: string;
  citta?: string;
  cap?: string;
  provincia?: string;
  pec?: string;
  codice_sdi?: string;
  iban?: string;
  telefono?: string;
  email?: string;
};

export const COMPANY_EMPTY: Omit<CompanyProfile, 'id'> = {
  ragione_sociale: 'Spirito Alchemico'
};

export async function getCompanyProfile(pb: PocketBase): Promise<CompanyProfile | null> {
  try {
    const list = await pb.collection('company_profile').getList(1, 1);
    return (list.items[0] as CompanyProfile | undefined) ?? null;
  } catch {
    return null;
  }
}

export function companyReadyForFatturaPA(c: CompanyProfile | null): boolean {
  if (!c) return false;
  return !!(c.ragione_sociale && c.partita_iva && c.indirizzo && c.citta && c.cap && c.regime_fiscale);
}
