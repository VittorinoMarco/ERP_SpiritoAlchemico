# PocketBase Schema

## Collection `orders`

Per supportare l'IVA sugli ordini, aggiungi questi campi se mancano:

| Campo | Tipo | Note |
|-------|------|------|
| **totale_imponibile** | number | Imponibile (senza IVA) |
| **iva** | number | Importo IVA |
| **iva_percentuale** | number | Opzionale – aliquota usata (es. 22) |

1. PocketBase Admin → Collections → orders
2. Aggiungi **totale_imponibile** (number, opzionale)
3. Aggiungi **iva** (number, opzionale)
4. Opzionale: **iva_percentuale** (number)

### Collection `order_items`

L'app si aspetta un campo relation verso **products**. Il nome può essere `prodotto` o `product`.

| Campo | Tipo | Note |
|-------|------|------|
| ordine | relation | → orders |
| **prodotto** (o **product**) | relation | → products, obbligatorio |
| quantita | number | |
| prezzo_unitario | number | |
| sconto_percentuale | number | opzionale |
| totale_riga | number | |

**Se le righe mostrano "—" e Conferma ordine dà errore:**
1. PocketBase Admin → Collections → **order_items** → Schema
2. Verifica che esista un campo relation verso `products` (nome `prodotto` o `product`)
3. Verifica che ogni record abbia un ID valido in quel campo (non `0` o vuoto)
4. Se i record sono corrotti, modificali manualmente o ricrea l'ordine da "Nuovo ordine"

---

## Collection `invoices`

Per il modulo Fatture, assicurati che la collection `invoices` abbia i seguenti campi:

| Campo | Tipo | Note |
|-------|------|------|
| numero_fattura | text | Es. FAT-1234567890 |
| ordine | relation | → orders (opzionale) |
| cliente | relation | → clients |
| data_emissione | date | |
| data_scadenza | date | |
| **data_pagamento** | date | **Aggiungi se manca** – usato quando stato = pagata |
| totale_imponibile | number | |
| iva | number | |
| totale | number | |
| stato | select | Opzioni: `emessa`, `pagata` |

### Aggiungere `data_pagamento`

1. Apri PocketBase Admin (http://127.0.0.1:8090/_/)
2. Vai su Collections → invoices
3. Aggiungi campo: **data_pagamento**, tipo **date**, opzionale

---

## Collection `users` (per Agenti)

Aggiungi il campo per la percentuale provvigione:

| Campo | Tipo | Note |
|-------|------|------|
| **provvigione_percentuale** | number | **Aggiungi se manca** – percentuale default (es. 5) |

---

## Collection `agent_commissions`

Crea la collection per le provvigioni:

| Campo | Tipo | Note |
|-------|------|------|
| agente | relation | → users |
| ordine | relation | → orders |
| totale_ordine | number | |
| percentuale | number | |
| importo | number | |
| stato | select | Opzioni: `maturata`, `liquidata` |
| data_maturata | date | |
| data_liquidazione | date | Opzionale |

### Creare la collection

1. PocketBase Admin → Collections → New collection: **agent_commissions**
2. Aggiungi i campi come da tabella sopra

### Se ricevi 400 su agent_commissions con expand/sort

L'app usa `expand=agente,ordine` e `sort=-data_maturata`. Un 400 può dipendere da:

- **Nomi campi**: `agente` e `ordine` devono essere esattamente così (relation). `data_maturata` deve esistere (date).
- **API Rules**: Le collection `users` e `orders` devono permettere la lettura dei record espansi (List/View) all’utente loggato.
- **Fallback**: L’app gestisce il fallimento e riprova senza expand/sort; gli agenti e le provvigioni vengono comunque mostrati (nomi arricchiti lato client).

---

## Collection `expenses` (Uscite / note spese)

Registra le **uscite** con tipo temporale, **imponibile** (campo `importo`), **IVA** separata, allegato opzionale e collegamento al magazzino per evitare doppia contabilità.

### Campi

| Campo | Tipo | Obbligatorio | Note |
|-------|------|--------------|------|
| **tipo** | select | sì | Valori esatti: `immediata`, `programmata`, `futura` |
| **data_spesa** | date | sì | Data di competenza o scadenza prevista (`YYYY-MM-DD`) |
| **importo** | number | sì | **Imponibile** totale (senza IVA), in euro (≥ 0) |
| **iva_importo** | number | no | Importo IVA in euro (es. totale IVA a 22% dalla fattura fornitore) |
| **origine** | select | no | `manuale`, `acquisto_magazzino`, `fattura_fornitore` — impostato dall’app quando il carico nasce da Magazzino |
| **numero_documento** | text | no | Es. `P043/2026`, ordine di acquisto |
| **movimenti_collegati** | json | no | Array di ID stringa: `inventory_movements` generati insieme a questa uscita (anti doppio) |
| descrizione | text | no | Es. fornitore o voce di costo |
| categoria | text | no | Es. Utenze, Marketing, **Magazzino / Fornitore** |
| note | text | no | Note libere |
| **allegato** | file | no | Un solo file: PDF o immagine (scontrino/fattura). Max ~5 MB consigliati |
| **completata** | bool | no | Default `false`. Per `programmata` / `futura`: segna quando è stata pagata/sostenuta. Le **immediate** in app sono sempre considerate registrate |
| **creato_da** | relation → `users` | no | Opzionale: utente che ha creato la riga (l’app lo invia in creazione) |

### Fattura fornitore (liquido + accise + contrassegni)

Su fatture tipo **Gruppo Alchemico** o simili, ogni SKU ha righe separate (merce, **Accisa**, **Contrassegni**). L’**imponibile unitario** del prodotto è la somma per bottiglia delle tre voci; l’**imponibile riga** = quella somma × quantità. L’**IVA** (es. 22%) è sul totale imponibile documento. L’app (pagina Magazzino → **Fattura fornitore**) usa l’AI su testo estratto dal PDF per ricostruire le righe; **verifica sempre** totali e abbinamento prodotti anagrafica.

### Collection `inventory_movements` — campo opzionale

| Campo | Tipo | Note |
|-------|------|------|
| **expense_id** | relation → `expenses` | Opzionale. Se presente, il movimento è parte dell’uscita collegata (carico da acquisto/fornitore). |

Se il campo non esiste, l’app funziona comunque usando solo `movimenti_collegati` sulla spesa.

### Creazione in PocketBase

1. Admin → **Collections** → **New collection** → nome: **`expenses`** (type: Base).
2. Aggiungi i campi come in tabella (per **tipo** crea le 3 opzioni select senza spazi extra).
3. **API Rules** (esempio solo utenti autenticati admin — adatta al tuo schema `ruolo`):

   - **List / Search**: `@request.auth.id != "" && (@request.auth.ruolo = "admin" || @request.auth.role = "admin")`
   - **View**: stessa condizione
   - **Create**: stessa condizione
   - **Update**: stessa condizione
   - **Delete**: stessa condizione  

   Se non usi `ruolo` sul record auth, puoi usare temporaneamente `@request.auth.id != ""` e restringere in seguito.

4. Sul campo **allegato**: in **Options** attiva “**Only for admins**” solo se vuoi limitare chi scarica il file; altrimenti lascia visibile agli utenti che passano le View rules.

### Indice / performance

Opzionale: indice su `data_spesa` e `tipo` per liste filtrate.

---

## Collection `ai_chat_sessions` (Assistente AI)

Lo storico chat **/assistente** è salvato su PocketBase (non più in localStorage).

### Campi

| Campo | Tipo | Obbligatorio | Note |
|-------|------|--------------|------|
| **utente** | relation | sì | → `users` (proprietario della sessione) |
| **titolo** | text | sì | Es. prima domanda troncata o «Nuova chat» |
| **messaggi** | json | sì | Array: `[{ "role": "user" \| "assistant", "content": "..." }]` |

Abilita **Created / Updated** sulla collection per ordinare per `-updated` (l’app usa `sort: '-updated'`).

### Creazione

1. Admin → **Collections** → **New collection** → nome esatto: **`ai_chat_sessions`**
2. Aggiungi i campi come sopra (`messaggi` tipo **JSON**).
3. **API Rules** (ogni utente solo le proprie sessioni):

```
List/Search: @request.auth.id != "" && utente = @request.auth.id
View:        @request.auth.id != "" && utente = @request.auth.id
Create:      @request.auth.id != "" && utente = @request.auth.id
Update:      @request.auth.id != "" && utente = @request.auth.id
Delete:      @request.auth.id != "" && utente = @request.auth.id
```

4. In **Create**, se PocketBase non permette di impostare `utente` dal client, usa una regola **Create** del tipo:  
   `@request.auth.id != ""`  
   e un **hook** o campo **default** — in alternativa l’app invia sempre `utente: id` del modello auth; la rule `utente = @request.auth.id` obbliga che coincida.

### Migrazione da browser

Le vecchie chat in **localStorage** (chiave `erp_spirito_assistant_sessions_v1`) non vengono importate automaticamente: puoi ignorarle o copiare a mano.

---

## Collection `activity_log`

Per notifiche e registro attività:

| Campo | Tipo | Note |
|-------|------|------|
| utente | relation | → users (opzionale, vuoto per webhook) |
| azione | text | creato, confermato, stato_cambiato, fattura_generata, webhook_ecommerce, movimento_magazzino, login |
| collection_rif | text | orders, users, inventory_movements |
| record_rif | text | ID record correlato |
| dettagli | text | JSON con messaggio e altri dati |

### Creare la collection

1. PocketBase Admin → Collections → New collection: **activity_log**
2. Aggiungi i campi come da tabella sopra

---

## Backup API Server

Per la pagina Sistema (/impostazioni/sistema), avvia il server backup:

```bash
node server/backup.js
# oppure: npm run backup
```

Variabili d'ambiente:
- `POCKETBASE_URL` - URL PocketBase (default: http://127.0.0.1:8090)
- `POCKETBASE_ADMIN_EMAIL` / `POCKETBASE_ADMIN_PASSWORD` - credenziali admin superuser
- `BACKUP_PORT` - porta (default: 3002)
- `BACKUP_API_SECRET` - opzionale, per autenticazione alternativa

Nginx: `location /api/backups { proxy_pass http://127.0.0.1:3002; }`
