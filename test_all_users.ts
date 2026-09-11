import * as admin from 'firebase-admin';

async function main() {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.GOOGLE_BACKUP_SERVICE_ACCOUNT;
  if (!serviceAccountJson) return;
  const serviceAccount = JSON.parse(serviceAccountJson);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  const db = admin.firestore();

  const ref = db.collection('users');
  const snap = await ref.limit(20).get();
  console.log(`First ${snap.docs.length} users:`);
  for (const doc of snap.docs) {
    const data = doc.data();
    console.log(`- ID: ${doc.id}, Name: ${data.displayName || data.name}, Email: ${data.email}, Role: ${data.role}, Unit: ${data.unitId || data.unit}`);
  }
}

main();
