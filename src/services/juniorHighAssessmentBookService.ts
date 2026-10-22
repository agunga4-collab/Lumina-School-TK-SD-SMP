import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where, writeBatch } from 'firebase/firestore';
import { db, getActiveStudents } from '../lib/firebase';
import { AssessmentBookOptions, DEFAULT_ASSESSMENT_BOOK_OPTIONS, JHAssessmentLO, JHFormativeEntry, JHSummativeEntry, JHFormativeLevel, JHAssessmentUAContext, LearningGoal, ReportConfig } from '../types';
import { isSameJHSubject, getJHSubjectLegacyValue } from '../constants/juniorHighSubjectCatalog';

export function getTodayWIB(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
export function formatDateWIB(value: string | number | undefined | null): string {
  if (!value) return '-';
  if (typeof value === 'number') return new Date(value).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' });
  const parts = String(value).split('-');
  if (parts.length === 3) return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 12).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  return String(value);
}
export interface UACategoryConfig { key: string; label: string; shortLabel: string; activities: string[]; }
export const JH_UA_CATEGORIES_CONFIG: UACategoryConfig[] = [
  { key: 'Arts & Makerspace', label: 'Seni Rupa (Arts & Makerspace)', shortLabel: 'Seni Rupa', activities: ['Papercraft', 'Makerspace', 'Seni Kreasi Bebas', 'Membatik', 'Painting'] },
  { key: 'Performing Arts', label: 'Seni Musik (Performing Arts)', shortLabel: 'Seni Musik', activities: ['Orkestra', 'Choir', 'Theatre', 'LGP', 'Traditional Music', 'Drumline', 'Musical Theatre Band'] },
  { key: 'Physical Education', label: 'Physical Education', shortLabel: 'Physical Education', activities: ['Bola Kecil', 'Bola Besar', 'Senam & Gerak Berirama', 'Atletik', 'Swimming & Physical Training'] },
  { key: 'Digital Literacy', label: 'Digital Literacy', shortLabel: 'Digital Literacy', activities: ['Animation', 'Videography', 'Graphic Design', '3D Structure Building', 'Coding'] }
];
const clean = (value: unknown) => String(value ?? '').trim();
const lower = (value: unknown) => clean(value).toLowerCase();
const segment = (value: string) => encodeURIComponent(value).replace(/~/g, '%7E');
export function normalizeUATargetGrade(value: unknown): string {
  const text = clean(value);
  if (['all', 'semua grade', 'semua'].includes(lower(text))) return 'ALL';
  const match = /^(?:(?:grade|kelas)\s*)?([789])$/i.exec(text);
  return match ? match[1] : '';
}
export function canonicalUACategory(value: unknown): string {
  const aliases: Record<string, string> = {
    'arts & makerspace': 'Arts & Makerspace', 'seni rupa': 'Arts & Makerspace', 'seni rupa (arts & makerspace)': 'Arts & Makerspace',
    'performing arts': 'Performing Arts', 'seni musik': 'Performing Arts', 'seni musik (performing arts)': 'Performing Arts',
    'physical education': 'Physical Education', 'pe': 'Physical Education', 'pjok': 'Physical Education',
    'digital literacy': 'Digital Literacy', 'dl': 'Digital Literacy'
  };
  return aliases[lower(value)] || '';
}
function canonicalUAName(category: string, name: string): string {
  const value = ['orchestra', 'orkestra'].includes(lower(name)) ? 'Orkestra' : clean(name);
  return JH_UA_CATEGORIES_CONFIG.find(item => item.key === category)?.activities.find(item => lower(item) === lower(value)) || value;
}
export function normalizeJHUAEnrollment(entry: any): any {
  let name = clean(entry.normalizedUaName || entry.sourceUaName || entry.unitActivityName || entry.activityName);
  if (['orchestra', 'orkestra'].includes(lower(name))) name = 'Orkestra';
  const declared = canonicalUACategory(entry.category);
  const known = JH_UA_CATEGORIES_CONFIG.find(category => category.activities.some(activity => lower(activity) === lower(name)));
  const conflict = !!declared && !!known && declared !== known.key;
  return { ...entry, studentId: clean(entry.studentId), normalizedUaName: known?.activities.find(activity => lower(activity) === lower(name)) || name, category: conflict ? '' : declared || known?.key || '', mappingConflict: conflict };
}
export function buildUAIdentity(category: string, name: string): string {
  const key = canonicalUACategory(category);
  if (!key || !clean(name)) throw new Error('Kategori/aktivitas UA belum dipetakan.');
  return `UA:${segment(key)}:${segment(canonicalUAName(key, name))}`;
}
export function buildUAClassId(name: string, targetGrade = 'ALL', category?: string): string {
  const key = canonicalUACategory(category);
  if (!key) {
    const suffix = targetGrade && targetGrade !== 'ALL' ? `_G${targetGrade}` : '';
    return `JUNIOR_HIGH_UA_${clean(name).replace(/[^a-zA-Z0-9]/g, '_')}${suffix}`;
  }
  const grade = normalizeUATargetGrade(targetGrade);
  if (!grade || !clean(name)) throw new Error('Identitas kelompok UA tidak valid.');
  return `JUNIOR_HIGH_UA_V2_${segment(key)}~${segment(canonicalUAName(key, name))}~${grade}`;
}
export function parseUAGroupId(groupId: string): JHAssessmentUAContext | null {
  const prefix = 'JUNIOR_HIGH_UA_V2_';
  if (typeof groupId !== 'string' || !groupId.startsWith(prefix)) return null;
  try {
    const parts = groupId.slice(prefix.length).split('~');
    if (parts.length !== 3) return null;
    const category = canonicalUACategory(decodeURIComponent(parts[0]));
    const name = canonicalUAName(category, decodeURIComponent(parts[1]));
    const grade = normalizeUATargetGrade(parts[2]);
    if (!category || !name || !grade) return null;
    return { assessmentMode: 'UNIT_ACTIVITY', unitActivityId: buildUAIdentity(category, name), unitActivityName: name, unitActivityCategory: category, targetGrade: grade, assessmentGroupId: groupId };
  } catch { return null; }
}
export function sharedUAContext(category: string, name: string): JHAssessmentUAContext {
  const parsed = parseUAGroupId(buildUAClassId(name, 'ALL', category));
  if (!parsed) throw new Error('Identitas aktivitas UA tidak valid.');
  return parsed;
}
function normalizeUAIdentity(value: string): string {
  const text = clean(value);
  const group = parseUAGroupId(text);
  if (group) return group.unitActivityId!;
  try {
    const parts = text.split(':');
    if (parts.length === 3 && parts[0] === 'UA') return buildUAIdentity(decodeURIComponent(parts[1]), decodeURIComponent(parts[2]));
  } catch { /* Non-identities are rejected below. */ }
  throw new Error(`Identitas UA tidak dapat diverifikasi: ${text}. Tidak memasangkan aktivitas otomatis.`);
}
function verifiedUAContext(value: JHAssessmentUAContext & { classId?: string }): JHAssessmentUAContext | null {
  const group = parseUAGroupId(value.assessmentGroupId || value.classId || '');
  if (!group) return null;
  if (value.unitActivityId && normalizeUAIdentity(value.unitActivityId) !== group.unitActivityId) throw new Error('Metadata aktivitas dan kelompok UA berbeda. Periksa data LO/entri.');
  return group;
}
export function getUAContextForLO(lo: JHAssessmentLO, selectedGroupId?: string): JHAssessmentUAContext {
  const original = verifiedUAContext(lo);
  const selected = parseUAGroupId(selectedGroupId || '');
  if (!original) {
    if (lo.assessmentMode === 'UNIT_ACTIVITY' || lo.classId.startsWith('JUNIOR_HIGH_UA_') || selected) throw new Error('LO belum memiliki identitas aktivitas yang dapat diverifikasi.');
    return {};
  }
  if (selected && selected.unitActivityId !== original.unitActivityId) throw new Error('LO dan aktivitas yang sedang dipilih berbeda. Muat ulang pilihan LO.');
  return sharedUAContext(original.unitActivityCategory!, original.unitActivityName!);
}
export interface JHUAActivityOption { id: string; name: string; category: string; confirmedCount: number; }
async function readEnrollments(academicYear: string, semester: string): Promise<any[]> {
  const snapshot = await getDocs(query(collection(db, 'junior_high_unit_activity_enrollments'), where('academicYear', '==', academicYear)));
  return snapshot.docs.map(item => normalizeJHUAEnrollment({ ...item.data(), id: item.id })).filter(item => String(item.semester) === String(semester));
}
export async function getJHUnitActivities(params: { academicYear: string; semester: string }): Promise<JHUAActivityOption[]> {
  const entries = await readEnrollments(params.academicYear, params.semester);
  const options = new Map<string, JHUAActivityOption>(); const seen = new Set<string>();
  for (const entry of entries) {
    if (!entry.category || !entry.normalizedUaName || entry.mappingConflict) continue;
    const id = buildUAIdentity(entry.category, entry.normalizedUaName);
    if (!options.has(id)) options.set(id, { id, name: entry.normalizedUaName, category: entry.category, confirmedCount: 0 });
    const key = `${id}|${entry.studentId}`;
    if (entry.status === 'CONFIRMED' && entry.studentId && !seen.has(key)) { options.get(id)!.confirmedCount++; seen.add(key); }
  }
  return [...options.values()].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}
export interface JHUAParticipant {
  id: string; studentId: string; name: string; nis?: string; nisn?: string; classId: string; className: string; grade?: number;
  currentUnit: string; academicYear: string; semester: string; category: string; normalizedUaName: string; attendanceNumber?: number;
}
export async function getJHUnitActivityEnrolledStudents(params: {
  academicYear: string; semester: string; unitActivityName: string; category?: string;
  classesMap?: Record<string, string>; classGrades?: Record<string, string>;
}): Promise<JHUAParticipant[]> {
  const entries = await readEnrollments(params.academicYear, params.semester);
  const category = canonicalUACategory(params.category);
  if (!category) throw new Error('Pemetaan kategori UA belum tersedia.');
  const selected = entries.filter(entry => entry.status === 'CONFIRMED' && entry.category === category && lower(entry.normalizedUaName) === lower(params.unitActivityName));
  const participants = new Map<string, JHUAParticipant>();
  for (const entry of selected) {
    if (!entry.studentId || !entry.classId) throw new Error('Ada peserta UA tanpa ID siswa/kelas asal. Perbaiki data kepesertaan dahulu.');
    if (participants.has(entry.studentId)) {
      if (participants.get(entry.studentId)!.classId !== entry.classId) throw new Error('Siswa memiliki dua kelas asal pada aktivitas/periode yang sama. Periksa kepesertaan UA.');
      continue;
    }
    const grade = normalizeUATargetGrade(params.classGrades?.[entry.classId] || entry.grade);
    participants.set(entry.studentId, {
      id: entry.studentId, studentId: entry.studentId, name: clean(entry.studentName) || 'Tanpa Nama', nis: entry.nis, nisn: entry.nisn,
      classId: entry.classId, className: params.classesMap?.[entry.classId] || entry.className || entry.classId,
      grade: grade && grade !== 'ALL' ? Number(grade) : undefined, currentUnit: 'JUNIOR_HIGH', academicYear: params.academicYear, semester: String(params.semester),
      category, normalizedUaName: entry.normalizedUaName, attendanceNumber: entry.attendanceNumber ?? entry.noAbsen
    });
  }
  return [...participants.values()].sort((a, b) => (a.grade || 0) - (b.grade || 0) || a.className.localeCompare(b.className) || a.name.localeCompare(b.name));
}
function readGoal(item: any): LearningGoal {
  const data = item.data();
  return { ...data, id: item.id, status: data.status || 'PUBLISHED', reviewStatus: data.reviewStatus || 'SUDAH_SESUAI', isActive: data.isActive !== false } as LearningGoal;
}
export async function getJuniorHighUALGs(params: { unitActivityName: string; category: string; targetGrade?: string; academicYear?: string }): Promise<LearningGoal[]> {
  const category = canonicalUACategory(params.category); const identity = buildUAIdentity(category, params.unitActivityName);
  const config = JH_UA_CATEGORIES_CONFIG.find(item => item.key === category)!;
  const snapshot = await getDocs(query(collection(db, 'learning_goals'), where('unitId', '==', 'JUNIOR_HIGH')));
  return snapshot.docs.map(readGoal).filter(goal => {
    const meta = goal as LearningGoal & JHAssessmentUAContext;
    if (!goal.isActive || goal.status === 'ARCHIVED' || (params.academicYear && goal.academicYear && goal.academicYear !== params.academicYear)) return false;
    if (meta.unitActivityId && normalizeUAIdentity(meta.unitActivityId) !== identity) return false;
    return meta.unitActivityId ? normalizeUAIdentity(meta.unitActivityId) === identity : lower(goal.subject) === lower(params.unitActivityName) ||
      [category, config.shortLabel, config.label].some(label => lower(goal.subject) === lower(label) || isSameJHSubject(goal.subject, label));
  });
}
export async function getAssessmentBookOptions(): Promise<AssessmentBookOptions> {
  const snapshot = await getDoc(doc(db, 'reportConfig', 'JUNIOR_HIGH'));
  const stored = snapshot.exists() ? (snapshot.data() as ReportConfig).assessmentBookOptions : undefined;
  return {
    formativeTasks: stored?.formativeTasks?.length ? stored.formativeTasks : DEFAULT_ASSESSMENT_BOOK_OPTIONS.formativeTasks,
    nextActions: stored?.nextActions?.length ? stored.nextActions : DEFAULT_ASSESSMENT_BOOK_OPTIONS.nextActions,
    summativeTasks: stored?.summativeTasks?.length ? stored.summativeTasks : DEFAULT_ASSESSMENT_BOOK_OPTIONS.summativeTasks
  };
}
export async function saveAssessmentBookOptions(options: AssessmentBookOptions): Promise<void> {
  await setDoc(doc(db, 'reportConfig', 'JUNIOR_HIGH'), { assessmentBookOptions: { formativeTasks: options.formativeTasks.filter(Boolean), nextActions: options.nextActions.filter(Boolean), summativeTasks: options.summativeTasks.filter(Boolean) }, updatedAt: Date.now() }, { merge: true });
}
export async function getJuniorHighLGs(grade?: string, subject?: string, academicYear?: string): Promise<LearningGoal[]> {
  let q = query(collection(db, 'learning_goals'), where('unitId', '==', 'JUNIOR_HIGH'));
  if (grade) q = query(q, where('grade', '==', grade));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(readGoal).filter(goal => goal.isActive && goal.status !== 'ARCHIVED' && (!subject || isSameJHSubject(goal.subject, subject)) && (!academicYear || !goal.academicYear || goal.academicYear === academicYear));
}
export async function proposeNewLG(params: { code: string; grade: string; subject: string; strand: string; goalText: string; academicYear: string; teacherId: string; teacherName?: string; parentGoalId?: string; version?: number }): Promise<string> {
  const ref = doc(collection(db, 'learning_goals')); const now = Date.now();
  const value: any = { id: ref.id, code: params.code, unitId: 'JUNIOR_HIGH', grade: params.grade, subject: getJHSubjectLegacyValue(params.subject), strand: params.strand || 'General', goalText: params.goalText, academicYear: params.academicYear, isActive: true, createdBy: params.teacherId, createdAt: now, updatedAt: now, version: params.version || 1, proposedFromAssessmentBook: true, status: 'DRAFT', reviewStatus: 'BELUM_DITELAAH' };
  if (params.parentGoalId) value.parentGoalId = params.parentGoalId;
  await setDoc(ref, value); return ref.id;
}
export async function updateTeacherOwnLG(params: { goalId: string; code: string; goalText: string; strand: string }): Promise<void> {
  await updateDoc(doc(db, 'learning_goals', params.goalId), { code: params.code, goalText: params.goalText, strand: params.strand, updatedAt: Date.now() });
}
export async function getPendingProposedLGs(): Promise<LearningGoal[]> {
  const snapshot = await getDocs(query(collection(db, 'learning_goals'), where('proposedFromAssessmentBook', '==', true), where('status', '==', 'DRAFT')));
  return snapshot.docs.map(readGoal);
}
export async function approveProposedLG(goalId: string): Promise<void> { await updateDoc(doc(db, 'learning_goals', goalId), { status: 'PUBLISHED', reviewStatus: 'SUDAH_SESUAI', updatedAt: Date.now() }); }
export async function requestRevisionProposedLG(goalId: string, reviewStatus: 'REVISI_MINOR' | 'REVISI_MAYOR', notes: string): Promise<void> { await updateDoc(doc(db, 'learning_goals', goalId), { status: 'DRAFT', reviewStatus, notes, updatedAt: Date.now() }); }

export interface AssessmentScope extends JHAssessmentUAContext { classId: string; subjectId: string; academicYear: string; semester: string; lgId: string; isUAMode?: boolean; }
function uaContext(scope: AssessmentScope): JHAssessmentUAContext | null {
  const parsed = verifiedUAContext(scope);
  if (scope.isUAMode || scope.assessmentMode === 'UNIT_ACTIVITY' || scope.classId.startsWith('JUNIOR_HIGH_UA_')) {
    if (!parsed) throw new Error('Identitas kelompok UA lama/tidak lengkap. Tidak membaca lintas aktivitas otomatis.');
    return sharedUAContext(parsed.unitActivityCategory!, parsed.unitActivityName!);
  }
  return null;
}
function sameContext(item: JHAssessmentUAContext & { classId?: string }, context: JHAssessmentUAContext): boolean {
  if (item.assessmentMode !== 'UNIT_ACTIVITY') return false;
  const parsed = verifiedUAContext(item);
  return !!parsed && parsed.unitActivityId === context.unitActivityId;
}
export interface JHSharedFormativeTask extends JHAssessmentUAContext {
  id: string; loId: string; lgId: string; classId: string; sourceLoClassId: string; subjectId: string; academicYear: string; semester: string;
  date: string; formativeTask: string; studentIds: string[]; teacherId: string; teacherName: string; createdAt: number; updatedAt: number;
}
type LOWithTasks = JHAssessmentLO & { sharedTasks?: JHSharedFormativeTask[] };
export function getAssignedFormativeTask(lo: JHAssessmentLO, studentId: string, date?: string): JHSharedFormativeTask | undefined {
  return (lo as LOWithTasks).sharedTasks?.filter(item => item.studentIds.includes(studentId) && (!date || item.date === date))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt || b.id.localeCompare(a.id))[0];
}
export async function getSharedFormativeTasks(params: AssessmentScope): Promise<JHSharedFormativeTask[]> {
  const context = uaContext(params);
  const constraints = [where('academicYear', '==', params.academicYear), where('semester', '==', params.semester), where('lgId', '==', params.lgId)];
  if (!context) constraints.push(where('classId', '==', params.classId));
  const snapshot = await getDocs(query(collection(db, 'jh_ab_shared_tasks'), ...constraints));
  return snapshot.docs.map(item => ({ ...item.data(), id: item.id } as JHSharedFormativeTask)).filter(item => context ? sameContext(item, context) : item.assessmentMode !== 'UNIT_ACTIVITY');
}
export async function getLOsForLG(params: AssessmentScope): Promise<JHAssessmentLO[]> {
  const context = uaContext(params);
  const constraints = [where('academicYear', '==', params.academicYear), where('semester', '==', params.semester), where('lgId', '==', params.lgId)];
  if (!context) constraints.push(where('classId', '==', params.classId));
  const [snapshot, tasks] = await Promise.all([getDocs(query(collection(db, 'jh_ab_los'), ...constraints)), getSharedFormativeTasks(params)]);
  return snapshot.docs.map(item => ({ ...item.data(), id: item.id } as JHAssessmentLO))
    .filter(item => item.isActive !== false && (context ? sameContext(item, context) : item.assessmentMode !== 'UNIT_ACTIVITY'))
    .map(item => ({ ...item, sharedTasks: tasks.filter(task => task.loId === item.id) }))
    .sort((a, b) => (a.order || 0) - (b.order || 0) || a.id.localeCompare(b.id));
}
export async function saveLO(params: { id?: string; lgId: string; classId: string; subjectId: string; academicYear: string; semester: string; code: string; title: string; order: number; teacherId: string; teacherName?: string } & JHAssessmentUAContext): Promise<string> {
  if (!clean(params.subjectId)) throw new Error('Mata pelajaran tidak boleh kosong.');
  const now = Date.now();
  if (params.id) { await updateDoc(doc(db, 'jh_ab_los', params.id), { code: params.code, title: params.title, order: params.order, updatedAt: now }); return params.id; }
  const parsed = verifiedUAContext(params);
  if (params.classId.startsWith('JUNIOR_HIGH_UA_') && !parsed) throw new Error('Kelompok UA belum memakai identitas lengkap.');
  const context = parsed ? sharedUAContext(parsed.unitActivityCategory!, parsed.unitActivityName!) : null;
  const ref = doc(collection(db, 'jh_ab_los'));
  await setDoc(ref, { id: ref.id, lgId: params.lgId, classId: context?.assessmentGroupId || params.classId, subjectId: params.subjectId, academicYear: params.academicYear, semester: params.semester, code: params.code, title: params.title, order: params.order, isActive: true, teacherId: params.teacherId, teacherName: params.teacherName || '', createdAt: now, updatedAt: now, ...(context || {}) });
  return ref.id;
}
export async function softDeleteLO(loId: string): Promise<void> { await updateDoc(doc(db, 'jh_ab_los', loId), { isActive: false, updatedAt: Date.now() }); }
export async function hardDeleteLO(loId: string): Promise<void> { await deleteDoc(doc(db, 'jh_ab_los', loId)); }
async function readEntries<T extends JHAssessmentUAContext>(name: string, params: AssessmentScope): Promise<T[]> {
  const context = uaContext(params);
  const constraints: any[] = [where('academicYear', '==', params.academicYear), where('semester', '==', params.semester), where('lgId', '==', params.lgId)];
  if (!context) constraints.push(where('classId', '==', params.classId));
  const snapshot = await getDocs(query(collection(db, name), ...constraints));
  return snapshot.docs.map(item => ({ ...item.data(), id: item.id } as unknown as T)).filter(item => context ? sameContext(item, context) : item.assessmentMode !== 'UNIT_ACTIVITY');
}
export async function getFormativeEntries(params: AssessmentScope): Promise<JHFormativeEntry[]> {
  return (await readEntries<JHFormativeEntry>('jh_ab_formative_entries', params)).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0) || a.id.localeCompare(b.id));
}
export async function getSummativeEntries(params: AssessmentScope): Promise<JHSummativeEntry[]> {
  const items = await readEntries<JHSummativeEntry>('jh_ab_summative_entries', params);
  if (uaContext(params)) {
    const seen = new Set<string>();
    for (const item of items) {
      if (seen.has(item.studentId)) throw new Error('Nilai sumatif ganda untuk siswa/LG/UA yang sama. Tinjau konflik; tidak digabung otomatis.');
      seen.add(item.studentId);
    }
  }
  return items;
}
type FormativeInput = Omit<JHFormativeEntry, 'id' | 'createdAt' | 'updatedAt'>;
type SummativeInput = Omit<JHSummativeEntry, 'id' | 'createdAt' | 'updatedAt'> & { id?: string };
async function prepareUAEntry<T extends FormativeInput | SummativeInput>(entry: T, lo?: JHAssessmentLO, rosterCache?: Map<string, JHUAParticipant[]>): Promise<T> {
  if (!clean(entry.subjectId)) throw new Error('Mata pelajaran tidak boleh kosong.');
  const loGroup = lo ? verifiedUAContext(lo) : null;
  const entryGroup = verifiedUAContext(entry) || (entry.assessmentMode === 'UNIT_ACTIVITY' && entry.unitActivityName && entry.unitActivityCategory ? sharedUAContext(entry.unitActivityCategory, entry.unitActivityName) : null);
  if (loGroup && entryGroup && loGroup.unitActivityId !== entryGroup.unitActivityId) throw new Error('LO dan entri berasal dari aktivitas berbeda. Muat ulang LO yang dipilih.');
  if (lo && !loGroup && entryGroup) throw new Error('LO mata pelajaran tidak dapat dipakai sebagai LO Unit Aktivitas.');
  const source = loGroup || entryGroup;
  if (!source) {
    if (lo?.assessmentMode === 'UNIT_ACTIVITY' || entry.assessmentMode === 'UNIT_ACTIVITY' || entry.classId.startsWith('JUNIOR_HIGH_UA_')) throw new Error('Relasi aktivitas/kelompok UA belum lengkap.');
    if (lo && entry.classId !== lo.classId) throw new Error('Kelas entri tidak sesuai dengan LO.');
    return entry;
  }
  const group = sharedUAContext(source.unitActivityCategory!, source.unitActivityName!);
  if (entry.unitActivityId && normalizeUAIdentity(entry.unitActivityId) !== group.unitActivityId) throw new Error('Aktivitas pada entri berbeda dengan LO. Pilih ulang aktivitas dan LO; nilai tidak disimpan.');
  const rosterKey = JSON.stringify([entry.academicYear, entry.semester, group.unitActivityId]);
  let roster = rosterCache?.get(rosterKey);
  if (!roster) {
    roster = await getJHUnitActivityEnrolledStudents({ academicYear: entry.academicYear, semester: entry.semester, unitActivityName: group.unitActivityName!, category: group.unitActivityCategory });
    rosterCache?.set(rosterKey, roster);
  }
  const participant = roster.find(item => item.id === entry.studentId);
  if (!participant) throw new Error('Siswa bukan peserta aktif aktivitas pada periode ini.');
  if (!entry.classId.startsWith('JUNIOR_HIGH_UA_') && entry.classId !== participant.classId) throw new Error('Kelas asal siswa tidak sesuai kepesertaan UA.');
  return { ...entry, ...group, classId: participant.classId };
}
async function loadEntryLO(entry: { loId: string; lgId: string; academicYear: string; semester: string }): Promise<JHAssessmentLO> {
  const snapshot = await getDoc(doc(db, 'jh_ab_los', entry.loId));
  if (!snapshot.exists()) throw new Error('LO tidak ditemukan.');
  const lo = { ...snapshot.data(), id: snapshot.id } as JHAssessmentLO;
  if (lo.isActive === false || lo.lgId !== entry.lgId || lo.academicYear !== entry.academicYear || String(lo.semester) !== String(entry.semester)) throw new Error('Konteks LO dan entri tidak sesuai atau LO tidak aktif.');
  return lo;
}
export async function saveSharedFormativeTask(params: { id: string; loId: string; lgId: string; classId: string; subjectId: string; academicYear: string; semester: string; date: string; formativeTask: string; studentIds: string[]; teacherId: string; teacherName: string }): Promise<string> {
  const ids = [...new Set(params.studentIds.map(clean).filter(Boolean))];
  if (!ids.length || ids.length > 400 || !clean(params.formativeTask) || !/^\d{4}-\d{2}-\d{2}$/.test(params.date) || !clean(params.teacherId) || !clean(params.id)) throw new Error('Isi tanggal, task, identitas guru, dan pilih 1–400 peserta.');
  const lo = await loadEntryLO(params);
  if (lo.subjectId !== params.subjectId) throw new Error('Mata pelajaran task tidak sesuai LO.');
  const context = getUAContextForLO(lo, params.classId);
  if (context.assessmentMode === 'UNIT_ACTIVITY') {
    const roster = await getJHUnitActivityEnrolledStudents({ academicYear: params.academicYear, semester: params.semester, category: context.unitActivityCategory, unitActivityName: context.unitActivityName! });
    const eligible = new Set(roster.map(item => item.id));
    if (ids.some(id => !eligible.has(id))) throw new Error('Ada penerima task yang bukan peserta UA aktif.');
  } else {
    if (lo.classId !== params.classId) throw new Error('Kelas task tidak sesuai LO.');
const activeStudents = await getActiveStudents(
  params.classId,
  params.academicYear
);

const eligibleStudentIds = new Set(
  activeStudents.map(student => String(student.id).trim())
);

const invalidStudentIds = ids.filter(
  studentId => !eligibleStudentIds.has(studentId)
);

if (invalidStudentIds.length > 0) {
  throw new Error(
    `${invalidStudentIds.length} penerima task tidak ditemukan ` +
    'dalam enrollment aktif kelas dan tahun ajaran ini.'
  );
}  const ref = doc(db, 'jh_ab_shared_tasks', `TASK_${segment(params.id)}`);
  const existing = await getDoc(ref);
  if (existing.exists()) {
    const old = existing.data();
    if (old.loId === params.loId && old.teacherId === params.teacherId && old.date === params.date && old.formativeTask === clean(params.formativeTask) && JSON.stringify(old.studentIds) === JSON.stringify(ids)) return ref.id;
    throw new Error('Draft task ini sudah disimpan dengan isi berbeda. Buka draft baru.');
  }
  const now = Date.now();
  await setDoc(ref, { id: ref.id, loId: lo.id, lgId: lo.lgId, classId: context.assessmentGroupId || params.classId, sourceLoClassId: lo.classId, subjectId: params.subjectId, academicYear: params.academicYear, semester: params.semester, date: params.date, formativeTask: clean(params.formativeTask), studentIds: ids, teacherId: params.teacherId, teacherName: params.teacherName || '', createdAt: now, updatedAt: now, ...context });
  return ref.id;
}
function checkLevel(level: JHFormativeLevel): void {
  if (!['Achieved', 'Not Achieved', 'B', 'D', 'A'].includes(level)) throw new Error('Nilai LO tidak valid.');
}
async function withSharedTask(entry: FormativeInput, lo: JHAssessmentLO): Promise<FormativeInput> {
  if (clean(entry.formativeTask)) return entry;
  const context = getUAContextForLO(lo);
  const tasks = await getSharedFormativeTasks({ ...entry, ...context, classId: context.assessmentGroupId || lo.classId });
  const task = getAssignedFormativeTask({ ...lo, sharedTasks: tasks.filter(item => item.loId === lo.id) } as LOWithTasks, entry.studentId, entry.date);
  return task ? { ...entry, formativeTask: task.formativeTask } : entry;
}
export async function addFormativeEntry(entry: FormativeInput): Promise<string> {
  checkLevel(entry.comprehensionLevel);
  const lo = await loadEntryLO(entry);
  const prepared = await prepareUAEntry(entry, lo);
  const payload = await withSharedTask(prepared, lo);
  const ref = doc(collection(db, 'jh_ab_formative_entries')); const now = Date.now();
  await setDoc(ref, { ...payload, id: ref.id, createdAt: now, updatedAt: now }); return ref.id;
}
export async function correctFormativeEntry(params: { entryId: string; comprehensionLevel: JHFormativeLevel; formativeTask?: string; nextAction?: string; notes?: string; date?: string; correctedBy: string; correctedByName?: string; correctionReason?: string }): Promise<void> {
  checkLevel(params.comprehensionLevel);
  const payload: any = { comprehensionLevel: params.comprehensionLevel, updatedAt: Date.now(), correctedAt: Date.now(), correctedBy: params.correctedBy };
  for (const key of ['formativeTask', 'nextAction', 'notes', 'date', 'correctedByName', 'correctionReason'] as const) if (params[key] !== undefined) payload[key] = params[key];
  await updateDoc(doc(db, 'jh_ab_formative_entries', params.entryId), payload);
}
export async function hardDeleteFormativeEntry(entryId: string): Promise<void> { await deleteDoc(doc(db, 'jh_ab_formative_entries', entryId)); }
export async function bulkAddFormativeEntries(entries: FormativeInput[]): Promise<void> {
  if (!entries.length) return;
  if (entries.length > 400) throw new Error('Maksimal 400 peserta per penyimpanan.');
  const seen = new Set<string>(); const prepared: FormativeInput[] = []; const loCache = new Map<string, JHAssessmentLO>(); const rosterCache = new Map<string, JHUAParticipant[]>();
  for (const entry of entries) {
    checkLevel(entry.comprehensionLevel);
    const key = `${entry.studentId}|${entry.loId}`;
    if (seen.has(key)) throw new Error('Ada siswa/LO ganda dalam sesi.');
    seen.add(key);
    let lo = loCache.get(entry.loId);
    if (!lo) { lo = await loadEntryLO(entry); loCache.set(entry.loId, lo); }
    if (lo.lgId !== entry.lgId || lo.academicYear !== entry.academicYear || String(lo.semester) !== String(entry.semester)) throw new Error('Konteks sesi tidak sesuai LO.');
    prepared.push(await prepareUAEntry(entry, lo, rosterCache));
  }
  const batch = writeBatch(db); const now = Date.now();
  for (const entry of prepared) {
    const stableId = entry.sessionId ? `SESSION_${segment(entry.sessionId)}~${segment(entry.studentId)}~${segment(entry.loId)}` : '';
    const ref = stableId ? doc(db, 'jh_ab_formative_entries', stableId) : doc(collection(db, 'jh_ab_formative_entries'));
    const existing = stableId ? await getDoc(ref) : null;
    if (existing?.exists()) {
      const old = existing.data();
      if (old.studentId !== entry.studentId || old.loId !== entry.loId || old.teacherId !== entry.teacherId) throw new Error('Identitas/pembuat sesi berbeda. Tidak menimpa entri.');
      batch.update(ref, { comprehensionLevel: entry.comprehensionLevel, formativeTask: entry.formativeTask || '', nextAction: entry.nextAction || '', notes: entry.notes || '', date: entry.date, updatedAt: now });
    } else batch.set(ref, { ...entry, id: ref.id, createdAt: now, updatedAt: now });
  }
  await batch.commit();
}
export function normalizeAcademicYear(year: string): string { return String(year || '').replace(/\//g, '_').trim(); }
export function buildSummativeEntryId(params: { studentId: string; classId: string; subjectId: string; lgId: string; academicYear: string; semester: string } & JHAssessmentUAContext): string {
  if (params.assessmentMode === 'UNIT_ACTIVITY') {
    const source = verifiedUAContext(params);
    if (!source) throw new Error('Identitas UA wajib untuk nilai sumatif.');
    const group = sharedUAContext(source.unitActivityCategory!, source.unitActivityName!);
    return `UA_SUM_${[params.studentId, group.assessmentGroupId!, params.lgId, params.academicYear, params.semester].map(segment).join('~')}`;
  }
  return `${params.studentId}_${params.classId}_${params.subjectId}_${params.lgId}_${normalizeAcademicYear(params.academicYear)}_${params.semester}`;
}
export async function saveSummativeEntry(entry: SummativeInput): Promise<string> {
  if (!['B', 'D', 'A'].includes(entry.summativeScore)) throw new Error('Nilai sumatif tetap B/D/A.');
  const prepared = await prepareUAEntry(entry); const generatedId = buildSummativeEntryId(prepared);
  let existingId = entry.id;
  if (prepared.assessmentMode === 'UNIT_ACTIVITY' && !existingId) {
    const previous = await getSummativeEntries({ ...prepared, classId: prepared.assessmentGroupId!, isUAMode: true });
    existingId = previous.find(item => item.studentId === prepared.studentId)?.id;
  }
  const ref = doc(db, 'jh_ab_summative_entries', existingId || generatedId); const snapshot = await getDoc(ref); const now = Date.now();
  if (snapshot.exists()) {
    const old = snapshot.data();
    if (old.studentId !== prepared.studentId || old.lgId !== prepared.lgId || old.classId !== prepared.classId || old.academicYear !== prepared.academicYear || String(old.semester) !== String(prepared.semester) || (prepared.assessmentMode === 'UNIT_ACTIVITY' ? !sameContext(old, prepared) : old.assessmentMode === 'UNIT_ACTIVITY')) throw new Error('Konteks nilai sumatif berbeda. Tidak menimpa data lama.');
    await updateDoc(ref, { summativeTask: entry.summativeTask, summativeScore: entry.summativeScore, notes: entry.notes || '', date: entry.date, updatedAt: now, updatedBy: entry.updatedBy || entry.teacherId, updatedByName: entry.updatedByName || entry.teacherName || '' });
  } else await setDoc(ref, { ...prepared, id: ref.id, notes: entry.notes || '', createdAt: now, updatedAt: now, updatedBy: entry.updatedBy || entry.teacherId, updatedByName: entry.updatedByName || entry.teacherName || '' });
  return ref.id;
}
export async function hardDeleteSummativeEntry(entryId: string): Promise<void> { await deleteDoc(doc(db, 'jh_ab_summative_entries', entryId)); }
