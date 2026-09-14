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
  console.log("=== TARGETED DIAGNOSTIC START ===");

  // 1. Fetch systemConfig
  const systemConfigSnap = await db.collection("systemConfig").doc("academicYear").get();
  console.log("System Config Academic Year:", systemConfigSnap.exists ? JSON.stringify(systemConfigSnap.data()) : "NOT FOUND");

  // 2. Fetch Users
  const usersSnap = await db.collection("users").get();
  const allUsers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  
  const nurul = allUsers.filter((u: any) => u.name?.toLowerCase().includes("nurul") || u.email?.toLowerCase().includes("nurul"));
  console.log("\nNurul Azizah Profiles:");
  nurul.forEach(n => console.log(JSON.stringify(n, null, 2)));

  const fajriah = allUsers.filter((u: any) => u.name?.toLowerCase().includes("fajriah") || u.email?.toLowerCase().includes("fajriah") || u.email?.toLowerCase().includes("deli"));
  console.log("\nFajriah Deli Gayo Profiles:");
  fajriah.forEach(f => console.log(JSON.stringify(f, null, 2)));

  // 3. Fetch Classes
  const classesSnap = await db.collection("classes").get();
  const allClasses = classesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  
  const baluran = allClasses.filter((c: any) => c.name?.toLowerCase().includes("baluran") || c.id?.toLowerCase().includes("baluran"));
  console.log("\nTK A Baluran Class Details:");
  baluran.forEach(b => console.log(JSON.stringify(b, null, 2)));

  const lorentz = allClasses.filter((c: any) => c.name?.toLowerCase().includes("lorentz") || c.id?.toLowerCase().includes("lorentz"));
  console.log("\nTK A Lorentz Class Details:");
  lorentz.forEach(l => console.log(JSON.stringify(l, null, 2)));

  console.log("=== TARGETED DIAGNOSTIC END ===");
}

run().catch(err => {
  console.error("Diagnostic run error:", err);
});
