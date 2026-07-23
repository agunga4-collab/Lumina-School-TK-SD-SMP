import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { google } from "googleapis";

// Firebase Admin Initialization
try {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (serviceAccountJson && !getApps().length) {
    const serviceAccount = JSON.parse(serviceAccountJson);
    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }
    initializeApp({
      credential: cert(serviceAccount),
    });
  }
} catch (err: any) {
  console.error("[FirebaseAdmin] Initialization failed in sync serverless handler:", err.message);
}

function getAdminDb() {
  try {
    return getFirestore();
  } catch (err) {
    return undefined;
  }
}

function isUserSuperAdmin(role: string | null, email?: string): boolean {
  if (role === "SUPER_ADMIN") return true;
  if (!email) return false;
  const lowerEmail = email.toLowerCase().trim();
  return (
    lowerEmail === "agunga4@gmail.com" ||
    lowerEmail === "agunga4@lazuardi.sch.id"
  );
}

const getGoogleAuth = () => {
  try {
    const saJson = process.env.GOOGLE_BACKUP_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!saJson) return null;
    
    let serviceAccount;
    try {
      serviceAccount = JSON.parse(saJson);
    } catch (parseErr) {
      console.error("[GoogleAuth] Failed to parse Service Account JSON");
      return null;
    }

    const auth = new google.auth.JWT({
      email: serviceAccount.client_email,
      key: serviceAccount.private_key?.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']
    });
    return auth;
  } catch (err) {
    console.error("[GoogleAuth] Helper failed:", err);
    return null;
  }
};

function getDrive() {
  const auth = getGoogleAuth();
  return google.drive({ version: 'v3', auth: auth || undefined });
}

function getSheets() {
  const auth = getGoogleAuth();
  return google.sheets({ version: 'v4', auth: auth || undefined });
}

function getColumnLetter(index: number): string {
  let letter = "";
  while (index >= 0) {
    letter = String.fromCharCode((index % 26) + 65) + letter;
    index = Math.floor(index / 26) - 1;
  }
  return letter;
}

async function findOrCreateFolder(driveInstance: any, name: string, parentId: string, sharedDriveId?: string) {
  const q = `name = '${name}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const response = await driveInstance.files.list({
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

  const folder = await driveInstance.files.create({
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
    supportsAllDrives: true,
    fields: 'id',
  });

  return folder.data.id;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let decodedToken: any;
  let userData: any = {};
  let userRole: string | null = null;
  let classData: any = null;
  let record: any = null;
  let spreadsheetId = "";
  let syncStatus = "SUCCESS";
  let errorMessage = "";

  try {
    // 1. Verify Firebase ID Token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized. Missing bearer token." });
    }
    const token = authHeader.split("Bearer ")[1];
    
    try {
      const getAdminAuth = (await import("firebase-admin/auth")).getAuth;
      decodedToken = await getAdminAuth().verifyIdToken(token);
    } catch (authErr: any) {
      return res.status(401).json({ error: `Authentication failed: ${authErr.message}` });
    }

    // 2. Fetch User Profile and Validate Roles/Unit
    const db = getAdminDb();
    if (!db) {
      return res.status(500).json({ error: "Firestore is not online." });
    }

    const userDoc = await db.collection("users").doc(decodedToken.uid).get();
    if (!userDoc.exists) {
      return res.status(403).json({ error: "Access denied. User profile not found." });
    }
    userData = userDoc.data() || {};
    userRole = userData.role || null;

    const isSuperAdmin = isUserSuperAdmin(userRole, decodedToken.email);
    const isJuniorHigh = userData.unitId === 'JUNIOR_HIGH' || (Array.isArray(userData.assignedUnits) && userData.assignedUnits.includes('JUNIOR_HIGH'));
    
    const hasValidRole = isSuperAdmin || ['HEAD_UNIT', 'HEAD_JUNIOR', 'TEACHER'].includes(userRole || "");
    const isAuthorized = isSuperAdmin || (hasValidRole && isJuniorHigh);

    if (!isAuthorized) {
      return res.status(403).json({ error: "Access denied. Active Junior High role/unit required." });
    }

    // 3. Load record from Firestore (Do not trust raw body payload)
    const { recordId } = req.body || {};
    if (!recordId) {
      return res.status(400).json({ error: "Missing recordId" });
    }

    const recordSnap = await db.collection("attendance_records").doc(recordId).get();
    if (!recordSnap.exists) {
      return res.status(404).json({ error: "Attendance record not found in Firestore" });
    }
    record = recordSnap.data();
    if (!record) {
      return res.status(500).json({ error: "Invalid record data in database" });
    }

    // 4. Validate classId unit is JUNIOR_HIGH
    const classSnap = await db.collection("classes").doc(record.classId).get();
    if (!classSnap.exists) {
      return res.status(404).json({ error: "Class not found in Firestore" });
    }
    classData = classSnap.data();
    if (classData?.unitId !== 'JUNIOR_HIGH') {
      return res.status(403).json({ error: "Access denied. Class does not belong to Junior High." });
    }

    // Initialize APIs
    const driveInstance = getDrive();
    const sheetsInstance = getSheets();

    // 5. Run backup sync logic
    // a. Get Config
    const configSnap = await db.collection("system_backup_configs").doc("junior_high_attendance").get();
    if (!configSnap.exists) {
      throw new Error("Backup config not found");
    }
    const config = configSnap.data();
    if (!config?.isEnabled) {
      return res.json({ success: true, message: "Backup disabled" });
    }

    // b. Resolve target Spreadsheet (Map)
    const academicYearId = record.academicYear.replace(/\//g, '-');
    const mapId = `${record.classId}_${academicYearId}_S${record.semester}`;
    const mapSnap = await db.collection("attendance_backup_file_maps").doc(mapId).get();
    
    if (mapSnap.exists) {
      spreadsheetId = mapSnap.data()?.spreadsheetId;
    } else {
      // Create Folder Structure and Spreadsheet
      console.log(`[BackupSync] Creating structure for ${mapId}`);
      const yearFolderId = await findOrCreateFolder(driveInstance, record.academicYear, config.rootFolderId, config.sharedDriveId);
      const semesterFolderId = await findOrCreateFolder(driveInstance, `Semester ${record.semester}`, yearFolderId, config.sharedDriveId);
      
      const ssTitle = `Attendance Recap - ${record.classId} - ${record.academicYear} (S${record.semester})`;
      const ssResponse = await sheetsInstance.spreadsheets.create({
        requestBody: {
          properties: { title: ssTitle },
          sheets: [
            { properties: { title: 'Metadata' } },
            { properties: { title: 'Rekap' } },
            { properties: { title: 'Log' } }
          ],
        },
        fields: 'spreadsheetId,spreadsheetUrl'
      });

      spreadsheetId = ssResponse.data.spreadsheetId!;
      
      // Move to correct folder
      await driveInstance.files.update({
        fileId: spreadsheetId,
        addParents: semesterFolderId,
        removeParents: (await driveInstance.files.get({ fileId: spreadsheetId, fields: 'parents' })).data.parents?.join(','),
        supportsAllDrives: true,
      });

      // Save to map
      await db.collection("attendance_backup_file_maps").doc(mapId).set({
        id: mapId,
        classId: record.classId,
        academicYear: record.academicYear,
        semester: record.semester,
        spreadsheetId,
        spreadsheetUrl: ssResponse.data.spreadsheetUrl,
        folderId: semesterFolderId,
        lastSyncedAt: Date.now()
      });

      // Initialize Headers (Metadata)
      await sheetsInstance.spreadsheets.values.update({
        spreadsheetId,
        range: 'Metadata!A1',
        valueInputOption: 'RAW',
        requestBody: { values: [['Property', 'Value'], ['Class', record.classId], ['Year', record.academicYear], ['Semester', record.semester]] }
      });
      
      await sheetsInstance.spreadsheets.values.update({
        spreadsheetId,
        range: 'Log!A1',
        valueInputOption: 'RAW',
        requestBody: { values: [['Timestamp', 'Student ID', 'Student Name', 'Date', 'Status', 'Note', 'Updated By']] }
      });
    }

    // c. Update the Log (Append)
    await sheetsInstance.spreadsheets.values.append({
      spreadsheetId,
      range: 'Log!A2',
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          new Date().toISOString(),
          record.studentId,
          record.studentName,
          record.date,
          record.status,
          record.note,
          record.recordedBy
        ]]
      }
    });

    // d. Update Recap (Robust implementation)
    console.log(`[BackupSync] Updating Rekap for ${record.studentName} on ${record.date}`);
    
    // Get current Rekap data
    const rekapResponse = await sheetsInstance.spreadsheets.values.get({
      spreadsheetId,
      range: 'Rekap!A1:ZZ100',
    });
    const rekapRows = rekapResponse.data.values || [];
    
    // Find or Create Date Column
    let header = rekapRows[0] || ['Student ID', 'Student Name'];
    const dateStr = record.date;
    let colIndex = header.indexOf(dateStr);
    
    if (colIndex === -1) {
      colIndex = header.length;
      header.push(dateStr);
      await sheetsInstance.spreadsheets.values.update({
        spreadsheetId,
        range: 'Rekap!A1',
        valueInputOption: 'RAW',
        requestBody: { values: [header] }
      });
    }

    // Find or Create Student Row
    let rowIndex = -1;
    for (let i = 1; i < rekapRows.length; i++) {
      if (rekapRows[i][0] === record.studentId) {
        rowIndex = i;
        break;
      }
    }

    if (rowIndex === -1) {
      rowIndex = rekapRows.length || 1;
      const newRow = new Array(header.length).fill('');
      newRow[0] = record.studentId;
      newRow[1] = record.studentName;
      newRow[colIndex] = record.status;
      
      await sheetsInstance.spreadsheets.values.append({
        spreadsheetId,
        range: 'Rekap!A2',
        valueInputOption: 'RAW',
        requestBody: { values: [newRow] }
      });
    } else {
      // Update existing cell
      const colLetter = getColumnLetter(colIndex);
      const cellRange = `Rekap!${colLetter}${rowIndex + 1}`;
      
      await sheetsInstance.spreadsheets.values.update({
        spreadsheetId,
        range: cellRange,
        valueInputOption: 'RAW',
        requestBody: { values: [[record.status]] }
      });
    }

    // e. Monthly Recap Tab Sync
    let monthNameIndo = "";
    try {
      const INDONESIAN_MONTHS = [
        "Januari", "Februari", "Maret", "April", "Mei", "Juni",
        "Juli", "Agustus", "September", "Oktober", "November", "Desember"
      ];

      const dateParts = record.date.split('-'); // ["2026", "07", "22"]
      const yearNum = parseInt(dateParts[0], 10);
      const monthNum = parseInt(dateParts[1], 10);
      const dayNum = parseInt(dateParts[2], 10);
      monthNameIndo = INDONESIAN_MONTHS[monthNum - 1];
      const tabTitle = `${monthNameIndo} ${yearNum}`;

      const ssMeta = await sheetsInstance.spreadsheets.get({ spreadsheetId });
      const sheetTitles = ssMeta.data.sheets?.map((s: any) => s.properties?.title || "") || [];

      if (!sheetTitles.includes(tabTitle)) {
        console.log(`[BackupSync] Adding monthly sheet: ${tabTitle}`);
        await sheetsInstance.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [
              {
                addSheet: {
                  properties: {
                    title: tabTitle,
                  }
                }
              }
            ]
          }
        });
      }

      // Load existing rows in the monthly sheet
      const monthRange = `${tabTitle}!A1:ZZ100`;
      const monthResponse = await sheetsInstance.spreadsheets.values.get({
        spreadsheetId,
        range: monthRange,
      }).catch(() => null);
      const monthRows = monthResponse?.data.values || [];

      const totalDays = new Date(yearNum, monthNum, 0).getDate();

      if (monthRows.length < 4) {
        // Initialize monthly sheet from scratch
        console.log(`[BackupSync] Initializing sheet: ${tabTitle}`);
        
        // Fetch students belonging to this class
        const studentsSnap1 = await db.collection("students").where("classId", "==", record.classId).get();
        const studentsSnap2 = classData?.name ? await db.collection("students").where("classId", "==", classData.name).get() : null;

        const uniqueStudentsMap = new Map();
        studentsSnap1.docs.forEach((doc: any) => {
          const data = doc.data();
          const id = data.luminaId || data.nis || doc.id;
          const name = data.name || data.displayName || data.fullName || "Siswa Tanpa Nama";
          uniqueStudentsMap.set(id, { id, name });
        });
        if (studentsSnap2) {
          studentsSnap2.docs.forEach((doc: any) => {
            const data = doc.data();
            const id = data.luminaId || data.nis || doc.id;
            const name = data.name || data.displayName || data.fullName || "Siswa Tanpa Nama";
            uniqueStudentsMap.set(id, { id, name });
          });
        }
        const sortedStudents = Array.from(uniqueStudentsMap.values())
          .sort((a: any, b: any) => a.name.localeCompare(b.name));

        // Fetch all attendance records for this month
        const monthPrefix = `${yearNum}-${String(monthNum).padStart(2, '0')}`;
        const monthlyRecordsSnap = await db.collection("attendance_records")
          .where("classId", "in", [record.classId, classData?.name || ""])
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

        // Always ensure current record is in the map even if firestore read is slightly behind
        if (!recordMap.has(record.studentId)) {
          recordMap.set(record.studentId, new Map());
        }
        recordMap.get(record.studentId).set(record.date, record.status);

        const header1 = [`REKAP KEHADIRAN JUNIOR HIGH — ${classData?.name || record.classId}`];
        const header2 = [`Bulan: ${tabTitle} | Tahun Ajaran: ${record.academicYear} | Semester: ${record.semester}`];
        const header3 = [];
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

        // Write values to sheets
        await sheetsInstance.spreadsheets.values.update({
          spreadsheetId,
          range: `${tabTitle}!A1`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: rows }
        });

        // Apply Styles and Formatting
        const ssUpdatedMeta = await sheetsInstance.spreadsheets.get({ spreadsheetId });
        const sheetId = ssUpdatedMeta.data.sheets?.find((s: any) => s.properties?.title === tabTitle)?.properties?.sheetId || 0;

        const mergeRequests = [
          {
            mergeCells: {
              range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: totalDays + 7 },
              mergeType: 'MERGE_ALL'
            }
          },
          {
            mergeCells: {
              range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: totalDays + 7 },
              mergeType: 'MERGE_ALL'
            }
          }
        ];

        const titleStylingRequest = {
          repeatCell: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: totalDays + 7 },
            cell: {
              userEnteredFormat: {
                horizontalAlignment: 'CENTER',
                verticalAlignment: 'MIDDLE',
                textFormat: { fontFamily: 'Arial', fontSize: 14, bold: true, foregroundColor: { red: 0.08, green: 0.28, blue: 0.58 } }
              }
            },
            fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment,textFormat)'
          }
        };

        const subtitleStylingRequest = {
          repeatCell: {
            range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: totalDays + 7 },
            cell: {
              userEnteredFormat: {
                horizontalAlignment: 'CENTER',
                verticalAlignment: 'MIDDLE',
                textFormat: { fontFamily: 'Arial', fontSize: 10, italic: true, foregroundColor: { red: 0.4, green: 0.4, blue: 0.4 } }
              }
            },
            fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment,textFormat)'
          }
        };

        const headerStylingRequest = {
          repeatCell: {
            range: { sheetId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: 0, endColumnIndex: totalDays + 7 },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.118, green: 0.227, blue: 0.541 },
                horizontalAlignment: 'CENTER',
                verticalAlignment: 'MIDDLE',
                textFormat: { fontFamily: 'Arial', fontSize: 10, bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } }
              }
            },
            fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,verticalAlignment,textFormat)'
          }
        };

        const columnWidthRequests = [
          { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 40 }, fields: 'pixelSize' } },
          { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 220 }, fields: 'pixelSize' } },
          { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 2, endIndex: 2 + totalDays }, properties: { pixelSize: 32 }, fields: 'pixelSize' } },
          { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 2 + totalDays, endIndex: 2 + totalDays + 4 }, properties: { pixelSize: 45 }, fields: 'pixelSize' } },
          { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 2 + totalDays + 4, endIndex: 2 + totalDays + 5 }, properties: { pixelSize: 90 }, fields: 'pixelSize' } }
        ];

        const freezeRequest = {
          updateSheetProperties: {
            properties: { sheetId, gridProperties: { frozenRowCount: 4, frozenColumnCount: 2 } },
            fields: 'gridProperties.frozenRowCount,gridProperties.frozenColumnCount'
          }
        };

        const borderRequest = {
          updateBorders: {
            range: { sheetId, startRowIndex: 3, endRowIndex: Math.max(100, 5 + sortedStudents.length), startColumnIndex: 0, endColumnIndex: totalDays + 7 },
            top: { style: 'SOLID', width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 } },
            bottom: { style: 'SOLID', width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 } },
            left: { style: 'SOLID', width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 } },
            right: { style: 'SOLID', width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 } },
            innerHorizontal: { style: 'SOLID', width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 } },
            innerVertical: { style: 'SOLID', width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 } }
          }
        };

        const conditionalFormattingRequests = [
          {
            addConditionalFormatRule: {
              rule: {
                ranges: [{ sheetId, startRowIndex: 4, endRowIndex: Math.max(100, 5 + sortedStudents.length), startColumnIndex: 2, endColumnIndex: 2 + totalDays }],
                booleanRule: {
                  condition: { type: 'TEXT_EQUALS', values: [{ userEnteredValue: 'H' }] },
                  format: { backgroundColor: { red: 0.85, green: 0.95, blue: 0.85 }, textFormat: { color: { red: 0.1, green: 0.5, blue: 0.1 }, bold: true } }
                }
              },
              index: 0
            }
          },
          {
            addConditionalFormatRule: {
              rule: {
                ranges: [{ sheetId, startRowIndex: 4, endRowIndex: Math.max(100, 5 + sortedStudents.length), startColumnIndex: 2, endColumnIndex: 2 + totalDays }],
                booleanRule: {
                  condition: { type: 'TEXT_EQUALS', values: [{ userEnteredValue: 'S' }] },
                  format: { backgroundColor: { red: 0.85, green: 0.9, blue: 1.0 }, textFormat: { color: { red: 0.1, green: 0.3, blue: 0.8 }, bold: true } }
                }
              },
              index: 1
            }
          },
          {
            addConditionalFormatRule: {
              rule: {
                ranges: [{ sheetId, startRowIndex: 4, endRowIndex: Math.max(100, 5 + sortedStudents.length), startColumnIndex: 2, endColumnIndex: 2 + totalDays }],
                booleanRule: {
                  condition: { type: 'TEXT_EQUALS', values: [{ userEnteredValue: 'I' }] },
                  format: { backgroundColor: { red: 1.0, green: 0.95, blue: 0.8 }, textFormat: { color: { red: 0.7, green: 0.5, blue: 0.0 }, bold: true } }
                }
              },
              index: 2
            }
          },
          {
            addConditionalFormatRule: {
              rule: {
                ranges: [{ sheetId, startRowIndex: 4, endRowIndex: Math.max(100, 5 + sortedStudents.length), startColumnIndex: 2, endColumnIndex: 2 + totalDays }],
                booleanRule: {
                  condition: { type: 'TEXT_EQUALS', values: [{ userEnteredValue: 'A' }] },
                  format: { backgroundColor: { red: 1.0, green: 0.85, blue: 0.85 }, textFormat: { color: { red: 0.8, green: 0.1, blue: 0.1 }, bold: true } }
                }
              },
              index: 3
            }
          }
        ];

        const percentFormatRequest = {
          repeatCell: {
            range: { sheetId, startRowIndex: 4, endRowIndex: Math.max(100, 5 + sortedStudents.length), startColumnIndex: 2 + totalDays + 4, endColumnIndex: 2 + totalDays + 5 },
            cell: { userEnteredFormat: { numberFormat: { type: 'PERCENT', pattern: '0.0%' } } },
            fields: 'userEnteredFormat.numberFormat'
          }
        };

        const alignmentRequests = [
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 4, endRowIndex: Math.max(100, 5 + sortedStudents.length), startColumnIndex: 0, endColumnIndex: 1 },
              cell: { userEnteredFormat: { horizontalAlignment: 'CENTER' } },
              fields: 'userEnteredFormat.horizontalAlignment'
            }
          },
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 4, endRowIndex: Math.max(100, 5 + sortedStudents.length), startColumnIndex: 2, endColumnIndex: totalDays + 7 },
              cell: { userEnteredFormat: { horizontalAlignment: 'CENTER' } },
              fields: 'userEnteredFormat.horizontalAlignment'
            }
          }
        ];

        const weekendRequests = [];
        for (let d = 1; d <= totalDays; d++) {
          const dateObj = new Date(yearNum, monthNum - 1, d);
          const dayOfWeek = dateObj.getDay();
          if (dayOfWeek === 0 || dayOfWeek === 6) {
            weekendRequests.push({
              repeatCell: {
                range: { sheetId, startRowIndex: 3, endRowIndex: Math.max(100, 5 + sortedStudents.length), startColumnIndex: 2 + d - 1, endColumnIndex: 2 + d },
                cell: { userEnteredFormat: { backgroundColor: { red: 0.95, green: 0.95, blue: 0.95 } } },
                fields: 'userEnteredFormat.backgroundColor'
              }
            });
          }
        }

        const filterRequest = {
          setBasicFilter: {
            filter: {
              range: { sheetId, startRowIndex: 3, endRowIndex: Math.max(100, 5 + sortedStudents.length), startColumnIndex: 0, endColumnIndex: totalDays + 7 }
            }
          }
        };

        await sheetsInstance.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [
              ...mergeRequests,
              titleStylingRequest,
              subtitleStylingRequest,
              headerStylingRequest,
              ...columnWidthRequests,
              freezeRequest,
              borderRequest,
              ...conditionalFormattingRequests,
              percentFormatRequest,
              ...alignmentRequests,
              ...weekendRequests,
              filterRequest
            ]
          }
        });
      } else {
        // Update existing row/cell or append a new student row
        let rowIndex = -1;
        for (let i = 4; i < monthRows.length; i++) {
          if (monthRows[i][1] === record.studentName) {
            rowIndex = i;
            break;
          }
        }

        let code = '';
        if (record.status === 'HADIR' || record.status === 'LATE') code = 'H';
        else if (record.status === 'SAKIT') code = 'S';
        else if (record.status === 'IZIN') code = 'I';
        else if (record.status === 'ALPA') code = 'A';

        if (rowIndex === -1) {
          // New Student Row
          const newRowNo = monthRows.length + 1;
          const newStudentRow = [
            String(monthRows.length - 4 + 1),
            record.studentName,
          ];
          for (let d = 1; d <= totalDays; d++) {
            const dayStr = String(d).padStart(2, '0');
            const fullDate = `${yearNum}-${String(monthNum).padStart(2, '0')}-${dayStr}`;
            let cellVal = '';
            if (fullDate === record.date) {
              cellVal = code;
            }
            newStudentRow.push(cellVal);
          }

          const firstDateColLetter = 'C';
          const lastDateColLetter = getColumnLetter(2 + totalDays - 1);
          const colH_Letter = getColumnLetter(2 + totalDays);
          const colS_Letter = getColumnLetter(2 + totalDays + 1);
          const colI_Letter = getColumnLetter(2 + totalDays + 2);
          const colA_Letter = getColumnLetter(2 + totalDays + 3);

          newStudentRow.push(
            `=COUNTIF(${firstDateColLetter}${newRowNo}:${lastDateColLetter}${newRowNo}, "H")`,
            `=COUNTIF(${firstDateColLetter}${newRowNo}:${lastDateColLetter}${newRowNo}, "S")`,
            `=COUNTIF(${firstDateColLetter}${newRowNo}:${lastDateColLetter}${newRowNo}, "I")`,
            `=COUNTIF(${firstDateColLetter}${newRowNo}:${lastDateColLetter}${newRowNo}, "A")`,
            `=IF((${colH_Letter}${newRowNo}+${colS_Letter}${newRowNo}+${colI_Letter}${newRowNo}+${colA_Letter}${newRowNo})>0, ${colH_Letter}${newRowNo}/(${colH_Letter}${newRowNo}+${colS_Letter}${newRowNo}+${colI_Letter}${newRowNo}+${colA_Letter}${newRowNo}), "")`
          );

          await sheetsInstance.spreadsheets.values.append({
            spreadsheetId,
            range: `${tabTitle}!A5`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [newStudentRow] }
          });
        } else {
          // Single Cell Update
          const colIndex = 2 + dayNum - 1;
          const colLetter = getColumnLetter(colIndex);
          const cellRange = `${tabTitle}!${colLetter}${rowIndex + 1}`;

          await sheetsInstance.spreadsheets.values.update({
            spreadsheetId,
            range: cellRange,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [[code]] }
          });
        }
      }
    } catch (monthErr: any) {
      console.error("[BackupSync] Monthly Tab error (non-blocking):", monthErr);
    }
    
    return res.status(200).json({ success: true, spreadsheetId });
  } catch (error: any) {
    console.error("[BackupSync] Error:", error);
    syncStatus = "FAILED";
    errorMessage = error.message || "Unknown sync error";
    return res.status(500).json({ error: errorMessage });
  } finally {
    // 6. Save server-side audit log (always runs)
    if (decodedToken) {
      try {
        const db = getAdminDb();
        if (db) {
          const dateParts = record?.date ? record.date.split('-') : null;
          const yearNum = dateParts ? parseInt(dateParts[0], 10) : null;
          const monthNum = dateParts ? parseInt(dateParts[1], 10) : null;
          const INDONESIAN_MONTHS = [
            "Januari", "Februari", "Maret", "April", "Mei", "Juni",
            "Juli", "Agustus", "September", "Oktober", "November", "Desember"
          ];
          const monthNameIndo = monthNum ? INDONESIAN_MONTHS[monthNum - 1] : null;

          const auditLog = {
            requestedByUid: decodedToken.uid,
            requestedByName: userData.displayName || decodedToken.name || decodedToken.email || "Unknown",
            requestedByRole: userRole || "Unknown",
            requesterUnit: userData.unitId || "Unknown",
            classId: record ? record.classId : "Unknown",
            unitId: classData ? classData.unitId : "JUNIOR_HIGH",
            recordId: record ? record.id : "Unknown",
            academicYear: record ? record.academicYear : "Unknown",
            semester: record ? record.semester : "Unknown",
            spreadsheetId: spreadsheetId || null,
            status: syncStatus,
            syncedAt: Date.now(),
            errorMessage: errorMessage || null,
            month: monthNum,
            year: yearNum,
            sheetName: (monthNameIndo && yearNum) ? `${monthNameIndo} ${yearNum}` : null
          };
          await db.collection("attendance_backup_audit_logs").add(auditLog);
        }
      } catch (logErr: any) {
        console.error("[BackupSync] Audit logging error:", logErr);
      }
    }
  }
}
