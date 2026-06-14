import * as admin from 'firebase-admin';

export interface ChangeLog {
  collection: string;
  docId: string;
  field: string;
  oldValue: any;
  newValue: any;
}

export interface ScannedStats {
  scanned: number;
  matched: number;
  errors: number;
}

export interface UnmatchedSample {
  id: string;
  name: string;
  email: string;
  unitId: string;
}

export interface ReconciliationResult {
  executionMode: 'DRY-RUN' | 'LIVE';
  timestamp: string;
  mappingCount: number;
  mappingSample: Record<string, string>;
  scannedCollections: Record<string, ScannedStats>;
  changes: ChangeLog[];
  errors: string[];
  
  // Diagnostic parameters requested by the user
  scannedStudentsCount: number;
  scannedSTUDENTInvitesCount: number;
  matchedInvitesCount: number;
  unmatchedInvitesCount: number;
  unmatchedSamples: UnmatchedSample[];

  // Detailed debug stats for tiers & ambiguous tracking
  matchedByDocId: number;
  matchedByLuminaId: number;
  matchedByNis: number;
  matchedByEmail: number;
  matchedByName: number;
  ambiguousMatches: string[];
}

export function normalizeName(name?: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[.\-_,()'"/’“]/g, ' ') // Strip common punctuation characters & parentheses
    .replace(/\s+/g, ' ')            // Collapse multiple spaces to a single space
    .trim();
}

/**
 * Service function to run student reference reconciliation.
 * Compatible with CLI scripts, server routes, and Cloud Functions.
 */
export async function runReconciliation(
  db: admin.firestore.Firestore,
  options: { dryRun: boolean; unitId: string | 'ALL' }
): Promise<ReconciliationResult> {
  const { dryRun, unitId } = options;
  const executionMode = dryRun ? 'DRY-RUN' : 'LIVE';

  console.log(`[Reconciliation] Running runReconciliation in ${executionMode} mode for unit = ${unitId}...`);

  const result: ReconciliationResult = {
    executionMode,
    timestamp: new Date().toISOString(),
    mappingCount: 0,
    mappingSample: {},
    scannedCollections: {},
    changes: [],
    errors: [],
    scannedStudentsCount: 0,
    scannedSTUDENTInvitesCount: 0,
    matchedInvitesCount: 0,
    unmatchedInvitesCount: 0,
    unmatchedSamples: [],
    
    // Explicit metrics requested by the user
    matchedByDocId: 0,
    matchedByLuminaId: 0,
    matchedByNis: 0,
    matchedByEmail: 0,
    matchedByName: 0,
    ambiguousMatches: [],
  };

  try {
    // -----------------------------------------------------------------------
    // STEP 1 – Load master students (filtered by unitId if specified)
    // -----------------------------------------------------------------------
    let queryMaster = db.collection('students');
    let studentsSnap;
    if (unitId && unitId !== 'ALL') {
      studentsSnap = await queryMaster.where('unitId', '==', unitId).get();
    } else {
      studentsSnap = await queryMaster.get();
    }

    result.scannedStudentsCount = studentsSnap.size;
    console.log(`[Reconciliation] Loaded ${studentsSnap.size} master students from Firebase Firestore.`);

    type MasterStudent = {
      docId: string; // doc.id
      fullNameNorm: string;
      emailNorm?: string;
      luminaId?: string;
      unitId?: string;
      nis?: string;
      oldLuminaId?: string;
      oldNis?: string;
    };

    const master: MasterStudent[] = studentsSnap.docs.map((doc) => {
      const data = doc.data();
      const email =
        (data.email as string | undefined) ||
        (data.parentEmail as string | undefined);
      return {
        docId: doc.id,
        fullNameNorm: normalizeName(
          (data.fullName as string) ||
            (data.name as string) ||
            (data.studentName as string)
        ),
        emailNorm: email ? email.toLowerCase().trim() : undefined,
        luminaId: data.luminaId as string | undefined,
        unitId: data.unitId as string | undefined,
        nis: (data.nis as string | undefined) || (data.nationalId as string | undefined),
        oldLuminaId: data.oldLuminaId as string | undefined,
        oldNis: data.oldNis as string | undefined,
      };
    });

    // Grouping index to check for multiple records with the same identifier
    const byDocId = new Map<string, MasterStudent>(
      master.map((s) => [s.docId.toLowerCase().trim(), s])
    );
    
    const byLuminaIdMulti = new Map<string, MasterStudent[]>();
    const byNisMulti = new Map<string, MasterStudent[]>();
    const byEmailMulti = new Map<string, MasterStudent[]>();
    const byNameMulti = new Map<string, MasterStudent[]>();

    for (const student of master) {
      if (student.luminaId) {
        const key = student.luminaId.trim().toLowerCase();
        if (!byLuminaIdMulti.has(key)) byLuminaIdMulti.set(key, []);
        byLuminaIdMulti.get(key)!.push(student);
      }
      if (student.nis) {
        const key = student.nis.trim().toLowerCase();
        if (!byNisMulti.has(key)) byNisMulti.set(key, []);
        byNisMulti.get(key)!.push(student);
      }
      if (student.emailNorm) {
        const key = student.emailNorm.toLowerCase();
        if (!byEmailMulti.has(key)) byEmailMulti.set(key, []);
        byEmailMulti.get(key)!.push(student);
      }
      if (student.fullNameNorm) {
        const key = student.fullNameNorm; // already normalized
        if (!byNameMulti.has(key)) byNameMulti.set(key, []);
        byNameMulti.get(key)!.push(student);
      }
    }

    const mappingTable: Record<string, string> = {};
    const ambiguous: string[] = [];

    // Prepopulate mappingTable with master student old identifiers transitions:
    // Any record matching a student's oldLuminaId or oldNis should be mapped to their current docId (their active NIS).
    for (const student of master) {
      if (student.oldLuminaId) {
        const oldKey = student.oldLuminaId.trim();
        if (oldKey && oldKey !== student.docId) {
          mappingTable[oldKey] = student.docId;
          mappingTable[oldKey.toLowerCase()] = student.docId;
          mappingTable[oldKey.toUpperCase()] = student.docId;
        }
      }
      if (student.oldNis) {
        const oldKey = student.oldNis.trim();
        if (oldKey && oldKey !== student.docId) {
          mappingTable[oldKey] = student.docId;
          mappingTable[oldKey.toLowerCase()] = student.docId;
          mappingTable[oldKey.toUpperCase()] = student.docId;
        }
      }
    }

    // -----------------------------------------------------------------------
    // STEP 2A – Build mapping from roleInvites with Tiered Multi-Match Strategy
    // -----------------------------------------------------------------------
    let invitesQuery = db.collection('roleInvites').where('role', '==', 'STUDENT');
    if (unitId && unitId !== 'ALL') {
      invitesQuery = invitesQuery.where('unitId', '==', unitId);
    }
    const invitesSnap = await invitesQuery.get();
    result.scannedSTUDENTInvitesCount = invitesSnap.size;
    console.log(`[Reconciliation] Loaded ${invitesSnap.size} roleInvites with role = STUDENT.`);

    invitesSnap.forEach((doc) => {
      const data = doc.data();

      // Top level properties of student's invitation
      const docIdClean = doc.id.toLowerCase().trim();
      const inviteLuminaId = data.luminaId as string | undefined;
      const nisInvite = (data.nis as string | undefined) || (data.studentNis as string | undefined) || (data.nisn as string | undefined);
      const emailInvite = (data.email as string | undefined)?.toLowerCase().trim();
      const parentEmailInvite = (data.parentEmail as string | undefined)?.toLowerCase().trim();
      const nameInviteNorm = normalizeName((data.studentName as string) || (data.name as string) || (data.fullName as string));

      // Match against master students using tiered hierarchy
      let matched: MasterStudent | undefined;
      let matchedReason = '';

      // TIER 1: Exact Match by Document ID or Lumina ID (in master.docId)
      if (!matched && inviteLuminaId) {
        const lumKey = inviteLuminaId.toLowerCase().trim();
        if (byDocId.has(lumKey)) {
          matched = byDocId.get(lumKey);
          matchedReason = 'Tier 1: Document ID / Lumina ID direct lookup';
          result.matchedByDocId++;
        }
      }
      if (!matched && byDocId.has(docIdClean)) {
        matched = byDocId.get(docIdClean);
        matchedReason = 'Tier 1: Document ID direct lookup';
        result.matchedByDocId++;
      }

      // TIER 2: Match by registered Lumina ID property
      if (!matched && inviteLuminaId) {
        const lumKey = inviteLuminaId.trim().toLowerCase();
        const candidates = byLuminaIdMulti.get(lumKey) || [];
        if (candidates.length === 1) {
          matched = candidates[0];
          matchedReason = 'Tier 2: Unique Lumina ID property';
          result.matchedByLuminaId++;
        } else if (candidates.length > 1) {
          const msg = `Ambiguity (Tier 2 - Lumina ID): Invites DocID ${doc.id} pencarian LuminaID '${inviteLuminaId}' mencocokkan ${candidates.length} siswa master.`;
          ambiguous.push(msg);
          result.ambiguousMatches.push(msg);
        }
      }

      // TIER 3: Match by student's National ID / NIS
      if (!matched && nisInvite) {
        const nisKey = nisInvite.trim().toLowerCase();
        const candidates = byNisMulti.get(nisKey) || [];
        if (candidates.length === 1) {
          matched = candidates[0];
          matchedReason = 'Tier 3: Unique NIS Match';
          result.matchedByNis++;
        } else if (candidates.length > 1) {
          const msg = `Ambiguity (Tier 3 - NIS): Invites DocID ${doc.id} pencarian NIS '${nisInvite}' mencocokkan ${candidates.length} siswa master.`;
          ambiguous.push(msg);
          result.ambiguousMatches.push(msg);
        }
      }

      // TIER 4: Match by Student/Parent Email Address
      if (!matched) {
        const emailCandidates = new Map<string, MasterStudent>();
        if (emailInvite) {
          (byEmailMulti.get(emailInvite.toLowerCase()) || []).forEach(s => emailCandidates.set(s.docId, s));
        }
        if (parentEmailInvite) {
          (byEmailMulti.get(parentEmailInvite.toLowerCase()) || []).forEach(s => emailCandidates.set(s.docId, s));
        }

        if (emailCandidates.size === 1) {
          matched = Array.from(emailCandidates.values())[0];
          matchedReason = 'Tier 4: Unique EmailAddress Match';
          result.matchedByEmail++;
        } else if (emailCandidates.size > 1) {
          const msg = `Ambiguity (Tier 4 - Email): Invites DocID ${doc.id} mencocokkan ${emailCandidates.size} siswa master.`;
          ambiguous.push(msg);
          result.ambiguousMatches.push(msg);
        }
      }

      // TIER 5: Fallback - Match by Tolerant Normalized Full Name
      if (!matched && nameInviteNorm) {
        const candidates = byNameMulti.get(nameInviteNorm) || [];
        if (candidates.length === 1) {
          matched = candidates[0];
          matchedReason = 'Tier 5: Fallback Unique Normalized Name';
          result.matchedByName++;
        } else if (candidates.length > 1) {
          const msg = `Ambiguity (Tier 5 - Name): Invites DocID ${doc.id} pencarian Nama '${nameInviteNorm}' mencocokkan ${candidates.length} siswa master dengan nama sama.`;
          ambiguous.push(msg);
          result.ambiguousMatches.push(msg);
        }
      }

      if (!matched) {
        result.unmatchedInvitesCount++;
        if (result.unmatchedSamples.length < 20) {
          result.unmatchedSamples.push({
            id: doc.id,
            name: data.studentName || data.name || data.fullName || 'Siswa Tanpa Nama',
            email: data.email || 'N/A',
            unitId: data.unitId || 'N/A',
          });
        }
        result.errors.push(
          `Siswa master tidak ditemukan untuk ID undangan ${doc.id} (Nama: ${data.studentName || data.name || 'tanpa nama'}, Email: ${data.email || 'tanpa email'})`
        );
        return;
      }

      result.matchedInvitesCount++;
      console.log(`[Reconciliation] Mapped invite '${doc.id}' (${data.studentName || data.name}) -> master student ID '${matched.docId}' via ${matchedReason}.`);

      // We map different representative keys referencing this student back to the master student's clean `docId`
      const possibleKeys: string[] = [];
      possibleKeys.push(doc.id); // Invite document ID
      possibleKeys.push(`INVITE_${doc.id}`); // Prefix used in StudentSearch / Attendance Checklists
      
      if (inviteLuminaId) {
        possibleKeys.push(inviteLuminaId);
      }
      if (nisInvite) {
        possibleKeys.push(nisInvite);
      }
      if (data.email) {
        possibleKeys.push(data.email);
      }

      for (const key of possibleKeys) {
        if (key === matched.docId) continue; // No need to map to itself
        if (mappingTable[key] && mappingTable[key] !== matched.docId) {
          ambiguous.push(
            `Kunci ganda '${key}' di roleInvites terhubung ke '${mappingTable[key]}' dan '${matched.docId}'`
          );
          delete mappingTable[key];
        } else if (!mappingTable[key]) {
          mappingTable[key] = matched.docId;
        }
      }
    });

    // -----------------------------------------------------------------------
    // STEP 2B – Build mapping from STUDENT users to Master Students
    // This allows resolving references stored as User Auth UIDs (like in lateness_records / attendance_records)
    // -----------------------------------------------------------------------
    let usersQuery = db.collection('users').where('role', '==', 'STUDENT');
    if (unitId && unitId !== 'ALL') {
      usersQuery = usersQuery.where('unitId', '==', unitId);
    }
    const usersSnap = await usersQuery.get();
    console.log(`[Reconciliation] Loaded ${usersSnap.size} STUDENT users from users collection for Auth UID matching.`);

    usersSnap.forEach((doc) => {
      const data = doc.data();
      const docIdClean = doc.id.toLowerCase().trim();

      const userLuminaId = (data.luminaId || data.studentId) as string | undefined;
      const userNis = (data.nis || data.studentNis || data.nisn) as string | undefined;
      const emailUser = (data.email as string | undefined)?.toLowerCase().trim();
      const parentEmailUser = (data.parentEmail as string | undefined)?.toLowerCase().trim();
      const nameUserNorm = normalizeName((data.displayName as string) || (data.name as string) || (data.fullName as string));

      let matched: MasterStudent | undefined;
      let matchedReason = '';

      // TIER 1: Exact Match by Document ID or Lumina ID (in master.docId)
      if (!matched && userLuminaId) {
        const lumKey = userLuminaId.toLowerCase().trim();
        if (byDocId.has(lumKey)) {
          matched = byDocId.get(lumKey);
          matchedReason = 'User Tier 1: Document ID / Lumina ID direct lookup';
          result.matchedByDocId++;
        }
      }
      if (!matched && byDocId.has(docIdClean)) {
        matched = byDocId.get(docIdClean);
        matchedReason = 'User Tier 1: Document ID direct lookup';
        result.matchedByDocId++;
      }

      // TIER 2: Match by registered Lumina ID property
      if (!matched && userLuminaId) {
        const lumKey = userLuminaId.trim().toLowerCase();
        const candidates = byLuminaIdMulti.get(lumKey) || [];
        if (candidates.length === 1) {
          matched = candidates[0];
          matchedReason = 'User Tier 2: Unique Lumina ID property';
          result.matchedByLuminaId++;
        } else if (candidates.length > 1) {
          const msg = `User Ambiguity (Tier 2 - Lumina ID): User DocID ${doc.id} pencarian LuminaID '${userLuminaId}' mencocokkan ${candidates.length} siswa master.`;
          ambiguous.push(msg);
          result.ambiguousMatches.push(msg);
        }
      }

      // TIER 3: Match by student's National ID / NIS
      if (!matched && userNis) {
        const nisKey = userNis.trim().toLowerCase();
        const candidates = byNisMulti.get(nisKey) || [];
        if (candidates.length === 1) {
          matched = candidates[0];
          matchedReason = 'User Tier 3: Unique NIS Match';
          result.matchedByNis++;
        } else if (candidates.length > 1) {
          const msg = `User Ambiguity (Tier 3 - NIS): User DocID ${doc.id} pencarian NIS '${userNis}' mencocokkan ${candidates.length} siswa master.`;
          ambiguous.push(msg);
          result.ambiguousMatches.push(msg);
        }
      }

      // TIER 4: Match by Student/Parent Email Address
      if (!matched) {
        const emailCandidates = new Map<string, MasterStudent>();
        if (emailUser) {
          (byEmailMulti.get(emailUser.toLowerCase()) || []).forEach(s => emailCandidates.set(s.docId, s));
        }
        if (parentEmailUser) {
          (byEmailMulti.get(parentEmailUser.toLowerCase()) || []).forEach(s => emailCandidates.set(s.docId, s));
        }

        if (emailCandidates.size === 1) {
          matched = Array.from(emailCandidates.values())[0];
          matchedReason = 'User Tier 4: Unique EmailAddress Match';
          result.matchedByEmail++;
        } else if (emailCandidates.size > 1) {
          const msg = `User Ambiguity (Tier 4 - Email): User DocID ${doc.id} mencocokkan ${emailCandidates.size} siswa master.`;
          ambiguous.push(msg);
          result.ambiguousMatches.push(msg);
        }
      }

      // TIER 5: Fallback - Match by Tolerant Normalized Full Name
      if (!matched && nameUserNorm) {
        const candidates = byNameMulti.get(nameUserNorm) || [];
        if (candidates.length === 1) {
          matched = candidates[0];
          matchedReason = 'User Tier 5: Fallback Unique Normalized Name';
          result.matchedByName++;
        } else if (candidates.length > 1) {
          const msg = `User Ambiguity (Tier 5 - Name): User DocID ${doc.id} pencarian Nama '${nameUserNorm}' mencocokkan ${candidates.length} siswa master dengan nama sama.`;
          ambiguous.push(msg);
          result.ambiguousMatches.push(msg);
        }
      }

      if (matched) {
        console.log(`[Reconciliation] Mapped active user '${doc.id}' (${data.displayName || data.name}) -> master student ID '${matched.docId}' via ${matchedReason}.`);

        const possibleUserKeys: string[] = [];
        possibleUserKeys.push(doc.id); // Auth UID
        possibleUserKeys.push(`INVITE_${doc.id}`); // Prefix for safety
        
        if (userLuminaId) possibleUserKeys.push(userLuminaId);
        if (userNis) possibleUserKeys.push(userNis);
        if (emailUser) possibleUserKeys.push(emailUser);

        for (const key of possibleUserKeys) {
          if (key === matched.docId) continue;
          if (mappingTable[key] && mappingTable[key] !== matched.docId) {
            // Keep existing mapped value, especially if defined by roleInvites
          } else {
            mappingTable[key] = matched.docId;
          }
        }
      }
    });

    if (ambiguous.length > 0) {
      result.errors.push(...ambiguous);
    }

    const keys = Object.keys(mappingTable);
    result.mappingCount = keys.length;
    result.mappingSample = Object.fromEntries(
      keys.slice(0, 45).map((k) => [k, mappingTable[k]])
    );

    console.log(`[Reconciliation] Created mapping table with ${result.mappingCount} entry keys.`);

    if (result.mappingCount === 0) {
      return result;
    }

    // -----------------------------------------------------------------------
    // STEP 3 – Scan & update secondary collections (flat fields + custom deep structures)
    // -----------------------------------------------------------------------
    const targetCollections = [
      { coll: 'observations', fields: ['studentId', 'luminaId'] },
      { coll: 'published_kg_reports', fields: ['studentId', 'luminaId'] },
      { coll: 'users', fields: ['studentId', 'luminaId'] },
      { coll: 'lateness_records', fields: ['studentId'] },
      { coll: 'attendance', fields: ['studentId'] },
      { coll: 'attendance_records', fields: ['studentId'] },
      { coll: 'enrollments', fields: ['studentId'] },
      { coll: 'behaviorCases', fields: ['studentId'] },
      { coll: 'reflections', fields: ['studentId'] },
      { coll: 'literacyProgress', fields: ['studentId'] },
      { coll: 'elementary_literacy_numeracy', fields: ['studentId'] },
    ];

    for (const target of targetCollections) {
      result.scannedCollections[target.coll] = { scanned: 0, matched: 0, errors: 0 };
      const snap = await db.collection(target.coll).get();
      result.scannedCollections[target.coll].scanned = snap.size;

      console.log(`[Reconciliation] Scanning collection '${target.coll}' (${snap.size} docs) for flat & nested student references...`);

      let batch = db.batch();
      let batchCount = 0;
      const BATCH_LIMIT = 400;

      for (const doc of snap.docs) {
        const data = doc.data();
        const updatePayload: Record<string, any> = {};
        let changed = false;

        // 1. Check flat properties
        for (const field of target.fields) {
          const currentVal = data[field];
          if (typeof currentVal === 'string' && mappingTable[currentVal]) {
            const newVal = mappingTable[currentVal];
            updatePayload[field] = newVal;
            changed = true;

            result.changes.push({
              collection: target.coll,
              docId: doc.id,
              field,
              oldValue: currentVal,
              newValue: newVal,
            });
          }
        }

        // 2. Custom nested map key updater: observations
        if (target.coll === 'observations' && data.observations && typeof data.observations === 'object') {
          const obsMap = data.observations;
          const updatedObsMap: Record<string, any> = {};
          let obsChanged = false;

          for (const key of Object.keys(obsMap)) {
            let mappedId: string | undefined;

            if (mappingTable[key]) {
              mappedId = mappingTable[key];
            } else {
              // Fallback Name Matching - Detect full name pattern of key
              const normKey = normalizeName(key);
              if (normKey) {
                const candidates = byNameMulti.get(normKey) || [];
                if (candidates.length === 1) {
                  mappedId = candidates[0].docId;
                  console.log(`[Reconciliation] Name-reconciled observation key: '${key}' in doc '${doc.id}' -> student ID '${mappedId}'`);
                }
              }
            }

            if (mappedId && mappedId !== key) {
              const newKey = mappedId;
              updatedObsMap[newKey] = obsMap[key];
              obsChanged = true;

              result.changes.push({
                collection: 'observations',
                docId: doc.id,
                field: `observations.${key}`,
                oldValue: key,
                newValue: newKey,
              });
            } else {
              updatedObsMap[key] = obsMap[key];
            }
          }

          if (obsChanged) {
            updatePayload['observations'] = updatedObsMap;
            changed = true;
          }
        }

        // 3. Custom nested list updater: attendance (Kindergarten daily students array)
        if (target.coll === 'attendance' && Array.isArray(data.students)) {
          const studentList = data.students;
          let attChanged = false;
          const updatedList = studentList.map((st: any) => {
            if (st && st.studentId) {
              let mappedId: string | undefined;

              if (mappingTable[st.studentId]) {
                mappedId = mappingTable[st.studentId];
              } else if (st.name) {
                // Fallback Name Matching - Detect by student's name value
                const normName = normalizeName(st.name);
                if (normName) {
                  const candidates = byNameMulti.get(normName) || [];
                  if (candidates.length === 1) {
                    mappedId = candidates[0].docId;
                    console.log(`[Reconciliation] Name-reconciled attendance student: '${st.name}' (id:${st.studentId}) in doc '${doc.id}' -> master student ID '${mappedId}'`);
                  }
                }
              }

              if (mappedId && mappedId !== st.studentId) {
                attChanged = true;
                const newId = mappedId;

                result.changes.push({
                  collection: 'attendance',
                  docId: doc.id,
                  field: 'students[].studentId',
                  oldValue: st.studentId,
                  newValue: newId,
                });
                return { ...st, studentId: newId };
              }
            }
            return st;
          });

          if (attChanged) {
            updatePayload['students'] = updatedList;
            changed = true;
          }
        }

        if (changed) {
          result.scannedCollections[target.coll].matched++;
          if (!dryRun) {
            batch.update(doc.ref, updatePayload);
            batchCount++;
            if (batchCount >= BATCH_LIMIT) {
              await batch.commit();
              batch = db.batch();
              batchCount = 0;
            }
          }
        }
      }

      if (!dryRun && batchCount > 0) {
        await batch.commit();
      }
    }

    // -----------------------------------------------------------------------
    // STEP 4 – Scan & update array links (parentStudentLinks.studentIds)
    // -----------------------------------------------------------------------
    const arrayColl = 'parentStudentLinks';
    result.scannedCollections[arrayColl] = { scanned: 0, matched: 0, errors: 0 };
    const linksSnap = await db.collection(arrayColl).get();
    result.scannedCollections[arrayColl].scanned = linksSnap.size;

    console.log(`[Reconciliation] Scanning array collection '${arrayColl}' (${linksSnap.size} docs) for child links updates...`);

    let arrayBatch = db.batch();
    let arrayBatchCount = 0;
    const BATCH_LIMIT = 400;

    for (const doc of linksSnap.docs) {
      const data = doc.data();
      const ids: unknown = data.studentIds;

      if (!Array.isArray(ids)) continue;

      let changed = false;
      const updated = ids.map((id) => {
        if (typeof id === 'string' && mappingTable[id]) {
          changed = true;
          const newVal = mappingTable[id];
          result.changes.push({
            collection: arrayColl,
            docId: doc.id,
            field: 'studentIds',
            oldValue: id,
            newValue: newVal,
          });
          return newVal;
        }
        return id;
      });

      if (changed) {
        result.scannedCollections[arrayColl].matched++;
        if (!dryRun) {
          arrayBatch.update(doc.ref, { studentIds: updated });
          arrayBatchCount++;
          if (arrayBatchCount >= BATCH_LIMIT) {
            await arrayBatch.commit();
            arrayBatch = db.batch();
            arrayBatchCount = 0;
          }
        }
      }
    }

    if (!dryRun && arrayBatchCount > 0) {
      await arrayBatch.commit();
    }

    console.log(`[Reconciliation] Done! Scanned collections stats:`, result.scannedCollections);
    console.log(`[Reconciliation] Total detected reference changes: ${result.changes.length}.`);

    // -----------------------------------------------------------------------
    // STEP 5 – Tulis Log Rekonsiliasi ke Koleksi `adminLogs` di Firestore
    // -----------------------------------------------------------------------
    try {
      const logRef = db.collection('adminLogs').doc();
      await logRef.set({
        id: logRef.id,
        action: 'RECONCILE_STUDENT_REFS',
        executionMode,
        unitId,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        mappingCount: result.mappingCount,
        changesCount: result.changes.length,
        errorsCount: result.errors.length,
        scannedCollections: result.scannedCollections,
        changesSample: result.changes.slice(0, 50), // Store up to first 50 changes
        errorsSample: result.errors.slice(0, 50),
        // Enriched debug metrics
        matchedByDocId: result.matchedByDocId,
        matchedByLuminaId: result.matchedByLuminaId,
        matchedByNis: result.matchedByNis,
        matchedByEmail: result.matchedByEmail,
        matchedByName: result.matchedByName,
        ambiguousMatchesCount: result.ambiguousMatches.length,
        unmatchedInvitesCount: result.unmatchedInvitesCount,
        scannedStudentsCount: result.scannedStudentsCount,
        scannedSTUDENTInvitesCount: result.scannedSTUDENTInvitesCount,
      });
    } catch (logErr) {
      console.warn('[runReconciliation] Gagal menulis ke adminLogs collection:', logErr);
    }

  } catch (err: any) {
    result.errors.push(`Kritis: ${err?.message || err}`);
    console.error(`[Reconciliation] Critical error:`, err);
  }

  return result;
}
