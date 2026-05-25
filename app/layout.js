export const metadata = {
  title: "Adyen API Debugger",
  description: "Debug Adyen live API authentication and connectivity",
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
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  );
}
