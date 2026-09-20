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
    console.log("Fetching all documents from learning_power_up_tasks...");
    const snap = await db.collection('learning_power_up_tasks').get();
    console.log(`Total documents found in learning_power_up_tasks: ${snap.size}`);
    snap.docs.forEach(doc => {
      console.log(`- Document ID: ${doc.id}`);
      console.log(`  Data:`, doc.data());
    });
  } catch (err) {
    console.error(err);
  }
}

run();
