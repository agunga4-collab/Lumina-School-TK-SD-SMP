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
  console.log("=== CLEAN DIAGNOSTIC START ===");

  // 1. Fetch systemConfig
  const systemConfigSnap = await db.collection("systemConfig").doc("academicYear").get();
  console.log("Academic Year Config:", systemConfigSnap.exists ? systemConfigSnap.data() : "NOT FOUND");

  // 2. Fetch targeted users
  const usersSnap = await db.collection("users").get();
  console.log(`Total users in collection: ${usersSnap.size}`);
  
  const targetUserNames = ["nurul", "fajriah", "deli"];
  const matchedUsers = usersSnap.docs.filter(doc => {
    const data = doc.data();
    const name = (data.name || "").toLowerCase();
    const email = (data.email || "").toLowerCase();
    return targetUserNames.some(t => name.includes(t) || email.includes(t));
  });

  console.log("\n--- TARGETED USERS ---");
  matchedUsers.forEach(doc => {
    const data = doc.data();
    // Clean user object (exclude large signature fields)
    const cleanUser = {
      uid: doc.id,
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
    console.log(JSON.stringify(cleanUser, null, 2));
  });

  // 3. Fetch targeted classes
  const classesSnap = await db.collection("classes").get();
  console.log(`\nTotal classes in collection: ${classesSnap.size}`);

  const targetClassNames = ["baluran", "lorentz"];
  const matchedClasses = classesSnap.docs.filter(doc => {
    const data = doc.data();
    const name = (data.name || "").toLowerCase();
    const id = doc.id.toLowerCase();
    return targetClassNames.some(t => name.includes(t) || id.includes(t));
  });

  console.log("\n--- TARGETED CLASSES ---");
  matchedClasses.forEach(doc => {
    const data = doc.data();
    // Clean class object (exclude large fields or signature arrays if any)
    const cleanClass = {
      id: doc.id,
      name: data.name,
      grade: data.grade,
      unitId: data.unitId,
      academicYear: data.academicYear,
      status: data.status,
      homeroomTeacherId: data.homeroomTeacherId,
      homeroomTeacherName: data.homeroomTeacherName,
      waliKelasIds: data.waliKelasIds,
      gpkTeacherIds: data.gpkTeacherIds,
      assignedTeacherIds: data.assignedTeacherIds,
      homeroomTeacherIds: data.homeroomTeacherIds,
      teacherAssignments: data.teacherAssignments ? data.teacherAssignments.map((a: any) => ({ userId: a.userId, role: a.role })) : null
    };
    console.log(JSON.stringify(cleanClass, null, 2));
  });

  console.log("=== CLEAN DIAGNOSTIC END ===");
}

run().catch(err => {
  console.error("Clean Diagnostic run error:", err);
});
