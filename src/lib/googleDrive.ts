import { google } from "googleapis";
import { Readable } from "stream";

function getServiceAccountJson(): any {
  // Try GOOGLE_SERVICE_ACCOUNT_KEY
  let key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || 
            process.env.GOOGLE_BACKUP_SERVICE_ACCOUNT || 
            process.env.FIREBASE_SERVICE_ACCOUNT;
            
  if (!key) return null;
  
  const trimmed = key.trim();
  if (trimmed.startsWith('{')) {
    try {
      return JSON.parse(trimmed);
    } catch (e) {
      console.error("[GoogleDriveAuth] Failed to parse JSON direct:", e);
    }
  }
  
  // Try Base64 decode
  try {
    const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
    if (decoded.trim().startsWith('{')) {
      return JSON.parse(decoded);
    }
  } catch (e) {
    console.error("[GoogleDriveAuth] Failed to base64-decode/parse JSON:", e);
  }
  
  return null;
}

const credentials = getServiceAccountJson();
const auth = credentials ? new google.auth.GoogleAuth({
  credentials,
  scopes: ["https://www.googleapis.com/auth/drive"],
}) : null;

export const drive = auth ? google.drive({ version: "v3", auth }) : null;

const PLAN_FOLDER_ID = "1Utptp-T-kJrYjbf32_CKr-gIWdqRP_VD";

function bufferToStream(buffer: Buffer) {
  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);
  return stream;
}

export async function uploadPlanPhoto(
  buffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<string> {
  if (!drive) {
    throw new Error("Google Drive API is not initialized. Please verify GOOGLE_SERVICE_ACCOUNT_KEY env var.");
  }
  const res = await drive.files.create({
    requestBody: { name: fileName, parents: [PLAN_FOLDER_ID] },
    media: { mimeType, body: bufferToStream(buffer) },
    fields: "id",
    supportsAllDrives: true,
  });
  if (!res.data.id) throw new Error("Upload ke Google Drive gagal, tidak ada file ID dikembalikan");
  return res.data.id;
}

export async function getPlanPhotoBase64(fileId: string): Promise<string> {
  if (!drive) {
    throw new Error("Google Drive API is not initialized. Please verify GOOGLE_SERVICE_ACCOUNT_KEY env var.");
  }
  const res = await drive.files.get(
    { fileId, alt: "media", supportsAllDrives: true },
    { responseType: "arraybuffer" }
  );
  return Buffer.from(res.data as ArrayBuffer).toString("base64");
}
