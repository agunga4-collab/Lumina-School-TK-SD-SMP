const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!serviceAccountJson) {
  console.error("FIREBASE_SERVICE_ACCOUNT is missing in environment");
  process.exit(1);
}

const serviceAccount = JSON.parse(serviceAccountJson);
if (serviceAccount.private_key) {
  serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
}

initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();

async function run() {
  console.log("Checking juniorhigh_mtss_tier1_assessments with ADMIN SDK...");
  const snap = await db.collection("juniorhigh_mtss_tier1_assessments").get();
  console.log(`Total documents found: ${snap.size}`);
  snap.docs.slice(0, 5).forEach(doc => {
    console.log(`Doc ID: ${doc.id}`, JSON.stringify(doc.data(), null, 2));
  });
}

run().catch(console.error);
