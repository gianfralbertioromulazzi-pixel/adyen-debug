// lib/sheets.js
//
// Client Google Sheets condiviso tra webhook receiver e API di lettura.
// Usa le stesse credenziali Service Account già configurate su Vercel.
//
// Variabili d'ambiente richieste:
//   GOOGLE_PROJECT_ID    — es. "delonghi-adyen-prod"
//   GOOGLE_CLIENT_EMAIL  — es. "adyen-webhook-writer@...iam.gserviceaccount.com"
//   GOOGLE_PRIVATE_KEY   — chiave privata completa con \n
//   GOOGLE_SHEET_ID      — ID del foglio dall'URL di Google Sheets

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

// ── Genera JWT access token via Google OAuth2 ─────────────────────────────────
// Usiamo fetch diretto senza dipendenze extra — funziona su Vercel serverless
async function getAccessToken() {
  const privateKey  = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL || "";

  if (!privateKey || !clientEmail) {
    throw new Error("GOOGLE_CLIENT_EMAIL o GOOGLE_PRIVATE_KEY mancanti");
  }

  const now     = Math.floor(Date.now() / 1000);
  const payload = {
    iss:   clientEmail,
    scope: SCOPES.join(" "),
    aud:   "https://oauth2.googleapis.com/token",
    iat:   now,
    exp:   now + 3600,
  };

  // Firma JWT con la chiave privata RSA
  const header  = { alg: "RS256", typ: "JWT" };
  const b64     = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const signing = `${b64(header)}.${b64(payload)}`;

  // Importa la chiave RSA tramite Web Crypto API (disponibile in Node 18+)
  const keyData = privateKey
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");

  const cryptoKey = await globalThis.crypto.subtle.importKey(
    "pkcs8",
    Buffer.from(keyData, "base64"),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await globalThis.crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    Buffer.from(signing)
  );

  const jwt = `${signing}.${Buffer.from(signature).toString("base64url")}`;

  // Scambia JWT per access token
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion:  jwt,
    }),
  });

  const data = await res.json();
  if (!data.access_token) {
    throw new Error(`Token error: ${JSON.stringify(data)}`);
  }
  return data.access_token;
}

// ── Header riga (prima riga del foglio) ───────────────────────────────────────
export const SHEET_HEADERS = [
  "merchantReference",
  "pspReference",
  "eventCode",
  "status",
  "success",
  "amount",
  "currency",
  "paymentMethod",
  "merchantAccount",
  "eventDate",
  "receivedAt",
];

// ── Assicura che la prima riga abbia gli header ───────────────────────────────
export async function ensureHeaders(sheetId, token) {
  const range = "adyen-transaction-status!A1:K1";
  const url   = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}`;

  const res  = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();

  // Se la prima riga è vuota o manca, scrive gli header
  if (!data.values || data.values[0]?.[0] !== "merchantReference") {
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?valueInputOption=RAW`,
      {
        method:  "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body:    JSON.stringify({ values: [SHEET_HEADERS] }),
      }
    );
  }
}

// ── Aggiunge una riga in fondo al foglio ──────────────────────────────────────
export async function appendRow(values) {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) throw new Error("GOOGLE_SHEET_ID mancante");

  const token = await getAccessToken();
  await ensureHeaders(sheetId, token);

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/adyen-transaction-status!A:K:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;

  const res = await fetch(url, {
    method:  "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body:    JSON.stringify({ values: [values] }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Sheets append error: ${JSON.stringify(err)}`);
  }
  return res.json();
}

// ── Legge tutte le righe del foglio ──────────────────────────────────────────
export async function readAllRows() {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) throw new Error("GOOGLE_SHEET_ID mancante");

  const token = await getAccessToken();
  const url   = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/adyen-transaction-status!A:K`;

  const res  = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();

  if (!data.values || data.values.length <= 1) return [];

  // Prima riga = header, resto = dati
  const [headers, ...rows] = data.values;
  return rows.map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] || null; });
    return obj;
  });
}

// ── Stato leggibile da eventCode + success ────────────────────────────────────
export function deriveStatus(eventCode, success) {
  if (!success) return `${eventCode}_FAILED`;
  const map = {
    AUTHORISATION:                  "Authorised",
    CAPTURE:                        "Captured",
    CAPTURE_FAILED:                 "Capture Failed",
    CANCELLATION:                   "Cancelled",
    REFUND:                         "Refunded",
    REFUND_FAILED:                  "Refund Failed",
    SETTLEMENT_PROCESSING_COMPLETE: "Settled",
    CHARGEBACK:                     "Chargeback",
    CHARGEBACK_REVERSED:            "Chargeback Reversed",
    NOTIFICATION_OF_FRAUD:          "Fraud Notification",
  };
  return map[eventCode] || eventCode;
}
