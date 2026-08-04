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

async function findSpecificStudents() {
  console.log('Searching for Alwi A Mulahela...');
  const alwiSnap = await db.collection('students')
    .get();

  console.log(`Total students in DB: ${alwiSnap.size}`);

  const alwiMatches = alwiSnap.docs.filter(doc => {
    const name = String(doc.data().fullName || doc.data().name || '').toLowerCase();
    return name.includes('alwi') || name.includes('arshaka');
  });

  console.log(`Found ${alwiMatches.length} matching students:`);
  for (const doc of alwiMatches) {
    const data = doc.data();
    console.log(`\nStudent ID: ${doc.id}`);
    console.log(`  Full Name: ${data.fullName}`);
    console.log(`  Name: ${data.name}`);
    console.log(`  unitId: ${data.unitId}`);
    console.log(`  classId: ${data.classId}`);
    console.log(`  grade: ${data.grade}`);
    console.log(`  academicYear: ${data.academicYear}`);
    
    // Check enrollments for this student
    const enrollSnap = await db.collection('enrollments')
      .where('studentId', '==', doc.id)
      .get();
      
    console.log(`  Enrollments count: ${enrollSnap.size}`);
    enrollSnap.forEach(eDoc => {
      console.log(`    - Enrollment ID: ${eDoc.id} | classId: ${eDoc.data().classId} | academicYear: ${eDoc.data().academicYear}`);
    });
  }
}

findSpecificStudents().catch(err => {
  console.error(err);
});
