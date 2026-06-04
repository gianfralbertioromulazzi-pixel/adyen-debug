// app/api/adyen-report-status/route.js
//
// Cerca lo stato di un pagamento nei report Adyen.
// Scarica i report giornalieri per 8 giorni a partire dalla data ordine
// e filtra per merchantReference.
//
// Uso:
//   GET /api/adyen-report-status?merchantReference=SFDLEU00435249&date=2026-05-29
//
// Variabili d'ambiente:
//   ADYEN_REPORT_API_KEY     — API key con ruolo "Merchant Report Download role"
//   ADYEN_MERCHANT_ACCOUNT   — es. "DelonghiUS"

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REPORT_DAYS = 8;

// ── Genera lista di date (YYYY-MM-DD) a partire da startDate ─────────────────
function getDatesRange(startDateStr) {
  const dates = [];
  const start = new Date(startDateStr + "T00:00:00Z");
  for (let i = 0; i < REPORT_DAYS; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    dates.push(d.toISOString().slice(0, 10)); // YYYY-MM-DD
  }
  return dates;
}

// ── Scarica e parsa il report CSV di un giorno ────────────────────────────────
// Adyen Report URL:
// https://ca-live.adyen.com/reports/download/MerchantAccount/{merchant}/payments_accounting_report_{YYYY_MM_DD}.csv
async function fetchDayReport(merchant, dateStr, apiKey) {
  const dateFmt = dateStr.replace(/-/g, "_"); // 2026-05-29 → 2026_05_29
  const url = `https://ca-live.adyen.com/reports/download/MerchantAccount/${merchant}/payments_accounting_report_${dateFmt}.csv`;

  try {
    const res = await fetch(url, {
      headers: {
        "Authorization": "Basic " + Buffer.from(`report@Company.${merchant}:${apiKey}`).toString("base64"),
      },
    });

    if (res.status === 404) return { date: dateStr, found: false, rows: [] };
    if (!res.ok) {
      const text = await res.text();
      return { date: dateStr, found: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}`, rows: [] };
    }

    const csv  = await res.text();
    const rows = parseCSV(csv);
    return { date: dateStr, found: true, rows };
  } catch (err) {
    return { date: dateStr, found: false, error: err.message, rows: [] };
  }
}

// ── Parser CSV semplice ───────────────────────────────────────────────────────
function parseCSV(csv) {
  const lines = csv.split("\n").filter(l => l.trim());
  if (lines.length < 2) return [];

  // Prima riga = header
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));

  return lines.slice(1).map(line => {
    // Gestisce virgole dentro campi quotati
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

// ── Estrae campo merchantReference dal CSV ───────────────────────────────────
// Il campo nel CSV Adyen si chiama "Merchant Reference" o "merchant_reference"
// — proviamo entrambi
function getMerchantRef(row) {
  return row["Merchant Reference"] ||
         row["merchant_reference"] ||
         row["merchantReference"]  ||
         row["Merchant reference"] || "";
}

// ── Estrae stato leggibile ────────────────────────────────────────────────────
function getStatusLabel(eventType) {
  const map = {
    "Authorised":                   { label: "Autorizzato",      color: "blue"   },
    "Settled":                      { label: "Incassato",        color: "green"  },
    "SentForSettle":                { label: "In liquidazione",  color: "cyan"   },
    "Refused":                      { label: "Rifiutato",        color: "red"    },
    "Cancelled":                    { label: "Annullato",        color: "gray"   },
    "Refunded":                     { label: "Rimborsato",       color: "orange" },
    "Chargeback":                   { label: "Chargeback",       color: "red"    },
    "ChargebackReversed":           { label: "Chargeback Stornato", color: "yellow" },
    "Error":                        { label: "Errore",           color: "red"    },
  };
  return map[eventType] || { label: eventType || "Sconosciuto", color: "gray" };
}

// ── MAIN HANDLER ──────────────────────────────────────────────────────────────
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const merchantRef = searchParams.get("merchantReference")?.trim();
  const orderDate   = searchParams.get("date")?.trim(); // YYYY-MM-DD

  if (!merchantRef || !orderDate) {
    return Response.json({
      error:   "Parametri mancanti",
      message: "Usa ?merchantReference=SFDLEU00435249&date=2026-05-29",
      example: "/api/adyen-report-status?merchantReference=SFDLEU00435249&date=2026-05-29",
    }, { status: 400 });
  }

  // Valida formato data
  if (!/^\d{4}-\d{2}-\d{2}$/.test(orderDate)) {
    return Response.json({
      error:   "Formato data non valido",
      message: "Usa il formato YYYY-MM-DD, es. 2026-05-29",
    }, { status: 400 });
  }

  const apiKey   = process.env.ADYEN_REPORT_API_KEY   || "";
  const merchant = process.env.ADYEN_MERCHANT_ACCOUNT || "";

  if (!apiKey || !merchant) {
    return Response.json({
      error:   "Variabili d'ambiente mancanti",
      missing: [...(!apiKey ? ["ADYEN_REPORT_API_KEY"] : []), ...(!merchant ? ["ADYEN_MERCHANT_ACCOUNT"] : [])],
    }, { status: 500 });
  }

  const dates = getDatesRange(orderDate);

  // Scarica tutti i report in parallelo
  const reportResults = await Promise.all(
    dates.map(date => fetchDayReport(merchant, date, apiKey))
  );

  // Filtra le righe per merchantReference
  const matchingEvents = [];
  for (const report of reportResults) {
    for (const row of report.rows) {
      if (getMerchantRef(row) === merchantRef) {
        matchingEvents.push({
          date:        report.date,
          eventType:   row["Type"] || row["type"] || row["Event"] || "",
          status:      row["Status"] || row["status"] || "",
          amount:      row["Amount"] || row["amount"] || "",
          currency:    row["Currency"] || row["currency"] || "",
          pspReference: row["Psp Reference"] || row["pspReference"] || row["PSP Reference"] || "",
          paymentMethod: row["Payment Method"] || row["paymentMethod"] || "",
          raw:         row,
        });
      }
    }
  }

  // Stato corrente = evento più recente
  const currentEvent   = matchingEvents[matchingEvents.length - 1] || null;
  const statusLabel    = currentEvent ? getStatusLabel(currentEvent.eventType || currentEvent.status) : null;

  // Report summary per debug
  const reportSummary = reportResults.map(r => ({
    date:      r.date,
    available: r.found,
    rows:      r.rows.length,
    error:     r.error || null,
  }));

  return Response.json({
    merchantReference: merchantRef,
    orderDate,
    searchRange:       { from: dates[0], to: dates[dates.length - 1], days: REPORT_DAYS },
    found:             matchingEvents.length > 0,
    currentStatus:     currentEvent ? (currentEvent.eventType || currentEvent.status) : null,
    statusLabel,
    totalEvents:       matchingEvents.length,
    events:            matchingEvents,
    reportSummary,
  });
}
