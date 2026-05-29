// app/api/firestore-debug/route.js
// ⚠️  TEMPORANEO — rimuovi dopo il debug

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const projectId   = process.env.GOOGLE_PROJECT_ID    || "";
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL  || "";
  const privateKey  = process.env.GOOGLE_PRIVATE_KEY   || "";

  const privateKeyFixed = privateKey.replace(/\\n/g, "\n");

  const checks = {
    GOOGLE_PROJECT_ID: {
      present:  !!projectId,
      value:    projectId || "❌ MANCANTE",
    },
    GOOGLE_CLIENT_EMAIL: {
      present:  !!clientEmail,
      preview:  clientEmail ? `${clientEmail.slice(0, 20)}...` : "❌ MANCANTE",
      valid:    clientEmail.includes("@") && clientEmail.includes(".iam.gserviceaccount.com"),
    },
    GOOGLE_PRIVATE_KEY: {
      present:         !!privateKey,
      length:          privateKey.length,
      hasLiteralNewlines:  privateKey.includes("\\n"),   // Vercel ha salvato \n come stringa
      hasRealNewlines:     privateKey.includes("\n"),    // corretto
      startsCorrectly: privateKeyFixed.startsWith("-----BEGIN PRIVATE KEY-----"),
      endsCorrectly:   privateKeyFixed.trimEnd().endsWith("-----END PRIVATE KEY-----"),
    },
  };

  const allOk = checks.GOOGLE_PROJECT_ID.present &&
                checks.GOOGLE_CLIENT_EMAIL.valid &&
                checks.GOOGLE_PRIVATE_KEY.startsCorrectly &&
                checks.GOOGLE_PRIVATE_KEY.endsCorrectly;

  // Prova connessione reale
  let connectionTest = null;
  try {
    const { initializeApp, getApps, cert, deleteApp } = require("firebase-admin/app");
    const { getFirestore } = require("firebase-admin/firestore");

    const appName = "debug-test-" + Date.now();
    const app = initializeApp({
      credential: cert({
        projectId:   projectId,
        clientEmail: clientEmail,
        privateKey:  privateKeyFixed,
      }),
    }, appName);

    const db = getFirestore(app);
    // Prova una lettura semplice
    await db.collection("_debug_test").limit(1).get();
    connectionTest = "✅ Connessione Firestore riuscita";
    await deleteApp(app);
  } catch (err) {
    connectionTest = `❌ ${err.message}`;
  }

  return Response.json({ allOk, checks, connectionTest });
}
