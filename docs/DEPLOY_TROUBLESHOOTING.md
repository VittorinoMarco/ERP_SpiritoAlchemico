# Troubleshooting Deploy

## CSS non carica / pagina senza stili

Se il sito online appare senza stili (font default, nessun colore):

1. **Verifica che GitHub Secret `VITE_PB_URL` sia impostato**  
   Repository → Settings → Secrets and variables → Actions → `VITE_PB_URL` = `https://spiritoalchemico.marcovittorino.com` (o l’URL della tua PocketBase).  
   Il workflow lo usa per impostare `PUBLIC_POCKETBASE_URL` durante il build.

2. **Controlla la struttura sul server**  
   Dopo il deploy, su `/var/www/erp/` devono esserci:
   - `index.html`
   - `_app/` (con sottocartelle `immutable/`, ecc.)

3. **Configurazione Nginx**  
   Usa `deploy/nginx.conf.example` come riferimento.  
   La root deve essere `/var/www/erp` e la `location /` deve servire i file statici.

4. **Verifica asset**  
   Apri `https://tuodominio.com/_app/immutable/assets/` e controlla che i file CSS siano caricabili (es. `.css`).

5. **App in sottocartella**  
   Se l’app è in `/erp/` usa:
   ```bash
   BASE_PATH=/erp/ pnpm build
   ```

## Credenziali non valide al login

1. **Secret `VITE_PB_URL`**  
   Deve puntare all’URL dell’API PocketBase (es. `https://spiritoalchemico.marcovittorino.com`).

2. **PocketBase sullo stesso dominio**  
   Nginx deve fare proxy di `/api/` verso PocketBase (es. `proxy_pass http://127.0.0.1:8090/`).

3. **Utente creato**  
   Verifica che l’utente esista nella collection `users` di PocketBase.

4. **CORS**  
   PocketBase deve accettare richieste dal dominio dell’app (di solito già configurato).
