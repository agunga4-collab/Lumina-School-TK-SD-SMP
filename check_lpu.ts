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
    console.log("Searching for student Umar...");
    const studentsSnap = await db.collection('students').get();
    const umar = studentsSnap.docs
      .map(d => ({ id: d.id, ...d.data() as any }))
      .find(s => s.name && s.name.toLowerCase().includes('umar'));

    if (!umar) {
      console.log("Student Umar not found in students collection!");
      return;
    }

    console.log(`Found Student Umar: ID=${umar.id}, Name=${umar.name}, ClassId=${umar.classId}, UnitId=${umar.unitId}`);

    console.log("\nSearching for assignments for Umar...");
    const asgSnap = await db.collection('learning_power_up_assignments')
      .where('studentId', '==', umar.id)
      .get();
    console.log(`Found ${asgSnap.docs.length} assignments:`);
    asgSnap.docs.forEach(doc => {
      const data = doc.data();
      console.log(`- Assignment ID: ${doc.id}`);
      console.log(`  Title: ${data.taskTitle}`);
      console.log(`  SubjectKey: ${data.subjectKey}`);
      console.log(`  LevelSnapshot: ${data.levelSnapshot}`);
      console.log(`  WeekStartDate: ${data.weekStartDate}`);
      console.log(`  WeekEndDate: ${data.weekEndDate}`);
      console.log(`  Status: ${data.status}`);
      console.log(`  Unit: ${data.unit}`);
      console.log(`  ClassId: ${data.classId}`);
      console.log(`  AcademicYearId: ${data.academicYearId}`);
    });

    console.log("\nSearching for latest 5 packages in learning_power_up_tasks...");
    const pkgSnap = await db.collection('learning_power_up_tasks').get();
    console.log(`Found ${pkgSnap.docs.length} total packages in DB. Showing first 5:`);
    pkgSnap.docs.slice(0, 5).forEach(doc => {
      const data = doc.data();
      console.log(`- Package ID: ${doc.id}`);
      console.log(`  WeekStartDate: ${data.weekStartDate}`);
      console.log(`  ClassId: ${data.classId}`);
      console.log(`  Tasks keys:`, Object.keys(data.tasks || {}));
    });

    console.log("\nSearching for litnum records for Umar...");
    const recordsSnap = await db.collection('junior_high_literacy_numeracy_records')
      .where('studentId', '==', umar.id)
      .get();
    console.log(`Found ${recordsSnap.docs.length} records:`);
    recordsSnap.docs.forEach(doc => {
      const data = doc.data();
      console.log(`- Record ID: ${doc.id}`);
      console.log(`  SubjectArea: ${data.subjectArea}`);
      console.log(`  ReadingLevel/MathLevel:`, data.readingLevel || data.mathLevel || data.mengajiLevel || data.numerasiLevel || data.level);
    });

  } catch (err) {
    console.error("Error executing check:", err);
  }
}

run();
