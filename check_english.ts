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
    console.log("Checking english assignments...");
    const asgSnap = await db.collection('learning_power_up_assignments')
      .where('subjectKey', '==', 'english')
      .get();
    console.log(`Found ${asgSnap.size} english assignments in total.`);
    
    const studentsWithEnglish = asgSnap.docs.map(doc => {
      const data = doc.data();
      return {
        studentId: data.studentId,
        studentName: data.studentName,
        classId: data.classId,
        academicYearId: data.academicYearId,
        status: data.status,
        weekStartDate: data.weekStartDate
      };
    });

    console.log("Sample of students with English assignments:", studentsWithEnglish.slice(0, 10));

    // Check if Umar has any english assignment with different status or spelling or something
    const umarAsg = asgSnap.docs.filter(doc => {
      const data = doc.data();
      return data.studentId === '2521003' || (data.studentName && data.studentName.toLowerCase().includes('umar'));
    });
    console.log(`\nUmar matching english assignments: ${umarAsg.length}`);
    umarAsg.forEach(doc => {
      console.log(`Document ID: ${doc.id}`, doc.data());
    });

  } catch (err) {
    console.error(err);
  }
}

run();
