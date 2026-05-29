// lib/firestore.js

let _db = null;

export function getDb() {
  // Non inizializzare durante il build
  if (typeof window !== "undefined") return null;
  if (_db) return _db;

  try {
    const { initializeApp, getApps, cert } = require("firebase-admin/app");
    const { getFirestore } = require("firebase-admin/firestore");

    const privateKey = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

    if (!process.env.GOOGLE_PROJECT_ID || !process.env.GOOGLE_CLIENT_EMAIL || !privateKey) {
      console.warn("[firestore] Variabili d'ambiente mancanti");
      return null;
    }

    if (getApps().length === 0) {
      initializeApp({
        credential: cert({
          projectId:   process.env.GOOGLE_PROJECT_ID,
          clientEmail: process.env.GOOGLE_CLIENT_EMAIL,
          privateKey,
        }),
      });
    }

    _db = getFirestore();
    return _db;
  } catch (err) {
    console.error("[firestore] Errore inizializzazione:", err.message);
    return null;
  }
}

export const COLLECTION = "payment_events";

export function deriveStatus(eventCode, success) {
  if (!success) return `${eventCode}_FAILED`;
  const map = {
    AUTHORISATION:                  "Authorised",
    CAPTURE:                        "Captured",
    CAPTURE_FAILED:                 "Capture Failed",
    CANCELLATION:                   "Cancelled",
    REFUND:                         "Refunded",
    REFUND_FAILED:                  "Refund Failed",
    SETTLEMENT_PROCESSING_COMPLETE: "Settled",
    CHARGEBACK:                     "Chargeback",
    CHARGEBACK_REVERSED:            "Chargeback Reversed",
    NOTIFICATION_OF_FRAUD:          "Fraud Notification",
  };
  return map[eventCode] || eventCode;
}
