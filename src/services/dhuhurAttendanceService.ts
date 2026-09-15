import { 
  collection, 
  query, 
  where, 
  getDocs 
} from 'firebase/firestore';
import { db } from '../lib/firebase';

export type NormalizedDhuhurEntry = {
  studentId: string;
  studentName?: string;
  classId: string;
  date: string; // YYYY-MM-DD
  academicYear: string;
  semester?: number;
  status:
    | "SALAT_BERJAMAAH"
    | "BERHALANGAN"
    | "IZIN"
    | "TIDAK_MENGIKUTI"
    | "BELUM_DIISI"
    | "TIDAK_BERLAKU";
  updatedAt?: number;
  classNameSnapshot?: string;
};

export const normalizeDhuhurStatus = (raw: unknown): NormalizedDhuhurEntry['status'] => {
  if (raw === null || raw === undefined) return 'BELUM_DIISI';
  const s = String(raw).trim().toUpperCase();
  if (
    s === 'SALAT_BERJAMAAH' || 
    s === 'SALAT BERJAMAAH' || 
    s === 'HADIR' || 
    s === 'H' || 
    s === 'SHALAT_BERJAMAAH' || 
    s === 'SHALAT BERJAMAAH'
  ) {
    return 'SALAT_BERJAMAAH';
  }
  if (
    s === 'BERHALANGAN' || 
    s === 'B' || 
    s === 'BERHALANGAN_SHALAT' ||
    s === 'T' ||
    s === 'TERLAMBAT'
  ) {
    return 'BERHALANGAN';
  }
  if (
    s === 'IZIN' || 
    s === 'I'
  ) {
    return 'IZIN';
  }
  if (
    s === 'TIDAK_MENGIKUTI' || 
    s === 'TIDAK MENGIKUTI' || 
    s === 'ALPA' || 
    s === 'A' || 
    s === 'TIDAK MENGIKUTI SHALAT'
  ) {
    return 'TIDAK_MENGIKUTI';
  }
  if (
    s === 'BELUM_DIISI' || 
    s === 'BELUM' || 
    s === 'BELUM DIISI' || 
    s === ''
  ) {
    return 'BELUM_DIISI';
  }
  if (
    s === 'TIDAK_BERLAKU' || 
    s === 'TIDAK BERLAKU'
  ) {
    return 'TIDAK_BERLAKU';
  }

  // Development-only warning log for unrecognized status
  if (process.env.NODE_ENV !== 'production') {
    console.warn(`[DEV WARNING] Unrecognized stored status:`, raw);
  }
  return 'BELUM_DIISI';
};

export function normalizeDhuhurDocument(docData: any): NormalizedDhuhurEntry[] {
  const entries: NormalizedDhuhurEntry[] = [];
  if (!docData) return entries;

  const docClassId = docData.classId || "";
  const docDate = docData.date || "";
  const docAcademicYear = docData.academicYear || docData.academicYearId || "";
  const docSemester = docData.semester;
  const docUpdatedAt = docData.updatedAt?.toMillis?.() || docData.recordedAt?.toMillis?.() || docData.updatedAt || docData.recordedAt || docData.lastSyncedAt || Date.now();

  const buildEntry = (
    studentId: string, 
    name: string | undefined, 
    status: string, 
    customClassId?: string, 
    customDate?: string
  ): NormalizedDhuhurEntry => {
    return {
      studentId,
      studentName: name,
      classId: customClassId || docClassId,
      date: customDate || docDate,
      academicYear: docAcademicYear,
      semester: typeof docSemester === 'number' ? docSemester : (docSemester ? parseInt(docSemester, 10) : undefined),
      status: normalizeDhuhurStatus(status),
      updatedAt: docUpdatedAt,
      classNameSnapshot: docData.classNameSnapshot || undefined
    };
  };

  // 1. Single student document format
  if (docData.studentId) {
    const status = docData.status || docData.dhuhrPrayerStatus?.status || docData.dhuhrPrayerStatus;
    if (status) {
      entries.push(buildEntry(docData.studentId, docData.studentNameSnapshot || docData.studentName, status));
    }
  }

  // 2. Class per date nested list format
  const listKeys = ['students', 'records', 'attendance', 'entries'];
  for (const listKey of listKeys) {
    const candidate = docData[listKey];
    if (Array.isArray(candidate)) {
      candidate.forEach((item: any) => {
        if (item && item.studentId) {
          const status = item.status || item.dhuhrPrayerStatus?.status || item.dhuhrPrayerStatus;
          if (status) {
            entries.push(buildEntry(
              item.studentId,
              item.studentName || item.name || item.studentNameSnapshot,
              status,
              item.classId,
              item.date
            ));
          }
        }
      });
    }
  }

  // 3. Nested object keyed by student ID
  for (const mapKey of listKeys) {
    const candidate = docData[mapKey];
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
      Object.entries(candidate).forEach(([key, val]: [string, any]) => {
        if (val && typeof val === 'object') {
          const status = val.status || val.dhuhrPrayerStatus?.status || val.dhuhrPrayerStatus;
          if (status) {
            entries.push(buildEntry(
              val.studentId || key,
              val.studentName || val.name || val.studentNameSnapshot,
              status,
              val.classId,
              val.date
            ));
          }
        } else if (typeof val === 'string') {
          entries.push(buildEntry(key, undefined, val));
        }
      });
    }
  }

  return entries;
}

export function deduplicateDhuhurEntries(entries: NormalizedDhuhurEntry[]): NormalizedDhuhurEntry[] {
  const map = new Map<string, NormalizedDhuhurEntry>();
  
  entries.forEach(entry => {
    const key = `${entry.classId}_${entry.date}_${entry.studentId}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, entry);
    } else {
      const existingTs = existing.updatedAt || 0;
      const currentTs = entry.updatedAt || 0;
      if (currentTs > existingTs) {
        // Log duplication preference in development
        if (process.env.NODE_ENV !== 'production') {
          console.log(`[DEV LOG] Duplicate entry found for key: ${key}. Preferring latest timestamp (${currentTs} vs ${existingTs}).`);
        }
        map.set(key, entry);
      }
    }
  });

  return Array.from(map.values());
}

export function calculateDhuhurRecap(entries: NormalizedDhuhurEntry[]) {
  let totalRecorded = 0;
  let salatBerjamaah = 0;
  let berhalangan = 0;
  let izin = 0;
  let tidakMengikuti = 0;
  let belumDiisi = 0;
  let tidakBerlaku = 0;

  entries.forEach(entry => {
    switch (entry.status) {
      case 'SALAT_BERJAMAAH':
        salatBerjamaah++;
        totalRecorded++;
        break;
      case 'BERHALANGAN':
        berhalangan++;
        totalRecorded++;
        break;
      case 'IZIN':
        izin++;
        totalRecorded++;
        break;
      case 'TIDAK_MENGIKUTI':
        tidakMengikuti++;
        totalRecorded++;
        break;
      case 'BELUM_DIISI':
        belumDiisi++;
        break;
      case 'TIDAK_BERLAKU':
        tidakBerlaku++;
        break;
    }
  });

  return {
    totalRecorded,
    salatBerjamaah,
    berhalangan,
    izin,
    tidakMengikuti,
    belumDiisi,
    tidakBerlaku,
  };
}

export async function getDhuhurAttendanceRecords(params: {
  unit: "JUNIOR_HIGH";
  classId?: string;
  className?: string;
  academicYear: string;
  semester?: number;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}): Promise<{
  records: NormalizedDhuhurEntry[];
  sourceDocumentCount: number;
}> {
  const { classId, className, academicYear, semester, startDate, endDate } = params;

  // Consistent normalized academicYear formats
  const targetYear = academicYear;
  const targetYearId = academicYear.replace(/\//g, '-');

  // Query Firestore purely by inclusive date range first to avoid composite index requirements
  const q = query(
    collection(db, 'dhuhur_attendance_records'),
    where('date', '>=', startDate),
    where('date', '<=', endDate)
  );

  const snap = await getDocs(q);
  const sourceDocumentCount = snap.size;

  let allEntries: NormalizedDhuhurEntry[] = [];
  snap.docs.forEach(doc => {
    allEntries.push(...normalizeDhuhurDocument(doc.data()));
  });

  // Filter in-memory for precision
  const filteredEntries = allEntries.filter(entry => {
    // academicYear match
    if (entry.academicYear) {
      const entryYearNormalized = entry.academicYear.trim().replace(/\//g, '-');
      if (entryYearNormalized !== targetYearId && entry.academicYear.trim() !== targetYear) {
        return false;
      }
    }
    // semester match
    if (semester !== undefined && entry.semester !== undefined) {
      if (entry.semester !== semester) {
        return false;
      }
    }
    // classId match with canonical ID or Display Name fallback
    if (classId && classId !== '__ALL_JUNIOR_HIGH_CLASSES__') {
      const matchId = classId.trim().toLowerCase();
      const matchName = className ? className.trim().toLowerCase() : '';
      
      const entryClassId = entry.classId ? entry.classId.trim().toLowerCase() : '';
      const entryClassName = entry.classNameSnapshot ? entry.classNameSnapshot.trim().toLowerCase() : '';
      
      const match = (entryClassId === matchId) || 
                    (matchName && entryClassId === matchName) ||
                    (entryClassName && entryClassName === matchName) ||
                    (entryClassName && entryClassName === matchId);
      if (!match) {
        return false;
      }
    }
    return true;
  });

  // Deduplicate
  const records = deduplicateDhuhurEntries(filteredEntries);

  return {
    records,
    sourceDocumentCount
  };
}
