// app/api/webhooks/adyen/route.js
//
// Riceve webhook REPORT_AVAILABLE da Adyen.
// Gestisce SOLO i report che ci interessano per il monitoring stati pagamento:
//   - received_payments_report  (arriva regolarmente — fonte primaria)
//   - payments_accounting_report (se Adyen inizia a mandarlo — fonte secondaria)
//
// Scarica il CSV dall'URL nel campo "reason" e lo salva su Google Drive.
// In caso di errore, logga l'URL su Google Sheets per debug.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { createHmac } from "crypto";
import { appendRow }  from "@/lib/sheets";

// Report che vogliamo intercettare — il nome file (pspReference) li identifica
const RELEVANT_REPORT_PREFIXES = [
  "received_payments_report",
  "payments_accounting_report",
];

function verifyHmac(item, hmacKey) {
  if (!hmacKey) return true;
  try {
    const {
      pspReference, originalReference, merchantAccountCode,
      merchantReference, eventDate, eventCode, success,
      amount: { value: amountValue, currency } = {},
    } = item;
    const data = [
      pspReference || "", originalReference || "", merchantAccountCode || "",
      merchantReference || "", eventDate || "", eventCode || "",
      success || "", amountValue || "", currency || "",
    ].join(":");
    const hmac     = createHmac("sha256", Buffer.from(hmacKey, "hex"));
    const expected = hmac.update(data).digest("base64");
    const received = item.additionalData?.hmacSignature || "";
    return expected === received;
  } catch { return false; }
}

async function getGoogleToken() {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL || "";
  const privateKey  = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  const now         = Math.floor(Date.now() / 1000);
  const payload     = {
    iss: clientEmail, scope: "https://www.googleapis.com/auth/drive.file",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  };
  const b64     = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const signing = `${b64({ alg: "RS256", typ: "JWT" })}.${b64(payload)}`;
  const keyData = privateKey
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    "pkcs8", Buffer.from(keyData, "base64"),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]
  );
  const signature = await globalThis.crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", cryptoKey, Buffer.from(signing)
  );
  const jwt = `${signing}.${Buffer.from(signature).toString("base64url")}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Google token error: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function findFileByName(token, filename) {
  const q   = `name='${filename}' and trashed=false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  return data.files?.[0]?.id || null;
}

async function uploadToDrive(token, filename, csvContent) {
  const boundary = "boundary_adyen_report";
  const metadata = JSON.stringify({ name: filename, mimeType: "text/csv" });
  const body = [
    `--${boundary}`, "Content-Type: application/json; charset=UTF-8", "", metadata,
    `--${boundary}`, "Content-Type: text/csv", "", csvContent, `--${boundary}--`,
  ].join("\r\n");
  const existingId = await findFileByName(token, filename);
  const url    = existingId
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=multipart`
    : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
  const res  = await fetch(url, {
    method: existingId ? "PATCH" : "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  const data = await res.json();
  if (!data.id) throw new Error(`Drive upload error: ${JSON.stringify(data)}`);
  return data.id;
}

async function downloadReportFromUrl(reportUrl, username, password) {
  const auth = Buffer.from(`${username}:${password}`).toString("base64");
  const res  = await fetch(reportUrl, { headers: { Authorization: `Basic ${auth}` } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.text();
}

// Identifica il TIPO di report dal nome file (pspReference contiene il filename)
function getReportType(pspReference) {
  for (const prefix of RELEVANT_REPORT_PREFIXES) {
    if (pspReference?.startsWith(prefix)) return prefix;
  }
  return null;
}

function extractDateFromFilename(pspReference) {
  const match = pspReference?.match(/(\d{4}_\d{2}_\d{2})/);
  return match ? match[1].replace(/_/g, "-") : new Date().toISOString().slice(0, 10);
}

export async function POST(request) {
  let body;
  try { body = await request.json(); }
  catch { return new Response("Bad Request", { status: 400 }); }

  const items   = body?.notificationItems || [];
  const hmacKey = process.env.ADYEN_WEBHOOK_HMAC_KEY || "";

  for (const wrapper of items) {
    const item = wrapper?.NotificationRequestItem;
    if (!item) continue;

    if (!verifyHmac(item, hmacKey)) {
      console.warn("[webhook] HMAC failed:", item.pspReference);
      continue;
    }

    if (item.eventCode !== "REPORT_AVAILABLE") continue;

    const reportUrl    = item.reason || "";
    const merchantCode = item.merchantAccountCode || "";
    const pspReference = item.pspReference || "";

    // Filtra solo i report che ci interessano — ignora settlement, dispute, ecc.
    const reportType = getReportType(pspReference);
    if (!reportType) {
      console.log(`[webhook] Report ignorato (non rilevante): ${pspReference}`);
      continue;
    }

    if (!reportUrl) {
      console.warn("[webhook] REPORT_AVAILABLE senza URL in reason");
      continue;
    }

    const username = process.env.ADYEN_REPORT_USERNAME || "";
    const password = process.env.ADYEN_REPORT_PASSWORD || "";

    if (!username || !password) {
      console.error("[webhook] Credenziali report mancanti");
      continue;
    }

    try {
      console.log(`[webhook] Scarico ${reportType}: ${reportUrl}`);
      const csv         = await downloadReportFromUrl(reportUrl, username, password);
      const reportDate  = extractDateFromFilename(pspReference);
      // Nome file su Drive: adyen_received_DELONGHI_EU_2026-06-23.csv
      const shortType   = reportType === "received_payments_report" ? "received" : "accounting";
      const filename     = `adyen_${shortType}_${merchantCode}_${reportDate}.csv`;
      const googleToken = await getGoogleToken();
      const fileId      = await uploadToDrive(googleToken, filename, csv);
      console.log(`[webhook] Salvato su Drive: ${filename} (${fileId})`);

      // Log successo su Sheets (utile per monitorare la pipeline)
      try {
        await appendRow([
          new Date().toISOString(),
          "REPORT_SAVED",
          merchantCode,
          reportType,
          filename,
          "ok",
        ]);
      } catch {}

    } catch (err) {
      console.error("[webhook] Errore:", err.message);
      try {
        await appendRow([
          new Date().toISOString(),
          "REPORT_AVAILABLE_ERROR",
          merchantCode,
          pspReference,
          reportUrl,
          err.message,
        ]);
      } catch (logErr) {
        console.error("[webhook] Errore log:", logErr.message);
      }
    }
  }

  return new Response("[accepted]", {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

export async function GET() {
  return Response.json({
    status:   "ok",
    endpoint: "Adyen webhook receiver attivo",
    handles:  RELEVANT_REPORT_PREFIXES,
  });
}
