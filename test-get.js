const { initializeApp: adminInitializeApp, cert } = require("firebase-admin/app");
const { getAuth: adminGetAuth } = require("firebase-admin/auth");
const { initializeApp: clientInitializeApp } = require("firebase/app");
const { getAuth: clientGetAuth, signInWithCustomToken } = require("firebase/auth");
const { getFirestore: clientGetFirestore, doc, getDoc } = require("firebase/firestore");
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

// 1. Initialize Admin SDK
const adminApp = adminInitializeApp({
  credential: cert(serviceAccount),
}, "admin_app_sim");

const adminAuth = adminGetAuth(adminApp);

// 2. Initialize Client SDK
const clientApp = clientInitializeApp(firebaseConfig, "client_app_sim");
const clientAuth = clientGetAuth(clientApp);
const clientDb = clientGetFirestore(clientApp, firebaseConfig.firestoreDatabaseId);

async function run() {
  const uid = "4Ajpx6ufxQNxGf1vUH8IRylzB2t1"; // The target student UID
  console.log(`Generating custom token for target student uid: ${uid}`);
  const customToken = await adminAuth.createCustomToken(uid);
  
  console.log("Signing in with custom token on client SDK...");
  const userCredential = await signInWithCustomToken(clientAuth, customToken);
  console.log(`Signed in successfully! Current User email: ${userCredential.user.email}`);

  const targetDocPath = 'studentConferenceResponses/50om4C7j466OuDTW4pv8_2521003';
  console.log(`Attempting to GET non-existent document: ${targetDocPath}`);
  try {
    const docRef = doc(clientDb, 'studentConferenceResponses', '50om4C7j466OuDTW4pv8_2521003');
    const snap = await getDoc(docRef);
    console.log(`SUCCESS! getDoc exists: ${snap.exists()}`);
  } catch (error) {
    console.error("FAILED to getDoc:", error);
  }
}

run()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
