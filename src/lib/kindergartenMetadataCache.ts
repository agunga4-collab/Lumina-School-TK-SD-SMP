import { collection, query, where, getDocs, documentId } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Kindergarten Metadata Cache & In-flight Deduplicator
 * Designed to drastically cut down Firestore read operations by:
 * 1. Performing Promise-level deduplication (merging simultaneous fetches)
 * 2. Caching loaded classes and resolved student registries with timestamp expirations (5 minutes)
 * 3. Tracking exact read operation statistics across features
 */

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  academicYear: string;
}

// Global In-memory Statistic Tracker for Audit Logs
export const firestoreReadStats = {
  classes: 0,
  students: 0,
  roleInvites: 0,
  enrollments: 0,
  attendanceReports: 0,
  observations: 0,
  dailyContexts: 0,
  totalReadsTracked: 0
};

export function logFirestoreRead(type: keyof typeof firestoreReadStats, count: number) {
  firestoreReadStats[type] += count;
  firestoreReadStats.totalReadsTracked += count;
  console.log(`%c[Firestore Reads Audit] +${count} reads on [${type}]. Cumulative logged reads: ${firestoreReadStats.totalReadsTracked}`, 'color: #ea580c; font-weight: bold;');
}

export function getFirestoreReadAuditSummary() {
  return { ...firestoreReadStats };
}

// In-memory Cache store
// In-memory Cache store
const cachedUnitClasses: Record<string, CacheEntry<any[]>> = {};
const cachedUnitStudents: Record<string, CacheEntry<any[]>> = {};

// In-flight Promise storage to bundle duplicate calls happening in the same render loop
const inflightUnitClassesPromise: Record<string, Promise<any[]>> = {};
const inflightUnitStudentsPromise: Record<string, Promise<any[]>> = {};

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 Minutes TTL before automatic background refresh

/**
 * Fetches and resolves classes for a specific unit with deduplication and caching
 */
export async function getUnitClasses(unitId: string, academicYear: string, forceRefresh = false): Promise<any[]> {
  const cacheKey = `${unitId}_${academicYear}`;
  
  if (!forceRefresh && cachedUnitClasses[cacheKey]) {
    const entry = cachedUnitClasses[cacheKey];
    const age = Date.now() - entry.timestamp;
    if (age < CACHE_TTL_MS) {
      console.log(`[Cache Hit] Serving merged ${unitId} classes for active year: ${academicYear} (Age: ${Math.round(age / 1000)}s)`);
      return entry.data;
    }
  }

  // Deduplicate concurrent inflight requests
  if (inflightUnitClassesPromise[cacheKey]) {
    console.log(`[In-flight Dedupe] Merging concurrent class fetch for active year: ${academicYear} (${unitId})`);
    return inflightUnitClassesPromise[cacheKey];
  }

  const fetchPromise = (async () => {
    try {
      console.log(`[Firestore Query] Loading classes for unit: ${unitId}, academic year: ${academicYear}`);
      const qClasses = query(
        collection(db, 'classes'),
        where('unitId', '==', unitId),
        where('academicYear', '==', academicYear)
      );
      
      const classesSnap = await getDocs(qClasses);
      const docCount = classesSnap.docs.length;
      logFirestoreRead('classes', docCount || 1); // Document read count (or minimum 1 query read)

      const classes = classesSnap.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          name: data.name,
          grade: data.grade,
          unitId: data.unitId,
          academicYear: data.academicYear,
          teacherAssignments: data.teacherAssignments || [],
          assignedTeacherIds: data.assignedTeacherIds || [],
          homeroomTeacherIds: data.homeroomTeacherIds || [],
          gpkTeacherIds: data.gpkTeacherIds || [],
          homeroomTeacherId: data.homeroomTeacherId || null,
          homeroomTeacherName: data.homeroomTeacherName || null,
          status: data.status || 'active'
        };
      }).sort((a, b) => a.name.localeCompare(b.name));

      cachedUnitClasses[cacheKey] = {
        data: classes,
        timestamp: Date.now(),
        academicYear
      };

      return classes;
    } finally {
      delete inflightUnitClassesPromise[cacheKey];
    }
  })();

  inflightUnitClassesPromise[cacheKey] = fetchPromise;
  return fetchPromise;
}

/**
 * Fetches, joins, and resolves the normalized student list for a specific unit
 */
export async function getUnitStudents(unitId: string, academicYear: string, forceRefresh = false): Promise<any[]> {
  const cacheKey = `${unitId}_${academicYear}`;

  if (!forceRefresh && cachedUnitStudents[cacheKey]) {
    const entry = cachedUnitStudents[cacheKey];
    const age = Date.now() - entry.timestamp;
    if (age < CACHE_TTL_MS) {
      console.log(`[Cache Hit] Serving fully resolved list of ${unitId} students for year: ${academicYear} (Age: ${Math.round(age / 1000)}s)`);
      return entry.data;
    }
  }

  if (inflightUnitStudentsPromise[cacheKey]) {
    console.log(`[In-flight Dedupe] Merging concurrent student lookup registry for unit: ${unitId}, year: ${academicYear}`);
    return inflightUnitStudentsPromise[cacheKey];
  }

  const fetchPromise = (async () => {
    try {
      console.log(`[Firestore Query] Compiling master list of active ${unitId} students for academic year: ${academicYear}...`);
      
      const qStudents = query(
        collection(db, 'students'),
        where('unitId', '==', unitId)
      );
      const qInvites = query(
        collection(db, 'roleInvites'),
        where('role', '==', 'STUDENT'),
        where('unitId', '==', unitId)
      );
      const qEnrollments = query(
        collection(db, 'enrollments'),
        where('unitId', '==', unitId),
        where('academicYear', '==', academicYear)
      );

      const [studentsSnap, invitesSnap, enrollmentsSnap] = await Promise.all([
        getDocs(qStudents).catch(e => { console.warn('Students query failed:', e); return { docs: [] }; }),
        getDocs(qInvites).catch(e => { console.warn('Invites query failed:', e); return { docs: [] }; }),
        getDocs(qEnrollments).catch(e => { console.warn('Enrollments query failed:', e); return { docs: [] }; })
      ]);

      // Count operations and log real read costs
      const sRead = studentsSnap.docs.length || 1;
      const iRead = invitesSnap.docs.length || 1;
      const eRead = enrollmentsSnap.docs.length || 1;

      logFirestoreRead('students', sRead);
      logFirestoreRead('roleInvites', iRead);
      logFirestoreRead('enrollments', eRead);

      console.log(`[Compilation Map] Resolving ${unitId} identity graph. Src counts - raw: ${sRead}, invites: ${iRead}, enrollments: ${eRead}`);

      const resolvedStudentIds = new Set<string>();
      studentsSnap.docs.forEach(docSnap => resolvedStudentIds.add(docSnap.id));

      const missingStudentIds = new Set<string>();
      enrollmentsSnap.docs.forEach(docSnap => {
        const sId = docSnap.data().studentId;
        if (sId && !resolvedStudentIds.has(sId)) {
          missingStudentIds.add(sId);
        }
      });

      const missingDocs: any[] = [];
      if (missingStudentIds.size > 0) {
        const missingIdsList = Array.from(missingStudentIds);
        const chunks: string[][] = [];
        for (let i = 0; i < missingIdsList.length; i += 10) {
          chunks.push(missingIdsList.slice(i, i + 10));
        }

        const fetchPromises = chunks.map(chunk => {
          const q = query(
            collection(db, 'students'),
            where(documentId(), 'in', chunk)
          );
          return getDocs(q).catch(e => {
            console.warn('Failed to fetch missing students in cache compile:', e);
            return { docs: [] };
          });
        });

        const missingSnaps = await Promise.all(fetchPromises);
        missingSnaps.forEach(snap => {
          missingDocs.push(...snap.docs);
        });

        logFirestoreRead('students', missingDocs.length);
        console.log(`[Cache Fix] Fetched ${missingDocs.length} missing enrolled students whose unitId was not '${unitId}'`);
      }

      const enrollmentClassMap = new Map<string, string>();
      enrollmentsSnap.docs.forEach(docSnap => {
        const data = docSnap.data();
        if (data.studentId && data.classId) {
          enrollmentClassMap.set(data.studentId, data.classId);
        }
      });

      const map = new Map<string, any>();

      // Merge invites
      invitesSnap.docs.forEach(docSnap => {
        const data = docSnap.data();
        const studentId = data.luminaId || data.id || docSnap.id;
        if (!studentId) return;

        const classId = data.classId || enrollmentClassMap.get(studentId) || '';
        let ageGroup = 'ELEMENTARY';
        if (unitId === 'KINDERGARTEN') {
          const cid = String(classId || '').toUpperCase();
          if (cid.includes('TKB') || cid.includes('TK-B') || cid.includes('BUTTERFLY')) {
            ageGroup = 'TK_B';
          } else if (cid.includes('TKA') || cid.includes('TK-A') || cid.includes('CATERPILLAR')) {
            ageGroup = 'TK_A';
          } else if (cid.includes('PRA_TK') || cid.includes('PRA-TK') || cid.includes('PLAYGROUP') || cid.includes('PG') || cid.includes('BUNAKEN')) {
            ageGroup = 'PRA_TK';
          } else {
            ageGroup = 'TK_A';
          }
        }

        map.set(studentId, {
          id: studentId,
          name: data.fullName || data.name || 'Siswa Tanpa Nama',
          nickName: data.nickname || data.nickName || data.fullName?.split(' ')[0] || 'Siswa',
          ageGroup: ageGroup,
          classId: classId,
          unitId: unitId
        });
      });

      // Merge active registered students
      const allStudentDocs = [...studentsSnap.docs, ...missingDocs];
      allStudentDocs.forEach(docSnap => {
        const data = docSnap.data();
        const studentId = docSnap.id;
        const classId = enrollmentClassMap.get(studentId) || data.classId || '';
        let ageGroup = 'ELEMENTARY';
        if (unitId === 'KINDERGARTEN') {
          const g = String(data.grade || '').toUpperCase();
          const cid = String(classId || '').toUpperCase();
          if (cid.includes('TKB') || cid.includes('TK-B') || cid.includes('BUTTERFLY') || g.includes('TK_B') || g === 'TK B' || g === 'TKB') {
            ageGroup = 'TK_B';
          } else if (cid.includes('TKA') || cid.includes('TK-A') || cid.includes('CATERPILLAR') || g.includes('TK_A') || g === 'TK A' || g === 'TKA') {
            ageGroup = 'TK_A';
          } else if (cid.includes('PRA_TK') || cid.includes('PRA-TK') || cid.includes('PLAYGROUP') || cid.includes('PG') || cid.includes('BUNAKEN') || g.includes('PRA') || g === 'PRA TK' || g === 'PLAYGROUP') {
            ageGroup = 'PRA_TK';
          } else {
            ageGroup = 'TK_A';
          }
        }

        const existing = map.get(studentId);
        if (existing && existing.classId) {
          map.set(studentId, {
            ...existing,
            name: existing.name || data.fullName || data.name || 'Siswa Tanpa Nama',
            nickName: existing.nickName || data.nickname || data.nickName || data.fullName?.split(' ')[0] || 'Siswa',
            unitId: unitId,
            ageGroup: ageGroup
          });
        } else {
          map.set(studentId, {
            id: studentId,
            name: data.fullName || data.name || 'Siswa Tanpa Nama',
            nickName: data.nickname || data.nickName || data.fullName?.split(' ')[0] || 'Siswa',
            ageGroup: ageGroup,
            classId: classId,
            unitId: unitId
          });
        }
      });

      const uniqueStudentsMap = new Map<string, any>();
      Array.from(map.values()).forEach(stud => {
        const normName = stud.name.trim().toLowerCase();
        const existing = uniqueStudentsMap.get(normName);
        if (!existing) {
          uniqueStudentsMap.set(normName, stud);
        } else {
          // Keep registered records preferentially over raw invites
          const existingIsInvite = existing.id && (existing.id.startsWith('INVITE_') || existing.id.includes('_') || existing.id.length > 15);
          const currentIsInvite = stud.id && (stud.id.startsWith('INVITE_') || stud.id.includes('_') || stud.id.length > 15);
          if (existingIsInvite && !currentIsInvite) {
            uniqueStudentsMap.set(normName, stud);
          }
        }
      });

      const resolvedList = Array.from(uniqueStudentsMap.values()).sort((a, b) => a.name.localeCompare(b.name));

      cachedUnitStudents[cacheKey] = {
        data: resolvedList,
        timestamp: Date.now(),
        academicYear
      };

      return resolvedList;
    } finally {
      delete inflightUnitStudentsPromise[cacheKey];
    }
  })();

  inflightUnitStudentsPromise[cacheKey] = fetchPromise;
  return fetchPromise;
}

/**
 * Fetches and resolves kindergarten classes with deduplication and caching
 */
export async function getKindergartenClasses(academicYear: string, forceRefresh = false): Promise<any[]> {
  return getUnitClasses('KINDERGARTEN', academicYear, forceRefresh);
}

/**
 * Fetches, joins, and resolves the normalized student list (students, enrollments, roleInvites)
 * with strict cache-first deduplication to prevent 300+ reads per page switch.
 */
export async function getKindergartenStudents(academicYear: string, forceRefresh = false): Promise<any[]> {
  return getUnitStudents('KINDERGARTEN', academicYear, forceRefresh);
}

/**
 * Manual invalidation of caches to force-fetch fresh configurations
 */
export function invalidateKindergartenCache() {
  console.log('[Cache Maintenance] Invalidating all cache store buffers.');
  for (const k in cachedUnitClasses) {
    delete cachedUnitClasses[k];
  }
  for (const k in cachedUnitStudents) {
    delete cachedUnitStudents[k];
  }
}

/**
 * Resolves a canonical class ID or legacy/raw class name to a canonical class ID.
 * Returns the resolved canonical class ID, or null if unresolved/ambiguous.
 */
export function resolveCanonicalClassId(
  inputClassId: string,
  classesList: any[]
): string | null {
  if (!inputClassId) return null;

  const trimmedInput = inputClassId.trim();

  // 1. Direct match on exact ID (case-insensitive)
  const directIdMatch = classesList.find(
    c => c.id.toLowerCase() === trimmedInput.toLowerCase()
  );
  if (directIdMatch) {
    return directIdMatch.id;
  }

  // 2. Direct match on exact Name (case-insensitive)
  const directNameMatch = classesList.find(
    c => c.name.toLowerCase() === trimmedInput.toLowerCase()
  );
  if (directNameMatch) {
    return directNameMatch.id;
  }

  // 3. Fallback: Exact normalized name matching (removing spaces, dashes, underscores)
  const normInput = trimmedInput.replace(/[\s\-_]+/g, '').toLowerCase();
  
  if (!normInput) return null;

  const normalizedMatches = classesList.filter(c => {
    const normId = c.id.replace(/[\s\-_]+/g, '').toLowerCase();
    const normName = c.name.replace(/[\s\-_]+/g, '').toLowerCase();
    return normInput === normName || normInput === normId;
  });

  if (normalizedMatches.length === 1) {
    return normalizedMatches[0].id;
  }

  if (normalizedMatches.length > 1) {
    console.warn(
      `[Developer Warning] Ambiguous class reference: "${inputClassId}" matches multiple classes: ${normalizedMatches
        .map(c => c.id)
        .join(', ')}`
    );
    return null;
  }

  console.warn(
    `[Developer Warning] Unresolved class reference: "${inputClassId}" could not be matched to any canonical class.`
  );
  return null;
}

