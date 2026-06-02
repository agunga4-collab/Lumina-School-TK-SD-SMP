import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { google } from 'googleapis';

function initFirebase() {
  if (!getApps().length) {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!serviceAccountJson) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT env is missing');
    }
    const serviceAccount = JSON.parse(serviceAccountJson);
    initializeApp({ credential: cert(serviceAccount) });
  }
  return getFirestore();
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized. Missing bearer token." });
    }
    const token = authHeader.split("Bearer ")[1];

    let decodedToken;
    try {
      initFirebase();
      decodedToken = await getAuth().verifyIdToken(token);
    } catch (authErr: any) {
      return res.status(401).json({ error: `Authentication failed: ${authErr.message}` });
    }

    const db = getFirestore();

    const userDoc = await db.collection("users").doc(decodedToken.uid).get();
    const userRole = userDoc.exists ? userDoc.data()?.role : null;
    const isSuperAdmin = userRole === "SUPER_ADMIN" || decodedToken.email === "agunga4@gmail.com" || decodedToken.email === "agunga4@lazuardi.sch.id";

    if (!isSuperAdmin) {
      return res.status(403).json({ error: "Access denied. Active Super Admin permission required." });
    }

    const folderId = req.body.folderId || "1if5MJST18x6zHOXJTi7W82BAqkwEbBBd";
    console.log('[SyncKnowledge] Starting sync, folderId:', folderId);

    const driveInstance = getDrive();
    console.log('[SyncKnowledge] Google auth initialized');

    // Query standard document type Google Docs files in the specified folder
    const q = `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.document' and trashed = false`;
    const response = await driveInstance.files.list({
      q,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      fields: "files(id, name)",
    });

    const files = response.data.files || [];
    console.log('[SyncKnowledge] Files found:', files.length);

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
        console.error('[SyncKnowledge] Error on file:', file.name, fileErr.message);
        errors.push(`Error on "${file.name || file.id}": ${fileErr.message}`);
      }
    }

    return res.json({
      total: files.length,
      synced,
      errors,
    });

  } catch (error: any) {
    console.error('[SyncKnowledge] Fatal error:', error.message, error.stack);
    return res.status(500).json({ error: error.message || "Unknown error", stack: error.stack });
  }
}
