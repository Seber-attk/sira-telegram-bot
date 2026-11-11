const admin = require('firebase-admin');

// Reuses the same Firebase project as the main Sira Quran Academy app, but
// connects with a trusted service-account key instead of the public web SDK
// key, so it can read/write Firestore directly without needing a signed-in
// user and without being bound by the app's client-side security rules.
let app;
function getApp() {
  if (app) return app;
  if (admin.apps.length) {
    app = admin.apps[0];
    return app;
  }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY env var is not set.');
  }
  const serviceAccount = JSON.parse(raw);
  app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  return app;
}

function db() {
  getApp();
  return admin.firestore();
}

module.exports = { db, admin };
