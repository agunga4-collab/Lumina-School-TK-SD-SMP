import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import axios from 'axios';

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  }

  try {
    const db = initFirebase();
    const { lxdId, pdfBase64 } = req.body;

    console.log('[LXDBackup] Request body:', req.body);
    console.log('[LXDBackup] lxdId:', lxdId);

    if (!lxdId) {
      return res.status(400).json({ ok: false, message: 'Missing lxdId' });
    }

    const backupUrl = process.env.LUMINA_LXD_BACKUP_URL;
    const backupSecret = process.env.LUMINA_LXD_BACKUP_SECRET;

    if (!backupUrl || !backupSecret) {
      return res.status(500).json({ ok: false, message: 'Backup configuration missing' });
    }

    const lxdSnap = await db.collection('lxd').doc(lxdId).get();
    console.log('[LXDBackup] lxdSnap.exists:', lxdSnap.exists);

    if (!lxdSnap.exists) {
      return res.status(404).json({ ok: false, message: 'LXD not found' });
    }

    const lxdData = lxdSnap.data();
    if (!lxdData) {
      return res.status(404).json({ ok: false, message: 'LXD data is empty' });
    }

    console.log('[LXDBackup] lxdData keys:', Object.keys(lxdData));

    // Struktur payload sesuai yang diharapkan Apps Script
    const payload = {
      secret: backupSecret,
      operation: 'backup_lxd',
      metadata: {
        type: lxdData.type || 'WEEKLY_LESSONS',
        title: lxdData.title || 'Untitled',
        subject: lxdData.subject || 'Unknown',
        grade: lxdData.grade || 'X',
        unitId: lxdData.unitId || lxdData.unit || 'JUNIOR_HIGH',
        academicYear: lxdData.academicYear || '2025/2026',
      },
      jsonData: lxdData,
      pdfBase64: pdfBase64 || null,
    };

    console.log('[LXDBackup] Sending to Apps Script:', backupUrl);
    console.log('[LXDBackup] metadata:', payload.metadata);

    const response = await axios.post(backupUrl, payload, {
      headers: { 'Content-Type': 'application/json' },
      maxRedirects: 5,
      validateStatus: (status) => status < 600,
      timeout: 60000,
    });

    let result: any = {};
    if (typeof response.data === 'string') {
      try {
        result = JSON.parse(response.data);
      } catch {
        result = { ok: false, message: `Apps Script non-JSON: ${response.data.substring(0, 200)}` };
      }
    } else {
      result = response.data || {};
    }

    console.log('[LXDBackup] Apps Script response:', result);

    if (result.ok) {
      const now = Date.now();
      const backupSummary = {
        lastBackupAt: now,
        lastBackupStatus: 'SUCCESS',
        lastBackupFileId: result.jsonFileId || result.fileId || null,
        lastBackupFileUrl: result.jsonFileUrl || result.fileUrl || null,
        lastBackupMessage: result.message || 'Backup successful',
      };
      await db.collection('lxd').doc(lxdId).update({
        ...backupSummary,
        updatedAt: now,
      });
    }

    return res.json({
      ...result,
      _health: {
        status: 'ok',
        vercel: !!process.env.VERCEL,
        nodeEnv: process.env.NODE_ENV,
        hasSA: !!process.env.FIREBASE_SERVICE_ACCOUNT,
      },
    });

  } catch (error: any) {
    console.error('[LXDBackup] Fatal error:', error.message);
    return res.status(500).json({
      ok: false,
      message: error.message,
      details: error.response?.data || null,
    });
  }
}