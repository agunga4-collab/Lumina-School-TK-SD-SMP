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
    const docId = '2521003_SEMESTER_1_START_ENGLISH_READING_2026-2027';
    const doc = await db.collection('junior_high_literacy_numeracy_records').doc(docId).get();
    if (!doc.exists) {
      console.log(`Record ${docId} not found!`);
      return;
    }
    console.log(`Record ${docId} Fields:`, doc.data());
  } catch (err) {
    console.error(err);
  }
}

run();
