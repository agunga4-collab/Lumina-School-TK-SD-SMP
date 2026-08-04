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

async function auditAllClasses() {
  console.log('Fetching all classes in Firestore...');
  const snap = await db.collection('classes').get();
  console.log(`Total classes found: ${snap.size}`);

  const list = snap.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  // Group by unitId
  const grouped: Record<string, any[]> = {};
  list.forEach(c => {
    const uid = String((c as any).unitId || 'UNDEFINED/NULL');
    if (!grouped[uid]) grouped[uid] = [];
    grouped[uid].push(c);
  });

  console.log('\nClasses grouped by unitId:');
  for (const [uid, classes] of Object.entries(grouped)) {
    console.log(`\nUnit ID: ${uid} (Total: ${classes.length})`);
    classes.forEach(c => {
      console.log(`  - Class ID: ${c.id} | Name: ${c.name} | Grade: ${c.grade} | Year: ${c.academicYear}`);
    });
  }
}

auditAllClasses().catch(err => {
  console.error(err);
});
