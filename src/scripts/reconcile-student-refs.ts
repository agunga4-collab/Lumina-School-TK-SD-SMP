import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';
import { runReconciliation } from '../services/reconciliationService';

/**
 * RECONCILE STUDENT REFERENCES (LUMINA) - CLI Wrapper
 *
 * Cara pakai:
 *   export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account.json"
 *   npx tsx src/scripts/reconcile-student-refs.ts --live      # live run for all
 *   npx tsx src/scripts/reconcile-student-refs.ts --unit KINDERGARTEN --dry-run
 */

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
  console.log('✅ Firebase Admin SDK initialized via CLI applicationDefault.');
}

const db = admin.firestore();

async function main() {
  const args = process.argv.slice(2);
  const isLive = args.includes('--live');
  const isDryRun = !isLive || args.includes('--dry-run');

  // Parse --unit KINDERGARTEN or other unit filter if provided
  let unitId = 'ALL';
  const unitIndex = args.indexOf('--unit');
  if (unitIndex !== -1 && args[unitIndex + 1]) {
    unitId = args[unitIndex + 1].toUpperCase();
  }

  const modeStr = isDryRun ? 'DRY-RUN' : 'LIVE';
  console.log('==================================================');
  console.log(`🚀 RUNNING RECONCILIATION CLI – MODE: ${modeStr} | UNIT: ${unitId}`);
  console.log('==================================================');

  const result = await runReconciliation(db, { dryRun: isDryRun, unitId });

  const tag = isDryRun ? 'dryrun' : 'live';
  const filename = `reconciliation-${tag}-${Date.now()}.json`;
  const filePath = path.join(process.cwd(), filename);
  fs.writeFileSync(filePath, JSON.stringify(result, null, 2), 'utf-8');

  console.log('\n==================================================');
  console.log('🎉 PROSES REKONSILIASI CLI SELESAI');
  console.log('==================================================');
  console.log(`  Mode        : ${result.executionMode}`);
  console.log(`  Mapping     : ${result.mappingCount} entries`);
  console.log(`  Changes     : ${result.changes.length}`);
  console.log(`  Log file    : ${filePath}`);
  console.log('==================================================\n');

  if (result.errors.length > 0) {
    console.error('🚨 Errors encountered:');
    result.errors.forEach((err) => console.error(`  - ${err}`));
  }
}

main().catch((err) => {
  console.error('🚨 Critical execution failure:', err);
  process.exit(1);
});
