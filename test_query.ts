import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';
import fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));

const app = initializeApp(firebaseConfig);
const dbId = firebaseConfig.firestoreDatabaseId;
const db = getFirestore(app, dbId && dbId !== '(default)' ? dbId : undefined);

async function run() {
  console.log("=== QUERYING USERS ===");
  const usersRef = collection(db, 'users');
  const userDocs = await getDocs(usersRef);
  console.log(`Total users found in collection: ${userDocs.size}`);
  
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

  console.log("=== QUERYING STUDENTS ===");
  const studentsRef = collection(db, 'students');
  const studentDocs = await getDocs(studentsRef);
  console.log(`Total students found in collection: ${studentDocs.size}`);
  
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

  console.log("=== QUERYING ELEM SN STUDENTS ===");
  const snRef = collection(db, 'elem_sn_students');
  const snDocs = await getDocs(snRef);
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
