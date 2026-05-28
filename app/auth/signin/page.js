// app/auth/signin/page.js
//
// ⚠️  GOTCHA #11 — NON usare window.location.href = '/api/auth/signin/google'
//     Questo bypassa il CSRF token che NextAuth genera internamente
//     e causa esattamente il 302 verso ?error=google che stai vedendo.
//
//     Il modo corretto è usare la funzione `signIn("google")` di next-auth/react,
//     che gestisce automaticamente il CSRF token e il callbackUrl.
//
// ⚠️  GOTCHA #12 — `useSearchParams()` richiede Suspense in Next.js 14.
//     Senza il wrapper, la pagina lancia un errore durante il build/render.

"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

// Errori OAuth → messaggio leggibile
const ERROR_MESSAGES = {
  OAuthSignin:         "Errore durante l'avvio del login Google. Riprova.",
  OAuthCallback:       "Errore durante il callback OAuth. Riprova.",
  OAuthCreateAccount:  "Impossibile creare l'account. Contatta l'amministratore.",
  EmailCreateAccount:  "Impossibile creare l'account email.",
  Callback:            "Errore nel callback di autenticazione.",
  OAuthAccountNotLinked: "Email già usata con un altro provider.",
  AccessDenied:        "Accesso negato. Solo email @delonghigroup.com sono autorizzate.",
  Verification:        "Token di verifica scaduto o già usato.",
  Default:             "Errore di autenticazione. Riprova.",
  google:              "Errore Google OAuth. Verifica le credenziali nel Google Cloud Console.",
};

function SignInContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";

  const errorMessage = error ? (ERROR_MESSAGES[error] || ERROR_MESSAGES.Default) : null;

  async function handleSignIn() {
    // ✅ Modo corretto: signIn() gestisce CSRF token automaticamente
    await signIn("google", {
      callbackUrl,
      // redirect: true è il default — lascialo così
    });
  }

  return (
    <main style={styles.main}>
      <div style={styles.card}>
        {/* Logo / Brand */}
        <div style={styles.brand}>
          <span style={styles.brandIcon}>⬡</span>
          <h1 style={styles.title}>De'Longhi Group</h1>
          <p style={styles.subtitle}>Portale interno — accesso riservato</p>
        </div>

        {/* Errore OAuth */}
        {errorMessage && (
          <div style={styles.errorBox} role="alert">
            <span style={styles.errorIcon}>⚠</span>
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Pulsante Google */}
        <button onClick={handleSignIn} style={styles.googleBtn}>
          <GoogleIcon />
          <span>Accedi con Google</span>
        </button>

        <p style={styles.hint}>
          Solo gli account <strong>@delonghigroup.com</strong> sono autorizzati.
        </p>
      </div>
    </main>
  );
}

// Wrapper con Suspense obbligatorio per useSearchParams() in Next.js 14
export default function SignInPage() {
  return (
    <Suspense fallback={<SignInSkeleton />}>
      <SignInContent />
    </Suspense>
  );
}

function SignInSkeleton() {
  return (
    <main style={styles.main}>
      <div style={{ ...styles.card, opacity: 0.5 }}>
        <div style={styles.brand}>
          <span style={styles.brandIcon}>⬡</span>
        </div>
      </div>
    </main>
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
    border: "1px solid #1e293b",
    borderRadius: 8,
    padding: "40px 36px",
    display: "flex",
    flexDirection: "column",
    gap: 24,
  },
  brand: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
    textAlign: "center",
  },
  brandIcon: {
    fontSize: 40,
    color: "#0ff",
    lineHeight: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    color: "#e2e8f0",
    margin: 0,
    letterSpacing: "-0.5px",
  },
  subtitle: {
    fontSize: 12,
    color: "#475569",
    margin: 0,
    letterSpacing: "0.5px",
  },
  errorBox: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    background: "#1c0505",
    border: "1px solid #7f1d1d",
    borderRadius: 6,
    padding: "12px 14px",
    color: "#fca5a5",
    fontSize: 13,
    lineHeight: 1.5,
  },
  errorIcon: {
    fontSize: 16,
    flexShrink: 0,
    marginTop: 1,
  },
  googleBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    background: "#fff",
    color: "#1a1a1a",
    border: "none",
    borderRadius: 6,
    padding: "13px 20px",
    fontSize: 14,
    fontFamily: "inherit",
    fontWeight: 600,
    cursor: "pointer",
    letterSpacing: "0.2px",
    transition: "opacity 0.15s, transform 0.1s",
    width: "100%",
  },
  hint: {
    fontSize: 11,
    color: "#334155",
    textAlign: "center",
    margin: 0,
    lineHeight: 1.6,
  },
};
