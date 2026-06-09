// app/api/adyen-report-status/route.js
//
// Dato un merchantReference e una data ordine, cerca lo stato nei report CSV
// salvati su Google Drive da Adyen (via webhook REPORT_AVAILABLE).
//
// Cerca su tutti i merchant account configurati in parallelo.
//
// Uso:
//   GET /api/adyen-report-status?merchantReference=SFDLEU00435249&date=2026-05-29
//   GET /api/adyen-report-status?merchantReference=SFDLEU00435249&date=2026-05-29&merchant=DELONGHI_EU
//
// Variabili d'ambiente:
//   ADYEN_MERCHANT_ACCOUNTS  — lista separata da virgola, es. "DELONGHI_EU,KENWOOD_EU,..."
//   GOOGLE_CLIENT_EMAIL
//   GOOGLE_PRIVATE_KEY

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

  const res = await fetch("https://oauth2.googleapis.com/token", {
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

// ── Cerca in un singolo merchant + data ──────────────────────────────────────
async function searchInReport(token, merchant, date, merchantRef) {
  const filename = `adyen_report_${merchant}_${date}.csv`;
  const fileId   = await findFileByName(token, filename);

  if (!fileId) return { merchant, date, filename, available: false };

  const csv   = await downloadFromDrive(token, fileId);
  const rows  = parseCSV(csv);
  const found = rows.filter(row => getMerchantRef(row) === merchantRef);

  return {
    merchant,
    date,
    filename,
    available:  true,
    totalRows:  rows.length,
    matchFound: found.length,
    events: found.map(row => ({
      merchant,
      date,
      eventType:     row["Type"]           || row["Record Type"] || row["type"] || "",
      status:        row["Status"]         || row["status"]      || "",
      amount:        row["Amount"]         || row["amount"]      || "",
      currency:      row["Currency"]       || row["currency"]    || "",
      pspReference:  row["Psp Reference"]  || row["PSP Reference"] || row["pspReference"] || "",
      paymentMethod: row["Payment Method"] || row["paymentMethod"] || "",
    })),
  };
}

// ── MAIN HANDLER ──────────────────────────────────────────────────────────────
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const merchantRef     = searchParams.get("merchantReference")?.trim();
  const orderDate       = searchParams.get("date")?.trim();
  const merchantFilter  = searchParams.get("merchant")?.trim(); // opzionale

  if (!merchantRef || !orderDate) {
    return Response.json({
      error:   "Parametri mancanti",
      example: "/api/adyen-report-status?merchantReference=SFDLEU00435249&date=2026-05-29",
    }, { status: 400 });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(orderDate)) {
    return Response.json({
      error: "Formato data non valido — usa YYYY-MM-DD",
    }, { status: 400 });
  }

  // Lista merchant da cercare
  const allMerchants = (process.env.ADYEN_MERCHANT_ACCOUNTS || "")
    .split(",")
    .map(m => m.trim())
    .filter(Boolean);

  if (allMerchants.length === 0) {
    return Response.json({
      error:   "ADYEN_MERCHANT_ACCOUNTS non configurato",
      message: "Aggiungi su Vercel: ADYEN_MERCHANT_ACCOUNTS=DELONGHI_EU,KENWOOD_EU,...",
    }, { status: 500 });
  }

  // Se merchant specifico passato come parametro, cerca solo quello
  const merchantsToSearch = merchantFilter
    ? allMerchants.filter(m => m === merchantFilter)
    : allMerchants;

  let googleToken;
  try {
    googleToken = await getGoogleToken();
  } catch (err) {
    return Response.json({
      error:   "Errore autenticazione Google",
      message: err.message,
    }, { status: 500 });
  }

  const dates = getDatesRange(orderDate);

  // Cerca in tutti i merchant × tutti i giorni — in parallelo
  const searchTasks = merchantsToSearch.flatMap(merchant =>
    dates.map(date => searchInReport(googleToken, merchant, date, merchantRef))
  );

  const results = await Promise.all(searchTasks);

  // Raccoglie tutti gli eventi trovati
  const allEvents = results
    .filter(r => r.available && r.matchFound > 0)
    .flatMap(r => r.events);

  // Stato più recente
  const currentEvent = allEvents[allEvents.length - 1] || null;
  const statusLabel  = currentEvent
    ? getStatusLabel(currentEvent.eventType || currentEvent.status)
    : null;

  // Summary per debug
  const reportSummary = results.map(r => ({
    merchant:   r.merchant,
    date:       r.date,
    available:  r.available,
    matchFound: r.matchFound || 0,
    totalRows:  r.totalRows  || 0,
    reason:     r.available ? undefined : "report non ancora ricevuto da Adyen",
    error:      r.error     || undefined,
  }));

  return Response.json({
    merchantReference: merchantRef,
    orderDate,
    merchantsSearched: merchantsToSearch,
    searchRange:       { from: dates[0], to: dates[dates.length - 1], days: dates.length },
    found:             allEvents.length > 0,
    foundOnMerchant:   currentEvent?.merchant || null,
    currentStatus:     currentEvent ? (currentEvent.eventType || currentEvent.status) : null,
    statusLabel,
    totalEvents:       allEvents.length,
    events:            allEvents,
    reportSummary,
  });
}
