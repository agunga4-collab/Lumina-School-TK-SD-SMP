import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!serviceAccountJson) {
  console.error("FIREBASE_SERVICE_ACCOUNT missing!");
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
  console.log("=== ADMIN QUERYING USERS ===");
  const usersRef = db.collection('users');
  const userDocs = await usersRef.get();
  console.log(`Total users in collection: ${userDocs.size}`);
  
  userDocs.forEach(d => {
    const data = d.data();
    const name = data.name || data.displayName || '';
    if (name.toLowerCase().includes('damar')) {
      console.log("USER MATCH:", {
        id: d.id,
        uid: data.uid,
        studentId: data.studentId,
        luminaId: data.luminaId,
        name: data.name,
        displayName: data.displayName,
        email: data.email,
        role: data.role,
        nisn: data.nisn,
        nis: data.nis
      });
    }
  });

  console.log("=== ADMIN QUERYING STUDENTS ===");
  const studentsRef = db.collection('students');
  const studentDocs = await studentsRef.get();
  console.log(`Total students in collection: ${studentDocs.size}`);
  
  studentDocs.forEach(d => {
    const data = d.data();
    const name = data.name || '';
    if (name.toLowerCase().includes('damar')) {
      console.log("STUDENT MATCH:", {
        id: d.id,
        name: data.name,
        nisn: data.nisn,
        nis: data.nis,
        email: data.email,
        classId: data.classId,
        className: data.className
      });
    }
  });

  console.log("=== ADMIN QUERYING ELEM SN STUDENTS ===");
  const snRef = db.collection('elem_sn_students');
  const snDocs = await snRef.get();
  console.log(`Total SN students found: ${snDocs.size}`);
  snDocs.forEach(d => {
    const data = d.data();
    const name = data.studentName || '';
    if (name.toLowerCase().includes('damar')) {
      console.log("SN STUDENT MATCH:", {
        id: d.id,
        studentId: data.studentId,
        studentName: data.studentName,
        nisn: data.nisn,
        classId: data.classId,
        className: data.className,
        isSN: data.isSN
      });
    }
  });
}

run().catch(console.error);
