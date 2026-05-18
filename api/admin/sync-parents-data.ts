import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

// Firebase Admin Initialization
let initError: string | null = null;
try {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccountJson) {
    initError = "FIREBASE_SERVICE_ACCOUNT environment variable is missing";
  } else if (!getApps().length) {
    const serviceAccount = JSON.parse(serviceAccountJson);
    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }
    initializeApp({
      credential: cert(serviceAccount),
    });
  }
} catch (err: any) {
  initError = `FirebaseAdmin initialization failed: ${err.message}`;
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

  const db = getAdminDb();
  if (!db) {
    return res.status(503).json({ 
      success: false, 
      message: "Firebase Admin not initialized",
      error: initError || "Unknown error during initialization"
    });
  }

  try {
    console.log("[SyncParents] Starting synchronization...");

    // 1. Get all students from roleInvites
    const studentsSnap = await db.collection("roleInvites")
      .where("role", "==", "STUDENT")
      .get();

    const students = studentsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    console.log(`[SyncParents] Found ${students.length} students in roleInvites`);
    // 2. Map parentEmail to list of student luminaIds
    const parentMap: Record<string, { name: string; linkedStudents: string[]; unitId: string }> = {};

    for (const s of students) {
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
            name: `Wali ${s.name || 'Siswa'}`, // Default name if not found
            linkedStudents: [],
            unitId: s.unitId || 'JUNIOR_HIGH'
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

    return res.json({ 
      success: true, 
      created, 
      updated, 
      totalParents: Object.keys(parentMap).length 
    });
  } catch (error: any) {
    console.error("[SyncParents] Error:", error);
    res.status(500).json({ error: error.message });
  }
}
