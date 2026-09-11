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

  const ref = db.collection('reportConfig').doc('JUNIOR_HIGH');
  
  const payload = {
    unitId: 'JUNIOR_HIGH',
    unit: 'JUNIOR_HIGH',
    principalName: 'Maryati Hulalata',
    principalTitle: 'Principal',
    principalNIY: '197906152007022001', // Example NIY for Maryati
    principalSignatureUrl: '', // Initial empty signature
    subjectOrder: [],
    studentProfileMapping: {
      "Spiritual Health": [],
      "Islamic Awareness": [],
      "Thinking, Research and Academic Abilities": [],
      "Arts Proficiency": [],
      "Range of Interests Talents and Dispositions": [],
      "Physical Fitness": []
    },
    spiritualHealthLGId: '',
    status: 'active',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedByName: 'System Seed'
  };

  await ref.set(payload, { merge: true });
  console.log("Successfully seeded JUNIOR_HIGH configuration in reportConfig collection.");
}

main();
