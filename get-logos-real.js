const admin = require('firebase-admin');

async function run() {
  const saString = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!saString) {
    console.error("No service account found in environment variables!");
    process.exit(1);
  }

  const serviceAccount = JSON.parse(saString);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });

  const db = admin.firestore();
  const logoDoc = await db.doc("settings/logos").get();
  if (logoDoc.exists) {
    console.log("Logos Document Data:", JSON.stringify(logoDoc.data(), null, 2));
  } else {
    console.log("Logos Document does not exist in settings/logos!");
  }
}

run();
