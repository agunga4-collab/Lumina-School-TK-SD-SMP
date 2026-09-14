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
  console.log("=== USER FIELDS DETAIL ===");
  const uids = ["LOOuw42MePT7aylnLvQnoMgNMA82", "co0HpY8JLwQtXJKe1B5QwpB0dsx2"];
  for (const uid of uids) {
    const userSnap = await db.collection("users").doc(uid).get();
    if (userSnap.exists) {
      console.log(`\nUser: ${uid}`);
      console.log(userSnap.data());
    } else {
      console.log(`\nUser: ${uid} NOT FOUND`);
    }
  }
}

run().catch(err => {
  console.error(err);
});
