// app/api/report-debug/route.js
// ⚠️  TEMPORANEO — rimuovi dopo il debug

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const username = process.env.ADYEN_REPORT_USERNAME  || "";
  const password = process.env.ADYEN_REPORT_PASSWORD  || "";
  const merchant = process.env.ADYEN_MERCHANT_ACCOUNT || "";

  const auth = Buffer.from(`${username}:${password}`).toString("base64");

  // Prova 4 URL diversi che Adyen potrebbe usare
  const urls = [
    `https://ca-live.adyen.com/reports/download/MerchantAccount/${merchant}/payments_accounting_report_2026_05_29.csv`,
    `https://ca-live.adyen.com/reports/download/MerchantAccount/${merchant}/payments_accounting_report_2026_05_30.csv`,
    `https://ca-live.adyen.com/reports/download/Company/DelonghiUS/payments_accounting_report_2026_05_29.csv`,
    `https://ca-live.adyen.com/reports/download/MerchantAccount/DELONGHI_EU/payments_accounting_report_2026_05_29.csv`,
  ];

  const results = [];

  for (const url of urls) {
    try {
      const res  = await fetch(url, {
        headers: { Authorization: `Basic ${auth}` },
      });
      const text = await res.text();
      results.push({
        url,
        status:   res.status,
        preview:  text.slice(0, 300),
        isCSV:    text.startsWith("Company") || text.includes("Merchant Reference") || text.includes("merchantReference"),
      });
    } catch (err) {
      results.push({ url, error: err.message });
    }
  }

  return Response.json({
    username_preview: username.slice(0, 20) + "...",
    merchant,
    results,
  });
}
