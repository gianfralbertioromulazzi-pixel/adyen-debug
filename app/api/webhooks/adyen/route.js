// app/api/webhooks/adyen/route.js
//
// Riceve tutti i webhook Adyen:
//   - REPORT_AVAILABLE → scarica CSV → salva su Google Drive
//   - Altri eventi     → ignora (non salviamo più su Sheets)
//
// Il CSV su Drive viene usato da /api/adyen-report-status per le ricerche.
// Ogni file ha nome: adyen_report_{merchantAccount}_{date}.csv
// Se esiste già un file con lo stesso nome, viene sovrascritto.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { createHmac } from "crypto";

// ── HMAC verification ─────────────────────────────────────────────────────────
function verifyHmac(item, hmacKey) {
  if (!hmacKey) return true;
  try {
    const {
      pspReference, originalReference, merchantAccountCode,
      merchantReference, eventDate, eventCode, success,
      amount: { value: amountValue, currency } = {},
    } = item;

    const data = [
      pspReference        || "",
      originalReference   || "",
      merchantAccountCode || "",
      merchantReference   || "",
      eventDate           || "",
      eventCode           || "",
      success             || "",
      amountValue         || "",
      currency            || "",
    ].join(":");

    const hmac     = createHmac("sha256", Buffer.from(hmacKey, "hex"));
    const expected = hmac.update(data).digest("base64");
    const received = item.additionalData?.hmacSignature || "";
    return expected === received;
  } catch {
    return false;
  }
}

// ── Google Drive: ottieni access token ───────────────────────────────────────
async function getGoogleToken() {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL || "";
  const privateKey  = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

  const now     = Math.floor(Date.now() / 1000);
  const payload = {
    iss:   clientEmail,
    scope: "https://www.googleapis.com/auth/drive.file",
    aud:   "https://oauth2.googleapis.com/token",
    iat:   now,
    exp:   now + 3600,
  };

  const b64     = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const signing = `${b64({ alg: "RS256", typ: "JWT" })}.${b64(payload)}`;

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

  const res  = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion:  jwt,
    }),
  });

  const data = await res.json();
  if (!data.access_token) throw new Error(`Google token error: ${JSON.stringify(data)}`);
  return data.access_token;
}

// ── Google Drive: cerca file per nome ────────────────────────────────────────
async function findFileByName(token, filename) {
  const q   = `name='${filename}' and trashed=false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  return data.files?.[0]?.id || null;
}

// ── Google Drive: carica o sovrascrivi file ───────────────────────────────────
async function uploadToDrive(token, filename, csvContent) {
  const boundary = "boundary_adyen_report";
  const metadata = JSON.stringify({ name: filename, mimeType: "text/csv" });

  const body = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    metadata,
    `--${boundary}`,
    "Content-Type: text/csv",
    "",
    csvContent,
    `--${boundary}--`,
  ].join("\r\n");

  // Cerca se esiste già un file con lo stesso nome → aggiorna invece di creare
  const existingId = await findFileByName(token, filename);

  let url;
  let method;

  if (existingId) {
    // Aggiorna file esistente
    url    = `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=multipart`;
    method = "PATCH";
  } else {
    // Crea nuovo file
    url    = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
    method = "POST";
  }

  const res = await fetch(url, {
    method,
    headers: {
      Authorization:  `Bearer ${token}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  const data = await res.json();
  if (!data.id) throw new Error(`Drive upload error: ${JSON.stringify(data)}`);
  return data.id;
}

// ── Scarica report CSV da URL Adyen ─────────────────────────────────────────
async function downloadReportFromUrl(reportUrl, username, password) {
  const auth = Buffer.from(`${username}:${password}`).toString("base64");
  const res  = await fetch(reportUrl, {
    headers: { Authorization: `Basic ${auth}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Download report HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  return res.text();
}

// ── Estrai data dal nome file report ─────────────────────────────────────────
// pspReference contiene il nome del file, es:
// payments_accounting_report_2026_06_08.csv
// payments_accounting_report_filtered_2026_06_07_2026_06_08_ABC123.csv
function extractDateFromFilename(pspReference) {
  const match = pspReference?.match(/(\d{4}_\d{2}_\d{2})/);
  return match ? match[1].replace(/_/g, "-") : new Date().toISOString().slice(0, 10);
}

// ── HANDLER PRINCIPALE ────────────────────────────────────────────────────────
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  const items   = body?.notificationItems || [];
  const hmacKey = process.env.ADYEN_WEBHOOK_HMAC_KEY || "";

  for (const wrapper of items) {
    const item = wrapper?.NotificationRequestItem;
    if (!item) continue;

    if (!verifyHmac(item, hmacKey)) {
      console.warn("[webhook] HMAC failed:", item.pspReference);
      continue;
    }

    // Gestisci solo REPORT_AVAILABLE
    if (item.eventCode !== "REPORT_AVAILABLE") continue;

    const reportUrl     = item.reason || "";
    const merchantCode  = item.merchantAccountCode || "";
    const pspReference  = item.pspReference || "";

    if (!reportUrl) {
      console.warn("[webhook] REPORT_AVAILABLE senza URL in reason");
      continue;
    }

    const username = process.env.ADYEN_REPORT_USERNAME || "";
    const password = process.env.ADYEN_REPORT_PASSWORD || "";

    if (!username || !password) {
      console.error("[webhook] ADYEN_REPORT_USERNAME o ADYEN_REPORT_PASSWORD mancanti");
      continue;
    }

    try {
      // 1. Scarica il CSV
      console.log(`[webhook] Scarico report: ${reportUrl}`);
      const csv = await downloadReportFromUrl(reportUrl, username, password);

      // 2. Costruisci nome file leggibile
      const reportDate = extractDateFromFilename(pspReference);
      const filename   = `adyen_report_${merchantCode}_${reportDate}.csv`;

      // 3. Salva su Google Drive
      const googleToken = await getGoogleToken();
      const fileId      = await uploadToDrive(googleToken, filename, csv);

      console.log(`[webhook] Report salvato su Drive: ${filename} (${fileId})`);
    } catch (err) {
      console.error("[webhook] Errore gestione REPORT_AVAILABLE:", err.message);
    }
  }

  // Adyen richiede [accepted] obbligatoriamente
  return new Response("[accepted]", {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

export async function GET() {
  return Response.json({
    status:   "ok",
    endpoint: "Adyen webhook receiver attivo",
    handles:  ["REPORT_AVAILABLE"],
  });
}
