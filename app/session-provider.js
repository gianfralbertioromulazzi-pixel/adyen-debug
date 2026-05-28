// app/session-provider.js
//
// ⚠️  GOTCHA #10 — SessionProvider usa React Context e quindi DEVE essere
//     un Client Component ("use client"). Non può stare direttamente in
//     layout.js perché layout.js è un Server Component per default.
//     Questo wrapper risolve il problema.

"use client";

import { SessionProvider } from "next-auth/react";

export default function AuthSessionProvider({ children }) {
  return (
    <SessionProvider>
      {children}
    </SessionProvider>
  );
}
