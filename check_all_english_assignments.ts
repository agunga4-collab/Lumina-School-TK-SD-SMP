import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (serviceAccountJson) {
    const serviceAccount = JSON.parse(serviceAccountJson);
    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } else {
    admin.initializeApp();
  }
}

const db = admin.firestore();

async function run() {
  try {
    console.log("Fetching all assignments...");
    const asgSnap = await db.collection('learning_power_up_assignments').get();
    console.log(`Total assignments found: ${asgSnap.size}`);
    
    const englishAsgs = asgSnap.docs
      .map(doc => ({ id: doc.id, ...doc.data() as any }))
      .filter(a => a.subjectKey === 'english' || String(a.subjectKey).toLowerCase() === 'english');

    console.log(`Found ${englishAsgs.length} English assignments:`);
    englishAsgs.forEach(a => {
      console.log(`- ID: ${a.id}`);
      console.log(`  StudentId: ${a.studentId}`);
      console.log(`  StudentNameSnapshot: ${a.studentNameSnapshot}`);
      console.log(`  ClassId: ${a.classId}`);
      console.log(`  AcademicYearId: ${a.academicYearId}`);
      console.log(`  SubjectKey: ${a.subjectKey}`);
      console.log(`  LevelSnapshot: ${a.levelSnapshot}`);
      console.log(`  Status: ${a.status}`);
      console.log(`  WeekStartDate: ${a.weekStartDate}`);
    });
  } catch (err) {
    console.error(err);
  }
}

run();
