"use client";
import { useState } from "react";

// ── TAB: debug generale ───────────────────────────────────────────────────────
function DebugTab() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function runTests() {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const r = await fetch("/api/adyen-debug");
      const data = await r.json();
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={runTests}
        disabled={loading}
        style={{ ...s.btn, ...(loading ? s.btnDisabled : {}) }}
      >
        {loading ? "Esecuzione test…" : "▶ Esegui tutti i test"}
      </button>

      {error && <div style={s.errorBox}><strong>Errore di rete:</strong> {error}</div>}

      {result && (
        <div style={s.results}>
          <div style={s.summaryBox}>
            <div style={s.sectionLabel}>Riepilogo</div>
            <div style={s.summaryOverall}>{result.summary?.overall}</div>
            <div style={s.summaryRec}>💡 {result.summary?.recommendation}</div>
            <div style={s.envGrid}>
              {result.summary?.env && Object.entries(result.summary.env).map(([k, v]) => (
                <div key={k} style={s.envRow}>
                  <span style={s.envKey}>{k}</span>
                  <span style={s.envVal}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          {result.error && (
            <div style={s.errorBox}>
              <strong>{result.error}</strong><br />
              Mancanti: {result.missing?.join(", ")}<br />
              {result.fix}
            </div>
          )}

          {result.tests?.map((t, i) => (
            <div key={i} style={{ ...s.testCard, borderLeft: `4px solid ${t.ok ? "#22c55e" : "#ef4444"}` }}>
              <div style={s.testHeader}>
                <span style={s.testBadge(t.ok)}>{t.ok ? "✓ OK" : "✗ FAIL"}</span>
                <span style={s.testName}>{t.name}</span>
                {t.status && <span style={s.testStatus}>HTTP {t.status}</span>}
              </div>
              {t.notes?.map((n, j) => <div key={j} style={s.note}>{n}</div>)}
              {t.error && <div style={s.noteError}>Errore: {t.error}</div>}
            </div>
          ))}

          {result.summary?.how_to_get_payments && (
            <div style={s.infoBox}>
              <div style={s.infoTitle}>📋 Come recuperare pagamenti</div>
              <div style={s.infoRow}><strong>Best practice:</strong> {result.summary.how_to_get_payments.best_practice}</div>
              <div style={s.infoRow}><strong>Setup:</strong> {result.summary.how_to_get_payments.setup}</div>
              <div style={s.infoRow}><strong>Event codes Settled:</strong> {result.summary.how_to_get_payments.event_codes.settled.join(", ")}</div>
              <div style={s.infoRow}><strong>Event codes USD/CAD Authorised:</strong> {result.summary.how_to_get_payments.event_codes.authorised_usd_cad.join(", ")}</div>
              <div style={s.infoRow}><strong>Alternativa batch:</strong> {result.summary.how_to_get_payments.alternative_batch}</div>
            </div>
          )}

          <details style={s.rawDetails}>
            <summary style={s.rawSummary}>Mostra JSON grezzo</summary>
            <pre style={s.pre}>{JSON.stringify(result, null, 2)}</pre>
          </details>
        </div>
      )}
    </div>
  );
}

// ── TAB: payment status lookup ────────────────────────────────────────────────
function StatusTab() {
  const [pspRef, setPspRef] = useState("NZJ656JJ3LHLN3X3");
  const [merchantRef, setMerchantRef] = useState("SFKWEU00082245");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function lookup() {
    if (!pspRef.trim()) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const params = new URLSearchParams({ pspReference: pspRef.trim() });
      if (merchantRef.trim()) params.set("merchantReference", merchantRef.trim());
      const r = await fetch(`/api/adyen-payment-status?${params}`);
      const data = await r.json();
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const verdictColor = result?.summary?.verdict?.startsWith("✅") ? "#22c55e"
    : result?.summary?.verdict?.startsWith("⚠️") ? "#f59e0b"
    : result?.summary?.verdict?.startsWith("❌") ? "#ef4444"
    : "#94a3b8";

  return (
    <div>
      {/* Input form */}
      <div style={s.formBox}>
        <div style={s.formRow}>
          <label style={s.label}>PSP Reference</label>
          <input
            style={s.input}
            value={pspRef}
            onChange={e => setPspRef(e.target.value)}
            placeholder="es. NZJ656JJ3LHLN3X3"
            spellCheck={false}
          />
        </div>
        <div style={s.formRow}>
          <label style={s.label}>Merchant Reference <span style={s.optional}>(opzionale)</span></label>
          <input
            style={s.input}
            value={merchantRef}
            onChange={e => setMerchantRef(e.target.value)}
            placeholder="es. SFKWEU00082245"
            spellCheck={false}
          />
        </div>
        <button
          onClick={lookup}
          disabled={loading || !pspRef.trim()}
          style={{ ...s.btn, ...(loading || !pspRef.trim() ? s.btnDisabled : {}) }}
        >
          {loading ? "Ricerca in corso…" : "🔍 Cerca pagamento"}
        </button>
      </div>

      {error && <div style={s.errorBox}><strong>Errore di rete:</strong> {error}</div>}

      {result && (
        <div style={s.results}>
          {/* Verdict */}
          {result.summary && (
            <div style={{ ...s.summaryBox, borderLeft: `4px solid ${verdictColor}` }}>
              <div style={s.sectionLabel}>Verdetto</div>
              <div style={{ ...s.summaryOverall, color: verdictColor }}>
                {result.summary.verdict}
              </div>
              <div style={s.summaryRec}>💡 {result.summary.recommendation}</div>

              <div style={{ marginTop: 12, ...s.envGrid }}>
                <div style={s.envRow}>
                  <span style={s.envKey}>pspReference cercato</span>
                  <span style={{ ...s.envVal, fontWeight: 600, color: "#e2e8f0" }}>{result.summary.pspReference}</span>
                </div>
                <div style={s.envRow}>
                  <span style={s.envKey}>merchantReference</span>
                  <span style={s.envVal}>{result.summary.merchantReference}</span>
                </div>
                <div style={s.envRow}>
                  <span style={s.envKey}>Probe trovato</span>
                  <span style={s.envVal}>{result.summary.probesSummary?.found} / {result.probes?.length}</span>
                </div>
              </div>

              <div style={s.hintBox}>
                ℹ️ {result.summary.hint}
              </div>
            </div>
          )}

          {/* Env errors */}
          {result.error && (
            <div style={s.errorBox}>
              <strong>{result.error}</strong><br />
              Mancanti: {result.missing?.join(", ")}<br />
              {result.fix}
            </div>
          )}

          {/* Individual probes */}
          {result.probes?.map((p, i) => {
            const probeColor = p.found === true ? "#22c55e"
              : p.found === false ? "#ef4444"
              : "#64748b";
            return (
              <div key={i} style={{ ...s.testCard, borderLeft: `4px solid ${probeColor}` }}>
                <div style={s.testHeader}>
                  <span style={s.testBadge(p.found === true)}>
                    {p.found === true ? "✓ TROVATO" : p.found === false ? "✗ NON TROVATO" : "? N/D"}
                  </span>
                  <span style={s.testName}>{p.probe}</span>
                  {p.status && <span style={s.testStatus}>HTTP {p.status}</span>}
                </div>
                {p.notes?.map((n, j) => <div key={j} style={s.note}>{n}</div>)}
                {p.error && <div style={s.noteError}>Errore: {p.error}</div>}
                {p.details && (
                  <details style={{ marginTop: 8 }}>
                    <summary style={s.rawSummary}>Dettagli risposta Adyen</summary>
                    <pre style={{ ...s.pre, marginTop: 6 }}>{JSON.stringify(p.details, null, 2)}</pre>
                  </details>
                )}
              </div>
            );
          })}

          {/* Env info */}
          {result.env && (
            <div style={s.summaryBox}>
              <div style={s.sectionLabel}>Configurazione usata</div>
              <div style={s.envGrid}>
                {Object.entries(result.env).map(([k, v]) => (
                  <div key={k} style={s.envRow}>
                    <span style={s.envKey}>{k}</span>
                    <span style={s.envVal}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <details style={s.rawDetails}>
            <summary style={s.rawSummary}>Mostra JSON grezzo</summary>
            <pre style={s.pre}>{JSON.stringify(result, null, 2)}</pre>
          </details>
        </div>
      )}
    </div>
  );
}

// ── ROOT COMPONENT ────────────────────────────────────────────────────────────
export default function Home() {
  const [tab, setTab] = useState("status"); // "debug" | "status"

  return (
    <main style={s.main}>
      <div style={s.card}>
        <div style={s.header}>
          <span style={s.logo}>⬡</span>
          <h1 style={s.title}>Adyen API Debugger</h1>
          <p style={s.subtitle}>Verifica autenticazione e stato pagamenti verso gli endpoint live Adyen</p>
        </div>

        {/* Tab switcher */}
        <div style={s.tabs}>
          <button
            onClick={() => setTab("status")}
            style={{ ...s.tab, ...(tab === "status" ? s.tabActive : {}) }}
          >
            🔍 Stato pagamento
          </button>
          <button
            onClick={() => setTab("debug")}
            style={{ ...s.tab, ...(tab === "debug" ? s.tabActive : {}) }}
          >
            🛠 Debug connettività
          </button>
        </div>

        {tab === "status" ? <StatusTab /> : <DebugTab />}
      </div>
    </main>
  );
}

// ── STYLES ────────────────────────────────────────────────────────────────────
const s = {
  main: {
    minHeight: "100vh",
    background: "#0a0a0f",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    padding: "40px 16px",
    fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
  },
  card: {
    width: "100%",
    maxWidth: 760,
  },
  header: { marginBottom: 28 },
  logo: { fontSize: 32, color: "#0ff", display: "block", marginBottom: 8 },
  title: { fontSize: 28, fontWeight: 700, color: "#e2e8f0", margin: "0 0 8px", letterSpacing: "-0.5px" },
  subtitle: { color: "#64748b", fontSize: 14, margin: 0 },

  // Tabs
  tabs: { display: "flex", gap: 8, marginBottom: 28 },
  tab: {
    background: "transparent",
    border: "1px solid #1e293b",
    borderRadius: 4,
    padding: "8px 18px",
    fontSize: 13,
    fontFamily: "inherit",
    color: "#475569",
    cursor: "pointer",
    transition: "all 0.15s",
    fontWeight: 600,
  },
  tabActive: {
    background: "#0ff",
    color: "#0a0a0f",
    borderColor: "#0ff",
  },

  // Form
  formBox: {
    background: "#111118",
    border: "1px solid #1e293b",
    borderRadius: 6,
    padding: 20,
    marginBottom: 20,
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  formRow: { display: "flex", flexDirection: "column", gap: 6 },
  label: { color: "#64748b", fontSize: 11, letterSpacing: "1.5px", textTransform: "uppercase" },
  optional: { color: "#334155", fontStyle: "italic", textTransform: "none", letterSpacing: 0, fontSize: 11 },
  input: {
    background: "#0d0d14",
    border: "1px solid #1e293b",
    borderRadius: 4,
    padding: "10px 14px",
    fontSize: 13,
    fontFamily: "inherit",
    color: "#e2e8f0",
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
  },

  // Button
  btn: {
    background: "#0ff",
    color: "#0a0a0f",
    border: "none",
    borderRadius: 4,
    padding: "12px 28px",
    fontSize: 14,
    fontFamily: "inherit",
    fontWeight: 700,
    cursor: "pointer",
    letterSpacing: "0.5px",
    transition: "opacity 0.15s",
    alignSelf: "flex-start",
  },
  btnDisabled: { opacity: 0.4, cursor: "not-allowed" },

  // Results
  results: { display: "flex", flexDirection: "column", gap: 16 },
  summaryBox: {
    background: "#111118",
    border: "1px solid #1e293b",
    borderRadius: 6,
    padding: 20,
  },
  sectionLabel: { color: "#64748b", fontSize: 11, letterSpacing: "2px", textTransform: "uppercase", marginBottom: 8 },
  summaryOverall: { fontSize: 16, color: "#e2e8f0", fontWeight: 600, marginBottom: 10 },
  summaryRec: { fontSize: 13, color: "#94a3b8", marginBottom: 16, lineHeight: 1.5 },
  hintBox: {
    marginTop: 14,
    padding: "10px 14px",
    background: "#0d1117",
    border: "1px solid #1e3a5f",
    borderRadius: 4,
    fontSize: 11,
    color: "#475569",
    lineHeight: 1.6,
  },
  envGrid: { display: "flex", flexDirection: "column", gap: 6 },
  envRow: { display: "flex", gap: 12, fontSize: 12 },
  envKey: { color: "#475569", minWidth: 240 },
  envVal: { color: "#94a3b8" },

  testCard: {
    background: "#111118",
    border: "1px solid #1e293b",
    borderRadius: 6,
    padding: 16,
  },
  testHeader: { display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" },
  testBadge: (ok) => ({
    fontSize: 11,
    fontWeight: 700,
    padding: "2px 8px",
    borderRadius: 3,
    background: ok ? "#14532d" : "#450a0a",
    color: ok ? "#22c55e" : "#ef4444",
    letterSpacing: "1px",
    whiteSpace: "nowrap",
  }),
  testName: { color: "#cbd5e1", fontSize: 13, fontWeight: 600, flex: 1 },
  testStatus: { color: "#475569", fontSize: 12 },
  note: { fontSize: 12, color: "#94a3b8", paddingLeft: 8, borderLeft: "2px solid #1e293b", marginTop: 4, lineHeight: 1.5 },
  noteError: { fontSize: 12, color: "#f87171", paddingLeft: 8, marginTop: 4 },
  infoBox: { background: "#0f172a", border: "1px solid #1e3a5f", borderRadius: 6, padding: 20 },
  infoTitle: { color: "#38bdf8", fontWeight: 700, fontSize: 13, marginBottom: 12 },
  infoRow: { fontSize: 12, color: "#94a3b8", marginBottom: 6, lineHeight: 1.5 },
  errorBox: {
    background: "#1c0505",
    border: "1px solid #7f1d1d",
    borderRadius: 6,
    padding: 16,
    color: "#fca5a5",
    fontSize: 13,
    lineHeight: 1.6,
  },
  rawDetails: { marginTop: 8 },
  rawSummary: { color: "#475569", fontSize: 12, cursor: "pointer", userSelect: "none", marginBottom: 8 },
  pre: {
    background: "#0d0d14",
    border: "1px solid #1e293b",
    borderRadius: 4,
    padding: 16,
    fontSize: 11,
    color: "#64748b",
    overflowX: "auto",
    lineHeight: 1.5,
    margin: 0,
  },
};
