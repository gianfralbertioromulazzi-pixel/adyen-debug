// app/api/adyen-report-status/route.js
//
// Dato un merchantReference e una data ordine:
// 1. Scarica il report CSV Adyen per ogni giorno (8 giorni a partire dalla data)
// 2. Carica il CSV su Google Drive come file temporaneo
// 3. Filtra per merchantReference
// 4. Cancella il file da Google Drive
// 5. Ritorna lo stato trovato
//
// Uso:
//   GET /api/adyen-report-status?merchantReference=SFDLEU00435249&date=2026-05-29
//
// Variabili d'ambiente:
//   ADYEN_REPORT_USERNAME   — es. "report@Company.DelonghiUS"
//   ADYEN_REPORT_PASSWORD   — password Basic Auth della credential Report
//   ADYEN_MERCHANT_ACCOUNT  — es. "DelonghiUS"
//   GOOGLE_CLIENT_EMAIL     — service account email
//   GOOGLE_PRIVATE_KEY      — service account private key

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
    // Non includere date future
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

// ── Google Drive: carica file temporaneo ─────────────────────────────────────
async function uploadToDrive(token, filename, csvContent) {
  const metadata = JSON.stringify({ name: filename, mimeType: "text/csv" });
  const boundary = "boundary_adyen_report";

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

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
    {
      method:  "POST",
      headers: {
        Authorization:  `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );

  const data = await res.json();
  if (!data.id) throw new Error(`Drive upload error: ${JSON.stringify(data)}`);
  return data.id;
}

// ── Google Drive: cancella file ───────────────────────────────────────────────
async function deleteFromDrive(token, fileId) {
  await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method:  "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

// ── Scarica report CSV da Adyen ───────────────────────────────────────────────
async function downloadReport(merchant, dateStr, username, password) {
  const dateFmt = dateStr.replace(/-/g, "_");
  const url     = `https://ca-live.adyen.com/reports/download/MerchantAccount/${merchant}/payments_accounting_report_${dateFmt}.csv`;
  const auth    = Buffer.from(`${username}:${password}`).toString("base64");

  const res = await fetch(url, {
    headers: { Authorization: `Basic ${auth}` },
  });

  if (res.status === 404) return null; // report non ancora disponibile
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status} per ${dateStr}: ${text.slice(0, 200)}`);
  }

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
    "Authorised":       { label: "Autorizzato",     color: "blue"   },
    "Settled":          { label: "Incassato",        color: "green"  },
    "SentForSettle":    { label: "In liquidazione",  color: "cyan"   },
    "Refused":          { label: "Rifiutato",        color: "red"    },
    "Cancelled":        { label: "Annullato",        color: "gray"   },
    "Refunded":         { label: "Rimborsato",       color: "orange" },
    "Chargeback":       { label: "Chargeback",       color: "red"    },
    "Error":            { label: "Errore",           color: "red"    },
  };
  return map[eventType] || { label: eventType || "Sconosciuto", color: "gray" };
}

// ── MAIN HANDLER ──────────────────────────────────────────────────────────────
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const merchantRef = searchParams.get("merchantReference")?.trim();
  const orderDate   = searchParams.get("date")?.trim();

  if (!merchantRef || !orderDate) {
    return Response.json({
      error:   "Parametri mancanti",
      example: "/api/adyen-report-status?merchantReference=SFDLEU00435249&date=2026-05-29",
    }, { status: 400 });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(orderDate)) {
    return Response.json({
      error:   "Formato data non valido",
      message: "Usa il formato YYYY-MM-DD",
    }, { status: 400 });
  }

  const username = process.env.ADYEN_REPORT_USERNAME  || "";
  const password = process.env.ADYEN_REPORT_PASSWORD  || "";
  const merchant = process.env.ADYEN_MERCHANT_ACCOUNT || "";

  if (!username || !password || !merchant) {
    return Response.json({
      error:  "Variabili d'ambiente mancanti",
      needed: ["ADYEN_REPORT_USERNAME", "ADYEN_REPORT_PASSWORD", "ADYEN_MERCHANT_ACCOUNT"],
    }, { status: 500 });
  }

  const dates          = getDatesRange(orderDate);
  const matchingEvents = [];
  const reportSummary  = [];
  let   googleToken    = null;

  // Ottieni token Google una volta sola
  try {
    googleToken = await getGoogleToken();
  } catch (err) {
    console.warn("[report] Google Drive non disponibile:", err.message);
  }

  for (const date of dates) {
    let driveFileId = null;
    try {
      // 1. Scarica CSV da Adyen
      const csv = await downloadReport(merchant, date, username, password);

      if (!csv) {
        reportSummary.push({ date, available: false, reason: "report non ancora generato" });
        continue;
      }

      // 2. Carica su Google Drive (temporaneo)
      if (googleToken) {
        const filename = `adyen_temp_${merchant}_${date}_${Date.now()}.csv`;
        driveFileId    = await uploadToDrive(googleToken, filename, csv);
      }

      // 3. Parsa e filtra per merchantReference
      const rows   = parseCSV(csv);
      const found  = rows.filter(row => getMerchantRef(row) === merchantRef);

      found.forEach(row => {
        const eventType = row["Type"] || row["type"] || row["Event"] || row["Record Type"] || "";
        matchingEvents.push({
          date,
          eventType,
          status:        row["Status"]         || row["status"]        || "",
          amount:        row["Amount"]          || row["amount"]        || "",
          currency:      row["Currency"]        || row["currency"]      || "",
          pspReference:  row["Psp Reference"]   || row["pspReference"]  || row["PSP Reference"] || "",
          paymentMethod: row["Payment Method"]  || row["paymentMethod"] || "",
        });
      });

      reportSummary.push({
        date,
        available:  true,
        totalRows:  rows.length,
        matchFound: found.length > 0,
        driveFileId,
      });

    } catch (err) {
      reportSummary.push({ date, available: false, error: err.message });
    } finally {
      // 4. Cancella il file da Google Drive
      if (googleToken && driveFileId) {
        try {
          await deleteFromDrive(googleToken, driveFileId);
        } catch (err) {
          console.warn("[report] Errore cancellazione Drive:", err.message);
        }
      }
    }
  }

  // Stato più recente = ultimo evento trovato
  const currentEvent = matchingEvents[matchingEvents.length - 1] || null;
  const statusLabel  = currentEvent
    ? getStatusLabel(currentEvent.eventType || currentEvent.status)
    : null;

  return Response.json({
    merchantReference: merchantRef,
    orderDate,
    searchRange: { from: dates[0], to: dates[dates.length - 1], days: dates.length },
    found:       matchingEvents.length > 0,
    currentStatus: currentEvent ? (currentEvent.eventType || currentEvent.status) : null,
    statusLabel,
    totalEvents:   matchingEvents.length,
    events:        matchingEvents,
    reportSummary,
  });
}
