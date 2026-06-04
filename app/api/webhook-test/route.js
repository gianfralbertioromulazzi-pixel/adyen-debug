// app/api/webhook-test/route.js
// ⚠️  TEMPORANEO — rimuovi dopo il test

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { appendRow, deriveStatus } from "@/lib/sheets";

export async function GET() {
  const testData = {
    merchantReference:   "TEST_ORDER_002",
    pspReference:        "TEST_PSP_" + Date.now(),
    eventCode:           "AUTHORISATION",
    success:             true,
    amount:              { value: 9900, currency: "EUR" },
    paymentMethod:       "visa",
    eventDate:           new Date().toISOString(),
    merchantAccountCode: "DelonghiUS",
  };

  const status = deriveStatus(testData.eventCode, testData.success);

  let writeResult = null;
  try {
    await appendRow([
      testData.merchantReference,
      testData.pspReference,
      testData.eventCode,
      status,
      String(testData.success),
      String(testData.amount.value),
      testData.amount.currency,
      testData.paymentMethod,
      testData.merchantAccountCode,
      testData.eventDate,
      new Date().toISOString(),
    ]);
    writeResult = "✅ Riga scritta sul foglio";
  } catch (err) {
    writeResult = `❌ Errore: ${err.message}`;
  }

  return Response.json({ testData, status, writeResult });
}
