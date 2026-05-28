// app/auth/unauthorized/page.js
// Mostrata quando signIn() ritorna "/auth/unauthorized" (email non @delonghigroup.com)

"use client";

import { signIn } from "next-auth/react";

export default function UnauthorizedPage() {
  return (
    <main style={styles.main}>
      <div style={styles.card}>
        <span style={styles.icon}>⛔</span>
        <h1 style={styles.title}>Accesso non autorizzato</h1>
        <p style={styles.body}>
          Il tuo account Google non è autorizzato ad accedere a questo portale.
          <br /><br />
          Solo gli indirizzi email <strong style={{ color: "#e2e8f0" }}>@delonghigroup.com</strong> possono effettuare l'accesso.
        </p>
        <button
          onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
          style={styles.btn}
        >
          Prova con un altro account
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
    alignItems: "center",
    justifyContent: "center",
    padding: "24px 16px",
    fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
  },
  card: {
    width: "100%",
    maxWidth: 400,
    background: "#111118",
    border: "1px solid #7f1d1d",
    borderRadius: 8,
    padding: "40px 36px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 16,
    textAlign: "center",
  },
  icon: { fontSize: 40 },
  title: { fontSize: 20, fontWeight: 700, color: "#fca5a5", margin: 0 },
  body: { fontSize: 13, color: "#64748b", lineHeight: 1.7, margin: 0 },
  btn: {
    marginTop: 8,
    background: "transparent",
    border: "1px solid #1e293b",
    borderRadius: 6,
    padding: "10px 20px",
    fontSize: 13,
    fontFamily: "inherit",
    color: "#94a3b8",
    cursor: "pointer",
  },
};
