// app/api/webhooks/adyen/route.js

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { getDb, COLLECTION, deriveStatus } from "@/lib/firestore";
import { createHmac }                      from "crypto";

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
  const db      = getDb();

  for (const wrapper of items) {
    const item = wrapper?.NotificationRequestItem;
    if (!item) continue;

    if (!verifyHmac(item, hmacKey)) {
      console.warn("[webhook] HMAC failed:", item.pspReference);
      continue;
    }

    const { eventCode, success, pspReference, merchantReference,
            amount, paymentMethod, eventDate, merchantAccountCode } = item;

    const successBool = success === "true" || success === true;
    const status      = deriveStatus(eventCode, successBool);

    if (db) {
      try {
        const docId = `${pspReference}_${eventCode}`;
        await db.collection(COLLECTION).doc(docId).set({
          merchantReference:   merchantReference   || null,
          pspReference:        pspReference        || null,
          eventCode:           eventCode           || null,
          success:             successBool,
          status,
          amount:              amount?.value       || null,
          currency:            amount?.currency    || null,
          paymentMethod:       paymentMethod       || null,
          merchantAccount:     merchantAccountCode || null,
          eventDate:           eventDate           || null,
          rawWebhook:          item,
          receivedAt:          new Date(),
        }, { merge: true });
      } catch (err) {
        console.error("[webhook] Errore Firestore:", err.message);
      }
    }
  }

  // Adyen richiede [accepted] obbligatoriamente
  return new Response("[accepted]", {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

export async function GET() {
  return Response.json({
    status:   "ok",
    endpoint: "Adyen webhook receiver attivo",
  });
}
