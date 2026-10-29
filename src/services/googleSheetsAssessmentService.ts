import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  deleteDoc, 
  query, 
  where 
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { 
  JHSheetSourceConfig, 
  JHSheetColumnMapping, 
  JHParsedSheetRow, 
  JHSheetLevelResolution, 
  JHSheetSyncLog, 
  JHSheetRowMatchStatus 
} from '../types/jhSheetSync';
import { 
  JHAssessmentLO, 
  JHFormativeEntry, 
  JHFormativeLevel, 
  Student 
} from '../types';
import { 
  addFormativeEntry, 
  correctFormativeEntry, 
  getFormativeEntries 
} from './juniorHighAssessmentBookService';

// Extract Google Spreadsheet ID from URL or bare ID
export function extractSpreadsheetId(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  // Check standard Google Sheet URL patterns
  const urlMatch = trimmed.match(/\/spreadsheets(?:\/u\/\d+)?\/d\/([a-zA-Z0-9-_]+)/);
  if (urlMatch && urlMatch[1]) {
    return urlMatch[1];
  }
  // Check bare spreadsheet ID (alphanumeric, dashes, underscores, length >= 20)
  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) {
    return trimmed;
  }
  return null;
}

// Fetch spreadsheet metadata (title and sheet tabs)
export async function fetchSpreadsheetMetadata(
  spreadsheetId: string, 
  accessToken: string
): Promise<{ title: string; tabs: string[] }> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title,sheets.properties.title`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json'
    }
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    const message = errorData?.error?.message || `HTTP ${res.status}: ${res.statusText}`;
    if (res.status === 401 || res.status === 403) {
      throw new Error(`Akses Google Sheets ditolak: ${message}. Pastikan spreadsheet telah dibagikan atau akun memiliki izin.`);
    }
    if (res.status === 404) {
      throw new Error('Spreadsheet tidak ditemukan. Periksa kembali tautan spreadsheet.');
    }
    throw new Error(`Gagal membaca metadata spreadsheet: ${message}`);
  }

  const data = await res.json();
  const title = data.properties?.title || 'Spreadsheet Tanpa Judul';
  const tabs = (data.sheets || [])
    .map((s: any) => s.properties?.title)
    .filter(Boolean);

  if (!tabs.length) {
    throw new Error('Spreadsheet tidak memiliki lembar/tab yang dapat dibaca.');
  }

  return { title, tabs };
}

// Fetch sheet values
export async function fetchSheetValues(
  spreadsheetId: string, 
  tabName: string, 
  accessToken: string
): Promise<string[][]> {
  // Use format value
  const encodedTab = encodeURIComponent(tabName);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${encodedTab}'?valueRenderOption=FORMATTED_VALUE`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json'
    }
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    const message = errorData?.error?.message || `HTTP ${res.status}`;
    throw new Error(`Gagal membaca tab '${tabName}': ${message}`);
  }

  const data = await res.json();
  const rawValues: any[][] = data.values || [];
  
  // Normalize all cells to trimmed strings
  return rawValues.map(row => 
    (row || []).map(cell => (cell !== undefined && cell !== null ? String(cell).trim() : ''))
  );
}

// Clean string for comparison
export function cleanText(val: unknown): string {
  return String(val ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Bigram Sorensen-Dice similarity
export function stringSimilarity(str1: string, str2: string): number {
  const s1 = cleanText(str1);
  const s2 = cleanText(str2);
  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0.0;
  if (s1.length < 2 || s2.length < 2) {
    return s1 === s2 ? 1.0 : 0.0;
  }

  const bigrams1 = new Map<string, number>();
  for (let i = 0; i < s1.length - 1; i++) {
    const bigram = s1.substring(i, i + 2);
    bigrams1.set(bigram, (bigrams1.get(bigram) || 0) + 1);
  }

  let intersection = 0;
  for (let i = 0; i < s2.length - 1; i++) {
    const bigram = s2.substring(i, i + 2);
    const count = bigrams1.get(bigram) || 0;
    if (count > 0) {
      bigrams1.set(bigram, count - 1);
      intersection++;
    }
  }

  return (2.0 * intersection) / ((s1.length - 1) + (s2.length - 1));
}

// Detect likely header row (1-indexed)
export function detectHeaderRow(rows: string[][]): number {
  if (!rows || rows.length === 0) return 1;
  const keywords = ['nama', 'siswa', 'student', 'name', 'nis', 'nisn', 'no induk', 'capaian', 'nilai', 'level', 'task', 'tugas', 'kelas'];
  
  let bestScore = -1;
  let bestIndex = 0; // 0-indexed

  const scanLimit = Math.min(rows.length, 12);
  for (let i = 0; i < scanLimit; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    let score = 0;
    for (const cell of row) {
      const c = cleanText(cell);
      if (keywords.some(k => c === k || c.includes(k))) {
        score++;
      }
    }
    if (score > bestScore && score > 0) {
      bestScore = score;
      bestIndex = i;
    }
  }

  return bestIndex + 1;
}

// Propose initial column mapping based on header texts
export function proposeColumnMappings(headers: string[]): JHSheetColumnMapping {
  const mapping: JHSheetColumnMapping = {
    studentNameColumn: '',
    comprehensionLevelColumn: ''
  };

  headers.forEach(h => {
    const c = cleanText(h);
    if (!mapping.studentNameColumn && (c.includes('nama') || c.includes('student') || c.includes('peserta') || c === 'name')) {
      mapping.studentNameColumn = h;
    } else if (!mapping.comprehensionLevelColumn && (c.includes('capaian') || c.includes('level') || c.includes('nilai') || c.includes('status') || c.includes('hasil') || c.includes('score'))) {
      mapping.comprehensionLevelColumn = h;
    } else if (!mapping.nisColumn && (c.includes('nisn') || c.includes('nis') || c.includes('induk'))) {
      mapping.nisColumn = h;
    } else if (!mapping.classColumn && (c.includes('kelas') || c.includes('class') || c.includes('rombel') || c.includes('grade'))) {
      mapping.classColumn = h;
    } else if (!mapping.formativeTaskColumn && (c.includes('tugas') || c.includes('task') || c.includes('kegiatan') || c.includes('asesmen') || c.includes('aktivitas'))) {
      mapping.formativeTaskColumn = h;
    } else if (!mapping.nextActionColumn && (c.includes('tindak') || c.includes('lanjut') || c.includes('action') || c.includes('rekomendasi'))) {
      mapping.nextActionColumn = h;
    } else if (!mapping.dateColumn && (c.includes('tanggal') || c.includes('date') || c.includes('tgl') || c.includes('waktu'))) {
      mapping.dateColumn = h;
    }
  });

  return mapping;
}

// Case-insensitive, whole-word alias matching for Comprehension Level
export function normalizeComprehensionLevel(
  rawVal: string, 
  customAliases?: Record<string, JHSheetLevelResolution>
): { level: JHFormativeLevel | 'UNASSESSED' | 'AMBIGUOUS'; raw: string } {
  const raw = String(rawVal ?? '').trim();
  if (!raw) {
    return { level: 'UNASSESSED', raw };
  }

  const cleaned = raw.toLowerCase().trim();

  // Check custom aliases defined by teacher first
  if (customAliases && customAliases[cleaned] !== undefined) {
    const custom = customAliases[cleaned];
    if (custom === 'SKIP') return { level: 'UNASSESSED', raw };
    return { level: custom, raw };
  }

  // Exact whole-word patterns for Achieved
  // A, Ach, Achieved, Tuntas, Memenuhi, Tercapai
  const achievedRegex = /^(a|ach|achieved|tuntas|memenuhi|tercapai|sudah\s*tercapai)$/i;
  if (achievedRegex.test(cleaned)) {
    return { level: 'Achieved', raw };
  }

  // Exact whole-word patterns for Not Achieved
  // N, Not, Not Achieved, Belum Tuntas, Belum Memenuhi, Perlu Bimbingan, Tidak Tuntas
  const notAchievedRegex = /^(n|not|not\s*achieved|belum\s*tuntas|belum\s*memenuhi|perlu\s*bimbingan|tidak\s*tuntas|belum\s*tercapai)$/i;
  if (notAchievedRegex.test(cleaned)) {
    return { level: 'Not Achieved', raw };
  }

  // Raw values like 'B', 'D', 'Belum', 'Sedang', '1', '2', etc. require explicit teacher decision
  return { level: 'AMBIGUOUS', raw };
}

// Parse and match sheet rows against the roster
export function parseAndMatchSheetRows(params: {
  rows: string[][];
  headerRowNumber: number; // 1-indexed
  mapping: JHSheetColumnMapping;
  roster: Student[];
  confirmedPairs?: Record<string, string>; // cleanSheetName -> studentId
  excludedNames?: string[];
  customAliases?: Record<string, JHSheetLevelResolution>;
}): {
  parsedRows: JHParsedSheetRow[];
  headers: string[];
  uniqueAmbiguousLevels: string[];
} {
  const {
    rows,
    headerRowNumber,
    mapping,
    roster,
    confirmedPairs = {},
    excludedNames = [],
    customAliases = {}
  } = params;

  if (!rows || rows.length < headerRowNumber) {
    return { parsedRows: [], headers: [], uniqueAmbiguousLevels: [] };
  }

  const headerIndex = headerRowNumber - 1;
  const headers = rows[headerIndex] || [];
  
  // Find column indices
  const nameColIdx = headers.indexOf(mapping.studentNameColumn);
  const levelColIdx = headers.indexOf(mapping.comprehensionLevelColumn);
  const nisColIdx = mapping.nisColumn ? headers.indexOf(mapping.nisColumn) : -1;
  const classColIdx = mapping.classColumn ? headers.indexOf(mapping.classColumn) : -1;
  const taskColIdx = mapping.formativeTaskColumn ? headers.indexOf(mapping.formativeTaskColumn) : -1;
  const nextActionColIdx = mapping.nextActionColumn ? headers.indexOf(mapping.nextActionColumn) : -1;
  const dateColIdx = mapping.dateColumn ? headers.indexOf(mapping.dateColumn) : -1;

  const excludedSet = new Set(excludedNames.map(n => cleanText(n)));
  const rosterById = new Map<string, Student>();
  const rosterByNIS = new Map<string, Student>();
  const rosterByCleanName = new Map<string, Student[]>();

  roster.forEach(st => {
    rosterById.set(st.id, st);
    const nis = (st as any).nis || st.nisn;
    if (nis) {
      rosterByNIS.set(String(nis).trim(), st);
    }
    const cleanN = cleanText(st.name);
    const existing = rosterByCleanName.get(cleanN) || [];
    existing.push(st);
    rosterByCleanName.set(cleanN, existing);
  });

  const parsedRows: JHParsedSheetRow[] = [];
  const ambiguousLevelsSet = new Set<string>();

  // Process data rows
  for (let r = headerIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every(c => !c)) continue; // skip entirely empty rows

    const sheetName = nameColIdx >= 0 ? (row[nameColIdx] || '').trim() : '';
    // Skip row if student name is empty
    if (!sheetName) continue;

    const rawValues: Record<string, string> = {};
    headers.forEach((h, idx) => {
      if (h) rawValues[h] = row[idx] || '';
    });

    const sheetNIS = nisColIdx >= 0 ? (row[nisColIdx] || '').trim() : undefined;
    const sheetClass = classColIdx >= 0 ? (row[classColIdx] || '').trim() : undefined;
    const rawLevel = levelColIdx >= 0 ? (row[levelColIdx] || '').trim() : '';
    const rawTask = taskColIdx >= 0 ? (row[taskColIdx] || '').trim() : undefined;
    const rawNextAction = nextActionColIdx >= 0 ? (row[nextActionColIdx] || '').trim() : undefined;
    const rawDate = dateColIdx >= 0 ? (row[dateColIdx] || '').trim() : undefined;

    const levelRes = normalizeComprehensionLevel(rawLevel, customAliases);
    if (levelRes.level === 'AMBIGUOUS' && levelRes.raw) {
      ambiguousLevelsSet.add(levelRes.raw.trim().toLowerCase());
    }

    const cleanSheetName = cleanText(sheetName);
    let matchStatus: JHSheetRowMatchStatus = 'UNMATCHED';
    let matchedStudentId: string | undefined = undefined;
    let matchedStudentName: string | undefined = undefined;
    let matchedStudentNIS: string | undefined = undefined;
    let matchedStudentClass: string | undefined = undefined;
    const candidateStudents: JHParsedSheetRow['candidateStudents'] = [];

    // Check exclusion
    if (excludedSet.has(cleanSheetName)) {
      matchStatus = 'EXCLUDED';
    } 
    // Check confirmed pair
    else if (confirmedPairs[cleanSheetName]) {
      const targetId = confirmedPairs[cleanSheetName];
      const found = rosterById.get(targetId);
      if (found) {
        matchStatus = 'CONFIRMED_MATCH';
        matchedStudentId = found.id;
        matchedStudentName = found.name;
        matchedStudentNIS = (found as any).nis || found.nisn;
        matchedStudentClass = (found as any).className || found.classId;
      }
    }

    // If not matched yet, check exact NIS
    if (matchStatus === 'UNMATCHED' && sheetNIS && rosterByNIS.has(sheetNIS)) {
      const found = rosterByNIS.get(sheetNIS)!;
      matchStatus = 'EXACT_MATCH';
      matchedStudentId = found.id;
      matchedStudentName = found.name;
      matchedStudentNIS = (found as any).nis || found.nisn;
      matchedStudentClass = (found as any).className || found.classId;
    }

    // If not matched yet, check exact clean name
    if (matchStatus === 'UNMATCHED') {
      const exactList = rosterByCleanName.get(cleanSheetName);
      if (exactList && exactList.length === 1) {
        const found = exactList[0];
        matchStatus = 'EXACT_MATCH';
        matchedStudentId = found.id;
        matchedStudentName = found.name;
        matchedStudentNIS = (found as any).nis || found.nisn;
        matchedStudentClass = (found as any).className || found.classId;
      } else if (exactList && exactList.length > 1) {
        matchStatus = 'AMBIGUOUS';
        exactList.forEach(st => {
          candidateStudents.push({
            id: st.id,
            name: st.name,
            nis: (st as any).nis || st.nisn,
            className: (st as any).className || st.classId,
            confidence: 1.0
          });
        });
      }
    }

    // If still unmatched, compute fuzzy similarity
    if (matchStatus === 'UNMATCHED') {
      const scoredCandidates: { student: Student; score: number }[] = [];
      roster.forEach(st => {
        const score = stringSimilarity(cleanSheetName, st.name);
        if (score >= 0.55) {
          scoredCandidates.push({ student: st, score });
        }
      });

      scoredCandidates.sort((a, b) => b.score - a.score);

      if (scoredCandidates.length > 0) {
        matchStatus = 'AMBIGUOUS';
        scoredCandidates.slice(0, 5).forEach(c => {
          candidateStudents.push({
            id: c.student.id,
            name: c.student.name,
            nis: (c.student as any).nis || c.student.nisn,
            className: (c.student as any).className || c.student.classId,
            confidence: Math.round(c.score * 100) / 100
          });
        });
      }
    }

    parsedRows.push({
      rowNumber: r + 1,
      rawValues,
      sheetName,
      sheetNIS,
      sheetClass,
      rawLevel,
      normalizedLevel: levelRes.level,
      rawTask,
      rawNextAction,
      rawDate,
      matchStatus,
      matchedStudentId,
      matchedStudentName,
      matchedStudentNIS,
      matchedStudentClass,
      candidateStudents: candidateStudents.length > 0 ? candidateStudents : undefined,
      isExcluded: matchStatus === 'EXCLUDED'
    });
  }

  // Duplicate detection among matched rows: if two rows match the same studentId
  const studentCountMap = new Map<string, number>();
  parsedRows.forEach(row => {
    if (row.matchedStudentId && !row.isExcluded) {
      studentCountMap.set(row.matchedStudentId, (studentCountMap.get(row.matchedStudentId) || 0) + 1);
    }
  });

  parsedRows.forEach(row => {
    if (row.matchedStudentId && !row.isExcluded) {
      const count = studentCountMap.get(row.matchedStudentId) || 0;
      if (count > 1) {
        row.matchStatus = 'DUPLICATE';
        row.validationError = `Terdeteksi ${count} baris untuk siswa ini di Google Sheet. Periksa dan pilih salah satu.`;
      }
    }
  });

  return {
    parsedRows,
    headers,
    uniqueAmbiguousLevels: Array.from(ambiguousLevelsSet)
  };
}

// -------------------------------------------------------------
// FIRESTORE STORAGE: jh_ab_sheet_sources
// -------------------------------------------------------------

export async function getSavedSheetSources(scope: {
  academicYear: string;
  semester: string;
  subjectId: string;
  classId: string;
  isUAMode?: boolean;
  unitActivityId?: string;
}): Promise<JHSheetSourceConfig[]> {
  try {
    const constraints: any[] = [
      where('academicYear', '==', scope.academicYear),
      where('semester', '==', scope.semester),
      where('subjectId', '==', scope.subjectId)
    ];

    if (scope.isUAMode && scope.unitActivityId) {
      constraints.push(where('unitActivityId', '==', scope.unitActivityId));
    } else {
      constraints.push(where('classId', '==', scope.classId));
    }

    const snap = await getDocs(query(collection(db, 'jh_ab_sheet_sources'), ...constraints));
    return snap.docs.map(d => ({ ...d.data(), id: d.id } as JHSheetSourceConfig))
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  } catch (err) {
    console.warn('Gagal memuat saved sheet sources:', err);
    return [];
  }
}

export async function saveSheetSource(config: Omit<JHSheetSourceConfig, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<string> {
  const ref = config.id ? doc(db, 'jh_ab_sheet_sources', config.id) : doc(collection(db, 'jh_ab_sheet_sources'));
  const now = Date.now();
  const payload: JHSheetSourceConfig = {
    ...config,
    id: ref.id,
    createdAt: (config as any).createdAt || now,
    updatedAt: now
  };
  await setDoc(ref, payload, { merge: true });
  return ref.id;
}

export async function deleteSheetSource(sourceId: string): Promise<void> {
  await deleteDoc(doc(db, 'jh_ab_sheet_sources', sourceId));
}

// -------------------------------------------------------------
// SYNC EXECUTION & AUDIT LOGGING: jh_ab_sheet_sync_logs
// -------------------------------------------------------------

export interface ExecuteSheetSyncParams {
  sourceConfig: JHSheetSourceConfig;
  targetLO: JHAssessmentLO;
  targetLGId: string;
  classId: string;
  subjectId: string;
  academicYear: string;
  semester: string;
  assessmentDate: string;
  defaultTask: string;
  defaultNextActionAchieved: string;
  defaultNextActionNotAchieved: string;
  parsedRows: JHParsedSheetRow[];
  teacherId: string;
  teacherName: string;
  isUAMode?: boolean;
}

export interface SheetSyncResult {
  logId: string;
  stats: JHSheetSyncLog['stats'];
  details: JHSheetSyncLog['details'];
}

export async function executeSheetSync(params: ExecuteSheetSyncParams): Promise<SheetSyncResult> {
  const {
    sourceConfig,
    targetLO,
    targetLGId,
    classId,
    subjectId,
    academicYear,
    semester,
    assessmentDate,
    defaultTask,
    defaultNextActionAchieved,
    defaultNextActionNotAchieved,
    parsedRows,
    teacherId,
    teacherName,
    isUAMode = false
  } = params;

  // 1. Fetch current existing formative entries for this LO and academic context
  const existingEntries: JHFormativeEntry[] = await getFormativeEntries({
    classId,
    subjectId,
    academicYear,
    semester,
    lgId: targetLGId,
    isUAMode,
    unitActivityId: targetLO.unitActivityId,
    unitActivityName: targetLO.unitActivityName,
    unitActivityCategory: targetLO.unitActivityCategory,
    assessmentGroupId: targetLO.assessmentGroupId,
    targetGrade: targetLO.targetGrade
  });

  // Filter entries to the target LO
  const existingForLO = existingEntries.filter(e => e.loId === targetLO.id);

  // Group by studentId -> date -> entry
  const entryMap = new Map<string, JHFormativeEntry[]>();
  existingForLO.forEach(e => {
    const list = entryMap.get(e.studentId) || [];
    list.push(e);
    entryMap.set(e.studentId, list);
  });

  // Sync LO assessmentDate if different
  if (assessmentDate && targetLO.assessmentDate !== assessmentDate) {
    try {
      await updateDoc(doc(db, 'jh_ab_los', targetLO.id), {
        assessmentDate,
        dateUpdatedAt: Date.now(),
        dateUpdatedBy: teacherId,
        dateUpdatedByName: teacherName,
        updatedAt: Date.now()
      });
    } catch (loErr) {
      console.warn('Gagal menyinkronkan assessmentDate pada LO:', loErr);
    }
  }

  const details: JHSheetSyncLog['details'] = [];
  let createdCount = 0;
  let updatedCount = 0;
  let unchangedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const row of parsedRows) {
    // Determine effective student
    const studentId = row.manualOverrideStudentId || row.matchedStudentId;
    const studentName = row.matchedStudentName || row.sheetName;

    // Skip if marked as excluded or row doesn't have a valid student match
    if (row.isExcluded || row.matchStatus === 'EXCLUDED') {
      skippedCount++;
      details.push({
        studentId: studentId || 'N/A',
        studentName,
        action: 'SKIPPED',
        reason: 'Baris dilewati oleh guru'
      });
      continue;
    }

    if (!studentId || row.matchStatus === 'UNMATCHED' || row.matchStatus === 'AMBIGUOUS' || row.matchStatus === 'DUPLICATE') {
      skippedCount++;
      details.push({
        studentId: studentId || 'UNKNOWN',
        studentName,
        action: 'SKIPPED',
        reason: `Status pencocokan belum valid (${row.matchStatus})`
      });
      continue;
    }

    // Determine level
    const level = row.normalizedLevel;
    if (level === 'UNASSESSED') {
      skippedCount++;
      details.push({
        studentId,
        studentName,
        action: 'SKIPPED',
        reason: 'Nilai capaian kosong pada Sheet (tetap tidak dinilai)'
      });
      continue;
    }

    if (level === 'AMBIGUOUS') {
      failedCount++;
      details.push({
        studentId,
        studentName,
        action: 'FAILED',
        reason: `Nilai '${row.rawLevel}' ambigu dan belum dipetakan`
      });
      continue;
    }

    // Determine task, nextAction, and date
    const rowDate = (row.rawDate && /^\d{4}-\d{2}-\d{2}$/.test(row.rawDate)) ? row.rawDate : assessmentDate;
    const effectiveTask = (row.rawTask && row.rawTask.trim()) ? row.rawTask.trim() : defaultTask;
    const effectiveNextAction = (row.rawNextAction && row.rawNextAction.trim()) 
      ? row.rawNextAction.trim() 
      : (level === 'Achieved' ? defaultNextActionAchieved : defaultNextActionNotAchieved);

    // Look for existing entry for this student on this LO
    const studentEntries = entryMap.get(studentId) || [];
    const existingEntry = studentEntries[0];

    try {
      if (existingEntry) {
        // Check if value or date changed
        const isChanged = 
          existingEntry.comprehensionLevel !== level ||
          existingEntry.date !== rowDate ||
          (effectiveTask && existingEntry.formativeTask !== effectiveTask) ||
          (effectiveNextAction && existingEntry.nextAction !== effectiveNextAction);

        if (isChanged) {
          // Idempotent update / correction flow
          await correctFormativeEntry({
            entryId: existingEntry.id,
            comprehensionLevel: level,
            formativeTask: effectiveTask,
            nextAction: effectiveNextAction,
            date: rowDate,
            correctedBy: teacherId,
            correctedByName: teacherName,
            correctionReason: `Sinkronisasi Google Sheet: ${sourceConfig.title || 'Sheet'}`
          });
          updatedCount++;
          details.push({
            studentId,
            studentName,
            action: 'UPDATED',
            previousLevel: existingEntry.comprehensionLevel,
            newLevel: level,
            reason: 'Diperbarui via koreksi nilai Sheet'
          });
        } else {
          // Unchanged
          unchangedCount++;
          details.push({
            studentId,
            studentName,
            action: 'UNCHANGED',
            previousLevel: existingEntry.comprehensionLevel,
            newLevel: level,
            reason: 'Nilai dan task identik pada tanggal ini'
          });
        }
      } else {
        // Brand new entry on this date
        await addFormativeEntry({
          loId: targetLO.id,
          lgId: targetLGId,
          classId,
          subjectId,
          academicYear,
          semester,
          studentId,
          studentName,
          date: rowDate,
          formativeTask: effectiveTask,
          comprehensionLevel: level,
          nextAction: effectiveNextAction,
          notes: '',
          teacherId,
          teacherName,
          ...(isUAMode ? {
            assessmentMode: 'UNIT_ACTIVITY',
            unitActivityId: targetLO.unitActivityId,
            unitActivityName: targetLO.unitActivityName,
            unitActivityCategory: targetLO.unitActivityCategory,
            assessmentGroupId: targetLO.assessmentGroupId,
            targetGrade: targetLO.targetGrade
          } : {})
        });
        createdCount++;
        details.push({
          studentId,
          studentName,
          action: 'CREATED',
          newLevel: level,
          reason: 'Entri asesmen baru tersimpan'
        });
      }
    } catch (err: any) {
      failedCount++;
      details.push({
        studentId,
        studentName,
        action: 'FAILED',
        reason: err.message || 'Gagal menyimpan entri'
      });
    }
  }

  // Write audit log
  const logRef = doc(collection(db, 'jh_ab_sheet_sync_logs'));
  const logData: JHSheetSyncLog = {
    id: logRef.id,
    sourceId: sourceConfig.id,
    spreadsheetId: sourceConfig.spreadsheetId,
    spreadsheetTitle: sourceConfig.title,
    tabName: sourceConfig.tabName,
    headerRow: sourceConfig.headerRow,
    loId: targetLO.id,
    loCode: targetLO.code,
    loTitle: targetLO.title,
    lgId: targetLGId,
    classId,
    subjectId,
    academicYear,
    semester,
    assessmentDate,
    isUAMode,
    syncedBy: teacherId,
    syncedByName: teacherName,
    syncedAt: Date.now(),
    stats: {
      totalRows: parsedRows.length,
      createdCount,
      updatedCount,
      unchangedCount,
      skippedCount,
      failedCount
    },
    details
  };

  try {
    await setDoc(logRef, logData);
  } catch (logErr) {
    console.warn('Gagal menulis log audit sinkronisasi:', logErr);
  }

  return {
    logId: logRef.id,
    stats: logData.stats,
    details
  };
}
