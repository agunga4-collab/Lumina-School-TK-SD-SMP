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
    const batchId = 'batch_english_2026-09-11_2026_2027';
    console.log(`Checking assignments for batch ${batchId}...`);
    const asgSnap = await db.collection('learning_power_up_assignments')
      .where('taskBatchId', '==', batchId)
      .get();
    
    console.log(`Found ${asgSnap.size} assignments in batch ${batchId}`);
    asgSnap.docs.forEach(doc => {
      console.log(`- Student ID: ${doc.data().studentId} | Level: ${doc.data().levelSnapshot} | Status: ${doc.data().status}`);
    });
  } catch (err) {
    console.error(err);
  }
}

run();
