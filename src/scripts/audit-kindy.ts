import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (serviceAccountJson) {
    try {
      const serviceAccount = JSON.parse(serviceAccountJson);
      if (serviceAccount.private_key) {
        serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
      }
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log('✅ Firebase Admin SDK initialized via FIREBASE_SERVICE_ACCOUNT env.');
    } catch (err) {
      console.error('❌ Failed to initialize with FIREBASE_SERVICE_ACCOUNT JSON:', err);
      process.exit(1);
    }
  } else {
    try {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
      });
      console.log('✅ Firebase Admin SDK initialized via applicationDefault.');
    } catch (e) {
      console.error('❌ FIREBASE_SERVICE_ACCOUNT is missing and applicationDefault failed:', e);
      process.exit(1);
    }
  }
}

const db = admin.firestore();

async function runAuditAndBackfill(liveRun = false) {
  console.log(`\n=============================================================`);
  console.log(`🔍 KINDERGARTEN STUDENT UNIT AUDIT & BACKFILL`);
  console.log(`MODE: ${liveRun ? 'LIVE BACKFILL' : 'DRY-RUN AUDIT'}`);
  console.log(`=============================================================\n`);

  // 1. Fetch all Kindergarten classes
  console.log('Step 1: Fetching Kindergarten classes...');
  const classesSnap = await db.collection('classes')
    .where('unitId', '==', 'KINDERGARTEN')
    .get();

  const kindyClasses = classesSnap.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  console.log(`Found ${kindyClasses.length} Kindergarten classes:`);
  kindyClasses.forEach(c => {
    console.log(`  - ID: ${c.id} | Name: ${(c as any).name} | Grade: ${(c as any).grade}`);
  });

  const kindyClassIds = new Set(kindyClasses.map(c => c.id));
  // In case some enrollments use Class names instead of classIds
  const kindyClassNames = new Set(kindyClasses.map(c => (c as any).name));

  // 2. Fetch all enrollments
  console.log('\nStep 2: Fetching enrollments for Kindergarten classes...');
  const enrollmentsSnap = await db.collection('enrollments').get();
  console.log(`Fetched ${enrollmentsSnap.size} total enrollment records.`);

  const kindyEnrollments = enrollmentsSnap.docs.filter(doc => {
    const data = doc.data();
    return kindyClassIds.has(data.classId) || kindyClassNames.has(data.classId);
  }).map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  console.log(`Found ${kindyEnrollments.length} enrollments associated with Kindergarten classes.`);

  // Get unique student IDs from these enrollments
  const enrolledStudentIds = Array.from(new Set(kindyEnrollments.map(e => (e as any).studentId).filter(Boolean)));
  console.log(`Found ${enrolledStudentIds.length} unique enrolled student IDs in Kindergarten classes.`);

  // 3. Fetch these student documents and check unitId
  console.log('\nStep 3: Auditing student documents...');
  const affectedStudents: any[] = [];
  const fineStudents: any[] = [];

  // Batch fetches or simple fetches
  for (const sId of enrolledStudentIds) {
    const studentDoc = await db.collection('students').doc(sId).get();
    if (!studentDoc.exists) {
      console.log(`⚠️ Enrolled student ID ${sId} does not exist in 'students' collection!`);
      continue;
    }

    const data = studentDoc.data() || {};
    const unitId = data.unitId;
    const fullName = data.fullName || data.name || 'Siswa Tanpa Nama';

    // Find class info from enrollment
    const enrollment = kindyEnrollments.find(e => (e as any).studentId === sId);
    const classIdInEnroll = (enrollment as any)?.classId;
    const classObj = kindyClasses.find(c => c.id === classIdInEnroll || (c as any).name === classIdInEnroll);
    const className = classObj ? (classObj as any).name : classIdInEnroll;

    if (!unitId || unitId !== 'KINDERGARTEN') {
      affectedStudents.push({
        id: sId,
        name: fullName,
        class: className,
        currentUnitId: unitId
      });
    } else {
      fineStudents.push({
        id: sId,
        name: fullName,
        class: className,
        currentUnitId: unitId
      });
    }
  }

  console.log(`\n=============================================================`);
  console.log(`📊 AUDIT REPORT:`);
  console.log(`  - Total Kindergarten Enrolled Students Checked: ${enrolledStudentIds.length}`);
  console.log(`  - Students with correct unitId ('KINDERGARTEN'): ${fineStudents.length}`);
  console.log(`  - AFFECTED STUDENTS (Missing or incorrect unitId): ${affectedStudents.length}`);
  console.log(`=============================================================\n`);

  if (affectedStudents.length > 0) {
    console.log(`LIST OF AFFECTED STUDENTS:`);
    affectedStudents.forEach((s, idx) => {
      console.log(`  ${idx + 1}. Name          : ${s.name}`);
      console.log(`     Student ID    : ${s.id}`);
      console.log(`     Class         : ${s.class}`);
      console.log(`     Current unitId: ${s.currentUnitId === undefined ? 'undefined' : JSON.stringify(s.currentUnitId)}`);
      console.log(`     ---------------------------------------------------------`);
    });

    if (liveRun) {
      console.log(`\nStep 4: Executing live backfill updates...`);
      const batch = db.batch();
      let updatedCount = 0;

      for (const s of affectedStudents) {
        const docRef = db.collection('students').doc(s.id);
        batch.update(docRef, { unitId: 'KINDERGARTEN' });
        updatedCount++;
      }

      await batch.commit();
      console.log(`✅ Success! Updated unitId to 'KINDERGARTEN' for ${updatedCount} student documents in Firestore.`);
    } else {
      console.log(`\n💡 To run live backfill and fix these students, execute the script with --live flag:`);
      console.log(`   npx tsx src/scripts/audit-kindy.ts --live`);
    }
  } else {
    console.log(`🎉 Perfect! No affected students found. All enrolled Kindergarten students have 'KINDERGARTEN' as their unitId.`);
  }
}

// Check arguments
const isLive = process.argv.includes('--live');
runAuditAndBackfill(isLive).catch(err => {
  console.error('🚨 Execution failed:', err);
  process.exit(1);
});
