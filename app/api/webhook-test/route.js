// app/api/webhook-test/route.js
// ⚠️  TEMPORANEO — rimuovi dopo il test
// Simula un webhook Adyen reale verso il tuo endpoint

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const { origin } = new URL(request.url);

  // Payload identico a quello che manda Adyen
  const payload = {
    live: "true",
    notificationItems: [{
      NotificationRequestItem: {
        eventCode:           "AUTHORISATION",
        success:             "true",
        pspReference:        "TEST_" + Date.now(),
        merchantReference:   "TEST_ORDER_001",
        merchantAccountCode: "DelonghiUS",
        amount:              { value: 9900, currency: "EUR" },
        paymentMethod:       "visa",
        eventDate:           new Date().toISOString(),
        additionalData:      {},
      }
    }]
  };

  // Chiama il webhook endpoint
  const res = await fetch(`${origin}/api/webhooks/adyen`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(payload),
  });

  const text = await res.text();

  return Response.json({
    sent:     payload.notificationItems[0].NotificationRequestItem,
    response: text,
    status:   res.status,
    message:  text === "[accepted]"
      ? "✅ Webhook ricevuto correttamente — controlla il Google Sheet!"
      : "❌ Qualcosa non va",
  });
}
