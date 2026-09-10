const admin = require('firebase-admin');

async function run() {
  const saString = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!saString) {
    console.error("No service account found!");
    process.exit(1);
  }

  const serviceAccount = JSON.parse(saString);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });

  const db = admin.firestore();
  const configDoc = await db.doc("reportConfig/JUNIOR_HIGH").get();
  if (configDoc.exists) {
    console.log("Config Data:", JSON.stringify(configDoc.data(), null, 2));
  } else {
    console.log("Config does not exist for JUNIOR_HIGH!");
  }
}

run();
