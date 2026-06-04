// app/api/webhooks/adyen/route.js
//
// Riceve webhook Adyen e salva ogni evento come riga su Google Sheets.
// Risponde sempre [accepted] — obbligatorio per Adyen.

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

    const {
      eventCode, success, pspReference, merchantReference,
      amount, paymentMethod, eventDate, merchantAccountCode,
    } = item;

    const successBool = success === "true" || success === true;
    const status      = deriveStatus(eventCode, successBool);
    const receivedAt  = new Date().toISOString();

    try {
      // Scrive una riga nel foglio Google Sheets
      // Ordine colonne: merchantReference, pspReference, eventCode, status,
      //                 success, amount, currency, paymentMethod,
      //                 merchantAccount, eventDate, receivedAt
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
      // Non blocchiamo — rispondiamo [accepted] comunque per non far riprovare Adyen
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
    endpoint: "Adyen webhook receiver attivo (Google Sheets)",
  });
}
