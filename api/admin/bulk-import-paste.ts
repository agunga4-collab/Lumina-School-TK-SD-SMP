import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

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
    const { rows, columnMapping, globalConfig } = req.body;
    if (!rows || !columnMapping || !globalConfig) {
      return res.status(400).json({ error: "Missing required parameters rows, columnMapping, or globalConfig" });
    }

    const { mode, unitId, classId, academicYear, semester } = globalConfig;
    if (!mode) {
      return res.status(400).json({ error: "Missing config mode (STUDENT/STAFF/PARENT)" });
    }

    console.log(`[BulkImportPaste] Mode: ${mode} RowCount: ${rows.length}`);

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let errors: string[] = [];

    const timestamp = Date.now();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const mapped: Record<string, string> = {};
        row.forEach((cell: any, index: number) => {
          const field = columnMapping[String(index)];
          if (field) {
            mapped[field] = String(cell || "").trim();
          }
        });

        // Map fields based on mode
        let email = (mapped.email || "").toLowerCase();
        let name = mapped.fullName || mapped.name || "";
        let role = mode;
        let jobTitle = mapped.jobTitle || "";
        let luminaId = mapped.luminaId || "";
        let linkedStudents: string[] = [];
        let nisn = mapped.nisn || "";
        let nickname = mapped.nickname || "";
        let gender = (mapped.gender || "").toUpperCase(); // L or P
        let parentEmail = (mapped.parentEmail || "").toLowerCase();
        let currentUnitId = mapped.unitId || unitId || "";
        let currentClassId = mapped.classId || classId || "";
        let currentAcademicYear = mapped.academicYear || academicYear || "2025/2026";

        // Skip completely empty lines
        if (!name && !email && !luminaId) {
          skipped++;
          continue;
        }

        // Auto-generate luminaId if missing and it's student
        if (!luminaId) {
          const indexSuffix = String(i).padStart(3, '0');
          luminaId = `LMN-${timestamp}-${indexSuffix}`;
        }

        // Auto-generate email based on role if missing
        if (!email) {
          if (role === "STUDENT") {
            email = `${luminaId.toLowerCase()}@student.lazuardi.sch.id`;
          } else if (role === "STAFF") {
            const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, "");
            email = `staff.${cleanName || "user"}${i}@lazuardi.sch.id`;
          } else if (role === "PARENT") {
            const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, "");
            email = `parent.${cleanName || "user"}${i}@parent.lazuardi.sch.id`;
          }
        }

        // Validate basic email format
        if (!email.includes("@")) {
          errors.push(`${email || name}: format email tidak valid`);
          continue;
        }

        if (role === "STUDENT") {
          jobTitle = currentClassId;

          // Parse Grade
          if (currentClassId) {
            const grade = currentClassId.split(' ')[0];
            const sanitizedClassName = currentClassId.replace(/\s+/g, '-');
            const firestoreClassId = `${currentUnitId}_${currentAcademicYear.replace(/\//g, '-')}_${sanitizedClassName}`;

            // Create/Update Class Document
            const classRef = adminDb.collection("classes").doc(firestoreClassId);
            await classRef.set({
              id: firestoreClassId,
              name: currentClassId,
              grade: grade,
              unitId: currentUnitId,
              academicYear: currentAcademicYear,
              status: "active",
              updatedAt: FieldValue.serverTimestamp(),
            }, { merge: true });
          }

          // 1. Sync to students collection
          const studentRef = adminDb.collection("students").doc(luminaId);
          const studentDoc = await studentRef.get();
          const studentData: any = {
            luminaId,
            nisn,
            fullName: name,
            nickname,
            gender,
            email,
            parentEmail,
            classId: currentClassId,
            unitId: currentUnitId,
            academicYear: currentAcademicYear,
            status: "active",
            updatedAt: FieldValue.serverTimestamp(),
          };
          
          if (!studentDoc.exists) {
            studentData.createdAt = FieldValue.serverTimestamp();
          }

          await studentRef.set(studentData, { merge: true });

          // 2. Sync to enrollments collection
          const enrollmentId = `${luminaId}_${currentAcademicYear.replace(/\//g, "-")}`;
          await adminDb.collection("enrollments").doc(enrollmentId).set({
            id: enrollmentId,
            studentId: luminaId,
            classId: currentClassId,
            unitId: currentUnitId,
            academicYear: currentAcademicYear,
            status: "active",
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });

          // 3. Ensure parent link
          if (parentEmail) {
            const linkId = `${parentEmail}_${luminaId}`;
            await adminDb.collection("parentStudentLinks").doc(linkId).set({
              parentEmail,
              studentId: luminaId,
              unitId: currentUnitId,
              status: "active",
              updatedAt: FieldValue.serverTimestamp(),
            }, { merge: true });
          }

          // 4. Sync of student invitation inside roleInvites
          const existingQuery = await adminDb
            .collection("roleInvites")
            .where("email", "==", email)
            .limit(1)
            .get();

          const inviteData: any = {
            email,
            name: name || email,
            role: "STUDENT",
            unitId: currentUnitId,
            jobTitle: currentClassId,
            luminaId,
            linkedStudents: [],
            classId: currentClassId,
            academicYear: currentAcademicYear,
            nisn,
            nickname,
            gender,
            parentEmail,
            status: "ready",
          };

          if (existingQuery.empty) {
            inviteData.createdAt = FieldValue.serverTimestamp();
            await adminDb.collection("roleInvites").doc().set(inviteData);
            created++;
          } else {
            const doc = existingQuery.docs[0];
            const currentData = doc.data() || {};
            const hasChanges =
              (currentData.role || "") !== "STUDENT" ||
              (currentData.unitId || "") !== currentUnitId ||
              (currentData.jobTitle || "") !== currentClassId ||
              (currentData.luminaId || "") !== luminaId ||
              currentData.classId !== currentClassId ||
              currentData.academicYear !== currentAcademicYear;

            if (hasChanges) {
              await doc.ref.update(inviteData);
              updated++;
            } else {
              skipped++;
            }
          }

        } else if (role === "STAFF") {
          let staffRole = (mapped.role || "").trim().toUpperCase();
          if (!staffRole) staffRole = "TEACHER";
          if (staffRole === 'GURU') staffRole = 'TEACHER';
          if (staffRole === 'KEPALA_UNIT') staffRole = 'HEAD_UNIT';
          if (staffRole === 'STAFF') staffRole = 'STAFF';

          const inviteData: any = {
            email,
            name: name || email,
            role: staffRole,
            unitId: currentUnitId,
            jobTitle: jobTitle,
            luminaId,
            linkedStudents: [],
            status: "ready",
          };

          const existingQuery = await adminDb
            .collection("roleInvites")
            .where("email", "==", email)
            .limit(1)
            .get();

          if (existingQuery.empty) {
            inviteData.createdAt = FieldValue.serverTimestamp();
            await adminDb.collection("roleInvites").doc().set(inviteData);
            created++;
          } else {
            const doc = existingQuery.docs[0];
            const currentData = doc.data() || {};
            const hasChanges =
              (currentData.role || "") !== staffRole ||
              (currentData.unitId || "") !== currentUnitId ||
              (currentData.jobTitle || "") !== jobTitle ||
              (currentData.luminaId || "") !== luminaId ||
              (currentData.name || "") !== name;

            if (hasChanges) {
              await doc.ref.update(inviteData);
              updated++;
            } else {
              skipped++;
            }
          }

        } else if (role === "PARENT") {
          const childIdField = mapped.childId || mapped.linkedStudents || "";
          linkedStudents = childIdField ? childIdField.split(",").map(id => id.trim()).filter(Boolean) : [];

          // Link to parentStudentLinks
          for (const sId of linkedStudents) {
            const linkId = `${email}_${sId}`;
            await adminDb.collection("parentStudentLinks").doc(linkId).set({
              parentEmail: email,
              studentId: sId,
              unitId: currentUnitId,
              status: "active",
              updatedAt: FieldValue.serverTimestamp(),
            }, { merge: true });
          }

          const inviteData: any = {
            email,
            name: name || email,
            role: "PARENT",
            unitId: currentUnitId,
            jobTitle: "",
            luminaId,
            linkedStudents,
            status: "ready",
          };

          const existingQuery = await adminDb
            .collection("roleInvites")
            .where("email", "==", email)
            .limit(1)
            .get();

          if (existingQuery.empty) {
            inviteData.createdAt = FieldValue.serverTimestamp();
            await adminDb.collection("roleInvites").doc().set(inviteData);
            created++;
          } else {
            const doc = existingQuery.docs[0];
            const currentData = doc.data() || {};
            const hasChanges =
              (currentData.role || "") !== "PARENT" ||
              (currentData.unitId || "") !== currentUnitId ||
              (currentData.luminaId || "") !== luminaId ||
              (currentData.name || "") !== name ||
              JSON.stringify(currentData.linkedStudents || []) !== JSON.stringify(linkedStudents);

            if (hasChanges) {
              await doc.ref.update(inviteData);
              updated++;
            } else {
              skipped++;
            }
          }
        }

      } catch (err: any) {
        errors.push(`Baris ${i + 1}: ${err.message}`);
      }
    }

    console.log(
      `[BulkImportPaste] Result - Created: ${created}, Updated: ${updated}, Skipped: ${skipped}, Errors: ${errors.length}`
    );

    return res.json({
      success: true,
      created,
      updated,
      skipped,
      errors,
    });
  } catch (error: any) {
    console.error("[BulkImportPaste] Fatal Error:", error);
    res.status(500).json({ success: false, error: String(error) });
  }
}
