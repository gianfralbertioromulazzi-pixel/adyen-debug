// app/api/webhooks/adyen/route.js
//
// Riceve i webhook Standard di Adyen e salva ogni evento su Firestore.
//
// Adyen manda una lista di notifiche in un unico POST:
// {
//   "live": "false",
//   "notificationItems": [
//     {
//       "NotificationRequestItem": {
//         "eventCode": "AUTHORISATION",
//         "success": "true",
//         "pspReference": "NZJ656JJ3LHLN3X3",
//         "merchantReference": "SFKWEU00082245",
//         "amount": { "value": 9900, "currency": "EUR" },
//         "paymentMethod": "visa",
//         "eventDate": "2024-01-15T10:30:00.000Z",
//         ...
//       }
//     }
//   ]
// }
//
// Il webhook DEVE rispondere con "[accepted]" altrimenti Adyen riprova per 48 ore.
//
// ⚠️  SICUREZZA: Adyen firma ogni webhook con HMAC-SHA256.
//     Imposta ADYEN_WEBHOOK_HMAC_KEY su Vercel (lo trovi nel CA live →
//     Developers → Webhooks → il tuo webhook → HMAC key).
//     Senza verifica HMAC chiunque potrebbe inviare dati falsi al tuo endpoint.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { db, COLLECTION, deriveStatus } from "@/lib/firestore";
import { createHmac }                   from "crypto";

// ── Verifica firma HMAC Adyen ─────────────────────────────────────────────────
function verifyHmac(item, hmacKey) {
  if (!hmacKey) return true; // skip in sviluppo se la chiave non è configurata

  try {
    const {
      pspReference, originalReference, merchantAccountCode,
      merchantReference, eventDate, eventCode, success,
      amount: { value: amountValue, currency } = {},
    } = item;

    // Adyen concatena i campi in questo ordine preciso per la firma
    const data = [
      pspReference    || "",
      originalReference || "",
      merchantAccountCode || "",
      merchantReference || "",
      eventDate       || "",
      eventCode       || "",
      success         || "",
      amountValue     || "",
      currency        || "",
    ].join(":");

    const hmac     = createHmac("sha256", Buffer.from(hmacKey, "hex"));
    const expected = hmac.update(data).digest("base64");
    const received = item.additionalData?.hmacSignature || "";

    return expected === received;
  } catch {
    return false;
  }
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  const items = body?.notificationItems || [];
  const hmacKey = process.env.ADYEN_WEBHOOK_HMAC_KEY || "";

  const results = [];

  for (const wrapper of items) {
    const item = wrapper?.NotificationRequestItem;
    if (!item) continue;

    // Verifica HMAC
    if (!verifyHmac(item, hmacKey)) {
      console.warn("[webhook] HMAC verification failed per pspReference:", item.pspReference);
      results.push({ pspReference: item.pspReference, saved: false, reason: "hmac_failed" });
      continue;
    }

    const {
      eventCode,
      success,
      pspReference,
      merchantReference,
      amount,
      paymentMethod,
      eventDate,
      merchantAccountCode,
      additionalData,
    } = item;

    const successBool = success === "true" || success === true;
    const status      = deriveStatus(eventCode, successBool);

    try {
      // Salva evento su Firestore
      // ID documento = pspReference + eventCode per evitare duplicati
      const docId = `${pspReference}_${eventCode}`;
      await db.collection(COLLECTION).doc(docId).set({
        merchantReference:   merchantReference || null,
        pspReference:        pspReference      || null,
        eventCode:           eventCode         || null,
        success:             successBool,
        status,
        amount:              amount?.value     || null,
        currency:            amount?.currency  || null,
        paymentMethod:       paymentMethod     || null,
        merchantAccount:     merchantAccountCode || null,
        eventDate:           eventDate         || null,
        rawWebhook:          item,
        receivedAt:          new Date(),
      }, { merge: true }); // merge: true = aggiorna se esiste già

      results.push({ pspReference, eventCode, saved: true });
    } catch (err) {
      console.error("[webhook] Errore Firestore:", err.message);
      results.push({ pspReference, saved: false, reason: err.message });
    }
  }

  // ⚠️  OBBLIGATORIO: Adyen si aspetta "[accepted]" altrimenti riprova
  return new Response("[accepted]", {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

// GET per test rapido — verifica che l'endpoint risponda
export async function GET() {
  return Response.json({
    status:   "ok",
    endpoint: "Adyen webhook receiver attivo",
    hint:     "Configura questo URL su ca-live.adyen.com → Developers → Webhooks",
  });
}
