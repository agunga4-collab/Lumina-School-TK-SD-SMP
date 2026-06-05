import { KGWeeklyReportDraft, KGDomain, KGActivity } from '../types';

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

// Main Aggregator function
export function aggregateKGWeeklyReport(
  studentId: string,
  selectedDate: Date
): KGWeeklyReportDraft {
  const student = DEFAULT_STUDENTS.find(s => s.id === studentId) || {
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

  // 2. Fetch all Observation historical logs & match with the week's date keys
  const weeklyObservationItems: KGWeeklyReportDraft['weeklyObservationItems'] = [];
  
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
            if (studentObs && (studentObs.grading || studentObs.notes || studentObs.photo)) {
              weeklyObservationItems.push({
                dayLabel: matchedDay.dayLabel,
                dateKey: matchedDay.dateKey,
                activity: ACTIVITY_LABEL_MAP[payload.selectedActivity] || payload.selectedActivity,
                domain: DOMAIN_LABEL_MAP[payload.selectedDomain] || payload.selectedDomain,
                objective: ACTIVITY_LABEL_MAP[payload.selectedActivity] || 'Aktivitas Kelas',
                grade: studentObs.grading || 'Belum Berkembang',
                notes: studentObs.notes || '',
                photoUrl: studentObs.photo || null,
                generalPhotoUrl: payload.generalPhoto || null
              });
            }
          }
        }
      } catch (e) {
        console.error('[Aggregator] Error processing key:', key, e);
      }
    }
  }

  // 3. Group Observation Summary by Domain
  const groupedMap: Record<string, {
    activityList: Set<string>;
    objectiveList: Set<string>;
    grades: Set<string>;
    mergedNotes: string[];
  }> = {};

  weeklyObservationItems.forEach(item => {
    const dom = item.domain || 'Lainnya';
    if (!groupedMap[dom]) {
      groupedMap[dom] = {
        activityList: new Set(),
        objectiveList: new Set(),
        grades: new Set(),
        mergedNotes: []
      };
    }
    if (item.activity) groupedMap[dom].activityList.add(item.activity);
    if (item.objective) groupedMap[dom].objectiveList.add(item.objective);
    if (item.grade) groupedMap[dom].grades.add(item.grade);
    if (item.notes && item.notes.trim() !== '') groupedMap[dom].mergedNotes.push(item.notes.trim());
  });

  const groupedObservationSummary: KGWeeklyReportDraft['groupedObservationSummary'] = Object.entries(groupedMap).map(([dom, val]) => ({
    domain: dom,
    activityList: Array.from(val.activityList),
    objectiveList: Array.from(val.objectiveList),
    grades: Array.from(val.grades),
    mergedNotes: val.mergedNotes
  }));

  // 4. Construct daily snapshots (and fallback logic)
  const dailySnapshots: KGWeeklyReportDraft['dailySnapshots'] = dateKeys.map(dk => {
    // Look at observations on this specific date key
    const dayObs = weeklyObservationItems.filter(item => item.dateKey === dk.dateKey);
    
    // Priority: individual photoUrl -> generalPhotoUrl -> null
    let chosenPhoto: string | null = null;
    const individualPhotoItem = dayObs.find(item => item.photoUrl);
    if (individualPhotoItem) {
      chosenPhoto = individualPhotoItem.photoUrl;
    } else {
      const generalPhotoItem = dayObs.find(item => item.generalPhotoUrl);
      if (generalPhotoItem) {
        chosenPhoto = generalPhotoItem.generalPhotoUrl;
      }
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
  endDateStr: string
) {
  const student = DEFAULT_STUDENTS.find(s => s.id === studentId) || {
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

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('kg_obs_hist_')) {
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const payload = JSON.parse(raw);
          const obsTimestamp = payload.timestamp || Date.now();
          const obsDateStr = formatDateToKey(new Date(obsTimestamp));

          const matchedDay = dateKeys.find(dk => dk.dateKey === obsDateStr);
          if (matchedDay) {
            const studentObs = payload.observations?.[studentId];
            if (studentObs && (studentObs.grading || studentObs.notes || studentObs.photo)) {
              weeklyObservationItems.push({
                dayLabel: matchedDay.dayLabel,
                dateKey: matchedDay.dateKey,
                activity: ACTIVITY_LABEL_MAP[payload.selectedActivity] || payload.selectedActivity,
                domain: DOMAIN_LABEL_MAP[payload.selectedDomain] || payload.selectedDomain,
                objective: ACTIVITY_LABEL_MAP[payload.selectedActivity] || 'Aktivitas Kelas',
                grade: studentObs.grading || 'Belum Berkembang',
                notes: studentObs.notes || '',
                photoUrl: studentObs.photo || null,
                generalPhotoUrl: payload.generalPhoto || null
              });
            }
          }
        }
      } catch (e) {
        console.error('[Period Aggregator] Error processing key:', key, e);
      }
    }
  }

  const groupedMap: Record<string, {
    activityList: Set<string>;
    objectiveList: Set<string>;
    grades: Set<string>;
    mergedNotes: string[];
  }> = {};

  weeklyObservationItems.forEach(item => {
    const dom = item.domain || 'Lainnya';
    if (!groupedMap[dom]) {
      groupedMap[dom] = {
        activityList: new Set(),
        objectiveList: new Set(),
        grades: new Set(),
        mergedNotes: []
      };
    }
    if (item.activity) groupedMap[dom].activityList.add(item.activity);
    if (item.objective) groupedMap[dom].objectiveList.add(item.objective);
    if (item.grade) groupedMap[dom].grades.add(item.grade);
    if (item.notes && item.notes.trim() !== '') groupedMap[dom].mergedNotes.push(item.notes.trim());
  });

  const groupedObservationSummary = Object.entries(groupedMap).map(([dom, val]) => ({
    domain: dom,
    activityList: Array.from(val.activityList),
    objectiveList: Array.from(val.objectiveList),
    grades: Array.from(val.grades),
    mergedNotes: val.mergedNotes
  }));

  // Construct daily snapshots for standard Mon-Fri inside the range
  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const dailySnapshots = daysOfWeek.map(dayName => {
    const dk = dateKeys.find(key => key.dayLabel === dayName);
    let chosenPhoto: string | null = null;
    let fallbackText = 'Belum ada dokumentasi foto kerja harian atau kegiatan observasi untuk hari ini.';
    
    if (dk) {
      const dayObs = weeklyObservationItems.filter(item => item.dateKey === dk.dateKey);
      const individualPhotoItem = dayObs.find(item => item.photoUrl);
      if (individualPhotoItem) {
        chosenPhoto = individualPhotoItem.photoUrl;
      } else {
        const generalPhotoItem = dayObs.find(item => item.generalPhotoUrl);
        if (generalPhotoItem) {
          chosenPhoto = generalPhotoItem.generalPhotoUrl;
        }
      }

      if (dayObs.length > 0) {
        const activitiesObserved = dayObs.map(o => o.activity).filter(Boolean);
        if (activitiesObserved.length > 0) {
          fallbackText = `Mengikuti aktivitas ${activitiesObserved.join(', ')} secara interaktif.`;
        }
      }
    }

    return {
      dayKey: dayName.toUpperCase() as any,
      label: dk ? `${dayName}, ${dk.dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}` : dayName,
      photoUrl: chosenPhoto,
      fallbackText
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
