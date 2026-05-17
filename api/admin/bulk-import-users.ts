import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import axios from "axios";
import { parse } from "csv-parse/sync";

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
    const { sheetId, sheetName, mode } = req.body; // mode: 'STAFF' | 'STUDENT' | 'PARENT'
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

            if (role === "PARENT") {
              updates.linkedStudents = linkedStudents;
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
}
