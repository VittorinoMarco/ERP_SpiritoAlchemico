# PocketBase Schema

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
