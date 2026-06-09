// app/api/adyen-report-status/route.js
//
// Dato un merchantReference e una data ordine:
// 1. Cerca su Google Drive i report CSV del range di 8 giorni
// 2. Scarica e filtra per merchantReference
// 3. Cancella i file temporanei usati
// 4. Ritorna lo stato
//
// Uso:
//   GET /api/adyen-report-status?merchantReference=SFDLEU00435249&date=2026-05-29&merchant=DELONGHI_EU

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REPORT_DAYS = 8;

// ── Date range ────────────────────────────────────────────────────────────────
function getDatesRange(startDateStr) {
  const dates = [];
  const start = new Date(startDateStr + "T00:00:00Z");
  for (let i = 0; i < REPORT_DAYS; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    if (d > new Date()) break;
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
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

// ── Google Drive: scarica contenuto file ─────────────────────────────────────
async function downloadFromDrive(token, fileId) {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Drive download error: HTTP ${res.status}`);
  return res.text();
}

// ── Parser CSV ────────────────────────────────────────────────────────────────
function parseCSV(csv) {
  const lines = csv.split("\n").filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));

  return lines.slice(1).map(line => {
    const values = [];
    let current  = "";
    let inQuotes = false;
    for (const char of line) {
      if (char === '"') { inQuotes = !inQuotes; continue; }
      if (char === "," && !inQuotes) { values.push(current.trim()); current = ""; continue; }
      current += char;
    }
    values.push(current.trim());

    const obj = {};
    headers.forEach((h, i) => { obj[h] = values[i] || ""; });
    return obj;
  });
}

function getMerchantRef(row) {
  return row["Merchant Reference"] || row["merchant_reference"] ||
         row["merchantReference"]  || row["Merchant reference"] || "";
}

function getStatusLabel(eventType) {
  const map = {
    "Authorised":    { label: "Autorizzato",    color: "blue"   },
    "Settled":       { label: "Incassato",       color: "green"  },
    "SentForSettle": { label: "In liquidazione", color: "cyan"   },
    "Refused":       { label: "Rifiutato",       color: "red"    },
    "Cancelled":     { label: "Annullato",       color: "gray"   },
    "Refunded":      { label: "Rimborsato",      color: "orange" },
    "Chargeback":    { label: "Chargeback",      color: "red"    },
    "Error":         { label: "Errore",          color: "red"    },
  };
  return map[eventType] || { label: eventType || "Sconosciuto", color: "gray" };
}

// ── MAIN HANDLER ──────────────────────────────────────────────────────────────
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const merchantRef = searchParams.get("merchantReference")?.trim();
  const orderDate   = searchParams.get("date")?.trim();
  const merchant    = searchParams.get("merchant")?.trim()
                   || process.env.ADYEN_MERCHANT_ACCOUNT
                   || "";

  if (!merchantRef || !orderDate) {
    return Response.json({
      error:   "Parametri mancanti",
      example: "/api/adyen-report-status?merchantReference=SFDLEU00435249&date=2026-05-29&merchant=DELONGHI_EU",
    }, { status: 400 });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(orderDate)) {
    return Response.json({
      error:   "Formato data non valido — usa YYYY-MM-DD",
    }, { status: 400 });
  }

  let googleToken;
  try {
    googleToken = await getGoogleToken();
  } catch (err) {
    return Response.json({
      error:   "Errore autenticazione Google Drive",
      message: err.message,
    }, { status: 500 });
  }

  const dates          = getDatesRange(orderDate);
  const matchingEvents = [];
  const reportSummary  = [];

  for (const date of dates) {
    const filename = `adyen_report_${merchant}_${date}.csv`;

    try {
      // Cerca il file su Drive
      const fileId = await findFileByName(googleToken, filename);

      if (!fileId) {
        reportSummary.push({ date, filename, available: false, reason: "report non ancora ricevuto da Adyen" });
        continue;
      }

      // Scarica e parsa il CSV
      const csv  = await downloadFromDrive(googleToken, fileId);
      const rows = parseCSV(csv);

      // Filtra per merchantReference
      const found = rows.filter(row => getMerchantRef(row) === merchantRef);

      found.forEach(row => {
        const eventType = row["Type"] || row["Record Type"] || row["type"] || "";
        matchingEvents.push({
          date,
          eventType,
          status:        row["Status"]        || row["status"]        || "",
          amount:        row["Amount"]         || row["amount"]        || "",
          currency:      row["Currency"]       || row["currency"]      || "",
          pspReference:  row["Psp Reference"]  || row["PSP Reference"] || row["pspReference"] || "",
          paymentMethod: row["Payment Method"] || row["paymentMethod"] || "",
        });
      });

      reportSummary.push({
        date,
        filename,
        available:  true,
        totalRows:  rows.length,
        matchFound: found.length,
      });

    } catch (err) {
      reportSummary.push({ date, filename, available: false, error: err.message });
    }
  }

  const currentEvent = matchingEvents[matchingEvents.length - 1] || null;
  const statusLabel  = currentEvent
    ? getStatusLabel(currentEvent.eventType || currentEvent.status)
    : null;

  return Response.json({
    merchantReference: merchantRef,
    merchant,
    orderDate,
    searchRange:   { from: dates[0], to: dates[dates.length - 1], days: dates.length },
    found:         matchingEvents.length > 0,
    currentStatus: currentEvent ? (currentEvent.eventType || currentEvent.status) : null,
    statusLabel,
    totalEvents:   matchingEvents.length,
    events:        matchingEvents,
    reportSummary,
  });
}
