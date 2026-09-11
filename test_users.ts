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
  const snap = await ref.where('role', '==', 'PRINCIPAL').get();
  console.log(`Found ${snap.docs.length} principals in 'users' collection:`);
  for (const doc of snap.docs) {
    console.log(`- ID: ${doc.id}, Name: ${doc.data().displayName}, Email: ${doc.data().email}, Unit: ${doc.data().unitId || doc.data().unit}`);
  }
}

main();
