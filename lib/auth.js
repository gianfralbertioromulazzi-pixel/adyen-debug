// lib/auth.js
//
// Centralizza la config NextAuth qui invece che nel route.js.
// Questo file viene importato da:
//   - app/api/auth/[...nextauth]/route.js  (handler HTTP)
//   - middleware.js                         (protezione route)
//   - server components                     (getServerSession)
//
// ⚠️  GOTCHA #3 — `pages.signIn` deve puntare alla tua pagina custom.
//     Se non è impostato, NextAuth usa la sua pagina built-in e il redirect
//     in caso di errore va su /api/auth/signin?error=... invece che sulla tua UI.
//
// ⚠️  GOTCHA #4 — Il callback `signIn` è il posto giusto per il domain check.
//     NON farlo nel callback `session` o `jwt` — lì il provider ha già autorizzato
//     e NextAuth ha già creato la sessione.

import GoogleProvider from "next-auth/providers/google";

export const authOptions = {
  // ── Provider ──────────────────────────────────────────────────────────────
  providers: [
    GoogleProvider({
      clientId:     process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,

      // ⚠️  GOTCHA #5 — Su Vercel, se non specifichi authorization.params,
      //     il refresh token non arriva e in alcuni setup il flow si interrompe.
      //     `access_type: "offline"` + `prompt: "consent"` garantisce il flow completo.
      authorization: {
        params: {
          prompt:        "consent",
          access_type:   "offline",
          response_type: "code",
        },
      },
    }),
  ],

  // ── Pagine custom ─────────────────────────────────────────────────────────
  // ⚠️  GOTCHA #3 (vedi sopra): senza questo, errori e redirect vanno sulle
  //     pagine built-in di NextAuth che su App Router possono non renderizzare.
  pages: {
    signIn:  "/auth/signin",
    error:   "/auth/signin",   // errori OAuth → torna sulla pagina di login con ?error=
  },

  // ── Callbacks ─────────────────────────────────────────────────────────────
  callbacks: {
    /**
     * signIn — eseguito PRIMA che la sessione venga creata.
     * Ritorna true  → login consentito
     * Ritorna false → login bloccato, redirect a /auth/signin?error=AccessDenied
     * Ritorna string → redirect su quella URL
     */
    async signIn({ account, profile }) {
      // Blocca tutto ciò che non è Google OAuth
      if (account?.provider !== "google") return false;

      // Verifica dominio email
      const email = profile?.email || "";
      if (!email.endsWith("@delonghigroup.com")) {
        // Redirect esplicito alla pagina "non autorizzato"
        return "/auth/unauthorized";
      }

      // Verifica che l'account Google sia verificato
      if (!profile?.email_verified) return false;

      return true;
    },

    /**
     * session — aggiunge dati extra alla sessione lato client.
     * Non fare controlli di sicurezza qui: usa signIn (sopra).
     */
    async session({ session, token }) {
      if (token?.sub) {
        session.user.id = token.sub;
      }
      return session;
    },

    /**
     * jwt — aggiunge dati al token JWT (httpOnly cookie).
     */
    async jwt({ token, account, profile }) {
      if (account && profile) {
        token.accessToken = account.access_token;
      }
      return token;
    },
  },

  // ── Sessione ──────────────────────────────────────────────────────────────
  session: {
    strategy: "jwt",        // "database" richiede un adapter; "jwt" funziona out-of-the-box
    maxAge:   8 * 60 * 60,  // 8 ore (giornata lavorativa)
  },

  // ── Sicurezza ─────────────────────────────────────────────────────────────
  // ⚠️  GOTCHA #6 — NEXTAUTH_SECRET è OBBLIGATORIO in produzione.
  //     NextAuth v4 lancia un errore silenzioso (non nel browser, solo nei log Vercel)
  //     se manca, causando esattamente il 302 verso ?error= che stai vedendo.
  secret: process.env.NEXTAUTH_SECRET,

  // ── Debug (rimuovi in produzione) ─────────────────────────────────────────
  // debug: process.env.NODE_ENV === "development",
};
