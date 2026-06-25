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
      return res.status(400).json({ success: false, error: "Missing required parameters rows, columnMapping, or globalConfig" });
    }

    const { mode, unitId, classId, academicYear, semester } = globalConfig;
    if (!mode) {
      return res.status(400).json({ success: false, error: "Missing config mode (STUDENT/STAFF/PARENT)" });
    }

    // Validate mapping completeness based on selected mode
    const mappedFields = Object.values(columnMapping);
    if (mappedFields.length === 0) {
      return res.status(400).json({ success: false, error: "Pemetaan kolom tidak boleh kosong. Silakan petakan setidaknya satu kolom." });
    }

    const hasNameMapping = mappedFields.includes("fullName") || mappedFields.includes("name");
    const hasEmailMapping = mappedFields.includes("email");

    if (mode === "STUDENT") {
      if (!hasNameMapping) {
        return res.status(400).json({ success: false, error: "Pemetaan kolom tidak valid: Kolom 'Nama Lengkap' wajib dipetakan untuk impor siswa." });
      }
    } else if (mode === "STAFF") {
      if (!hasNameMapping || !hasEmailMapping) {
        return res.status(400).json({ success: false, error: "Pemetaan kolom tidak valid: Kolom 'Nama Lengkap' dan 'Email' wajib dipetakan untuk impor staff." });
      }
    } else if (mode === "PARENT") {
      if (!hasNameMapping || !hasEmailMapping) {
        return res.status(400).json({ success: false, error: "Pemetaan kolom tidak valid: Kolom 'Nama Lengkap' dan 'Email' wajib dipetakan untuk impor orang tua." });
      }
    }

    console.log(`[BulkImportPaste] Mode: ${mode} RowCount: ${rows.length}`);

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let errors: string[] = [];
    let skippedReasons: string[] = [];

    const timestamp = Date.now();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const mapped: Record<string, string> = {};
        // Preserve empty columns and avoid index shifting by iterating over keys of columnMapping
        Object.keys(columnMapping).forEach((key) => {
          const idx = Number(key);
          const cell = row[idx];
          const field = columnMapping[key];
          if (field) {
            mapped[field] = String(cell || "").trim();
          }
        });

        // Map fields based on mode
        let email = (mapped.email || "").toLowerCase();
        let name = mapped.fullName || mapped.name || "";
        let role = mode;
        let jobTitle = mapped.jobTitle || "";
        let luminaId = (mapped.luminaId || "").trim();
        let linkedStudents: string[] = [];
        let nisn = mapped.nisn || "";
        let nickname = mapped.nickname || "";
        let gender = (mapped.gender || "").trim().toUpperCase(); // L or P
        let parentEmail = (mapped.parentEmail || "").toLowerCase();
        let fatherName = mapped.fatherName || "";
        let motherName = mapped.motherName || "";
        let currentUnitId = mapped.unitId || unitId || "";
        let currentClassId = mapped.classId || classId || "";
        let currentAcademicYear = mapped.academicYear || academicYear || "2025/2026";

        // Validate and sanitize luminaId to prevent gender values from leaking in
        if (luminaId) {
          const cleanLuminaIdLower = luminaId.toLowerCase();
          const invalidIdKeywords = ["l", "p", "laki-laki", "perempuan", "male", "female", "laki", "wanita", "laki laki", "perempuan/wanita"];
          if (invalidIdKeywords.includes(cleanLuminaIdLower)) {
            // This is actually a gender value that shifted or was wrongly mapped
            if (!gender) {
              gender = luminaId;
            }
            luminaId = ""; // Force blank so it auto-generates
          }
        }

        // Standardize and validate gender
        if (gender) {
          const gClean = gender.trim().toUpperCase();
          if (gClean === "L" || gClean === "LAKI-LAKI" || gClean === "MALE" || gClean === "LAKI" || gClean === "LAKI LAKI") {
            gender = "L";
          } else if (gClean === "P" || gClean === "PEREMPUAN" || gClean === "FEMALE" || gClean === "WANITA") {
            gender = "P";
          } else {
            gender = ""; // Reset invalid/polluted values
          }
        }

        // Skip completely empty lines, and log details
        const rowIsEmpty = row.every((cell: any) => !cell || !String(cell).trim());
        if (!name && !email && !luminaId) {
          const reason = rowIsEmpty 
            ? "Baris kosong" 
            : "Baris memiliki data tetapi tidak ada nama lengkap, email, atau luminaId yang berhasil dipetakan";
          
          console.log(`[BulkImportSkip] Baris ${i + 1} dilewati. Alasan: ${reason}`, {
            rowIndex: i,
            row,
            columnMapping,
            mapped,
            normalized: { name, email, luminaId, gender }
          });

          skippedReasons.push(`Baris ${i + 1}: ${reason}`);
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
          errors.push(`Baris ${i + 1} (${name || email}): format email tidak valid`);
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
            fatherName,
            motherName,
            classId: currentClassId,
            unitId: currentUnitId,
            academicYear: currentAcademicYear,
            status: "active",
            updatedAt: FieldValue.serverTimestamp(),
          };
          
          let isNewStudent = !studentDoc.exists;
          let studentChanged = false;
          if (!isNewStudent) {
            const oldData = studentDoc.data() || {};
            studentChanged = 
              oldData.fullName !== name ||
              oldData.nickname !== nickname ||
              oldData.nisn !== nisn ||
              oldData.gender !== gender ||
              oldData.email !== email ||
              oldData.parentEmail !== parentEmail ||
              oldData.fatherName !== fatherName ||
              oldData.motherName !== motherName ||
              oldData.classId !== currentClassId ||
              oldData.unitId !== currentUnitId ||
              oldData.academicYear !== currentAcademicYear;
          }
          if (isNewStudent) {
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
            fatherName,
            motherName,
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
            }
            
            if (isNewStudent) {
              created++;
            } else if (hasChanges || studentChanged) {
              updated++;
            } else {
              const reason = "Data siswa dan undangan peran sudah sesuai (tidak ada perubahan)";
              console.log(`[BulkImportSkip] Baris ${i + 1} (${name}) dilewati. Alasan: ${reason}`, {
                rowIndex: i,
                row,
                columnMapping,
                mapped,
                normalized: { name, email, luminaId, gender }
              });
              skippedReasons.push(`Baris ${i + 1} (${name}): ${reason}`);
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
              const reason = "Data staff sudah sesuai (tidak ada perubahan)";
              console.log(`[BulkImportSkip] Baris ${i + 1} (${name}) dilewati. Alasan: ${reason}`, {
                rowIndex: i,
                row,
                columnMapping,
                mapped,
                normalized: { name, email, luminaId, gender }
              });
              skippedReasons.push(`Baris ${i + 1} (${name}): ${reason}`);
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
              const reason = "Data orang tua sudah sesuai (tidak ada perubahan)";
              console.log(`[BulkImportSkip] Baris ${i + 1} (${name}) dilewati. Alasan: ${reason}`, {
                rowIndex: i,
                row,
                columnMapping,
                mapped,
                normalized: { name, email, luminaId, gender }
              });
              skippedReasons.push(`Baris ${i + 1} (${name}): ${reason}`);
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
      skippedReasons,
    });
  } catch (error: any) {
    console.error("[BulkImportPaste] Fatal Error:", error);
    res.status(500).json({ success: false, error: String(error) });
  }
}
