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

async function getActiveStudentsSim(classId, activeYear) {
  try {
    let enrollments = [];
    if (classId && classId !== 'ALL' && classId !== 'all') {
      const classKeys = [classId];
      try {
        const classSnap = await db.collection('classes').doc(classId).get();
        if (classSnap.exists) {
          const clsData = classSnap.data();
          if (clsData.name && !classKeys.includes(clsData.name)) classKeys.push(clsData.name);
          if (clsData.classId && !classKeys.includes(clsData.classId)) classKeys.push(clsData.classId);
        }
      } catch (e) {
        console.warn("Could not fetch class doc in active students query:", e);
      }

      console.log("Class keys queried:", classKeys);

      // Query enrollments for all potential classId keys (UUIDs or Name strings)
      for (const key of classKeys) {
        const q = db.collection('enrollments')
          .where('academicYear', '==', activeYear)
          .where('status', '==', 'active')
          .where('classId', '==', key);
        const snap = await q.get();
        snap.docs.forEach(d => {
          const data = d.data();
          if (!enrollments.some(e => e.studentId === data.studentId)) {
            enrollments.push(data);
          }
        });
      }
    }

    console.log(`Simulated enrollments count: ${enrollments.length}`);
    if (enrollments.length === 0) return [];

    const studentIds = enrollments.map(e => e.studentId);
    const students = [];
    const chunks = [];
    for (let i = 0; i < studentIds.length; i += 10) {
      chunks.push(studentIds.slice(i, i + 10));
    }

    for (const chunk of chunks) {
      const sSnap = await db.collection('students').where('__name__', 'in', chunk).get();
      sSnap.docs.forEach(doc => {
        const data = doc.data();
        const enrollment = enrollments.find(e => e.studentId === doc.id);
        students.push({
          id: doc.id,
          name: data.name || data.fullName || 'Siswa Tanpa Nama',
          classId: enrollment ? enrollment.classId : (data.classId || ''),
          currentUnit: data.currentUnit || data.unitId || ''
        });
      });
    }

    return students.sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) {
    console.error("Error in simulation:", err);
    return [];
  }
}

async function run() {
  const students = await getActiveStudentsSim("JUNIOR_HIGH_2025-2026_7-Whale-Shark", "2025/2026");
  console.log(`Active students found: ${students.length}`);
  students.forEach(s => {
    console.log(`- Student ID: ${s.id}, Name: ${s.name}, ClassID: ${s.classId}, Unit: ${s.currentUnit}`);
  });

  console.log("\nChecking the students collection in general for any junior high references:");
  const generalStudents = await db.collection("students").get();
  let jhCount = 0;
  generalStudents.docs.forEach(doc => {
    const data = doc.data();
    if (data.currentUnit === 'JUNIOR_HIGH' || (data.classId && data.classId.includes('Whale')) || (data.className && data.className.includes('Whale'))) {
      jhCount++;
      if (jhCount <= 10) {
        console.log(`JH Student ID: ${doc.id}, Name: ${data.name || data.fullName}, ClassID: ${data.classId}, className: ${data.className}, currentUnit: ${data.currentUnit}`);
      }
    }
  });
  console.log(`Total Junior High students in students collection by unit/class check: ${jhCount}`);
}

run().catch(console.error);
