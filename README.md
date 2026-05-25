# Adyen API Debugger

Next.js app da deployare su Vercel per testare l'autenticazione Adyen live.

## Setup rapido

### 1. Pusha su GitHub
```bash
git init
git add .
git commit -m "init"
git remote add origin https://github.com/TUO_USERNAME/adyen-debug.git
git push -u origin main
```

### 2. Deploy su Vercel
1. Vai su [vercel.com](https://vercel.com) → **Add New Project**
2. Importa il repo GitHub `adyen-debug`
3. Framework: **Next.js** (rilevato automaticamente)
4. Vai su **Settings → Environment Variables** e aggiungi:

| Nome | Valore |
|------|--------|
| `ADYEN_API_KEY` | La tua API key dal CA **live** |
| `ADYEN_LIVE_URL_PREFIX` | Es. `xxxxxxxxx-DelonghiUS` |
| `ADYEN_MERCHANT_ACCOUNT` | Es. `DelonghiUS` |

5. **Redeploy** dopo aver aggiunto le variabili.

### 3. Esegui i test
Apri l'URL Vercel nel browser e clicca **"Esegui tutti i test"**.

Oppure chiama direttamente l'API:
```bash
curl https://tuo-progetto.vercel.app/api/adyen-debug
```

## Test eseguiti
1. `Management API GET /me` — verifica autenticazione e ruoli
2. `PAL Live /authorise` — probe autenticazione endpoint PAL
3. `Checkout Live /payments` — probe autenticazione endpoint Checkout
4. `Management API /companies/{id}/merchants` — lista merchant del company
5. `Fund API /accountHolderTransactionList` — solo Adyen Platforms

## ⚠️ Nota importante sulle API key
Le API key di **test** e **live** sono completamente separate.
Se ricevi 401, la causa più comune è usare una chiave test su endpoint live.
Rigenera la chiave da `ca-live.adyen.com` → Developers → API credentials.
