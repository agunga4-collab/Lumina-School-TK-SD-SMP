import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  writeBatch
} from 'firebase/firestore';
import { db, getClasses, getActiveStudents } from '../lib/firebase';
import { Class, Student, AppUser } from '../types';
import {
  DEFAULT_SO_MASTER_OPTIONS,
  SOMasterOptions,
  SOGroup,
  SOMembership,
  SchoolOrgProgramType,
  StageHistoryItem
} from '../types/schoolOrganizations';

const CONFIG_DOC_PATH = 'jh_so_configs';
const MASTER_DOC_ID = 'master_options';
const GROUPS_COLLECTION = 'jh_so_groups';
const MEMBERSHIPS_COLLECTION = 'jh_so_memberships';

export function makeAcademicYearKey(academicYear: string): string {
  return academicYear.replace(/[\/\s]/g, '_');
}

export function makeGroupId(academicYear: string, programType: SchoolOrgProgramType, masterOptionId: string): string {
  const yearKey = makeAcademicYearKey(academicYear);
  return `${yearKey}_${programType}_${masterOptionId}`;
}

export function makeMembershipId(groupId: string, studentId: string): string {
  return `${groupId}_${studentId.trim()}`;
}

/**
 * Mengambil master options dari dokumen jh_so_configs/master_options.
 * Bila belum ada, kembalikan DEFAULT_SO_MASTER_OPTIONS.
 */
export async function getMasterOptions(): Promise<SOMasterOptions> {
  try {
    const docRef = doc(db, CONFIG_DOC_PATH, MASTER_DOC_ID);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data() as SOMasterOptions;
      return {
        designTeams: data.designTeams || DEFAULT_SO_MASTER_OPTIONS.designTeams,
        swjRoles: data.swjRoles || DEFAULT_SO_MASTER_OPTIONS.swjRoles,
        swjFlowStages: data.swjFlowStages || DEFAULT_SO_MASTER_OPTIONS.swjFlowStages,
        competitionStages: data.competitionStages || DEFAULT_SO_MASTER_OPTIONS.competitionStages,
        updatedAt: data.updatedAt,
        updatedBy: data.updatedBy
      };
    }
  } catch (error) {
    console.warn('Gagal memuat jh_so_configs/master_options, menggunakan nilai default:', error);
  }
  return DEFAULT_SO_MASTER_OPTIONS;
}

/**
 * Menyimpan pembaruan master options ke dokumen jh_so_configs/master_options.
 */
export async function saveMasterOptions(options: SOMasterOptions, userEmail: string): Promise<void> {
  const docRef = doc(db, CONFIG_DOC_PATH, MASTER_DOC_ID);
  const payload: SOMasterOptions = {
    ...options,
    updatedAt: new Date().toISOString(),
    updatedBy: userEmail
  };
  await setDoc(docRef, payload, { merge: true });
}

/**
 * Mengambil daftar grup berdasarkan tahun ajaran dan tipe program (opsional).
 */
export async function getGroups(academicYear: string, programType?: SchoolOrgProgramType): Promise<SOGroup[]> {
  const groupsRef = collection(db, GROUPS_COLLECTION);
  let q;
  if (programType) {
    q = query(
      groupsRef,
      where('academicYear', '==', academicYear),
      where('programType', '==', programType)
    );
  } else {
    q = query(
      groupsRef,
      where('academicYear', '==', academicYear)
    );
  }
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as SOGroup));
}

/**
 * Menyimpan / memperbarui dokumen grup di jh_so_groups.
 */
export async function saveGroup(group: Partial<SOGroup> & { id: string }, userEmail: string): Promise<void> {
  const docRef = doc(db, GROUPS_COLLECTION, group.id);
  const snap = await getDoc(docRef);
  const now = new Date().toISOString();

  if (snap.exists()) {
    await updateDoc(docRef, {
      ...group,
      updatedAt: now,
      updatedBy: userEmail
    });
  } else {
    const payload: SOGroup = {
      id: group.id,
      academicYear: group.academicYear || '',
      programType: group.programType || 'OSIS',
      name: group.name || '',
      categoryOrSubtype: group.categoryOrSubtype || '',
      description: group.description || '',
      mentorUids: group.mentorUids || [],
      mentorNames: group.mentorNames || [],
      studentCoordinatorId: group.studentCoordinatorId || '',
      studentCoordinatorName: group.studentCoordinatorName || '',
      currentStage: group.currentStage || 'Berjalan',
      stageHistory: group.stageHistory || [
        { stage: group.currentStage || 'Berjalan', timestamp: now, updatedBy: userEmail }
      ],
      quota: group.quota ?? undefined,
      organizer: group.organizer || '',
      targetDate: group.targetDate || '',
      status: group.status || 'active',
      createdAt: now,
      createdBy: userEmail,
      updatedAt: now,
      updatedBy: userEmail
    };
    await setDoc(docRef, payload);
  }
}

/**
 * Menggeser tahap grup (SWJ atau Kompetisi) dan mencatat riwayat pergeseran tahap.
 */
export async function updateGroupStage(
  groupId: string,
  newStage: string,
  userEmail: string,
  currentHistory: StageHistoryItem[] = []
): Promise<void> {
  const docRef = doc(db, GROUPS_COLLECTION, groupId);
  const now = new Date().toISOString();
  const newHistoryItem: StageHistoryItem = {
    stage: newStage,
    timestamp: now,
    updatedBy: userEmail
  };
  const updatedHistory = [...currentHistory, newHistoryItem];

  await updateDoc(docRef, {
    currentStage: newStage,
    stageHistory: updatedHistory,
    updatedAt: now,
    updatedBy: userEmail
  });
}

/**
 * Menghapus grup dan seluruh keanggotaan terkait (batch).
 */
export async function deleteGroup(groupId: string): Promise<void> {
  const batch = writeBatch(db);
  const groupRef = doc(db, GROUPS_COLLECTION, groupId);
  batch.delete(groupRef);

  // Cari semua keanggotaan grup ini
  const memQuery = query(collection(db, MEMBERSHIPS_COLLECTION), where('groupId', '==', groupId));
  const memSnap = await getDocs(memQuery);
  memSnap.docs.forEach(mDoc => {
    batch.delete(mDoc.ref);
  });

  await batch.commit();
}

/**
 * Mengambil daftar keanggotaan untuk grup tertentu.
 */
export async function getMembershipsByGroup(groupId: string): Promise<SOMembership[]> {
  const memRef = collection(db, MEMBERSHIPS_COLLECTION);
  const q = query(memRef, where('groupId', '==', groupId));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as SOMembership));
}

/**
 * Mengambil daftar keanggotaan berdasarkan tahun ajaran.
 */
export async function getMembershipsByYear(academicYear: string): Promise<SOMembership[]> {
  const memRef = collection(db, MEMBERSHIPS_COLLECTION);
  const q = query(memRef, where('academicYear', '==', academicYear));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as SOMembership));
}

/**
 * Menambahkan atau memperbarui keanggotaan siswa di grup.
 * ID dokumen: `${groupId}_${studentId}`.
 */
export async function saveMembership(
  data: Omit<SOMembership, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'> & {
    id?: string;
  },
  userEmail: string
): Promise<void> {
  const membershipId = data.id || makeMembershipId(data.groupId, data.studentId);
  const docRef = doc(db, MEMBERSHIPS_COLLECTION, membershipId);
  const now = new Date().toISOString();
  const snap = await getDoc(docRef);

  if (snap.exists()) {
    await updateDoc(docRef, {
      ...data,
      id: membershipId,
      updatedAt: now,
      updatedBy: userEmail
    });
  } else {
    const payload: SOMembership = {
      ...data,
      id: membershipId,
      createdAt: now,
      createdBy: userEmail,
      updatedAt: now,
      updatedBy: userEmail
    };
    await setDoc(docRef, payload);
  }
}

/**
 * Menghapus keanggotaan siswa dari grup.
 */
export async function deleteMembership(membershipId: string): Promise<void> {
  const docRef = doc(db, MEMBERSHIPS_COLLECTION, membershipId);
  await deleteDoc(docRef);
}

// =========================================================================
// NORMALISASI TAHUN AJARAN & SUMBER DATA SISWA / KELAS JUNIOR HIGH
// =========================================================================

export function normalizeAcademicYear(year: string): string {
  return (year || '').replace(/\//g, '-').trim();
}

export function isAcademicYearMatch(y1: any, y2: any): boolean {
  if (!y1 || !y2) return false;
  const s1 = String(y1).trim();
  const s2 = String(y2).trim();
  if (s1 === s2) return true;
  return normalizeAcademicYear(s1) === normalizeAcademicYear(s2);
}

/**
 * Mengambil daftar kelas Junior High pada tahun ajaran terpilih.
 * Menggunakan getClasses() yang sama dengan Assessment Book.
 */
export async function getJuniorHighClasses(academicYear: string): Promise<Class[]> {
  try {
    const allClasses = await getClasses();
    const raw = Array.isArray(allClasses) ? allClasses : [];
    return raw
      .filter(c => {
        if (!c) return false;
        const isJH = c.unitId === 'JUNIOR_HIGH' || ['7', '8', '9', 7, 8, 9].includes(c.grade);
        const isYr = isAcademicYearMatch(c.academicYear, academicYear);
        return isJH && isYr && c.status !== 'archived';
      })
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  } catch (err: any) {
    console.error('Gagal mengambil daftar kelas Junior High:', err);
    throw err;
  }
}

/**
 * Mengambil siswa aktif untuk satu kelas tertentu pada tahun ajaran yang ditentukan.
 * Menggunakan getActiveStudents(classId, academicYear) yang sama dengan Assessment Book,
 * dengan penanganan toleransi format tahun ajaran ('/' vs '-').
 */
export async function getJuniorHighActiveStudentsForClass(
  classId: string,
  academicYear: string,
  classObj?: Class
): Promise<Student[]> {
  const yearToUse = classObj?.academicYear || academicYear;
  let list = await getActiveStudents(classId, yearToUse);
  
  // Jika kosong, coba format alternatif (2026/2027 <-> 2026-2027) untuk antisipasi ketidaksamaan string di enrollments
  if ((!list || list.length === 0) && yearToUse) {
    const altYear = yearToUse.includes('/')
      ? yearToUse.replace(/\//g, '-')
      : yearToUse.replace(/-/g, '/');
    if (altYear !== yearToUse) {
      try {
        const altList = await getActiveStudents(classId, altYear);
        if (altList && altList.length > 0) {
          list = altList;
        }
      } catch (e) {
        // abaikan galat fallback
      }
    }
  }

  const sorted = (list || []).sort((a, b) => {
    const numA = (a as any).attendanceNumber ?? (a as any).noAbsen ?? 999;
    const numB = (b as any).attendanceNumber ?? (b as any).noAbsen ?? 999;
    if (numA !== numB) return numA - numB;
    return (a.name || '').localeCompare(b.name || '');
  });

  return sorted;
}

/**
 * Mengambil seluruh siswa aktif lintas kelas Junior High pada tahun ajaran terpilih.
 */
export async function getJuniorHighAllStudents(
  jhClasses: Class[],
  academicYear: string
): Promise<{ students: Student[]; errors: string[] }> {
  const errors: string[] = [];
  const studentMap = new Map<string, Student>();

  if (!jhClasses || jhClasses.length === 0) {
    return { students: [], errors: [] };
  }

  await Promise.all(
    jhClasses.map(async cls => {
      try {
        const classStudents = await getJuniorHighActiveStudentsForClass(cls.id, academicYear, cls);
        classStudents.forEach(st => {
          if (!studentMap.has(st.id)) {
            studentMap.set(st.id, {
              ...st,
              classId: cls.id,
              className: cls.name
            } as Student & { className?: string });
          }
        });
      } catch (err: any) {
        console.error(`Gagal memuat siswa kelas ${cls.name}:`, err);
        errors.push(`Kelas ${cls.name}: ${err?.message || 'Gagal memuat'}`);
      }
    })
  );

  const students = Array.from(studentMap.values()).sort((a, b) => {
    const numA = (a as any).attendanceNumber ?? (a as any).noAbsen ?? 999;
    const numB = (b as any).attendanceNumber ?? (b as any).noAbsen ?? 999;
    if (numA !== numB) return numA - numB;
    return (a.name || '').localeCompare(b.name || '');
  });

  return { students, errors };
}

// =========================================================================
// SUMBER DATA GURU PEMBINA / MENTOR JUNIOR HIGH
// =========================================================================

export interface JuniorHighTeacherOption extends AppUser {
  unitStatus?: 'JUNIOR_HIGH' | 'ALL' | 'UNKNOWN';
}

/**
 * Mengambil pengguna aktif berperan TEACHER, HOMEROOM_TEACHER, COORDINATOR,
 * HEAD_JUNIOR, dan HEAD_UNIT milik Junior High (unitId atau unit bernilai JUNIOR_HIGH atau ALL).
 * Dokumen pengguna tanpa field unit tetap ditampilkan bila perannya guru, dengan label kecil bila unit tidak diketahui.
 */
export async function getJuniorHighEligibleTeachers(): Promise<JuniorHighTeacherOption[]> {
  try {
    const q = query(
      collection(db, 'users'),
      where('status', '==', 'active')
    );
    const snap = await getDocs(q);
    const eligibleRoles = [
      'TEACHER',
      'HOMEROOM_TEACHER',
      'COORDINATOR',
      'HEAD_JUNIOR',
      'HEAD_UNIT'
    ];

    const results: JuniorHighTeacherOption[] = [];
    snap.docs.forEach(d => {
      const data = d.data();
      const role = data.role as string;
      if (!eligibleRoles.includes(role)) return;

      const unitRaw = data.unitId || data.unit;
      let unitStatus: 'JUNIOR_HIGH' | 'ALL' | 'UNKNOWN';
      if (unitRaw === 'JUNIOR_HIGH') {
        unitStatus = 'JUNIOR_HIGH';
      } else if (unitRaw === 'ALL') {
        unitStatus = 'ALL';
      } else if (!unitRaw) {
        // Dokumen pengguna tanpa field unit tetap harus ditampilkan bila perannya guru
        unitStatus = 'UNKNOWN';
      } else {
        // Unit lain seperti ELEMENTARY / KINDERGARTEN dikecualikan
        return;
      }

      results.push({
        uid: d.id,
        id: d.id,
        ...data,
        unitStatus
      } as JuniorHighTeacherOption);
    });

    return results.sort((a, b) => {
      const nameA = a.displayName || (a as any).name || a.email || '';
      const nameB = b.displayName || (b as any).name || b.email || '';
      return nameA.localeCompare(nameB);
    });
  } catch (err: any) {
    console.error('Gagal memuat guru Junior High:', err);
    throw err;
  }
}
