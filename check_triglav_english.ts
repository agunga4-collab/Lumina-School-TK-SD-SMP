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
    const classId = 'JUNIOR_HIGH_2026-2027_8-Triglav';
    console.log(`Checking English assignments for class ${classId}...`);
    const asgSnap = await db.collection('learning_power_up_assignments')
      .where('classId', '==', classId)
      .where('subjectKey', '==', 'english')
      .get();
    
    console.log(`Found ${asgSnap.size} English assignments for class ${classId}`);
    asgSnap.docs.forEach(doc => {
      console.log(`- Doc ID: ${doc.id} | StudentId: ${doc.data().studentId} | StudentNameSnapshot: ${doc.data().studentNameSnapshot} | Level: ${doc.data().levelSnapshot} | Status: ${doc.data().status}`);
    });

    console.log(`\nChecking all assignments for class ${classId}...`);
    const allAsgSnap = await db.collection('learning_power_up_assignments')
      .where('classId', '==', classId)
      .get();
    console.log(`Found ${allAsgSnap.size} total assignments for class ${classId}`);
    
    const subjectCounts: Record<string, number> = {};
    allAsgSnap.docs.forEach(doc => {
      const data = doc.data();
      subjectCounts[data.subjectKey] = (subjectCounts[data.subjectKey] || 0) + 1;
    });
    console.log("Assignments count by subjectKey in this class:", subjectCounts);
  } catch (err) {
    console.error(err);
  }
}

run();
