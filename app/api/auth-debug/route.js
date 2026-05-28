// app/api/auth-debug/route.js
//
// Endpoint di debug: verifica la configurazione NextAuth senza esporre segreti.
// RIMUOVI o proteggi questo endpoint prima di andare in produzione.
//
// Chiamata: GET /api/auth-debug

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const clientId     = process.env.GOOGLE_CLIENT_ID     || "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
  const nextauthUrl  = process.env.NEXTAUTH_URL          || "";
  const nextauthSecret = process.env.NEXTAUTH_SECRET     || "";

  // Verifica formato GOOGLE_CLIENT_ID (deve finire con .apps.googleusercontent.com)
  const clientIdValid = clientId.endsWith(".apps.googleusercontent.com");

  // Verifica che NEXTAUTH_URL non abbia slash finale
  const urlHasTrailingSlash = nextauthUrl.endsWith("/");

  // Verifica che NEXTAUTH_URL corrisponda al dominio Vercel attuale
  const vercelUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null;
  const urlMatchesVercel = vercelUrl ? nextauthUrl === vercelUrl : null;

  const checks = {
    GOOGLE_CLIENT_ID: {
      present:      !!clientId,
      length:       clientId.length,
      format_ok:    clientIdValid,
      preview:      clientId ? `${clientId.slice(0, 12)}...${clientId.slice(-30)}` : "❌ MANCANTE",
      note:         clientIdValid ? "✅ Formato corretto" : "❌ Deve finire con .apps.googleusercontent.com",
    },
    GOOGLE_CLIENT_SECRET: {
      present:   !!clientSecret,
      length:    clientSecret.length,
      preview:   clientSecret ? `${clientSecret.slice(0, 6)}...${clientSecret.slice(-4)}` : "❌ MANCANTE",
      note:      clientSecret.length >= 20 ? "✅ Lunghezza OK" : "⚠️ Sembra troppo corta",
    },
    NEXTAUTH_URL: {
      present:            !!nextauthUrl,
      value:              nextauthUrl,
      trailing_slash:     urlHasTrailingSlash ? "❌ HA slash finale — rimuovilo" : "✅ OK",
      matches_vercel_url: urlMatchesVercel === null ? "⚠️ VERCEL_URL non disponibile" : urlMatchesVercel ? "✅ Corrisponde" : `❌ Non corrisponde a ${vercelUrl}`,
    },
    NEXTAUTH_SECRET: {
      present: !!nextauthSecret,
      length:  nextauthSecret.length,
      note:    nextauthSecret.length >= 32 ? "✅ Lunghezza OK (>=32 chars)" : "❌ Troppo corto — usa: openssl rand -base64 32",
    },
    VERCEL_URL: {
      value: vercelUrl || "non disponibile (ambiente non-Vercel)",
    },
  };

  const allOk = clientId && clientIdValid && clientSecret && nextauthUrl && !urlHasTrailingSlash && nextauthSecret.length >= 32;

  return Response.json({
    status:   allOk ? "✅ Configurazione OK" : "⚠️ Problemi rilevati",
    callback_url_expected: nextauthUrl ? `${nextauthUrl}/api/auth/callback/google` : "NEXTAUTH_URL mancante",
    checks,
    reminder: "Verifica che il callback_url_expected sia nella lista 'Authorized redirect URIs' su Google Cloud Console.",
  });
}
