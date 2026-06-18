const { initializeApp: adminInitializeApp, cert } = require("firebase-admin/app");
const { getAuth: adminGetAuth } = require("firebase-admin/auth");
const { initializeApp: clientInitializeApp } = require("firebase/app");
const { getAuth: clientGetAuth, signInWithCustomToken } = require("firebase/auth");
const { getFirestore: clientGetFirestore, collection, query, where, getDocs } = require("firebase/firestore");
const firebaseConfig = require("./firebase-applet-config.json");

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!serviceAccountJson) {
  console.error("FIREBASE_SERVICE_ACCOUNT is missing in environment");
  process.exit(1);
}

const serviceAccount = JSON.parse(serviceAccountJson);
if (serviceAccount.private_key) {
  serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
}

console.log("Service Account Project ID:", serviceAccount.project_id);
console.log("Client Configuration Project ID:", firebaseConfig.projectId);

// 1. Initialize Admin SDK
const adminApp = adminInitializeApp({
  credential: cert(serviceAccount),
}, "admin_app");

const adminAuth = adminGetAuth(adminApp);

// 2. Initialize Client SDK
const clientApp = clientInitializeApp(firebaseConfig, "client_app");
const clientAuth = clientGetAuth(clientApp);
const clientDb = clientGetFirestore(clientApp, firebaseConfig.firestoreDatabaseId);

async function run() {
  const uid = "56e2H52ggCdfgIrS6HUp5YvY7lg1";
  console.log(`Generating custom token for uid: ${uid}`);
  const customToken = await adminAuth.createCustomToken(uid);
  
  console.log("Signing in with custom token on modern client SDK...");
  const userCredential = await signInWithCustomToken(clientAuth, customToken);
  console.log(`Signed in successfully! Current User email: ${userCredential.user.email}`);

  try {
    const userDoc = await getDocs(query(collection(clientDb, 'users'), where('uid', '==', uid)));
    console.log(`SUCCESS! Read users query: size ${userDoc.size}`);
  } catch (error) {
    console.error("FAILED to query own user:", error);
  }

  try {
    const { doc, getDoc } = require("firebase/firestore");
    const docRef = doc(clientDb, 'users', uid);
    const snap = await getDoc(docRef);
    console.log(`SUCCESS! Read direct user doc exists: ${snap.exists()}`);
  } catch (error) {
    console.error("FAILED to get direct user doc:", error);
  }

  try {
    const { doc, getDoc } = require("firebase/firestore");
    const docRef = doc(clientDb, 'students', '2521010');
    const snap = await getDoc(docRef);
    console.log(`SUCCESS! Read student doc exists: ${snap.exists()}`);
  } catch (error) {
    console.error("FAILED to get student doc:", error);
  }

  try {
    const goals = await getDocs(query(collection(clientDb, 'learning_goals')));
    console.log(`SUCCESS! Query learning_goals size: ${goals.size}`);
  } catch (error) {
    console.error("FAILED to query learning_goals:", error);
  }

  try {
    const { doc, getDoc } = require("firebase/firestore");
    const docRef = doc(clientDb, 'juniorhigh_mtss_tier1_assessments', 'dummy_id');
    const snap = await getDoc(docRef);
    console.log(`SUCCESS! getDoc on juniorhigh_mtss_tier1_assessments: exists ${snap.exists()}`);
  } catch (error) {
    console.error("FAILED to getDoc juniorhigh_mtss_tier1_assessments:", error);
  }

  console.log("Attempting query getDocs on juniorhigh_mtss_tier1_assessments...");
  const q = query(
    collection(clientDb, 'juniorhigh_mtss_tier1_assessments'),
    where('academicYear', '==', '2025/2026'),
    where('semester', '==', '1')
  );
  
  try {
    const snapshot = await getDocs(q);
    console.log(`SUCCESS! Read ${snapshot.size} assessments from collection.`);
  } catch (error) {
    console.error("FAILED to query juniorhigh_mtss_tier1_assessments:", error);
  }
}

run()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
