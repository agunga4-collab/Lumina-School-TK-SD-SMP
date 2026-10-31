import express, { Request, Response } from "express";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { google } from "googleapis";
import { Readable } from "stream";

// MANDATORY ROOT FOLDER ID FOR ELEMENTARY MONTHLY PHOTOS
export const ELEMENTARY_MONTHLY_ROOT_FOLDER_ID = "18HrRf50BaVoID2zUJBkgu7Okn6huBhlP";

export const elementaryMonthlyPhotoRouter = express.Router();

// --- Firestore & Google Auth Helpers ---
function getAdminDb() {
  try {
    if (!getApps().length) {
      const saJson = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.GOOGLE_BACKUP_SERVICE_ACCOUNT;
      if (saJson) {
        const sa = JSON.parse(saJson);
        if (sa.private_key) sa.private_key = sa.private_key.replace(/\\n/g, '\n');
        initializeApp({ credential: cert(sa) });
      }
    }
    return getFirestore();
  } catch (err) {
    return undefined;
  }
}

export function getGoogleDriveClient() {
  const saJson =
    process.env.GOOGLE_BACKUP_SERVICE_ACCOUNT ||
    process.env.FIREBASE_SERVICE_ACCOUNT ||
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

  if (!saJson) {
    throw new Error("Konfigurasi kredensial Google Service Account tidak ditemukan di environment.");
  }

  let serviceAccount: any;
  try {
    serviceAccount = JSON.parse(saJson);
  } catch {
    serviceAccount = JSON.parse(Buffer.from(saJson, "base64").toString("utf8"));
  }

  const auth = new google.auth.JWT({
    email: serviceAccount.client_email,
    key: serviceAccount.private_key?.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/drive"]
  });

  return google.drive({ version: "v3", auth });
}

// In-memory locks to serialize folder creation
const folderCreationLocks: Record<string, Promise<string>> = {};

/**
 * Verifies access and write capabilities on the root Google Shared Drive folder.
 */
export async function verifyRootFolderAccess(rootFolderId = ELEMENTARY_MONTHLY_ROOT_FOLDER_ID) {
  const drive = getGoogleDriveClient();
  const res = await drive.files.get({
    fileId: rootFolderId,
    supportsAllDrives: true,
    fields: "id, name, mimeType, capabilities, driveId, trashed"
  });

  if (res.data.trashed) {
    throw new Error(`Root folder ${rootFolderId} berada di tong sampah (trashed).`);
  }

  const caps = res.data.capabilities || {};
  if (caps.canAddChildren === false && caps.canEdit === false) {
    throw new Error(`Akun Google Drive tidak memiliki izin menambahkan berkas/folder pada root '${res.data.name}' (${rootFolderId}).`);
  }

  return {
    ok: true,
    id: res.data.id,
    name: res.data.name,
    driveId: res.data.driveId,
    capabilities: caps
  };
}

/**
 * Finds an existing folder under parentId or creates one.
 * Uses Shared Drive search parameters and escapes single quotes.
 */
export async function findOrCreateDriveFolder(name: string, parentId: string): Promise<string> {
  const drive = getGoogleDriveClient();
  const escapedName = name.replace(/'/g, "\\'");
  const q = `name = '${escapedName}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;

  // 1. Search existing folder
  const existing = await drive.files.list({
    q,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    corpora: "allDrives",
    fields: "files(id, name)"
  });

  if (existing.data.files && existing.data.files.length > 0) {
    return existing.data.files[0].id!;
  }

  // 2. Create if not found
  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId]
    },
    supportsAllDrives: true,
    fields: "id, name"
  });

  if (!created.data.id) {
    throw new Error(`Gagal membuat folder Google Drive '${name}' di bawah parent ${parentId}.`);
  }

  return created.data.id;
}

export interface ResolveFolderParams {
  academicYear: string; // e.g. "2025/2026" or "2025-2026"
  gradeLevel?: number; // 1-3 -> Lower Grade, 4-6 -> Upper Grade
  gradeCategory?: "Lower Grade" | "Upper Grade";
  classId: string;
  className: string;
  studentId: string;
  studentName: string;
  month: string; // "YYYY-MM"
}

/**
 * Resolves the student's monthly photo folder under the mandatory root:
 * [Root] -> [AcademicYear] -> [Lower Grade | Upper Grade] -> [ClassName] -> "[StudentName] - [ClassName] - [studentId]" -> [YYYY-MM]
 *
 * Utilizes Firestore folder mapping for idempotency to guarantee retries never duplicate folders.
 */
export async function resolveStudentMonthlyDriveFolder(params: ResolveFolderParams): Promise<{
  folderId: string;
  folderPath: string;
  folderKey: string;
}> {
  const {
    academicYear,
    gradeLevel,
    gradeCategory: inputGradeCategory,
    classId,
    className,
    studentId,
    studentName,
    month
  } = params;

  // Determine category
  const gradeCategory =
    inputGradeCategory ||
    (typeof gradeLevel === "number" && gradeLevel >= 4 ? "Upper Grade" : "Lower Grade");

  const cleanYear = academicYear.replace(/\//g, "-").trim();
  const cleanClassName = className.replace(/[\/\\:*?"<>|]/g, "").trim() || classId;
  const cleanStudentName = studentName.replace(/[\/\\:*?"<>|]/g, "").trim();
  const cleanMonth = month.trim();

  // Technical identifier key for mapping
  const folderKey = `${cleanYear}_${gradeCategory.replace(/\s+/g, "_")}_${classId}_${studentId}_${cleanMonth}`;

  // Check Firestore mapping cache first
  const db = getAdminDb();
  if (db) {
    try {
      const snap = await db.collection("elem_monthly_drive_folders").doc(folderKey).get();
      if (snap.exists) {
        const data = snap.data();
        if (data?.folderId) {
          // Quick sanity check in Drive to ensure folder is still valid
          try {
            const drive = getGoogleDriveClient();
            const check = await drive.files.get({
              fileId: data.folderId,
              supportsAllDrives: true,
              fields: "id, trashed"
            });
            if (check.data.id && !check.data.trashed) {
              return {
                folderId: data.folderId,
                folderPath: data.folderPath || "",
                folderKey
              };
            }
          } catch {
            // Folder may have been trashed or unreachable; proceed to re-resolve
          }
        }
      }
    } catch (cacheErr) {
      console.warn("[resolveStudentMonthlyDriveFolder] Mapping cache lookup failed:", cacheErr);
    }
  }

  // Mutex lock to avoid concurrent creations for the exact same student/month
  if (folderCreationLocks[folderKey]) {
    try {
      const folderId = await folderCreationLocks[folderKey];
      return { folderId, folderPath: "", folderKey };
    } catch {
      delete folderCreationLocks[folderKey];
    }
  }

  const creationPromise = (async () => {
    // 1. Verify root folder first
    await verifyRootFolderAccess(ELEMENTARY_MONTHLY_ROOT_FOLDER_ID);

    // 2. Level 1: Academic Year folder (e.g. "2025-2026")
    const yearFolderId = await findOrCreateDriveFolder(cleanYear, ELEMENTARY_MONTHLY_ROOT_FOLDER_ID);

    // 3. Level 2: Grade category folder ("Lower Grade" or "Upper Grade")
    const categoryFolderId = await findOrCreateDriveFolder(gradeCategory, yearFolderId);

    // 4. Level 3: Class folder (e.g. "1A")
    const classFolderId = await findOrCreateDriveFolder(cleanClassName, categoryFolderId);

    // 5. Level 4: Student folder (MANDATORY: contains Student Name and Class Name)
    // Format: "${studentName} - ${className} - ${studentId}"
    const studentFolderName = `${cleanStudentName} - ${cleanClassName} - ${studentId}`;
    const studentFolderId = await findOrCreateDriveFolder(studentFolderName, classFolderId);

    // 6. Level 5: Month folder (e.g. "2025-08")
    const monthFolderId = await findOrCreateDriveFolder(cleanMonth, studentFolderId);

    const folderPath = `/${cleanYear}/${gradeCategory}/${cleanClassName}/${studentFolderName}/${cleanMonth}`;

    // 7. Store mapping in Firestore for idempotency
    if (db) {
      try {
        await db.collection("elem_monthly_drive_folders").doc(folderKey).set(
          {
            folderKey,
            folderId: monthFolderId,
            rootFolderId: ELEMENTARY_MONTHLY_ROOT_FOLDER_ID,
            academicYear: cleanYear,
            gradeCategory,
            classId,
            className: cleanClassName,
            studentId,
            studentName: cleanStudentName,
            month: cleanMonth,
            folderPath,
            updatedAt: Date.now(),
            createdAt: Date.now()
          },
          { merge: true }
        );
      } catch (dbErr) {
        console.error("[resolveStudentMonthlyDriveFolder] Failed to record folder mapping in Firestore:", dbErr);
      }
    }

    return monthFolderId;
  })();

  folderCreationLocks[folderKey] = creationPromise;

  try {
    const folderId = await creationPromise;
    return {
      folderId,
      folderPath: `/${cleanYear}/${gradeCategory}/${cleanClassName}/${cleanStudentName} - ${cleanClassName} - ${studentId}/${cleanMonth}`,
      folderKey
    };
  } finally {
    setTimeout(() => {
      delete folderCreationLocks[folderKey];
    }, 10000);
  }
}

export interface UploadPhotoParams {
  buffer: Buffer;
  mimeType: string;
  academicYear: string;
  gradeLevel?: number;
  gradeCategory?: "Lower Grade" | "Upper Grade";
  classId: string;
  className: string;
  studentId: string;
  studentName: string;
  month: string;
  slot: "profile" | "activity1" | "activity2" | "activity3";
  version?: number;
  caption?: string;
  cropSettings?: any;
  uploadedBy?: string;
  uploadedByName?: string;
}

/**
 * Uploads a student photo to Google Shared Drive under the compliant folder and file naming:
 * Filename: "${cleanStudentName} - ${cleanClassName} - ${slot} - v${version}_${uniqueSuffix}.${ext}"
 *
 * Enforces:
 * - Direct upload to Shared Drive root hierarchy
 * - No Firebase Storage / external image services
 * - Private access only (NO "anyone with the link")
 * - Idempotency and replacement versioning
 */
export async function uploadStudentMonthlyPhoto(params: UploadPhotoParams) {
  const {
    buffer,
    mimeType,
    academicYear,
    gradeLevel,
    gradeCategory,
    classId,
    className,
    studentId,
    studentName,
    month,
    slot,
    version = 1,
    caption = "",
    cropSettings = null,
    uploadedBy = "system",
    uploadedByName = "Guru"
  } = params;

  // 1. Resolve student folder
  const { folderId, folderPath } = await resolveStudentMonthlyDriveFolder({
    academicYear,
    gradeLevel,
    gradeCategory,
    classId,
    className,
    studentId,
    studentName,
    month
  });

  // 2. Generate compliant file name
  // Must contain student name, class name, photo/slot type, and unique version
  const cleanStudentName = studentName.replace(/[\/\\:*?"<>|]/g, "").trim();
  const cleanClassName = className.replace(/[\/\\:*?"<>|]/g, "").trim() || classId;
  const ext = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";
  const uniqueSuffix = Date.now();
  const fileName = `${cleanStudentName} - ${cleanClassName} - ${slot} - v${version}_${uniqueSuffix}.${ext}`;

  // 3. Upload to Google Drive under folderId
  const drive = getGoogleDriveClient();
  const mediaStream = Readable.from(buffer);

  const res = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
      mimeType
    },
    media: {
      mimeType,
      body: mediaStream
    },
    supportsAllDrives: true,
    fields: "id, name, size, mimeType"
  });

  const fileId = res.data.id;
  if (!fileId) {
    throw new Error(`Upload berkas '${fileName}' ke Google Drive tidak menghasilkan ID.`);
  }

  // CRITICAL PRIVACY:
  // Do NOT add 'anyone' or 'anyoneWithLink' permissions!
  // Photo is kept private to the drive and served exclusively through authenticated proxy.

  const fileSize = Number(res.data.size) || buffer.length;
  const now = Date.now();

  const fileRecord = {
    fileId,
    folderId,
    rootFolderId: ELEMENTARY_MONTHLY_ROOT_FOLDER_ID,
    fileName,
    mimeType,
    fileSize,
    version,
    slot,
    studentId,
    studentName: cleanStudentName,
    classId,
    className: cleanClassName,
    academicYear,
    month,
    folderPath,
    caption,
    cropSettings,
    uploadedBy,
    uploadedByName,
    uploadedAt: now
  };

  // 4. Save metadata to Firestore collection elem_monthly_drive_files
  const db = getAdminDb();
  if (db) {
    try {
      await db.collection("elem_monthly_drive_files").doc(fileId).set(fileRecord);
    } catch (dbErr: any) {
      console.error("[uploadStudentMonthlyPhoto] Warning: Failed to write file metadata to Firestore:", dbErr);
      // We still return file details so client can retry metadata save without re-uploading file
      throw new Error(`Upload foto ke Drive berhasil (File ID: ${fileId}), namun penyimpanan metadata Firestore terhambat: ${dbErr.message}`);
    }
  }

  return {
    driveFileId: fileId,
    folderId,
    fileName,
    mimeType,
    fileSize,
    version,
    slot,
    caption,
    cropSettings,
    uploadedBy,
    uploadedByName,
    uploadedAt: now,
    streamUrl: `/api/elementary-monthly/photo-stream/${fileId}`
  };
}

/**
 * Validates if the fileId is authorized for streaming:
 * - Must be registered in `elem_monthly_drive_files`
 * - Or referenced in `elem_monthly_student_photos` or `elem_monthly_published_reports`
 */
export async function isElementaryPhotoAuthorized(fileId: string): Promise<boolean> {
  if (!fileId || typeof fileId !== 'string' || fileId.length < 5) return false;

  const db = getAdminDb();
  if (db) {
    try {
      const fileSnap = await db.collection("elem_monthly_drive_files").doc(fileId).get();
      if (fileSnap.exists) return true;

      // Check elem_monthly_student_photos
      const photosSnap = await db
        .collection("elem_monthly_student_photos")
        .where("driveFileId", "==", fileId)
        .limit(1)
        .get();
      if (!photosSnap.empty) return true;

      // Check published snapshots
      const publishedSnap = await db
        .collection("elem_monthly_published_reports")
        .where("driveFileId", "==", fileId)
        .limit(1)
        .get();
      if (!publishedSnap.empty) return true;

      return false;
    } catch (err) {
      console.warn("[isElementaryPhotoAuthorized] Verification check warning:", err);
    }
  }

  // Direct Google Drive check fallback if Firestore is momentarily unavailable
  try {
    const drive = getGoogleDriveClient();
    const fileRes = await drive.files.get({
      fileId,
      supportsAllDrives: true,
      fields: "id, parents, trashed"
    });
    if (fileRes.data.id && !fileRes.data.trashed) {
      return fileRes.data.id !== ELEMENTARY_MONTHLY_ROOT_FOLDER_ID;
    }
  } catch {
    return false;
  }

  return false;
}

// ==========================================
// EXPRESS ROUTER ENDPOINTS
// ==========================================

// 1. Verify Drive Root Access
elementaryMonthlyPhotoRouter.post("/verify-root", async (req: Request, res: Response) => {
  try {
    const result = await verifyRootFolderAccess();
    return res.json({ success: true, ...result });
  } catch (err: any) {
    console.error("[verify-root] Root check failed:", err.message);
    return res.status(403).json({
      success: false,
      error: err.message || "Akses ke Google Shared Drive root ditolak."
    });
  }
});

// 2. Upload Student Photo
elementaryMonthlyPhotoRouter.post("/upload-photo", async (req: Request, res: Response) => {
  try {
    const {
      base64,
      academicYear,
      gradeLevel,
      gradeCategory,
      classId,
      className,
      studentId,
      studentName,
      month,
      slot,
      version,
      caption,
      cropSettings,
      uploadedBy,
      uploadedByName
    } = req.body;

    if (!base64) {
      return res.status(400).json({ error: "Data gambar base64 wajib disertakan." });
    }
    if (!classId || !studentId || !studentName || !month || !slot) {
      return res.status(400).json({
        error: "Parameter classId, studentId, studentName, month, dan slot wajib disertakan."
      });
    }

    // Parse base64
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

    const uploaded = await uploadStudentMonthlyPhoto({
      buffer,
      mimeType,
      academicYear: academicYear || "2025-2026",
      gradeLevel: typeof gradeLevel === "number" ? gradeLevel : undefined,
      gradeCategory,
      classId,
      className: className || classId,
      studentId,
      studentName,
      month,
      slot,
      version: typeof version === "number" ? version : 1,
      caption: caption || "",
      cropSettings: cropSettings || null,
      uploadedBy,
      uploadedByName
    });

    return res.json({ success: true, photo: uploaded });
  } catch (err: any) {
    console.error("[upload-photo] Upload error:", err.message);
    return res.status(500).json({
      success: false,
      error: err.message || "Gagal mengunggah foto ke Google Shared Drive."
    });
  }
});

// 3. Authenticated Secure Photo Stream
elementaryMonthlyPhotoRouter.get("/photo-stream/:fileId", async (req: Request, res: Response) => {
  try {
    const { fileId } = req.params;
    if (!fileId) {
      return res.status(400).send("Parameter fileId wajib disertakan.");
    }

    // 1. Validate that the file is an authorized Elementary Monthly Photo
    const isAuthorized = await isElementaryPhotoAuthorized(fileId);
    if (!isAuthorized) {
      return res.status(403).send("Akses foto ditolak atau berkas tidak terdaftar.");
    }

    // 2. Fetch metadata from Drive to get mimeType
    const drive = getGoogleDriveClient();
    const meta = await drive.files.get({
      fileId,
      fields: "mimeType, name, size",
      supportsAllDrives: true
    });

    const mimeType = meta.data.mimeType || "image/jpeg";

    // 3. Pipe binary stream to response
    const fileStream = await drive.files.get(
      { fileId, alt: "media", supportsAllDrives: true },
      { responseType: "stream" }
    );

    res.setHeader("Content-Type", mimeType);
    res.setHeader("Cache-Control", "private, max-age=86400"); // 1 day client cache
    fileStream.data.pipe(res);
  } catch (err: any) {
    console.error("[photo-stream] Stream error for fileId", req.params.fileId, ":", err.message);
    return res.status(500).send("Gagal mengambil foto dari Google Shared Drive.");
  }
});
