import express from "express";
import { getFirestore } from "firebase-admin/firestore";
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
