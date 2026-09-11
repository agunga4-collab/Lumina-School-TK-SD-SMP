import * as admin from 'firebase-admin';

async function main() {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.GOOGLE_BACKUP_SERVICE_ACCOUNT;
  if (!serviceAccountJson) {
    console.error("No service account found");
    return;
  }
  const serviceAccount = JSON.parse(serviceAccountJson);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  const db = admin.firestore();

  const ref = db.collection('reportConfig');
  const snap = await ref.get();
  console.log(`Found ${snap.docs.length} documents in reportConfig:`);
  for (const doc of snap.docs) {
    const data = doc.data();
    console.log(`- Document ID: ${doc.id}`);
    console.log(`  unitId: ${data.unitId}`);
    console.log(`  unit: ${data.unit}`);
    console.log(`  principalName: ${data.principalName}`);
    console.log(`  principalNIY: ${data.principalNIY}`);
    console.log(`  status: ${data.status}`);
    console.log(`  reportType: ${data.reportType}`);
    console.log(`  academicYear: ${data.academicYear}`);
  }
}

main();
