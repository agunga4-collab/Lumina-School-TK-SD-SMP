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
    const batchesSnap = await db.collection('learning_power_up_task_batches').get();
    console.log(`\nTotal batches in learning_power_up_task_batches: ${batchesSnap.size}`);
    batchesSnap.docs.forEach(doc => {
      const data = doc.data();
      console.log(`- Batch ID: ${doc.id} | SubjectKey: ${data.subjectKey} | Week: ${data.weekStartDate} | Status: ${data.status}`);
    });
  } catch (err) {
    console.error(err);
  }
}

run();
