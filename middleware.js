// middleware.js  (nella root del progetto, NON dentro /app)

import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => {
        return !!token;
      },
    },
    pages: {
      signIn: "/auth/signin",
    },
  }
);

export const config = {
  matcher: [
    /*
     * Proteggi TUTTE le route TRANNE:
     * - /api/auth/**          → NextAuth handlers
     * - /api/webhooks/**      → webhook Adyen (chiamati da server esterno, no auth)
     * - /auth/signin          → pagina di login
     * - /auth/unauthorized    → pagina accesso negato
     * - /_next/**             → file statici Next.js
     */
    "/((?!api/auth|api/webhooks|auth/signin|auth/unauthorized|_next/static|_next/image|favicon.ico|robots.txt).*)",
  ],
};
