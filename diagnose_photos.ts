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
  console.log("=== PHOTO LOG DIAGNOSTIC ===");
  const photosSnap = await db.collection("kg_observation_photos").orderBy("uploadedAt", "desc").limit(10).get();
  console.log(`Total logged photos found (recent 10): ${photosSnap.size}`);
  photosSnap.forEach(doc => {
    const data = doc.data();
    console.log(`- DocID: ${doc.id}`);
    console.log(`  fileName: ${data.fileName}`);
    console.log(`  className: ${data.className}`);
    console.log(`  observationDate: ${data.observationDate}`);
    console.log(`  uploadedBy: ${data.uploadedBy}`);
    console.log(`  uploadedAt: ${new Date(data.uploadedAt).toISOString()}`);
    console.log(`  folderPath: ${data.folderPath}`);
  });
}

run().catch(err => {
  console.error(err);
});
