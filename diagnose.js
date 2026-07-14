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
  console.log("Fetching all potential students from users, roleInvites, and students to find duplicates...");
  
  const usersSnap = await db.collection("users").where("role", "==", "STUDENT").get();
  console.log(`Users count: ${usersSnap.size}`);
  
  const invitesSnap = await db.collection("roleInvites").where("role", "==", "STUDENT").get();
  console.log(`Invites count: ${invitesSnap.size}`);
  
  const studentsSnap = await db.collection("students").get();
  console.log(`Students count: ${studentsSnap.size}`);

  const nameMap = new Map();
  
  usersSnap.docs.forEach(doc => {
    const data = doc.data();
    const name = data.displayName || data.name || '';
    if (name) {
      if (!nameMap.has(name.toLowerCase())) nameMap.set(name.toLowerCase(), []);
      nameMap.get(name.toLowerCase()).push({ source: 'users', id: doc.id, classId: data.classId, email: data.email });
    }
  });

  invitesSnap.docs.forEach(doc => {
    const data = doc.data();
    const name = data.name || '';
    if (name) {
      if (!nameMap.has(name.toLowerCase())) nameMap.set(name.toLowerCase(), []);
      nameMap.get(name.toLowerCase()).push({ source: 'roleInvites', id: doc.id, classId: data.classId, email: data.email });
    }
  });

  studentsSnap.docs.forEach(doc => {
    const data = doc.data();
    const name = data.name || data.fullName || '';
    if (name) {
      if (!nameMap.has(name.toLowerCase())) nameMap.set(name.toLowerCase(), []);
      nameMap.get(name.toLowerCase()).push({ source: 'students', id: doc.id, classId: data.classId, email: data.email });
    }
  });

  console.log("\nDuplicates found by name:");
  let dupCount = 0;
  for (const [name, entries] of nameMap.entries()) {
    if (entries.length > 1) {
      dupCount++;
      console.log(`- "${name}":`);
      entries.forEach(e => {
        console.log(`  Source: ${e.source}, ID: ${e.id}, classId: ${e.classId}, email: ${e.email}`);
      });
    }
  }
  console.log(`Total duplicate names: ${dupCount}`);
}

run().catch(console.error);
