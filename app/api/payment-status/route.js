// app/api/payment-status/route.js

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { getDb, COLLECTION } from "@/lib/firestore";

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

  const db = getDb();
  if (!db) {
    return Response.json({
      error:   "Database non disponibile",
      message: "Verifica le variabili GOOGLE_PROJECT_ID, GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY su Vercel.",
    }, { status: 503 });
  }

  try {
    const field    = merchantReference ? "merchantReference" : "pspReference";
    const value    = merchantReference || pspReference;

    const snapshot = await db
      .collection(COLLECTION)
      .where(field, "==", value)
      .orderBy("receivedAt", "desc")
      .get();

    if (snapshot.empty) {
      return Response.json({
        found:   false,
        message: `Nessun evento trovato per ${field}: ${value}`,
        hint:    "Il pagamento potrebbe non aver ancora generato webhook, oppure il riferimento è errato.",
      }, { status: 404 });
    }

    const events = snapshot.docs.map(doc => {
      const d = doc.data();
      return {
        eventCode:         d.eventCode,
        status:            d.status,
        success:           d.success,
        amount:            d.amount,
        currency:          d.currency,
        paymentMethod:     d.paymentMethod,
        eventDate:         d.eventDate,
        receivedAt:        d.receivedAt?.toDate?.()?.toISOString() || d.receivedAt,
        pspReference:      d.pspReference,
        merchantReference: d.merchantReference,
        ...(showHistory ? { rawWebhook: d.rawWebhook } : {}),
      };
    });

    const latest      = events[0];
    const statusLabel = getStatusLabel(latest.status, latest.success);

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

function getStatusLabel(status, success) {
  const labels = {
    "Authorised":          { label: "Autorizzato",        color: "blue"   },
    "Captured":            { label: "Catturato",           color: "cyan"   },
    "Settled":             { label: "Incassato",           color: "green"  },
    "Cancelled":           { label: "Annullato",           color: "gray"   },
    "Refunded":            { label: "Rimborsato",          color: "orange" },
    "Chargeback":          { label: "Chargeback",          color: "red"    },
    "Chargeback Reversed": { label: "Chargeback Stornato", color: "yellow" },
    "Fraud Notification":  { label: "Frode Segnalata",    color: "red"    },
  };
  return labels[status] || { label: status || "Sconosciuto", color: "gray" };
}
