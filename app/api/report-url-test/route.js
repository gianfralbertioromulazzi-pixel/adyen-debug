// app/api/report-url-test/route.js
// ⚠️  TEMPORANEO — rimuovi dopo il test
//
// Testa il download di un report Adyen da URL diretto.
// Uso: GET /api/report-url-test?url=URL_DEL_REPORT

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const reportUrl = searchParams.get("url")?.trim();

  if (!reportUrl) {
    return Response.json({
      error:   "Parametro mancante",
      example: "/api/report-url-test?url=https://ca-live.adyen.com/reports/...",
    }, { status: 400 });
  }

  const username = process.env.ADYEN_REPORT_USERNAME || "";
  const password = process.env.ADYEN_REPORT_PASSWORD || "";
  const auth     = Buffer.from(`${username}:${password}`).toString("base64");

  // Prova 3 metodi di autenticazione diversi
  const attempts = [
    { method: "Basic Auth",   headers: { Authorization: `Basic ${auth}` } },
    { method: "API Key",      headers: { "X-API-Key": process.env.ADYEN_REPORT_API_KEY || "" } },
    { method: "No Auth",      headers: {} },
  ];

  const results = [];

  for (const attempt of attempts) {
    try {
      const res  = await fetch(reportUrl, { headers: attempt.headers });
      const text = await res.text();
      results.push({
        method:   attempt.method,
        status:   res.status,
        isCSV:    text.includes(",") && text.split("\n").length > 2,
        preview:  text.slice(0, 200),
      });
      // Se funziona, inutile provare gli altri
      if (res.ok) break;
    } catch (err) {
      results.push({ method: attempt.method, error: err.message });
    }
  }

  return Response.json({ reportUrl, results });
}
