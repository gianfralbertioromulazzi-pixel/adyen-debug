// app/api/adyen-debug/route.js
// Runs all Adyen authentication + connectivity tests server-side.
// Env vars read server-side (never exposed to the browser):
//   ADYEN_API_KEY, ADYEN_LIVE_URL_PREFIX, ADYEN_MERCHANT_ACCOUNT

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SETTLED_STATUSES = ["Settled", "SettledBulk", "SettledExternally"];
const USD_CAD_STATUSES = ["Authorised"];
const USD_CAD_CURRENCIES = ["USD", "CAD"];

function getEnv() {
  return {
    apiKey: process.env.ADYEN_API_KEY || "",
    prefix: process.env.ADYEN_LIVE_URL_PREFIX || "",
    merchant: process.env.ADYEN_MERCHANT_ACCOUNT || "",
  };
}

function headers(apiKey) {
  return {
    "Content-Type": "application/json",
    "X-API-Key": apiKey,
  };
}

async function safePost(url, body, apiKey) {
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: headers(apiKey),
      body: JSON.stringify(body),
    });
    let json = null;
    try { json = await r.json(); } catch (_) {}
    return { status: r.status, json };
  } catch (e) {
    return { status: null, error: e.message };
  }
}

async function safeGet(url, apiKey) {
  try {
    const r = await fetch(url, {
      method: "GET",
      headers: headers(apiKey),
    });
    let json = null;
    try { json = await r.json(); } catch (_) {}
    return { status: r.status, json };
  } catch (e) {
    return { status: null, error: e.message };
  }
}

function diagnose401() {
  return [
    "La API key è stata generata nel Customer Area di TEST, non LIVE.",
    "Fix: vai su ca-live.adyen.com → Developers → API credentials → genera nuova API key.",
    "Le chiavi test e live sono ambienti separati e incompatibili.",
  ];
}

// ── TEST 1: Management API /me ────────────────────────────────────────────────
async function testManagementMe(apiKey) {
  const url = "https://management-live.adyen.com/v3/me";
  const { status, json, error } = await safeGet(url, apiKey);

  if (error) return { name: "Management API /me", ok: false, status: null, error, notes: [] };

  const ok = status === 200;
  const notes = [];

  if (status === 401) {
    notes.push(...diagnose401());
  } else if (status === 403) {
    notes.push("Auth OK ma ruolo mancante.");
    notes.push("Aggiungi il ruolo 'Management API - Accounts read' alla credential.");
  } else if (ok) {
    notes.push(`Company: ${json?.companyName}`);
    notes.push(`Active: ${json?.active}`);
    notes.push(`Roles: ${(json?.roles || []).join(", ") || "n/a"}`);
  }

  return { name: "Management API GET /me", ok, status, json, notes };
}

// ── TEST 2: PAL Live /authorise (auth probe) ──────────────────────────────────
async function testPALAuth(apiKey, prefix, merchant) {
  const url = `https://${prefix}-pal-live.adyenpayments.com/pal/servlet/Payment/v68/authorise`;
  const body = {
    merchantAccount: merchant,
    amount: { currency: "EUR", value: 1 },
    reference: "ADYEN_DEBUG_PROBE",
    paymentMethod: { type: "scheme" },
  };
  const { status, json, error } = await safePost(url, body, apiKey);

  const notes = [];
  // 401 = auth fail; 400/422 = auth OK, payload invalid (expected)
  const authOk = status !== null && status !== 401 && status !== 403;

  if (error) return { name: "PAL Live /authorise (auth probe)", ok: false, status: null, error, notes: [] };

  if (status === 401) {
    notes.push(...diagnose401());
    notes.push("Nota: /authorise serve per CREARE pagamenti, non per recuperarli.");
  } else if (status === 403) {
    notes.push("Auth OK, ma la credential non ha il ruolo 'Merchant PAL Webservice role' su questo merchant.");
  } else if (authOk) {
    notes.push("Auth OK — errore di validazione sul payload di test è atteso.");
  }

  return { name: "PAL Live /authorise (auth probe)", ok: authOk, status, json, notes };
}

// ── TEST 3: Checkout Live /payments (auth probe) ──────────────────────────────
async function testCheckoutAuth(apiKey, prefix, merchant) {
  const url = `https://${prefix}-checkout-live.adyenpayments.com/checkout/v71/payments`;
  const body = {
    merchantAccount: merchant,
    amount: { currency: "EUR", value: 1 },
    reference: "ADYEN_DEBUG_PROBE",
    paymentMethod: { type: "scheme" },
    returnUrl: "https://debug.local/return",
  };
  const { status, json, error } = await safePost(url, body, apiKey);

  const notes = [];
  const authOk = status !== null && status !== 401 && status !== 403;

  if (error) return { name: "Checkout Live /payments (auth probe)", ok: false, status: null, error, notes: [] };

  if (status === 401) {
    notes.push(...diagnose401());
  } else if (status === 403) {
    notes.push("Auth OK, ma la credential non ha il ruolo 'Checkout webservice role' su questo merchant.");
  } else if (authOk) {
    notes.push("Auth OK — errore di validazione è atteso.");
  }

  return { name: "Checkout Live /payments (auth probe)", ok: authOk, status, json, notes };
}

// ── TEST 4: Management API — lista merchant del company ───────────────────────
async function testManagementMerchants(apiKey) {
  // Prima chiamata: /me per ottenere il companyName
  const me = await safeGet("https://management-live.adyen.com/v3/me", apiKey);
  if (!me.json?.companyName) {
    return {
      name: "Management API GET /companies/{id}/merchants",
      ok: false, status: me.status,
      notes: ["Skip — /me non ha restituito companyName (probabilmente 401 su /me)."],
    };
  }

  const companyId = me.json.companyName;
  const url = `https://management-live.adyen.com/v3/companies/${companyId}/merchants`;
  const { status, json, error } = await safeGet(url, apiKey);

  const notes = [];
  const ok = status === 200;

  if (error) return { name: "Management API /companies/{id}/merchants", ok: false, status: null, error, notes: [] };

  if (ok) {
    const list = json?.data || [];
    notes.push(`${list.length} merchant trovati: ${list.map(m => m.id).join(", ")}`);
  } else {
    notes.push(`Status ${status} — potrebbe mancare il ruolo 'Management API - Accounts read'.`);
  }

  return { name: `Management API GET /companies/${companyId}/merchants`, ok, status, json: { count: json?.data?.length, merchants: (json?.data || []).map(m => ({ id: m.id, status: m.status })) }, notes };
}

// ── TEST 5: Fund API (Adyen Platforms only) ───────────────────────────────────
async function testFundAPI(apiKey, merchant) {
  const url = "https://cal-live.adyen.com/cal/services/Fund/v6/accountHolderTransactionList";
  const now = new Date();
  const since = new Date(now.getTime() - 60 * 60 * 1000);

  const body = {
    merchantAccount: merchant,
    transactionStatuses: SETTLED_STATUSES,
    fromDate: since.toISOString().replace(".000", ""),
    toDate: now.toISOString().replace(".000", ""),
  };

  const { status, json, error } = await safePost(url, body, apiKey);
  const notes = [];
  const ok = status === 200;

  if (error) return { name: "Fund API /accountHolderTransactionList", ok: false, status: null, error, notes: [] };

  if (ok) {
    const txList = json?.accountTransactionList || [];
    const allTx = txList.flatMap(a => a.transactions?.transaction || []);
    notes.push(`${allTx.length} transazioni trovate.`);
  } else if (status === 401 || status === 403) {
    notes.push("Non disponibile — questa API è solo per Adyen Platforms (MarketPay).");
    notes.push("Per merchant account standard, usa webhooks o report.");
  }

  return { name: "Fund API /accountHolderTransactionList (Platforms only)", ok, status, json, notes };
}

// ── MAIN handler ──────────────────────────────────────────────────────────────
export async function GET() {
  const { apiKey, prefix, merchant } = getEnv();

  const envCheck = {
    ADYEN_API_KEY: apiKey ? `${apiKey.slice(0, 8)}...${apiKey.slice(-4)}` : "❌ MANCANTE",
    ADYEN_LIVE_URL_PREFIX: prefix || "❌ MANCANTE",
    ADYEN_MERCHANT_ACCOUNT: merchant || "❌ MANCANTE",
  };

  const missing = [];
  if (!apiKey) missing.push("ADYEN_API_KEY");
  if (!prefix) missing.push("ADYEN_LIVE_URL_PREFIX");
  if (!merchant) missing.push("ADYEN_MERCHANT_ACCOUNT");

  if (missing.length) {
    return Response.json({
      error: "Variabili d'ambiente mancanti",
      missing,
      fix: "Vai su Vercel → Settings → Environment Variables e aggiungi le variabili mancanti.",
      env: envCheck,
    }, { status: 400 });
  }

  // Run all tests in parallel
  const [t1, t2, t3, t4, t5] = await Promise.all([
    testManagementMe(apiKey),
    testPALAuth(apiKey, prefix, merchant),
    testCheckoutAuth(apiKey, prefix, merchant),
    testManagementMerchants(apiKey),
    testFundAPI(apiKey, merchant),
  ]);

  const tests = [t1, t2, t3, t4, t5];
  const allOk = tests.every(t => t.ok);
  const anyAuthOk = tests.some(t => t.ok);

  const summary = {
    timestamp: new Date().toISOString(),
    overall: allOk ? "✅ Tutti i test OK" : anyAuthOk ? "⚠️ Autenticazione parzialmente OK" : "❌ Tutti i test falliti — probabile API key di test usata su endpoint live",
    env: envCheck,
    recommendation: allOk
      ? "Credential funzionante. Configura i webhook per ricevere eventi Settled/Authorised in real-time."
      : !anyAuthOk
      ? "Rigenera la API key dal Customer Area LIVE (ca-live.adyen.com), non da quello di test."
      : "Verifica i ruoli mancanti indicati nei singoli test.",
    how_to_get_payments: {
      best_practice: "Webhook Standard (SETTLEMENT_PROCESSING_COMPLETE, CAPTURE, AUTHORISATION)",
      setup: "CA live → Developers → Webhooks → Add Standard webhook",
      event_codes: {
        settled: ["CAPTURE", "SETTLEMENT_PROCESSING_COMPLETE"],
        authorised_usd_cad: ["AUTHORISATION — filtra per amount.currency in [USD, CAD]"],
      },
      alternative_batch: "Report API (richiede ruolo 'Merchant Report user')",
      alternative_platforms: "Fund API /accountHolderTransactionList (solo Adyen Platforms)",
    },
  };

  return Response.json({ summary, tests }, { status: 200 });
}
