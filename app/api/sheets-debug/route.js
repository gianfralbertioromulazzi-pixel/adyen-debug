// app/api/sheets-debug/route.js
// ⚠️  TEMPORANEO — rimuovi dopo il debug

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const projectId   = process.env.GOOGLE_PROJECT_ID    || "";
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL  || "";
  const privateKey  = (process.env.GOOGLE_PRIVATE_KEY  || "").replace(/\\n/g, "\n");
  const sheetId     = process.env.GOOGLE_SHEET_ID      || "";

  const checks = {
    GOOGLE_PROJECT_ID:   { present: !!projectId,   value: projectId || "❌ MANCANTE" },
    GOOGLE_CLIENT_EMAIL: { present: !!clientEmail, preview: clientEmail.slice(0, 30) + "..." },
    GOOGLE_PRIVATE_KEY:  {
      present:         !!privateKey,
      length:          privateKey.length,
      startsCorrectly: privateKey.startsWith("-----BEGIN PRIVATE KEY-----"),
      endsCorrectly:   privateKey.trimEnd().endsWith("-----END PRIVATE KEY-----"),
    },
    GOOGLE_SHEET_ID: { present: !!sheetId, value: sheetId || "❌ MANCANTE" },
  };

  // Step 1: prova a ottenere il token
  let tokenResult = null;
  let token = null;
  try {
    const now     = Math.floor(Date.now() / 1000);
    const payload = {
      iss:   clientEmail,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud:   "https://oauth2.googleapis.com/token",
      iat:   now,
      exp:   now + 3600,
    };

    const b64     = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
    const header  = { alg: "RS256", typ: "JWT" };
    const signing = `${b64(header)}.${b64(payload)}`;

    const keyData = privateKey
      .replace("-----BEGIN PRIVATE KEY-----", "")
      .replace("-----END PRIVATE KEY-----", "")
      .replace(/\s/g, "");

    const cryptoKey = await globalThis.crypto.subtle.importKey(
      "pkcs8",
      Buffer.from(keyData, "base64"),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signature = await globalThis.crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      cryptoKey,
      Buffer.from(signing)
    );

    const jwt = `${signing}.${Buffer.from(signature).toString("base64url")}`;

    const res  = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion:  jwt,
      }),
    });
    const data = await res.json();

    if (data.access_token) {
      token = data.access_token;
      tokenResult = "✅ Token ottenuto";
    } else {
      tokenResult = `❌ ${JSON.stringify(data)}`;
    }
  } catch (err) {
    tokenResult = `❌ Eccezione: ${err.message}`;
  }

  // Step 2: prova a leggere il foglio
  let readResult = null;
  if (token) {
    try {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/adyen-transaction-status!A1:K1`;
      const res  = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      readResult = res.ok ? `✅ Lettura OK: ${JSON.stringify(data)}` : `❌ ${JSON.stringify(data)}`;
    } catch (err) {
      readResult = `❌ Eccezione: ${err.message}`;
    }
  }

  // Step 3: prova a scrivere una riga di test
  let writeResult = null;
  if (token) {
    try {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/adyen-transaction-status!A:K:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
      const res  = await fetch(url, {
        method:  "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body:    JSON.stringify({ values: [["DEBUG_TEST", "PSP_DEBUG", "AUTHORISATION", "Authorised", "true", "9900", "EUR", "visa", "DelonghiUS", new Date().toISOString(), new Date().toISOString()]] }),
      });
      const data = await res.json();
      writeResult = res.ok ? `✅ Scrittura OK: ${JSON.stringify(data?.updates)}` : `❌ ${JSON.stringify(data)}`;
    } catch (err) {
      writeResult = `❌ Eccezione: ${err.message}`;
    }
  }

  return Response.json({ checks, tokenResult, readResult, writeResult });
}
