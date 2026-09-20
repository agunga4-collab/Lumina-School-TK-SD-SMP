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
    const doc = await db.collection('learning_power_up_task_batches').doc(batchId).get();
    if (!doc.exists) {
      console.log(`Batch ${batchId} not found!`);
      return;
    }
    console.log(`Batch ${batchId} Details:`, doc.data());
  } catch (err) {
    console.error(err);
  }
}

run();
