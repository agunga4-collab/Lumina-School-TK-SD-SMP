import type { VercelRequest, VercelResponse } from '@vercel/node';
import { google } from "googleapis";

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
    console.error("[GoogleAuth] Helper failed in verify-folder API:", err);
    return null;
  }
};

function getDrive() {
  const auth = getGoogleAuth();
  if (!auth) {
    throw new Error("Google Authentication configuration is missing or invalid.");
  }
  return google.drive({ version: 'v3', auth });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { rootFolderId, sharedDriveId } = req.body || {};
    if (!rootFolderId) {
      return res.status(400).json({ success: false, error: 'rootFolderId is required' });
    }

    const driveInstance = getDrive();
    const response = await driveInstance.files.get({
      fileId: rootFolderId,
      supportsAllDrives: true,
      fields: 'id, name, driveId',
    });

    return res.status(200).json({ success: true, folderName: response.data.name });
  } catch (error: any) {
    console.error("[VerifyFolder] Error verifying folder access:", error);
    return res.status(400).json({ success: false, error: error.message || 'Folder not found or access denied.' });
  }
}
