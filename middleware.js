// middleware.js  (nella root del progetto, NON dentro /app)
//
// ⚠️  GOTCHA #7 — Il middleware di Next.js 14 App Router viene eseguito
//     PRIMA di qualsiasi route handler, incluse quelle di NextAuth.
//     Se il matcher include /api/auth/**, NextAuth non riceve mai la request
//     e il flow OAuth si spezza in silenzio.
//
// ⚠️  GOTCHA #8 — NON usare `getServerSession(authOptions)` nel middleware.
//     Il middleware gira sull'Edge Runtime che non supporta tutti i moduli Node.
//     Usa invece il `withAuth` wrapper di next-auth/middleware oppure
//     leggi direttamente il JWT cookie come sotto.
//
// ⚠️  GOTCHA #9 — Il file DEVE stare nella root (accanto a package.json),
//     NON dentro /src o /app.

import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  // Questa funzione viene chiamata solo se l'utente È autenticato.
  // Puoi aggiungere logica extra (es. check ruoli) qui.
  function middleware(req) {
    return NextResponse.next();
  },
  {
    callbacks: {
      // authorized viene chiamata per ogni request che matcha il matcher.
      // Ritorna true  → request prosegue
      // Ritorna false → redirect a pages.signIn (definito in authOptions)
      authorized: ({ token }) => {
        // token è null se non autenticato → redirect a signin
        return !!token;
      },
    },

    // ⚠️  Deve puntare alla stessa pagina definita in authOptions.pages.signIn
    pages: {
      signIn: "/auth/signin",
    },
  }
);

export const config = {
  matcher: [
    /*
     * Proteggi TUTTE le route TRANNE:
     * - /api/auth/**          → NextAuth handlers (OBBLIGATORIO escludere)
     * - /auth/signin          → pagina di login
     * - /auth/unauthorized    → pagina accesso negato
     * - /_next/**             → file statici Next.js
     * - /favicon.ico, /robots.txt, ecc.
     *
     * Il pattern usa negative lookahead per escludere le route pubbliche.
     */
    "/((?!api/auth|auth/signin|auth/unauthorized|_next/static|_next/image|favicon.ico|robots.txt).*)",
  ],
};
