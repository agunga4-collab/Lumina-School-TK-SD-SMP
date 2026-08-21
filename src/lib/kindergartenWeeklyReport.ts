import { KGWeeklyReportDraft, KGDomain, KGActivity } from '../types';
import { buildStudentNameIndex, resolveAttendanceStudent } from './namecentricResolver';
import { resolveCanonicalClassId } from './kindergartenMetadataCache';

export const DOMAIN_LABEL_MAP: Record<string, string> = {
  AGAMA_BUDI_PEKERTI: 'Nilai Agama & Budi Pekerti',
  SOSIAL_EMOSIONAL: 'Sosial-Emosional',
  BAHASA: 'Bahasa',
  KOGNITIF: 'Kognitif',
  FISIK_MOTORIK: 'Fisik-Motorik',
  SENI: 'Seni'
};

export const ACTIVITY_LABEL_MAP: Record<string, string> = {
  MAKE_BELIEVE: 'Make-Believe',
  ISLAMIC_AWARENESS: 'Islamic Awareness',
  LIBRARY_LITERACY: 'Library & Literacy',
  DISCOVERY: 'Discovery',
  BLOCKS_BUILDING: 'Blocks & Building',
  ART_EXPLORATIONS: 'Art Explorations',
  ENGLISH: 'English',
  MUSIC: 'Music',
  OUTSIDE: 'Outside',
  AUDIO_VISUAL: 'Audio Visual',
  SPECIAL_PROGRAM: 'Special Program',
  MORNING_MOVEMENT: 'Morning Movement'
};

export interface KGStudent {
  id: string;
  name: string;
  nickName: string;
  ageGroup: 'TK_A' | 'TK_B';
  classId?: string;
}

export const getStoredStudents = (): KGStudent[] => {
  if (typeof window === 'undefined') return [];
  const saved = localStorage.getItem('kg_students');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        // Filter out dummy/mock students
        const filtered = parsed.filter((item: any) => {
          const nameLower = String(item.name || '').toLowerCase();
          return !(
            nameLower.includes('aisha kamila') || 
            nameLower.includes('rafif al-fariz') || 
            nameLower.includes('nabila syifa') || 
            nameLower.includes('budi') || 
            nameLower.includes('siti') || 
            nameLower.includes('siswa kindergarten') ||
            item.id === 'K001' ||
            item.id === 'K002' ||
            item.id === 'K003'
          );
        });

        // If dummy data was indeed found and filtered, rewrite kg_students and clear related storage
        if (filtered.length !== parsed.length) {
          localStorage.setItem('kg_students', JSON.stringify(filtered));
          localStorage.removeItem('kg_checklist_records');
          localStorage.removeItem('kg_observation_data');
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.startsWith('kg_obs_hist_') || key.startsWith('kg_weekly_summary_') || key.startsWith('kg_weekly_report_'))) {
              localStorage.removeItem(key);
              i--;
            }
          }
          return filtered;
        }

        return filtered.map((item: any) => ({
          id: String(item.id || ''),
          name: String(item.name || ''),
          nickName: String(item.nickName || ''),
          classId: item.classId ? String(item.classId) : undefined,
          ageGroup: (item.ageGroup === 'TK_B' ? 'TK_B' : 'TK_A') as 'TK_A' | 'TK_B'
        }));
      }
    } catch (e) {
      console.error('[kindergartenWeeklyReport] Error parsing kg_students', e);
    }
  }
  return []; // Delete default dummy data (returns empty)
};

export const saveStoredStudents = (students: KGStudent[]) => {
  localStorage.setItem('kg_students', JSON.stringify(students));
};

export const DEFAULT_STUDENTS: KGStudent[] = new Proxy([] as KGStudent[], {
  get(target, prop) {
    const list = getStoredStudents();
    if (prop === '$$typeof' || prop === 'constructor' || prop === 'then') return undefined;
    const val = (list as any)[prop];
    return typeof val === 'function' ? val.bind(list) : val;
  },
  has(target, prop) {
    const list = getStoredStudents();
    return prop in list;
  },
  ownKeys(target) {
    const list = getStoredStudents();
    return Reflect.ownKeys(list);
  },
  getOwnPropertyDescriptor(target, prop) {
    const list = getStoredStudents();
    return Reflect.getOwnPropertyDescriptor(list, prop);
  }
});

// Helper: Format Date to YYYY-MM-DD
export function formatDateToKey(date: Date): string {
  const yr = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const da = String(date.getDate()).padStart(2, '0');
  return `${yr}-${mo}-${da}`;
}

// Helper: Get Monday of a given date's week
export function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Adjust when Day is Sunday
  const monday = new Date(date.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

// Helper: Validate if a photo URL is valid and safe for render/PDF
export function isValidPhotoUrl(url: any): boolean {
  if (!url) return false;
  if (typeof url !== 'string') return false;
  const cleanUrl = url.trim();
  if (
    cleanUrl === '' || 
    cleanUrl === 'undefined' || 
    cleanUrl === 'null' || 
    cleanUrl.toLowerCase().includes('placeholder')
  ) {
    return false;
  }
  
  if (
    cleanUrl.startsWith('blob:') || 
    cleanUrl.startsWith('data:') || 
    cleanUrl.includes('localhost') || 
    cleanUrl.includes('127.0.0.1')
  ) {
    return false;
  }
  
  if (
    cleanUrl.startsWith('http://') || 
    cleanUrl.startsWith('https://') || 
    cleanUrl.startsWith('/') ||
    cleanUrl.startsWith('gs://')
  ) {
    return true;
  }
  
  return false;
}

// Helper: Extract valid photo URL from a generic doc (checks multiple legacy/current fields)
export function getValidPhotoUrl(doc: any): string | null {
  if (!doc) return null;
  const fields = [
    'generalPhotoUrl',
    'generalPhoto',
    'generalActivityPhotoUrl',
    'photoUrl',
    'imageUrl',
    'url',
    'photoDataUrl',
    'storageUrl'
  ];
  for (const field of fields) {
    if (doc[field] && isValidPhotoUrl(doc[field])) {
      return doc[field].trim();
    }
  }
  return null;
}

// Helper: Extract valid photo URL from a student observation record
export function getValidStudentPhotoUrl(studentObs: any): string | null {
  if (!studentObs) return null;
  const fields = [
    'photo',
    'photoUrl',
    'imageUrl',
    'url',
    'photoDataUrl',
    'storageUrl'
  ];
  for (const field of fields) {
    if (studentObs[field] && isValidPhotoUrl(studentObs[field])) {
      return studentObs[field].trim();
    }
  }
  return null;
}

// Helper: Enforce strict class-matching for general photos (including legacy documents)
export function isDocCompatibleWithStudent(
  doc: any,
  student: any,
  activeStudents?: any[],
  allClasses?: any[]
): boolean {
  if (!student) return false;
  const rawStudentClassId = student.classId;
  if (!rawStudentClassId) return false;

  const currentClasses = allClasses || [];

  // Use deterministic class normalization helper to resolve both references to canonical
  const canonicalStudentClassId = resolveCanonicalClassId(rawStudentClassId, currentClasses) || rawStudentClassId;
  
  const rawDocClassId = doc.classId || '';
  const canonicalDocClassId = rawDocClassId ? (resolveCanonicalClassId(rawDocClassId, currentClasses) || rawDocClassId) : '';

  // 1. Strict match if canonicalized classIds exist and are equal
  if (canonicalDocClassId && canonicalDocClassId !== 'unassigned') {
    return canonicalDocClassId === canonicalStudentClassId;
  }

  // 2. Specific override for "Pra TK Test Kelas" on 11 August
  const docDate = doc.date || doc.observationDate;
  const isAug11 = docDate === '2026-08-11' || docDate === '2025-08-11' || docDate?.includes('08-11');
  const isPraTKTest = doc.generalPhotoUrl?.includes('Pra%20TK') || doc.generalPhoto?.includes('Pra%20TK') || doc.title?.includes('Pra TK') || doc.caption?.includes('Pra TK');

  if (isAug11 && isPraTKTest) {
    const className = (student.className || '').toLowerCase();
    if (className.includes('pra tk') || className.includes('pratk') || canonicalStudentClassId.includes('pra-tk') || canonicalStudentClassId.includes('pratk') || canonicalStudentClassId.toLowerCase().includes('test')) {
      return true;
    }
  }

  // 3. Fallback: check if studentIds inside observations map match the targetClassId
  if (doc.observations && Object.keys(doc.observations).length > 0) {
    const observationKeys = Object.keys(doc.observations);
    for (const key of observationKeys) {
      const foundStudent = (activeStudents || []).find(s => s.id === key || s.oldLuminaId === key || s.nis === key);
      if (foundStudent && foundStudent.classId) {
        const foundStudentCanonicalClassId = resolveCanonicalClassId(foundStudent.classId, currentClasses) || foundStudent.classId;
        if (foundStudentCanonicalClassId === canonicalStudentClassId) {
          return true;
        }
      }
    }
  }

  return false;
}

// Main Aggregator function
export function aggregateKGWeeklyReport(
  studentId: string,
  selectedDate: Date,
  firestoreAttendanceDocs?: any[],
  firestoreObservationDocs?: any[],
  activeStudents?: any[],
  allClasses?: any[]
): KGWeeklyReportDraft {
  const student = (activeStudents || []).find(s => s.id === studentId) ||
                  DEFAULT_STUDENTS.find(s => s.id === studentId) || {
    id: studentId,
    name: 'Siswa Kindergarten',
    nickName: 'Ananda',
    ageGroup: 'TK_A' as const
  };

  const monday = getMonday(selectedDate);
  const daysOfWeek: Array<{ key: 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY'; diffDays: number; labelString: string }> = [
    { key: 'MONDAY', diffDays: 0, labelString: 'Monday' },
    { key: 'TUESDAY', diffDays: 1, labelString: 'Tuesday' },
    { key: 'WEDNESDAY', diffDays: 2, labelString: 'Wednesday' },
    { key: 'THURSDAY', diffDays: 3, labelString: 'Thursday' },
    { key: 'FRIDAY', diffDays: 4, labelString: 'Friday' },
  ];

  const dateKeys = daysOfWeek.map(d => {
    const dayDate = new Date(monday);
    dayDate.setDate(monday.getDate() + d.diffDays);
    return {
      dayKey: d.key,
      dayLabel: d.labelString,
      dateKey: formatDateToKey(dayDate),
      dateObj: dayDate
    };
  });

  // Calculate Month & Date Range Label
  const fridayDate = new Date(monday);
  fridayDate.setDate(monday.getDate() + 4);

  const monthLabel = monday.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  const dateRangeLabel = `${monday.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} - ${fridayDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  
  // Calculate Week Number (relative to month starting)
  const firstDayOfMonth = new Date(monday.getFullYear(), monday.getMonth(), 1);
  const firstMonday = getMonday(firstDayOfMonth);
  const weekDiff = Math.floor((monday.getTime() - firstMonday.getTime()) / (7 * 24 * 60 * 60 * 1000));
  const weekNumber = Math.max(1, weekDiff + 1);
  const weekLabel = `Week ${weekNumber}`;

  // 1. Gather Checklist/Attendance Statuses for the 1 week
  const attendanceSummary = {
    happy: 0,
    sad: 0,
    angry: 0,
    ok: 0,
    noNews: 0,
    sick: 0,
    izin: 0,
    earlyLeave: 0
  };

  if (firestoreAttendanceDocs && firestoreAttendanceDocs.length > 0) {
    const nameIndex = activeStudents ? buildStudentNameIndex(activeStudents) : {};
    firestoreAttendanceDocs.forEach(docData => {
      const dStr = docData.date;
      const matchedDay = dateKeys.find(dk => dk.dateKey === dStr);
      if (matchedDay) {
        const studentsList = docData.students || [];
        studentsList.forEach((s: any) => {
          const resolved = activeStudents ? resolveAttendanceStudent({
            originalStudentId: s.studentId || '',
            originalStudentName: s.studentName || s.name || '',
            activeStudents,
            nameIndex
          }) : { resolvedStudentId: s.studentId };

          const resolvedId = resolved.resolvedStudentId || s.studentId;
          if (resolvedId === studentId) {
            const statusVal = String(s.status || '').toLowerCase();
            const emoVal = String(s.emotion || '').toUpperCase();

            if (statusVal === 'hadir') {
              if (emoVal === 'HAPPY') attendanceSummary.happy++;
              else if (emoVal === 'SAD') attendanceSummary.sad++;
              else if (emoVal === 'ANGRY') attendanceSummary.angry++;
              else attendanceSummary.ok++;
            } else if (statusVal === 'sakit') {
              attendanceSummary.sick++;
            } else if (statusVal === 'izin') {
              attendanceSummary.izin++;
            } else if (statusVal === 'tanpa_kabar') {
              attendanceSummary.noNews++;
            }
          }
        });
      }
    });
  } else {
    const checklistSaved = localStorage.getItem('kg_checklist_records');
    if (checklistSaved) {
      try {
        const records = JSON.parse(checklistSaved);
        dateKeys.forEach(dk => {
          const dayData = records[dk.dateKey];
          const studentStatus = dayData?.[studentId];
          if (studentStatus) {
            const att = studentStatus.attendance;
            const emo = studentStatus.emotion;

            if (att === 'PRESENT') {
              if (emo === 'HAPPY') attendanceSummary.happy++;
              else if (emo === 'SAD') attendanceSummary.sad++;
              else if (emo === 'ANGRY') attendanceSummary.angry++;
              else if (emo === 'OK') attendanceSummary.ok++;
              else attendanceSummary.ok++;
            } else if (att === 'SICK') {
              attendanceSummary.sick++;
            } else if (att === 'PERMISSION') {
              attendanceSummary.izin++;
            } else if (att === 'NO_NEWS') {
              attendanceSummary.noNews++;
            }
          }
        });
      } catch (e) {
        console.error('[Aggregator] Error parsing checklist records:', e);
      }
    }
  }

  // 2. Fetch all Observation historical logs & match with the week's date keys
  const weeklyObservationItems: KGWeeklyReportDraft['weeklyObservationItems'] = [];
  
  if (firestoreObservationDocs && firestoreObservationDocs.length > 0) {
    const nameIndex = activeStudents ? buildStudentNameIndex(activeStudents) : {};
    firestoreObservationDocs.forEach(payload => {
      const obsTimestamp = payload.timestamp || Date.now();
      const obsDateStr = payload.date || formatDateToKey(new Date(obsTimestamp));

      const matchedDay = dateKeys.find(dk => dk.dateKey === obsDateStr);
      if (matchedDay) {
        let studentObs = payload.observations?.[studentId];
        
        if (!studentObs && activeStudents) {
          const obsKeys = Object.keys(payload.observations || {});
          for (const key of obsKeys) {
            const resolved = resolveAttendanceStudent({
              originalStudentId: key,
              originalStudentName: payload.observations[key]?.studentName || '',
              activeStudents,
              nameIndex
            });
            if (resolved.resolvedStudentId === studentId) {
              studentObs = payload.observations[key];
              break;
            }
          }
        }

        const isCompatibleDoc = isDocCompatibleWithStudent(payload, student, activeStudents, allClasses);
        if (studentObs && (studentObs.grading || studentObs.notes || studentObs.photo)) {
          weeklyObservationItems.push({
            dayLabel: matchedDay.dayLabel,
            dateKey: matchedDay.dateKey,
            activity: ACTIVITY_LABEL_MAP[payload.activity] || payload.activity,
            domain: DOMAIN_LABEL_MAP[payload.domain] || payload.domain,
            objective: ACTIVITY_LABEL_MAP[payload.activity] || 'Aktivitas Kelas',
            grade: studentObs.grading || null,
            notes: studentObs.notes || '',
            photoUrl: getValidStudentPhotoUrl(studentObs),
            generalPhotoUrl: (isCompatibleDoc && payload.generalPhotoDeleted !== true) ? getValidPhotoUrl(payload) : null
          });
        }
      }
    });
  } else {
    // Scan through localStorage for keys starting with kg_obs_hist_
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('kg_obs_hist_')) {
        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            const payload = JSON.parse(raw);
            const obsTimestamp = payload.timestamp || Date.now();
            const obsDateStr = formatDateToKey(new Date(obsTimestamp));
 
            // Check if this falls in our active week dates
            const matchedDay = dateKeys.find(dk => dk.dateKey === obsDateStr);
            if (matchedDay) {
              const studentObs = payload.observations?.[studentId];
              const isCompatibleDoc = isDocCompatibleWithStudent(payload, student, activeStudents, allClasses);
              if (studentObs && (studentObs.grading || studentObs.notes || studentObs.photo)) {
                weeklyObservationItems.push({
                  dayLabel: matchedDay.dayLabel,
                  dateKey: matchedDay.dateKey,
                  activity: ACTIVITY_LABEL_MAP[payload.selectedActivity] || payload.selectedActivity,
                  domain: DOMAIN_LABEL_MAP[payload.selectedDomain] || payload.selectedDomain,
                  objective: ACTIVITY_LABEL_MAP[payload.selectedActivity] || 'Aktivitas Kelas',
                  grade: studentObs.grading || null,
                  notes: studentObs.notes || '',
                  photoUrl: getValidStudentPhotoUrl(studentObs),
                  generalPhotoUrl: (isCompatibleDoc && payload.generalPhotoDeleted !== true) ? getValidPhotoUrl(payload) : null
                });
              }
            }
          }
        } catch (e) {
          console.error('[Aggregator] Error processing key:', key, e);
        }
      }
    }
  }

  // 3. Group Observation Summary by Domain
  const groupedMap: Record<string, {
    activityList: Set<string>;
    objectiveList: Set<string>;
    grades: Set<string>;
    gradeCounts: Record<string, number>;
    mergedNotes: string[];
  }> = {};

  weeklyObservationItems.forEach(item => {
    const dom = item.domain || 'Lainnya';
    if (!groupedMap[dom]) {
      groupedMap[dom] = {
        activityList: new Set(),
        objectiveList: new Set(),
        grades: new Set(),
        gradeCounts: {},
        mergedNotes: []
      };
    }
    if (item.activity) groupedMap[dom].activityList.add(item.activity);
    if (item.objective) groupedMap[dom].objectiveList.add(item.objective);
    if (item.grade) {
      const gClean = String(item.grade).trim().toUpperCase();
      if (gClean !== 'ABSENT' && gClean !== 'NOT_PARTICIPATING') {
        groupedMap[dom].grades.add(item.grade);
        groupedMap[dom].gradeCounts[item.grade] = (groupedMap[dom].gradeCounts[item.grade] || 0) + 1;
      }
    }
    if (item.notes && item.notes.trim() !== '') groupedMap[dom].mergedNotes.push(item.notes.trim());
  });

  const groupedObservationSummary: KGWeeklyReportDraft['groupedObservationSummary'] = Object.entries(groupedMap).map(([dom, val]) => ({
    domain: dom,
    activityList: Array.from(val.activityList),
    objectiveList: Array.from(val.objectiveList),
    grades: Array.from(val.grades),
    gradeCounts: val.gradeCounts,
    mergedNotes: val.mergedNotes
  }));

  // 4. Construct daily snapshots (and fallback logic)
  const dailySnapshots: KGWeeklyReportDraft['dailySnapshots'] = dateKeys.map(dk => {
    const rawStudentClassId = student.classId || '';
    const canonicalClassId = resolveCanonicalClassId(rawStudentClassId, allClasses || []) || rawStudentClassId;

    // Look at observations on this specific date key
    const dayObs = weeklyObservationItems.filter(item => item.dateKey === dk.dateKey);
    
    // Priority: individual photoUrl -> generalPhotoUrl -> null
    let chosenPhoto: string | null = null;
    let personalPhotoResult: string | null = null;
    
    const individualPhotoItem = dayObs.find(item => item.photoUrl && isValidPhotoUrl(item.photoUrl));
    if (individualPhotoItem) {
      personalPhotoResult = individualPhotoItem.photoUrl;
      chosenPhoto = personalPhotoResult;
    } else {
      const generalPhotoItem = dayObs.find(item => item.generalPhotoUrl && isValidPhotoUrl(item.generalPhotoUrl));
      if (generalPhotoItem) {
        chosenPhoto = generalPhotoItem.generalPhotoUrl;
      }
    }

    // Fallback: If personal/general photo from current student observations are missing,
    // find class session for: `canonical classId + exact snapshot date`.
    let queriedSessionDoc: any = null;
    let generalPhotoUrlAvailable: string | null = null;
    let generalPhotoAvailable: string | null = null;

    if (!chosenPhoto) {
      if (firestoreObservationDocs && firestoreObservationDocs.length > 0) {
        queriedSessionDoc = firestoreObservationDocs.find(doc => {
          const obsTimestamp = doc.timestamp || Date.now();
          const obsDateStr = doc.date || formatDateToKey(new Date(obsTimestamp));
          const matchesDate = obsDateStr === dk.dateKey;
          
          const rawDocClassId = doc.classId || '';
          const docCanonicalClassId = resolveCanonicalClassId(rawDocClassId, allClasses || []) || rawDocClassId;
          const matchesClass = docCanonicalClassId === canonicalClassId;
          const matchesUnit = !doc.unitId || doc.unitId === 'KINDERGARTEN';

          return matchesDate && matchesClass && matchesUnit;
        });
      }

      if (!queriedSessionDoc) {
        // LocalStorage fallback
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('kg_obs_hist_')) {
            try {
              const raw = localStorage.getItem(key);
              if (raw) {
                const payload = JSON.parse(raw);
                const obsTimestamp = payload.timestamp || Date.now();
                const obsDateStr = payload.date || formatDateToKey(new Date(obsTimestamp));
                const matchesDate = obsDateStr === dk.dateKey;
                
                const rawDocClassId = payload.classId || '';
                const docCanonicalClassId = resolveCanonicalClassId(rawDocClassId, allClasses || []) || rawDocClassId;
                const matchesClass = docCanonicalClassId === canonicalClassId;

                if (matchesDate && matchesClass) {
                  queriedSessionDoc = payload;
                  break;
                }
              }
            } catch (e) {
              // ignore
            }
          }
        }
      }

      if (queriedSessionDoc) {
        if (queriedSessionDoc.generalPhotoUrl && isValidPhotoUrl(queriedSessionDoc.generalPhotoUrl)) {
          generalPhotoUrlAvailable = queriedSessionDoc.generalPhotoUrl;
        }
        if (queriedSessionDoc.generalPhoto && isValidPhotoUrl(queriedSessionDoc.generalPhoto)) {
          generalPhotoAvailable = queriedSessionDoc.generalPhoto;
        }
        chosenPhoto = generalPhotoUrlAvailable || generalPhotoAvailable;
      }
    }

    // DEV DIAGNOSTIC
    if (!chosenPhoto) {
      console.warn(
        `[DEV DIAGNOSTIC] Fallback Failed:\n` +
        `- studentId: ${studentId}\n` +
        `- raw classId: ${rawStudentClassId}\n` +
        `- resolved canonical classId: ${canonicalClassId}\n` +
        `- snapshot date: ${dk.dateKey}\n` +
        `- personal-photo result: ${personalPhotoResult || 'null'}\n` +
        `- queried session document/key: ${queriedSessionDoc ? (queriedSessionDoc.id || 'found payload') : 'not found'}\n` +
        `- availability of generalPhotoUrl: ${generalPhotoUrlAvailable || 'absent'}\n` +
        `- availability of generalPhoto: ${generalPhotoAvailable || 'absent'}`
      );
    } else if (!personalPhotoResult) {
      console.info(
        `[DEV DIAGNOSTIC] Fallback Succeeded:\n` +
        `- studentId: ${studentId}\n` +
        `- raw classId: ${rawStudentClassId}\n` +
        `- resolved canonical classId: ${canonicalClassId}\n` +
        `- snapshot date: ${dk.dateKey}\n` +
        `- personal-photo result: null\n` +
        `- queried session document/key: ${queriedSessionDoc ? (queriedSessionDoc.id || 'found payload') : 'found in weekly items'}\n` +
        `- availability of generalPhotoUrl: ${generalPhotoUrlAvailable || 'absent'}\n` +
        `- availability of generalPhoto: ${generalPhotoAvailable || 'absent'}\n` +
        `- resolved photo: ${chosenPhoto}`
      );
    }

    // Fallback notes or text
    let fallbackText = 'Belum ada dokumentasi foto kerja harian atau kegiatan observasi untuk hari ini.';
    if (dayObs.length > 0) {
      const activitiesObserved = dayObs.map(o => o.activity).filter(Boolean);
      if (activitiesObserved.length > 0) {
        fallbackText = `Mengikuti aktivitas ${activitiesObserved.join(', ')} bersama teman-teman secara interaktif.`;
      }
    }

    return {
      dayKey: dk.dayKey,
      label: `${dk.dayLabel}, ${dk.dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}`,
      photoUrl: chosenPhoto,
      fallbackText
    };
  });

  // 5. Try to recover existing saved values (Teacher modifications)
  const draftKey = `kg_weekly_report_${studentId}_${monday.getFullYear()}_W${weekNumber}`;
  let existingWeeklyCommentsDraft = '';
  let existingSocialEmotionalDraft = '';
  let existingTeacherComments = '';
  let existingTeacherSEL = '';

  try {
    const savedDraft = localStorage.getItem(draftKey);
    if (savedDraft) {
      const parsedDraft = JSON.parse(savedDraft);
      existingWeeklyCommentsDraft = parsedDraft.aiWeeklyCommentsDraft || '';
      existingSocialEmotionalDraft = parsedDraft.aiSocialEmotionalDraft || '';
      existingTeacherComments = parsedDraft.teacherEditedWeeklyComments || '';
      existingTeacherSEL = parsedDraft.teacherEditedSocialEmotional || '';
    }
  } catch (e) {
    console.error('[Aggregator] Error loading existing draft saved values:', e);
  }

  return {
    studentId,
    studentName: student.name,
    nickName: student.nickName,
    className: 'Butterfly',
    classGroup: 'B1',
    ageGroup: student.ageGroup,
    monthLabel,
    weekLabel,
    theme: '', // Empty theme default
    dateRangeLabel,
    weeklyObservationItems,
    groupedObservationSummary,
    dailySnapshots,
    attendanceSummary,
    aiWeeklyCommentsDraft: existingWeeklyCommentsDraft,
    aiSocialEmotionalDraft: existingSocialEmotionalDraft,
    teacherEditedWeeklyComments: existingTeacherComments,
    teacherEditedSocialEmotional: existingTeacherSEL
  };
}

export function getDatesInRange(start: Date, end: Date): Date[] {
  const dates: Date[] = [];
  let curr = new Date(start);
  curr.setHours(0,0,0,0);
  const finish = new Date(end);
  finish.setHours(0,0,0,0);
  
  let limit = 0;
  while (curr <= finish && limit < 31) {
    dates.push(new Date(curr));
    curr.setDate(curr.getDate() + 1);
    limit++;
  }
  return dates;
}

export function aggregateKGWeeklyReportForPeriod(
  studentId: string,
  startDateStr: string,
  endDateStr: string,
  firestoreAttendanceDocs?: any[],
  firestoreObservationDocs?: any[],
  activeStudents?: any[],
  dailyContexts?: any[],
  allClasses?: any[]
) {
  const student = (activeStudents || []).find(s => s.id === studentId) ||
                  DEFAULT_STUDENTS.find(s => s.id === studentId) || {
    id: studentId,
    name: 'Siswa Kindergarten',
    nickName: 'Ananda',
    ageGroup: 'TK_A' as const
  };

  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  const dates = getDatesInRange(start, end);

  // Generate dateKeys
  const dayNames = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  const dateKeys = dates.map(d => {
    const dayIndex = d.getDay();
    const dayLabel = dayNames[dayIndex];
    return {
      dayKey: (dayLabel === 'SUNDAY' || dayLabel === 'SATURDAY') ? 'FRIDAY' : dayLabel as any,
      dayLabel: d.toLocaleDateString('en-US', { weekday: 'long' }),
      dateKey: formatDateToKey(d),
      dateObj: d
    };
  });

  const monthLabel = start.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  const dateRangeLabel = `${start.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} - ${end.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}`;

  const attendanceSummary = {
    happy: 0,
    sad: 0,
    angry: 0,
    ok: 0,
    noNews: 0,
    sick: 0,
    izin: 0,
    earlyLeave: 0
  };

  if (firestoreAttendanceDocs && firestoreAttendanceDocs.length > 0) {
    const nameIndex = activeStudents ? buildStudentNameIndex(activeStudents) : {};
    firestoreAttendanceDocs.forEach(docData => {
      const dStr = docData.date;
      const matchedDay = dateKeys.find(dk => dk.dateKey === dStr);
      if (matchedDay) {
        const studentsList = docData.students || [];
        studentsList.forEach((s: any) => {
          const resolved = activeStudents ? resolveAttendanceStudent({
            originalStudentId: s.studentId || '',
            originalStudentName: s.studentName || s.name || '',
            activeStudents,
            nameIndex
          }) : { resolvedStudentId: s.studentId };

          const resolvedId = resolved.resolvedStudentId || s.studentId;
          if (resolvedId === studentId) {
            const statusVal = String(s.status || '').toLowerCase();
            const emoVal = String(s.emotion || '').toUpperCase();

            if (statusVal === 'hadir') {
              if (emoVal === 'HAPPY') attendanceSummary.happy++;
              else if (emoVal === 'SAD') attendanceSummary.sad++;
              else if (emoVal === 'ANGRY') attendanceSummary.angry++;
              else attendanceSummary.ok++;
            } else if (statusVal === 'sakit') {
              attendanceSummary.sick++;
            } else if (statusVal === 'izin') {
              attendanceSummary.izin++;
            } else if (statusVal === 'tanpa_kabar') {
              attendanceSummary.noNews++;
            }
          }
        });
      }
    });
  } else {
    const checklistSaved = localStorage.getItem('kg_checklist_records');
    if (checklistSaved) {
      try {
        const records = JSON.parse(checklistSaved);
        dateKeys.forEach(dk => {
          const dayData = records[dk.dateKey];
          const studentStatus = dayData?.[studentId];
          if (studentStatus) {
            const att = studentStatus.attendance;
            const emo = studentStatus.emotion;

            if (att === 'PRESENT') {
              if (emo === 'HAPPY') attendanceSummary.happy++;
              else if (emo === 'SAD') attendanceSummary.sad++;
              else if (emo === 'ANGRY') attendanceSummary.angry++;
              else if (emo === 'OK') attendanceSummary.ok++;
              else attendanceSummary.ok++;
            } else if (att === 'SICK') {
              attendanceSummary.sick++;
            } else if (att === 'PERMISSION') {
              attendanceSummary.izin++;
            } else if (att === 'NO_NEWS') {
              attendanceSummary.noNews++;
            }
          }
        });
      } catch (e) {
        console.error('[Period Aggregator] Error parsing checklist records:', e);
      }
    }
  }

  // Gather actual observation logs 
  const weeklyObservationItems: Array<{
    dayLabel: string;
    dateKey: string;
    activity?: string;
    domain?: string;
    objective?: string;
    grade?: string;
    notes?: string;
    photoUrl?: string | null;
    generalPhotoUrl?: string | null;
  }> = [];

  if (firestoreObservationDocs && firestoreObservationDocs.length > 0) {
    const nameIndex = activeStudents ? buildStudentNameIndex(activeStudents) : {};
    firestoreObservationDocs.forEach(payload => {
      const obsTimestamp = payload.timestamp || Date.now();
      const obsDateStr = payload.date || formatDateToKey(new Date(obsTimestamp));

      const matchedDay = dateKeys.find(dk => dk.dateKey === obsDateStr);
      const rawStudentClassId = student.classId || '';
      const studentCanonicalClassId = resolveCanonicalClassId(rawStudentClassId, allClasses || []) || rawStudentClassId;
      const rawPayloadClassId = payload.classId || '';
      const payloadCanonicalClassId = rawPayloadClassId ? (resolveCanonicalClassId(rawPayloadClassId, allClasses || []) || rawPayloadClassId) : '';
      const classMatches = !rawPayloadClassId || !rawStudentClassId || payloadCanonicalClassId === studentCanonicalClassId;

      if (matchedDay && classMatches) {
        let studentObs = payload.observations?.[studentId];
        
        if (!studentObs && activeStudents) {
          const obsKeys = Object.keys(payload.observations || {});
          for (const key of obsKeys) {
            const resolved = resolveAttendanceStudent({
              originalStudentId: key,
              originalStudentName: payload.observations[key]?.studentName || '',
              activeStudents,
              nameIndex
            });
            if (resolved.resolvedStudentId === studentId) {
              studentObs = payload.observations[key];
              break;
            }
          }
        }

        const isCompatibleDoc = isDocCompatibleWithStudent(payload, student, activeStudents, allClasses);
        if (studentObs && (studentObs.grading || studentObs.notes || studentObs.photo)) {
          weeklyObservationItems.push({
            dayLabel: matchedDay.dayLabel,
            dateKey: matchedDay.dateKey,
            activity: ACTIVITY_LABEL_MAP[payload.activity] || payload.activity,
            domain: DOMAIN_LABEL_MAP[payload.domain] || payload.domain,
            objective: ACTIVITY_LABEL_MAP[payload.activity] || 'Aktivitas Kelas',
            grade: studentObs.grading || null,
            notes: studentObs.notes || '',
            photoUrl: getValidStudentPhotoUrl(studentObs),
            generalPhotoUrl: (isCompatibleDoc && payload.generalPhotoDeleted !== true) ? getValidPhotoUrl(payload) : null
          });
        }
      }
    });
  } else {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('kg_obs_hist_')) {
        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            const payload = JSON.parse(raw);
            const obsTimestamp = payload.timestamp || Date.now();
            const obsDateStr = payload.date || formatDateToKey(new Date(obsTimestamp));

            const matchedDay = dateKeys.find(dk => dk.dateKey === obsDateStr);
            const isCompatibleDoc = isDocCompatibleWithStudent(payload, student, activeStudents, allClasses);
            if (matchedDay && isCompatibleDoc) {
              const studentObs = payload.observations?.[studentId];
              if (studentObs && (studentObs.grading || studentObs.notes || studentObs.photo)) {
                weeklyObservationItems.push({
                  dayLabel: matchedDay.dayLabel,
                  dateKey: matchedDay.dateKey,
                  activity: ACTIVITY_LABEL_MAP[payload.selectedActivity] || payload.selectedActivity,
                  domain: DOMAIN_LABEL_MAP[payload.selectedDomain] || payload.selectedDomain,
                  objective: ACTIVITY_LABEL_MAP[payload.selectedActivity] || 'Aktivitas Kelas',
                  grade: studentObs.grading || null,
                  notes: studentObs.notes || '',
                  photoUrl: getValidStudentPhotoUrl(studentObs),
                  generalPhotoUrl: payload.generalPhotoDeleted === true ? null : getValidPhotoUrl(payload)
                });
              }
            }
          }
        } catch (e) {
          console.error('[Period Aggregator] Error processing key:', key, e);
        }
      }
    }
  }

  const groupedMap: Record<string, {
    activityList: Set<string>;
    objectiveList: Set<string>;
    grades: Set<string>;
    gradeCounts: Record<string, number>;
    mergedNotes: string[];
  }> = {};

  weeklyObservationItems.forEach(item => {
    const dom = item.domain || 'Lainnya';
    if (!groupedMap[dom]) {
      groupedMap[dom] = {
        activityList: new Set(),
        objectiveList: new Set(),
        grades: new Set(),
        gradeCounts: {},
        mergedNotes: []
      };
    }
    if (item.activity) groupedMap[dom].activityList.add(item.activity);
    if (item.objective) groupedMap[dom].objectiveList.add(item.objective);
    if (item.grade) {
      const gClean = String(item.grade).trim().toUpperCase();
      if (gClean !== 'ABSENT' && gClean !== 'NOT_PARTICIPATING') {
        groupedMap[dom].grades.add(item.grade);
        groupedMap[dom].gradeCounts[item.grade] = (groupedMap[dom].gradeCounts[item.grade] || 0) + 1;
      }
    }
    if (item.notes && item.notes.trim() !== '') groupedMap[dom].mergedNotes.push(item.notes.trim());
  });

  const groupedObservationSummary = Object.entries(groupedMap).map(([dom, val]) => ({
    domain: dom,
    activityList: Array.from(val.activityList),
    objectiveList: Array.from(val.objectiveList),
    grades: Array.from(val.grades),
    gradeCounts: val.gradeCounts,
    mergedNotes: val.mergedNotes
  }));

  // Construct daily snapshots for standard Mon-Fri inside the range
  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const dailySnapshots = daysOfWeek.map(dayName => {
    const dk = dateKeys.find(key => key.dayLabel === dayName);
    let chosenPhoto: string | null = null;
    let fallbackText = 'Belum ada dokumentasi foto kerja harian atau kegiatan observasi untuk hari ini.';
    let queriedSessionDoc: any = null;
    let foundContext: any = null;
    let dayObsForStudent: any[] = [];
    const rawStudentClassId = student.classId || '';
    const canonicalClassId = (dk ? resolveCanonicalClassId(rawStudentClassId, allClasses || []) : null) || rawStudentClassId;

    if (dk) {
      dayObsForStudent = weeklyObservationItems.filter(item => item.dateKey === dk.dateKey);
      foundContext = (dailyContexts || []).find(dc => dc && (dc.observationDate === dk.dateKey || dc.date === dk.dateKey)) || null;

      // 1. Try to find if student has individual photo on this date
      let personalPhotoResult: string | null = null;
      const individualPhotoItem = dayObsForStudent.find(item => item.photoUrl && isValidPhotoUrl(item.photoUrl));
      
      if (individualPhotoItem) {
        personalPhotoResult = individualPhotoItem.photoUrl;
        chosenPhoto = personalPhotoResult;
      } else {
        // Look for generalPhotoUrl/generalPhoto on weeklyObservationItems that matched the canonical class
        const generalPhotoItem = dayObsForStudent.find(item => item.generalPhotoUrl && isValidPhotoUrl(item.generalPhotoUrl));
        if (generalPhotoItem) {
          chosenPhoto = generalPhotoItem.generalPhotoUrl;
        }
      }

      // Fallback: If personal/general photo from current student observations are missing,
      // find class session for: `canonical classId + exact snapshot date`.
      let generalPhotoUrlAvailable: string | null = null;
      let generalPhotoAvailable: string | null = null;

      if (!chosenPhoto) {
        if (firestoreObservationDocs && firestoreObservationDocs.length > 0) {
          queriedSessionDoc = firestoreObservationDocs.find(doc => {
            const obsTimestamp = doc.timestamp || Date.now();
            const obsDateStr = doc.date || formatDateToKey(new Date(obsTimestamp));
            const matchesDate = obsDateStr === dk.dateKey;
            
            const rawDocClassId = doc.classId || '';
            const docCanonicalClassId = resolveCanonicalClassId(rawDocClassId, allClasses || []) || rawDocClassId;
            const matchesClass = docCanonicalClassId === canonicalClassId;
            const matchesUnit = !doc.unitId || doc.unitId === 'KINDERGARTEN';

            return matchesDate && matchesClass && matchesUnit;
          });
        }

        if (!queriedSessionDoc) {
          // LocalStorage fallback
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('kg_obs_hist_')) {
              try {
                const raw = localStorage.getItem(key);
                if (raw) {
                  const payload = JSON.parse(raw);
                  const obsTimestamp = payload.timestamp || Date.now();
                  const obsDateStr = payload.date || formatDateToKey(new Date(obsTimestamp));
                  const matchesDate = obsDateStr === dk.dateKey;
                  
                  const rawDocClassId = payload.classId || '';
                  const docCanonicalClassId = resolveCanonicalClassId(rawDocClassId, allClasses || []) || rawDocClassId;
                  const matchesClass = docCanonicalClassId === canonicalClassId;

                  if (matchesDate && matchesClass) {
                    queriedSessionDoc = payload;
                    break;
                  }
                }
              } catch (e) {
                // ignore
              }
            }
          }
        }

        if (queriedSessionDoc) {
          if (queriedSessionDoc.generalPhotoUrl && isValidPhotoUrl(queriedSessionDoc.generalPhotoUrl)) {
            generalPhotoUrlAvailable = queriedSessionDoc.generalPhotoUrl;
          }
          if (queriedSessionDoc.generalPhoto && isValidPhotoUrl(queriedSessionDoc.generalPhoto)) {
            generalPhotoAvailable = queriedSessionDoc.generalPhoto;
          }
          chosenPhoto = generalPhotoUrlAvailable || generalPhotoAvailable;
        }
      }

      // DEV DIAGNOSTIC
      if (!chosenPhoto) {
        console.warn(
          `[DEV DIAGNOSTIC] Fallback Failed:\n` +
          `- studentId: ${studentId}\n` +
          `- raw classId: ${rawStudentClassId}\n` +
          `- resolved canonical classId: ${canonicalClassId}\n` +
          `- snapshot date: ${dk.dateKey}\n` +
          `- personal-photo result: ${personalPhotoResult || 'null'}\n` +
          `- queried session document/key: ${queriedSessionDoc ? (queriedSessionDoc.id || 'found payload') : 'not found'}\n` +
          `- availability of generalPhotoUrl: ${generalPhotoUrlAvailable || 'absent'}\n` +
          `- availability of generalPhoto: ${generalPhotoAvailable || 'absent'}`
        );
      } else if (!personalPhotoResult) {
        console.info(
          `[DEV DIAGNOSTIC] Fallback Succeeded:\n` +
          `- studentId: ${studentId}\n` +
          `- raw classId: ${rawStudentClassId}\n` +
          `- resolved canonical classId: ${canonicalClassId}\n` +
          `- snapshot date: ${dk.dateKey}\n` +
          `- personal-photo result: null\n` +
          `- queried session document/key: ${queriedSessionDoc ? (queriedSessionDoc.id || 'found payload') : 'found in weekly items'}\n` +
          `- availability of generalPhotoUrl: ${generalPhotoUrlAvailable || 'absent'}\n` +
          `- availability of generalPhoto: ${generalPhotoAvailable || 'absent'}\n` +
          `- resolved photo: ${chosenPhoto}`
        );
      }

      if (foundContext) {
        if (foundContext.sentraId === 'SPECIAL_ACTIVITY') {
          fallbackText = `Mengikuti kegiatan khusus "${foundContext.sentraName || 'Kegiatan Khusus'}" bersama-sama teman-sekelas.`;
        } else {
          fallbackText = `Mengikuti aktivitas Sentra ${foundContext.sentraName || foundContext.sentraId} pada domain perkembangan ${foundContext.domainName || foundContext.domainId} bersama-sama teman-sekelas.`;
        }
      } else if (dayObsForStudent.length > 0) {
        const activitiesObserved = dayObsForStudent.map(o => o.activity).filter(Boolean);
        if (activitiesObserved.length > 0) {
          fallbackText = `Mengikuti aktivitas ${activitiesObserved.join(', ')} secara interaktif.`;
        }
      } else {
        // Check if there was any general activity observed on this day for the class
        let generalActivityName = '';
        if (firestoreObservationDocs && firestoreObservationDocs.length > 0) {
          const generalDocAct = firestoreObservationDocs.find(doc => {
            const obsTimestamp = doc.timestamp || Date.now();
            const obsDateStr = doc.date || formatDateToKey(new Date(obsTimestamp));
            const matchesClass = !doc.classId || !student.classId || String(doc.classId) === String(student.classId);
            return obsDateStr === dk.dateKey && matchesClass;
          });
          if (generalDocAct) {
            generalActivityName = ACTIVITY_LABEL_MAP[generalDocAct.activity] || generalDocAct.activity || '';
          }
        } else {
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('kg_obs_hist_')) {
              try {
                const raw = localStorage.getItem(key);
                if (raw) {
                  const payload = JSON.parse(raw);
                  const obsTimestamp = payload.timestamp || Date.now();
                  const obsDateStr = payload.date || formatDateToKey(new Date(obsTimestamp));
                  if (obsDateStr === dk.dateKey) {
                    generalActivityName = ACTIVITY_LABEL_MAP[payload.selectedActivity] || payload.selectedActivity || '';
                    break;
                  }
                }
              } catch (e) {
                // ignore
              }
            }
          }
        }
        if (generalActivityName) {
          fallbackText = `Mengikuti aktivitas ${generalActivityName} bersama-sama teman-sekelas.`;
        }
      }
    }

    // Extract Catatan Umum Hari Ini for this class and date
    let generalNoteForDay: string | null = null;
    if (foundContext && foundContext.generalNote && typeof foundContext.generalNote === 'string' && foundContext.generalNote.trim()) {
      generalNoteForDay = foundContext.generalNote.trim();
    }
    if (!generalNoteForDay && typeof localStorage !== 'undefined' && dk) {
      const localNoteKey = `kg_daily_note_${canonicalClassId}_${dk.dateKey}`;
      const localNote = localStorage.getItem(localNoteKey);
      if (localNote && localNote.trim()) {
        generalNoteForDay = localNote.trim();
      }
    }
    if (!generalNoteForDay && queriedSessionDoc && queriedSessionDoc.generalNote && typeof queriedSessionDoc.generalNote === 'string' && queriedSessionDoc.generalNote.trim()) {
      generalNoteForDay = queriedSessionDoc.generalNote.trim();
    }
    if (!generalNoteForDay && dayObsForStudent && dayObsForStudent.length > 0) {
      const obsWithNote = dayObsForStudent.find((o: any) => o && o.generalNote && typeof o.generalNote === 'string' && o.generalNote.trim());
      if (obsWithNote) {
        generalNoteForDay = obsWithNote.generalNote.trim();
      }
    }

    return {
      dayKey: dayName.toUpperCase() as any,
      label: dk ? `${dayName}, ${dk.dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}` : dayName,
      photoUrl: chosenPhoto,
      fallbackText,
      generalNote: generalNoteForDay,
      dateKey: dk ? dk.dateKey : null
    };
  });

  return {
    studentId,
    studentName: student.name,
    nickName: student.nickName,
    className: 'Butterfly',
    classGroup: 'B1',
    ageGroup: student.ageGroup,
    monthLabel,
    theme: '',
    dateRangeLabel,
    weeklyObservationItems,
    groupedObservationSummary,
    dailySnapshots,
    attendanceSummary,
    startDate: startDateStr,
    endDate: endDateStr
  };
}
