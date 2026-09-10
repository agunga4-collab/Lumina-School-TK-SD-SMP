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
  const coll = await db.collection("reportConfig").get();
  console.log("Documents in reportConfig collection:");
  coll.forEach(doc => {
    console.log(doc.id, "=>", JSON.stringify(doc.data(), null, 2));
  });
}

run();
