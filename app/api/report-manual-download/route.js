// app/api/report-manual-download/route.js
// ⚠️  TEMPORANEO — rimuovi dopo il test
//
// Scarica manualmente i report Adyen del giorno specificato
// per tutti i merchant e li salva su Google Drive.
//
// Uso:
//   GET /api/report-manual-download?date=2026-06-09

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getGoogleToken() {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL || "";
  const privateKey  = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  const now         = Math.floor(Date.now() / 1000);
  const payload     = {
    iss:   clientEmail,
    scope: "https://www.googleapis.com/auth/drive.file",
    aud:   "https://oauth2.googleapis.com/token",
    iat:   now,
    exp:   now + 3600,
  };
  const b64     = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const signing = `${b64({ alg: "RS256", typ: "JWT" })}.${b64(payload)}`;
  const keyData = privateKey
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    "pkcs8", Buffer.from(keyData, "base64"),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]
  );
  const signature = await globalThis.crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", cryptoKey, Buffer.from(signing)
  );
  const jwt = `${signing}.${Buffer.from(signature).toString("base64url")}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion:  jwt,
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Google token error: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function findFileByName(token, filename) {
  const q   = `name='${filename}' and trashed=false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  return data.files?.[0]?.id || null;
}

async function uploadToDrive(token, filename, csvContent) {
  const boundary = "boundary_adyen_report";
  const metadata = JSON.stringify({ name: filename, mimeType: "text/csv" });
  const body = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "", metadata,
    `--${boundary}`,
    "Content-Type: text/csv",
    "", csvContent,
    `--${boundary}--`,
  ].join("\r\n");

  const existingId = await findFileByName(token, filename);
  const url    = existingId
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=multipart`
    : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
  const method = existingId ? "PATCH" : "POST";

  const res  = await fetch(url, {
    method,
    headers: {
      Authorization:  `Bearer ${token}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  const data = await res.json();
  if (!data.id) throw new Error(`Drive upload error: ${JSON.stringify(data)}`);
  return data.id;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const date     = searchParams.get("date")?.trim() || "2026-06-09";
  const dateFmt  = date.replace(/-/g, "_");

  const username  = process.env.ADYEN_REPORT_USERNAME  || "";
  const password  = process.env.ADYEN_REPORT_PASSWORD  || "";
  const merchants = (process.env.ADYEN_MERCHANT_ACCOUNTS || "")
    .split(",").map(m => m.trim()).filter(Boolean);

  if (!username || !password) {
    return Response.json({ error: "ADYEN_REPORT_USERNAME o ADYEN_REPORT_PASSWORD mancanti" }, { status: 500 });
  }

  const auth = Buffer.from(`${username}:${password}`).toString("base64");

  let googleToken;
  try {
    googleToken = await getGoogleToken();
  } catch (err) {
    return Response.json({ error: "Errore Google token", message: err.message }, { status: 500 });
  }

  const results = [];

  // Processa un merchant alla volta per non andare in timeout
  for (const merchant of merchants) {
    const url      = `https://ca-live.adyen.com/reports/download/MerchantAccount/${merchant}/payments_accounting_report_${dateFmt}.csv`;
    const filename = `adyen_report_${merchant}_${date}.csv`;

    try {
      const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });

      if (res.status === 404) {
        results.push({ merchant, status: "not_found", reason: "report non disponibile per questa data" });
        continue;
      }

      if (!res.ok) {
        results.push({ merchant, status: "error", reason: `HTTP ${res.status}` });
        continue;
      }

      const csv    = await res.text();
      const fileId = await uploadToDrive(googleToken, filename, csv);
      results.push({ merchant, status: "saved", filename, fileId });

    } catch (err) {
      results.push({ merchant, status: "error", reason: err.message });
    }
  }

  const saved    = results.filter(r => r.status === "saved").length;
  const notFound = results.filter(r => r.status === "not_found").length;
  const errors   = results.filter(r => r.status === "error").length;

  return Response.json({
    date,
    summary: { total: merchants.length, saved, notFound, errors },
    results,
  });
}
