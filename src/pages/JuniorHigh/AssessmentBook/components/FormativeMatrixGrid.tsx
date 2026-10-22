import * as React from 'react';
import { toast } from 'sonner';
import { AssessmentBookOptions, JHAssessmentLO, JHFormativeEntry, JHSummativeEntry, LearningGoal, Student } from '../../../../types';
import { addFormativeEntry, correctFormativeEntry, formatDateWIB, getAssignedFormativeTask, getTodayWIB } from '../../../../services/juniorHighAssessmentBookService';
interface Props {
  students: Student[]; lg: LearningGoal; los: JHAssessmentLO[]; formativeEntries: JHFormativeEntry[]; summativeEntries: JHSummativeEntry[];
  options: AssessmentBookOptions; classId: string; subjectId: string; academicYear: string; semester: string; teacherId: string; teacherName: string; isReadOnly?: boolean;
  onOpenFormativeModal: (student: Student, lo: JHAssessmentLO) => void; onOpenSummativeModal: (student: Student) => void;
  onOpenManageLOModal: () => void; onOpenBulkModal: (lo: JHAssessmentLO) => void; onOpenSharedTaskModal: (lo: JHAssessmentLO) => void; onRefreshData: () => void;
}
export function FormativeMatrixGrid(props: Props) {
  const { students, lg, los, formativeEntries, summativeEntries, classId, subjectId, academicYear, semester, teacherId, teacherName, isReadOnly = false, onOpenFormativeModal, onOpenSummativeModal, onOpenManageLOModal, onOpenBulkModal, onOpenSharedTaskModal, onRefreshData } = props;
  const [search, setSearch] = React.useState('');
  const [saving, setSaving] = React.useState('');
  const lock = React.useRef(false);
  const visible = students.filter(item => `${item.name} ${item.nisn || ''} ${(item as Student & { nis?: string }).nis || ''}`.toLowerCase().includes(search.toLowerCase()));
  const latest = React.useMemo(() => {
    const result: Record<string, JHFormativeEntry> = {};
    [...formativeEntries].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0) || a.id.localeCompare(b.id)).forEach(item => { result[`${item.studentId}|${item.loId}`] = item; });
    return result;
  }, [formativeEntries]);
  const quick = async (student: Student, lo: JHAssessmentLO, level: 'Achieved' | 'Not Achieved') => {
    if (isReadOnly || lock.current) return;
    lock.current = true; setSaving(`${student.id}|${lo.id}`);
    const assigned = getAssignedFormativeTask(lo, student.id);
    const date = assigned?.date || getTodayWIB();
    const old = [...formativeEntries].reverse().find(item => item.studentId === student.id && item.loId === lo.id && item.teacherId === teacherId && item.date === date && (!assigned || item.formativeTask === assigned.formativeTask));
    const nextAction = old?.nextAction || (level === 'Achieved' ? 'Lanjut ke LO Berikutnya' : 'Bimbingan Personal Guru');
    try {
      if (old) await correctFormativeEntry({ entryId: old.id, comprehensionLevel: level, nextAction, correctedBy: teacherId, correctedByName: teacherName, correctionReason: 'Klik cepat kelas' });
      else await addFormativeEntry({ loId: lo.id, lgId: lo.lgId, classId, subjectId, academicYear, semester, studentId: student.id, studentName: student.name, date, formativeTask: assigned?.formativeTask || '', comprehensionLevel: level, nextAction, notes: '', teacherId, teacherName });
      toast.success('Capaian siswa tersimpan.'); onRefreshData();
    } catch (error) { toast.error(error instanceof Error ? error.message : String(error)); }
    finally { lock.current = false; setSaving(''); }
  };
  return <div className="bg-white border rounded-2xl overflow-hidden"><div className="p-4 flex flex-wrap justify-between gap-3 items-center"><div><p className="text-xs text-gray-500">{lg.code} · {visible.length} siswa ditampilkan</p><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Cari nama/NIS…" className="border rounded-xl p-2 text-xs mt-2" /></div>{!isReadOnly && <button onClick={onOpenManageLOModal} className="px-3 py-2 rounded-xl border text-xs">Kelola Tangga LO ({los.length})</button>}</div>
    <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-slate-50"><tr><th className="p-3">No</th><th className="p-3 min-w-[190px]">Nama Siswa</th>{los.map(lo => { const count = students.filter(item => latest[`${item.id}|${lo.id}`]).length; return <th key={lo.id} className="p-3 min-w-[250px] border-l align-top"><span className="text-purple-800">{lo.code}</span><p className="font-medium mt-1">{lo.title}</p><p className="text-gray-400 font-normal mt-1">{count}/{students.length} dinilai</p>{!isReadOnly && <div className="mt-3 flex flex-col gap-2 items-start"><button className="px-2 py-1 rounded bg-purple-100 text-purple-800" onClick={() => onOpenSharedTaskModal(lo)}>Tetapkan Task Kelas</button><button className="text-gray-500 underline font-normal" onClick={() => onOpenBulkModal(lo)}>Nilai massal — nilai sama</button></div>}</th>; })}<th className="p-3 min-w-[150px] bg-emerald-50">Nilai Sumatif LG<br />Skala B/D/A</th></tr></thead>
    <tbody>{visible.map((student, index) => <tr key={student.id} className="border-t"><td className="p-3 align-top">{student.attendanceNumber ?? (student as Student & { noAbsen?: number }).noAbsen ?? index + 1}</td><td className="p-3 align-top font-semibold">{student.name}<p className="text-gray-400 font-normal mt-1">{student.nisn || student.id}</p></td>{los.map(lo => { const entry = latest[`${student.id}|${lo.id}`]; const assigned = getAssignedFormativeTask(lo, student.id); return <td key={lo.id} className="p-3 border-l align-top"><button className="text-left w-full space-y-2" onClick={() => onOpenFormativeModal(student, lo)}>{assigned && <p className="p-2 bg-blue-50 text-blue-900 rounded-lg">Task: {assigned.formativeTask}<span className="block text-gray-500">{formatDateWIB(assigned.date)}</span></p>}{entry ? <><p className="font-bold text-purple-800">{entry.comprehensionLevel}{['A', 'B', 'D'].includes(entry.comprehensionLevel) ? ' (lama)' : ''}</p><p>{entry.formativeTask || 'Asesmen Cepat'}</p><p className="text-gray-400">{formatDateWIB(entry.date)}</p><p className="p-2 bg-purple-50 rounded-lg whitespace-pre-wrap">Next Action: {entry.nextAction || 'Belum diisi'}</p></> : <p className="text-gray-400">Belum dinilai</p>}</button>{!isReadOnly && <div className="flex gap-2 mt-3">{(['Achieved', 'Not Achieved'] as const).map(level => <button key={level} disabled={!!saving} onClick={() => void quick(student, lo, level)} className="px-2 py-1 border rounded text-[10px] disabled:opacity-40">{level}</button>)}</div>}</td>; })}<td className="p-3 bg-emerald-50/30 align-top"><button className="underline text-emerald-800" onClick={() => onOpenSummativeModal(student)}>{summativeEntries.find(item => item.studentId === student.id)?.summativeScore || (isReadOnly ? 'Belum sumatif' : 'Isi Sumatif')}</button></td></tr>)}</tbody></table></div>{!los.length && <p className="p-6 text-center text-sm text-gray-500">Tambahkan LO melalui Kelola Tangga LO.</p>}
  </div>;
}
