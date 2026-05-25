"use client";
import { useState } from "react";

export default function Home() {
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
    <main style={styles.main}>
      <div style={styles.card}>
        <div style={styles.header}>
          <span style={styles.logo}>⬡</span>
          <h1 style={styles.title}>Adyen API Debugger</h1>
          <p style={styles.subtitle}>
            Verifica autenticazione e connettività verso gli endpoint live Adyen
          </p>
        </div>

        <button
          onClick={runTests}
          disabled={loading}
          style={{ ...styles.btn, ...(loading ? styles.btnDisabled : {}) }}
        >
          {loading ? "Esecuzione test…" : "▶ Esegui tutti i test"}
        </button>

        {error && (
          <div style={styles.errorBox}>
            <strong>Errore di rete:</strong> {error}
          </div>
        )}

        {result && (
          <div style={styles.results}>
            {/* Summary */}
            <div style={styles.summaryBox}>
              <div style={styles.summaryTitle}>Riepilogo</div>
              <div style={styles.summaryOverall}>{result.summary?.overall}</div>
              <div style={styles.summaryRec}>
                💡 {result.summary?.recommendation}
              </div>
              <div style={styles.envGrid}>
                {result.summary?.env &&
                  Object.entries(result.summary.env).map(([k, v]) => (
                    <div key={k} style={styles.envRow}>
                      <span style={styles.envKey}>{k}</span>
                      <span style={styles.envVal}>{v}</span>
                    </div>
                  ))}
              </div>
            </div>

            {/* Error case (missing env) */}
            {result.error && (
              <div style={styles.errorBox}>
                <strong>{result.error}</strong>
                <br />
                Mancanti: {result.missing?.join(", ")}
                <br />
                {result.fix}
              </div>
            )}

            {/* Individual tests */}
            {result.tests?.map((t, i) => (
              <div
                key={i}
                style={{
                  ...styles.testCard,
                  borderLeft: `4px solid ${t.ok ? "#22c55e" : "#ef4444"}`,
                }}
              >
                <div style={styles.testHeader}>
                  <span style={styles.testBadge(t.ok)}>
                    {t.ok ? "✓ OK" : "✗ FAIL"}
                  </span>
                  <span style={styles.testName}>{t.name}</span>
                  {t.status && (
                    <span style={styles.testStatus}>HTTP {t.status}</span>
                  )}
                </div>
                {t.notes?.map((n, j) => (
                  <div key={j} style={styles.note}>
                    {n}
                  </div>
                ))}
                {t.error && (
                  <div style={styles.noteError}>Errore: {t.error}</div>
                )}
              </div>
            ))}

            {/* How to get payments */}
            {result.summary?.how_to_get_payments && (
              <div style={styles.infoBox}>
                <div style={styles.infoTitle}>
                  📋 Come recuperare pagamenti
                </div>
                <div style={styles.infoRow}>
                  <strong>Best practice:</strong>{" "}
                  {result.summary.how_to_get_payments.best_practice}
                </div>
                <div style={styles.infoRow}>
                  <strong>Setup:</strong>{" "}
                  {result.summary.how_to_get_payments.setup}
                </div>
                <div style={styles.infoRow}>
                  <strong>Event codes Settled:</strong>{" "}
                  {result.summary.how_to_get_payments.event_codes.settled.join(
                    ", "
                  )}
                </div>
                <div style={styles.infoRow}>
                  <strong>Event codes USD/CAD Authorised:</strong>{" "}
                  {result.summary.how_to_get_payments.event_codes.authorised_usd_cad.join(
                    ", "
                  )}
                </div>
                <div style={styles.infoRow}>
                  <strong>Alternativa batch:</strong>{" "}
                  {result.summary.how_to_get_payments.alternative_batch}
                </div>
              </div>
            )}

            {/* Raw JSON toggle */}
            <details style={styles.rawDetails}>
              <summary style={styles.rawSummary}>Mostra JSON grezzo</summary>
              <pre style={styles.pre}>{JSON.stringify(result, null, 2)}</pre>
            </details>
          </div>
        )}
      </div>
    </main>
  );
}

const styles = {
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
  header: {
    marginBottom: 32,
  },
  logo: {
    fontSize: 32,
    color: "#0ff",
    display: "block",
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: 700,
    color: "#e2e8f0",
    margin: "0 0 8px",
    letterSpacing: "-0.5px",
  },
  subtitle: {
    color: "#64748b",
    fontSize: 14,
    margin: 0,
  },
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
    marginBottom: 32,
    transition: "opacity 0.15s",
  },
  btnDisabled: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
  results: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  summaryBox: {
    background: "#111118",
    border: "1px solid #1e293b",
    borderRadius: 6,
    padding: 20,
  },
  summaryTitle: {
    color: "#64748b",
    fontSize: 11,
    letterSpacing: "2px",
    textTransform: "uppercase",
    marginBottom: 8,
  },
  summaryOverall: {
    fontSize: 16,
    color: "#e2e8f0",
    fontWeight: 600,
    marginBottom: 10,
  },
  summaryRec: {
    fontSize: 13,
    color: "#94a3b8",
    marginBottom: 16,
    lineHeight: 1.5,
  },
  envGrid: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  envRow: {
    display: "flex",
    gap: 12,
    fontSize: 12,
  },
  envKey: {
    color: "#475569",
    minWidth: 240,
  },
  envVal: {
    color: "#94a3b8",
  },
  testCard: {
    background: "#111118",
    border: "1px solid #1e293b",
    borderRadius: 6,
    padding: 16,
  },
  testHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
    flexWrap: "wrap",
  },
  testBadge: (ok) => ({
    fontSize: 11,
    fontWeight: 700,
    padding: "2px 8px",
    borderRadius: 3,
    background: ok ? "#14532d" : "#450a0a",
    color: ok ? "#22c55e" : "#ef4444",
    letterSpacing: "1px",
  }),
  testName: {
    color: "#cbd5e1",
    fontSize: 13,
    fontWeight: 600,
    flex: 1,
  },
  testStatus: {
    color: "#475569",
    fontSize: 12,
  },
  note: {
    fontSize: 12,
    color: "#94a3b8",
    paddingLeft: 8,
    borderLeft: "2px solid #1e293b",
    marginTop: 4,
    lineHeight: 1.5,
  },
  noteError: {
    fontSize: 12,
    color: "#f87171",
    paddingLeft: 8,
    marginTop: 4,
  },
  infoBox: {
    background: "#0f172a",
    border: "1px solid #1e3a5f",
    borderRadius: 6,
    padding: 20,
  },
  infoTitle: {
    color: "#38bdf8",
    fontWeight: 700,
    fontSize: 13,
    marginBottom: 12,
  },
  infoRow: {
    fontSize: 12,
    color: "#94a3b8",
    marginBottom: 6,
    lineHeight: 1.5,
  },
  errorBox: {
    background: "#1c0505",
    border: "1px solid #7f1d1d",
    borderRadius: 6,
    padding: 16,
    color: "#fca5a5",
    fontSize: 13,
    lineHeight: 1.6,
  },
  rawDetails: {
    marginTop: 8,
  },
  rawSummary: {
    color: "#475569",
    fontSize: 12,
    cursor: "pointer",
    userSelect: "none",
    marginBottom: 8,
  },
  pre: {
    background: "#0d0d14",
    border: "1px solid #1e293b",
    borderRadius: 4,
    padding: 16,
    fontSize: 11,
    color: "#64748b",
    overflowX: "auto",
    lineHeight: 1.5,
  },
};
