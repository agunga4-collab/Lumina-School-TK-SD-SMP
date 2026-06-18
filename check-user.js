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
  const uid = "56e2H52ggCdfgIrS6HUp5YvY7lg1";
  console.log(`Checking user in firestore: ${uid}...`);
  const doc = await db.collection("users").doc(uid).get();
  console.log(`Exists: ${doc.exists}`);
  if (doc.exists) {
    console.log("User Data:", JSON.stringify(doc.data(), null, 2));
  } else {
    console.log("Searching user collection by email agunga4@lazuardi.sch.id...");
    const snap = await db.collection("users").where("email", "==", "agunga4@lazuardi.sch.id").get();
    console.log(`Found ${snap.size} user docs matching email`);
    snap.docs.forEach(d => {
      console.log(`UID: ${d.id}`, JSON.stringify(d.data(), null, 2));
    });
  }
}

run().catch(console.error);
