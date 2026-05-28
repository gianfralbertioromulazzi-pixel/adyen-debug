// app/layout.js
//
// Server Component (default). Importa il wrapper client per il SessionProvider.

import AuthSessionProvider from "./session-provider";

export const metadata = {
  title: "De'Longhi Group Portal",
  description: "Accesso riservato ai dipendenti De'Longhi Group",
};

export default function RootLayout({ children }) {
  return (
    <html lang="it">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{ margin: 0, padding: 0 }}>
        {/*
          ⚠️  AuthSessionProvider è un Client Component.
              Tutto ciò che è wrappato qui può accedere a useSession().
        */}
        <AuthSessionProvider>
          {children}
        </AuthSessionProvider>
      </body>
    </html>
  );
}
