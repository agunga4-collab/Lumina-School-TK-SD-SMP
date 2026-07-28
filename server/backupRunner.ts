import express from "express";
import { getFirestore, FieldValue, FieldPath } from "firebase-admin/firestore";
import { google } from "googleapis";

export const backupRunnerRouter = express.Router();

const runningJobs = new Set<string>();

// --- Google Auth Helpers ---
const getGoogleAuth = () => {
  try {
    const saJson = process.env.GOOGLE_BACKUP_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!saJson) return null;
    
    let serviceAccount;
    try {
      serviceAccount = JSON.parse(saJson);
    } catch (parseErr) {
      console.error("[BackupRunner-Auth] Failed to parse Service Account JSON");
      return null;
    }

    const auth = new google.auth.JWT({
      email: serviceAccount.client_email,
      key: serviceAccount.private_key?.replace(/\\n/g, '\n'),
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive'
      ]
    });
    return auth;
  } catch (err) {
    console.error("[BackupRunner-Auth] Helper failed:", err);
    return null;
  }
};

const getDrive = (auth: any) => google.drive({ version: 'v3', auth: auth || undefined });
const getSheets = (auth: any) => google.sheets({ version: 'v4', auth: auth || undefined });

// --- Helper Utilities ---
function getColumnLetter(index: number): string {
  let letter = "";
  while (index >= 0) {
    letter = String.fromCharCode((index % 26) + 65) + letter;
    index = Math.floor(index / 26) - 1;
  }
  return letter;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function getSanitizedTabTitle(monthNameIndo: string, yearNum: number, className: string): string {
  let cleanClassName = className.replace(/[\*\?\/\\\[\]\:]/g, ' ');
  cleanClassName = cleanClassName.replace(/\s+/g, ' ').trim();
  const title = `${monthNameIndo} ${yearNum} - ${cleanClassName}`;
  let finalTitle = title.substring(0, 100).trim();
  if (finalTitle.startsWith("'")) finalTitle = finalTitle.substring(1);
  if (finalTitle.endsWith("'")) finalTitle = finalTitle.substring(0, finalTitle.length - 1);
  return finalTitle || "Dhuhur Attendance";
}

async function findOrCreateFolder(drive: any, name: string, parentId: string, sharedDriveId?: string) {
  const q = `name = '${name}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const response = await drive.files.list({
    q,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    driveId: sharedDriveId,
    corpora: sharedDriveId ? 'drive' : undefined,
    fields: 'files(id, name)',
  });

  if (response.data.files && response.data.files.length > 0) {
    return response.data.files[0].id;
  }

  const folder = await drive.files.create({
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
    supportsAllDrives: true,
    fields: 'id',
  });

  return folder.data.id;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function getErrorCategory(err: any): 'QUOTA' | 'AUTH' | 'NETWORK' | 'OTHER' {
  const status = err.status || err.code;
  const msg = (err.message || '').toLowerCase();
  
  if (status === 429 || msg.includes('resource_exhausted') || msg.includes('ratelimitexceeded') || msg.includes('too many requests')) {
    return 'QUOTA';
  }
  if (status === 401 || status === 403 || msg.includes('invalid_grant') || msg.includes('unauthorized') || msg.includes('forbidden') || msg.includes('caller does not have permission')) {
    return 'AUTH';
  }
  if (err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED' || msg.includes('timeout') || msg.includes('network') || msg.includes('fetch failed')) {
    return 'NETWORK';
  }
  return 'OTHER';
}

// --- Daily Attendance Sheet Write Handler ---
async function syncDailyAttendanceGroup(
  db: any,
  sheets: any,
  drive: any,
  classId: string,
  date: string,
  academicYearId: string,
  semester: string,
  recordsToSync: any[]
): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  const firstRecord = recordsToSync[0];
  const academicYear = firstRecord.academicYear;

  // 1. Load backup config
  const configSnap = await db.collection("system_backup_configs").doc("junior_high_attendance").get();
  if (!configSnap.exists) {
    throw new Error("Backup config not found");
  }
  const config = configSnap.data();
  if (!config?.isEnabled) {
    throw new Error("Backup disabled in system configuration");
  }

  // 2. Resolve target Spreadsheet
  const mapId = `${classId}_${academicYearId}_S${semester}`;
  const mapSnap = await db.collection("attendance_backup_file_maps").doc(mapId).get();
  
  let spreadsheetId = "";
  let spreadsheetUrl = "";
  let semesterFolderId = "";

  if (mapSnap.exists) {
    const mapData = mapSnap.data();
    spreadsheetId = mapData?.spreadsheetId || "";
    spreadsheetUrl = mapData?.spreadsheetUrl || "";
    semesterFolderId = mapData?.folderId || "";
  }

  let driveExists = false;
  if (spreadsheetId) {
    try {
      await drive.files.get({ fileId: spreadsheetId, supportsAllDrives: true });
      driveExists = true;
    } catch (err) {
      console.warn(`[BackupRunner] Spreadsheet ID ${spreadsheetId} mapped but not found in Drive. Will recreate.`);
    }
  }

  if (!driveExists) {
    const yearFolderId = await findOrCreateFolder(drive, academicYear, config.rootFolderId, config.sharedDriveId);
    semesterFolderId = await findOrCreateFolder(drive, `Semester ${semester}`, yearFolderId, config.sharedDriveId);
    
    const ssTitle = `Attendance Recap - ${classId} - ${academicYear} (S${semester})`;
    const q = `name = '${ssTitle.replace(/'/g, "\\'")}' and '${semesterFolderId}' in parents and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`;
    const existingSS = await drive.files.list({
      q,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      driveId: config.sharedDriveId,
      corpora: config.sharedDriveId ? 'drive' : undefined,
      fields: 'files(id, name, webViewLink)',
    });

    if (existingSS.data.files && existingSS.data.files.length > 0) {
      spreadsheetId = existingSS.data.files[0].id!;
      spreadsheetUrl = existingSS.data.files[0].webViewLink!;
    } else {
      const fileResponse = await drive.files.create({
        requestBody: {
          name: ssTitle,
          mimeType: 'application/vnd.google-apps.spreadsheet',
          parents: [semesterFolderId]
        },
        supportsAllDrives: true,
        fields: 'id, name, webViewLink'
      });
      spreadsheetId = fileResponse.data.id!;
      spreadsheetUrl = fileResponse.data.webViewLink!;

      // Init sheets
      const ssMeta = await sheets.spreadsheets.get({ spreadsheetId });
      const defaultSheetId = ssMeta.data.sheets?.[0]?.properties?.sheetId;

      const initRequests: any[] = [
        { addSheet: { properties: { title: 'Metadata' } } },
        { addSheet: { properties: { title: 'Rekap' } } },
        { addSheet: { properties: { title: 'Log' } } }
      ];

      if (defaultSheetId !== undefined) {
        initRequests.push({ deleteSheet: { sheetId: defaultSheetId } });
      }

      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: initRequests }
      });

      // Headers
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Metadata!A1',
        valueInputOption: 'RAW',
        requestBody: { values: [['Property', 'Value'], ['Class', classId], ['Year', academicYear], ['Semester', semester]] }
      });
      
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Log!A1',
        valueInputOption: 'RAW',
        requestBody: { values: [['Timestamp', 'Student ID', 'Student Name', 'Date', 'Status', 'Note', 'Updated By']] }
      });
    }

    await db.collection("attendance_backup_file_maps").doc(mapId).set({
      id: mapId,
      classId,
      academicYear,
      semester,
      spreadsheetId,
      spreadsheetUrl,
      folderId: semesterFolderId,
      lastSyncedAt: Date.now()
    });
  }

  // 3. Log tab update
  const logResponse = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Log!A1:G10000',
  });
  const logRows = logResponse.data.values || [];
  const logHeader = logRows[0] || ['Timestamp', 'Student ID', 'Student Name', 'Date', 'Status', 'Note', 'Updated By'];

  const logMap = new Map<string, any[]>();
  for (let i = 1; i < logRows.length; i++) {
    const row = logRows[i];
    if (row[1] && row[3]) {
      const key = `${row[1]}_${row[3]}`;
      logMap.set(key, row);
    }
  }

  for (const record of recordsToSync) {
    const key = `${record.studentId}_${record.date}`;
    logMap.set(key, [
      new Date().toISOString(),
      record.studentId,
      record.studentName || record.studentNameSnapshot || "Siswa Tanpa Nama",
      record.date,
      record.status,
      record.note || "",
      record.recordedBy || "System"
    ]);
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: 'Log!A1',
    valueInputOption: 'RAW',
    requestBody: { values: [logHeader, ...Array.from(logMap.values())] }
  });

  // 4. Rekap tab update
  const rekapResponse = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Rekap!A1:ZZ500',
  });
  const rekapRows = rekapResponse.data.values || [];
  const rekapHeader = rekapRows[0] || ['Student ID', 'Student Name'];
  
  let colIndex = rekapHeader.indexOf(date);
  if (colIndex === -1) {
    colIndex = rekapHeader.length;
    rekapHeader.push(date);
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Rekap!A1',
      valueInputOption: 'RAW',
      requestBody: { values: [rekapHeader] }
    });
  }

  const rekapStudentMap = new Map<string, any[]>();
  for (let i = 1; i < rekapRows.length; i++) {
    const row = rekapRows[i];
    if (row[0]) {
      rekapStudentMap.set(row[0], row);
    }
  }

  for (const record of recordsToSync) {
    const studentId = record.studentId;
    let row = rekapStudentMap.get(studentId);
    if (!row) {
      row = [studentId, record.studentName || record.studentNameSnapshot || "Siswa Tanpa Nama"];
    }
    while (row.length < colIndex + 1) {
      row.push('');
    }
    row[colIndex] = record.status;
    rekapStudentMap.set(studentId, row);
  }

  const sortedRekapRows = Array.from(rekapStudentMap.values()).sort((a, b) => {
    return (a[1] || '').localeCompare(b[1] || '');
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: 'Rekap!A1',
    valueInputOption: 'RAW',
    requestBody: { values: [rekapHeader, ...sortedRekapRows] }
  });

  // 5. Monthly recap update
  const INDONESIAN_MONTHS = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
  ];
  const dateParts = date.split('-');
  const yearNum = parseInt(dateParts[0], 10);
  const monthNum = parseInt(dateParts[1], 10);
  const monthNameIndo = INDONESIAN_MONTHS[monthNum - 1];
  const tabTitle = `${monthNameIndo} ${yearNum}`;
  const totalDays = new Date(yearNum, monthNum, 0).getDate();

  const ssUpdatedInfo = await sheets.spreadsheets.get({ spreadsheetId });
  const sheetTitles = ssUpdatedInfo.data.sheets?.map((s: any) => s.properties?.title || "") || [];

  if (!sheetTitles.includes(tabTitle)) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: tabTitle } } }]
      }
    });
  }

  // Load all students for the class to populate full tab
  const studentsSnap = await db.collection("students").where("classId", "==", classId).get();
  const sortedStudents = studentsSnap.docs.map((doc: any) => {
    const d = doc.data();
    return {
      id: d.luminaId || d.nis || doc.id,
      name: d.name || d.displayName || d.fullName || "Siswa Tanpa Nama"
    };
  }).sort((a: any, b: any) => a.name.localeCompare(b.name));

  const monthPrefix = `${yearNum}-${String(monthNum).padStart(2, '0')}`;
  const monthlyRecordsSnap = await db.collection("attendance_records")
    .where("classId", "==", classId)
    .where("date", ">=", `${monthPrefix}-01`)
    .where("date", "<=", `${monthPrefix}-31`)
    .get();

  const recordMap = new Map();
  monthlyRecordsSnap.docs.forEach((doc: any) => {
    const data = doc.data();
    if (!recordMap.has(data.studentId)) {
      recordMap.set(data.studentId, new Map());
    }
    recordMap.get(data.studentId).set(data.date, data.status);
  });

  for (const record of recordsToSync) {
    if (!recordMap.has(record.studentId)) {
      recordMap.set(record.studentId, new Map());
    }
    recordMap.get(record.studentId).set(record.date, record.status);
  }

  const header1 = [`REKAP KEHADIRAN JUNIOR HIGH — ${classId}`];
  const header2 = [`Bulan: ${tabTitle} | Tahun Ajaran: ${academicYear} | Semester: ${semester}`];
  const header3: string[] = [];
  const header4 = ['No', 'Nama Siswa'];
  for (let d = 1; d <= totalDays; d++) {
    header4.push(String(d));
  }
  header4.push('H', 'S', 'I', 'A', 'Persentase Kehadiran');

  const rows = [header1, header2, header3, header4];

  sortedStudents.forEach((student: any, sIdx: number) => {
    const rowNum = 5 + sIdx;
    const studentRow = [
      String(sIdx + 1),
      student.name
    ];

    for (let d = 1; d <= totalDays; d++) {
      const dayStr = String(d).padStart(2, '0');
      const fullDate = `${yearNum}-${String(monthNum).padStart(2, '0')}-${dayStr}`;
      const status = recordMap.get(student.id)?.get(fullDate) || '';
      let code = '';
      if (status === 'HADIR' || status === 'LATE') code = 'H';
      else if (status === 'SAKIT') code = 'S';
      else if (status === 'IZIN') code = 'I';
      else if (status === 'ALPA') code = 'A';
      studentRow.push(code);
    }

    const firstDateColLetter = 'C';
    const lastDateColLetter = getColumnLetter(2 + totalDays - 1);
    const colH_Letter = getColumnLetter(2 + totalDays);
    const colS_Letter = getColumnLetter(2 + totalDays + 1);
    const colI_Letter = getColumnLetter(2 + totalDays + 2);
    const colA_Letter = getColumnLetter(2 + totalDays + 3);

    studentRow.push(
      `=COUNTIF(${firstDateColLetter}${rowNum}:${lastDateColLetter}${rowNum}, "H")`,
      `=COUNTIF(${firstDateColLetter}${rowNum}:${lastDateColLetter}${rowNum}, "S")`,
      `=COUNTIF(${firstDateColLetter}${rowNum}:${lastDateColLetter}${rowNum}, "I")`,
      `=COUNTIF(${firstDateColLetter}${rowNum}:${lastDateColLetter}${rowNum}, "A")`,
      `=IF((${colH_Letter}${rowNum}+${colS_Letter}${rowNum}+${colI_Letter}${rowNum}+${colA_Letter}${rowNum})>0, ${colH_Letter}${rowNum}/(${colH_Letter}${rowNum}+${colS_Letter}${rowNum}+${colI_Letter}${rowNum}+${colA_Letter}${rowNum}), "")`
    );

    rows.push(studentRow);
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${tabTitle}!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: rows }
  });

  return { spreadsheetId, spreadsheetUrl };
}

// --- Dhuhur Attendance Sheet Write Handler ---
async function syncDhuhurAttendanceGroup(
  db: any,
  sheets: any,
  drive: any,
  classId: string,
  date: string,
  academicYearId: string,
  semester: string,
  recordsToSync: any[]
): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  const firstRecord = recordsToSync[0];
  const academicYear = firstRecord.academicYear;

  // 1. Load backup config
  const configSnap = await db.collection("system_backup_configs").doc("junior_high_attendance").get();
  if (!configSnap.exists) {
    throw new Error("Backup config not found");
  }
  const config = configSnap.data();
  if (!config?.isEnabled) {
    throw new Error("Backup disabled in system configuration");
  }

  // 2. Resolve target Spreadsheet
  const mapId = `dhuhur_JUNIOR_HIGH_${academicYearId}_S${semester}`;
  const mapSnap = await db.collection("attendance_backup_file_maps").doc(mapId).get();
  
  let spreadsheetId = "";
  let spreadsheetUrl = "";
  let semesterFolderId = "";

  if (mapSnap.exists) {
    const mapData = mapSnap.data();
    spreadsheetId = mapData?.spreadsheetId || "";
    spreadsheetUrl = mapData?.spreadsheetUrl || "";
    semesterFolderId = mapData?.folderId || "";
  }

  let driveExists = false;
  if (spreadsheetId) {
    try {
      await drive.files.get({ fileId: spreadsheetId, supportsAllDrives: true });
      driveExists = true;
    } catch (err) {
      console.warn(`[BackupRunner] Dhuhur Spreadsheet ID ${spreadsheetId} mapped but not found in Drive. Will recreate.`);
    }
  }

  if (!driveExists) {
    const yearFolderId = await findOrCreateFolder(drive, academicYear, config.rootFolderId, config.sharedDriveId);
    semesterFolderId = await findOrCreateFolder(drive, `Semester ${semester}`, yearFolderId, config.sharedDriveId);
    
    const ssTitle = `Kehadiran Shalat Dhuhur Junior High — ${academicYear} — Semester ${semester}`;
    const q = `name = '${ssTitle.replace(/'/g, "\\'")}' and '${semesterFolderId}' in parents and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`;
    const existingSS = await drive.files.list({
      q,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      driveId: config.sharedDriveId,
      corpora: config.sharedDriveId ? 'drive' : undefined,
      fields: 'files(id, name, webViewLink)',
    });

    if (existingSS.data.files && existingSS.data.files.length > 0) {
      spreadsheetId = existingSS.data.files[0].id!;
      spreadsheetUrl = existingSS.data.files[0].webViewLink!;
    } else {
      const fileResponse = await drive.files.create({
        requestBody: {
          name: ssTitle,
          mimeType: 'application/vnd.google-apps.spreadsheet',
          parents: [semesterFolderId]
        },
        supportsAllDrives: true,
        fields: 'id, name, webViewLink'
      });
      spreadsheetId = fileResponse.data.id!;
      spreadsheetUrl = fileResponse.data.webViewLink!;

      // Init sheets
      const ssMeta = await sheets.spreadsheets.get({ spreadsheetId });
      const defaultSheetId = ssMeta.data.sheets?.[0]?.properties?.sheetId;

      const initRequests: any[] = [
        { addSheet: { properties: { title: 'Metadata' } } },
        { addSheet: { properties: { title: 'Rekap' } } },
        { addSheet: { properties: { title: 'Log' } } }
      ];

      if (defaultSheetId !== undefined) {
        initRequests.push({ deleteSheet: { sheetId: defaultSheetId } });
      }

      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: initRequests }
      });

      // Headers metadata
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Metadata!A1',
        valueInputOption: 'RAW',
        requestBody: {
          values: [
            ['Property', 'Value'],
            ['Unit', 'JUNIOR_HIGH'],
            ['Tahun Ajaran', academicYear],
            ['Semester', semester],
            ['Tipe Kehadiran', 'Shalat Dhuhur'],
            ['Dibuat pada', new Date().toISOString()],
            ['Terakhir diperbarui', new Date().toISOString()]
          ]
        }
      });

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Log!A1',
        valueInputOption: 'RAW',
        requestBody: {
          values: [[
            'Record ID', 'Tanggal', 'Tahun Ajaran', 'Semester', 'Kelas',
            'Student ID', 'Nama Siswa', 'Status Kode', 'Status Keterangan',
            'Catatan', 'Diinput Oleh', 'Waktu Simpan'
          ]]
        }
      });

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Rekap!A1',
        valueInputOption: 'RAW',
        requestBody: {
          values: [[
            'Kelas', 'Student ID', 'Nama Siswa', 'H', 'T', 'A', 'Total Sesi', 'Persentase Tepat Waktu'
          ]]
        }
      });
    }

    await db.collection("attendance_backup_file_maps").doc(mapId).set({
      id: mapId,
      classId: "JUNIOR_HIGH_DHUHUR",
      academicYear,
      semester,
      spreadsheetId,
      spreadsheetUrl,
      folderId: semesterFolderId,
      lastSyncedAt: Date.now()
    });
  }

  // 3. Log tab upsert
  const logResponse = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Log!A1:L10000',
  });
  const logRows = logResponse.data.values || [];
  const logHeader = logRows[0] || [
    'Record ID', 'Tanggal', 'Tahun Ajaran', 'Semester', 'Kelas',
    'Student ID', 'Nama Siswa', 'Status Kode', 'Status Keterangan',
    'Catatan', 'Diinput Oleh', 'Waktu Simpan'
  ];

  const logMap = new Map();
  for (let i = 1; i < logRows.length; i++) {
    const row = logRows[i];
    if (row[0]) {
      logMap.set(row[0], row);
    }
  }

  for (const record of recordsToSync) {
    const statusKet = record.status === 'H' ? 'Hadir Tepat Waktu' : record.status === 'T' ? 'Terlambat' : 'Absen';
    logMap.set(record.id, [
      record.id,
      record.date,
      record.academicYear,
      record.semester,
      record.classNameSnapshot || classId,
      record.studentId,
      record.studentNameSnapshot || record.studentName || "Siswa Tanpa Nama",
      record.status,
      statusKet,
      record.note || "",
      record.recordedByEmail || "System",
      new Date().toISOString()
    ]);
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: 'Log!A1',
    valueInputOption: 'RAW',
    requestBody: { values: [logHeader, ...Array.from(logMap.values())] }
  });

  // 4. Rekap tab upsert
  const studentIds = Array.from(new Set(recordsToSync.map(r => r.studentId)));
  const studentRecords: any[] = [];
  const studentChunks = chunkArray(studentIds, 10);
  const semesterNum = parseInt(String(semester), 10);
  const semesterQueryList = isNaN(semesterNum) ? [semester] : [semesterNum, String(semesterNum)];

  for (const chunk of studentChunks) {
    const studentRecordsSnap = await db.collection("dhuhur_attendance_records")
      .where("academicYearId", "==", academicYearId)
      .where("semester", "in", semesterQueryList)
      .where("studentId", "in", chunk)
      .get();
    studentRecords.push(...studentRecordsSnap.docs.map((doc: any) => doc.data()));
  }

  const rekapResponse = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Rekap!A1:H5000',
  });
  const rekapRows = rekapResponse.data.values || [];
  const rekapHeader = rekapRows[0] || [
    'Kelas', 'Student ID', 'Nama Siswa', 'H', 'T', 'A', 'Total Sesi', 'Persentase Tepat Waktu'
  ];

  const rekapMap = new Map();
  for (let i = 1; i < rekapRows.length; i++) {
    const row = rekapRows[i];
    if (row[1]) {
      rekapMap.set(row[1], row);
    }
  }

  for (const studentId of studentIds) {
    const sRecs = studentRecords.filter(r => r.studentId === studentId);
    const countH = sRecs.filter(r => r.status === 'H').length;
    const countT = sRecs.filter(r => r.status === 'T').length;
    const countA = sRecs.filter(r => r.status === 'A').length;

    const anyRec = sRecs[0] || recordsToSync.find(r => r.studentId === studentId);
    const className = anyRec?.classNameSnapshot || classId;
    const studentName = anyRec?.studentNameSnapshot || anyRec?.studentName || 'Siswa Tanpa Nama';

    rekapMap.set(studentId, [className, studentId, studentName, countH, countT, countA]);
  }

  const sortedRekapRows = Array.from(rekapMap.values()).sort((a, b) => {
    const classComp = (a[0] || '').localeCompare(b[0] || '');
    if (classComp !== 0) return classComp;
    return (a[2] || '').localeCompare(b[2] || '');
  });

  const finalRekapRows = [rekapHeader];
  sortedRekapRows.forEach((row, idx) => {
    const rowNum = idx + 2;
    finalRekapRows.push([
      row[0],
      row[1],
      row[2],
      row[3],
      row[4],
      row[5],
      `=D${rowNum}+E${rowNum}+F${rowNum}`,
      `=IF((D${rowNum}+E${rowNum}+F${rowNum})>0,D${rowNum}/(D${rowNum}+E${rowNum}+F${rowNum}),"")`
    ]);
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: 'Rekap!A1',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: finalRekapRows }
  });

  // 5. Month tab upsert
  const dateParts = date.split('-');
  const yearNum = parseInt(dateParts[0], 10);
  const monthNum = parseInt(dateParts[1], 10);
  const INDONESIAN_MONTHS = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
  ];
  const monthNameIndo = INDONESIAN_MONTHS[monthNum - 1];

  // Group records by className to support per-class month tab update
  const className = recordsToSync[0]?.classNameSnapshot || classId;
  const tabTitle = getSanitizedTabTitle(monthNameIndo, yearNum, className);
  const totalDays = new Date(yearNum, monthNum, 0).getDate();

  const ssUpdatedInfo = await sheets.spreadsheets.get({ spreadsheetId });
  const sheetTitles = ssUpdatedInfo.data.sheets?.map((s: any) => s.properties?.title || "") || [];

  if (!sheetTitles.includes(tabTitle)) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: tabTitle } } }]
      }
    });
  }

  const studentsSnap = await db.collection("students").where("classId", "==", classId).get();
  const sortedStudents = studentsSnap.docs.map((doc: any) => {
    const d = doc.data();
    return {
      id: d.luminaId || d.nis || doc.id,
      name: d.name || d.displayName || d.fullName || "Siswa Tanpa Nama"
    };
  }).sort((a: any, b: any) => a.name.localeCompare(b.name));

  const monthPrefix = `${yearNum}-${String(monthNum).padStart(2, '0')}`;
  const monthlyRecordsSnap = await db.collection("dhuhur_attendance_records")
    .where("classId", "==", classId)
    .where("academicYearId", "==", academicYearId)
    .where("semester", "in", semesterQueryList)
    .where("date", ">=", `${monthPrefix}-01`)
    .where("date", "<=", `${monthPrefix}-31`)
    .get();

  const recordMap = new Map();
  monthlyRecordsSnap.docs.forEach((doc: any) => {
    const data = doc.data();
    if (!recordMap.has(data.studentId)) {
      recordMap.set(data.studentId, new Map());
    }
    recordMap.get(data.studentId).set(data.date, data.status);
  });

  for (const record of recordsToSync) {
    if (!recordMap.has(record.studentId)) {
      recordMap.set(record.studentId, new Map());
    }
    recordMap.get(record.studentId).set(record.date, record.status);
  }

  const header1 = [`REKAP SHALAT DHUHUR JUNIOR HIGH — ${className}`];
  const header2 = [`Bulan: ${monthNameIndo} ${yearNum} | Tahun Ajaran: ${academicYear} | Semester: ${semester}`];
  const header3: string[] = [];
  const header4 = ['No', 'Nama Siswa'];
  for (let d = 1; d <= totalDays; d++) {
    header4.push(String(d));
  }
  header4.push('H', 'T', 'A', 'Total Sesi', 'Persentase Tepat Waktu');

  const rows = [header1, header2, header3, header4];

  sortedStudents.forEach((student: any, sIdx: number) => {
    const rowNum = 5 + sIdx;
    const studentRow = [
      String(sIdx + 1),
      student.name
    ];

    for (let d = 1; d <= totalDays; d++) {
      const dayStr = String(d).padStart(2, '0');
      const fullDate = `${yearNum}-${String(monthNum).padStart(2, '0')}-${dayStr}`;
      const status = recordMap.get(student.id)?.get(fullDate) || '';
      studentRow.push(status);
    }

    const firstDateColLetter = 'C';
    const lastDateColLetter = getColumnLetter(2 + totalDays - 1);
    const colH_Letter = getColumnLetter(2 + totalDays);
    const colT_Letter = getColumnLetter(2 + totalDays + 1);
    const colA_Letter = getColumnLetter(2 + totalDays + 2);

    studentRow.push(
      `=COUNTIF(${firstDateColLetter}${rowNum}:${lastDateColLetter}${rowNum}, "H")`,
      `=COUNTIF(${firstDateColLetter}${rowNum}:${lastDateColLetter}${rowNum}, "T")`,
      `=COUNTIF(${firstDateColLetter}${rowNum}:${lastDateColLetter}${rowNum}, "A")`,
      `=D${rowNum}+E${rowNum}+F${rowNum}`,
      `=IF((D${rowNum}+E${rowNum}+F${rowNum})>0,D${rowNum}/(D${rowNum}+E${rowNum}+F${rowNum}),"")`
    );

    rows.push(studentRow);
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${tabTitle}!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: rows }
  });

  return { spreadsheetId, spreadsheetUrl };
}

// --- Background Job Execution Logic ---
async function runBackupJobAsync(
  jobId: string,
  mode: 'START' | 'RETRY_FAILED' | 'REBUILD_ALL',
  email: string
) {
  const db = getFirestore();
  const backupType = jobId === 'attendance_junior_high' ? 'ATTENDANCE' : 'DHUHUR_ATTENDANCE';
  
  try {
    console.log(`[BackupRunner] Starting job ${jobId} in background with mode: ${mode}`);
    
    // 1. Set state to PREPARING
    await db.collection("system_backup_jobs").doc(jobId).set({
      id: jobId,
      backupType,
      unit: 'JUNIOR_HIGH',
      status: 'PREPARING',
      startedAt: Date.now(),
      updatedAt: Date.now(),
      createdBy: email,
      retryCount: 0,
      maxRetries: 5
    }, { merge: true });

    // 2. Fetch Junior High Classes
    const classesSnap = await db.collection("classes").where("unitId", "==", "JUNIOR_HIGH").get();
    const classIds = classesSnap.docs.map(doc => doc.id);

    if (classIds.length === 0) {
      throw new Error("Tidak ditemukan kelas Junior High.");
    }

    // 3. Fetch Records based on mode
    const rawRecords: any[] = [];
    const collectionName = backupType === 'ATTENDANCE' ? 'attendance_records' : 'dhuhur_attendance_records';
    
    const classChunks = chunkArray(classIds, 10);
    for (const chunk of classChunks) {
      const snap = await db.collection(collectionName).where("classId", "in", chunk).get();
      snap.docs.forEach((doc: any) => rawRecords.push({ ...doc.data(), id: doc.id }));
    }

    if (rawRecords.length === 0) {
      // Complete job immediately since there are no records
      await db.collection("system_backup_jobs").doc(jobId).set({
        status: 'COMPLETED',
        totalRows: 0,
        processedRows: 0,
        successRows: 0,
        failedRows: 0,
        totalBatches: 0,
        currentBatch: 0,
        completedAt: Date.now(),
        updatedAt: Date.now()
      }, { merge: true });
      runningJobs.delete(jobId);
      return;
    }

    // 4. Filter records based on mode
    let targetRecords = rawRecords;
    if (mode === 'START' || mode === 'RETRY_FAILED') {
      targetRecords = rawRecords.filter(r => r.syncStatus === 'FAILED' || r.syncStatus === 'PENDING' || !r.syncStatus);
    }

    if (targetRecords.length === 0) {
      // Mark as completed because there are no pending or failed records to sync
      const successCount = rawRecords.filter(r => r.syncStatus === 'SYNCED').length;
      await db.collection("system_backup_jobs").doc(jobId).set({
        status: 'COMPLETED',
        totalRows: rawRecords.length,
        processedRows: rawRecords.length,
        successRows: successCount,
        failedRows: 0,
        totalBatches: 0,
        currentBatch: 0,
        completedAt: Date.now(),
        updatedAt: Date.now()
      }, { merge: true });
      runningJobs.delete(jobId);
      return;
    }

    // 5. Group records by classId + date + academicYearId + semester
    const groupsMap = new Map<string, { classId: string; date: string; academicYearId: string; semester: string; records: any[] }>();
    
    for (const rec of targetRecords) {
      // Find class name from classes lookup if needed, but we can just use classId
      const classId = rec.classId;
      const date = rec.date;
      const academicYearId = rec.academicYearId || rec.academicYear || "unknown_year";
      const semester = String(rec.semester || rec.activeSemester || "1");
      
      if (!classId || !date) continue;
      
      const key = `${classId}_${date}_${academicYearId}_S${semester}`;
      if (!groupsMap.has(key)) {
        groupsMap.set(key, { classId, date, academicYearId, semester, records: [] });
      }
      groupsMap.get(key)!.records.push(rec);
    }

    const groups = Array.from(groupsMap.values());
    if (groups.length === 0) {
      throw new Error("Tidak ada baris data valid untuk dibackup.");
    }

    // Set initial progress in Firestore
    const totalRows = targetRecords.length;
    let processedRows = 0;
    let successRows = 0;
    let failedRows = 0;
    const totalBatches = groups.length;
    let currentBatch = 0;

    await db.collection("system_backup_jobs").doc(jobId).set({
      status: 'IN_PROGRESS',
      totalRows,
      processedRows,
      successRows,
      failedRows,
      totalBatches,
      currentBatch,
      updatedAt: Date.now()
    }, { merge: true });

    // 6. Loop and execute batches
    const auth = getGoogleAuth();
    if (!auth) {
      throw new Error("Failed to initialize Google credentials. Check environment variables.");
    }
    const drive = getDrive(auth);
    const sheets = getSheets(auth);

    let finalSpreadsheetId = "";
    let finalSpreadsheetUrl = "";

    for (let bIndex = 0; bIndex < groups.length; bIndex++) {
      currentBatch = bIndex + 1;
      const group = groups[bIndex];
      let attemptSuccess = false;
      let lastErrorObj: any = null;
      let retryIndex = 0;
      const maxRetries = 5;

      // Update Firestore current batch before processing
      await db.collection("system_backup_jobs").doc(jobId).update({
        currentBatch,
        status: 'IN_PROGRESS',
        updatedAt: Date.now()
      });

      while (retryIndex <= maxRetries && !attemptSuccess) {
        try {
          if (retryIndex > 0) {
            const backoff = Math.pow(2, retryIndex) * 2000 + Math.random() * 1000;
            console.log(`[BackupRunner] Job ${jobId} Batch ${currentBatch}/${totalBatches} retrying in ${Math.round(backoff / 1000)}s...`);
            
            await db.collection("system_backup_jobs").doc(jobId).update({
              status: 'RETRYING',
              retryCount: retryIndex,
              nextRetryAt: Date.now() + backoff,
              updatedAt: Date.now()
            });

            await sleep(backoff);
          }

          let res;
          if (backupType === 'ATTENDANCE') {
            res = await syncDailyAttendanceGroup(
              db,
              sheets,
              drive,
              group.classId,
              group.date,
              group.academicYearId,
              group.semester,
              group.records
            );
          } else {
            res = await syncDhuhurAttendanceGroup(
              db,
              sheets,
              drive,
              group.classId,
              group.date,
              group.academicYearId,
              group.semester,
              group.records
            );
          }

          finalSpreadsheetId = res.spreadsheetId;
          finalSpreadsheetUrl = res.spreadsheetUrl;
          attemptSuccess = true;
        } catch (syncErr: any) {
          lastErrorObj = syncErr;
          const cat = getErrorCategory(syncErr);
          
          if (cat === 'QUOTA') {
            // Exponential backoff
            retryIndex++;
            console.warn(`[BackupRunner] Quota exhausted on batch ${currentBatch}. Error: ${syncErr.message}`);
          } else if (cat === 'AUTH') {
            // Immediately abort job on Auth Error
            console.error(`[BackupRunner] Auth Error on batch ${currentBatch}. Aborting job.`);
            await db.collection("system_backup_jobs").doc(jobId).update({
              status: 'FAILED',
              lastErrorCode: '403',
              lastErrorMessage: 'Akses Google Sheets perlu dihubungkan ulang. Hubungkan ulang Google Service Account.',
              completedAt: Date.now(),
              updatedAt: Date.now()
            });
            runningJobs.delete(jobId);
            return;
          } else {
            // Network or other error, break immediately or retry up to 3 times
            console.error(`[BackupRunner] Non-quota error on batch ${currentBatch}. Message: ${syncErr.message}`);
            retryIndex = maxRetries + 1; // Abort retry loop for non-quota errors
          }
        }
      }

      if (attemptSuccess) {
        // Mark records as SYNCED in Firestore
        const batch = db.batch();
        for (const r of group.records) {
          const docRef = db.collection(collectionName).doc(r.id);
          batch.update(docRef, {
            syncStatus: 'SYNCED',
            syncError: null,
            lastSyncAt: Date.now()
          });
        }
        await batch.commit();

        successRows += group.records.length;
        processedRows += group.records.length;

        await db.collection("system_backup_jobs").doc(jobId).update({
          processedRows,
          successRows,
          spreadsheetId: finalSpreadsheetId,
          spreadsheetUrl: finalSpreadsheetUrl,
          updatedAt: Date.now()
        });
      } else {
        // Batch completely failed
        const batch = db.batch();
        const errMsg = lastErrorObj?.message || "Gagal sinkronisasi ke Google Sheets.";
        for (const r of group.records) {
          const docRef = db.collection(collectionName).doc(r.id);
          batch.update(docRef, {
            syncStatus: 'FAILED',
            syncError: errMsg,
            lastSyncAt: Date.now()
          });
        }
        await batch.commit();

        failedRows += group.records.length;
        processedRows += group.records.length;

        const isQuotaMaxed = getErrorCategory(lastErrorObj) === 'QUOTA';
        let friendlyMessage = errMsg;
        if (isQuotaMaxed) {
          friendlyMessage = "Kuota Google sedang penuh. Backup belum selesai, silakan coba lagi beberapa menit lagi.";
        } else {
          friendlyMessage = `Koneksi terputus. ${successRows} data sudah tersimpan; ${failedRows} data belum dibackup.`;
        }

        await db.collection("system_backup_jobs").doc(jobId).update({
          processedRows,
          failedRows,
          lastErrorCode: lastErrorObj?.status || lastErrorObj?.code || "OTHER",
          lastErrorMessage: friendlyMessage,
          updatedAt: Date.now()
        });

        // If it is a quota limit exhaustion, abort the whole job
        if (isQuotaMaxed) {
          await db.collection("system_backup_jobs").doc(jobId).update({
            status: 'FAILED',
            completedAt: Date.now(),
            updatedAt: Date.now()
          });
          runningJobs.delete(jobId);
          return;
        }
      }
    }

    // Determine final status
    let finalStatus: 'COMPLETED' | 'PARTIAL' | 'FAILED' = 'COMPLETED';
    if (successRows === 0 && failedRows > 0) {
      finalStatus = 'FAILED';
    } else if (failedRows > 0) {
      finalStatus = 'PARTIAL';
    }

    await db.collection("system_backup_jobs").doc(jobId).update({
      status: finalStatus,
      completedAt: Date.now(),
      updatedAt: Date.now()
    });

    console.log(`[BackupRunner] Job ${jobId} completed with status: ${finalStatus}`);
    runningJobs.delete(jobId);

  } catch (error: any) {
    console.error(`[BackupRunner] Critical failure executing job ${jobId}:`, error);
    await db.collection("system_backup_jobs").doc(jobId).set({
      id: jobId,
      backupType,
      unit: 'JUNIOR_HIGH',
      status: 'FAILED',
      lastErrorCode: error.status || error.code || "CRITICAL",
      lastErrorMessage: error.message || "Gagal menjalankan backup.",
      completedAt: Date.now(),
      updatedAt: Date.now()
    }, { merge: true });
    runningJobs.delete(jobId);
  }
}

// --- Express Route Handlers ---

// Fetch current status of backup jobs
backupRunnerRouter.get("/jobs", async (req, res) => {
  const db = getFirestore();
  try {
    const backupTypes = ['attendance_junior_high', 'dhuhur_junior_high'];
    const jobs: any[] = [];

    for (const id of backupTypes) {
      const docSnap = await db.collection("system_backup_jobs").doc(id).get();
      if (docSnap.exists) {
        jobs.push(docSnap.data());
      } else {
        // Return a default IDLE job object
        jobs.push({
          id,
          backupType: id === 'attendance_junior_high' ? 'ATTENDANCE' : 'DHUHUR_ATTENDANCE',
          unit: 'JUNIOR_HIGH',
          status: 'IDLE',
          totalRows: 0,
          processedRows: 0,
          successRows: 0,
          failedRows: 0,
          totalBatches: 0,
          currentBatch: 0
        });
      }
    }

    return res.json({ success: true, jobs });
  } catch (error: any) {
    console.error("[BackupRunner] Fetch jobs error:", error);
    return res.status(500).json({ error: error.message || "Failed to fetch backup jobs status." });
  }
});

// Trigger a backup job run
backupRunnerRouter.post("/run-job", async (req, res) => {
  const db = getFirestore();
  const { jobId, mode } = req.body;

  if (!jobId || !['attendance_junior_high', 'dhuhur_junior_high'].includes(jobId)) {
    return res.status(400).json({ error: "Invalid or missing jobId." });
  }
  if (!mode || !['START', 'RETRY_FAILED', 'REBUILD_ALL'].includes(mode)) {
    return res.status(400).json({ error: "Invalid or missing mode." });
  }

  // 1. Authorization check
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized. Bearer token required." });
  }
  const token = authHeader.split("Bearer ")[1];
  
  let decodedToken: any;
  try {
    const getAdminAuth = (await import("firebase-admin/auth")).getAuth;
    decodedToken = await getAdminAuth().verifyIdToken(token);
  } catch (err: any) {
    return res.status(401).json({ error: `Authentication failed: ${err.message}` });
  }

  // Check roles
  const userDoc = await db.collection("users").doc(decodedToken.uid).get();
  if (!userDoc.exists) {
    return res.status(403).json({ error: "Access denied. User profile not found." });
  }
  const userData = userDoc.data() || {};
  const userRole = userData.role || null;

  // Validate super admin or active junior high admin role
  const email = decodedToken.email || "";
  const isSuperAdmin = userRole === "SUPER_ADMIN" || email.toLowerCase().includes("agunga4@gmail.com") || email.toLowerCase().includes("agunga4@lazuardi.sch.id");
  const isAuthorized = isSuperAdmin || ['HEAD_UNIT', 'HEAD_JUNIOR'].includes(userRole || "");

  if (!isAuthorized) {
    return res.status(403).json({ error: "Hanya Admin Unit atau Super Admin yang dapat menjalankan job backup." });
  }

  // 2. Check if already running
  if (runningJobs.has(jobId)) {
    return res.status(409).json({ error: "Backup job sedang berjalan di background." });
  }

  // 3. Mark as running and spawn task asynchronously
  runningJobs.add(jobId);
  runBackupJobAsync(jobId, mode, email);

  return res.json({
    success: true,
    message: `Job backup ${jobId} berhasil dimulai dengan mode: ${mode}`
  });
});

// Elementary Sync Route
backupRunnerRouter.post("/elementary-sync", async (req, res) => {
  const db = getFirestore();
  const { classId, date, schoolYear, semester, mode } = req.body;

  if (!classId || !date || !schoolYear || !semester) {
    return res.status(400).json({ error: "Missing required fields: classId, date, schoolYear, semester." });
  }

  // 1. Authorization check
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized. Bearer token required." });
  }
  const token = authHeader.split("Bearer ")[1];
  
  let decodedToken: any;
  try {
    const getAdminAuth = (await import("firebase-admin/auth")).getAuth;
    decodedToken = await getAdminAuth().verifyIdToken(token);
  } catch (err: any) {
    return res.status(401).json({ error: `Authentication failed: ${err.message}` });
  }

  const userDoc = await db.collection("users").doc(decodedToken.uid).get();
  if (!userDoc.exists) {
    return res.status(403).json({ error: "Access denied. User profile not found." });
  }
  const userData = userDoc.data() || {};
  const userRole = userData.role || null;

  // Validate roles
  const email = decodedToken.email || "";
  const isSuperAdmin = userRole === "SUPER_ADMIN" || email.toLowerCase().includes("agunga4@gmail.com") || email.toLowerCase().includes("agunga4@lazuardi.sch.id");
  const isAuthorized = isSuperAdmin || ['HEAD_UNIT', 'HEAD_ELEMENTARY', 'TEACHER'].includes(userRole || "");

  if (!isAuthorized) {
    return res.status(403).json({ error: "Hanya Guru, Admin Unit, atau Super Admin yang dapat menjalankan backup." });
  }

  // 2. Validate unit = ELEMENTARY and check class existence
  const classSnap = await db.collection("classes").doc(classId).get();
  if (!classSnap.exists) {
    return res.status(400).json({ error: `Kelas dengan ID ${classId} tidak ditemukan di Lumina.` });
  }
  const classDocData = classSnap.data() || {};
  if (classDocData.unitId !== 'ELEMENTARY') {
    return res.status(400).json({ error: `Unit kelas harus ELEMENTARY, tetapi ditemukan ${classDocData.unitId}.` });
  }
  const className = classDocData.name || classId;

  // 3. Query Attendance Records from Lumina for this class and date (unit must be 'ELEMENTARY')
  const recordsSnap = await db.collection("attendance_records")
    .where("unit", "==", "ELEMENTARY")
    .where("classId", "==", classId)
    .where("date", "==", date)
    .get();

  const recordsToSync: any[] = recordsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  if (recordsToSync.length === 0) {
    return res.status(400).json({ error: "Tidak ada data kehadiran yang tersimpan di Lumina untuk kelas dan tanggal terpilih." });
  }

  // 4. Load or initialize Elementary Backup Config
  const configDocId = "elementary_attendance";
  const configRef = db.collection("system_backup_configs").doc(configDocId);
  
  // Ambil sharedDriveId dari Junior High existing
  const jhConfigSnap = await db.collection("system_backup_configs").doc("junior_high_attendance").get();
  const jhConfig = jhConfigSnap.exists ? jhConfigSnap.data() : null;
  const sharedDriveId = jhConfig?.sharedDriveId || "";

  let configSnap = await configRef.get();
  let config = configSnap.exists ? configSnap.data() : null;

  if (!config || config.rootFolderId === '16xenPYfnKAE3zOSZ4H5Tauytsv_xPhGm' || config.rootFolderId !== '1GNFo6yDuM382KB-lDt2_5dnUWtZ8DUI_' || config.writeMode !== 'AUTO_STRUCTURE' || config.sharedDriveId !== sharedDriveId) {
    console.log(`[BackupRunner-Elementary] Initializing/Updating backup config for ELEMENTARY...`);
    const updatedConfig = {
      unit: 'ELEMENTARY',
      backupType: 'ATTENDANCE',
      isEnabled: config ? (config.isEnabled !== undefined ? config.isEnabled : true) : true,
      schoolYear: config ? (config.schoolYear || '2026/2027') : '2026/2027',
      rootFolderId: '1GNFo6yDuM382KB-lDt2_5dnUWtZ8DUI_',
      sharedDriveId: sharedDriveId,
      writeMode: 'AUTO_STRUCTURE',
      updatedAt: Date.now(),
      updatedBy: decodedToken.uid
    };
    await configRef.set(updatedConfig, { merge: true });
    configSnap = await configRef.get();
    config = configSnap.data();
  }

  if (!config.isEnabled) {
    return res.json({ success: true, message: "Backup Elementary dinonaktifkan." });
  }

  // 5. Verify access to Google Drive Root Folder
  const auth = getGoogleAuth();
  if (!auth) {
    return res.status(500).json({ error: "Gagal menginisialisasi Google Auth di server." });
  }
  const driveClient = getDrive(auth);
  const sheetsClient = getSheets(auth);

  try {
    await driveClient.files.get({ fileId: config.rootFolderId, supportsAllDrives: true });
  } catch (driveErr: any) {
    console.error("[BackupRunner-Elementary] Root folder access validation failed:", driveErr);
    return res.status(400).json({ error: "Folder backup Elementary tidak dapat diakses. Periksa konfigurasi rootFolderId." });
  }

  // 6. Resolve file mapping (Spreadsheet Map)
  const schoolYearId = schoolYear.replace(/\//g, '-');
  const mapDocId = `elementary_${schoolYearId}_${classId}`;
  let mapSnap = await db.collection("attendance_backup_file_maps").doc(mapDocId).get();

  if (!mapSnap.exists) {
    if (config.writeMode === 'AUTO_STRUCTURE') {
      try {
        console.log(`[BackupRunner-Elementary] AUTO_STRUCTURE enabled. Setting up folders...`);

        // Display names
        let displaySemesterName = `Semester ${semester}`;
        let normSemesterVal = String(semester);
        if (normSemesterVal === '1' || normSemesterVal === 'SEMESTER_1') {
          displaySemesterName = 'Semester 1';
          normSemesterVal = 'SEMESTER_1';
        } else if (normSemesterVal === '2' || normSemesterVal === 'SEMESTER_2') {
          displaySemesterName = 'Semester 2';
          normSemesterVal = 'SEMESTER_2';
        }

        // Folder structure
        const elementaryFolderId = await findOrCreateFolder(driveClient, 'Elementary', config.rootFolderId, config.sharedDriveId);
        const academicYearFolderId = await findOrCreateFolder(driveClient, schoolYearId, elementaryFolderId, config.sharedDriveId);
        const semesterFolderId = await findOrCreateFolder(driveClient, displaySemesterName, academicYearFolderId, config.sharedDriveId);

        // Search for existing spreadsheet in the subfolder
        const ssTitle = className;
        const q = `name = '${ssTitle.replace(/'/g, "\\'")}' and '${semesterFolderId}' in parents and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`;
        const existingSS = await driveClient.files.list({
          q,
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
          driveId: config.sharedDriveId,
          corpora: config.sharedDriveId ? 'drive' : undefined,
          fields: 'files(id, name, webViewLink)',
        });

        let spreadsheetId = "";
        let spreadsheetUrl = "";

        if (existingSS.data.files && existingSS.data.files.length > 0) {
          spreadsheetId = existingSS.data.files[0].id!;
          spreadsheetUrl = existingSS.data.files[0].webViewLink!;
          console.log(`[BackupRunner-Elementary] Found existing spreadsheet in subfolder: ${spreadsheetId}`);
        } else {
          console.log(`[BackupRunner-Elementary] Creating new spreadsheet in subfolder: ${ssTitle}`);
          const fileResponse = await driveClient.files.create({
            requestBody: {
              name: ssTitle,
              mimeType: 'application/vnd.google-apps.spreadsheet',
              parents: [semesterFolderId]
            },
            supportsAllDrives: true,
            fields: 'id, name, webViewLink'
          });
          spreadsheetId = fileResponse.data.id!;
          spreadsheetUrl = fileResponse.data.webViewLink!;

          // Init sheets: Metadata, Kehadiran Harian, Log
          const ssMeta = await sheetsClient.spreadsheets.get({ spreadsheetId });
          const defaultSheetId = ssMeta.data.sheets?.[0]?.properties?.sheetId;

          const initRequests: any[] = [
            { addSheet: { properties: { title: 'Metadata' } } },
            { addSheet: { properties: { title: 'Kehadiran Harian' } } },
            { addSheet: { properties: { title: 'Log' } } }
          ];

          if (defaultSheetId !== undefined) {
            initRequests.push({ deleteSheet: { sheetId: defaultSheetId } });
          }

          await sheetsClient.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: { requests: initRequests }
          });

          // Metadata Headers
          await sheetsClient.spreadsheets.values.update({
            spreadsheetId,
            range: 'Metadata!A1',
            valueInputOption: 'RAW',
            requestBody: {
              values: [
                ['Property', 'Value'],
                ['Class', classId],
                ['ClassName', className],
                ['Year', schoolYear],
                ['Semester', normSemesterVal]
              ]
            }
          });

          // Log Header
          await sheetsClient.spreadsheets.values.update({
            spreadsheetId,
            range: 'Log!A1',
            valueInputOption: 'RAW',
            requestBody: {
              values: [['Backup Key', 'Timestamp', 'Student ID', 'Student Name', 'Date', 'Status', 'Note', 'Updated By']]
            }
          });

          // Kehadiran Harian Header
          await sheetsClient.spreadsheets.values.update({
            spreadsheetId,
            range: 'Kehadiran Harian!A1',
            valueInputOption: 'RAW',
            requestBody: {
              values: [['Student ID', 'Student Name']]
            }
          });
        }

        // Save mapping
        const newMapData = {
          unit: 'ELEMENTARY',
          backupType: 'ATTENDANCE',
          schoolYear: schoolYear,
          semester: normSemesterVal,
          classId: classId,
          className: className,
          rootFolderId: config.rootFolderId,
          unitFolderId: elementaryFolderId,
          academicYearFolderId: academicYearFolderId,
          semesterFolderId: semesterFolderId,
          spreadsheetId,
          spreadsheetUrl,
          sheetName: 'Kehadiran Harian',
          active: true,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        };

        await db.collection("attendance_backup_file_maps").doc(mapDocId).set(newMapData);
        mapSnap = await db.collection("attendance_backup_file_maps").doc(mapDocId).get();
        console.log(`[BackupRunner-Elementary] Automatic mapping saved successfully for ${mapDocId}`);

      } catch (autoErr: any) {
        console.error("[BackupRunner-Elementary] AUTO_STRUCTURE setup failed:", autoErr);
        // Save detail error on job log
        const jobDocId = `attendance_elementary_${schoolYearId}_${classId}_${date}`;
        await db.collection("system_backup_jobs").doc(jobDocId).set({
          id: jobDocId,
          backupType: 'ATTENDANCE',
          unit: 'ELEMENTARY',
          status: 'FAILED',
          lastErrorCode: autoErr.status || 'ERROR',
          lastErrorMessage: `Gagal membuat struktur folder/file otomatis: ${autoErr.message || autoErr}`,
          completedAt: Date.now(),
          updatedAt: Date.now()
        }, { merge: true });

        return res.status(500).json({ error: `Gagal membuat struktur folder/file otomatis: ${autoErr.message || autoErr}` });
      }
    } else {
      return res.status(400).json({ error: "File backup Google Sheets untuk kelas ini belum dikonfigurasi." });
    }
  }

  const mapData = mapSnap.data() || {};
  const { spreadsheetId, spreadsheetUrl, active, sheetName } = mapData;

  if (!spreadsheetId) {
    return res.status(400).json({ error: "File backup Google Sheets untuk kelas ini belum dikonfigurasi." });
  }

  // 5. Validate that target spreadsheet is accessible by backend
  try {
    await driveClient.files.get({ fileId: spreadsheetId, supportsAllDrives: true });
  } catch (err) {
    console.error("[BackupRunner-Elementary] Spreadsheet accessibility failed:", err);
    return res.status(403).json({ error: "Folder backup Elementary tidak dapat diakses. Periksa izin Editor pada Google Drive." });
  }

  // 6. recordsToSync has already been fetched and validated in step 3

  // 7. Initialize Job document in Firestore
  const jobDocId = `attendance_elementary_${schoolYearId}_${classId}_${date}`;
  const jobRef = db.collection("system_backup_jobs").doc(jobDocId);

  const initialJobData = {
    id: jobDocId,
    backupType: 'ATTENDANCE',
    unit: 'ELEMENTARY',
    status: 'PREPARING',
    totalRows: recordsToSync.length,
    processedRows: 0,
    successRows: 0,
    failedRows: 0,
    currentBatch: 0,
    totalBatches: 1,
    startedAt: Date.now(),
    updatedAt: Date.now(),
    createdBy: email,
    spreadsheetId,
    spreadsheetUrl,
    sheetName: sheetName || 'Rekap'
  };

  await jobRef.set(initialJobData);

  const batchSize = 50;
  const totalRows = recordsToSync.length;
  const batches = chunkArray(recordsToSync, batchSize);
  const totalBatches = batches.length;

  await jobRef.update({
    status: 'IN_PROGRESS',
    totalBatches,
    updatedAt: Date.now()
  });

  let successRows = 0;
  let failedRows = 0;
  let processedRows = 0;

  // Exponential backoff retry helper
  const executeWithRetry = async (fn: () => Promise<any>, retries = 5, delay = 1000): Promise<any> => {
    try {
      return await fn();
    } catch (err: any) {
      if (retries > 0 && (err.status === 429 || err.code === 429)) {
        const jitter = Math.random() * 500;
        const nextDelay = delay * 2 + jitter;
        console.warn(`[BackupRunner-Elementary] Google Rate Limit (429) hit. Retrying in ${nextDelay.toFixed(0)}ms...`);
        
        await jobRef.update({
          status: 'RETRYING',
          nextRetryAt: Date.now() + nextDelay,
          updatedAt: Date.now()
        });

        await new Promise(resolve => setTimeout(resolve, nextDelay));
        return executeWithRetry(fn, retries - 1, delay * 2);
      }
      throw err;
    }
  };

  try {
    const INDONESIAN_MONTHS = [
      "Januari", "Februari", "Maret", "April", "Mei", "Juni",
      "Juli", "Agustus", "September", "Oktober", "November", "Desember"
    ];

    const dateParts = date.split('-');
    const yearNum = parseInt(dateParts[0], 10);
    const monthNum = parseInt(dateParts[1], 10);
    const monthNameIndo = INDONESIAN_MONTHS[monthNum - 1];
    const tabTitle = `${monthNameIndo} ${yearNum}`;

    // Helper: update Rekap tab
    const updateRekapTab = async (records: any[]) => {
      const rekapResponse = await executeWithRetry(() => sheetsClient.spreadsheets.values.get({
        spreadsheetId,
        range: 'Rekap!A1:ZZ1000',
      }));
      const rekapRows = rekapResponse.data.values || [];
      const rekapHeader = rekapRows[0] || ['Student ID', 'Student Name'];

      const recordsByDate = new Map<string, any[]>();
      records.forEach(r => {
        if (!recordsByDate.has(r.date)) {
          recordsByDate.set(r.date, []);
        }
        recordsByDate.get(r.date)!.push(r);
      });

      const rekapStudentMap = new Map<string, any[]>();
      for (let i = 1; i < rekapRows.length; i++) {
        const row = rekapRows[i];
        if (row[0]) {
          rekapStudentMap.set(row[0], row);
        }
      }

      for (const [dVal, dRecords] of recordsByDate.entries()) {
        let colIndex = rekapHeader.indexOf(dVal);
        if (colIndex === -1) {
          colIndex = rekapHeader.length;
          rekapHeader.push(dVal);
        }

        for (const record of dRecords) {
          const studentId = record.studentId;
          let row = rekapStudentMap.get(studentId);
          if (!row) {
            row = [studentId, record.studentName || record.studentNameSnapshot || "Siswa Tanpa Nama"];
          }
          while (row.length < colIndex + 1) {
            row.push('');
          }
          row[colIndex] = record.status;
          rekapStudentMap.set(studentId, row);
        }
      }

      for (const [sId, row] of rekapStudentMap.entries()) {
        while (row.length < rekapHeader.length) {
          row.push('');
        }
      }

      const sortedRekapRows = Array.from(rekapStudentMap.values()).sort((a, b) => {
        return (a[1] || '').localeCompare(b[1] || '');
      });

      await executeWithRetry(() => sheetsClient.spreadsheets.values.update({
        spreadsheetId,
        range: 'Rekap!A1',
        valueInputOption: 'RAW',
        requestBody: { values: [rekapHeader, ...sortedRekapRows] }
      }));
    };

    // Helper: update Log tab
    const updateLogTab = async (records: any[], isMigration = false) => {
      let logValues: any[][] = [];
      try {
        const logResponse = await executeWithRetry(() => sheetsClient.spreadsheets.values.get({
          spreadsheetId,
          range: `Log!A1:H10000`
        }));
        logValues = logResponse.data.values || [];
      } catch (logGetErr) {
        logValues = [['Backup Key', 'Timestamp', 'Student ID', 'Student Name', 'Date', 'Status', 'Note', 'Updated By']];
      }

      const logHeader = logValues[0] || ['Backup Key', 'Timestamp', 'Student ID', 'Student Name', 'Date', 'Status', 'Note', 'Updated By'];
      const logMap = new Map<string, any[]>();
      for (let i = 1; i < logValues.length; i++) {
        const row = logValues[i];
        if (row[0]) {
          logMap.set(row[0], row);
        }
      }

      for (const record of records) {
        const backupKey = isMigration 
          ? `ELEMENTARY|MIGRATION|${schoolYear}|${classId}|${record.studentId}|${record.date}`
          : `ELEMENTARY|ATTENDANCE|${schoolYear}|${classId}|${record.studentId}|${record.date}`;
        
        logMap.set(backupKey, [
          backupKey,
          new Date().toISOString(),
          record.studentId,
          record.studentName || record.studentNameSnapshot || "Siswa Tanpa Nama",
          record.date,
          record.status,
          isMigration ? "Migrated from legacy tab" : (record.note || ""),
          isMigration ? "Migration Script" : (record.recordedBy || email)
        ]);
      }

      const finalLogRows = [logHeader, ...Array.from(logMap.values())];
      await executeWithRetry(() => sheetsClient.spreadsheets.values.update({
        spreadsheetId,
        range: `Log!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: finalLogRows }
      }));
    };

    // Helper: sync Monthly tab
    const syncMonthlyTab = async (
      mTabTitle: string,
      yNum: number,
      mNum: number,
      newRecords: any[],
      allMonthRecordsFromDb: any[]
    ) => {
      const ssCurrentInfo = await executeWithRetry(() => sheetsClient.spreadsheets.get({ spreadsheetId }));
      const currentTitles = ssCurrentInfo.data.sheets?.map((s: any) => s.properties?.title || "") || [];
      if (!currentTitles.includes(mTabTitle)) {
        await executeWithRetry(() => sheetsClient.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [{ addSheet: { properties: { title: mTabTitle } } }]
          }
        }));
      }

      // Fetch students for the class robustly
      const studentMap = new Map<string, string>(); // sId -> sName

      // 1. Fetch from active enrollments (standard in Lumina)
      const classKeys = [classId];
      if (className && !classKeys.includes(className)) {
        classKeys.push(className);
      }
      
      try {
        const enrollmentsSnap = await db.collection("enrollments")
          .where("academicYear", "==", schoolYear)
          .where("status", "==", "active")
          .where("classId", "in", classKeys)
          .get();

        const studentIds = Array.from(new Set(enrollmentsSnap.docs.map(doc => doc.data().studentId).filter(Boolean)));

        if (studentIds.length > 0) {
          const chunks = chunkArray(studentIds, 10);
          for (const chunk of chunks) {
            const studentsSnap = await db.collection("students")
              .where(FieldPath.documentId(), "in", chunk)
              .get();
            
            studentsSnap.docs.forEach(doc => {
              const d = doc.data();
              const sId = d.luminaId || d.nis || doc.id;
              const sName = d.name || d.displayName || d.fullName || "Siswa Tanpa Nama";
              studentMap.set(sId, sName);
            });
          }
        }
      } catch (err: any) {
        console.warn("[BackupRunner-Elementary] Error loading students via enrollments:", err.message);
      }

      // 2. Direct fallback: query students collection by classId
      try {
        const directStudentsSnap = await db.collection("students")
          .where("classId", "in", classKeys)
          .get();

        directStudentsSnap.docs.forEach(doc => {
          const d = doc.data();
          const sId = d.luminaId || d.nis || doc.id;
          const sName = d.name || d.displayName || d.fullName || "Siswa Tanpa Nama";
          studentMap.set(sId, sName);
        });
      } catch (err: any) {
        console.warn("[BackupRunner-Elementary] Error loading students directly:", err.message);
      }

      // 3. Absolute fallback: Parse records to find any student references (guarantees non-empty sheet)
      if (studentMap.size === 0) {
        allMonthRecordsFromDb.forEach((rec: any) => {
          if (rec.studentId) {
            studentMap.set(rec.studentId, rec.studentName || rec.studentNameSnapshot || "Siswa Tanpa Nama");
          }
        });
        newRecords.forEach((rec: any) => {
          if (rec.studentId) {
            studentMap.set(rec.studentId, rec.studentName || rec.studentNameSnapshot || "Siswa Tanpa Nama");
          }
        });
      }

      const sortedStudents = Array.from(studentMap.entries()).map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name));

      const recordMap = new Map<string, Map<string, string>>();

      allMonthRecordsFromDb.forEach((data: any) => {
        if (!recordMap.has(data.studentId)) {
          recordMap.set(data.studentId, new Map());
        }
        recordMap.get(data.studentId)!.set(data.date, data.status);
      });

      newRecords.forEach((record: any) => {
        if (!recordMap.has(record.studentId)) {
          recordMap.set(record.studentId, new Map());
        }
        recordMap.get(record.studentId)!.set(record.date, record.status);
      });

      const totalDays = new Date(yNum, mNum, 0).getDate();
      const header1 = [`REKAP KEHADIRAN ELEMENTARY — ${className}`];
      const header2 = [`Tahun Ajaran: ${schoolYear} | Semester: ${semester}`];
      const header3: string[] = [];
      const header4 = ['No', 'Nama Siswa'];
      for (let d = 1; d <= totalDays; d++) {
        header4.push(String(d));
      }
      header4.push('H', 'S', 'I', 'A', 'Persentase Kehadiran');

      const rows = [header1, header2, header3, header4];

      sortedStudents.forEach((student: any, sIdx: number) => {
        const rowNum = 5 + sIdx;
        const studentRow = [
          String(sIdx + 1),
          student.name
        ];

        for (let d = 1; d <= totalDays; d++) {
          const dayStr = String(d).padStart(2, '0');
          const fullDate = `${yNum}-${String(mNum).padStart(2, '0')}-${dayStr}`;
          const status = recordMap.get(student.id)?.get(fullDate) || '';
          let code = '';
          if (status === 'HADIR' || status === 'LATE') code = 'H';
          else if (status === 'SAKIT') code = 'S';
          else if (status === 'IZIN') code = 'I';
          else if (status === 'ALPA') code = 'A';
          studentRow.push(code);
        }

        const firstDateColLetter = 'C';
        const lastDateColLetter = getColumnLetter(2 + totalDays - 1);
        const colH_Letter = getColumnLetter(2 + totalDays);
        const colS_Letter = getColumnLetter(2 + totalDays + 1);
        const colI_Letter = getColumnLetter(2 + totalDays + 2);
        const colA_Letter = getColumnLetter(2 + totalDays + 3);

        studentRow.push(
          `=COUNTIF(${firstDateColLetter}${rowNum}:${lastDateColLetter}${rowNum}, "H")`,
          `=COUNTIF(${firstDateColLetter}${rowNum}:${lastDateColLetter}${rowNum}, "S")`,
          `=COUNTIF(${firstDateColLetter}${rowNum}:${lastDateColLetter}${rowNum}, "I")`,
          `=COUNTIF(${firstDateColLetter}${rowNum}:${lastDateColLetter}${rowNum}, "A")`,
          `=IF((${colH_Letter}${rowNum}+${colS_Letter}${rowNum}+${colI_Letter}${rowNum}+${colA_Letter}${rowNum})>0, ${colH_Letter}${rowNum}/(${colH_Letter}${rowNum}+${colS_Letter}${rowNum}+${colI_Letter}${rowNum}+${colA_Letter}${rowNum}), "")`
        );

        rows.push(studentRow);
      });

      await executeWithRetry(() => sheetsClient.spreadsheets.values.update({
        spreadsheetId,
        range: `${mTabTitle}!A1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: rows }
      }));
    };

    // --- Legacy "Kehadiran Harian" Migration Check ---
    const ssInfo = await executeWithRetry(() => sheetsClient.spreadsheets.get({ spreadsheetId }));
    const sheetsList = ssInfo.data.sheets || [];
    const sheetTitles = sheetsList.map((s: any) => s.properties?.title || "") || [];
    const hasLegacyTab = sheetTitles.includes('Kehadiran Harian');
    const hasRekapTab = sheetTitles.includes('Rekap');

    if (!hasRekapTab) {
      console.log(`[BackupRunner-Elementary] Rekap tab not found. Creating Rekap tab...`);
      await executeWithRetry(() => sheetsClient.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: 'Rekap' } } }]
        }
      }));
      await executeWithRetry(() => sheetsClient.spreadsheets.values.update({
        spreadsheetId,
        range: 'Rekap!A1',
        valueInputOption: 'RAW',
        requestBody: {
          values: [['Student ID', 'Student Name']]
        }
      }));
    }

    if (hasLegacyTab) {
      console.log(`[BackupRunner-Elementary] Legacy "Kehadiran Harian" tab detected. Initiating migration...`);
      let legacyValues: any[][] = [];
      try {
        const getLegacy = await executeWithRetry(() => sheetsClient.spreadsheets.values.get({
          spreadsheetId,
          range: 'Kehadiran Harian!A1:ZZ5000'
        }));
        legacyValues = getLegacy.data.values || [];
      } catch (err: any) {
        console.warn("[BackupRunner-Elementary] Error getting legacy values:", err.message);
      }

      if (legacyValues.length > 0) {
        const legacyHeader = legacyValues[0] || [];
        const dateColumns: { colIndex: number, dateStr: string }[] = [];
        for (let colIdx = 2; colIdx < legacyHeader.length; colIdx++) {
          const cellVal = String(legacyHeader[colIdx]).trim();
          if (/^\d{4}-\d{2}-\d{2}$/.test(cellVal)) {
            dateColumns.push({ colIndex: colIdx, dateStr: cellVal });
          }
        }

        if (dateColumns.length > 0) {
          console.log(`[BackupRunner-Elementary] Found ${dateColumns.length} valid date columns in legacy tab.`);
          const migrationRecords: any[] = [];
          for (let rIdx = 1; rIdx < legacyValues.length; rIdx++) {
            const row = legacyValues[rIdx];
            const studentId = row[0];
            const studentName = row[1] || "Siswa Tanpa Nama";
            if (studentId) {
              for (const col of dateColumns) {
                const status = row[col.colIndex];
                if (status) {
                  migrationRecords.push({
                    studentId,
                    studentName,
                    date: col.dateStr,
                    status,
                    recordedBy: 'Migration Script'
                  });
                }
              }
            }
          }

          if (migrationRecords.length > 0) {
            console.log(`[BackupRunner-Elementary] Migrating ${migrationRecords.length} legacy records...`);
            
            // Populate Rekap tab with these records
            await updateRekapTab(migrationRecords);

            // Populate monthly tabs for these records
            const recordsByMonth = new Map<string, any[]>();
            migrationRecords.forEach(rec => {
              const dParts = rec.date.split('-');
              const y = parseInt(dParts[0], 10);
              const m = parseInt(dParts[1], 10);
              const mIndo = INDONESIAN_MONTHS[m - 1];
              const mTabTitle = `${mIndo} ${y}`;
              if (!recordsByMonth.has(mTabTitle)) {
                recordsByMonth.set(mTabTitle, []);
              }
              recordsByMonth.get(mTabTitle)!.push(rec);
            });

            for (const [mTabTitle, mRecords] of recordsByMonth.entries()) {
              const dParts = mRecords[0].date.split('-');
              const yNum = parseInt(dParts[0], 10);
              const mNum = parseInt(dParts[1], 10);
              const monthPrefix = `${yNum}-${String(mNum).padStart(2, '0')}`;
              
              const monthlyRecordsSnap = await db.collection("attendance_records")
                .where("classId", "==", classId)
                .where("date", ">=", `${monthPrefix}-01`)
                .where("date", "<=", `${monthPrefix}-31`)
                .get();
              const allMonthRecordsFromDb = monthlyRecordsSnap.docs.map((doc: any) => doc.data());

              await syncMonthlyTab(mTabTitle, yNum, mNum, mRecords, allMonthRecordsFromDb);
            }

            // Write logs for migration
            await updateLogTab(migrationRecords, true);

            console.log("[BackupRunner-Elementary] Migration of legacy records completed successfully.");
          }
        }

        // Keep legacy tab but write a clear notice in cell A1 and A2
        console.log(`[BackupRunner-Elementary] Clearing data columns in legacy tab "Kehadiran Harian" and writing notice...`);
        await executeWithRetry(() => sheetsClient.spreadsheets.values.update({
          spreadsheetId,
          range: 'Kehadiran Harian!A1:H10',
          valueInputOption: 'RAW',
          requestBody: {
            values: [
              ['Kehadiran Harian (Legacy)'],
              ['Status:', 'Data telah dimigrasikan dengan aman ke Tab Bulanan.'],
              ['Tanggal Migrasi:', new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" })],
              ['Catatan:', 'Jangan gunakan tab ini untuk backup baru. Tab ini dipertahankan hanya sebagai arsip kompatibilitas.']
            ]
          }
        }));
        
        try {
          await executeWithRetry(() => sheetsClient.spreadsheets.values.clear({
            spreadsheetId,
            range: 'Kehadiran Harian!C1:ZZ5000'
          }));
          await executeWithRetry(() => sheetsClient.spreadsheets.values.clear({
            spreadsheetId,
            range: 'Kehadiran Harian!A5:B5000'
          }));
        } catch (clearErr: any) {
          console.warn("[BackupRunner-Elementary] Clear legacy tab error:", clearErr.message);
        }
      }
    }

    // --- Perform actual active date backup sync ---
    // Update Rekap Tab
    await updateRekapTab(recordsToSync);

    // Update Monthly Tab
    const monthPrefix = `${yearNum}-${String(monthNum).padStart(2, '0')}`;
    const monthlyRecordsSnap = await db.collection("attendance_records")
      .where("classId", "==", classId)
      .where("date", ">=", `${monthPrefix}-01`)
      .where("date", "<=", `${monthPrefix}-31`)
      .get();
    const allMonthRecordsFromDb = monthlyRecordsSnap.docs.map((doc: any) => doc.data());

    await syncMonthlyTab(tabTitle, yearNum, monthNum, recordsToSync, allMonthRecordsFromDb);

    // Update Log Tab
    await updateLogTab(recordsToSync, false);

    // Update Firestore sync status in batches
    for (let bIndex = 0; bIndex < batches.length; bIndex++) {
      const batch = batches[bIndex];
      const dbBatch = db.batch();
      for (const record of batch) {
        const recordRef = db.collection("attendance_records").doc(record.id);
        dbBatch.update(recordRef, {
          syncStatus: 'SYNCED',
          lastSyncAt: Date.now(),
          syncError: null,
          updatedAt: Date.now()
        });
        successRows++;
      }
      processedRows += batch.length;
      await dbBatch.commit();

      await jobRef.update({
        processedRows,
        successRows,
        failedRows,
        currentBatch: bIndex + 1,
        status: processedRows === totalRows ? (failedRows > 0 ? 'PARTIAL' : 'COMPLETED') : 'IN_PROGRESS',
        updatedAt: Date.now()
      });
    }

    const finalStatus = failedRows === 0 ? 'COMPLETED' : (successRows > 0 ? 'PARTIAL' : 'FAILED');
    await jobRef.update({
      status: finalStatus,
      completedAt: Date.now(),
      updatedAt: Date.now()
    });

    return res.json({
      success: true,
      jobId: jobDocId,
      summary: {
        total: totalRows,
        success: successRows,
        failed: failedRows
      }
    });

  } catch (syncError: any) {
    console.error("[BackupRunner-Elementary] Critical failure during backup execution:", syncError);
    await jobRef.update({
      status: 'FAILED',
      lastErrorCode: syncError.status || 'ERROR',
      lastErrorMessage: syncError.message || String(syncError),
      completedAt: Date.now(),
      updatedAt: Date.now()
    });
    return res.status(500).json({
      error: syncError.message || "Terjadi kesalahan internal saat mengekspor data ke Google Sheets."
    });
  }
});

