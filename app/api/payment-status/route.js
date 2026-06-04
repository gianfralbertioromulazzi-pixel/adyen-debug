// app/api/payment-status/route.js
//
// Legge lo stato di un pagamento da Google Sheets.
// Cerca per merchantReference o pspReference e ritorna l'evento più recente.
//
// Esempi:
//   GET /api/payment-status?merchantReference=SFKWEU00082245
//   GET /api/payment-status?pspReference=NZJ656JJ3LHLN3X3
//   GET /api/payment-status?merchantReference=SFKWEU00082245&history=true

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { readAllRows } from "@/lib/sheets";

const STATUS_LABELS = {
  "Authorised":          { label: "Autorizzato",        color: "blue"   },
  "Captured":            { label: "Catturato",           color: "cyan"   },
  "Settled":             { label: "Incassato",           color: "green"  },
  "Cancelled":           { label: "Annullato",           color: "gray"   },
  "Refunded":            { label: "Rimborsato",          color: "orange" },
  "Chargeback":          { label: "Chargeback",          color: "red"    },
  "Chargeback Reversed": { label: "Chargeback Stornato", color: "yellow" },
  "Fraud Notification":  { label: "Frode Segnalata",    color: "red"    },
};

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const merchantReference = searchParams.get("merchantReference")?.trim();
  const pspReference      = searchParams.get("pspReference")?.trim();
  const showHistory       = searchParams.get("history") === "true";

  if (!merchantReference && !pspReference) {
    return Response.json({
      error:   "Parametro mancante",
      message: "Usa ?merchantReference=... oppure ?pspReference=...",
      example: "/api/payment-status?merchantReference=SFKWEU00082245",
    }, { status: 400 });
  }

  try {
    const rows = await readAllRows();

    // Filtra le righe per il riferimento cercato
    const field  = merchantReference ? "merchantReference" : "pspReference";
    const value  = merchantReference || pspReference;
    const events = rows.filter(row => row[field] === value);

    if (events.length === 0) {
      return Response.json({
        found:   false,
        message: `Nessun evento trovato per ${field}: ${value}`,
        hint:    "Il pagamento potrebbe non aver ancora generato webhook, oppure il riferimento è errato.",
      }, { status: 404 });
    }

    // Ordina per receivedAt desc — evento più recente prima
    events.sort((a, b) => {
      const ta = new Date(a.receivedAt || 0).getTime();
      const tb = new Date(b.receivedAt || 0).getTime();
      return tb - ta;
    });

    const latest      = events[0];
    const statusLabel = STATUS_LABELS[latest.status] || { label: latest.status || "Sconosciuto", color: "gray" };

    return Response.json({
      found:             true,
      merchantReference: latest.merchantReference,
      pspReference:      latest.pspReference,
      currentStatus:     latest.status,
      statusLabel,
      lastUpdate:        latest.receivedAt,
      paymentMethod:     latest.paymentMethod,
      amount:            latest.amount,
      currency:          latest.currency,
      totalEvents:       events.length,
      ...(showHistory ? { history: events } : { latestEvent: latest }),
    });

  } catch (err) {
    console.error("[payment-status] Errore:", err.message);
    return Response.json({
      error:   "Errore interno",
      message: err.message,
    }, { status: 500 });
  }
}
