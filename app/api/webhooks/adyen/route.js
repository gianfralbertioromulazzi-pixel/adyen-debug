// app/api/webhooks/adyen/route.js
//
// Riceve webhook Adyen sui PAGAMENTI (non sui report) e salva ogni evento
// su Google Sheets in tempo reale.
//
// Questo è il metodo raccomandato da Adyen per tracciare lo stato dei
// pagamenti — più affidabile dei report batch.
//
// Eventi gestiti: AUTHORISATION, CAPTURE, CANCELLATION, REFUND,
//                 SETTLEMENT_PROCESSING_COMPLETE, CHARGEBACK, ecc.
//
// Ogni riga sul foglio rappresenta UN evento per UN pagamento.
// Per lo stato attuale di un ordine, si guarda l'evento più recente.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { appendRow, deriveStatus } from "@/lib/sheets";
import { createHmac }              from "crypto";

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
      eventDate            || "",
      eventCode            || "",
      success              || "",
      amountValue          || "",
      currency             || "",
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

  const items   = body?.notificationItems || [];
  const hmacKey = process.env.ADYEN_WEBHOOK_HMAC_KEY || "";

  for (const wrapper of items) {
    const item = wrapper?.NotificationRequestItem;
    if (!item) continue;

    // Ignora i webhook REPORT_AVAILABLE — questa route gestisce solo pagamenti
    if (item.eventCode === "REPORT_AVAILABLE") continue;

    if (!verifyHmac(item, hmacKey)) {
      console.warn("[webhook] HMAC failed:", item.pspReference);
      continue;
    }

    const {
      eventCode, success, pspReference, merchantReference,
      amount, paymentMethod, eventDate, merchantAccountCode,
    } = item;

    const successBool = success === "true" || success === true;
    const status      = deriveStatus(eventCode, successBool);
    const receivedAt  = new Date().toISOString();

    try {
      await appendRow([
        merchantReference        || "",
        pspReference             || "",
        eventCode                || "",
        status,
        String(successBool),
        String(amount?.value     || ""),
        amount?.currency         || "",
        paymentMethod            || "",
        merchantAccountCode      || "",
        eventDate                || "",
        receivedAt,
      ]);

      console.log(`[webhook] Salvato: ${merchantReference} / ${eventCode} / ${status}`);
    } catch (err) {
      console.error("[webhook] Errore Sheets:", err.message);
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
    endpoint: "Adyen webhook receiver attivo (pagamenti → Google Sheets)",
  });
}
