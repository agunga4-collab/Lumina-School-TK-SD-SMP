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
let cachedClasses: CacheEntry<any[]> | null = null;
let cachedStudents: CacheEntry<any[]> | null = null;

// In-flight Promise storage to bundle duplicate calls happening in the same render loop
let inflightClassesPromise: Record<string, Promise<any[]>> = {};
let inflightStudentsPromise: Record<string, Promise<any[]>> = {};

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 Minutes TTL before automatic background refresh

/**
 * Fetches and resolves kindergarten classes with deduplication and caching
 */
export async function getKindergartenClasses(academicYear: string, forceRefresh = false): Promise<any[]> {
  const cacheKey = academicYear;
  
  if (!forceRefresh && cachedClasses && cachedClasses.academicYear === academicYear) {
    const age = Date.now() - cachedClasses.timestamp;
    if (age < CACHE_TTL_MS) {
      console.log(`[Cache Hit] Serving merged Kindergarten classes for active year: ${academicYear} (Age: ${Math.round(age / 1000)}s)`);
      return cachedClasses.data;
    }
  }

  // Deduplicate concurrent inflight requests
  if (inflightClassesPromise[cacheKey]) {
    console.log(`[In-flight Dedupe] Merging concurrent class fetch for active year: ${academicYear}`);
    return inflightClassesPromise[cacheKey];
  }

  const fetchPromise = (async () => {
    try {
      console.log(`[Firestore Query] Loading classes for academic year: ${academicYear}`);
      const qClasses = query(
        collection(db, 'classes'),
        where('unitId', '==', 'KINDERGARTEN'),
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

      cachedClasses = {
        data: classes,
        timestamp: Date.now(),
        academicYear
      };

      return classes;
    } finally {
      delete inflightClassesPromise[cacheKey];
    }
  })();

  inflightClassesPromise[cacheKey] = fetchPromise;
  return fetchPromise;
}

/**
 * Fetches, joins, and resolves the normalized student list (students, enrollments, roleInvites)
 * with strict cache-first deduplication to prevent 300+ reads per page switch.
 */
export async function getKindergartenStudents(academicYear: string, forceRefresh = false): Promise<any[]> {
  const cacheKey = academicYear;

  if (!forceRefresh && cachedStudents && cachedStudents.academicYear === academicYear) {
    const age = Date.now() - cachedStudents.timestamp;
    if (age < CACHE_TTL_MS) {
      console.log(`[Cache Hit] Serving fully resolved list of Kindergarten students for year: ${academicYear} (Age: ${Math.round(age / 1000)}s)`);
      return cachedStudents.data;
    }
  }

  if (inflightStudentsPromise[cacheKey]) {
    console.log(`[In-flight Dedupe] Merging concurrent student lookup registry for year: ${academicYear}`);
    return inflightStudentsPromise[cacheKey];
  }

  const fetchPromise = (async () => {
    try {
      console.log(`[Firestore Query] Compiling master list of active Kindergarten students for academic year: ${academicYear}...`);
      
      const qStudents = query(
        collection(db, 'students'),
        where('unitId', '==', 'KINDERGARTEN')
      );
      const qInvites = query(
        collection(db, 'roleInvites'),
        where('role', '==', 'STUDENT'),
        where('unitId', '==', 'KINDERGARTEN')
      );
      const qEnrollments = query(
        collection(db, 'enrollments'),
        where('unitId', '==', 'KINDERGARTEN'),
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

      console.log(`[Compilation Map] Resolving identity graph. Src counts - raw: ${sRead}, invites: ${iRead}, enrollments: ${eRead}`);

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
        const ageGroup = data.classId && String(data.classId).toLowerCase().includes('tkb') ? 'TK_B' : 'TK_A';

        map.set(studentId, {
          id: studentId,
          name: data.fullName || data.name || 'Siswa Tanpa Nama',
          nickName: data.nickname || data.nickName || data.fullName?.split(' ')[0] || 'Siswa',
          ageGroup: ageGroup,
          classId: classId
        });
      });

      // Merge active registered students
      studentsSnap.docs.forEach(docSnap => {
        const data = docSnap.data();
        const studentId = docSnap.id;
        const classId = enrollmentClassMap.get(studentId) || data.classId || '';
        const ageGroup = (data.grade === 'TK_B' || (classId && String(classId).toLowerCase().includes('tkb'))) ? 'TK_B' : 'TK_A';

        const existing = map.get(studentId);
        if (existing && existing.classId) {
          map.set(studentId, {
            ...existing,
            name: existing.name || data.fullName || data.name || 'Siswa Tanpa Nama',
            nickName: existing.nickName || data.nickname || data.nickName || data.fullName?.split(' ')[0] || 'Siswa'
          });
        } else {
          map.set(studentId, {
            id: studentId,
            name: data.fullName || data.name || 'Siswa Tanpa Nama',
            nickName: data.nickname || data.nickName || data.fullName?.split(' ')[0] || 'Siswa',
            ageGroup: ageGroup,
            classId: classId
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

      cachedStudents = {
        data: resolvedList,
        timestamp: Date.now(),
        academicYear
      };

      return resolvedList;
    } finally {
      delete inflightStudentsPromise[cacheKey];
    }
  })();

  inflightStudentsPromise[cacheKey] = fetchPromise;
  return fetchPromise;
}

/**
 * Manual invalidation of caches to force-fetch fresh configurations
 */
export function invalidateKindergartenCache() {
  console.log('[Cache Maintenance] Invalidating all cache store buffers.');
  cachedClasses = null;
  cachedStudents = null;
}
