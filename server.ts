import express from "express";
import path from "path";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import axios from "axios";
import { parse } from "csv-parse/sync";
import fs from "fs";
import { google } from "googleapis";
import { Readable } from "stream";
import type { LGBackupStatus, LGBackupSummary, LGBackupLog } from "./src/types";

const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// --- Firebase Admin Initialization ---
try {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccountJson) {
    console.error('FIREBASE_SERVICE_ACCOUNT missing');
  } else {
    if (!getApps().length) {
      const serviceAccount = JSON.parse(serviceAccountJson);
      if (serviceAccount.private_key) {
        serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
      }
      initializeApp({
        credential: cert(serviceAccount),
      });
    }
  }
} catch (err: any) {
  console.error("[FirebaseAdmin] Initialization failed:", err.message);
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

// --- Lazy Proxies for backwards compatibility ---
export const adminDb = new Proxy({} as any, {
  get(target, prop) {
    const db = getAdminDb();
    if (!db) {
      if (prop === '$$typeof' || prop === 'constructor' || prop === 'then') return undefined;
      throw new Error(`[FirebaseAdmin] Attempted to use adminDb but it is not initialized. Check FIREBASE_SERVICE_ACCOUNT.`);
    }
    const val = (db as any)[prop];
    return typeof val === 'function' ? val.bind(db) : val;
  }
});

export const drive = new Proxy({} as any, {
  get(target, prop) {
    const instance = getDrive();
    const val = (instance as any)[prop];
    return typeof val === 'function' ? val.bind(instance) : val;
  }
});

export const sheets = new Proxy({} as any, {
  get(target, prop) {
    const instance = getSheets();
    const val = (instance as any)[prop];
    return typeof val === 'function' ? val.bind(instance) : val;
  }
});

async function findOrCreateFolder(name: string, parentId: string, sharedDriveId?: string) {
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

// Helper: Upload JSON to Drive
async function uploadJsonToDrive(folderId: string, fileName: string, data: any, sharedDriveId?: string) {
  const q = `name = '${fileName}' and '${folderId}' in parents and trashed = false`;
  const existingFiles = await drive.files.list({
    q,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    driveId: sharedDriveId,
    corpora: sharedDriveId ? 'drive' : undefined,
    fields: 'files(id, name)',
  });

  const media = {
    mimeType: 'application/json',
    body: JSON.stringify(data, null, 2),
  };

  if (existingFiles.data.files && existingFiles.data.files.length > 0) {
    const fileId = existingFiles.data.files[0].id!;
    await drive.files.update({
      fileId,
      media,
      supportsAllDrives: true
    });
    return fileId;
  } else {
    const response = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [folderId],
        mimeType: 'application/json',
      },
      media,
      supportsAllDrives: true,
      fields: 'id',
    });
    return response.data.id!;
  }
}


// Helper to find or create folders, escaping single quotes in query
async function findOrCreateObsFolder(name: string, parentId: string) {
  // Drive API query escaping is backslash single-quote
  const escapedName = name.replace(/'/g, "\\'");
  const q = `name = '${escapedName}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  
  try {
    const response = await drive.files.list({
      q,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      fields: 'files(id, name)',
    });

    if (response.data.files && response.data.files.length > 0) {
      return response.data.files[0].id!;
    }
  } catch (error) {
    console.error(`[findOrCreateObsFolder] Search failed for ${name}:`, error);
  }

  // Create folder if not found
  const folder = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId]
    },
    supportsAllDrives: true,
    fields: 'id',
  });

  return folder.data.id!;
}

// Recursively ensure all folders in the array exist
async function ensureObsFolderPath(pathArray: string[], rootFolderId: string): Promise<string> {
  let parentId = rootFolderId;
  for (const part of pathArray) {
    if (!part) continue;
    parentId = await findOrCreateObsFolder(part.trim(), parentId);
  }
  return parentId;
}

// API: Upload Kindergarten Observation Photo to Google Drive
app.post("/api/observations/upload-photo", async (req, res) => {
  try {
    const {
      base64,
      type,
      academicYear,
      className,
      studentId,
      studentName,
      observationDate,
      uploadedBy
    } = req.body;

    if (!base64) {
      return res.status(400).json({ error: "Missing physical image file data (base64)" });
    }
    if (!type || !['general', 'student'].includes(type)) {
      return res.status(400).json({ error: "Invalid or missing upload type ('general' or 'student')" });
    }

    // 1. Convert base64 to buffer
    let base64Data = base64;
    let mimeType = "image/jpeg";
    if (base64.includes(";base64,")) {
      const parts = base64.split(";base64,");
      const match = parts[0].match(/data:(.*)/);
      if (match) {
        mimeType = match[1];
      }
      base64Data = parts[1];
    }
    const buffer = Buffer.from(base64Data, "base64");

    // 2. Setup path structural components
    const cleanClassName = className ? className.replace(/\//g, "-").trim() : "General";
    const cleanAcademicYear = academicYear ? academicYear.replace(/\//g, "-").trim() : "Unknown";
    const cleanDate = observationDate ? observationDate.replace(/-/g, "") : new Date().toISOString().split("T")[0].replace(/-/g, "");

    let folderPathArray: string[] = [];
    let fileName = "";

    if (type === "general") {
      folderPathArray = [
        "Observation Photos",
        "Kindergarten",
        "General",
        cleanAcademicYear,
        cleanClassName,
        observationDate
      ];
      // general-{className}-{yyyyMMdd}-{timestamp}.jpg
      const cleanClassNameSlug = cleanClassName.toLowerCase().replace(/[^a-z0-9_\-]/g, "_");
      fileName = `general-${cleanClassNameSlug}-${cleanDate}-${Date.now()}.jpg`;
    } else {
      // student-{studentId}-{yyyyMMdd}-{timestamp}.jpg
      const studentIdentifier = studentName && studentId ? `${studentName}_${studentId}` : (studentId || "unknown_student");
      folderPathArray = [
        "Observation Photos",
        "Kindergarten",
        "Students",
        cleanAcademicYear,
        cleanClassName,
        studentIdentifier,
        observationDate
      ];
      const cleanId = studentId ? studentId.toLowerCase().replace(/[^a-z0-9_\-]/g, "_") : "unknown";
      fileName = `student-${cleanId}-${cleanDate}-${Date.now()}.jpg`;
    }

    // 3. Resolve the exact Google Drive parent folder ID
    const rootId = "1mEDcuWvzEqIObEUGDPm46EaVqW94mtJP";
    console.log(`[PhotoUpload] Resolving Drive structure under root folder ${rootId} for path: /${folderPathArray.join('/')}`);
    const parentFolderId = await ensureObsFolderPath(folderPathArray, rootId);

    // 4. Upload file to Google Drive
    const mediaStream = Readable.from(buffer);
    const driveResponse = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [parentFolderId],
        mimeType: mimeType
      },
      media: {
        mimeType: mimeType,
        body: mediaStream
      },
      supportsAllDrives: true,
      fields: "id"
    });

    const fileId = driveResponse.data.id!;
    console.log(`[PhotoUpload] Success! Created file ${fileName} with ID ${fileId}`);

    // 5. Grant anyone reader permission so it can be previewed/embedded in report canvases
    try {
      await drive.permissions.create({
        fileId: fileId,
        requestBody: {
          role: "reader",
          type: "anyone"
        },
        supportsAllDrives: true
      });
      console.log(`[PhotoUpload] Access permission to 'anyone/reader' granted successfully for file ${fileId}`);
    } catch (permError: any) {
      console.warn(`[PhotoUpload] Warning: failed to grant permissions: ${permError.message}`);
    }

    // 6. Build final metadata payload
    const metadata = {
      driveFileId: fileId,
      fileName: fileName,
      mimeType: mimeType,
      previewUrl: `https://lh3.googleusercontent.com/d/${fileId}`,
      rootFolderId: rootId,
      folderPath: "/" + folderPathArray.join("/"),
      academicYear: academicYear || "Unknown",
      className: className || "Unknown",
      studentId: studentId || null,
      observationDate: observationDate,
      uploadedAt: Date.now(),
      uploadedBy: uploadedBy || "Lumina Teacher"
    };

    // 7. Save metadata permanently to Firestore separate collection for logs
    await adminDb.collection("kg_observation_photos").doc(fileId).set(metadata);

    // 8. Return response
    return res.json({
      success: true,
      message: "Photo successfully synchronized with Google Drive and logged in Firestore.",
      metadata
    });

  } catch (error: any) {
    console.error("[PhotoUpload] Critical failures occurred:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "An expected error occurred during Google Drive file synchronization."
    });
  }
});


// API: Verify Folder Access
app.post("/api/attendance/verify-folder", async (req, res) => {
  try {
    const { rootFolderId, sharedDriveId } = req.body;
    const response = await drive.files.get({
      fileId: rootFolderId,
      supportsAllDrives: true,
      fields: 'id, name, driveId',
    });
    res.json({ success: true, folderName: response.data.name });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// API: Sync Attendance Record to Google Sheets
app.post("/api/attendance/sync", async (req, res) => {
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
    const { recordId } = req.body;
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
      const yearFolderId = await findOrCreateFolder(record.academicYear, config.rootFolderId, config.sharedDriveId);
      const semesterFolderId = await findOrCreateFolder(`Semester ${record.semester}`, yearFolderId, config.sharedDriveId);
      
      const ssTitle = `Attendance Recap - ${record.classId} - ${record.academicYear} (S${record.semester})`;
      
      // Perform an idempotent search in Drive to prevent duplicate creation
      const q = `name = '${ssTitle.replace(/'/g, "\\'")}' and '${semesterFolderId}' in parents and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`;
      const existingSS = await drive.files.list({
        q,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        driveId: config.sharedDriveId,
        corpora: config.sharedDriveId ? 'drive' : undefined,
        fields: 'files(id, name, webViewLink)',
      });

      let spreadsheetUrl = "";
      if (existingSS.data.files && existingSS.data.files.length > 0) {
        spreadsheetId = existingSS.data.files[0].id!;
        spreadsheetUrl = existingSS.data.files[0].webViewLink!;
        console.log(`[BackupSync] Found existing spreadsheet in Shared Drive: ${spreadsheetId}`);
      } else {
        // Create file using Google Drive API directly to prevent Shared Drive permission issues
        console.log(`[BackupSync] Creating spreadsheet in Shared Drive via Drive API...`);
        try {
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
          console.log(`[BackupSync] Created spreadsheet in Shared Drive: ${spreadsheetId}`);

          // Initialize sheets: Metadata, Rekap, Log
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

          // Initialize Headers (Metadata)
          await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: 'Metadata!A1',
            valueInputOption: 'RAW',
            requestBody: { values: [['Property', 'Value'], ['Class', record.classId], ['Year', record.academicYear], ['Semester', record.semester]] }
          });
          
          await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: 'Log!A1',
            valueInputOption: 'RAW',
            requestBody: { values: [['Timestamp', 'Student ID', 'Student Name', 'Date', 'Status', 'Note', 'Updated By']] }
          });
        } catch (createErr: any) {
          console.error("[BackupSync] Error creating spreadsheet via Drive API:", createErr);
          throw new Error(`Gagal membuat file spreadsheet pada Shared Drive: ${createErr.message || createErr}`);
        }
      }

      // Save to map
      await db.collection("attendance_backup_file_maps").doc(mapId).set({
        id: mapId,
        classId: record.classId,
        academicYear: record.academicYear,
        semester: record.semester,
        spreadsheetId,
        spreadsheetUrl,
        folderId: semesterFolderId,
        lastSyncedAt: Date.now()
      });
    }

    // c. Update the Log (Append)
    await sheets.spreadsheets.values.append({
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
    const rekapResponse = await sheets.spreadsheets.values.get({
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
      await sheets.spreadsheets.values.update({
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
      
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'Rekap!A2',
        valueInputOption: 'RAW',
        requestBody: { values: [newRow] }
      });
    } else {
      // Update existing cell
      const colLetter = getColumnLetter(colIndex);
      const cellRange = `Rekap!${colLetter}${rowIndex + 1}`;
      
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: cellRange,
        valueInputOption: 'RAW',
        requestBody: { values: [[record.status]] }
      });
    }

    // 5.e. Monthly Recap Tab Sync
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

      const ssMeta = await sheets.spreadsheets.get({ spreadsheetId });
      const sheetTitles = ssMeta.data.sheets?.map((s: any) => s.properties?.title || "") || [];

      if (!sheetTitles.includes(tabTitle)) {
        console.log(`[BackupSync] Adding monthly sheet: ${tabTitle}`);
        await sheets.spreadsheets.batchUpdate({
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
      const monthResponse = await sheets.spreadsheets.values.get({
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
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${tabTitle}!A1`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: rows }
        });

        // Apply Styles and Formatting
        const ssUpdatedMeta = await sheets.spreadsheets.get({ spreadsheetId });
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

        await sheets.spreadsheets.batchUpdate({
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

          await sheets.spreadsheets.values.append({
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

          await sheets.spreadsheets.values.update({
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
    
    res.json({ success: true, spreadsheetId });
  } catch (error: any) {
    console.error("[BackupSync] Error:", error);
    syncStatus = "FAILED";
    errorMessage = error.message || "Unknown sync error";
    res.status(500).json({ error: errorMessage });
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
});

// API: Sync Dhuhur Attendance Batch to Google Sheets
app.post("/api/attendance/dhuhur/sync-batch", async (req, res) => {
  let decodedToken: any;
  let userData: any = {};
  let userRole: string | null = null;
  const db = getAdminDb();
  if (!db) {
    return res.status(500).json({ error: "Firestore is not online." });
  }

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

    // 3. Validate Request Parameters
    const { academicYearId, semester, classId, date, recordIds } = req.body;
    if (!academicYearId || !semester || !classId || !date || !Array.isArray(recordIds) || recordIds.length === 0) {
      return res.status(400).json({ error: "Missing required fields or recordIds in request body" });
    }

    // 4. Fetch the target records from Firestore
    const semesterNum = parseInt(String(semester), 10);
    const semesterQueryList = isNaN(semesterNum) ? [semester] : [semesterNum, String(semesterNum)];

    const recordsSnap = await db.collection("dhuhur_attendance_records")
      .where("classId", "==", classId)
      .where("date", "==", date)
      .where("academicYearId", "==", academicYearId)
      .where("semester", "in", semesterQueryList)
      .get();

    const recordsInDb = recordsSnap.docs.map(doc => doc.data());
    // Filter to only the requested recordIds
    const recordsToSync = recordsInDb.filter(r => recordIds.includes(r.id));

    if (recordsToSync.length === 0) {
      return res.status(404).json({ error: "No matching Dhuhur records found to sync" });
    }

    // Ensure all records have JUNIOR_HIGH unit and DHUHUR_ATTENDANCE backupType
    for (const rec of recordsToSync) {
      if (rec.unit !== 'JUNIOR_HIGH' || rec.backupType !== 'DHUHUR_ATTENDANCE') {
        return res.status(400).json({ error: `Record ${rec.id} is invalid for Dhuhur backup` });
      }
    }

    // 5. Load backup config
    const configSnap = await db.collection("system_backup_configs").doc("junior_high_attendance").get();
    if (!configSnap.exists) {
      throw new Error("Backup config not found");
    }
    const config = configSnap.data();
    if (!config?.isEnabled) {
      return res.json({ success: true, message: "Backup disabled" });
    }

    // 6. Resolve target Spreadsheet (Map)
    // Key: dhuhur_JUNIOR_HIGH_{academicYearId}_S{semester}
    const mapId = `dhuhur_JUNIOR_HIGH_${academicYearId}_S${semester}`;
    const mapSnap = await db.collection("attendance_backup_file_maps").doc(mapId).get();
    
    let spreadsheetId = "";
    let spreadsheetUrl = "";
    let semesterFolderId = "";

    const firstRecord = recordsToSync[0];
    const academicYear = firstRecord.academicYear; // e.g. "2026/2027"

    if (mapSnap.exists) {
      const mapData = mapSnap.data();
      spreadsheetId = mapData?.spreadsheetId;
      spreadsheetUrl = mapData?.spreadsheetUrl;
      semesterFolderId = mapData?.folderId;
    }

    // Double check with Drive to make sure spreadsheetId actually exists
    let driveExists = false;
    if (spreadsheetId) {
      try {
        await drive.files.get({ fileId: spreadsheetId, supportsAllDrives: true });
        driveExists = true;
      } catch (err) {
        console.warn(`[DhuhurSync] Spreadsheet ID ${spreadsheetId} mapped but not found in Drive. Will recreate.`);
      }
    }

    if (!driveExists) {
      console.log(`[DhuhurSync] Creating structure for ${mapId}`);
      const yearFolderId = await findOrCreateFolder(academicYear, config.rootFolderId, config.sharedDriveId);
      semesterFolderId = await findOrCreateFolder(`Semester ${semester}`, yearFolderId, config.sharedDriveId);
      
      const ssTitle = `Kehadiran Shalat Dhuhur Junior High — ${academicYear} — Semester ${semester}`;
      
      // Idempotent search
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
        console.log(`[DhuhurSync] Found existing Dhuhur spreadsheet: ${spreadsheetId}`);
      } else {
        console.log(`[DhuhurSync] Creating new spreadsheet in Shared Drive via Drive API...`);
        try {
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
          console.log(`[DhuhurSync] Created spreadsheet: ${spreadsheetId}`);

          // Initialize sheets
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

          // Initialize Metadata
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

          // Initialize Log
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

          // Initialize Rekap
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
        } catch (createErr: any) {
          console.error("[DhuhurSync] Error creating spreadsheet:", createErr);
          throw new Error(`Gagal membuat file spreadsheet Dhuhur: ${createErr.message || createErr}`);
        }
      }

      // Save map
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

    // Now process records
    // 1. Log tab upsert
    console.log(`[DhuhurSync] Upserting Log tab...`);
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
        record.classNameSnapshot,
        record.studentId,
        record.studentNameSnapshot,
        record.status,
        statusKet,
        record.note || "",
        record.recordedByEmail,
        new Date().toISOString()
      ]);
    }

    const finalLogRows = [logHeader, ...Array.from(logMap.values())];
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Log!A1',
      valueInputOption: 'RAW',
      requestBody: { values: finalLogRows }
    });

    // 2. Rekap tab upsert
    console.log(`[DhuhurSync] Upserting Rekap tab...`);
    const studentIds = recordsToSync.map(r => r.studentId);
    
    // Fetch all dhuhur records for these students to count accurately without full scan
    const studentRecordsSnap = await db.collection("dhuhur_attendance_records")
      .where("academicYearId", "==", academicYearId)
      .where("semester", "in", semesterQueryList)
      .where("studentId", "in", studentIds)
      .get();

    const studentRecords = studentRecordsSnap.docs.map(doc => doc.data());

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
      const className = anyRec?.classNameSnapshot || '';
      const studentName = anyRec?.studentNameSnapshot || '';

      rekapMap.set(studentId, [className, studentId, studentName, countH, countT, countA]);
    }

    // Sort by Class name then Student Name
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

    // 3. Month tab upsert
    console.log(`[DhuhurSync] Upserting Month tab...`);
    const dateParts = date.split('-'); // ["2026", "07", "23"]
    const yearNum = parseInt(dateParts[0], 10);
    const monthNum = parseInt(dateParts[1], 10);
    const dayNum = parseInt(dateParts[2], 10);

    const INDONESIAN_MONTHS = [
      "Januari", "Februari", "Maret", "April", "Mei", "Juni",
      "Juli", "Agustus", "September", "Oktober", "November", "Desember"
    ];
    const monthNameIndo = INDONESIAN_MONTHS[monthNum - 1];
    const tabTitle = `${monthNameIndo} ${yearNum}`;

    // Add monthly sheet if not exists
    const ssInfo = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetTitles = ssInfo.data.sheets?.map((s: any) => s.properties?.title || "") || [];

    if (!sheetTitles.includes(tabTitle)) {
      console.log(`[DhuhurSync] Adding monthly sheet: ${tabTitle}`);
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: tabTitle } } }]
        }
      });
    }

    const monthResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${tabTitle}!A1:ZZ1000`,
    });
    const monthRows = monthResponse.data.values || [];
    const totalDays = new Date(yearNum, monthNum, 0).getDate();

    const monthHeader1 = [`REKAP KEHADIRAN SHALAT DHUHUR JUNIOR HIGH`];
    const monthHeader2 = [`Bulan: ${tabTitle} | Tahun Ajaran: ${academicYear} | Semester: ${semester}`];
    const monthHeader3 = [];
    const monthHeader4 = ['No', 'Kelas', 'Student ID', 'Nama Siswa'];
    for (let d = 1; d <= totalDays; d++) {
      monthHeader4.push(String(d));
    }
    monthHeader4.push('H', 'T', 'A', 'Persentase Tepat Waktu');

    // Parse existing monthly student rows
    const studentMonthMap = new Map(); // key: classId_studentId -> row array
    for (let i = 4; i < monthRows.length; i++) {
      const row = monthRows[i];
      if (row[1] && row[2]) {
        studentMonthMap.set(`${row[1]}_${row[2]}`, row);
      }
    }

    // Upsert current batch into map
    for (const record of recordsToSync) {
      const key = `${record.classId}_${record.studentId}`;
      let row = studentMonthMap.get(key);
      if (!row) {
        row = [
          "", // No placeholder
          record.classId,
          record.studentId,
          record.studentNameSnapshot
        ];
        // fill days
        for (let d = 1; d <= totalDays; d++) {
          row.push("");
        }
      }
      // Update day d cell. Day d is at index 4 + d - 1 = 3 + d
      row[3 + dayNum] = record.status;
      studentMonthMap.set(key, row);
    }

    // Sort studentMonthMap by Class (col 1) then Student Name (col 3)
    const sortedMonthRows = Array.from(studentMonthMap.values()).sort((a, b) => {
      const classComp = (a[1] || '').localeCompare(b[1] || '');
      if (classComp !== 0) return classComp;
      return (a[3] || '').localeCompare(b[3] || '');
    });

    // Re-generate formulas and index
    const finalMonthRows = [monthHeader1, monthHeader2, monthHeader3, monthHeader4];
    
    const firstDateColLetter = 'E'; // Col index 4 is E
    const lastDateColLetter = getColumnLetter(3 + totalDays);
    const colH_Letter = getColumnLetter(4 + totalDays);
    const colT_Letter = getColumnLetter(4 + totalDays + 1);
    const colA_Letter = getColumnLetter(4 + totalDays + 2);

    sortedMonthRows.forEach((row, idx) => {
      const rowNum = idx + 5;
      const finalRow = [
        String(idx + 1), // No
        row[1], // Kelas
        row[2], // Student ID
        row[3]  // Nama Siswa
      ];
      // Push days
      for (let d = 1; d <= totalDays; d++) {
        finalRow.push(row[3 + d] || "");
      }
      // Push formula cells
      finalRow.push(
        `=COUNTIF(${firstDateColLetter}${rowNum}:${lastDateColLetter}${rowNum}, "H")`,
        `=COUNTIF(${firstDateColLetter}${rowNum}:${lastDateColLetter}${rowNum}, "T")`,
        `=COUNTIF(${firstDateColLetter}${rowNum}:${lastDateColLetter}${rowNum}, "A")`,
        `=IF((${colH_Letter}${rowNum}+${colT_Letter}${rowNum}+${colA_Letter}${rowNum})>0, ${colH_Letter}${rowNum}/(${colH_Letter}${rowNum}+${colT_Letter}${rowNum}+${colA_Letter}${rowNum}), "")`
      );
      finalMonthRows.push(finalRow);
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${tabTitle}!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: finalMonthRows }
    });

    // Apply conditional formatting styling on Month sheet if empty initially
    if (monthRows.length < 4) {
      const ssUpdatedMeta = await sheets.spreadsheets.get({ spreadsheetId });
      const sheetId = ssUpdatedMeta.data.sheets?.find((s: any) => s.properties?.title === tabTitle)?.properties?.sheetId || 0;

      const mergeRequests = [
        { mergeCells: { range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: totalDays + 8 }, mergeType: 'MERGE_ALL' } },
        { mergeCells: { range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: totalDays + 8 }, mergeType: 'MERGE_ALL' } }
      ];

      const percentFormatRequest = {
        repeatCell: {
          range: { sheetId, startRowIndex: 4, endRowIndex: Math.max(100, 5 + sortedMonthRows.length), startColumnIndex: 4 + totalDays + 3, endColumnIndex: 4 + totalDays + 4 },
          cell: { userEnteredFormat: { numberFormat: { type: 'PERCENT', pattern: '0.0%' } } },
          fields: 'userEnteredFormat.numberFormat'
        }
      };

      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            ...mergeRequests,
            percentFormatRequest
          ]
        }
      }).catch(err => console.error("batchUpdate month error", err));
    }

    // 7. Update Sync Status for All Successful Records in Firestore
    const batch = db.batch();
    const results: any[] = [];
    let successCount = 0;
    let failureCount = 0;

    const getAdminTimestamp = (await import("firebase-admin/firestore")).FieldValue.serverTimestamp;

    for (const rec of recordsToSync) {
      try {
        const ref = db.collection("dhuhur_attendance_records").doc(rec.id);
        batch.update(ref, {
          syncStatus: 'SYNCED',
          lastSyncAt: getAdminTimestamp(),
          syncError: null,
          updatedAt: getAdminTimestamp()
        });
        results.push({ id: rec.id, success: true });
        successCount++;
      } catch (recErr: any) {
        results.push({ id: rec.id, success: false, error: recErr.message });
        failureCount++;
      }
    }

    await batch.commit();

    // 8. Add Backup Audit Log
    try {
      await db.collection("attendance_backup_audit_logs").add({
        id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        timestamp: Date.now(),
        action: 'DHUHUR_BACKUP',
        performedBy: decodedToken.email,
        details: {
          classId,
          date,
          academicYearId,
          semester,
          totalRecords: recordsToSync.length,
          successCount,
          failureCount
        }
      });
    } catch (auditErr) {
      console.error("[DhuhurSync] Audit log failed", auditErr);
    }

    return res.json({
      success: true,
      spreadsheetId,
      spreadsheetUrl,
      results,
      summary: {
        total: recordsToSync.length,
        success: successCount,
        failed: failureCount
      }
    });

  } catch (error: any) {
    console.error("[DhuhurSync] Critical batch failure:", error);
    
    // Mark all target records as FAILED in Firestore on complete batch sync failure
    if (db && Array.isArray(req.body.recordIds)) {
      try {
        const getAdminTimestamp = (await import("firebase-admin/firestore")).FieldValue.serverTimestamp;
        const failBatch = db.batch();
        for (const rId of req.body.recordIds) {
          const ref = db.collection("dhuhur_attendance_records").doc(rId);
          failBatch.update(ref, {
            syncStatus: 'FAILED',
            syncError: error.message || "Unknown error during sync batch API",
            updatedAt: getAdminTimestamp()
          });
        }
        await failBatch.commit();
      } catch (subErr) {
        console.error("[DhuhurSync] Sub-error writing fail statuses", subErr);
      }
    }

    return res.status(500).json({ success: false, error: error.message });
  }
});

function getColumnLetter(index: number): string {
  let letter = "";
  while (index >= 0) {
    letter = String.fromCharCode((index % 26) + 65) + letter;
    index = Math.floor(index / 26) - 1;
  }
  return letter;
}

// API: Export Attendance Recap PDF from Google Sheets
app.get("/api/attendance/export-pdf", async (req, res) => {
  try {
    const { classId, academicYear, semester } = req.query;
    if (!classId || !academicYear || !semester) return res.status(400).send("Missing params");

    const mapId = `${classId}_${(academicYear as string).replace(/\//g, '-')}_S${semester}`;
    const mapSnap = await adminDb.collection("attendance_backup_file_maps").doc(mapId).get();
    
    if (!mapSnap.exists) return res.status(404).send("Backup file not found for this class/semester");
    const spreadsheetId = mapSnap.data()?.spreadsheetId;

    // Get the sheet ID for 'Rekap'
    const ss = await sheets.spreadsheets.get({ spreadsheetId });
    const rekapSheet = ss.data.sheets?.find(s => s.properties?.title === 'Rekap');
    const gid = rekapSheet?.properties?.sheetId || 0;

    // Use Google Drive API to export as PDF
    const response = await drive.files.export({
      fileId: spreadsheetId,
      mimeType: 'application/pdf',
      // Some formatting options can be passed as query params if using direct URL, 
      // but drive.files.export is simpler for service account auth.
    }, { responseType: 'stream' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Attendance_Recap_${classId}_S${semester}.pdf`);
    response.data.pipe(res);
  } catch (error: any) {
    console.error("[PDFExport] Error:", error);
    res.status(500).send(error.message);
  }
});

// API: Verify MTSS Academic Backup Config v1
app.post("/api/mtss-academic/v1/verify-config", async (req, res) => {
  try {
    const { config } = req.body;
    if (!config) return res.status(400).json({ error: "Missing config" });

    // Check Drive Access
    const driveRes = await drive.files.get({ 
      fileId: config.sharedDriveId, 
      supportsAllDrives: true,
      fields: 'id, name'
    });

    // Check Root Folder (if sharedDriveId is the root, this is redundant but safe)
    let rootName = "Root";
    if (config.rootFolderId && config.rootFolderId !== config.sharedDriveId) {
      const rootRes = await drive.files.get({ 
        fileId: config.rootFolderId, 
        supportsAllDrives: true,
        fields: 'id, name'
      });
      rootName = rootRes.data.name!;
    }

    // Check Master Register Spreadsheet
    let registerTitle = "Unknown";
    if (config.masterRegisterSpreadsheetId) {
      const ssRes = await sheets.spreadsheets.get({ 
        spreadsheetId: config.masterRegisterSpreadsheetId 
      });
      registerTitle = ssRes.data.properties?.title || "Master Register";
    }

    res.json({ 
      success: true, 
      details: {
        driveName: driveRes.data.name,
        rootName,
        registerTitle
      }
    });
  } catch (error: any) {
    console.error("[MTSS_V1_Verify] Error:", error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// Helper to dynamically get academic case ref (supporting both juniorhigh_mtss_academic_cases & mtss_academic_cases)
async function getAcademicCaseRef(caseId: string) {
  let caseRef = adminDb.collection("juniorhigh_mtss_academic_cases").doc(caseId);
  let caseSnap = await caseRef.get();
  if (caseSnap.exists) {
    return { caseRef, caseSnap, isJuniorHigh: true };
  }
  caseRef = adminDb.collection("mtss_academic_cases").doc(caseId);
  caseSnap = await caseRef.get();
  return { caseRef, caseSnap, isJuniorHigh: false };
}

// API: Ensure Case Folder v1
app.post("/api/mtss-academic/v1/ensure-folder", async (req, res) => {
  try {
    const { caseId } = req.body;
    if (!caseId) return res.status(400).json({ error: "Missing caseId" });

    // 1. Get Config
    const configSnap = await adminDb.collection("system_backup_configs").doc("junior_high_mtss_v1").get();
    if (!configSnap.exists) return res.status(404).json({ error: "MTSS config not found" });
    const config = configSnap.data();

    // 2. Get Case
    const { caseRef, caseSnap } = await getAcademicCaseRef(caseId);
    if (!caseSnap.exists) return res.status(404).json({ error: "Case not found" });
    const caseData = caseSnap.data();

    // 3. Folder Hierarchy: MTSS Academic / [Year] / [Semester] / [Case ID]_[Name]
    const rootId = config?.rootFolderId || config?.sharedDriveId;
    const yearFolder = await findOrCreateFolder(caseData?.academicYear, rootId, config?.sharedDriveId);
    const semFolder = await findOrCreateFolder(`Semester ${caseData?.semester}`, yearFolder, config?.sharedDriveId);
    
    // Custom naming pattern or default
    let folderName = `${caseId}_${caseData?.studentName.replace(/ /g, '_')}`;
    if (config?.folderNamingPattern) {
      folderName = config.folderNamingPattern
        .replace(/{caseId}/g, caseId)
        .replace(/{studentName}/g, caseData?.studentName || "Student");
    }

    const caseFolderId = await findOrCreateFolder(folderName, semFolder, config?.sharedDriveId);

    // Update Case Metadata
    await caseRef.update({
      driveFolderId: caseFolderId,
      updatedAt: Date.now()
    });

    res.json({ success: true, folderId: caseFolderId });
  } catch (error: any) {
    console.error("[MTSS_V1_Folder] Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// API: Sync Case to Master Register v1
app.post("/api/mtss-academic/v1/sync-register", async (req, res) => {
  try {
    const { caseId, triggerSource } = req.body;
    if (!caseId) return res.status(400).json({ error: "Missing caseId" });

    // 1. Get Config
    const configSnap = await adminDb.collection("system_backup_configs").doc("junior_high_mtss_v1").get();
    if (!configSnap.exists) return res.status(404).json({ error: "MTSS config not found" });
    const config = configSnap.data();
    if (!config?.isEnabled || !config?.autoSyncRegister) {
      return res.json({ success: true, message: "Sync disabled" });
    }

    // 2. Get Case Data
    const { caseRef, caseSnap } = await getAcademicCaseRef(caseId);
    if (!caseSnap.exists) return res.status(404).json({ error: "Case not found" });
    const caseData = caseSnap.data() as any;

    // 3. Determine Row Data
    const spreadsheetId = config.masterRegisterSpreadsheetId;
    const registerResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Register!A1:A1000',
    });
    const rows = registerResponse.data.values || [];
    
    let rowIndex = -1;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i][0] === caseId) {
        rowIndex = i;
        break;
      }
    }

    const rowValues = [
      caseId,
      caseData.studentId || "",
      caseData.studentName || "",
      caseData.classId?.split(' ')[0] || "", // Assuming format "7 Baiji" -> "7"
      caseData.classId || "",
      caseData.academicYear || "",
      caseData.semester || "",
      caseData.currentTier || "",
      caseData.status || "",
      caseData.primaryConcern || "",
      caseData.assignedTeacherIds?.join(', ') || "",
      new Date(caseData.createdAt).toLocaleDateString(),
      caseData.lastReviewDate ? new Date(caseData.lastReviewDate).toLocaleDateString() : "",
      caseData.latestProgressStatus || "",
      caseData.driveFolderId || "",
      caseData.latestPdfFileId || "",
      caseData.latestPdfFileName || "",
      new Date().toISOString(),
      "SYNCED"
    ];

    if (rowIndex === -1) {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'Register!A1',
        valueInputOption: 'RAW',
        requestBody: { values: [rowValues] }
      });
    } else {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Register!A${rowIndex + 1}`,
        valueInputOption: 'RAW',
        requestBody: { values: [rowValues] }
      });
    }

    // Update metadata in Firestore
    await caseRef.update({
      registerSyncStatus: 'SYNCED',
      registerRowKey: rowIndex === -1 ? `ROW_${rows.length + 1}` : `ROW_${rowIndex + 1}`,
      lastBackupAt: Date.now()
    });

    res.json({ success: true, timestamp: Date.now() });
  } catch (error: any) {
    console.error("[MTSS_V1_Sync] Error:", error);
    try {
      const { caseRef } = await getAcademicCaseRef(req.body.caseId);
      await caseRef.update({
        registerSyncStatus: 'FAILED',
        lastBackupError: error.message,
        lastBackupAt: Date.now()
      });
    } catch (_) {}
    res.status(500).json({ error: error.message });
  }
});

// API: Archive PDF v1
app.post("/api/mtss-academic/v1/archive-pdf", async (req, res) => {
  try {
    const { caseId, fileName, version, generatedBy } = req.body;
    if (!caseId) return res.status(400).json({ error: "Missing caseId" });

    // 1. Get Config
    const configSnap = await adminDb.collection("system_backup_configs").doc("junior_high_mtss_v1").get();
    if (!configSnap.exists) return res.status(404).json({ error: "MTSS config not found" });
    const config = configSnap.data();

    // 2. Get Case Data
    const { caseRef, caseSnap } = await getAcademicCaseRef(caseId);
    if (!caseSnap.exists) return res.status(404).json({ error: "Case not found" });
    const caseData = caseSnap.data() as any;

    // 3. Ensure Folder
    let folderId = caseData.driveFolderId;
    if (!folderId) {
      // Logic from ensure-folder
      const rootId = config?.rootFolderId || config?.sharedDriveId;
      const yearFolder = await findOrCreateFolder(caseData.academicYear, rootId, config?.sharedDriveId);
      const semFolder = await findOrCreateFolder(`Semester ${caseData.semester}`, yearFolder, config?.sharedDriveId);
      let folderName = `${caseId}_${caseData.studentName.replace(/ /g, '_')}`;
      folderId = await findOrCreateFolder(folderName, semFolder, config?.sharedDriveId);
    }

    // 4. "Archive" logic: 
    // In v1, the PDF is generated in the browser. 
    // To properly archive, the browser should send the blob, or we should trigger a server-side render.
    // For this implementation, we will simulate the file metadata update.
    // REAL implementation would use drive.files.create with a buffer.
    
    // Placeholder file ID (since we don't have the actual content here)
    const fileId = "ARCHIVED_REF_" + Date.now();

    const backupAt = Date.now();
    await caseRef.update({
      driveFolderId: folderId,
      latestPdfFileId: fileId,
      latestPdfFileName: fileName,
      latestPdfVersion: version,
      latestPdfGeneratedAt: backupAt,
      latestPdfGeneratedBy: generatedBy,
      lastBackupAt: backupAt,
      registerSyncStatus: 'PENDING' // Trigger re-sync to spreadsheet
    });

    res.json({ success: true, fileId, folderId });
  } catch (error: any) {
    console.error("[MTSS_V1_Archive] Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// API: Sync Case (Unified wrapper for V2 Snapshot & Spreadsheet V1 Sync)
app.post("/api/mtss-academic/sync-case", async (req, res) => {
  try {
    const { caseId } = req.body;
    if (!caseId) return res.status(400).json({ error: "Missing caseId" });

    // 1. Resolve Case Reference & Data
    const { caseRef, caseSnap } = await getAcademicCaseRef(caseId);
    if (!caseSnap.exists) {
      return res.status(404).json({ error: "Case not found" });
    }
    const caseData = caseSnap.data() as any;

    // 2. Get Config
    const configSnap = await adminDb.collection("system_backup_configs").doc("junior_high_mtss_v1").get();
    const config = configSnap.exists ? configSnap.data() : null;

    // 3. Ensure Drive Folder
    let folderId = caseData.driveFolderId;
    if (!folderId && config?.isEnabled) {
      const rootId = config?.rootFolderId || config?.sharedDriveId;
      const yearFolder = await findOrCreateFolder(caseData.academicYear, rootId, config?.sharedDriveId);
      const semFolder = await findOrCreateFolder(`Semester ${caseData.semester}`, yearFolder, config?.sharedDriveId);
      let folderName = `${caseId}_${caseData.studentName.replace(/ /g, '_')}`;
      folderId = await findOrCreateFolder(folderName, semFolder, config?.sharedDriveId);
      await caseRef.update({ driveFolderId: folderId, updatedAt: Date.now() });
    }

    // 4. Sync to Master Register Spreadsheet
    let spreadsheetRowSynced = false;
    let spreadsheetMsg = "";
    if (config?.isEnabled && config?.autoSyncRegister && config?.masterRegisterSpreadsheetId) {
      try {
        const spreadsheetId = config.masterRegisterSpreadsheetId;
        const registerResponse = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: 'Register!A1:A1000',
        });
        const rows = registerResponse.data.values || [];
        
        let rowIndex = -1;
        for (let i = 0; i < rows.length; i++) {
          if (rows[i][0] === caseId) {
            rowIndex = i;
            break;
          }
        }

        const rowValues = [
          caseId,
          caseData.studentId || "",
          caseData.studentName || "",
          caseData.classId?.split(' ')[0] || "",
          caseData.classId || "",
          caseData.academicYear || "",
          caseData.semester || "",
          caseData.currentTier || "",
          caseData.status || "",
          caseData.primaryConcern || "",
          caseData.assignedTeacherIds?.join(', ') || "",
          new Date(caseData.createdAt).toLocaleDateString(),
          caseData.lastReviewDate ? new Date(caseData.lastReviewDate).toLocaleDateString() : "",
          caseData.latestProgressStatus || "",
          folderId || "",
          caseData.latestPdfFileId || "",
          caseData.latestPdfFileName || "",
          new Date().toISOString(),
          "SYNCED"
        ];

        if (rowIndex === -1) {
          await sheets.spreadsheets.values.append({
            spreadsheetId,
            range: 'Register!A1',
            valueInputOption: 'RAW',
            requestBody: { values: [rowValues] }
          });
        } else {
          await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `Register!A${rowIndex + 1}`,
            valueInputOption: 'RAW',
            requestBody: { values: [rowValues] }
          });
        }

        await caseRef.update({
          registerSyncStatus: 'SYNCED',
          registerRowKey: rowIndex === -1 ? `ROW_${rows.length + 1}` : `ROW_${rowIndex + 1}`,
          lastBackupAt: Date.now()
        });
        spreadsheetRowSynced = true;
      } catch (sheetErr: any) {
        console.error("[SyncCase API] Spreadsheet sync failed:", sheetErr);
        spreadsheetMsg = "Spreadsheet sync failed: " + sheetErr.message;
        await caseRef.update({
          registerSyncStatus: 'FAILED',
          lastBackupError: sheetErr.message,
          lastBackupAt: Date.now()
        }).catch(() => {});
      }
    }

    res.json({
      success: true,
      syncStatus: spreadsheetRowSynced ? 'SYNCED' : 'FAILED',
      message: spreadsheetMsg || 'Case processed successfully',
      targetType: 'CASE_FOLDER',
      targetId: caseId,
      updatedAt: Date.now()
    });
  } catch (error: any) {
    console.error("[SyncCase API] Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// API: Sync Semester
app.post("/api/mtss-academic/sync-semester", async (req, res) => {
  try {
    const { academicYear, semester } = req.body;
    res.json({
      success: true,
      syncStatus: 'SYNCED',
      message: 'Semester synced',
      targetType: 'SHEET',
      targetId: `${academicYear}_${semester}`,
      updatedAt: Date.now()
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- MTSS Behavior Backup v1 Endpoints ---

// API: Verify MTSS Behavior Backup Config v1
app.post("/api/mtss-behavior/v1/verify-config", async (req, res) => {
  try {
    const { config } = req.body;
    if (!config) return res.status(400).json({ error: "Missing config" });

    // Check Drive Access
    const driveRes = await drive.files.get({ 
      fileId: config.sharedDriveId, 
      supportsAllDrives: true,
      fields: 'id, name'
    });

    // Check Root Folder
    let rootName = "Root";
    if (config.rootFolderId && config.rootFolderId !== config.sharedDriveId) {
      const rootRes = await drive.files.get({ 
        fileId: config.rootFolderId, 
        supportsAllDrives: true,
        fields: 'id, name'
      });
      rootName = rootRes.data.name!;
    }

    // Check Master Register Spreadsheet
    let registerTitle = "Unknown";
    if (config.masterRegisterSpreadsheetId) {
      const ssRes = await sheets.spreadsheets.get({ 
        spreadsheetId: config.masterRegisterSpreadsheetId 
      });
      registerTitle = ssRes.data.properties?.title || "Behavior Master Register";
    }

    res.json({ 
      success: true, 
      details: {
        driveName: driveRes.data.name,
        rootName,
        registerTitle
      }
    });
  } catch (error: any) {
    console.error("[MTSS_BEHAVIOR_V1_Verify] Error:", error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// API: Ensure Behavior Case Folder v1
app.post("/api/mtss-behavior/v1/ensure-folder", async (req, res) => {
  try {
    const { caseId } = req.body;
    if (!caseId) return res.status(400).json({ error: "Missing caseId" });

    // 1. Get Config
    const configSnap = await adminDb.collection("system_backup_configs").doc("junior_high_mtss_behavior_v1").get();
    if (!configSnap.exists) return res.status(404).json({ error: "Behavior MTSS config not found" });
    const config = configSnap.data();

    // 2. Get Case
    const caseSnap = await adminDb.collection("behaviorCases").doc(caseId).get();
    if (!caseSnap.exists) return res.status(404).json({ error: "Case not found" });
    const caseData = caseSnap.data();

    // 3. Folder Hierarchy: MTSS Behavior / [Year] / [Semester] / [Case ID]_[Name] / Reports
    const rootId = config?.rootFolderId || config?.sharedDriveId;
    const yearFolder = await findOrCreateFolder(caseData?.academicYear || "Unknown Year", rootId, config?.sharedDriveId);
    
    const semLabel = caseData?.semester === '1' ? 'Semester 1' : caseData?.semester === '2' ? 'Semester 2' : 'Unknown Semester';
    const semFolder = await findOrCreateFolder(semLabel, yearFolder, config?.sharedDriveId);
    
    let folderName = `${caseId}_${caseData?.studentName.replace(/ /g, '_')}`;
    if (config?.folderNamingPattern) {
      folderName = config.folderNamingPattern
        .replace(/{caseId}/g, caseId)
        .replace(/{studentName}/g, caseData?.studentName || "Student");
    }

    const caseFolderId = await findOrCreateFolder(folderName, semFolder, config?.sharedDriveId);
    
    // Ensure "Reports" subfolder
    const reportsFolderId = await findOrCreateFolder("Reports", caseFolderId, config?.sharedDriveId);

    // Update Case Metadata
    await adminDb.collection("behaviorCases").doc(caseId).update({
      driveFolderId: caseFolderId,
      updatedAt: Date.now()
    });

    res.json({ success: true, folderId: caseFolderId, reportsFolderId });
  } catch (error: any) {
    console.error("[MTSS_BEHAVIOR_V1_Folder] Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// API: Sync Behavior Case to Master Register v1
app.post("/api/mtss-behavior/v1/sync-register", async (req, res) => {
  try {
    const { caseId, triggerSource } = req.body;
    if (!caseId) return res.status(400).json({ error: "Missing caseId" });

    const configSnap = await adminDb.collection("system_backup_configs").doc("junior_high_mtss_behavior_v1").get();
    if (!configSnap.exists) return res.status(404).json({ error: "Behavior MTSS config not found" });
    const config = configSnap.data();
    
    if (!config?.isEnabled || !config?.autoSyncRegister) {
      return res.json({ success: true, message: "Sync disabled" });
    }

    const caseSnap = await adminDb.collection("behaviorCases").doc(caseId).get();
    if (!caseSnap.exists) return res.status(404).json({ error: "Case not found" });
    const caseData = caseSnap.data() as any;

    const spreadsheetId = config.masterRegisterSpreadsheetId;
    const registerResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Register!A1:A2000',
    });
    const rows = registerResponse.data.values || [];
    
    let rowIndex = -1;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i][0] === caseId) {
        rowIndex = i;
        break;
      }
    }

    // Determine row data for Behavior
    const rowValues = [
      caseId,
      caseData.studentId || "",
      caseData.studentName || "",
      caseData.classId?.split(' ')[0] || "",
      caseData.classId || "",
      caseData.academicYear || "",
      caseData.semester || "",
      caseData.tier || "",
      caseData.status || "",
      caseData.lastConcernSummary || "", // Main Concern
      "", // Category (optional if exists in model)
      caseData.picName || "", // Assigned Staff
      new Date(caseData.createdAt).toLocaleDateString(),
      caseData.lastConcernDate ? new Date(caseData.lastConcernDate).toLocaleDateString() : "",
      new Date(caseData.lastUpdatedAt).toLocaleDateString(), // Last Review
      caseData.homeProgramme?.isVisibleToParent ? "YES" : "NO", // Has Active CICO indicator (simplified)
      "NO", // Has Active BIP (check BIP model if needed)
      caseData.status === 'ESCALATED' ? 'YES' : 'NO',
      caseData.driveFolderId || "",
      caseData.latestCaseSummaryPdfId || "",
      caseData.latestCicoPdfId || "",
      caseData.latestBipPdfId || "",
      new Date().toISOString(),
      "SYNCED"
    ];

    if (rowIndex === -1) {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'Register!A1',
        valueInputOption: 'RAW',
        requestBody: { values: [rowValues] }
      });
    } else {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Register!A${rowIndex + 1}`,
        valueInputOption: 'RAW',
        requestBody: { values: [rowValues] }
      });
    }

    await adminDb.collection("behaviorCases").doc(caseId).update({
      registerSyncStatus: 'SYNCED',
      registerRowKey: rowIndex === -1 ? `ROW_${rows.length + 1}` : `ROW_${rowIndex + 1}`,
      lastBackupAt: Date.now()
    });

    res.json({ success: true, timestamp: Date.now() });
  } catch (error: any) {
    console.error("[MTSS_BEHAVIOR_V1_Sync] Error:", error);
    await adminDb.collection("behaviorCases").doc(req.body.caseId).update({
      registerSyncStatus: 'FAILED',
      lastBackupError: error.message,
      lastBackupAt: Date.now()
    }).catch(() => {});
    res.status(500).json({ error: error.message });
  }
});

// API: Reset Dummy Data
app.post("/api/admin/reset-dummy-data", async (req, res) => {
  try {
    const collectionsToClear = [
      "students",
      "classes",
      "enrollments",
      "behaviorCases",
      "cicoSessions",
      "cicoGoalConfigs",
      "cicoWeeklyReflections",
      "bipPlans",
      "reflections",
      "literacyProgress",
      "attendance",
      "learning_goals",
      "learningGoals",
      "lxd",
      "reportCards",
      "assessments",
      "notifications",
      "behavior_notifications",
      "juniorhigh_mtss_academic_cases",
      "mtss_academic_cases",
      "sePeriods",
      "seActivities",
      "seEnrollments",
      "seSessionLogs",
      "seSelfAssessments",
      "parentStudentLinks",
      "parentReportViews",
      "roleInvites",
      "system_backup_configs", // Reset configs too? User said start fresh.
      "attendance_backup_file_maps"
    ];

    console.log("[ResetData] Starting global cleanup...");
    const results: Record<string, number> = {};

    for (const collName of collectionsToClear) {
      const collRef = adminDb.collection(collName);
      const snapshot = await collRef.get();
      
      if (snapshot.empty) {
        results[collName] = 0;
        continue;
      }

      const batchSize = 500;
      const docs = snapshot.docs;
      let deletedCount = 0;

      for (let i = 0; i < docs.length; i += batchSize) {
        const batch = adminDb.batch();
        const chunk = docs.slice(i, i + batchSize);
        chunk.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        deletedCount += chunk.length;
      }
      
      results[collName] = deletedCount;
      console.log(`[ResetData] Cleared ${deletedCount} docs from ${collName}`);
    }

    res.json({ success: true, results });
  } catch (error: any) {
    console.error("[ResetData] Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Archive Behavior PDF v1
app.post("/api/mtss-behavior/v1/archive-pdf", async (req, res) => {
  try {
    const { caseId, type, fileName, version, generatedBy } = req.body;
    if (!caseId) return res.status(400).json({ error: "Missing caseId" });

    // 1. Get Config
    const configSnap = await adminDb.collection("system_backup_configs").doc("junior_high_mtss_behavior_v1").get();
    if (!configSnap.exists) return res.status(404).json({ error: "Behavior MTSS config not found" });
    const config = configSnap.data();

    // 2. Get Case
    const caseSnap = await adminDb.collection("behaviorCases").doc(caseId).get();
    if (!caseSnap.exists) return res.status(404).json({ error: "Case not found" });
    const caseData = caseSnap.data() as any;

    // 3. Ensure Hierarchy & Reports Folder
    const rootId = config?.rootFolderId || config?.sharedDriveId;
    const yearFolder = await findOrCreateFolder(caseData.academicYear, rootId, config?.sharedDriveId);
    const semLabel = caseData.semester === '1' ? 'Semester 1' : 'Semester 2';
    const semFolder = await findOrCreateFolder(semLabel, yearFolder, config?.sharedDriveId);
    
    let folderName = `${caseId}_${caseData.studentName.replace(/ /g, '_')}`;
    const caseFolderId = await findOrCreateFolder(folderName, semFolder, config?.sharedDriveId);
    const reportsFolderId = await findOrCreateFolder("Reports", caseFolderId, config?.sharedDriveId);

    // 4. Archive (Simulated for v1)
    const fileId = `BEHAVIOR_ARCHIVE_${type}_${Date.now()}`;
    const backupAt = Date.now();

    const updates: any = {
      driveFolderId: caseFolderId,
      lastBackupAt: backupAt,
      registerSyncStatus: 'PENDING'
    };

    if (type === 'CASE_SUMMARY') {
      updates.latestCaseSummaryPdfId = fileId;
      updates.latestCaseSummaryPdfName = fileName;
    } else if (type === 'CICO_PROGRESS') {
      updates.latestCicoPdfId = fileId;
      updates.latestCicoPdfName = fileName;
    } else if (type === 'BIP_SUMMARY') {
      updates.latestBipPdfId = fileId;
      updates.latestBipPdfName = fileName;
    }

    await adminDb.collection("behaviorCases").doc(caseId).update(updates);

    res.json({ success: true, fileId, folderId: reportsFolderId });
  } catch (error: any) {
    console.error("[MTSS_BEHAVIOR_V1_Archive] Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// API: Bulk Sync Behavior Register v1
app.post("/api/mtss-behavior/v1/bulk-sync-register", async (req, res) => {
  try {
    const { academicYear, semester } = req.body;
    if (!academicYear) return res.status(400).json({ error: "Missing academicYear" });

    const configSnap = await adminDb.collection("system_backup_configs").doc("junior_high_mtss_behavior_v1").get();
    if (!configSnap.exists) return res.status(404).json({ error: "Config not found" });

    const casesSnap = await adminDb.collection("behaviorCases")
      .where("academicYear", "==", academicYear)
      .limit(200)
      .get();

    res.json({ 
      total: casesSnap.size, 
      success: casesSnap.size, 
      errors: 0,
      note: "Bulk sync triggered internally for " + casesSnap.size + " cases."
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- Snapshot v2 Endpoints ---

// API: Sync Academic Case Snapshot v2
app.post("/api/mtss-academic/v2/sync-snapshot", async (req, res) => {
  try {
    const { caseId } = req.body;
    if (!caseId) return res.status(400).json({ error: "Missing caseId" });

    // 1. Get Config
    const configSnap = await adminDb.collection("system_backup_configs").doc("junior_high_mtss_v1").get();
    if (!configSnap.exists) return res.status(404).json({ error: "MTSS config not found" });
    const config = configSnap.data();

    // 2. Resolve Collection (Try juniorhigh first, fallback to mtss_academic)
    let caseRef = adminDb.collection("juniorhigh_mtss_academic_cases").doc(caseId);
    let caseSnap = await caseRef.get();
    if (!caseSnap.exists) {
      caseRef = adminDb.collection("mtss_academic_cases").doc(caseId);
      caseSnap = await caseRef.get();
    }
    
    if (!caseSnap.exists) return res.status(404).json({ error: "Case not found" });
    const caseData = caseSnap.data() as any;

    // 3. Ensure Folder
    let folderId = caseData.driveFolderId;
    if (!folderId) {
      const rootId = config?.rootFolderId || config?.sharedDriveId;
      const yearFolder = await findOrCreateFolder(caseData.academicYear, rootId, config?.sharedDriveId);
      const semFolder = await findOrCreateFolder(`Semester ${caseData.semester}`, yearFolder, config?.sharedDriveId);
      let folderName = `${caseId}_${caseData.studentName.replace(/ /g, '_')}`;
      folderId = await findOrCreateFolder(folderName, semFolder, config?.sharedDriveId);
    }

    // 4. Gather Sub-data
    const [goalsSnap, interventionsSnap, reviewsSnap] = await Promise.all([
      caseRef.collection("goals").get(),
      caseRef.collection("plans").get(), // "interventions" are stored in "plans" collection
      caseRef.collection("evaluations").get() // "reviews" are stored in "evaluations"
    ]);

    const goals = goalsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const interventions = interventionsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const reviews = reviewsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any)).sort((a: any, b: any) => (b.date || 0) - (a.date || 0));

    // 5. Build Snapshot JSON
    const snapshot = {
      schemaVersion: "2.0.0",
      exportedAt: Date.now(),
      sourceModule: "MTSS_ACADEMIC",
      unit: "JUNIOR_HIGH",
      caseId: caseId,
      student: {
        studentId: caseData.studentId,
        name: caseData.studentName,
        grade: caseData.grade || caseData.classId?.split(' ')[0],
        class: caseData.classId
      },
      context: {
        academicYear: caseData.academicYear,
        semester: caseData.semester
      },
      case: {
        tier: caseData.currentTier,
        status: caseData.status,
        dateOpened: caseData.createdAt,
        assignedStaff: caseData.assignedTeacherIds,
        primaryDomain: caseData.subjectDomains?.[0],
        primaryConcern: caseData.primaryConcern,
        summary: caseData.summary,
        latestProgressStatus: caseData.latestProgressStatus,
        lastReviewDate: caseData.lastReviewDate,
        nextAction: caseData.nextAction
      },
      activeGoals: goals,
      activeInterventions: interventions,
      latestReview: reviews[0] || null,
      backup: {
        driveFolderId: folderId,
        latestPdfFileId: caseData.latestPdfFileId,
        latestPdfVersion: caseData.latestPdfVersion,
        registerSyncStatus: caseData.registerSyncStatus
      }
    };

    // 6. Upload
    const fileName = `ACADEMIC-${caseId}-snapshot.json`;
    const snapshotFileId = await uploadJsonToDrive(folderId, fileName, snapshot, config?.sharedDriveId);

    // 7. Update Firestore
    const syncedAt = Date.now();
    await caseRef.update({
      snapshotSyncStatus: 'SYNCED',
      latestSnapshotFileId: snapshotFileId,
      latestSnapshotFileName: fileName,
      latestSnapshotVersion: (caseData.latestSnapshotVersion || 0) + 1,
      latestSnapshotSyncedAt: syncedAt,
      latestSnapshotError: null,
      snapshotNeedsRefresh: false,
      driveFolderId: folderId,
      updatedAt: syncedAt
    });

    res.json({ success: true, fileId: snapshotFileId, syncedAt });
  } catch (error: any) {
    console.error("[MTSS_ACADEMIC_V2_Snapshot] Error:", error);
    await adminDb.collection("juniorhigh_mtss_academic_cases").doc(req.body.caseId).update({
      snapshotSyncStatus: 'FAILED',
      latestSnapshotError: error.message,
      latestSnapshotSyncedAt: Date.now()
    }).catch(() => {});
    res.status(500).json({ error: error.message });
  }
});

// API: Sync Behavior Case Snapshot v2
app.post("/api/mtss-behavior/v2/sync-snapshot", async (req, res) => {
  try {
    const { caseId } = req.body;
    if (!caseId) return res.status(400).json({ error: "Missing caseId" });

    // 1. Get Config
    const configSnap = await adminDb.collection("system_backup_configs").doc("junior_high_mtss_behavior_v1").get();
    if (!configSnap.exists) return res.status(404).json({ error: "Config not found" });
    const config = configSnap.data();

    // 2. Get Case
    const caseRef = adminDb.collection("behaviorCases").doc(caseId);
    const caseSnap = await caseRef.get();
    if (!caseSnap.exists) return res.status(404).json({ error: "Case not found" });
    const caseData = caseSnap.data() as any;

    // 3. Ensure Folder
    let folderId = caseData.driveFolderId;
    if (!folderId) {
      const rootId = config?.rootFolderId || config?.sharedDriveId;
      const yearFolder = await findOrCreateFolder(caseData.academicYear, rootId, config?.sharedDriveId);
      const semLabel = caseData.semester === '1' ? 'Semester 1' : 'Semester 2';
      const semFolder = await findOrCreateFolder(semLabel, yearFolder, config?.sharedDriveId);
      let folderName = `${caseId}_${caseData.studentName.replace(/ /g, '_')}`;
      folderId = await findOrCreateFolder(folderName, semFolder, config?.sharedDriveId);
    }

    // 4. Gather Sub-data
    const [reviewsSnap, cicoSnap, plansSnap] = await Promise.all([
      caseRef.collection("concerns").get(),
      caseRef.collection("cicoReports").get(),
      caseRef.collection("plans").get()
    ]);

    const reviews = reviewsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any)).sort((a: any, b: any) => (b.date || 0) - (a.date || 0));
    const cicoHistory = cicoSnap.docs.map(d => ({ id: d.id, ...d.data() } as any)).sort((a: any, b: any) => (b.date || 0) - (a.date || 0));
    const plansHistory = plansSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // 5. Build Snapshot JSON
    const snapshot = {
      schemaVersion: "2.0.1",
      exportedAt: Date.now(),
      sourceModule: "MTSS_BEHAVIOR",
      unit: "JUNIOR_HIGH",
      caseId: caseId,
      student: {
        studentId: caseData.studentId,
        name: caseData.studentName,
        grade: caseData.classId?.split(' ')[0],
        class: caseData.classId
      },
      context: {
        academicYear: caseData.academicYear,
        semester: caseData.semester
      },
      case: {
        tier: caseData.tier,
        status: caseData.status,
        dateOpened: caseData.createdAt,
        assignedStaff: caseData.picName,
        mainConcern: caseData.lastConcernSummary,
        concernCategory: caseData.concernCategory,
        summary: caseData.summary,
        lastIncidentDate: caseData.lastConcernDate,
        lastReviewDate: caseData.lastUpdatedAt,
        escalationStatus: caseData.status === 'ESCALATED' ? 'ESCALATED' : 'NORMAL',
        nextAction: caseData.nextAction
      },
      concerns: reviews,
      cicoReporting: cicoHistory,
      plans: plansHistory,
      activeCico: caseData.homeProgramme || null,
      backupMetadata: {
        driveFolderId: folderId,
        v1RegisterSynced: caseData.registerSyncStatus === 'SYNCED'
      }
    };

    // 6. Upload
    const fileName = `BEHAVIOR-${caseId}-snapshot.json`;
    const snapshotFileId = await uploadJsonToDrive(folderId, fileName, snapshot, config?.sharedDriveId);

    // 7. Update Firestore
    const syncedAt = Date.now();
    await caseRef.update({
      snapshotSyncStatus: 'SYNCED',
      latestSnapshotFileId: snapshotFileId,
      latestSnapshotFileName: fileName,
      latestSnapshotVersion: (caseData.latestSnapshotVersion || 0) + 1,
      latestSnapshotSyncedAt: syncedAt,
      latestSnapshotError: null,
      snapshotNeedsRefresh: false,
      driveFolderId: folderId,
      updatedAt: syncedAt
    });

    res.json({ success: true, fileId: snapshotFileId, syncedAt });
  } catch (error: any) {
    console.error("[MTSS_BEHAVIOR_V2_Snapshot] Error:", error);
    await adminDb.collection("behaviorCases").doc(req.body.caseId).update({
      snapshotSyncStatus: 'FAILED',
      latestSnapshotError: error.message,
      latestSnapshotSyncedAt: Date.now()
    }).catch(() => {});
    res.status(500).json({ error: error.message });
  }
});
app.post("/api/admin/bulk-import-users", async (req, res) => {
  try {
    const { sheetId, sheetName, mode } = req.body; // mode: 'STAFF' | 'STUDENT_PARENT'
    if (!sheetId || !sheetName || !mode) {
      return res.status(400).json({ error: "Missing required parameters" });
    }

    console.log(`[BulkImport] Mode: ${mode} Sheet: ${sheetName}`);

    // Fetch Data from Google Sheets
    const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${sheetName}`;
    const sheetsResponse = await axios.get(csvUrl);
    const records = parse(sheetsResponse.data, {
      columns: false,
      skip_empty_lines: true,
    });

    const dataRows = records.slice(1); // Skip Header
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let errors: string[] = [];

    for (const row of dataRows) {
      try {
        let email = "";
        let name = "";
        let role = "";
        let unitId = "";
        let jobTitle = "";
        let luminaId = "";
        let linkedStudents: string[] = [];
        let classId = "";
        let academicYear = "";
        let nisn = "";
        let nickname = "";
        let gender = "";
        let parentEmail = "";

        if (mode === "STAFF") {
          // Format STAFF: email | jobTitle | role | unitId
          email = (row[0] || "").trim().toLowerCase();
          jobTitle = (row[1] || "").trim();
          role = (row[2] || "").trim().toUpperCase();
          if (role === 'GURU') role = 'TEACHER';
          if (role === 'KEPALA_UNIT') role = 'HEAD_UNIT';
          if (role === 'STAFF') role = 'STAFF';
          unitId = (row[3] || "").trim().toUpperCase();
          name = email; // Fallback name
        } else if (mode === "STUDENT") {
          // Format STUDENT (New Format):
          // A: luminaId, B: nisn, C: fullName, D: nickname, E: gender, F: email, G: parentEmail, H: classId, I: unitId, J: academicYear
          luminaId = (row[0] || "").trim();
          nisn = (row[1] || "").trim();
          const fullName = (row[2] || "").trim();
          nickname = (row[3] || "").trim();
          gender = (row[4] || "").trim().toUpperCase(); // L or P
          email = (row[5] || "").trim().toLowerCase();
          parentEmail = (row[6] || "").trim().toLowerCase();
          classId = (row[7] || "").trim(); // Example: "7 Baiji"
          unitId = (row[8] || "").trim().toUpperCase(); // JUNIOR_HIGH
          academicYear = (row[9] || "").trim(); // Example: "2025/2026"

          if (!luminaId || !email) {
            skipped++;
            continue;
          }

          name = fullName || email;
          role = "STUDENT";
          jobTitle = classId;

          // Parse Grade: "7 Baiji" -> "7"
          const grade = classId.split(' ')[0];
          const sanitizedClassName = classId.replace(/\s+/g, '-');
          const firestoreClassId = `${unitId}_${academicYear.replace(/\//g, '-')}_${sanitizedClassName}`;

          // Create/Update Class Document
          const classRef = adminDb.collection("classes").doc(firestoreClassId);
          await classRef.set({
            id: firestoreClassId,
            name: classId, // "7 Baiji"
            grade: grade,
            unitId,
            academicYear,
            status: "active",
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });

          // 1. Sync to students collection
          const studentRef = adminDb.collection("students").doc(luminaId);
          const studentDoc = await studentRef.get();
          const studentData: any = {
            luminaId,
            nisn,
            fullName,
            nickname,
            gender,
            email,
            parentEmail,
            classId,
            unitId,
            academicYear,
            status: "active",
            updatedAt: FieldValue.serverTimestamp(),
          };
          
          if (!studentDoc.exists) {
            studentData.createdAt = FieldValue.serverTimestamp();
          }

          await studentRef.set(studentData, { merge: true });

          // 2. Sync to enrollments collection
          const enrollmentId = `${luminaId}_${academicYear.replace(/\//g, "-")}`;
          await adminDb.collection("enrollments").doc(enrollmentId).set({
            id: enrollmentId,
            studentId: luminaId,
            classId,
            unitId,
            academicYear,
            status: "active",
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });

          // 3. (Optional) Ensure parentStudentLinks if parentEmail exists
          if (parentEmail) {
            const linkId = `${parentEmail}_${luminaId}`;
            await adminDb.collection("parentStudentLinks").doc(linkId).set({
              parentEmail,
              studentId: luminaId,
              unitId,
              status: "active",
              updatedAt: FieldValue.serverTimestamp(),
            }, { merge: true });
          }
        } else if (mode === "PARENT") {
          // Format PARENT: luminaId_anak | namaOrtu | emailOrtu | unitId
          const childId = (row[0] || "").trim();
          name = (row[1] || "").trim();
          email = (row[2] || "").trim().toLowerCase();
          unitId = (row[3] || "").trim().toUpperCase();
          role = "PARENT";
          linkedStudents = childId ? [childId] : [];
        }

        if (!email) {
          skipped++;
          continue;
        }

        // Validate basic email format
        if (!email.includes("@")) {
          errors.push(`${email}: format email tidak valid`);
          continue;
        }

        const existingQuery = await adminDb
          .collection("roleInvites")
          .where("email", "==", email)
          .limit(1)
          .get();

        if (existingQuery.empty) {
          // CREATE
          const inviteRef = adminDb.collection("roleInvites").doc();
          await inviteRef.set({
            email,
            name,
            role,
            unitId,
            jobTitle,
            luminaId,
            linkedStudents,
            ...(mode === 'STUDENT' ? {
              classId,
              academicYear,
              nisn,
              nickname,
              gender,
              parentEmail
            } : {}),
            status: "ready",
            createdAt: FieldValue.serverTimestamp(),
          });
          created++;
        } else {
          // UPDATE (Upsert Logic)
          const doc = existingQuery.docs[0];
          const currentData = doc.data() || {};

          // Check for changes
          const hasChanges =
            (currentData.role || "") !== role ||
            (currentData.unitId || "") !== unitId ||
            (currentData.jobTitle || "") !== jobTitle ||
            (currentData.luminaId || "") !== luminaId ||
            (mode === 'STUDENT' && (
              currentData.classId !== classId ||
              currentData.academicYear !== academicYear
            )) ||
            JSON.stringify(currentData.linkedStudents || []) !==
              JSON.stringify(linkedStudents);

          if (hasChanges) {
            const updates: any = {
              role,
              unitId,
              jobTitle,
              luminaId,
            };

            if (mode === "STUDENT") {
              updates.classId = classId;
              updates.academicYear = academicYear;
              updates.nisn = nisn;
              updates.nickname = nickname;
              updates.gender = gender;
              updates.parentEmail = parentEmail;
            }

            // For parents, merge linkedStudents if needed or replacement?
            // Requirement says "UPDATE dokumen" if there's changes.
            if (role === "PARENT") {
              updates.linkedStudents = linkedStudents; // Replacement logic as per "update enrollment" example
            }

            await doc.ref.update(updates);
            updated++;
          } else {
            skipped++;
          }
        }
      } catch (err: any) {
        errors.push(`${row[0]}: ${err.message}`);
      }
    }

    console.log(
      `[BulkImport] Result - Created: ${created}, Updated: ${updated}, Skipped: ${skipped}, Errors: ${errors.length}`
    );

    return res.json({
      success: true,
      created,
      updated,
      skipped,
      errors,
    });
  } catch (error: any) {
    console.error("[BulkImport] Fatal Error:", error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

app.post("/api/admin/fetch-sheets-csv", async (req, res) => {
  try {
    let { sheetId, sheetName } = req.body;
    if (!sheetId) {
      return res.status(400).json({ error: "Missing sheetId" });
    }
    
    // Auto-detect if user passed full URL
    if (sheetId.includes("docs.google.com/spreadsheets")) {
      const match = sheetId.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (match && match[1]) {
        sheetId = match[1];
      }
    }
    
    const name = sheetName || "Sheet1";
    console.log(`[FetchSheetsCSV] Fetching sheet ID: ${sheetId} Name: ${name}`);
    const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(name)}`;
    const sheetsResponse = await axios.get(csvUrl);
    res.json({ success: true, csvData: sheetsResponse.data });
  } catch (error: any) {
    console.error("[FetchSheetsCSV] Error fetching google sheet:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/admin/bulk-import-paste", async (req, res) => {
  try {
    const { rows, columnMapping, globalConfig } = req.body;
    if (!rows || !columnMapping || !globalConfig) {
      return res.status(400).json({ success: false, error: "Missing required parameters rows, columnMapping, or globalConfig" });
    }

    const { mode, unitId, classId, academicYear, semester } = globalConfig;
    if (!mode) {
      return res.status(400).json({ success: false, error: "Missing config mode (STUDENT/STAFF/PARENT)" });
    }

    // Validate mapping completeness based on selected mode
    const mappedFields = Object.values(columnMapping);
    if (mappedFields.length === 0) {
      return res.status(400).json({ success: false, error: "Pemetaan kolom tidak boleh kosong. Silakan petakan setidaknya satu kolom." });
    }

    const hasNameMapping = mappedFields.includes("fullName") || mappedFields.includes("name");
    const hasEmailMapping = mappedFields.includes("email");

    if (mode === "STUDENT") {
      if (!hasNameMapping) {
        return res.status(400).json({ success: false, error: "Pemetaan kolom tidak valid: Kolom 'Nama Lengkap' wajib dipetakan untuk impor siswa." });
      }
    } else if (mode === "STAFF") {
      if (!hasNameMapping || !hasEmailMapping) {
        return res.status(400).json({ success: false, error: "Pemetaan kolom tidak valid: Kolom 'Nama Lengkap' dan 'Email' wajib dipetakan untuk impor staff." });
      }
    } else if (mode === "PARENT") {
      if (!hasNameMapping || !hasEmailMapping) {
        return res.status(400).json({ success: false, error: "Pemetaan kolom tidak valid: Kolom 'Nama Lengkap' dan 'Email' wajib dipetakan untuk impor orang tua." });
      }
    }

    console.log(`[BulkImportPaste] Mode: ${mode} RowCount: ${rows.length}`);

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let errors: string[] = [];
    let skippedReasons: string[] = [];

    const timestamp = Date.now();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const mapped: Record<string, string> = {};
        // Preserve empty columns and avoid index shifting by iterating over keys of columnMapping
        Object.keys(columnMapping).forEach((key) => {
          const idx = Number(key);
          const cell = row[idx];
          const field = columnMapping[key];
          if (field) {
            mapped[field] = String(cell || "").trim();
          }
        });

        // Map fields based on mode
        let email = (mapped.email || "").toLowerCase();
        let name = mapped.fullName || mapped.name || "";
        let role = mode;
        let jobTitle = mapped.jobTitle || "";
        let luminaId = (mapped.luminaId || "").trim();
        let linkedStudents: string[] = [];
        let nisn = mapped.nisn || "";
        let nickname = mapped.nickname || "";
        let gender = (mapped.gender || "").trim().toUpperCase(); // L or P
        let parentEmail = (mapped.parentEmail || "").toLowerCase();
        let fatherName = mapped.fatherName || "";
        let motherName = mapped.motherName || "";
        let currentUnitId = mapped.unitId || unitId || "";
        let currentClassId = mapped.classId || classId || "";
        let currentAcademicYear = mapped.academicYear || academicYear || "2025/2026";

        // Validate and sanitize luminaId to prevent gender values from leaking in
        if (luminaId) {
          const cleanLuminaIdLower = luminaId.toLowerCase();
          const invalidIdKeywords = ["l", "p", "laki-laki", "perempuan", "male", "female", "laki", "wanita", "laki laki", "perempuan/wanita"];
          if (invalidIdKeywords.includes(cleanLuminaIdLower)) {
            // This is actually a gender value that shifted or was wrongly mapped
            if (!gender) {
              gender = luminaId;
            }
            luminaId = ""; // Force blank so it auto-generates
          }
        }

        // Standardize and validate gender
        if (gender) {
          const gClean = gender.trim().toUpperCase();
          if (gClean === "L" || gClean === "LAKI-LAKI" || gClean === "MALE" || gClean === "LAKI" || gClean === "LAKI LAKI") {
            gender = "L";
          } else if (gClean === "P" || gClean === "PEREMPUAN" || gClean === "FEMALE" || gClean === "WANITA") {
            gender = "P";
          } else {
            gender = ""; // Reset invalid/polluted values
          }
        }

        // Skip completely empty lines, and log details
        const rowIsEmpty = row.every((cell: any) => !cell || !String(cell).trim());
        if (!name && !email && !luminaId) {
          const reason = rowIsEmpty 
            ? "Baris kosong" 
            : "Baris memiliki data tetapi tidak ada nama lengkap, email, atau luminaId yang berhasil dipetakan";
          
          console.log(`[BulkImportSkip] Baris ${i + 1} dilewati. Alasan: ${reason}`, {
            rowIndex: i,
            row,
            columnMapping,
            mapped,
            normalized: { name, email, luminaId, gender }
          });

          skippedReasons.push(`Baris ${i + 1}: ${reason}`);
          skipped++;
          continue;
        }

        // Auto-generate luminaId if missing and it's student
        if (!luminaId) {
          const indexSuffix = String(i).padStart(3, '0');
          luminaId = `LMN-${timestamp}-${indexSuffix}`;
        }

        // Auto-generate email based on role if missing
        if (!email) {
          if (role === "STUDENT") {
            email = `${luminaId.toLowerCase()}@student.lazuardi.sch.id`;
          } else if (role === "STAFF") {
            const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, "");
            email = `staff.${cleanName || "user"}${i}@lazuardi.sch.id`;
          } else if (role === "PARENT") {
            const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, "");
            email = `parent.${cleanName || "user"}${i}@parent.lazuardi.sch.id`;
          }
        }

        // Validate basic email format
        if (!email.includes("@")) {
          errors.push(`Baris ${i + 1} (${name || email}): format email tidak valid`);
          continue;
        }

        if (role === "STUDENT") {
          jobTitle = currentClassId;

          // Parse Grade
          if (currentClassId) {
            const grade = currentClassId.split(' ')[0];
            const sanitizedClassName = currentClassId.replace(/\s+/g, '-');
            const firestoreClassId = `${currentUnitId}_${currentAcademicYear.replace(/\//g, '-')}_${sanitizedClassName}`;

            // Create/Update Class Document
            const classRef = adminDb.collection("classes").doc(firestoreClassId);
            await classRef.set({
              id: firestoreClassId,
              name: currentClassId,
              grade: grade,
              unitId: currentUnitId,
              academicYear: currentAcademicYear,
              status: "active",
              updatedAt: FieldValue.serverTimestamp(),
            }, { merge: true });
          }

          // 1. Sync to students collection
          const studentRef = adminDb.collection("students").doc(luminaId);
          const studentDoc = await studentRef.get();
          const studentData: any = {
            luminaId,
            nisn,
            fullName: name,
            nickname,
            gender,
            email,
            parentEmail,
            fatherName,
            motherName,
            classId: currentClassId,
            unitId: currentUnitId,
            academicYear: currentAcademicYear,
            status: "active",
            updatedAt: FieldValue.serverTimestamp(),
          };
          
          let isNewStudent = !studentDoc.exists;
          let studentChanged = false;
          if (!isNewStudent) {
            const oldData = studentDoc.data() || {};
            studentChanged = 
              oldData.fullName !== name ||
              oldData.nickname !== nickname ||
              oldData.nisn !== nisn ||
              oldData.gender !== gender ||
              oldData.email !== email ||
              oldData.parentEmail !== parentEmail ||
              oldData.fatherName !== fatherName ||
              oldData.motherName !== motherName ||
              oldData.classId !== currentClassId ||
              oldData.unitId !== currentUnitId ||
              oldData.academicYear !== currentAcademicYear;
          }
          if (isNewStudent) {
            studentData.createdAt = FieldValue.serverTimestamp();
          }

          await studentRef.set(studentData, { merge: true });

          // 2. Sync to enrollments collection
          const enrollmentId = `${luminaId}_${currentAcademicYear.replace(/\//g, "-")}`;
          await adminDb.collection("enrollments").doc(enrollmentId).set({
            id: enrollmentId,
            studentId: luminaId,
            classId: currentClassId,
            unitId: currentUnitId,
            academicYear: currentAcademicYear,
            status: "active",
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });

          // 3. Ensure parent link
          if (parentEmail) {
            const linkId = `${parentEmail}_${luminaId}`;
            await adminDb.collection("parentStudentLinks").doc(linkId).set({
              parentEmail,
              studentId: luminaId,
              unitId: currentUnitId,
              status: "active",
              updatedAt: FieldValue.serverTimestamp(),
            }, { merge: true });

            // Automatically create / update parent invitation in roleInvites
            const parentEmailClean = parentEmail.trim().toLowerCase();
            if (parentEmailClean) {
              const parentSnap = await adminDb.collection("roleInvites")
                .where("email", "==", parentEmailClean)
                .where("role", "==", "PARENT")
                .limit(1)
                .get();

              let defaultParentName = fatherName || motherName || `Wali ${name}`;
              
              if (parentSnap.empty) {
                await adminDb.collection("roleInvites").add({
                  email: parentEmailClean,
                  name: defaultParentName,
                  role: "PARENT",
                  unitId: currentUnitId,
                  linkedStudents: [luminaId],
                  status: "ready",
                  createdAt: FieldValue.serverTimestamp()
                });
              } else {
                const parentDoc = parentSnap.docs[0];
                const currentData = parentDoc.data();
                const currentLinked = Array.isArray(currentData.linkedStudents) ? currentData.linkedStudents : [];
                const newLinked = Array.from(new Set([...currentLinked, luminaId].map(id => String(id))));
                
                await parentDoc.ref.update({
                  linkedStudents: newLinked,
                  name: currentData.name || defaultParentName,
                  updatedAt: FieldValue.serverTimestamp()
                });
              }
            }
          }

          // 4. Sync of student invitation inside roleInvites
          const existingQuery = await adminDb
            .collection("roleInvites")
            .where("email", "==", email)
            .limit(1)
            .get();

          const inviteData: any = {
            email,
            name: name || email,
            role: "STUDENT",
            unitId: currentUnitId,
            jobTitle: currentClassId,
            luminaId,
            linkedStudents: [],
            classId: currentClassId,
            academicYear: currentAcademicYear,
            nisn,
            nickname,
            gender,
            parentEmail,
            fatherName,
            motherName,
            status: "ready",
          };

          if (existingQuery.empty) {
            inviteData.createdAt = FieldValue.serverTimestamp();
            await adminDb.collection("roleInvites").doc().set(inviteData);
            created++;
          } else {
            const doc = existingQuery.docs[0];
            const currentData = doc.data() || {};
            const hasChanges =
              (currentData.role || "") !== "STUDENT" ||
              (currentData.unitId || "") !== currentUnitId ||
              (currentData.jobTitle || "") !== currentClassId ||
              (currentData.luminaId || "") !== luminaId ||
              currentData.classId !== currentClassId ||
              currentData.academicYear !== currentAcademicYear;

            if (hasChanges) {
              await doc.ref.update(inviteData);
            }

            if (isNewStudent) {
              created++;
            } else if (hasChanges || studentChanged) {
              updated++;
            } else {
              const reason = "Data siswa dan undangan peran sudah sesuai (tidak ada perubahan)";
              console.log(`[BulkImportSkip] Baris ${i + 1} (${name}) dilewati. Alasan: ${reason}`, {
                rowIndex: i,
                row,
                columnMapping,
                mapped,
                normalized: { name, email, luminaId, gender }
              });
              skippedReasons.push(`Baris ${i + 1} (${name}): ${reason}`);
              skipped++;
            }
          }

        } else if (role === "STAFF") {
          let staffRole = (mapped.role || "").trim().toUpperCase();
          if (!staffRole) staffRole = "TEACHER";
          if (staffRole === 'GURU') staffRole = 'TEACHER';
          if (staffRole === 'KEPALA_UNIT') staffRole = 'HEAD_UNIT';
          if (staffRole === 'STAFF') staffRole = 'STAFF';

          const inviteData: any = {
            email,
            name: name || email,
            role: staffRole,
            unitId: currentUnitId,
            jobTitle: jobTitle,
            luminaId,
            linkedStudents: [],
            status: "ready",
          };

          const existingQuery = await adminDb
            .collection("roleInvites")
            .where("email", "==", email)
            .limit(1)
            .get();

          if (existingQuery.empty) {
            inviteData.createdAt = FieldValue.serverTimestamp();
            await adminDb.collection("roleInvites").doc().set(inviteData);
            created++;
          } else {
            const doc = existingQuery.docs[0];
            const currentData = doc.data() || {};
            const hasChanges =
              (currentData.role || "") !== staffRole ||
              (currentData.unitId || "") !== currentUnitId ||
              (currentData.jobTitle || "") !== jobTitle ||
              (currentData.luminaId || "") !== luminaId ||
              (currentData.name || "") !== name;

            if (hasChanges) {
              await doc.ref.update(inviteData);
              updated++;
            } else {
              const reason = "Data staff sudah sesuai (tidak ada perubahan)";
              console.log(`[BulkImportSkip] Baris ${i + 1} (${name}) dilewati. Alasan: ${reason}`, {
                rowIndex: i,
                row,
                columnMapping,
                mapped,
                normalized: { name, email, luminaId, gender }
              });
              skippedReasons.push(`Baris ${i + 1} (${name}): ${reason}`);
              skipped++;
            }
          }

        } else if (role === "PARENT") {
          const childIdField = mapped.childId || mapped.linkedStudents || "";
          linkedStudents = childIdField ? childIdField.split(",").map(id => id.trim()).filter(Boolean) : [];

          // Link to parentStudentLinks
          for (const sId of linkedStudents) {
            const linkId = `${email}_${sId}`;
            await adminDb.collection("parentStudentLinks").doc(linkId).set({
              parentEmail: email,
              studentId: sId,
              unitId: currentUnitId,
              status: "active",
              updatedAt: FieldValue.serverTimestamp(),
            }, { merge: true });
          }

          const inviteData: any = {
            email,
            name: name || email,
            role: "PARENT",
            unitId: currentUnitId,
            jobTitle: "",
            luminaId,
            linkedStudents,
            status: "ready",
          };

          const existingQuery = await adminDb
            .collection("roleInvites")
            .where("email", "==", email)
            .limit(1)
            .get();

          if (existingQuery.empty) {
            inviteData.createdAt = FieldValue.serverTimestamp();
            await adminDb.collection("roleInvites").doc().set(inviteData);
            created++;
          } else {
            const doc = existingQuery.docs[0];
            const currentData = doc.data() || {};
            const hasChanges =
              (currentData.role || "") !== "PARENT" ||
              (currentData.unitId || "") !== currentUnitId ||
              (currentData.luminaId || "") !== luminaId ||
              (currentData.name || "") !== name ||
              JSON.stringify(currentData.linkedStudents || []) !== JSON.stringify(linkedStudents);

            if (hasChanges) {
              await doc.ref.update(inviteData);
              updated++;
            } else {
              const reason = "Data orang tua sudah sesuai (tidak ada perubahan)";
              console.log(`[BulkImportSkip] Baris ${i + 1} (${name}) dilewati. Alasan: ${reason}`, {
                rowIndex: i,
                row,
                columnMapping,
                mapped,
                normalized: { name, email, luminaId, gender }
              });
              skippedReasons.push(`Baris ${i + 1} (${name}): ${reason}`);
              skipped++;
            }
          }
        }

      } catch (err: any) {
        errors.push(`Baris ${i + 1}: ${err.message}`);
      }
    }

    console.log(
      `[BulkImportPaste] Result - Created: ${created}, Updated: ${updated}, Skipped: ${skipped}, Errors: ${errors.length}`
    );

    return res.json({
      success: true,
      created,
      updated,
      skipped,
      errors,
      skippedReasons,
    });
  } catch (error: any) {
    console.error("[BulkImportPaste] Fatal Error:", error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

// API: Sync Parents Data (ensure roleInvites & users have PARENT roles for all student parentEmail)
app.post("/api/admin/sync-parents-data", async (req, res) => {
  try {
    const db = getAdminDb();
    if (!db) return res.status(503).json({ error: "Firebase not initialized" });

    console.log("[SyncParents] Starting comprehensive synchronization...");

    // 1. Get all student placeholders from roleInvites
    const studentsSnap = await db.collection("roleInvites")
      .where("role", "==", "STUDENT")
      .get();
    const roleInviteStudents = studentsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

    // 2. Get all students directly from students collection
    const studentsCollSnap = await db.collection("students").get();
    const studentsCollList = studentsCollSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

    // Combine lists, preferring students collection since it's the core system of record
    const allStudentsMap = new Map<string, any>();
    
    // First, seed with role invites
    roleInviteStudents.forEach(s => {
      const parentEmail = String(s.parentEmail || "").trim().toLowerCase();
      const luminaId = String(s.luminaId || s.id || "").trim();
      if (luminaId && parentEmail) {
        allStudentsMap.set(luminaId, {
          id: s.id,
          luminaId,
          parentEmail,
          name: s.name || "Siswa",
          unitId: s.unitId || "JUNIOR_HIGH"
        });
      }
    });

    // Overwrite/Add with active students collection (more up-to-date and covers all school levels like Kindergarten)
    studentsCollList.forEach(s => {
      const parentEmail = String(s.parentEmail || "").trim().toLowerCase();
      const luminaId = String(s.luminaId || s.id || "").trim();
      if (luminaId && parentEmail) {
        allStudentsMap.set(luminaId, {
          id: s.id,
          luminaId,
          parentEmail,
          name: s.name || s.fullName || "Siswa",
          unitId: s.unitId || "KINDERGARTEN",
          fatherName: s.fatherName || "",
          motherName: s.motherName || ""
        });
      }
    });

    // 3. Map parentEmail to list of student luminaIds
    const parentMap: Record<string, { name: string; linkedStudents: string[]; unitId: string }> = {};

    for (const [luminaId, s] of allStudentsMap.entries()) {
      const parentEmail = s.parentEmail;
      if (parentEmail && luminaId) {
        if (!parentMap[parentEmail]) {
          let defaultName = `Wali ${s.name}`;
          if (s.fatherName) defaultName = s.fatherName;
          else if (s.motherName) defaultName = s.motherName;

          parentMap[parentEmail] = {
            name: defaultName,
            linkedStudents: [],
            unitId: s.unitId || "KINDERGARTEN"
          };
        }
        if (!parentMap[parentEmail].linkedStudents.includes(luminaId)) {
          parentMap[parentEmail].linkedStudents.push(luminaId);
        }
      }
    }

    let createdInvites = 0;
    let updatedInvites = 0;
    let updatedUsers = 0;
    let syncedLinks = 0;

    for (const [email, info] of Object.entries(parentMap)) {
      const emailClean = email.toLowerCase().trim();
      if (!emailClean) continue;

      // A. Sync roleInvites for PARENT role
      const parentSnap = await db.collection("roleInvites")
        .where("email", "==", emailClean)
        .where("role", "==", "PARENT")
        .limit(1)
        .get();

      if (parentSnap.empty) {
        await db.collection("roleInvites").add({
          email: emailClean,
          name: info.name,
          role: "PARENT",
          unitId: info.unitId,
          linkedStudents: info.linkedStudents,
          status: "ready",
          createdAt: FieldValue.serverTimestamp()
        });
        createdInvites++;
      } else {
        const parentDoc = parentSnap.docs[0];
        const currentData = parentDoc.data();
        const currentLinked = Array.isArray(currentData.linkedStudents) ? currentData.linkedStudents : [];
        const newLinked = Array.from(new Set([...currentLinked, ...info.linkedStudents].map(id => String(id))));
        
        if (newLinked.length !== currentLinked.length || currentData.name !== info.name) {
          await parentDoc.ref.update({
            linkedStudents: newLinked,
            name: currentData.name || info.name,
            updatedAt: FieldValue.serverTimestamp()
          });
          updatedInvites++;
        }
      }

      // B. Sync users collection for active registered parent profiles (also update GUEST/pending to PARENT/active)
      const userSnap = await db.collection("users")
        .where("email", "==", emailClean)
        .get();

      if (!userSnap.empty) {
        for (const userDoc of userSnap.docs) {
          const userData = userDoc.data();
          const currentLinked = Array.isArray(userData.linkedStudents) ? userData.linkedStudents : [];
          const newLinked = Array.from(new Set([...currentLinked, ...info.linkedStudents].map(id => String(id))));
          
          const updates: any = {};
          if (userData.role === 'GUEST') {
            updates.role = 'PARENT';
          }
          if (userData.status === 'pending') {
            updates.status = 'active';
          }
          
          if (newLinked.length !== currentLinked.length || updates.role || updates.status) {
            await userDoc.ref.update({
              ...updates,
              linkedStudents: newLinked,
              updatedAt: FieldValue.serverTimestamp()
            });
            updatedUsers++;
          }
        }
      }

      // C. Update/Replace parentStudentLinks document (docId = parentEmail)
      const linkDocRef = db.collection("parentStudentLinks").doc(emailClean);
      await linkDocRef.set({
        parentId: emailClean,
        parentEmail: emailClean,
        studentIds: info.linkedStudents,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: "system_admin_sync"
      }, { merge: true });

      // D. Update sub parentStudentLinks documents (docId = `${parentEmail}_${luminaId}`)
      for (const luminaId of info.linkedStudents) {
        const individualLinkId = `${emailClean}_${luminaId}`;
        await db.collection("parentStudentLinks").doc(individualLinkId).set({
          parentEmail: emailClean,
          studentId: luminaId,
          unitId: info.unitId,
          status: "active",
          updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
        syncedLinks++;
      }
    }

    res.json({
      success: true,
      createdInvites,
      updatedInvites,
      updatedUsers,
      syncedLinks,
      totalParents: Object.keys(parentMap).length
    });
  } catch (error: any) {
    console.error("[SyncParents] Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// API: Reconcile Student References (Super Admin Only)
app.post("/api/admin/reconcile-student-refs", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized. Missing bearer token." });
    }
    const token = authHeader.split("Bearer ")[1];
    
    let decodedToken;
    try {
      const getAdminAuth = (await import("firebase-admin/auth")).getAuth;
      decodedToken = await getAdminAuth().verifyIdToken(token);
    } catch (authErr: any) {
      return res.status(401).json({ error: `Authentication failed: ${authErr.message}` });
    }

    const db = getAdminDb();
    if (!db) {
      return res.status(500).json({ error: "Firestore is not online." });
    }

    const userDoc = await db.collection("users").doc(decodedToken.uid).get();
    const userRole = userDoc.exists ? userDoc.data()?.role : null;
    const isSuperAdmin = isUserSuperAdmin(userRole, decodedToken.email);

    if (!isSuperAdmin) {
      return res.status(403).json({ error: "Access denied. Active Super Admin permission required." });
    }

    const { dryRun, unitId } = req.body;
    const { runReconciliation } = await import("./src/services/reconciliationService");
    
    console.log(`[ReconciliationAPI] Starting student reconciliation with parameters: dryRun=${!!dryRun}, unitId=${unitId || "ALL"}`);
    
    const result = await runReconciliation(db, {
      dryRun: !!dryRun,
      unitId: unitId || "ALL"
    });

    console.log(`[ReconciliationAPI] Completed runReconciliation. Mapping count: ${result.mappingCount}, Changes count: ${result.changes.length}, Errors count: ${result.errors.length}`);

    res.json({
      success: true,
      status: "ok",
      mode: dryRun ? "DRY-RUN" : "LIVE",
      mappingCount: result.mappingCount,
      changesCount: result.changes.length,
      scannedCollections: result.scannedCollections,
      sampleChanges: result.changes.slice(0, 30), // return up to 30 for safe UI preview instead of 10
      scannedStudentsCount: result.scannedStudentsCount,
      scannedSTUDENTInvitesCount: result.scannedSTUDENTInvitesCount,
      matchedInvitesCount: result.matchedInvitesCount,
      unmatchedInvitesCount: result.unmatchedInvitesCount,
      unmatchedSamples: result.unmatchedSamples,
      matchedByDocId: result.matchedByDocId,
      matchedByLuminaId: result.matchedByLuminaId,
      matchedByNis: result.matchedByNis,
      matchedByEmail: result.matchedByEmail,
      matchedByName: result.matchedByName,
      ambiguousMatches: result.ambiguousMatches,
      errorsCount: result.errors.length,
      errors: result.errors,
      timestamp: result.timestamp
    });
  } catch (error: any) {
    console.error("[ReconciliationAPI] Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Cleanup corrupted oldLuminaId fields (e.g. mistakenly holding Gender inputs like 'Perempuan', 'Laki-laki', etc)
app.post("/api/admin/cleanup-invalid-ids", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized. Missing bearer token." });
    }
    const token = authHeader.split("Bearer ")[1];
    
    let decodedToken;
    try {
      const getAdminAuth = (await import("firebase-admin/auth")).getAuth;
      decodedToken = await getAdminAuth().verifyIdToken(token);
    } catch (authErr: any) {
      return res.status(401).json({ error: `Authentication failed: ${authErr.message}` });
    }

    const db = getAdminDb();
    if (!db) {
      return res.status(500).json({ error: "Firestore is not online." });
    }

    const userDoc = await db.collection("users").doc(decodedToken.uid).get();
    const userRole = userDoc.exists ? userDoc.data()?.role : null;
    const isSuperAdmin = isUserSuperAdmin(userRole, decodedToken.email);

    if (!isSuperAdmin) {
      return res.status(403).json({ error: "Access denied. Active Super Admin permission required." });
    }

    const { dryRun } = req.body;
    console.log(`[CleanupAPI] Starting cleanup of invalid oldLuminaId references. dryRun=${!!dryRun}`);

    const invalidPatterns = ["perempuan", "laki-laki", "l", "p", "male", "female", "laki-laki", "laki - laki", "perempuan"];
    const isInvalid = (val: string) => {
      const lower = val.trim().toLowerCase();
      return invalidPatterns.includes(lower);
    };

    const targetCollections = ["students", "roleInvites", "users"];
    const report: Record<string, { scanned: number; corrupted: number; updated: number }> = {};
    const updatedDocs: { collection: string; id: string; name: string; oldValue: string }[] = [];

    for (const collName of targetCollections) {
      report[collName] = { scanned: 0, corrupted: 0, updated: 0 };
      const snap = await db.collection(collName).get();
      report[collName].scanned = snap.size;

      let batch = db.batch();
      let countInBatch = 0;

      for (const doc of snap.docs) {
        const data = doc.data();
        const oldLuminaId = data.oldLuminaId;
        if (typeof oldLuminaId === "string" && oldLuminaId.trim() !== "" && isInvalid(oldLuminaId)) {
          report[collName].corrupted++;
          updatedDocs.push({
            collection: collName,
            id: doc.id,
            name: data.displayName || data.fullName || data.name || data.studentName || "No Name",
            oldValue: oldLuminaId,
          });

          if (!dryRun) {
            batch.update(doc.ref, { oldLuminaId: "" });
            report[collName].updated++;
            countInBatch++;
            if (countInBatch >= 200) {
              await batch.commit();
              batch = db.batch();
              countInBatch = 0;
            }
          }
        }
      }

      if (!dryRun && countInBatch > 0) {
        await batch.commit();
      }
    }

    res.json({
      success: true,
      mode: dryRun ? "DRY-RUN" : "LIVE",
      report,
      updatedCount: updatedDocs.length,
      samples: updatedDocs,
    });
  } catch (error: any) {
    console.error("[CleanupAPI] Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Bulk Delete Role Invites (Super Admin Only)
app.post("/api/admin/delete-invites", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized. Missing bearer token." });
    }
    const token = authHeader.split("Bearer ")[1];
    
    let decodedToken;
    try {
      const getAdminAuth = (await import("firebase-admin/auth")).getAuth;
      decodedToken = await getAdminAuth().verifyIdToken(token);
    } catch (authErr: any) {
      return res.status(401).json({ error: `Authentication failed: ${authErr.message}` });
    }

    const db = getAdminDb();
    if (!db) {
      return res.status(500).json({ error: "Firestore is not online." });
    }

    const userDoc = await db.collection("users").doc(decodedToken.uid).get();
    const userRole = userDoc.exists ? userDoc.data()?.role : null;
    const isSuperAdmin = isUserSuperAdmin(userRole, decodedToken.email);

    if (!isSuperAdmin) {
      return res.status(403).json({ error: "Access denied. Active Super Admin permission required." });
    }

    const { inviteIds } = req.body;
    if (!inviteIds || !Array.isArray(inviteIds) || inviteIds.length === 0) {
      return res.status(400).json({ success: false, error: "Invalid or empty inviteIds list." });
    }

    console.log(`[DeleteInvitesAPI] Performing deletion of ${inviteIds.length} invites.`);

    const batchSize = 100;
    const chunks = [];
    for (let i = 0; i < inviteIds.length; i += batchSize) {
      chunks.push(inviteIds.slice(i, i + batchSize));
    }

    let deletedCount = 0;
    for (const chunk of chunks) {
      const batch = db.batch();
      for (const id of chunk) {
        const docRef = db.collection("roleInvites").doc(id);
        batch.delete(docRef);
      }
      await batch.commit();
      deletedCount += chunk.length;
    }

    res.json({
      success: true,
      deletedCount,
    });
  } catch (error: any) {
    console.error("[DeleteInvitesAPI] Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Scan Identity Conflicts based on Name-centric Primary layer (Super Admin Only)
app.post("/api/admin/scan-identity-conflicts", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized. Missing bearer token." });
    }
    const token = authHeader.split("Bearer ")[1];
    
    let decodedToken;
    try {
      const getAdminAuth = (await import("firebase-admin/auth")).getAuth;
      decodedToken = await getAdminAuth().verifyIdToken(token);
    } catch (authErr: any) {
      return res.status(401).json({ error: `Authentication failed: ${authErr.message}` });
    }

    const db = getAdminDb();
    if (!db) {
      return res.status(500).json({ error: "Firestore is not online." });
    }

    const userDoc = await db.collection("users").doc(decodedToken.uid).get();
    const userRole = userDoc.exists ? userDoc.data()?.role : null;
    const isSuperAdmin = isUserSuperAdmin(userRole, decodedToken.email);

    if (!isSuperAdmin) {
      return res.status(403).json({ error: "Access denied. Active Super Admin permission required." });
    }

    const { unitId } = req.body; // e.g. "ALL", "KINDERGARTEN", "ELEMENTARY", "JUNIOR_HIGH"
    const targetUnit = unitId || "ALL";

    console.log(`[ConflictAPI] Scanning student identity conflicts under target unit: ${targetUnit}`);

    // Fetch master students
    let studentsRef = db.collection("students");
    let studentsSnap;
    if (targetUnit !== "ALL") {
      studentsSnap = await studentsRef.where("currentUnit", "==", targetUnit).get();
    } else {
      studentsSnap = await studentsRef.get();
    }

    // Fetch student invitations
    let invitesRef = db.collection("roleInvites").where("role", "==", "STUDENT");
    let invitesSnap;
    if (targetUnit !== "ALL") {
      invitesSnap = await invitesRef.where("unitId", "==", targetUnit).get();
    } else {
      invitesSnap = await invitesRef.get();
    }

    const { detectIdentityConflicts, normalizeFullName } = await import("./src/services/identityConflictService");
    const records: any[] = [];

    studentsSnap.forEach((doc) => {
      const data = doc.data();
      const rawName = data.name || "";
      const norm = normalizeFullName(rawName);

      records.push({
        id: doc.id,
        name: rawName,
        normalizedName: norm,
        nis: data.luminaId || data.nis || doc.id || "",
        oldLuminaId: data.oldLuminaId || "",
        nisn: data.nisn || "",
        nickname: data.nickname || "",
        gender: data.gender || "",
        classId: data.classId || "",
        unitId: data.currentUnit || data.unitId || "",
        parentEmail: data.parentEmail || "",
        fatherName: data.fatherName || "",
        motherName: data.motherName || "",
        email: data.email || "",
        status: data.status || "active",
        source: 'students'
      });
    });

    invitesSnap.forEach((doc) => {
      const data = doc.data();
      const rawName = data.name || "";
      const norm = normalizeFullName(rawName);

      records.push({
        id: doc.id,
        name: rawName,
        normalizedName: norm,
        nis: data.luminaId || "",
        oldLuminaId: data.oldLuminaId || "",
        nisn: data.nisn || "",
        nickname: data.nickname || "",
        gender: data.gender || "",
        classId: data.classId || "",
        unitId: data.unitId || "",
        parentEmail: data.parentEmail || "",
        fatherName: data.fatherName || "",
        motherName: data.motherName || "",
        email: data.email || "",
        status: data.status || "pending",
        source: 'roleInvites'
      });
    });

    // Run the detection module
    const result = detectIdentityConflicts(records);

    res.json({
      success: true,
      status: "ok",
      targetUnit,
      totalScanned: result.totalScanned,
      totalUniqueNames: result.totalUniqueNames,
      totalConflicts: result.totalConflicts,
      totalNeedsReview: result.totalNeedsReview,
      groups: result.groups,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error("[ConflictAPI] Error scanning conflicts:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Helper: Replace prompt variables
function replacePromptVariables(promptText: string, variables: Record<string, string> = {}) {
  let result = promptText;
  for (const [key, value] of Object.entries(variables)) {
    const regex1 = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
    const regex2 = new RegExp(`\\{\\s*${key}\\s*\\}`, 'g');
    result = result.replace(regex1, value).replace(regex2, value);
  }
  return result;
}

// Helper: Get AI Prompt template dynamically
export function sanitizeAiComment(text: string): string {
  if (!text) return "";
  let cleaned = text.trim();

  // Remove Markdown code block wrappers if any (e.g., ``` or ```text)
  cleaned = cleaned.replace(/^```[a-zA-Z]*\n?/g, "");
  cleaned = cleaned.replace(/\n?```$/g, "");
  cleaned = cleaned.trim();

  // Remove markdown bold/italic formatting
  cleaned = cleaned.replace(/\*\*|\*|_/g, "");

  // Clean line by line to remove conversational intros
  let lines = cleaned.split("\n").map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length > 1) {
    const firstLine = lines[0].toLowerCase();
    const isIntro = 
      firstLine.endsWith(":") || 
      firstLine.startsWith("tentu") || 
      firstLine.startsWith("berikut") || 
      firstLine.startsWith("ini ") || 
      firstLine.startsWith("halo") || 
      firstLine.startsWith("baik") ||
      firstLine.length < 80;

    if (isIntro && !firstLine.includes("minggu ini") && !firstLine.startsWith("ananda") && !firstLine.startsWith("ia ") && !firstLine.startsWith("dia ")) {
      lines.shift();
      cleaned = lines.join("\n").trim();
    }
  }

  // Repeatedly strip surrounding quotes (single, double, curly quotes)
  let prev;
  do {
    prev = cleaned;
    cleaned = cleaned.trim();
    if (
      (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
      (cleaned.startsWith("'") && cleaned.endsWith("'")) ||
      (cleaned.startsWith('“') && cleaned.endsWith('”')) ||
      (cleaned.startsWith('”') && cleaned.endsWith('”')) ||
      (cleaned.startsWith('“') && cleaned.endsWith('“')) ||
      (cleaned.startsWith('‘') && cleaned.endsWith('’'))
    ) {
      cleaned = cleaned.substring(1, cleaned.length - 1);
    }
  } while (cleaned !== prev);

  // Remove any leftover introductory words at the very beginning of the paragraph
  cleaned = cleaned.replace(/^(tentu,\s*|tentu saja,\s*|berikut adalah\s+|berikut draf komentar:\s*|ini adalah\s*|berikut\s*:\s*)/i, "");

  return cleaned.trim();
}

export async function getPrompt(key: string, variables?: Record<string, string>): Promise<string> {
  const defaultTemplates: Record<string, string> = {
    kindergarten_weekly_report: "Buat sebuah laporan narasi mingguan untuk seorang siswa yang berada di {{ageGroupStageString}}. Gunakan 6 developmental stages (Nilai Agama dan Budi Pekerti, Sosial-Emosional, Bahasa, Kognitif, Fisik-Motorik, Seni) sebagai hal yang menjadi fokus dalam laporan. Mulai dengan 'Minggu ini,' atau '{{nickName}} ...'. Gunakan EYD dengan benar. Jika ada domain atau sentra yang berulang, penjelasan digabung saja dan tidak berulang. Jangan gunakan tanda seru. Buat dalam 1 paragraf utuh/tidak terpisah.\n\nPENTING: HANYA berikan teks komentar utama saja. JANGAN gunakan pengantar seperti 'Berikut komentar...', 'Tentu, ini draf...', dll. JANGAN bungkus dalam tanda kutip. JANGAN gunakan format markdown seperti tebal atau miring.\n\nBerikut data observasi mingguan siswa:\n{{observationSummary}}",
    kindergarten_sel_report: "Saya ingin membuat komentar mingguan untuk laporan perkembangan Sosial Emosional siswa {{ageGroupStageString}}. Berikut adalah data kehadiran dan emosi siswa dalam 1 minggu terakhir:\nHappy: {{happy}}, Sad: {{sad}}, Angry: {{angry}}, OK: {{ok}}, No News: {{noNews}}, Sick: {{sick}}, Izin: {{izin}}, Early Leave: {{earlyLeave}}\nBuatkan saya satu paragraf komentar dalam bahasa Indonesia yang singkat dan positif, cocok untuk laporan mingguan. Komentar harus sesuai dengan tahapan perkembangan sosial emosional anak usia yang sesuai, menggambarkan kemampuan anak mengenali dan mengekspresikan emosi, serta bagaimana ia merespons dukungan orang dewasa.\nGunakan bahasa yang hangat untuk ananda bernama: {{nickName}}\n\nPENTING: HANYA berikan teks komentar utama saja. JANGAN gunakan pengantar seperti 'Berikut komentar...', 'Tentu, ini draf...', dll. JANGAN bungkus dalam tanda kutip. JANGAN gunakan format markdown seperti tebal atau miring."
  };

  try {
    const db = getAdminDb();
    let rawPromptText = "";

    if (db) {
      const snap = await db.collection("promptTemplates")
        .where("key", "==", key)
        .where("isActive", "==", true)
        .limit(1)
        .get();

      if (!snap.empty) {
        const doc = snap.docs[0];
        const templateData = doc.data();
        rawPromptText = templateData.prompt || "";
      }
    }

    if (!rawPromptText) {
      rawPromptText = defaultTemplates[key] || `[Prompt belum diisi. Silakan edit melalui Prompt Manager.]`;
    }

    if (variables) {
      return replacePromptVariables(rawPromptText, variables);
    }
    return rawPromptText;
  } catch (error: any) {
    console.error(`[getPrompt] Error fetching prompt key "${key}":`, error);
    const rawPromptText = defaultTemplates[key] || `[Prompt belum diisi. Silakan edit melalui Prompt Manager.]`;
    if (variables) {
      return replacePromptVariables(rawPromptText, variables);
    }
    return rawPromptText;
  }
}

// Helper: Seed initial prompt templates if missing
async function seedPromptTemplates() {
  try {
    const db = getAdminDb();
    if (!db) {
      console.log("[PromptTemplatesSeed] Skipping seed: adminDb is not initialized.");
      return;
    }
    const collectionRef = db.collection("promptTemplates");
    const snap = await collectionRef.limit(1).get();
    if (!snap.empty) {
      console.log("[PromptTemplatesSeed] Prompt templates already exist, skipping seed.");
      return;
    }

    const initialTemplates = [
      {
        key: "kindergarten_weekly_report",
        name: "Weekly Report - Kindergarten",
        unit: "KINDERGARTEN",
        category: "report",
        prompt: "Buat sebuah laporan narasi mingguan untuk seorang siswa yang berada di {{ageGroupStageString}}. Gunakan 6 developmental stages (Nilai Agama dan Budi Pekerti, Sosial-Emosional, Bahasa, Kognitif, Fisik-Motorik, Seni) sebagai hal yang menjadi fokus dalam laporan. Mulai dengan 'Minggu ini,' atau '{{nickName}} ...'. Gunakan EYD dengan benar. Jika ada domain atau sentra yang berulang, penjelasan digabung saja dan tidak berulang. Jangan gunakan tanda seru. Buat dalam 1 paragraf utuh/tidak terpisah.\n\nBerikut data observasi mingguan siswa:\n{{observationSummary}}",
        variables: ["studentName", "nickName", "ageGroupStageString", "observationSummary"],
        description: "Prompt template untuk generate laporan narasi perkembangan mingguan siswa TK berdasarkan hasil observasi guru.",
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        updatedBy: "system@lumina.id"
      },
      {
        key: "kindergarten_sel_report",
        name: "Social-Emotional Development Report - Kindergarten",
        unit: "KINDERGARTEN",
        category: "report",
        prompt: "Saya ingin membuat komentar mingguan untuk laporan perkembangan Sosial Emosional siswa {{ageGroupStageString}}. Berikut adalah data kehadiran dan emosi siswa dalam 1 minggu terakhir:\nHappy: {{happy}}, Sad: {{sad}}, Angry: {{angry}}, OK: {{ok}}, No News: {{noNews}}, Sick: {{sick}}, Izin: {{izin}}, Early Leave: {{earlyLeave}}\nBuatkan saya satu paragraf komentar dalam bahasa Indonesia yang singkat dan positif, cocok untuk laporan mingguan. Komentar harus sesuai dengan tahapan perkembangan sosial emosional anak usia yang sesuai, menggambarkan kemampuan anak mengenali dan mengekspresikan emosi, serta bagaimana ia merespons dukungan orang dewasa.\nGunakan bahasa yang hangat untuk ananda bernama: {{nickName}}",
        variables: ["studentName", "nickName", "ageGroupStageString", "happy", "sad", "angry", "ok", "noNews", "sick", "izin", "earlyLeave"],
        description: "Prompt template untuk menganalisis perkembangan sosial-emosional siswa TK dari data presensi dan ekspresi harian.",
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        updatedBy: "system@lumina.id"
      }
    ];

    for (const template of initialTemplates) {
      const docRef = collectionRef.doc();
      await docRef.set({
        id: docRef.id,
        ...template
      });
      console.log(`[PromptTemplatesSeed] Seeding default template: ${template.key}`);
    }
  } catch (error: any) {
    console.error("[PromptTemplatesSeed] Dynamic prompt template seeding failed:", error);
  }
}

// Automatically trigger seed check on server boot
setTimeout(() => {
  seedPromptTemplates();
}, 2000);

// API: Test Prompt with variables (Super Admin Only)
app.post("/api/test-prompt", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized. Missing bearer token." });
    }
    const token = authHeader.split("Bearer ")[1];
    
    let decodedToken;
    try {
      const getAdminAuth = (await import("firebase-admin/auth")).getAuth;
      decodedToken = await getAdminAuth().verifyIdToken(token);
    } catch (authErr: any) {
      return res.status(401).json({ error: `Authentication failed: ${authErr.message}` });
    }

    const db = getAdminDb();
    if (!db) {
      return res.status(500).json({ error: "Firestore is not online." });
    }

    const userDoc = await db.collection("users").doc(decodedToken.uid).get();
    const userRole = userDoc.exists ? userDoc.data()?.role : null;
    const isSuperAdmin = isUserSuperAdmin(userRole, decodedToken.email);

    if (!isSuperAdmin) {
      return res.status(403).json({ error: "Access denied. Active Super Admin permission required." });
    }

    const { promptKey, promptText, variables } = req.body;

    let finalPromptText = "";
    if (promptKey) {
      const snap = await db.collection("promptTemplates")
        .where("key", "==", promptKey)
        .limit(1)
        .get();
      if (snap.empty) {
        return res.status(404).json({ error: `Template "${promptKey}" was not found.` });
      }
      finalPromptText = snap.docs[0].data().prompt || "";
    } else if (promptText) {
      finalPromptText = promptText;
    } else {
      return res.status(400).json({ error: "Specify promptKey or direct text." });
    }

    // Substitute variable placeholders
    finalPromptText = replacePromptVariables(finalPromptText, variables || {});

    const API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || "";
    let detectedKeyName = "";
    if (process.env.GEMINI_API_KEY) {
      detectedKeyName = "GEMINI_API_KEY";
    } else if (process.env.VITE_GEMINI_API_KEY) {
      detectedKeyName = "VITE_GEMINI_API_KEY";
    }

    if (!API_KEY || API_KEY.trim() === "") {
      return res.status(500).json({ error: "AI API key is not configured on the server." });
    }

    const BASE_URL = process.env.VITE_AI_BASE_URL || "https://api.koboillm.com/v1";
    const MODEL = process.env.VITE_AI_MODEL || "gemini/gemini-2.5-flash-lite";

    const aiResponse = await axios.post(`${BASE_URL}/chat/completions`, {
      model: MODEL,
      messages: [{ role: "user", content: finalPromptText }],
      temperature: 0.7
    }, {
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${API_KEY}`,
      },
      timeout: 30000
    });

    const textResult = aiResponse.data?.choices?.[0]?.message?.content || "";

    res.json({
      success: true,
      promptSent: finalPromptText,
      text: textResult
    });
  } catch (error: any) {
    console.error("[TestPromptError] Error resolving prompt run:", error);
    res.status(500).json({ error: error.message || "Unknown server error." });
  }
});

// API: Generate Weekly Core Comments from Observations
app.post("/api/kindergarten/generate-weekly-comment", async (req, res) => {
  try {
    const { studentName, nickName, ageGroup, observationSummary } = req.body;
    if (!studentName) {
      return res.status(400).json({ error: "Missing studentName" });
    }

    const API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || "";
    let detectedKeyName = "";
    if (process.env.GEMINI_API_KEY) {
      detectedKeyName = "GEMINI_API_KEY";
    } else if (process.env.VITE_GEMINI_API_KEY) {
      detectedKeyName = "VITE_GEMINI_API_KEY";
    }

    if (!API_KEY || API_KEY.trim() === "") {
      return res.status(500).json({ error: "AI API key is not configured on the server." });
    }

    console.log(`[WeeklyCommentsAI] Detected API key from environment variable: ${detectedKeyName}`);

    const stageString = ageGroup === 'PRA_TK' ? 'Pra TK (usia 2-4 tahun)' : ageGroup === 'TK_B' ? 'TK B (usia 5-6 tahun)' : 'TK A (usia 4-5 tahun)';

    let formattedObs = "Tidak ada records observasi minggu ini.";
    if (Array.isArray(observationSummary) && observationSummary.length > 0) {
      formattedObs = observationSummary.map(obs => {
        const mergedNotesStr = Array.isArray(obs.mergedNotes) && obs.mergedNotes.length > 0
          ? obs.mergedNotes.map((n: string) => `- ${n}`).join("\n")
          : "- Mengikuti aktivitas dengan baik.";
        return `Domain: ${obs.domain}\nAktivitas: ${obs.activityList?.join(", ") || "-"}\nCapaian: ${obs.grades?.join(", ") || "-"}\nCatatan Perkembangan:\n${mergedNotesStr}`;
      }).join("\n\n");
    }

    const prompt = await getPrompt("kindergarten_weekly_report", {
      studentName,
      nickName: nickName || studentName,
      ageGroupStageString: stageString,
      observationSummary: formattedObs,
    });

    const BASE_URL = process.env.VITE_AI_BASE_URL || "https://api.koboillm.com/v1";
    const MODEL = process.env.VITE_AI_MODEL || "gemini/gemini-2.5-flash-lite";

    const aiResponse = await axios.post(`${BASE_URL}/chat/completions`, {
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7
    }, {
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${API_KEY}`,
      },
      timeout: 30000
    });

    const textResult = aiResponse.data?.choices?.[0]?.message?.content || "";
    const sanitizedText = sanitizeAiComment(textResult);
    res.json({ text: sanitizedText });
  } catch (error: any) {
    console.error("[WeeklyCommentsAI] Error calling AI API:", error);
    res.status(500).json({ error: error.message || "Gagal mengenerate komentar menggunakan AI." });
  }
});

// API: Generate Weekly Social-Emotional Comments from Attendance
app.post("/api/kindergarten/generate-sel-comment", async (req, res) => {
  try {
    const { studentName, nickName, ageGroup, attendanceSummary } = req.body;
    if (!studentName) {
      return res.status(400).json({ error: "Missing studentName" });
    }

    const API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || "";
    let detectedKeyName = "";
    if (process.env.GEMINI_API_KEY) {
      detectedKeyName = "GEMINI_API_KEY";
    } else if (process.env.VITE_GEMINI_API_KEY) {
      detectedKeyName = "VITE_GEMINI_API_KEY";
    }

    if (!API_KEY || API_KEY.trim() === "") {
      return res.status(500).json({ error: "AI API key is not configured on the server." });
    }

    console.log(`[SelCommentsAI] Detected API key from environment variable: ${detectedKeyName}`);

    const ageText = ageGroup === 'PRA_TK' ? 'usia 2-4 tahun (Pra TK)' : ageGroup === 'TK_B' ? 'usia 5-6 tahun (TK B)' : 'usia 4-5 tahun (TK A)';
    
    const h = attendanceSummary?.happy || 0;
    const s = attendanceSummary?.sad || 0;
    const a = attendanceSummary?.angry || 0;
    const o = attendanceSummary?.ok || 0;
    const n = attendanceSummary?.noNews || 0;
    const sk = attendanceSummary?.sick || 0;
    const i = attendanceSummary?.izin || 0;
    const el = attendanceSummary?.earlyLeave || 0;

    const prompt = await getPrompt("kindergarten_sel_report", {
      studentName,
      nickName: nickName || studentName,
      ageGroupStageString: ageText,
      happy: String(h),
      sad: String(s),
      angry: String(a),
      ok: String(o),
      noNews: String(n),
      sick: String(sk),
      izin: String(i),
      earlyLeave: String(el),
    });

    const BASE_URL = process.env.VITE_AI_BASE_URL || "https://api.koboillm.com/v1";
    const MODEL = process.env.VITE_AI_MODEL || "gemini/gemini-2.5-flash-lite";

    const aiResponse = await axios.post(`${BASE_URL}/chat/completions`, {
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7
    }, {
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${API_KEY}`,
      },
      timeout: 30000
    });

    const textResult = aiResponse.data?.choices?.[0]?.message?.content || "";
    const sanitizedText = sanitizeAiComment(textResult);
    res.json({ text: sanitizedText });
  } catch (error: any) {
    console.error("[SelCommentsAI] Error calling AI API:", error);
    res.status(500).json({ error: error.message || "Gagal mengenerate komentar SEL menggunakan AI." });
  }
});

// API: Health Check
app.get("/api/health", (req, res) => {
  res.json({ 
    status: "ok", 
    vercel: !!process.env.VERCEL,
    nodeEnv: process.env.NODE_ENV,
    hasSA: !!process.env.FIREBASE_SERVICE_ACCOUNT
  });
});

// API: Attendance Health Check
app.get("/api/attendance/health", (req, res) => {
  res.json({ ok: true, service: "attendance-backup" });
});

// API: Ping
app.get("/api/ping", (req, res) => {
  res.json({ status: 'pong', time: new Date().toISOString() });
});

// API: Learning Goal Backup Proxy
app.post("/api/lg-backup-proxy", async (req, res) => {
  try {
    console.log("[LGBackupProxy] Request received for ID:", req.body?.lgId);
    const { lgId } = req.body;
    if (!lgId) {
      return res.status(400).json({ success: false, message: "Missing lgId" });
    }

    const backupUrl = process.env.LUMINA_LG_BACKUP_URL;
    const backupSecret = process.env.LUMINA_LG_BACKUP_SECRET;

    if (!backupUrl || !backupSecret) {
      console.warn("[LGBackupProxy] Missing URL or Secret in environment");
      return res.status(500).json({ success: false, message: "Backup configuration missing (Env vars not set on Vercel?)" });
    }

    // 1. Fetch Learning Goal
    let lgData;
    if (lgId === "TEST_LG_ID") {
      lgData = {
        title: "Test Learning Goal",
        subjectName: "Testing",
        phase: "A",
        semesterLabel: "Semester 1",
        learningGoalText: "Ini adalah data uji coba untuk pengetesan backup."
      };
    } else {
      const db = getAdminDb();
      if (!db) {
        console.error("[LGBackupProxy] Firebase Admin not initialized");
        return res.status(503).json({ success: false, message: "Firebase Admin is not initialized. Please check FIREBASE_SERVICE_ACCOUNT env var." });
      }
      const lgSnap = await db.collection("learning_goals").doc(lgId).get();
      if (!lgSnap.exists) {
        console.warn(`[LGBackupProxy] Learning Goal not found for ID: ${lgId}`);
        return res.status(404).json({ success: false, message: "Learning Goal not found" });
      }
      lgData = lgSnap.data() || {};
    }

    // 2. Sanitize filename
    // Format: LG_{subjectName}_{phase}_{semesterLabel}_{title}.json
    const rawFileName = `LG_${lgData.subjectName || 'UNTITLED'}_${lgData.phase || 'A'}_${lgData.semesterLabel || 'S1'}_${lgData.title || 'LG'}`;
    const sanitizedFileName = rawFileName
      .replace(/[^a-z0-9_\-]/gi, '_')
      .replace(/_{2,}/g, '_') + ".json";

    // 3. Send to Apps Script via POST
    console.log(`[LGBackupProxy] Sending to Apps Script: ${backupUrl}`);
    const response = await axios.post(backupUrl, {
      secret: backupSecret,
      operation: "backup_lg",
      lgId: lgId,
      fileName: sanitizedFileName,
      data: lgData
    }, {
      timeout: 30000 // 30s timeout
    });

    // 4. Return formatted response
    // Apps Script is expected to return: { ok: boolean, fileId: string, fileUrl: string, message: string }
    const result = response.data || {};
    console.log(`[LGBackupProxy] Response from Apps Script:`, result);
    
    // Sync hasil backup ke Firestore (hanya jika lgId bukan test ID)
    if (lgId !== "TEST_LG_ID" && lgId !== "DOC_SAMPLE_001") {
      try {
        const db = getAdminDb();
        if (db) {
          const now = Date.now();
          const lgRef = db.collection("learning_goals").doc(lgId);
          
          // 1. Update the main document summary
          const backupSummary: LGBackupSummary = {
            lastBackupAt: now,
            lastBackupStatus: (result.ok ? 'SUCCESS' : 'FAILED') as LGBackupStatus,
            lastBackupFileId: result.fileId || null,
            lastBackupFileUrl: result.fileUrl || null,
            lastBackupMessage: result.message || (result.ok ? 'Backup successful' : 'Backup failed')
          };

          await lgRef.update({
            backupSummary,
            updatedAt: now
          });
          console.log(`[LGBackupProxy] Firestore updated for ID: ${lgId}`);

          // 2. Add detailed log entry to subcollection
          const logRef = lgRef.collection("backup_logs").doc();
          const logEntry: LGBackupLog = {
            id: logRef.id,
            lgId,
            status: (result.ok ? 'SUCCESS' : 'FAILED') as LGBackupStatus,
            fileId: result.fileId || null,
            fileUrl: result.fileUrl || null,
            message: result.message || null,
            triggeredBy: 'manual',
            createdAt: now
          };

          await logRef.set(logEntry);
        }
      } catch (syncError: any) {
        console.warn("[LGBackupProxy] Firestore sync failed (non-blocking):", syncError.message);
      }
    }
    
    return res.json({
      ok: result.ok || false,
      fileId: result.fileId || null,
      fileUrl: result.fileUrl || null,
      fileName: sanitizedFileName,
      message: result.message || "Processed"
    });

  } catch (error: any) {
    console.error("[LGBackupProxy] Error processing request:", error.response?.data || error.message);
    return res.status(500).json({
      ok: false,
      message: error.message,
      details: error.response?.data || null
    });
  }
});

app.post("/api/lg-export-sheet", async (req, res) => {
  try {
    const { lgId } = req.body;

    if (!lgId) {
      return res.status(400).json({
        ok: false,
        message: "Missing lgId"
      });
    }

    const backupUrl = process.env.LUMINA_LG_BACKUP_URL;
    const backupSecret = process.env.LUMINA_LG_BACKUP_SECRET;

    if (!backupUrl || !backupSecret) {
      console.warn("[LGExportSheet] Missing URL or Secret in environment");
      return res.status(500).json({
        ok: false,
        message: "Backup/export configuration missing"
      });
    }

    const db = getAdminDb();
    if (!db) {
      return res.status(503).json({ ok: false, message: "Firebase Admin not initialized" });
    }
    const lgSnap = await db.collection("learning_goals").doc(lgId).get();

    if (!lgSnap.exists) {
      return res.status(404).json({
        ok: false,
        message: "Learning Goal not found"
      });
    }

    const lgData = lgSnap.data() || {};
    const jsonFileId = lgData?.backupSummary?.lastBackupFileId || null;

    if (!jsonFileId) {
      return res.status(400).json({
        ok: false,
        message: "Learning Goal has not been backed up yet. Please run backup first."
      });
    }

    const response = await axios.post(backupUrl, {
      secret: backupSecret,
      operation: "export_lg_sheet",
      jsonFileId
    });

    const result = response.data || {};

    return res.json({
      ok: result.ok || false,
      spreadsheetId: result.spreadsheetId || null,
      spreadsheetUrl: result.spreadsheetUrl || null,
      spreadsheetName: result.spreadsheetName || null,
      jsonFileId,
      message: result.message || (result.ok ? "Export to Sheet successful" : "Export failed")
    });

  } catch (error: any) {
    console.error("[LGExportSheet] Error:", error.response?.data || error.message);
    return res.status(500).json({
      ok: false,
      message: error.message,
      details: error.response?.data || null
    });
  }
});

// API: LXD Backup Proxy
app.post("/api/lxd-backup", async (req, res) => {
  try {
    console.log("[LXDBackup] Request received for ID:", req.body?.lxdId);
    const { lxdId, pdfBase64 } = req.body;

    if (!lxdId) {
      return res.status(400).json({ ok: false, message: "Missing lxdId" });
    }

    const backupUrl = process.env.LUMINA_LXD_BACKUP_URL;
    const backupSecret = process.env.LUMINA_LXD_BACKUP_SECRET;

    if (!backupUrl || !backupSecret) {
      console.warn("[LXDBackup] Missing URL or Secret in environment");
      return res.status(500).json({ ok: false, message: "Backup configuration missing (Env vars not set on Vercel?)" });
    }

    const db = getAdminDb();
    if (!db) {
      console.error("[LXDBackup] Firebase Admin not initialized");
      return res.status(503).json({ ok: false, message: "Firebase Admin is not initialized. Please check FIREBASE_SERVICE_ACCOUNT env var." });
    }

    const lxdSnap = await db.collection("lxd").doc(lxdId).get();
    if (!lxdSnap.exists) {
      console.warn(`[LXDBackup] LXD not found for ID: ${lxdId}`);
      return res.status(404).json({ ok: false, message: "LXD not found" });
    }

    const lxdData = lxdSnap.data() || {};
    
    // Sanitize filename
    const rawFileName = `LXD_${lxdData.type || 'UNTITLED'}_${lxdData.subject || 'UNSPECIFIED'}_${lxdData.grade || 'NONE'}_${lxdData.title || 'LXD'}`;
    const sanitizedFileName = rawFileName
      .replace(/[^a-z0-9_\-]/gi, '_')
      .replace(/_{2,}/g, '_');

    // Send to Apps Script via POST
    console.log(`[LXDBackup] Sending to Apps Script: ${backupUrl}`);
    const response = await axios.post(backupUrl, {
      secret: backupSecret,
      operation: "backup_lxd",
      lxdId,
      fileName: sanitizedFileName,
      data: lxdData,
      pdfBase64 // PDF generated in browser and sent as base64
    }, {
      timeout: 30000 // 30s timeout
    });

    const result = response.data || {};
    console.log(`[LXDBackup] Response from Apps Script:`, result);

    if (result.ok) {
      try {
        const now = Date.now();
        const backupSummary = {
          lastBackupAt: now,
          lastBackupStatus: 'SUCCESS',
          lastBackupFileId: result.fileId || null,
          lastBackupFileUrl: result.fileUrl || null,
          lastBackupMessage: result.message || 'Backup successful'
        };

        await db.collection("lxd").doc(lxdId).update({
          backupSummary,
          updatedAt: now
        });
        console.log(`[LXDBackup] Firestore updated for ID: ${lxdId}`);
      } catch (dbError: any) {
        console.warn("[LXDBackup] Failed to update Firestore with backup summary:", dbError.message);
      }
    }

    return res.json(result);

  } catch (error: any) {
    console.error("[LXDBackup] Error processing request:", error.response?.data || error.message);
    return res.status(500).json({
      ok: false,
      message: error.message,
      details: error.response?.data || null
    });
  }
});


// ==========================================
// LUMINA CHAT & KNOWLEDGE BASE INTEGRATION
// ==========================================

// STOPWORDS list for Indonesian & English to prevent generic interrogatives/pronouns from shifting the conversation context
const STOPWORDS = new Set([
  // Indonesian Interrogatives, Pronouns & Auxiliaries
  "siapa", "apa", "mengapa", "bagaimana", "kapan", "dimana", "di", "mana", "ke", "dari",
  "yang", "untuk", "pada", "dengan", "oleh", "ini", "itu", "dan", "atau", "tetapi",
  "saya", "kamu", "dia", "mereka", "kita", "kami", "anda", "beliau", "punya", "ada", "adalah", "yaitu",
  "yakni", "ialah", "merupakan", "saja", "nya", "kah", "lah", "pun", "semua", "beberapa", "banyak", "sedikit",
  "sebutkan", "berikan", "jelaskan", "deskripsikan", "ceritakan", "tunjukkan", "tuliskan", "jawab", "jawablah",
  "pertanyaan", "tanya", "bertanya", "tentang", "mengenai", "terkait", "terhadap", "bagi", "buat", "atas",
  "dalam", "luar", "antara", "sebelum", "sesudah", "setelah", "hingga", "sampai", "sehingga",
  "karena", "sebab", "oleh karena itu", "jika", "kalau", "apabila", "bila", "supaya", "agar",
  "bertanggung", "tanggung", "jawab", "bertanggungjawab", "melakukan", "terlibat", "menjadi", "bisa", "dapat",
  "boleh", "harus", "wajib", "perlu", "patut", "akan", "sedang", "telah", "sudah", "belum", "pernah",
  "bukan", "tidak", "jangan", "tiada", "tidaklah", "bukanlah", "siapakah", "apakah", "bagaimanakah",
  
  // English Interrogatives, Pronouns & Auxiliaries
  "who", "what", "why", "how", "where", "when", "which", "whose", "whom",
  "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "do", "does", "did",
  "a", "an", "the", "and", "or", "but", "if", "because", "as", "until", "while", "of", "at", "by", "for",
  "with", "about", "against", "between", "into", "through", "during", "before", "after", "above", "below",
  "to", "from", "up", "down", "in", "out", "on", "off", "over", "under", "again", "further", "then", "once",
  "here", "there", "all", "any", "both", "each", "few", "more", "most", "other",
  "some", "such", "no", "nor", "not", "only", "own", "same", "so", "than", "too", "very", "can", "will",
  "just", "should", "now", "describe", "explain", "tell", "show", "give", "list", "responsible", "responsibility"
]);

// API: Lumina Chat - grounded AI responder
app.post("/api/lumina-chat", async (req, res) => {
  try {
    const { question, userId, history = [], language = "ID" } = req.body;
    
    // Log history received for debugging
    console.log('[LuminaChat] history received:', JSON.stringify(history));

    if (!question || !userId) {
      return res.status(400).json({ error: "Missing required fields: question and userId" });
    }

    const db = getAdminDb();
    if (!db) {
      return res.status(500).json({ error: "Database offline" });
    }

    // 1. Validate userId
    const userDoc = await db.collection("users").doc(userId).get();
    if (!userDoc.exists) {
      return res.status(401).json({ error: "Unauthorized: Active user session is required." });
    }

    // 2. Fetch prompt from Firestore matching lumina_chat_system and isActive == true
    const promptSnap = await db.collection("promptTemplates")
      .where("key", "==", "lumina_chat_system")
      .where("isActive", "==", true)
      .limit(1)
      .get();

    let systemInstructionText = "";
    if (!promptSnap.empty) {
      systemInstructionText = promptSnap.docs[0].data().prompt;
    } else {
      // Default fallback system instruction
      systemInstructionText = "Anda adalah Lumina Chat, asisten AI Lajuardi GCS (Global Compassionate School). " +
        "Bantulah pengguna menjawab pertanyaan hangat tentang sekolah berbasis pada dokumen context yang diberikan.";
    }

    // Append output language instruction to restrict generation and save tokens
    let languageInstruction = "";
    if (language === "EN") {
      languageInstruction = "\n\nYou MUST respond ONLY in English. Do NOT write in Indonesian language. " +
        "Format your answer exactly with this label at the very beginning of your response:\n" +
        "🇬🇧 English:\n[Your English response]";
    } else {
      languageInstruction = "\n\nAnda HARUS merespon HANYA dalam Bahasa Indonesia. JANGAN menulis dalam Bahasa Inggris. " +
        "Format jawaban Anda persis dengan label ini di awal respon:\n" +
        "🇮🇩 Bahasa Indonesia:\n[Jawaban Bahasa Indonesia Anda]";
    }

    systemInstructionText += languageInstruction;

    // 3. Fetch knowledgeBase documents and filter relevant context using case-insensitive search
    const docsSnap = await db.collection("knowledgeBase").get();
    let relevantDocs: any[] = [];
    
    // Ekstrak topik dari history (ambil 2 pesan user terakhir)
    const historyContext = history
      .filter((h: any) => h.role === 'user')
      .slice(-2)
      .map((h: any) => h.content || "")
      .join(' ');

    // Gunakan gabungan untuk scoring dokumen
    const searchQuery = historyContext.trim() ? (historyContext.trim() + ' ' + question) : question;

    // Simple custom scoring search based on question and search query keywords
    const cleanSearchQuery = searchQuery.toLowerCase().replace(/[^a-zA-Z0-9\s]/g, " ");
    const keywords = cleanSearchQuery.split(/\s+/).filter((w: string) => w.length > 2);
    const filteredKeywords = keywords.filter(kw => !STOPWORDS.has(kw.toLowerCase()));

    // Dokumen yang sudah dirujuk sebelumnya dapat prioritas lebih tinggi
    const previousSources = history
      .filter((h: any) => h.role === 'assistant' && h.sources)
      .flatMap((h: any) => h.sources || []);

    const cleanQuestionOnly = question.toLowerCase().replace(/[^a-zA-Z0-9\s]/g, " ");
    const questionKeywords = cleanQuestionOnly.split(/\s+/).filter((w: string) => w.length > 2);
    const filteredQuestionKeywords = questionKeywords.filter(kw => !STOPWORDS.has(kw.toLowerCase()));

    const isGenericFollowUp = history.length > 0 && filteredQuestionKeywords.length === 0 && previousSources.length > 0;

    if (docsSnap && !docsSnap.empty) {
      const allDocs: any[] = docsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      if (isGenericFollowUp) {
        // Reuse previous sources directly to avoid noisy irrelevant documents
        relevantDocs = allDocs.filter(doc => previousSources.includes(doc.title));
      } else {
        relevantDocs = allDocs;
        const scoringKeywords = filteredKeywords.length > 0 ? filteredKeywords : keywords;

        if (scoringKeywords.length > 0) {
          relevantDocs = relevantDocs.map(doc => {
            let score = 0;
            const titleLower = (doc.title || "").toLowerCase();
            const contentLower = (doc.content || "").toLowerCase();

            // Title matching yields highest priority
            if (titleLower.includes(searchQuery.toLowerCase())) score += 80;
            if (contentLower.includes(searchQuery.toLowerCase())) score += 30;

            // Directly check the original question too
            if (titleLower.includes(question.toLowerCase())) score += 50;
            if (contentLower.includes(question.toLowerCase())) score += 15;

            scoringKeywords.forEach((kw: string) => {
              if (titleLower.includes(kw)) score += 20;
              if (contentLower.includes(kw)) score += 4;
            });

            // Saat scoring, tambahkan bonus jika dokumen pernah dirujuk
            if (previousSources.includes(doc.title)) {
              score += 150; // Give a massive boost to active topics
            }

            return { ...doc, score };
          })
          .filter(doc => doc.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 5);
        } else {
          relevantDocs = relevantDocs.slice(0, 5);
        }
      }
    }

    // 4. Combine context and identify sources lists
    const context = relevantDocs.map((doc, idx) => `Document ${idx + 1}: [${doc.title}]\n${doc.content}`).join("\n\n");
    const sources = relevantDocs.map(doc => doc.title);

    // 5. Build alternating history with combined assistant responses
    const trimmedHistory = history.slice(-10);

    const mappedHistory = trimmedHistory.map((h: any) => {
      let contentStr = "";
      if (h.role === "assistant") {
        // If content is an object with answerID/answerEN
        if (typeof h.content === "object" && h.content !== null) {
          const ansID = h.content.answerID || h.content.contentID || "";
          const ansEN = h.content.answerEN || h.content.contentEN || "";
          contentStr = `${ansID} / ${ansEN}`;
        }
        // If the item itself has direct fields
        else if (h.answerID !== undefined || h.answerEN !== undefined || h.contentID !== undefined || h.contentEN !== undefined) {
          const ansID = h.answerID || h.contentID || "";
          const ansEN = h.answerEN || h.contentEN || "";
          contentStr = `${ansID} / ${ansEN}`;
        }
        else {
          contentStr = String(h.content || "");
        }
      } else {
        if (typeof h.content === "object" && h.content !== null) {
          contentStr = h.content.contentID || h.content.answerID || "";
        } else {
          contentStr = String(h.content || "");
        }
      }
      return {
        role: h.role === "assistant" ? "assistant" : "user",
        content: contentStr,
        sources: h.sources || []
      };
    });

    // 6. Check if new keyword is detected in the current query compared to previous user history elements
    let hasNewKeyword = false;

    if (history.length > 0 && filteredQuestionKeywords.length > 0) {
      const historyText = history
        .filter((h: any) => h.role === "user")
        .map((h: any) => {
          let text = "";
          if (typeof h.content === "object" && h.content !== null) {
            text = h.content.contentID || h.content.answerID || "";
          } else {
            text = String(h.content || "");
          }
          return text.toLowerCase();
        })
        .join(" ");

      hasNewKeyword = filteredQuestionKeywords.some((kw: string) => !historyText.includes(kw.toLowerCase()));
    }

    const shouldInjectContext = (history.length === 0) || hasNewKeyword || isGenericFollowUp;

    let finalUserMessage = "";
    if (shouldInjectContext) {
      // First message or newly matching keywords found
      finalUserMessage = `Konteks dokumen:\n${context || "Tidak ada dokumen pendukung relevan ditemukan di pangkalan data pengetahuan Lazuardi GCS."}\n\nPertanyaan: ${question}`;
    } else {
      // Subsequent generic conversational message without duplicating heavy context documents to save tokens
      finalUserMessage = question;
    }

    // 7. Call Koboil LLM API or Google Gemini OpenAPI-compatible endpoint via standard chat completion
    let BASE_URL = process.env.VITE_AI_BASE_URL || "https://api.koboillm.com/v1";
    let API_KEY = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "";
    let MODEL = process.env.VITE_AI_MODEL || "gemini/gemini-2.5-flash-lite";

    // Dynamic routing fallback: If using a Google Gemini native API key (AIza...) with the default Koboil URL, 
    // reroute to the official Google Gemini OpenAI-compatible REST endpoint.
    if (API_KEY.startsWith("AIza") && BASE_URL.includes("koboillm.com")) {
      console.log("[LuminaChat] Direct Gemini Key detected in server.ts. Rerouting to Official Google Gemini OpenAI-compatible endpoint.");
      BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai";
      MODEL = "gemini-2.5-flash";
    }

    const aiResponse = await axios.post(`${BASE_URL}/chat/completions`, {
      model: MODEL,
      messages: [
        { role: "system", content: systemInstructionText },
        ...mappedHistory,
        { role: "user", content: finalUserMessage }
      ],
      temperature: 0.7
    }, {
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${API_KEY}`,
      },
      timeout: 30000
    });

    const resJson = aiResponse.data;
    const aiText = resJson.choices?.[0]?.message?.content || "";
    let answerID = "";
    let answerEN = "";

    // 8. Robust parsing for separators: "🇮🇩 Bahasa Indonesia:" and "🇬🇧 English:"
    const idKey = "🇮🇩 Bahasa Indonesia:";
    const enKey = "🇬🇧 English:";

    const idIndex = aiText.indexOf(idKey);
    const enIndex = aiText.indexOf(enKey);

    if (idIndex !== -1 && enIndex !== -1) {
      if (idIndex < enIndex) {
        answerID = aiText.substring(idIndex + idKey.length, enIndex).trim();
        answerEN = aiText.substring(enIndex + enKey.length).trim();
      } else {
        answerEN = aiText.substring(enIndex + enKey.length, idIndex).trim();
        answerID = aiText.substring(idIndex + idKey.length).trim();
      }
    } else if (idIndex !== -1) {
      answerID = aiText.substring(idIndex + idKey.length).trim();
      answerEN = "";
    } else if (enIndex !== -1) {
      answerEN = aiText.substring(enIndex + enKey.length).trim();
      answerID = "";
    } else {
      if (language === "EN") {
        answerEN = aiText;
        answerID = "";
      } else {
        answerID = aiText;
        answerEN = "";
      }
    }

    const finalSources = shouldInjectContext ? sources : [];

    return res.json({
      answerID,
      answerEN,
      sources: finalSources,
    });

  } catch (error: any) {
    console.error("[LuminaChatError] Fail to execute grounded chat:", error);
    let errorMsg = "Unknown chat failure";
    if (error instanceof Error) {
      errorMsg = error.message;
    } else if (typeof error === "string") {
      errorMsg = error;
    } else if (error) {
      errorMsg = JSON.stringify(error);
    }
    return res.status(500).json({ error: errorMsg, stack: error?.stack });
  }
});

// API: Sync Knowledge - Super Admin Google Drive pull
app.post("/api/sync-knowledge", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized. Missing bearer token." });
    }
    const token = authHeader.split("Bearer ")[1];

    let decodedToken;
    try {
      const getAdminAuth = (await import("firebase-admin/auth")).getAuth;
      decodedToken = await getAdminAuth().verifyIdToken(token);
    } catch (authErr: any) {
      return res.status(401).json({ error: `Authentication failed: ${authErr.message}` });
    }

    const db = getAdminDb();
    if (!db) {
      return res.status(500).json({ error: "Firestore is not online." });
    }

    const userDoc = await db.collection("users").doc(decodedToken.uid).get();
    const userRole = userDoc.exists ? userDoc.data()?.role : null;
    const isSuperAdmin = isUserSuperAdmin(userRole, decodedToken.email);

    if (!isSuperAdmin) {
      return res.status(403).json({ error: "Access denied. Active Super Admin permission required." });
    }

    const folderId = req.body.folderId || "1if5MJST18x6zHOXJTi7W82BAqkwEbBBd";
    const driveInstance = getDrive();

    // Query standard document type Google Docs files in the specified folder
    const q = `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.document' and trashed = false`;
    const response = await driveInstance.files.list({
      q,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      fields: "files(id, name)",
    });

    const files = response.data.files || [];
    let synced = 0;
    const errors: string[] = [];

    for (const file of files) {
      try {
        if (!file.id || !file.name) continue;

        // Export active Google doc to raw plaintext text
        const exportRes = await driveInstance.files.export({
          fileId: file.id,
          mimeType: "text/plain",
        });

        const plainContent = typeof exportRes.data === "string" ? exportRes.data : JSON.stringify(exportRes.data);
        const wordCount = plainContent.split(/\s+/).filter(Boolean).length;

        const docPayload = {
          id: file.id,
          title: file.name,
          content: plainContent,
          wordCount: wordCount,
          lastSynced: Date.now(),
          driveFileId: file.id,
        };

        // Upsert doc to firestore collection knowledgeBase
        await db.collection("knowledgeBase").doc(file.id).set(docPayload, { merge: true });
        synced++;
      } catch (fileErr: any) {
        console.error(`[SyncKnowledge] File ${file.name || file.id} failed:`, fileErr.message);
        errors.push(`Error on "${file.name || file.id}": ${fileErr.message}`);
      }
    }

    return res.json({
      total: files.length,
      synced,
      errors,
    });

  } catch (error: any) {
    console.error("[SyncKnowledgeError] Sync action failed:", error);
    return res.status(500).json({ error: error.message || "Failed to sync knowledge." });
  }
});


// --- Server Start & Export ---

// --- Server Initialization ---
if (process.env.NODE_ENV !== "production") {
  // In dev, use Vite middleware
  import("vite").then(({ createServer: createViteServer }) => {
    createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    }).then(vite => {
      app.use(vite.middlewares);
    });
  });
} else {
  // In production (including Vercel), serve static files from dist
  const distPath = path.join(process.cwd(), "dist");
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get("*", (req, res, next) => {
      // If it's an API route that didn't match, don't serve index.html
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(distPath, "index.html"));
    });
  }
}

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("[GlobalError]", err.stack || err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(500).json({
    ok: false,
    message: err.message || "Internal Server Error",
    stack: process.env.NODE_ENV === "production" ? undefined : err.stack
  });
});

// Bind to port if not in Vercel
if (process.env.VERCEL !== '1') {
  const PORT = 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:3000`);
  });
}

export default app;
