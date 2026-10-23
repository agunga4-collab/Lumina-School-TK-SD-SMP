import { collection, doc, getDoc, getDocs, query, where, runTransaction } from 'firebase/firestore';
import { db, auth, getClasses, getActiveStudents } from '../lib/firebase';
import { juniorHighLiteracyService } from './juniorHighLiteracyService';
import { normalizeMengajiLevel, normalizeNumerasiLevel, formatMengajiDisplay, formatNumerasiDisplay, CANONICAL_MENGAJI_OPTIONS, CANONICAL_NUMERASI_OPTIONS } from '../utils/litnumLevelNormalizer';
import { LpuTrackerSubject, LpuTrackerSemester, LpuTrackerActor, LpuTrackerStudent, LpuTrackerColumn, LpuTrackerCell, LpuTrackerCoach, LpuTrackerCoachAssignment, LpuTrackerLevel, LpuTrackerLegacyRow, LpuTrackerValue } from '../types/learningPowerUpTracker';
export const TRACKER_SUBJECTS: Array<{
  key: LpuTrackerSubject;
  label: string;
}> = [{
  key: 'bahasaIndonesia',
  label: 'Bahasa Indonesia'
}, {
  key: 'english',
  label: 'English'
}, {
  key: 'mengaji',
  label: 'Mengaji'
}, {
  key: 'numerasi',
  label: 'Numerasi'
}];
const AREA: Record<LpuTrackerSubject, string> = {
  bahasaIndonesia: 'BAHASA_INDONESIA',
  english: 'ENGLISH_READING',
  mengaji: 'MENGAJI',
  numerasi: 'NUMERACY'
};
const PRIORITY: Record<string, number> = {
  SEMESTER_1_START: 1,
  FALL_ASSESSMENT_2: 2,
  SEMESTER_1_END: 2,
  SPRING_ASSESSMENT_3: 3,
  SEMESTER_2_START: 4,
  SEMESTER_2_END: 5
};
const READ_ROLES = ['TEACHER', 'HOMEROOM_TEACHER', 'HEAD_JUNIOR', 'HEAD_UNIT', 'SUPER_ADMIN', 'BK_MENTOR', 'MTSS_ACADEMIC_PJ', 'COUNSELOR', 'COORDINATOR', 'SECRETARY_JH', 'PRINCIPAL', 'VICE_PRINCIPAL'];
const WRITE_ROLES = READ_ROLES.filter(role => !['PRINCIPAL', 'VICE_PRINCIPAL'].includes(role));
const clean = (value: unknown) => String(value ?? '').trim();
const segment = (value: string) => encodeURIComponent(value).replace(/~/g, '%7E');
export function trackerYearKey(value: string): string {
  const parts = clean(value).match(/\d{4}/g);
  return parts && parts.length >= 2 ? `${parts[0]}/${parts[1]}` : clean(value);
}
export function canUseLpuTracker(actor: LpuTrackerActor, write = false): boolean {
  return !!actor && actor.status === 'active' && (write ? WRITE_ROLES : READ_ROLES).includes(actor.role) && (actor.role === 'SUPER_ADMIN' || [actor.unitId, actor.unit].some(unit => unit === 'JUNIOR_HIGH' || unit === 'ALL'));
}
function assertWrite(actor: LpuTrackerActor): void {
  if (!canUseLpuTracker(actor, true) || !auth.currentUser || auth.currentUser.uid !== actor.uid) throw new Error('Akun ini tidak berwenang mengubah tracker SMP.');
}
async function readLpuSource<T>(source: string, action: () => Promise<T>): Promise<T> {
  try { return await action(); }
  catch (cause) {
    const original = cause as { code?: string; message?: string };
    const error = new Error(`[${source}] ${original?.message || String(cause)}`) as Error & { code?: string; source?: string };
    error.name = 'LpuSourceError';
    error.code = original?.code;
    error.source = source;
    throw error;
  }
}
function millis(value: any): number {
  return typeof value === 'number' ? value : value?.toMillis?.() || (value?.seconds ? value.seconds * 1000 : 0);
}
export function trackerCellId(columnId: string, studentId: string): string {
  return `CELL_${segment(columnId)}~${segment(studentId)}`;
}
function coachDocId(studentId: string, year: string, semester: string): string {
  return `COACH_${segment(studentId)}~${segment(year)}~${semester}`;
}
export function trackerLevelKey(studentId: string, subject: LpuTrackerSubject): string {
  return `${studentId}|${subject}`;
}
export function trackerLevelOptions(subject: LpuTrackerSubject): string[] {
  if (subject === 'mengaji') return CANONICAL_MENGAJI_OPTIONS.map(item => item.label);
  if (subject === 'numerasi') return CANONICAL_NUMERASI_OPTIONS.map(item => item.label);
  if (subject === 'english') return ['IR+', 'IR', 'ER', 'ER EN'];
  return ['Perlu Pendampingan Intensif', 'Perlu Penguatan Terarah', 'Siap Berkembang', 'Siap Lanjut'];
}
export function resolveTrackerLevels(records: any[]): Record<string, LpuTrackerLevel> {
  const result: Record<string, LpuTrackerLevel> = {};
  const selected: Record<string, any> = {};
  const sorted = [...records].sort((a, b) => (PRIORITY[b.sessionKey] || 0) - (PRIORITY[a.sessionKey] || 0) || millis(b.updatedAt) - millis(a.updatedAt) || clean(a.id).localeCompare(clean(b.id)));
  for (const record of sorted) {
    const subject = TRACKER_SUBJECTS.find(item => AREA[item.key] === record.subjectArea)?.key;
    if (!subject || !record.studentId) continue;
    const key = trackerLevelKey(clean(record.studentId), subject);
    if (selected[key]) continue;
    selected[key] = record;
    const raw = subject === 'mengaji' ? record.mengajiLevel || record.level : subject === 'numerasi' ? record.numerasiLevel || record.mathLevel : record.readingLevel;
    const label = subject === 'mengaji' ? formatMengajiDisplay(raw) : subject === 'numerasi' ? formatNumerasiDisplay(raw) : clean(raw);
    result[key] = {
      recordId: record.id,
      studentId: clean(record.studentId),
      subjectKey: subject,
      label,
      sessionKey: record.sessionKey
    };
  }
  return result;
}
export async function loadLpuTrackerRoster(year: string): Promise<{
  classes: Array<{
    id: string;
    name: string;
  }>;
  students: LpuTrackerStudent[];
}> {
  const classes = ((await readLpuSource('roster/classes', () => getClasses())) as any[]).filter(item => item.unitId === 'JUNIOR_HIGH' && trackerYearKey(item.academicYear) === trackerYearKey(year) && item.status !== 'archived');
  const map = new Map<string, LpuTrackerStudent>();
  await Promise.all(classes.map(async cls => {
    const list = await readLpuSource(`roster/enrollments kelas ${cls.name}`, () => getActiveStudents(cls.id, year));
    for (const item of list) {
      const id = clean(item.id);
      if (!id) continue;
      if (map.has(id) && map.get(id)!.classId !== cls.id) throw new Error(`Siswa ${item.name} memiliki dua enrollment kelas aktif. Periksa roster dahulu.`);
      const grade = Number((cls as any).grade) || Number(/^([789])/.exec(cls.name)?.[1]) || 0;
      map.set(id, {
        id,
        name: clean(item.name),
        nis: clean((item as any).nis || (item as any).luminaId || id),
        classId: cls.id,
        className: cls.name,
        grade
      });
    }
  }));
  return {
    classes: classes.map(item => ({
      id: item.id,
      name: item.name
    })),
    students: [...map.values()].sort((a, b) => a.className.localeCompare(b.className) || a.name.localeCompare(b.name))
  };
}
export async function loadLpuCoachOptions(): Promise<LpuTrackerCoach[]> {
  return readLpuSource('opsi coach/users (status + role + unit)', async () => {
    const snapshots = await Promise.all(['unitId', 'unit'].map(field => getDocs(query(
      collection(db, 'users'), where('status', '==', 'active'),
      where('role', 'in', ['TEACHER', 'HOMEROOM_TEACHER']),
      where(field, 'in', ['JUNIOR_HIGH', 'ALL'])
    ))));
    const people = new Map<string, LpuTrackerCoach>();
    snapshots.forEach(snapshot => snapshot.docs.forEach(item => {
      const value = item.data();
      if (!['TEACHER', 'HOMEROOM_TEACHER'].includes(value.role) || value.status !== 'active') return;
      if (![value.unitId, value.unit].some(unit => unit === 'JUNIOR_HIGH' || unit === 'ALL')) return;
      people.set(item.id, { uid: item.id, name: clean(value.displayName || value.email), email: clean(value.email) });
    }));
    return [...people.values()].sort((a, b) => a.name.localeCompare(b.name));
  });
}
export function resolveTrackerLevelsWithReferences(
  records: any[], refs: any[], cells: any[],
  roster: Array<Pick<LpuTrackerStudent, 'id' | 'classId'>>
): Record<string, LpuTrackerLevel> {
  const classByStudent = new Map(roster.map(student => [clean(student.id), clean(student.classId)]));
  const scopedRecords = records.filter(record => classByStudent.get(clean(record.studentId)) === clean(record.classId));
  const result = resolveTrackerLevels(scopedRecords);
  const seen = new Set<string>();
  for (const ref of refs) {
    const classId = clean(ref.classId);
    const subject = TRACKER_SUBJECTS.find(item => AREA[item.key] === (ref.subjectArea || ref.area))?.key;
    if (!classId || !subject || !clean(ref.sourceId)) throw new Error('Ada acuan LPU dengan identitas kelas/pelajaran/sumber tidak lengkap.');
    const refKey = `${classId}|${subject}`;
    if (seen.has(refKey)) throw new Error('Ada lebih dari satu acuan untuk kelas/pelajaran yang sama. Periksa metadata acuan.');
    seen.add(refKey);
    if (!['SESSION', 'LEGACY', 'CUSTOM_COLUMN'].includes(ref.sourceType)) throw new Error('Jenis sumber acuan LPU belum dikenali.');
    const eligible = roster.filter(student => clean(student.classId) === classId);
    for (const student of eligible) {
      const key = trackerLevelKey(clean(student.id), subject);
      const candidates = (ref.sourceType === 'CUSTOM_COLUMN' ? cells : scopedRecords).filter(value =>
        clean(value.studentId) === clean(student.id) && clean(value.classId) === classId &&
        (value.subjectArea || value.area) === AREA[subject] &&
        (ref.sourceType === 'CUSTOM_COLUMN' ? clean(value.columnId) === clean(ref.sourceId) :
          clean(value.sessionKey || value.period) === clean(ref.sourceId) || clean(value.id) === clean(ref.sourceId))
      ).sort((a, b) => millis(b.updatedAt) - millis(a.updatedAt) || clean(a.id).localeCompare(clean(b.id)));
      if (ref.sourceType === 'CUSTOM_COLUMN' && candidates.length > 1) throw new Error('Ada nilai sel kustom ganda untuk sumber dan siswa yang sama.');
      const source = candidates[0];
      const raw = source ? subject === 'mengaji' ? source.mengajiLevel || source.level :
        subject === 'numerasi' ? source.numerasiLevel || source.mathLevel || source.level : source.readingLevel || source.level : '';
      const label = subject === 'mengaji' ? formatMengajiDisplay(raw) : subject === 'numerasi' ? formatNumerasiDisplay(raw) : clean(raw);
      result[key] = {
        recordId: clean(source?.id), studentId: clean(student.id), subjectKey: subject,
        label: raw ? label : '', sessionKey: clean(ref.sourceId),
        sourceLabel: clean(ref.sourceLabel || ref.sourceId),
        sourceType: ref.sourceType === 'CUSTOM_COLUMN' ? 'CUSTOM_COLUMN' : 'SESSION',
        ...(!raw ? { issue: 'Belum ada level valid dari acuan Litnum yang dipilih. Tidak menggunakan fallback sesi lain.' } : {})
      };
    }
  }
  return result;
}
export async function loadLpuTrackerLevels(
  year: string, studentId?: string, teacherRoster?: LpuTrackerStudent[]
): Promise<Record<string, LpuTrackerLevel>> {
  const conditions = [where('unit', '==', 'JUNIOR_HIGH'), where('schoolYear', '==', year)];
  let roster = teacherRoster;
  let own: LpuTrackerStudent | null = null;
  if (studentId) {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error('[level/identitas] Sesi login tidak tersedia.');
    const account = await readLpuSource('level/users akun sendiri', () => getDoc(doc(db, 'users', uid)));
    const actor = account.exists() ? { ...account.data(), uid } as LpuTrackerActor : null;
    if (!actor || actor.status !== 'active' || actor.role !== 'STUDENT') throw new Error('[level/identitas] Hanya akun siswa aktif yang dapat membaca laporan pribadi.');
    own = await readLpuSource('level/identitas siswa sendiri', () => resolveLpuTrackerStudent(actor, year));
    if (own.id !== studentId) throw new Error('[level/identitas] ID siswa tidak sesuai akun login.');
    roster = [own];
    conditions.push(where('studentId', '==', own.id));
  } else if (!roster) {
    roster = (await loadLpuTrackerRoster(year)).students;
  }
  const snapshot = await readLpuSource('level/junior_high_literacy_numeracy_records', () => getDocs(query(collection(db, 'junior_high_literacy_numeracy_records'), ...conditions)));
  const records: any[] = snapshot.docs.map(item => ({ ...item.data(), id: item.id }));
  let refs: any[];
  if (own) {
    refs = (await Promise.all(TRACKER_SUBJECTS.map(async subject => {
      const refId = `${own!.classId}_${AREA[subject.key]}_${year.replace(/\//g, '-')}`;
      const value = await readLpuSource('level/lpu_subject_references kelas sendiri', () => getDoc(doc(db, 'lpu_subject_references', refId)));
      return value.exists() ? { ...value.data(), id: value.id } : null;
    }))).filter(Boolean);
  } else {
    const referenceSnapshot = await readLpuSource('level/lpu_subject_references', () => getDocs(query(collection(db, 'lpu_subject_references'), where('schoolYear', '==', year))));
    refs = referenceSnapshot.docs.map(item => ({ ...item.data(), id: item.id }));
  }
  let cells: any[] = [];
  if (refs.some(ref => ref.sourceType === 'CUSTOM_COLUMN')) {
    const constraints = [where('schoolYear', '==', year)];
    if (own) constraints.push(where('studentId', '==', own.id));
    const cellSnapshot = await readLpuSource('level/junior_high_litnum_cell_values', () => getDocs(query(collection(db, 'junior_high_litnum_cell_values'), ...constraints)));
    cells = cellSnapshot.docs.map(item => ({ ...item.data(), id: item.id }));
  }
  return readLpuSource('level/pemetaan acuan kelas', async () => resolveTrackerLevelsWithReferences(records, refs, cells, roster || []));
}
export async function loadLpuTrackerColumns(year: string, semester: LpuTrackerSemester, subjectKey: LpuTrackerSubject): Promise<LpuTrackerColumn[]> {
  const snap = await getDocs(query(collection(db, 'lpu_tracker_columns'), where('academicYear', '==', year), where('semester', '==', semester), where('subjectKey', '==', subjectKey)));
  return snap.docs.map(item => ({
    ...item.data(),
    id: item.id
  }) as LpuTrackerColumn).sort((a, b) => a.order - b.order || a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}
export async function loadLpuTrackerCells(year: string, semester?: LpuTrackerSemester, subjectKey?: LpuTrackerSubject, studentId?: string): Promise<LpuTrackerCell[]> {
  const conditions = [where('academicYear', '==', year)];
  if (semester) conditions.push(where('semester', '==', semester));
  if (subjectKey) conditions.push(where('subjectKey', '==', subjectKey));
  if (studentId) {
    conditions.push(where('studentId', '==', studentId));
    conditions.push(where('visible', '==', true));
  }
  const snap = await getDocs(query(collection(db, 'lpu_tracker_cells'), ...conditions));
  return snap.docs.map(item => ({
    ...item.data(),
    id: item.id
  }) as LpuTrackerCell);
}
export async function loadLpuTrackerCoaches(year: string, semester?: LpuTrackerSemester, studentId?: string): Promise<LpuTrackerCoachAssignment[]> {
  const conditions = [where('academicYear', '==', year)];
  if (semester) conditions.push(where('semester', '==', semester));
  if (studentId) conditions.push(where('studentId', '==', studentId));
  const snap = await getDocs(query(collection(db, 'lpu_tracker_coaches'), ...conditions));
  return snap.docs.map(item => ({
    ...item.data(),
    id: item.id
  }) as LpuTrackerCoachAssignment);
}
export function newLpuTrackerColumnId(): string {
  return doc(collection(db, 'lpu_tracker_columns')).id;
}
export async function saveLpuTrackerColumn(input: {
  id: string;
  academicYear: string;
  semester: LpuTrackerSemester;
  subjectKey: LpuTrackerSubject;
  label: string;
  periodLabel: string;
  order: number;
  valueType: 'FREE' | 'NUMBER';
  studentIds: string[];
  archived: boolean;
  expectedVersion: number;
}, actor: LpuTrackerActor): Promise<void> {
  assertWrite(actor);
  if (!clean(input.label) || clean(input.label).length > 200 || !Number.isFinite(input.order) || !['FREE', 'NUMBER'].includes(input.valueType)) throw new Error('Isi judul kolom, urutan, dan format isian yang valid.');
  const ids = [...new Set(input.studentIds.map(clean).filter(Boolean))];
  if (!ids.length || ids.length > 400) throw new Error('Pilih 1–400 penerima header.');
  const roster = await loadLpuTrackerRoster(input.academicYear);
  const students = new Map(roster.students.map(item => [item.id, item]));
  const ref = doc(db, 'lpu_tracker_columns', input.id);
  await runTransaction(db, async transaction => {
    const snap = await transaction.get(ref);
    const previous = snap.exists() ? snap.data() as LpuTrackerColumn : undefined;
    if (ids.some(id => !students.has(id) && !(input.archived && previous?.studentIds.includes(id)))) throw new Error('Ada penerima yang bukan siswa SMP aktif pada tahun ajaran ini.');
    if ((previous?.version || 0) !== input.expectedVersion) throw new Error('Header sudah diubah pengguna lain. Segarkan dahulu.');
    if (previous && (previous.academicYear !== input.academicYear || previous.semester !== input.semester || previous.subjectKey !== input.subjectKey)) throw new Error('Periode/mapel header tidak boleh dipindahkan. Buat header baru.');
    const union = [...new Set([...(previous?.studentIds || []), ...ids])];
    if (union.length > 400) throw new Error('Gabungan penerima lama dan baru melebihi 400. Bagi menjadi header terpisah.');
    const refs = union.map(id => doc(db, 'lpu_tracker_cells', trackerCellId(input.id, id)));
    const snapshots = await Promise.all(refs.map(cellRef => transaction.get(cellRef)));
    if (previous && previous.valueType !== input.valueType && snapshots.some(item => item.exists() && item.data().value !== '')) throw new Error('Format kolom yang sudah berisi data tidak boleh diubah. Buat kolom baru.');
    const now = Date.now();
    const column: LpuTrackerColumn = {
      id: input.id,
      unit: 'JUNIOR_HIGH',
      academicYear: input.academicYear,
      semester: input.semester,
      subjectKey: input.subjectKey,
      label: clean(input.label),
      periodLabel: clean(input.periodLabel),
      order: input.order,
      valueType: input.valueType,
      studentIds: ids,
      archived: input.archived,
      createdBy: previous?.createdBy || actor.uid,
      createdAt: previous?.createdAt || now,
      updatedBy: actor.uid,
      updatedAt: now,
      version: (previous?.version || 0) + 1
    };
    transaction.set(ref, column);
    union.forEach((studentId, index) => {
      const old = snapshots[index].exists() ? snapshots[index].data() as LpuTrackerCell : undefined;
      const student = students.get(studentId);
      if (!old && !student) return;
      const value: LpuTrackerCell = {
        id: refs[index].id,
        unit: 'JUNIOR_HIGH',
        academicYear: column.academicYear,
        semester: column.semester,
        subjectKey: column.subjectKey,
        columnId: column.id,
        studentId,
        studentName: student?.name || old!.studentName,
        classId: old?.classId || student!.classId,
        className: old?.className || student!.className,
        label: column.label,
        periodLabel: column.periodLabel,
        order: column.order,
        valueType: column.valueType,
        visible: ids.includes(studentId) && !column.archived,
        value: old?.value ?? '',
        valueVersion: old?.valueVersion || 0,
        valueUpdatedAt: old?.valueUpdatedAt || 0,
        valueUpdatedBy: old?.valueUpdatedBy || '',
        updatedBy: actor.uid,
        updatedAt: now
      };
      transaction.set(refs[index], value);
    });
  });
}
export async function saveLpuTrackerCell(cell: LpuTrackerCell, value: LpuTrackerValue, actor: LpuTrackerActor): Promise<LpuTrackerCell> {
  assertWrite(actor);
  if (typeof value !== 'string' && (typeof value !== 'number' || !Number.isFinite(value))) throw new Error('Isian harus teks atau angka yang valid.');
  if (typeof value === 'string' && value.length > 5000) throw new Error('Maksimal 5.000 karakter per sel.');
  const ref = doc(db, 'lpu_tracker_cells', cell.id);
  return runTransaction(db, async transaction => {
    const snap = await transaction.get(ref);
    const parent = await transaction.get(doc(db, 'lpu_tracker_columns', cell.columnId));
    if (!snap.exists() || !parent.exists()) throw new Error('Sel/header tidak ditemukan. Segarkan tracker.');
    const old = snap.data() as LpuTrackerCell;
    const header = parent.data() as LpuTrackerColumn;
    if (!old.visible || header.archived || !header.studentIds.includes(old.studentId)) throw new Error('Header ini tidak berlaku untuk siswa tersebut.');
    if (old.valueVersion !== cell.valueVersion) throw new Error('Sel sudah diubah pengguna lain. Segarkan sebelum mengedit ulang.');
    if (old.valueType === 'NUMBER' && value !== '' && typeof value !== 'number') throw new Error('Kolom skor harus diisi angka atau dikosongkan.');
    const now = Date.now();
    const changed = {
      value,
      valueVersion: old.valueVersion + 1,
      valueUpdatedAt: now,
      valueUpdatedBy: actor.uid,
      updatedBy: actor.uid,
      updatedAt: now
    };
    transaction.update(ref, changed);
    return {
      ...old,
      ...changed
    };
  });
}
export async function saveLpuTrackerRange(items: Array<{
  cell: LpuTrackerCell;
  value: LpuTrackerValue;
}>, actor: LpuTrackerActor): Promise<LpuTrackerCell[]> {
  assertWrite(actor);
  if (!items.length || items.length > 100 || new Set(items.map(item => item.cell.columnId)).size > 10) throw new Error('Tempel maksimal 100 sel dan 10 kolom per rentang.');
  if (new Set(items.map(item => item.cell.id)).size !== items.length) throw new Error('Ada sel ganda dalam rentang.');
  const first = items[0].cell;
  for (const item of items) {
    if (item.cell.academicYear !== first.academicYear || item.cell.semester !== first.semester || item.cell.subjectKey !== first.subjectKey) throw new Error('Rentang harus pada mapel dan periode yang sama.');
    if (typeof item.value === 'string' && item.value.length > 5000 || typeof item.value !== 'string' && (typeof item.value !== 'number' || !Number.isFinite(item.value))) throw new Error('Ada isian tidak valid pada rentang.');
  }
  return runTransaction(db, async transaction => {
    const columnIds = [...new Set(items.map(item => item.cell.columnId))];
    const parentSnaps = await Promise.all(columnIds.map(id => transaction.get(doc(db, 'lpu_tracker_columns', id))));
    const parents = new Map(columnIds.map((id, index) => [id, parentSnaps[index].exists() ? parentSnaps[index].data() as LpuTrackerColumn : undefined]));
    const refs = items.map(item => doc(db, 'lpu_tracker_cells', item.cell.id));
    const snapshots = await Promise.all(refs.map(ref => transaction.get(ref)));
    const now = Date.now();
    const results: LpuTrackerCell[] = [];
    items.forEach((item, index) => {
      if (!snapshots[index].exists()) throw new Error('Ada sel yang tidak ditemukan.');
      const old = snapshots[index].data() as LpuTrackerCell;
      const parent = parents.get(old.columnId);
      if (!old.visible || !parent || parent.archived || !parent.studentIds.includes(old.studentId)) throw new Error('Ada sel yang tidak berlaku untuk penerima ini.');
      if (old.valueVersion !== item.cell.valueVersion) throw new Error('Ada nilai berubah oleh pengguna lain. Segarkan; seluruh rentang belum disimpan.');
      if (old.valueType === 'NUMBER' && item.value !== '' && typeof item.value !== 'number') throw new Error('Ada teks pada kolom skor.');
      results.push({
        ...old,
        value: item.value,
        valueVersion: old.valueVersion + 1,
        valueUpdatedAt: now,
        valueUpdatedBy: actor.uid,
        updatedBy: actor.uid,
        updatedAt: now
      });
    });
    results.forEach((value, index) => transaction.update(refs[index], {
      value: value.value,
      valueVersion: value.valueVersion,
      valueUpdatedAt: now,
      valueUpdatedBy: actor.uid,
      updatedBy: actor.uid,
      updatedAt: now
    }));
    return results;
  });
}
export async function saveLpuTrackerCoach(student: LpuTrackerStudent, year: string, semester: LpuTrackerSemester, coachId: string, actor: LpuTrackerActor): Promise<void> {
  assertWrite(actor);
  let coachName = '';
  if (coachId) {
    const snapshot = await getDoc(doc(db, 'users', coachId));
    const person = snapshot.exists() ? snapshot.data() : undefined;
    if (!person || person.status !== 'active' || !['TEACHER', 'HOMEROOM_TEACHER'].includes(person.role) || ![person.unitId, person.unit].some(unit => unit === 'JUNIOR_HIGH' || unit === 'ALL')) throw new Error('Coach harus akun guru SMP aktif.');
    coachName = clean(person.displayName || person.email);
  }
  const record: LpuTrackerCoachAssignment = {
    id: coachDocId(student.id, year, semester),
    unit: 'JUNIOR_HIGH',
    academicYear: year,
    semester,
    studentId: student.id,
    classId: student.classId,
    coachId,
    coachName,
    updatedBy: actor.uid,
    updatedAt: Date.now()
  };
  await runTransaction(db, async transaction => {
    transaction.set(doc(db, 'lpu_tracker_coaches', record.id), record);
  });
}
export async function saveLpuTrackerLevel(student: LpuTrackerStudent, year: string, semester: LpuTrackerSemester, subject: LpuTrackerSubject, value: string, existing: LpuTrackerLevel | undefined, actor: LpuTrackerActor): Promise<void> {
  assertWrite(actor);
  const label = clean(value);
  if (!label) throw new Error('Level tidak boleh kosong. Penghapusan level dilakukan dari modul Literasi & Numerasi.');
  let payload: any = {
    updatedBy: actor.uid
  };
  if (subject === 'mengaji') {
    const canonical = normalizeMengajiLevel(label);
    if (!canonical) throw new Error('Pilih level Mengaji yang tersedia.');
    payload = {
      ...payload,
      mengajiLevel: canonical,
      level: formatMengajiDisplay(canonical)
    };
  } else if (subject === 'numerasi') {
    const canonical = normalizeNumerasiLevel(label);
    if (!canonical) throw new Error('Pilih level Numerasi yang tersedia.');
    payload = {
      ...payload,
      numerasiLevel: canonical,
      mathLevel: formatNumerasiDisplay(canonical)
    };
  } else payload.readingLevel = label;
  if (existing?.recordId) {
    const snapshot = await getDoc(doc(db, 'junior_high_literacy_numeracy_records', existing.recordId));
    if (!snapshot.exists()) throw new Error('Record sumber level tidak ditemukan. Segarkan dahulu.');
    const old = snapshot.data();
    if (old.studentId !== student.id || old.schoolYear !== year || old.subjectArea !== AREA[subject]) throw new Error('Konteks sumber level tidak sesuai.');
    await juniorHighLiteracyService.updateProgressRecord(existing.recordId, payload);
  } else {
    const sessionKey = semester === '2' ? 'SEMESTER_2_START' : 'SEMESTER_1_START';
    await juniorHighLiteracyService.saveProgressRecord({
      studentId: student.id,
      studentName: student.name,
      classId: student.classId,
      gradeLevel: student.grade,
      schoolYear: year,
      sessionKey,
      sessionLabel: semester === '2' ? 'Awal Semester 2' : 'Awal Semester 1',
      subjectArea: AREA[subject],
      ...payload
    } as any);
  }
}
export async function resolveLpuTrackerStudent(actor: LpuTrackerActor & {
  luminaId?: string;
  studentId?: string;
}, year: string): Promise<LpuTrackerStudent> {
  if (actor.role !== 'STUDENT' || actor.uid !== auth.currentUser?.uid) throw new Error('Halaman ini hanya untuk akun siswa sendiri.');
  const id = clean(actor.luminaId || actor.studentId);
  if (!id) throw new Error('Akun belum terhubung ke ID siswa. Hubungi admin.');
  const profile = await getDoc(doc(db, 'students', id));
  if (!profile.exists()) throw new Error('Profil siswa tidak ditemukan. Hubungi admin.');
  const enrollment = await getDocs(query(collection(db, 'enrollments'), where('studentId', '==', id), where('academicYear', '==', year), where('status', '==', 'active')));
  const candidates = [...new Set(enrollment.docs.map(item => clean(item.data().classId)).filter(Boolean))];
  const classes = ((await getClasses()) as any[]).filter(item => item.unitId === 'JUNIOR_HIGH' && trackerYearKey(item.academicYear) === trackerYearKey(year));
  const rawKeys = candidates.length ? candidates : [clean(profile.data().classId)];
  const resolvedKeys = rawKeys.map(classKey => {
    const matches = classes.filter(item => item.id === classKey || item.name === classKey || item.classId === classKey);
    if (matches.length > 1) throw new Error('Nama kelas siswa ambigu. Hubungi admin.');
    return matches[0]?.id || classKey;
  });
  const canonicalKeys = [...new Set(resolvedKeys.filter(Boolean))];
  if (canonicalKeys.length > 1) throw new Error('Ada beberapa enrollment kelas aktif. Hubungi admin untuk memeriksa.');
  const classKey = canonicalKeys[0] || '';
  const cls = classes.find(item => item.id === classKey);
  const data = profile.data();
  return {
    id,
    name: clean(data.name || data.fullName || actor.displayName),
    nis: clean(data.nis || data.luminaId || id),
    classId: cls?.id || classKey,
    className: cls?.name || classKey || 'Belum tersedia',
    grade: Number(cls?.grade) || Number(/^([789])/.exec(cls?.name || '')?.[1]) || 0
  };
}
export async function loadLpuTrackerLegacy(year: string, studentId?: string): Promise<LpuTrackerLegacyRow[]> {
  const rows: LpuTrackerLegacyRow[] = [];
  for (const name of ['learning_power_up_assignments', 'learning_power_up_progress']) {
    const years = [...new Set([year, year.replace('/', '_'), year.replace('_', '/')])];
    const snapshots = studentId ? [await getDocs(query(collection(db, name), where('studentId', '==', studentId)))] : await Promise.all(years.flatMap(value => ['academicYearId', 'academicYear'].map(field => getDocs(query(collection(db, name), where(field, '==', value))))));
    const unique = new Map<string, any>();
    snapshots.forEach(snapshot => snapshot.docs.forEach(item => unique.set(item.id, item)));
    for (const item of unique.values()) {
      const record = item.data();
      if (trackerYearKey(record.academicYearId || record.academicYear) !== trackerYearKey(year)) continue;
      rows.push({
        id: `${name}/${item.id}`,
        subjectKey: record.subjectKey || record.field || '',
        date: record.weekStartDate || /\d{4}-\d{2}-\d{2}/.exec(record.packageId || '')?.[0] || '',
        title: record.taskTitle || 'Catatan tugas lama',
        instructions: record.taskInstructions || record.revisionNote || '',
        status: record.status || 'Tidak tercatat',
        studentId: record.studentId,
        studentName: record.studentNameSnapshot || record.studentName || '',
        className: record.classNameSnapshot || record.classId || ''
      });
    }
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date) || a.subjectKey.localeCompare(b.subjectKey) || a.id.localeCompare(b.id));
}
