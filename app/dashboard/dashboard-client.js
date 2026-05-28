// app/dashboard/dashboard-client.js
"use client";

import { signOut } from "next-auth/react";

export default function DashboardClient({ session }) {
  return (
    <main style={styles.main}>
      <div style={styles.card}>
        <div style={styles.header}>
          <span style={styles.logo}>⬡</span>
          <div>
            <h1 style={styles.title}>Dashboard</h1>
            <p style={styles.subtitle}>De'Longhi Group Portal</p>
          </div>
        </div>

        <div style={styles.sessionBox}>
          <div style={styles.sectionLabel}>Sessione attiva</div>
          <div style={styles.row}>
            <span style={styles.key}>Nome</span>
            <span style={styles.val}>{session.user?.name || "—"}</span>
          </div>
          <div style={styles.row}>
            <span style={styles.key}>Email</span>
            <span style={styles.val}>{session.user?.email || "—"}</span>
          </div>
          <div style={styles.row}>
            <span style={styles.key}>Scadenza sessione</span>
            <span style={styles.val}>{session.expires ? new Date(session.expires).toLocaleString("it-IT") : "—"}</span>
          </div>
        </div>

        <button
          onClick={() => signOut({ callbackUrl: "/auth/signin" })}
          style={styles.signOutBtn}
        >
          Esci
        </button>
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
    maxWidth: 560,
    display: "flex",
    flexDirection: "column",
    gap: 24,
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 16,
  },
  logo: { fontSize: 36, color: "#0ff" },
  title: { fontSize: 26, fontWeight: 700, color: "#e2e8f0", margin: 0 },
  subtitle: { fontSize: 12, color: "#475569", margin: 0 },
  sessionBox: {
    background: "#111118",
    border: "1px solid #1e293b",
    borderRadius: 6,
    padding: 20,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  sectionLabel: {
    color: "#64748b",
    fontSize: 11,
    letterSpacing: "2px",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  row: { display: "flex", gap: 12, fontSize: 13 },
  key: { color: "#475569", minWidth: 160 },
  val: { color: "#e2e8f0" },
  signOutBtn: {
    alignSelf: "flex-start",
    background: "transparent",
    border: "1px solid #1e293b",
    borderRadius: 4,
    padding: "10px 20px",
    fontSize: 13,
    fontFamily: "inherit",
    color: "#64748b",
    cursor: "pointer",
  },
};
