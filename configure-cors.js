const { Storage } = require('@google-cloud/storage');

async function testBucket(storage, name) {
  try {
    const bucket = storage.bucket(name);
    const [exists] = await bucket.exists();
    console.log(`Bucket "${name}": exists = ${exists}`);
    if (exists) {
      const [metadata] = await bucket.getMetadata();
      console.log(`  Location: ${metadata.location}`);
    }
  } catch (err) {
    console.log(`Bucket "${name}": error = ${err.message}`);
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

  await testBucket(storage, 'luminaschoolproject.firebasestorage.app');
  await testBucket(storage, 'luminaschoolproject.appspot.com');
  await testBucket(storage, 'luminaschoolproject');
  await testBucket(storage, 'staging.luminaschoolproject.appspot.com');
}

run();
