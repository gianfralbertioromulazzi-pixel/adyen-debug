// app/auth/signin/page.js
"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

const ERROR_MESSAGES = {
  OAuthSignin:          "Errore durante l'avvio del login Google. Riprova.",
  OAuthCallback:        "Errore durante il callback OAuth.",
  OAuthCreateAccount:   "Impossibile creare l'account. Contatta l'amministratore.",
  OAuthAccountNotLinked:"Email già usata con un altro provider.",
  AccessDenied:         "Accesso negato. Solo email @delonghigroup.com sono autorizzate.",
  CredentialsSignin:    "Username o password non corretti.",
  Default:              "Errore di autenticazione. Riprova.",
  google:               "Errore Google OAuth. Verifica le credenziali nel Google Cloud Console.",
};

function SignInContent() {
  const searchParams = useSearchParams();
  const error        = searchParams.get("error");
  const callbackUrl  = searchParams.get("callbackUrl") || "/dashboard";

  const [tab, setTab]           = useState("google"); // "google" | "credentials"
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);

  const errorMessage = error ? (ERROR_MESSAGES[error] || ERROR_MESSAGES.Default) : null;

  async function handleGoogleSignIn() {
    await signIn("google", { callbackUrl });
  }

  async function handleCredentialsSignIn(e) {
    e.preventDefault();
    setLoading(true);
    await signIn("credentials", { username, password, callbackUrl });
    setLoading(false);
  }

  // Nascondi tab credentials se il provider non è abilitato
  const showCredentialsTab = true; // Il server decide se il provider esiste — il tab è sempre visibile ma signIn fallirà se disabilitato

  return (
    <main style={s.main}>
      <div style={s.card}>
        {/* Brand */}
        <div style={s.brand}>
          <span style={s.brandIcon}>⬡</span>
          <h1 style={s.title}>De'Longhi Group</h1>
          <p style={s.subtitle}>Portale interno — accesso riservato</p>
        </div>

        {/* Errore */}
        {errorMessage && (
          <div style={s.errorBox} role="alert">
            <span style={s.errorIcon}>⚠</span>
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Tab switcher */}
        <div style={s.tabs}>
          <button
            onClick={() => setTab("google")}
            style={{ ...s.tab, ...(tab === "google" ? s.tabActive : {}) }}
          >
            Google SSO
          </button>
          <button
            onClick={() => setTab("credentials")}
            style={{ ...s.tab, ...(tab === "credentials" ? s.tabActive : {}) }}
          >
            Username / Password
          </button>
        </div>

        {/* Tab: Google */}
        {tab === "google" && (
          <div style={s.tabContent}>
            <button onClick={handleGoogleSignIn} style={s.googleBtn}>
              <GoogleIcon />
              <span>Accedi con Google</span>
            </button>
            <p style={s.hint}>
              Solo gli account <strong>@delonghigroup.com</strong> sono autorizzati.
            </p>
          </div>
        )}

        {/* Tab: Credentials */}
        {tab === "credentials" && (
          <div style={s.tabContent}>
            <form onSubmit={handleCredentialsSignIn} style={s.form}>
              <div style={s.formRow}>
                <label style={s.label}>Username</label>
                <input
                  style={s.input}
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="mario.rossi"
                  autoComplete="username"
                  required
                />
              </div>
              <div style={s.formRow}>
                <label style={s.label}>Password</label>
                <input
                  style={s.input}
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                style={{ ...s.submitBtn, ...(loading ? s.btnDisabled : {}) }}
              >
                {loading ? "Accesso in corso…" : "Accedi"}
              </button>
            </form>
            <p style={s.hint}>
              Accesso temporaneo. Sarà rimosso a favore del solo Google SSO.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<div style={{ background: "#0a0a0f", minHeight: "100vh" }} />}>
      <SignInContent />
    </Suspense>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" style={{ flexShrink: 0 }}>
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.039l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z"/>
    </svg>
  );
}

const s = {
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
    maxWidth: 420,
    background: "#111118",
    border: "1px solid #1e293b",
    borderRadius: 8,
    padding: "40px 36px",
    display: "flex",
    flexDirection: "column",
    gap: 24,
  },
  brand: { display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textAlign: "center" },
  brandIcon: { fontSize: 40, color: "#0ff", lineHeight: 1 },
  title: { fontSize: 22, fontWeight: 700, color: "#e2e8f0", margin: 0, letterSpacing: "-0.5px" },
  subtitle: { fontSize: 12, color: "#475569", margin: 0 },
  errorBox: {
    display: "flex", alignItems: "flex-start", gap: 10,
    background: "#1c0505", border: "1px solid #7f1d1d", borderRadius: 6,
    padding: "12px 14px", color: "#fca5a5", fontSize: 13, lineHeight: 1.5,
  },
  errorIcon: { fontSize: 16, flexShrink: 0, marginTop: 1 },
  tabs: { display: "flex", gap: 4, background: "#0d0d14", borderRadius: 6, padding: 4 },
  tab: {
    flex: 1, background: "transparent", border: "none", borderRadius: 4,
    padding: "8px 12px", fontSize: 12, fontFamily: "inherit",
    color: "#475569", cursor: "pointer", fontWeight: 600, transition: "all 0.15s",
  },
  tabActive: { background: "#1e293b", color: "#e2e8f0" },
  tabContent: { display: "flex", flexDirection: "column", gap: 16 },
  googleBtn: {
    display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
    background: "#fff", color: "#1a1a1a", border: "none", borderRadius: 6,
    padding: "13px 20px", fontSize: 14, fontFamily: "inherit", fontWeight: 600,
    cursor: "pointer", width: "100%",
  },
  form: { display: "flex", flexDirection: "column", gap: 14 },
  formRow: { display: "flex", flexDirection: "column", gap: 6 },
  label: { color: "#64748b", fontSize: 11, letterSpacing: "1.5px", textTransform: "uppercase" },
  input: {
    background: "#0d0d14", border: "1px solid #1e293b", borderRadius: 4,
    padding: "10px 14px", fontSize: 13, fontFamily: "inherit", color: "#e2e8f0",
    outline: "none", width: "100%", boxSizing: "border-box",
  },
  submitBtn: {
    background: "#0ff", color: "#0a0a0f", border: "none", borderRadius: 6,
    padding: "12px 20px", fontSize: 14, fontFamily: "inherit", fontWeight: 700,
    cursor: "pointer", width: "100%", marginTop: 4,
  },
  btnDisabled: { opacity: 0.4, cursor: "not-allowed" },
  hint: { fontSize: 11, color: "#334155", textAlign: "center", margin: 0, lineHeight: 1.6 },
};
