const { Storage } = require('@google-cloud/storage');

async function testBucket(storage, name) {
  try {
    const bucket = storage.bucket(name);
    const [metadata] = await bucket.getMetadata();
    console.log(`Bucket "${name}": SUCCESS! Location = ${metadata.location}`);
    return true;
  } catch (err) {
    console.log(`Bucket "${name}": Error code = ${err.code}, message = ${err.message}`);
    return false;
  }
}

async function run() {
  const saString = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.GOOGLE_BACKUP_SERVICE_ACCOUNT;
  if (!saString) {
    console.error("No service account found in environment variables!");
    process.exit(1);
  }

  const serviceAccount = JSON.parse(saString);
  const storage = new Storage({
    projectId: serviceAccount.project_id,
    credentials: {
      client_email: serviceAccount.client_email,
      private_key: serviceAccount.private_key
    }
  });

  const candidates = [
    'luminaschoolproject.firebasestorage.app',
    'luminaschoolproject.appspot.com',
    'luminaschoolproject',
    'b/luminaschoolproject'
  ];

  for (const name of candidates) {
    await testBucket(storage, name);
  }
}

run();
