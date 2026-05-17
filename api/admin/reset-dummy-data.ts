import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

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

  const adminDb = getAdminDb();
  if (!adminDb) {
    return res.status(503).json({ success: false, message: "Firebase Admin not initialized" });
  }

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
}
