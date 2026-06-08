const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!serviceAccountJson) {
  console.error("FIREBASE_SERVICE_ACCOUNT is missing in environment");
  process.exit(1);
}

const serviceAccount = JSON.parse(serviceAccountJson);
if (serviceAccount.private_key) {
  serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
}

initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();

async function run() {
  console.log("Checking classes collection...");
  const classesSnap = await db.collection("classes").get();
  console.log(`Total classes in DB: ${classesSnap.size}`);
  classesSnap.docs.forEach(doc => {
    const data = doc.data();
    if (data.unitId === 'KINDERGARTEN') {
      console.log(`Class ID: ${doc.id}, Name: ${data.name}, Year: ${data.academicYear}, Unit: ${data.unitId}`);
    }
  });
}

run().catch(console.error);
