import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv";

dotenv.config();

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!serviceAccountJson) {
  console.error("ERROR: FIREBASE_SERVICE_ACCOUNT is missing.");
  process.exit(1);
}

const serviceAccount = JSON.parse(serviceAccountJson);
if (serviceAccount.private_key) {
  serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
}

if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount),
  });
}

const db = getFirestore();

async function run() {
  console.log("=== LORENTZ PHOTO SEARCH ===");
  const photosSnap = await db.collection("kg_observation_photos")
    .where("className", "==", "TK A Lorentz")
    .get();
  console.log(`Total photos found for TK A Lorentz: ${photosSnap.size}`);
  photosSnap.forEach(doc => {
    const data = doc.data();
    console.log(`- DocID: ${doc.id}`);
    console.log(`  fileName: ${data.fileName}`);
    console.log(`  observationDate: ${data.observationDate}`);
    console.log(`  uploadedBy: ${data.uploadedBy}`);
    console.log(`  uploadedAt: ${new Date(data.uploadedAt).toISOString()}`);
  });
}

run().catch(err => {
  console.error(err);
});
