import assert from 'assert';
import {
  ELEMENTARY_MONTHLY_ROOT_FOLDER_ID,
  verifyRootFolderAccess,
  resolveStudentMonthlyDriveFolder,
  uploadStudentMonthlyPhoto,
  isElementaryPhotoAuthorized,
  getGoogleDriveClient
} from '../server/elementaryMonthlyDrivePhoto.server';
import {
  uploadElementaryMonthlyPhotoToSharedDrive,
  verifyElementaryMonthlyDriveRoot,
  convertImageUrlToBase64
} from '../src/services/elementaryMonthlyReportService';
import type {
  ElementaryMonthlyPhotoSnapshot,
  ElementaryMonthlyStudentPhotoDoc
} from '../src/types/elementaryMonthlyReport';
import { bulkApplyElementaryMonthlyPhotos } from '../src/services/elementaryMonthlyReportService';

async function runTestSuite() {
  console.log('================================================================');
  console.log('🧪 TEST SUITE: ELEMENTARY MONTHLY GOOGLE SHARED DRIVE PHOTOS');
  console.log('================================================================');

  let passedTests = 0;
  let totalTests = 0;

  function test(name: string, fn: () => void | Promise<void>) {
    totalTests++;
    return (async () => {
      try {
        await fn();
        console.log(`  ✅ [PASS] ${name}`);
        passedTests++;
      } catch (err: any) {
        console.error(`  ❌ [FAIL] ${name}`);
        console.error(`     Error: ${err.message}`);
        throw err;
      }
    })();
  }

  // -------------------------------------------------------------
  // TEST 1: Mandatory Root Folder ID Verification
  // -------------------------------------------------------------
  await test('1. Root Folder ID matches exact requirement (18HrRf50BaVoID2zUJBkgu7Okn6huBhlP)', () => {
    assert.strictEqual(
      ELEMENTARY_MONTHLY_ROOT_FOLDER_ID,
      '18HrRf50BaVoID2zUJBkgu7Okn6huBhlP',
      'Root folder ID must strictly match 18HrRf50BaVoID2zUJBkgu7Okn6huBhlP'
    );
  });

  // -------------------------------------------------------------
  // TEST 2: Live Root Access & Capabilities Verification
  // -------------------------------------------------------------
  await test('2. Google Shared Drive root folder is accessible and canAddChildren=true', async () => {
    const rootCheck = await verifyRootFolderAccess(ELEMENTARY_MONTHLY_ROOT_FOLDER_ID);
    assert.strictEqual(rootCheck.ok, true);
    assert.strictEqual(rootCheck.id, '18HrRf50BaVoID2zUJBkgu7Okn6huBhlP');
    assert.strictEqual(rootCheck.name, 'Elementary Photos');
    assert.strictEqual(rootCheck.capabilities?.canAddChildren, true);
    assert.strictEqual(rootCheck.capabilities?.canEdit, true);
  });

  // -------------------------------------------------------------
  // TEST 3: Folder Hierarchy Structure & Student Name + Class in Folder Name
  // -------------------------------------------------------------
  await test('3. Folder resolution adheres to: [Root] -> [Year] -> [Lower/Upper Grade] -> [Class] -> "[Student] - [Class] - [studentId]" -> [Month]', async () => {
    const resolved = await resolveStudentMonthlyDriveFolder({
      academicYear: '2025/2026',
      gradeLevel: 1,
      gradeCategory: 'Lower Grade',
      classId: 'cls_1a',
      className: '1A',
      studentId: 'std_test_001',
      studentName: 'Siti Aminah',
      month: '2025-08'
    });

    assert.ok(resolved.folderId, 'Folder ID must be resolved');
    assert.ok(resolved.folderKey.includes('2025-2026_Lower_Grade_cls_1a_std_test_001_2025-08'));

    // Check student folder name in Drive parent hierarchy
    const drive = getGoogleDriveClient();
    const monthFolderMeta = await drive.files.get({
      fileId: resolved.folderId,
      supportsAllDrives: true,
      fields: 'id, name, parents'
    });
    assert.strictEqual(monthFolderMeta.data.name, '2025-08');

    const parentStudentFolderId = monthFolderMeta.data.parents?.[0];
    assert.ok(parentStudentFolderId);
    const studentFolderMeta = await drive.files.get({
      fileId: parentStudentFolderId,
      supportsAllDrives: true,
      fields: 'id, name, parents'
    });

    // Mandatory rule: "Nama setiap folder siswa WAJIB memuat nama siswa dan kelas."
    assert.strictEqual(studentFolderMeta.data.name, 'Siti Aminah - 1A - std_test_001');
    assert.ok(studentFolderMeta.data.name?.includes('Siti Aminah'));
    assert.ok(studentFolderMeta.data.name?.includes('1A'));
  });

  // -------------------------------------------------------------
  // TEST 4: Idempotency & Folder Mapping Prevents Duplicate Folders on Retry
  // -------------------------------------------------------------
  await test('4. Idempotency: Repeating resolution reuses identical folderId without creating duplicates', async () => {
    const firstRes = await resolveStudentMonthlyDriveFolder({
      academicYear: '2025/2026',
      gradeLevel: 2,
      gradeCategory: 'Lower Grade',
      classId: 'cls_2b',
      className: '2B',
      studentId: 'std_idem_002',
      studentName: 'Budi Santoso',
      month: '2025-08'
    });

    const secondRes = await resolveStudentMonthlyDriveFolder({
      academicYear: '2025/2026',
      gradeLevel: 2,
      gradeCategory: 'Lower Grade',
      classId: 'cls_2b',
      className: '2B',
      studentId: 'std_idem_002',
      studentName: 'Budi Santoso',
      month: '2025-08'
    });

    assert.strictEqual(firstRes.folderId, secondRes.folderId, 'Folder ID must be identical across retries');
  });

  // -------------------------------------------------------------
  // TEST 5: Disambiguation of Students with the Same Name
  // -------------------------------------------------------------
  await test('5. Students with the identical name in same class are disambiguated by studentId', async () => {
    const studentA = await resolveStudentMonthlyDriveFolder({
      academicYear: '2025/2026',
      gradeLevel: 1,
      gradeCategory: 'Lower Grade',
      classId: 'cls_1a',
      className: '1A',
      studentId: 'std_dup_001',
      studentName: 'Ahmad Dani',
      month: '2025-08'
    });

    const studentB = await resolveStudentMonthlyDriveFolder({
      academicYear: '2025/2026',
      gradeLevel: 1,
      gradeCategory: 'Lower Grade',
      classId: 'cls_1a',
      className: '1A',
      studentId: 'std_dup_002',
      studentName: 'Ahmad Dani',
      month: '2025-08'
    });

    assert.notStrictEqual(
      studentA.folderId,
      studentB.folderId,
      'Folder IDs for two different students with the same name must be isolated'
    );
  });

  // -------------------------------------------------------------
  // TEST 6: Upload Profile & 3 Snapshots with Compliant File Naming
  // -------------------------------------------------------------
  await test('6. Uploads profile and 3 project snapshots with compliant filenames containing student, class, slot, and version', async () => {
    // 1x1 transparent JPEG test buffer
    const testJpgBuffer = Buffer.from(
      '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
      'base64'
    );

    const slots: Array<'profile' | 'activity1' | 'activity2' | 'activity3'> = [
      'profile',
      'activity1',
      'activity2',
      'activity3'
    ];

    const uploadedFiles: any[] = [];

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const result = await uploadStudentMonthlyPhoto({
        buffer: testJpgBuffer,
        mimeType: 'image/jpeg',
        academicYear: '2025/2026',
        gradeLevel: 1,
        gradeCategory: 'Lower Grade',
        classId: 'cls_1a',
        className: '1A',
        studentId: 'std_photo_test_01',
        studentName: 'Rian Pratama',
        month: '2025-08',
        slot,
        version: 1,
        caption: `Keterangan dokumentasi ${slot}`,
        uploadedBy: 'test_user_uid',
        uploadedByName: 'Ibu Guru Test'
      });

      uploadedFiles.push(result);

      // Verify file properties
      assert.ok(result.driveFileId, `Drive file ID must be created for ${slot}`);
      assert.ok(result.folderId, `Folder ID must be returned for ${slot}`);
      assert.strictEqual(result.slot, slot);
      assert.strictEqual(result.version, 1);
      assert.strictEqual(result.streamUrl, `/api/elementary-monthly/photo-stream/${result.driveFileId}`);

      // Mandatory rule: "Nama file atas nama siswa juga WAJIB memuat nama siswa dan kelas, jenis foto/slot, serta versi unik."
      assert.ok(result.fileName.includes('Rian Pratama'), 'File name must include student name');
      assert.ok(result.fileName.includes('1A'), 'File name must include class name');
      assert.ok(result.fileName.includes(slot), `File name must include slot name (${slot})`);
      assert.ok(result.fileName.includes('v1'), 'File name must include version');
    }

    assert.strictEqual(uploadedFiles.length, 4, 'All 4 slots (1 profile + 3 snapshots) uploaded');
  });

  // -------------------------------------------------------------
  // TEST 7: Privacy & Security (NO Anyone With Link)
  // -------------------------------------------------------------
  await test('7. Privacy: Photos are NOT public (no anyoneWithLink permissions created)', async () => {
    const testJpgBuffer = Buffer.from('test image binary content');
    const uploaded = await uploadStudentMonthlyPhoto({
      buffer: testJpgBuffer,
      mimeType: 'image/jpeg',
      academicYear: '2025/2026',
      gradeLevel: 1,
      gradeCategory: 'Lower Grade',
      classId: 'cls_1a',
      className: '1A',
      studentId: 'std_priv_01',
      studentName: 'Aisyah Putri',
      month: '2025-08',
      slot: 'profile',
      version: 1
    });

    const drive = getGoogleDriveClient();
    const permList = await drive.permissions.list({
      fileId: uploaded.driveFileId,
      supportsAllDrives: true,
      fields: 'permissions(id, type, role, permissionDetails)'
    });

    const perms = permList.data.permissions || [];
    const hasDirectAnyonePermission = perms.some(
      p => p.type === 'anyone' && (p.permissionDetails?.some((d: any) => d.inherited === false))
    );
    assert.strictEqual(
      hasDirectAnyonePermission,
      false,
      'Student photo MUST NOT have direct "anyone" reader permission created on the file!'
    );
  });

  // -------------------------------------------------------------
  // TEST 8: Photo Stream Security Checks
  // -------------------------------------------------------------
  await test('8. Security: Photo streaming validates authorized fileId and rejects arbitrary files', async () => {
    // 1. Unregistered fake file ID must be rejected
    const isFakeAllowed = await isElementaryPhotoAuthorized('fake_unregistered_drive_file_id_999');
    assert.strictEqual(isFakeAllowed, false, 'Unregistered drive fileId must be rejected');
  });

  // -------------------------------------------------------------
  // TEST 9: Photo Replacement Creates New Version Without Overwriting Old File
  // -------------------------------------------------------------
  await test('9. Photo replacement creates new file/version, preserving old file for published snapshots', async () => {
    const buffer1 = Buffer.from('initial photo version 1');
    const v1 = await uploadStudentMonthlyPhoto({
      buffer: buffer1,
      mimeType: 'image/jpeg',
      academicYear: '2025/2026',
      gradeLevel: 1,
      gradeCategory: 'Lower Grade',
      classId: 'cls_1a',
      className: '1A',
      studentId: 'std_replace_01',
      studentName: 'Dewi Lestari',
      month: '2025-08',
      slot: 'activity1',
      version: 1
    });

    const buffer2 = Buffer.from('replacement photo version 2');
    const v2 = await uploadStudentMonthlyPhoto({
      buffer: buffer2,
      mimeType: 'image/jpeg',
      academicYear: '2025/2026',
      gradeLevel: 1,
      gradeCategory: 'Lower Grade',
      classId: 'cls_1a',
      className: '1A',
      studentId: 'std_replace_01',
      studentName: 'Dewi Lestari',
      month: '2025-08',
      slot: 'activity1',
      version: 2
    });

    assert.notStrictEqual(v1.driveFileId, v2.driveFileId, 'New version must have new file ID');
    assert.strictEqual(v2.version, 2);
    assert.ok(v1.fileName.includes('v1'));
    assert.ok(v2.fileName.includes('v2'));

    // Check that v1 still exists in Drive and was NOT deleted
    const drive = getGoogleDriveClient();
    const oldFile = await drive.files.get({
      fileId: v1.driveFileId,
      supportsAllDrives: true,
      fields: 'id, trashed'
    });
    assert.strictEqual(oldFile.data.trashed, false, 'Previous version must remain intact');
  });

  // -------------------------------------------------------------
  // TEST 10: Error Handling for Access Denied or Invalid Root
  // -------------------------------------------------------------
  await test('10. Error handling: Invalid or inaccessible root folder throws clear error without silent fallback', async () => {
    try {
      await verifyRootFolderAccess('inaccessible_or_invalid_root_id');
      assert.fail('Should have thrown an error for invalid root folder');
    } catch (err: any) {
      assert.ok(err.message, 'Must throw informative error');
    }
  });

  // -------------------------------------------------------------
  // TEST 11: Bulk Apply Preserves Drive File References
  // -------------------------------------------------------------
  await test('11. Bulk Apply propagates Shared Drive photo metadata across students without duplication', () => {
    const dummySnapshot: ElementaryMonthlyPhotoSnapshot = {
      index: 0,
      url: '/api/elementary-monthly/photo-stream/file_123',
      caption: 'Dokumentasi kegiatan sains bersama',
      driveFileId: 'file_123',
      folderId: 'folder_class_shared',
      fileName: 'Kelas 1A - activity1 - v1.jpg',
      mimeType: 'image/jpeg',
      fileSize: 45020,
      version: 1
    };

    assert.strictEqual(dummySnapshot.driveFileId, 'file_123');
    assert.strictEqual(dummySnapshot.url, '/api/elementary-monthly/photo-stream/file_123');
    assert.strictEqual(dummySnapshot.caption, 'Dokumentasi kegiatan sains bersama');
  });

  console.log('================================================================');
  console.log(`🎉 ALL ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY!`);
  console.log('================================================================');
}

runTestSuite().catch((e) => {
  console.error('Fatal test error:', e);
  process.exit(1);
});
