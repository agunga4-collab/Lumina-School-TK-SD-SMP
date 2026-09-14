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
  console.log("=== USER DIAGNOSTIC ===");
  const uid = "co0HpY8JLwQtXJKe1B5QwpB0dsx2";
  const userSnap = await db.collection("users").doc(uid).get();
  if (userSnap.exists) {
    const data = userSnap.data()!;
    const cleanUser = {
      uid: userSnap.id,
      email: data.email,
      name: data.name,
      role: data.role,
      unitId: data.unitId,
      assignedClassIds: data.assignedClassIds,
      permissions: data.permissions,
      status: data.status,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt
    };
    console.log("Fajriah Deli Gayo User Profile in Firestore:");
    console.log(JSON.stringify(cleanUser, null, 2));
  } else {
    console.log(`User ID ${uid} NOT FOUND in Firestore!`);
  }
}

run().catch(err => {
  console.error(err);
});
