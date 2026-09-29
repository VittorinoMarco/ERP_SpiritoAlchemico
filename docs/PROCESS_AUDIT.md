# Audit processi — stato reale (2026-09-29)

Fonte verificata in questa data: codice locale (repo `ERP_SpiritoAlchemico`) + PocketBase produzione `https://spiritoalchemico.marcovittorino.com` (API superuser).  
**Non ci sono hook PocketBase** (`pb_hooks/` assente). L’app è SPA statica (`adapter-static`, `ssr = false`); i calcoli girano nel browser. Deploy: GitHub Actions su `main` → Nginx `/var/www/erp/`. Backup PB: cron `0 3 * * *`, 7 copie, S3 disattivato.

## Inventario runtime

| Area | Cosa c’è davvero |
|------|-------------------|
| Utenti | 2 soci, entrambi `admin`: Marco Vittorino, Antonio De Luca. **Nessun agente, nessun magazziniere, nessun subagente.** |
| Catalogo | 3 SKU attivi, 700 ml: Doctor Claudius (amaro 30°, listino 32 / HORECA 22 / e-comm 32), Don Orsino (limoncello 30°, 29/19/29), Cristina (amaro 18°, 27/19/27). Categorie DB: `amaro, limoncello, gin, bitter, vermouth` (la doc storica `liquore` è obsoleta). |
| Magazzino | **1 solo record**: Doctor Claudius, giacenza 200. Gli altri due prodotti **non hanno riga inventory**. 1 movimento di carico. Lotti/scadenze/ubicazione vuoti. |
| Clienti | 14, **tutti senza agente**, **tutti senza P.IVA**. Tipi: horeca/ecommerce/distributore. Nessun duplicato di ragione sociale. |
| Ordini / fatture / provvigioni / uscite | **0 record.** Collection vuote con indici UNIQUE già applicati su `numero_ordine`, `numero_fattura`, `(ordine,agente)` commissioni. |
| Ruoli schema | `admin \| agente \| magazziniere`. Campo `role` non esiste: le regole di task/note che citano `@request.auth.role` sono morte (funziona solo `ruolo`). |

## Flusso economico attuale (origine → formula → persistenza)

```
Listino prodotto (prezzo_horeca | prezzo_ecommerce | prezzo_listino)
  → riga ordine: totale_riga = round2(qty × unit × (1 − sconto%/100))   [client, snapshot]
  → testata: imponibile = Σ totale_riga; iva = round2(imponibile × iva%/100); totale = imponibile+iva
  → conferma (admin): scarico inventory `giacenza-` + movimento tipo scarico, ordine_rif
  → spedito / consegnato: nessun effetto sulle provvigioni
  → registro interno invoices (PDF = copia gestionale, NON FatturaPA)
  → pagata: agent_commissions.importo = round2(imponibile × users.provvigione_percentuale / 100), stato=maturata
```

KPI dashboard admin: **fatturato = Σ invoices.totale IVA inclusa**; **ordinato = Σ orders.totale** escluse bozze/annullati.  
Valore magazzino = giacenza × **prezzo listino** (non costo d’acquisto: il costo non è persistito).

## Matrice processi (estratto)

| Processo | Comportamento attuale | Evidenza | Problema | Proposta | Pri. | Dati esistenti |
|----------|----------------------|----------|----------|----------|------|----------------|
| Login / ruoli soci | Due admin equivalenti | `users.ruolo`, nav `canAccess` | Nessuna distinzione operativa vs fiscale | Tenere un solo ruolo `admin` per entrambi; eventuale flag “tecnico” più avanti | P2 | nessuno |
| CRM | Solo anagrafica + storico ordini | `clients`, nessuna collection visite | No prospect, no visite, no prossima azione, no territorio | Aggiungere `visite` solo dopo il primo agente reale | P1 | 14 clienti da assegnare |
| Assegnazione clienti | 1 relation `agente`, senza storia | `clients.agente` | 14/14 non assegnati → un agente non li vedrebbe | Assegnazione da socio, con data in activity_log | **P0** | update `agente` |
| Ordine agente | Crea solo `bozza` a proprio nome | UI + API create | Magazzino non toccato (corretto: agente non scrive inventory) | Tenere | — | — |
| Conferma | Admin, scarico immediato | `ordini/[id]` `changeStato` | Giacenza scende prima della spedizione; no “riservato” | **Deciso: scarico a conferma.** Nessuno stato impegnato. | P2 | 0 ordini |
| Magazziniere | API vede tutti gli ordini; UI nasconde `/ordini` | rules list vs `nav.ts` | Non può preparare/spedire | Lista “da evadere” se serve un magazziniere | P1 | — |
| Stock | `giacenza-` atomico-ish, può andare negativa | `inventoryCarico.ts` | Due conferme simultanee possono perdere un update; 2/3 SKU senza riga | Creare inventory a 0 per i SKU mancanti; hook PB per lock vero | P1 | 2 insert giacenza=0 |
| Provvigioni | % su utente, matura a **fattura pagata**, base imponibile | `commissions.ts` | No subagente, no piano versionato | Piano versionato dopo il primo agente | P1 | 0 righe |
| Documenti | PDF copia gestionale, nessun dato fiscale finto | `pdfInvoice.ts` | Non è FatturaPA | Progetto SDI a parte (P.IVA azienda + 14 clienti) | **P1** | 0 fatture |
| IVA | Default 22% hardcoded | nuovo ordine | Nessun regime misto, nessun 10%/4% | Tenere 22% finché i 3 SKU restano alcolici | P2 | — |
| Confezioni | Unità = bottiglia | products.volume_ml=700 | No pezzi/cartone, no campioni/omaggi | Non introdurre finché non vendete per cartone | P2 | — |
| Resi / NC | Blocco annullo se esiste fattura | `ordini/[id]` | Nessun flusso reso/nota di credito | Non inventare: decisione dopo il primo reso | P1 | — |
| E-commerce webhook | Server Node a parte, idempotente su `order_id` | `server/webhook.js` | Non verificato se il processo è in esecuzione in produzione | Controllare systemd/nginx solo se usate Shopify/Woo | P2 | — |
| Calcoli sul client | Conferma, scarico, commissioni, numerazione FAT | SPA | Un admin può alterare i payload (regole `--strict` non applicate) | Applicare `--strict` **dopo** deploy del frontend nuovo | P1 | regole |

## Matrice permessi (produzione, non `--strict`)

| Collection | admin | agente | magazziniere |
|------------|-------|--------|----------------|
| users | CRUD; self non cambia ruolo/% | view self | view self |
| clients | CRUD | CRUD solo `agente=sé` | — |
| orders | CRUD (create non più vincolato a bozza) | create bozza propria su **cliente proprio**; update/delete solo bozza | list/view tutti |
| order_items | CRUD | create/update su bozza propria | list/view |
| inventory + movements | CRUD | list/view | CRUD |
| invoices | CRUD | list/view se `ordine.agente=sé` | — |
| agent_commissions | CRUD (importo ancora modificabile) | list/view proprie | — |
| activity_log | CRUD | create proprio; list proprio | create proprio; list proprio |
| expenses, tasks, notes | sì | — | — |
| products | CRUD | list/view | list/view |

`--strict` (non applicato) congela totali dopo la bozza, vieta delete di confermati, rende immutabili commissioni liquidate e lo storico movimenti.

## Mobile agente (oggi, senza utente agente)

| Passo | Stato |
|-------|--------|
| Login | Sì, pagina dedicata |
| Cerca cliente | Sì (lista + ⌘K; su mobile pill ricerca) |
| Visita / follow-up | **No** |
| Nuovo ordine | Sì, schede prodotto + giacenza |
| Provvigioni | No voce nav; solo se gli date `/agenti` (oggi admin-only) → serve una vista “le mie provvigioni” |

## Gap vs ERP beverage (proporzionati, non da copiare)

Utili alla dimensione (2 soci + agenti): assegnazione clienti, snapshot prezzo già presente, lotti quando arriverà il primo carico con scadenza, registro documenti **dichiarato interno**, piano provvigioni semplice versionato, KPI ordinato/fatturato/incassato distinti (già abbozzati).  
**Non** servono ora: WMS, percorsi, multi-deposito, EDI, distinta base, subagente finché non esiste.

## Decisioni soci (2026-09-29)

| Tema | Scelta | Impatto |
|------|--------|---------|
| Scarico magazzino | Alla **conferma** | Resta il flusso attuale. Nessuno stato “impegnato”. |
| Documenti | **Fattura elettronica dall’ERP** (obiettivo) | Il modulo attuale resta registro interno. FatturaPA è un progetto a parte (SDI, dati azienda, P.IVA clienti). |
| Provvigioni | Maturano all’**incasso** (fattura pagata) | Implementato. Senza fattura pagata l’agente non matura nulla. Vendita diretta senza agente = 0. |

## FatturaPA — prossimo blocco (non iniziato)

Manca: partita IVA / codice fiscale azienda (il PDF placeholder è stato rimosso), codice destinatario/SDI, regime, numerazione fiscale vs `FAT-AAAA-NNNN` interno, P.IVA su 14/14 clienti, canale SDI o software del commercialista. **Non emettere il PDF attuale come fattura.**

## Modifiche applicate in questo audit (non distruttive)

1. PDF e UI fatture: copia gestionale, niente P.IVA fittizia.
2. Formula provvigioni in `src/lib/utils/commissions.ts` (unica fonte). Trigger: fattura → `pagata`.
3. Indice UNIQUE `products.sku` (3 SKU già univoci).
4. API create ordine agente: obbligo `cliente.agente = sé` (chiude IDOR). Admin invariato. **`--strict` non applicato.**

Rollback: `npm run pb:rules -- --restore scripts/.rules-backup-*.json`; indice SKU da Dashboard PB → products → Indexes.

## Test

- Dump schema/rules/counts su produzione: ok.
- Permessi automatizzati (`pb:test-permissions`): **non eseguiti su produzione** (lo script rifiuta URL remoti). Da lanciare su copia locale del backup.
- Nessun ordine reale da regressione. Il trigger provvigioni a `pagata` è cablato in `fatture/[id]` (`segnaPagata` + backfill in `onMount`).

## Decisioni ancora aperte (da soci)

| Tema | Opzioni | Impatto |
|------|---------|---------|
| Quota subagente | **Deciso: piramide inclusa.** Sub = % sull’imponibile tolta dal padre. Un livello. | Ruolo resta `agente` + `agente_padre`. |
| Piano versionato | Solo dopo il primo agente reale | Oggi % unica su `users.provvigione_percentuale`. |
| FatturaPA | Intermediario SDI / commercialista / software dedicato | Serve P.IVA azienda e P.IVA su tutti i clienti. |
| Assegnazione 14 clienti | Chi li gestisce finché non c’è un agente | Un agente nuovo oggi vedrebbe 0 clienti. |
| `--strict` | Dopo il deploy del frontend nuovo | Congela totali e commissioni liquidate lato API. |
| Inventory Don Orsino / Cristina | Creare giacenza 0 ora vs al primo carico | Conferma su quei SKU fallisce senza riga. |
