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

async function main() {
  const testSids = ['2621009', '2621003', '2621006', '2621021'];
  for (const sid of testSids) {
    const snap = await db.collection('junior_high_literacy_numeracy_records')
      .where('studentId', '==', sid)
      .get();
    console.log(`\n=== Student ${sid} records count: ${snap.size} ===`);
    snap.forEach(d => {
      const data = d.data();
      console.log(`Doc ID: ${d.id}`);
      console.log(`  subjectArea: ${data.subjectArea}, sessionKey: ${data.sessionKey}, schoolYear: ${data.schoolYear}`);
      console.log(`  level: ${data.level}, targetLevel: ${data.targetLevel}, mathLevel: ${data.mathLevel}`);
      console.log(`  mengajiLevel: ${data.mengajiLevel}, mengajiTarget: ${data.mengajiTarget}, numerasiLevel: ${data.numerasiLevel}, numerasiTarget: ${data.numerasiTarget}`);
    });
  }
}

main().catch(err => console.error(err));
