// lib/auth.js
//
// Configurazione NextAuth con due provider:
//   1. Google SSO    — sempre attivo
//   2. Credentials   — attivo finché CREDENTIALS_ENABLED=true nelle env vars
//
// Per disabilitare il login username/password tra qualche mese:
//   Vercel → Settings → Environment Variables → CREDENTIALS_ENABLED → cambia in "false"
//   Nessun redeploy necessario (variabile letta a runtime).
//
// Formato CREDENTIALS_USERS (env var su Vercel):
//   JSON array encodato in base64:
//   [{"username":"mario.rossi","passwordHash":"salt:hash"}, ...]
//   Genera gli hash con lo script scripts/hash-password.js

import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { scryptSync, timingSafeEqual } from "crypto";

// ── Verifica password con scrypt ──────────────────────────────────────────────
function verifyPassword(password, storedHash) {
  try {
    const [salt, hash] = storedHash.split(":");
    const hashBuffer   = Buffer.from(hash, "hex");
    const derived      = scryptSync(password, salt, 64);
    // timingSafeEqual previene timing attacks
    return timingSafeEqual(hashBuffer, derived);
  } catch {
    return false;
  }
}

// ── Carica utenti da env var ──────────────────────────────────────────────────
function loadUsers() {
  const raw = process.env.CREDENTIALS_USERS || "";
  if (!raw) return [];
  try {
    return JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
  } catch {
    console.error("[auth] CREDENTIALS_USERS non è un JSON base64 valido");
    return [];
  }
}

// ── Costruisce la lista provider dinamicamente ────────────────────────────────
function buildProviders() {
  const providers = [
    GoogleProvider({
      clientId:     process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          prompt:        "consent",
          access_type:   "offline",
          response_type: "code",
        },
      },
    }),
  ];

  // Aggiunge Credentials solo se CREDENTIALS_ENABLED=true
  if (process.env.CREDENTIALS_ENABLED === "true") {
    providers.push(
      CredentialsProvider({
        id:   "credentials",
        name: "Username e Password",
        credentials: {
          username: { label: "Username", type: "text",     placeholder: "mario.rossi" },
          password: { label: "Password", type: "password" },
        },
        async authorize(credentials) {
          if (!credentials?.username || !credentials?.password) return null;

          const users = loadUsers();
          const user  = users.find(u => u.username === credentials.username);
          if (!user) return null;

          const valid = verifyPassword(credentials.password, user.passwordHash);
          if (!valid) return null;

          // Ritorna oggetto utente — finisce nel token JWT
          return {
            id:    user.username,
            name:  user.displayName || user.username,
            email: user.email || `${user.username}@delonghigroup.com`,
          };
        },
      })
    );
  }

  return providers;
}

export const authOptions = {
  providers: buildProviders(),

  pages: {
    signIn: "/auth/signin",
    error:  "/auth/signin",
  },

  callbacks: {
    async signIn({ account, profile }) {
      // Credentials: authorize() ha già validato — lascia passare
      if (account?.provider === "credentials") return true;

      // Google: verifica dominio
      if (account?.provider === "google") {
        if (!profile?.email_verified)                        return false;
        if (!profile.email.endsWith("@delonghigroup.com"))   return "/auth/unauthorized";
        return true;
      }

      return false;
    },

    async session({ session, token }) {
      if (token?.sub)      session.user.id       = token.sub;
      if (token?.provider) session.user.provider = token.provider;
      return session;
    },

    async jwt({ token, account }) {
      if (account) token.provider = account.provider;
      return token;
    },
  },

  session: {
    strategy: "jwt",
    maxAge:   8 * 60 * 60, // 8 ore
  },

  secret: process.env.NEXTAUTH_SECRET,
};
