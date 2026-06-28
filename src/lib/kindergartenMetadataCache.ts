import { collection, query, where, getDocs } from 'firebase/firestore';
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
          academicYear: data.academicYear
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
        const ageGroup = unitId === 'KINDERGARTEN'
          ? (data.classId && String(data.classId).toLowerCase().includes('tkb') ? 'TK_B' : 'TK_A')
          : 'ELEMENTARY';

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
      studentsSnap.docs.forEach(docSnap => {
        const data = docSnap.data();
        const studentId = docSnap.id;
        const classId = enrollmentClassMap.get(studentId) || data.classId || '';
        const ageGroup = unitId === 'KINDERGARTEN'
          ? ((data.grade === 'TK_B' || (classId && String(classId).toLowerCase().includes('tkb'))) ? 'TK_B' : 'TK_A')
          : 'ELEMENTARY';

        const existing = map.get(studentId);
        if (existing && existing.classId) {
          map.set(studentId, {
            ...existing,
            name: existing.name || data.fullName || data.name || 'Siswa Tanpa Nama',
            nickName: existing.nickName || data.nickname || data.nickName || data.fullName?.split(' ')[0] || 'Siswa',
            unitId: unitId
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
