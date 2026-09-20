import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv";

dotenv.config();

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!serviceAccountJson) {
  console.error("ERROR: FIREBASE_SERVICE_ACCOUNT environment variable is missing.");
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
  console.log("=== TARGETED STUDENT DIAGNOSTIC START ===");

  const snap = await db.collection("junior_high_literacy_numeracy_records")
    .where("studentId", "==", "2521003")
    .where("schoolYear", "==", "2026/2027")
    .get();

  console.log("junior_high_literacy_numeracy_records count:", snap.size);
  snap.docs.forEach((d) => {
    console.log(JSON.stringify({ id: d.id, ...d.data() }, null, 2));
  });

  console.log("=== TARGETED STUDENT DIAGNOSTIC END ===");
}

run().catch(err => {
  console.error("Diagnostic run error:", err);
});
