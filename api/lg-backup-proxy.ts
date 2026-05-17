import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import axios from "axios";
import type { LGBackupStatus, LGBackupSummary, LGBackupLog } from "../src/types";

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
  console.error("[FirebaseAdmin] Initialization failed:", err.message);
}

function getAdminDb() {
  try {
    return getFirestore();
  } catch (err) {
    return undefined;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    console.log('Request body:', req.body);
    const { lgId } = req.body;
    console.log('lgId received:', lgId);

    if (!lgId) {
      return res.status(400).json({ success: false, message: "Missing lgId" });
    }

    const backupUrl = process.env.LUMINA_LG_BACKUP_URL;
    const backupSecret = process.env.LUMINA_LG_BACKUP_SECRET;

    if (!backupUrl || !backupSecret) {
      return res.status(500).json({ success: false, message: "Backup configuration missing" });
    }

    // 1. Fetch Learning Goal
    let lgData;
    if (lgId === "TEST_LG_ID") {
      lgData = {
        title: "Test Learning Goal",
        subjectName: "Testing",
        phase: "A",
        semesterLabel: "Semester 1",
        learningGoalText: "Ini adalah data uji coba untuk pengetesan backup.",
        unitId: 'ELEMENTARY'
      };
    } else {
      const db = getAdminDb();
      if (!db) {
        return res.status(503).json({ success: false, message: "Firebase Admin not initialized" });
      }
      const lgSnap = await db.collection("learning_goals").doc(lgId).get();
      console.log('lgSnap exists:', lgSnap.exists);
      
      if (!lgSnap.exists) {
        return res.status(404).json({ success: false, message: "Learning Goal not found" });
      }
      lgData = lgSnap.data();
    }

    if (!lgData) {
      return res.status(404).json({ success: false, message: "Learning Goal data is empty" });
    }

    // 2. Sanitize filename
    const rawFileName = `LG_${lgData?.unitId ?? ''}_${lgData?.subjectName || 'UNTITLED'}_${lgData?.phase || 'A'}_${lgData?.semesterLabel || 'S1'}_${lgData?.title || 'LG'}`;
    const sanitizedFileName = rawFileName
      .replace(/[^a-z0-9_\-]/gi, '_')
      .replace(/_{2,}/g, '_') + ".json";

    // 3. Send to Apps Script via POST
    const response = await axios.post(backupUrl, {
      secret: backupSecret,
      operation: "backup_lg",
      lgId: lgId,
      fileName: sanitizedFileName,
      data: lgData
    }, {
      timeout: 30000 
    });

    const result = response.data || {};
    
    // Sync result back to Firestore
    if (lgId !== "TEST_LG_ID" && lgId !== "DOC_SAMPLE_001") {
      try {
        const db = getAdminDb();
        if (db) {
          const now = Date.now();
          const lgRef = db.collection("learning_goals").doc(lgId);
          
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
        console.warn("[LGBackupProxy] Firestore sync failed:", syncError.message);
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
    return res.status(500).json({
      ok: false,
      message: error.message,
      details: error.response?.data || null
    });
  }
}
