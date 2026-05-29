// lib/firestore.js
//
// Client Firestore condiviso tra webhook receiver e API di lettura.
// Usa le credenziali del Service Account via variabili d'ambiente.
//
// ⚠️  PORTABILITÀ: quando sposti su server cloud proprietario,
//     cambi solo le 3 variabili d'ambiente — il codice resta identico.
//
// Variabili d'ambiente richieste:
//   GOOGLE_PROJECT_ID    — es. "delonghi-adyen-prod"
//   GOOGLE_CLIENT_EMAIL  — es. "adyen-webhook-writer@...iam.gserviceaccount.com"
//   GOOGLE_PRIVATE_KEY   — la chiave privata completa con \n

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore }                  from "firebase-admin/firestore";

function getFirestoreClient() {
  // Evita di inizializzare più volte in ambiente serverless
  if (getApps().length > 0) {
    return getFirestore();
  }

  // ⚠️  Vercel salva \n come stringa letterale — replace lo converte in newline reale
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

  initializeApp({
    credential: cert({
      projectId:   process.env.GOOGLE_PROJECT_ID,
      clientEmail: process.env.GOOGLE_CLIENT_EMAIL,
      privateKey,
    }),
  });

  return getFirestore();
}

export const db = getFirestoreClient();

// ── Collezioni ────────────────────────────────────────────────────────────────
// payment_events  — ogni riga = un evento webhook ricevuto da Adyen
// Struttura documento:
// {
//   merchantReference: "SFKWEU00082245",
//   pspReference:      "NZJ656JJ3LHLN3X3",
//   eventCode:         "CAPTURE",           // AUTHORISATION, CAPTURE, SETTLEMENT_PROCESSING_COMPLETE...
//   success:           true,
//   status:            "Settled",           // derivato da eventCode + success
//   amount:            9900,                // in centesimi
//   currency:          "EUR",
//   paymentMethod:     "visa",
//   rawWebhook:        { ... },             // payload completo per debug
//   receivedAt:        Timestamp,
// }
export const COLLECTION = "payment_events";

// ── Helper: stato leggibile da eventCode + success ────────────────────────────
export function deriveStatus(eventCode, success) {
  if (!success) return `${eventCode}_FAILED`;
  const map = {
    AUTHORISATION:                    "Authorised",
    CAPTURE:                          "Captured",
    CAPTURE_FAILED:                   "Capture Failed",
    CANCELLATION:                     "Cancelled",
    REFUND:                           "Refunded",
    REFUND_FAILED:                    "Refund Failed",
    SETTLEMENT_PROCESSING_COMPLETE:   "Settled",
    CHARGEBACK:                       "Chargeback",
    CHARGEBACK_REVERSED:              "Chargeback Reversed",
    NOTIFICATION_OF_FRAUD:            "Fraud Notification",
    ORDER_CLOSED:                     "Order Closed",
  };
  return map[eventCode] || eventCode;
}
