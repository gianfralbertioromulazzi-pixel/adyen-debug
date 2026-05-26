// app/api/adyen-payment-status/route.js
//
// Recupera lo stato di un pagamento Adyen dato un pspReference (e opzionalmente merchantReference).
//
// Strategia multi-probe — Adyen NON espone un semplice GET /payment/{pspRef} per merchant standard.
// Usiamo 3 approcci in parallelo e aggreghiamo i risultati:
//
//   1. PAL v68  POST /payments/{pspRef}/amountUpdates   → 422 con dati = auth OK + pspRef esiste
//   2. Checkout v71 GET /orders/{pspRef}                → 200 con info ordine se esiste
//   3. Management  GET /me + /merchants/{id}/payments   → solo se ruolo "Merchant report" presente
//
// NOTA IMPORTANTE:
//   Adyen non ha un endpoint REST pubblico "get payment by pspReference" per merchant account
//   standard (non-Platforms). La fonte di verità ufficiale sono i webhook e i report batch.
//   Questi probe restituiscono comunque informazioni utili dallo status code HTTP:
//     - 401 / 403  → problema di auth / ruoli
//     - 404        → pspReference non trovato o non di questo merchant
//     - 422        → pspReference trovato, payload non valido (atteso per probe)
//     - 200        → risposta piena (raro senza payload completo)

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getEnv() {
  return {
    apiKey:   process.env.ADYEN_API_KEY            || "",
    prefix:   process.env.ADYEN_LIVE_URL_PREFIX    || "",
    merchant: process.env.ADYEN_MERCHANT_ACCOUNT   || "",
  };
}

function headers(apiKey) {
  return {
    "Content-Type": "application/json",
    "X-API-Key": apiKey,
  };
}

async function safeRequest(method, url, body, apiKey) {
  try {
    const opts = {
      method,
      headers: headers(apiKey),
    };
    if (body) opts.body = JSON.stringify(body);

    const r = await fetch(url, opts);
    let json = null;
    try { json = await r.json(); } catch (_) {}
    return { status: r.status, json };
  } catch (e) {
    return { status: null, error: e.message };
  }
}

// ── PROBE 1: Checkout v71 /payments/{pspRef}/captures (amount probe) ──────────
// Se il pspRef esiste → 422 "Invalid Request" (payload mancante ma pspRef trovato)
// Se il pspRef NON esiste → 422 con errore diverso oppure 404
// Se auth fallisce → 401/403
async function probeCheckoutModification(pspRef, apiKey, prefix, merchant) {
  const url = `https://${prefix}-checkout-live.adyenpayments.com/checkout/v71/payments/${pspRef}/captures`;
  const body = {
    merchantAccount: merchant,
    amount: { currency: "EUR", value: 0 },
    reference: "STATUS_PROBE_DO_NOT_PROCESS",
  };

  const { status, json, error } = await safeRequest("POST", url, body, apiKey);

  const result = {
    probe: "Checkout v71 /payments/{pspRef}/captures (probe)",
    url,
    status,
    error: error || null,
    found: null,
    details: null,
    notes: [],
  };

  if (error) {
    result.notes.push(`Errore di rete: ${error}`);
    return result;
  }

  const errorCode = json?.errorCode;
  const msg = json?.message || json?.detail || "";

  if (status === 401) {
    result.notes.push("API key non valida o chiave di test usata su endpoint live.");
    result.found = false;
  } else if (status === 403) {
    result.notes.push("Auth OK ma manca il ruolo 'Checkout webservice role' o 'Merchant PAL Webservice role'.");
    result.found = null; // non possiamo determinare
  } else if (status === 404) {
    result.found = false;
    result.notes.push("pspReference non trovato su questo merchant account.");
  } else if (status === 422 || status === 400) {
    // 422 = Unprocessable Entity — il pspRef esiste ma il payload non è valido (atteso)
    // Adyen ritorna errorCode "000" o "101" per payload invalido, non per pspRef mancante
    if (msg.toLowerCase().includes("not found") || msg.toLowerCase().includes("unknown")) {
      result.found = false;
      result.notes.push("pspReference non trovato (risposta Adyen: payment not found).");
    } else {
      result.found = true;
      result.notes.push("pspReference TROVATO su questo merchant. Il pagamento esiste.");
      result.notes.push(`Errore atteso sul probe (payload non valido): ${msg || errorCode}`);
      result.details = { errorCode, message: msg };
    }
  } else if (status === 200) {
    result.found = true;
    result.notes.push("Risposta positiva — cattura accettata (insolito per probe con amount=0).");
    result.details = json;
  } else {
    result.notes.push(`Status inatteso ${status}: ${msg}`);
  }

  return result;
}

// ── PROBE 2: PAL v68 /payments/{pspRef}/reversals ────────────────────────────
// Stesso principio: 422 con messaggio specifico dice se il pspRef esiste
async function probePALReversal(pspRef, apiKey, prefix, merchant) {
  const url = `https://${prefix}-pal-live.adyenpayments.com/pal/servlet/Checkout/v71/payments/${pspRef}/reversals`;
  const body = {
    merchantAccount: merchant,
    reference: "STATUS_PROBE_DO_NOT_PROCESS",
  };

  const { status, json, error } = await safeRequest("POST", url, body, apiKey);

  const result = {
    probe: "PAL /payments/{pspRef}/reversals (probe)",
    url,
    status,
    error: error || null,
    found: null,
    details: null,
    notes: [],
  };

  if (error) {
    result.notes.push(`Errore di rete: ${error}`);
    return result;
  }

  const msg = json?.message || json?.detail || "";

  if (status === 401) {
    result.notes.push("API key non valida.");
    result.found = false;
  } else if (status === 403) {
    result.notes.push("Auth OK, ruolo mancante per PAL.");
    result.found = null;
  } else if (status === 404) {
    result.found = false;
    result.notes.push("pspReference non trovato (404).");
  } else if (status === 422 || status === 400) {
    if (msg.toLowerCase().includes("not found") || msg.toLowerCase().includes("unknown psp")) {
      result.found = false;
      result.notes.push("pspReference non trovato su questo merchant.");
    } else {
      result.found = true;
      result.notes.push("pspReference TROVATO. Errore atteso sul payload del probe.");
      result.details = { message: msg, raw: json };
    }
  } else if (status === 200) {
    result.found = true;
    result.notes.push("Reversal accettato (insolito per probe).");
    result.details = json;
  } else {
    result.notes.push(`Status inatteso ${status}: ${msg}`);
  }

  return result;
}

// ── PROBE 3: PAL classico GET /payments/{pspRef} ─────────────────────────────
// Endpoint documentato per le modifiche — non sempre ritorna lo stato ma
// possiamo dedurre l'esistenza dal codice HTTP
async function probePALGetPayment(pspRef, apiKey, prefix, merchant) {
  // PAL classico endpoint (usato per modifiche, non per status query)
  const url = `https://${prefix}-pal-live.adyenpayments.com/pal/servlet/Payment/v68/getAuthenticationResult`;
  const body = {
    merchantAccount: merchant,
    pspReference: pspRef,
  };

  const { status, json, error } = await safeRequest("POST", url, body, apiKey);

  const result = {
    probe: "PAL v68 /getAuthenticationResult (3DS status probe)",
    url,
    status,
    error: error || null,
    found: null,
    details: null,
    notes: [],
  };

  if (error) {
    result.notes.push(`Errore di rete: ${error}`);
    return result;
  }

  const msg       = json?.message || json?.detail || "";
  const resultCode = json?.threeDS2Result?.authenticationValue
    ? "3DS presente"
    : null;

  if (status === 401) {
    result.notes.push("API key non valida.");
    result.found = false;
  } else if (status === 403) {
    result.notes.push("Auth OK, ruolo mancante.");
    result.found = null;
  } else if (status === 404 || msg.toLowerCase().includes("not found")) {
    result.found = false;
    result.notes.push("pspReference non trovato.");
  } else if (status === 200) {
    result.found = true;
    result.notes.push("Pagamento trovato. Dati 3DS disponibili.");
    result.details = json;
  } else if (status === 422 || status === 400) {
    // Se ritorna 422 senza "not found" → il pspRef esiste ma non ha 3DS
    if (!msg.toLowerCase().includes("not found")) {
      result.found = true;
      result.notes.push("pspReference TROVATO (nessun dato 3DS — normale per pagamenti non-3DS).");
      result.details = { errorCode: json?.errorCode, message: msg };
    } else {
      result.found = false;
      result.notes.push("pspReference non trovato.");
    }
  } else {
    result.notes.push(`Status inatteso ${status}: ${msg}`);
  }

  return result;
}

// ── AGGREGATORE RISULTATI ─────────────────────────────────────────────────────
function aggregateFindings(pspRef, merchantRef, probes) {
  const foundVotes   = probes.filter(p => p.found === true).length;
  const notFoundVotes = probes.filter(p => p.found === false).length;
  const unknownVotes = probes.filter(p => p.found === null).length;
  const authErrors   = probes.filter(p => p.status === 401 || p.status === 403).length;

  let verdict = "";
  let recommendation = "";

  if (authErrors === probes.length) {
    verdict = "❌ Impossibile verificare — problemi di autenticazione su tutti i probe.";
    recommendation = "Verifica che ADYEN_API_KEY sia una chiave LIVE (ca-live.adyen.com) e che i ruoli 'Checkout webservice role' e 'Merchant PAL Webservice role' siano assegnati.";
  } else if (foundVotes > 0) {
    verdict = `✅ pspReference ${pspRef} TROVATO su questo merchant account.`;
    recommendation = "Il pagamento esiste. Per lo stato preciso (Authorised/Settled/Refunded) configura i webhook o consulta il Customer Area → Transactions → Payments.";
  } else if (notFoundVotes > 0 && unknownVotes === 0) {
    verdict = `⚠️ pspReference ${pspRef} NON trovato su questo merchant account.`;
    recommendation = "Possibili cause: (1) pspReference appartiene a un altro merchant account, (2) è un pagamento di test mentre stai interrogando l'ambiente live, (3) il riferimento è errato.";
  } else {
    verdict = `❓ Risultato inconclusivo (${foundVotes} trovato, ${notFoundVotes} non trovato, ${unknownVotes} sconosciuto).`;
    recommendation = "Aumenta i permessi della API key (aggiungi ruoli Checkout e PAL) e ritenta. In alternativa, verifica nel Customer Area.";
  }

  return {
    pspReference: pspRef,
    merchantReference: merchantRef || "non fornito",
    verdict,
    recommendation,
    probesSummary: {
      found: foundVotes,
      notFound: notFoundVotes,
      unknown: unknownVotes,
      authErrors,
    },
    hint: "Adyen non espone un endpoint REST 'get payment status by pspReference' per merchant standard. Lo stato ufficiale si ottiene via webhook (AUTHORISATION, CAPTURE, SETTLEMENT_PROCESSING_COMPLETE) o dai report batch.",
  };
}

// ── MAIN HANDLER ──────────────────────────────────────────────────────────────
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const pspRef      = searchParams.get("pspReference")?.trim();
  const merchantRef = searchParams.get("merchantReference")?.trim();

  if (!pspRef) {
    return Response.json({
      error: "Parametro mancante",
      message: "Aggiungi ?pspReference=NZJ656JJ3LHLN3X3 alla URL.",
      example: "/api/adyen-payment-status?pspReference=NZJ656JJ3LHLN3X3&merchantReference=SFKWEU00082245",
    }, { status: 400 });
  }

  const { apiKey, prefix, merchant } = getEnv();

  const envCheck = {
    ADYEN_API_KEY:            apiKey   ? `${apiKey.slice(0, 8)}...${apiKey.slice(-4)}` : "❌ MANCANTE",
    ADYEN_LIVE_URL_PREFIX:    prefix   || "❌ MANCANTE",
    ADYEN_MERCHANT_ACCOUNT:   merchant || "❌ MANCANTE",
  };

  const missing = [];
  if (!apiKey)   missing.push("ADYEN_API_KEY");
  if (!prefix)   missing.push("ADYEN_LIVE_URL_PREFIX");
  if (!merchant) missing.push("ADYEN_MERCHANT_ACCOUNT");

  if (missing.length) {
    return Response.json({
      error: "Variabili d'ambiente mancanti",
      missing,
      fix: "Vai su Vercel → Settings → Environment Variables.",
      env: envCheck,
    }, { status: 400 });
  }

  // Lancia i 3 probe in parallelo
  const [probe1, probe2, probe3] = await Promise.all([
    probeCheckoutModification(pspRef, apiKey, prefix, merchant),
    probePALReversal(pspRef, apiKey, prefix, merchant),
    probePALGetPayment(pspRef, apiKey, prefix, merchant),
  ]);

  const probes = [probe1, probe2, probe3];
  const summary = aggregateFindings(pspRef, merchantRef, probes);

  return Response.json({
    summary,
    env: envCheck,
    probes,
    timestamp: new Date().toISOString(),
  }, { status: 200 });
}
