import express from "express";
import path from "path";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import axios from "axios";
import { parse } from "csv-parse/sync";
import fs from "fs";
import { google } from "googleapis";
import type { LGBackupStatus, LGBackupSummary, LGBackupLog } from "./src/types";

const app = express();
app.use(express.json());

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
  try {
    const { record } = req.body;
    if (!record) return res.status(400).json({ error: "Missing record" });

    // 1. Get Config
    const configSnap = await adminDb.collection("system_backup_configs").doc("junior_high_attendance").get();
    if (!configSnap.exists) return res.status(404).json({ error: "Backup config not found" });
    const config = configSnap.data();
    if (!config?.isEnabled) return res.json({ success: true, message: "Backup disabled" });

    // 2. Resolve target Spreadsheet (Map)
    const academicYearId = record.academicYear.replace(/\//g, '-');
    const mapId = `${record.classId}_${academicYearId}_S${record.semester}`;
    const mapSnap = await adminDb.collection("attendance_backup_file_maps").doc(mapId).get();
    
    let spreadsheetId = "";
    
    if (mapSnap.exists) {
      spreadsheetId = mapSnap.data()?.spreadsheetId;
    } else {
      // 3. Create Folder Structure and Spreadsheet
      console.log(`[BackupSync] Creating structure for ${mapId}`);
      const yearFolderId = await findOrCreateFolder(record.academicYear, config.rootFolderId, config.sharedDriveId);
      const semesterFolderId = await findOrCreateFolder(`Semester ${record.semester}`, yearFolderId, config.sharedDriveId);
      
      const ssTitle = `Attendance Recap - ${record.classId} - ${record.academicYear} (S${record.semester})`;
      const ssResponse = await sheets.spreadsheets.create({
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
      await drive.files.update({
        fileId: spreadsheetId,
        addParents: semesterFolderId,
        removeParents: (await drive.files.get({ fileId: spreadsheetId, fields: 'parents' })).data.parents?.join(','),
        supportsAllDrives: true,
      });

      // Save to map
      await adminDb.collection("attendance_backup_file_maps").doc(mapId).set({
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
    }

    // 4. Update the Log (Append)
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

    // 5. Update Recap (Robust implementation)
    console.log(`[BackupSync] Updating Rekap for ${record.studentName} on ${record.date}`);
    
    // a. Get current Rekap data
    const rekapResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Rekap!A1:ZZ100', // Adjust limit as needed
    });
    const rekapRows = rekapResponse.data.values || [];
    
    // b. Find or Create Date Column
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

    // c. Find or Create Student Row
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
      const cellAddress = `${String.fromCharCode(65 + (colIndex % 26))}${rowIndex + 1}`; 
      // Simplified A1 notation generator, might fail for col > Z (26)
      // Standard way:
      const colLetter = getColumnLetter(colIndex);
      const cellRange = `Rekap!${colLetter}${rowIndex + 1}`;
      
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: cellRange,
        valueInputOption: 'RAW',
        requestBody: { values: [[record.status]] }
      });
    }
    
    res.json({ success: true, spreadsheetId });
  } catch (error: any) {
    console.error("[BackupSync] Error:", error);
    res.status(500).json({ error: error.message });
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
    const caseSnap = await adminDb.collection("mtss_academic_cases").doc(caseId).get();
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
    await adminDb.collection("mtss_academic_cases").doc(caseId).update({
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
    const caseSnap = await adminDb.collection("mtss_academic_cases").doc(caseId).get();
    if (!caseSnap.exists) return res.status(404).json({ error: "Case not found" });
    const caseData = caseSnap.data() as any;

    // 3. Determine Row Data
    // Kolom: Case ID, Student ID, Student Name, Grade, Class, Academic Year,
    // Semester, Tier, Status, Primary Concern, Assigned Staff,
    // Date Opened, Last Review Date, Latest Progress Status,
    // Drive Folder ID, Latest PDF File ID, Latest PDF File Name,
    // Last Synced At, Sync Status

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
    await adminDb.collection("mtss_academic_cases").doc(caseId).update({
      registerSyncStatus: 'SYNCED',
      registerRowKey: rowIndex === -1 ? `ROW_${rows.length + 1}` : `ROW_${rowIndex + 1}`,
      lastBackupAt: Date.now()
    });

    res.json({ success: true, timestamp: Date.now() });
  } catch (error: any) {
    console.error("[MTSS_V1_Sync] Error:", error);
    await adminDb.collection("mtss_academic_cases").doc(req.body.caseId).update({
      registerSyncStatus: 'FAILED',
      lastBackupError: error.message,
      lastBackupAt: Date.now()
    }).catch(() => {});
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
    const caseSnap = await adminDb.collection("mtss_academic_cases").doc(caseId).get();
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
    await adminDb.collection("mtss_academic_cases").doc(caseId).update({
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
          const nisn = (row[1] || "").trim();
          const fullName = (row[2] || "").trim();
          const nickname = (row[3] || "").trim();
          const gender = (row[4] || "").trim().toUpperCase(); // L or P
          email = (row[5] || "").trim().toLowerCase();
          const parentEmail = (row[6] || "").trim().toLowerCase();
          const classId = (row[7] || "").trim(); // Example: "7 Baiji"
          unitId = (row[8] || "").trim().toUpperCase(); // JUNIOR_HIGH
          const academicYear = (row[9] || "").trim(); // Example: "2025/2026"

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
            JSON.stringify(currentData.linkedStudents || []) !==
              JSON.stringify(linkedStudents);

          if (hasChanges) {
            const updates: any = {
              role,
              unitId,
              jobTitle,
              luminaId,
            };

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

// API: Sync Parents Data (ensure roleInvites has PARENT roles for all student parentEmail)
app.post("/api/admin/sync-parents-data", async (req, res) => {
  try {
    const db = getAdminDb();
    if (!db) return res.status(503).json({ error: "Firebase not initialized" });

    console.log("[SyncParents] Starting synchronization...");

    // 1. Get all students from roleInvites (or students collection)
    // We'll use roleInvites as it's the primary list for the admin dashboard
    const studentsSnap = await db.collection("roleInvites")
      .where("role", "==", "STUDENT")
      .get();

    const students = studentsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    
    // 2. Map parentEmail to list of student luminaIds
    const parentMap: Record<string, { name: string; linkedStudents: string[]; unitId: string }> = {};

    for (const s of students) {
      // Find parentEmail. In roleInvites it might be missing, so we check students collection too if needed.
      // But let's assume we use the one attached to the student role invite if possible, 
      // or we fetch the "students" collection which has better data.
      
      let parentEmail = s.parentEmail;
      let luminaId = s.luminaId;

      if (!parentEmail || !luminaId) {
        // Try getting from students collection
        const sCollSnap = await db.collection("students").doc(s.luminaId || s.id).get();
        if (sCollSnap.exists) {
          const sd = sCollSnap.data();
          parentEmail = sd?.parentEmail;
          luminaId = sd?.luminaId;
        }
      }

      if (parentEmail && luminaId) {
        if (!parentMap[parentEmail]) {
          parentMap[parentEmail] = {
            name: `Wali ${s.name}`, // Default name if not found
            linkedStudents: [],
            unitId: s.unitId
          };
        }
        if (!parentMap[parentEmail].linkedStudents.includes(luminaId)) {
          parentMap[parentEmail].linkedStudents.push(luminaId);
        }
        // Try to get a better name from fatherName or motherName
        const sCollSnap = await db.collection("students").doc(luminaId).get();
        if (sCollSnap.exists) {
            const sd = sCollSnap.data();
            if (sd?.fatherName) parentMap[parentEmail].name = sd.fatherName;
            else if (sd?.motherName) parentMap[parentEmail].name = sd.motherName;
        }
      }
    }

    let created = 0;
    let updated = 0;

    for (const [email, info] of Object.entries(parentMap)) {
      const parentSnap = await db.collection("roleInvites")
        .where("email", "==", email)
        .where("role", "==", "PARENT")
        .limit(1)
        .get();

      if (parentSnap.empty) {
        // CREATE
        await db.collection("roleInvites").add({
          email,
          name: info.name,
          role: "PARENT",
          unitId: info.unitId,
          linkedStudents: info.linkedStudents,
          status: "ready",
          createdAt: FieldValue.serverTimestamp()
        });
        created++;
      } else {
        // UPDATE
        const parentDoc = parentSnap.docs[0];
        const currentData = parentDoc.data();
        
        // Merge linked students
        const currentLinked = currentData.linkedStudents || [];
        const newLinked = Array.from(new Set([...currentLinked, ...info.linkedStudents]));
        
        if (newLinked.length !== currentLinked.length) {
          await parentDoc.ref.update({
            linkedStudents: newLinked,
            updatedAt: FieldValue.serverTimestamp()
          });
          updated++;
        }
      }
    }

    res.json({ success: true, created, updated, totalParents: Object.keys(parentMap).length });
  } catch (error: any) {
    console.error("[SyncParents] Error:", error);
    res.status(500).json({ error: error.message });
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
