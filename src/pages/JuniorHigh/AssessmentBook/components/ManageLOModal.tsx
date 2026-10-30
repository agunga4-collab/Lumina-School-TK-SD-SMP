import * as React from 'react';
import { X, Plus, Trash2, Edit2, Check, Target, Copy, CheckSquare, Square, Layers, ArrowRightLeft, Loader2, AlertTriangle } from 'lucide-react';
import type { JHAssessmentLO, LearningGoal, Class } from '../../../../types';
import {
  saveLO, softDeleteLO, saveLOMultiClass, getLGGrades, getLOsForLG,
  previewLOParentMove, moveLOToLearningGoal
} from '../../../../services/juniorHighAssessmentBookService';
import type { LOParentMovePreview, LOParentMoveRequest } from '../../../../services/juniorHighAssessmentBookService';
import { getJHGradeLevelNumber } from '../../../../services/juniorHighMidtermService';
import { toast } from 'sonner';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  lg: LearningGoal;
  classId: string;
  subjectId: string;
  academicYear: string;
  semester: string;
  los: JHAssessmentLO[];
  teacherUid: string;
  teacherName: string;
  onRefresh: () => void | Promise<void>;
  classes?: Class[];
  isUAMode?: boolean;
  availableGoals?: LearningGoal[];
  onMoved?: (targetLgId: string) => void;
}
const inputClass = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-purple-400 disabled:opacity-50';
const buttonClass = 'inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function nextLOCode(items: JHAssessmentLO[]): string {
  const used = new Set(items.map(item => String(item.code || '').trim().toLowerCase()));
  let index = 1;
  while (used.has(`lo ${index}`)) index++;
  return `LO ${index}`;
}
export function ManageLOModal({ isOpen, onClose, lg, classId, subjectId, academicYear, semester, los, teacherUid, teacherName, onRefresh, classes = [], isUAMode = false, availableGoals = [], onMoved }: Props) {
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [code, setCode] = React.useState('');
  const [title, setTitle] = React.useState('');
  const [newCode, setNewCode] = React.useState('');
  const [newTitle, setNewTitle] = React.useState('');
  const [selectedClassIds, setSelectedClassIds] = React.useState<string[]>([]);
  const [copyingLO, setCopyingLO] = React.useState<JHAssessmentLO | null>(null);
  const [copyTargets, setCopyTargets] = React.useState<string[]>([]);
  const [movingLO, setMovingLO] = React.useState<JHAssessmentLO | null>(null);
  const [targetId, setTargetId] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [preview, setPreview] = React.useState<LOParentMovePreview | null>(null);
  const [acknowledged, setAcknowledged] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const operation = React.useRef(false);
  const currentScope = JSON.stringify([lg.id, classId, subjectId, academicYear, semester, isUAMode]);
  const latestScope = React.useRef(currentScope);
  latestScope.current = currentScope;
  const eligibleClasses = React.useMemo(() => {
    if (isUAMode) return [];
    const grades = getLGGrades(lg);
    return classes.filter(cls => {
      if (cls.unitId && cls.unitId !== 'JUNIOR_HIGH') return false;
      if (cls.academicYear && cls.academicYear !== academicYear) return false;
      const grade = getJHGradeLevelNumber(cls);
      return !grades.length || grades.includes(String(grade || cls.grade || cls.gradeLevel || '').trim());
    });
  }, [classes, lg, academicYear, isUAMode]);
  const otherClasses = eligibleClasses.filter(cls => cls.id !== classId);
  const currentName = isUAMode ? `UA ${subjectId}` : classes.find(cls => cls.id === classId)?.name || 'Kelas Ini';
  const destinationGoals = availableGoals.filter(goal => goal.id !== lg.id && goal.isActive !== false && goal.status !== 'ARCHIVED');
  React.useEffect(() => {
    if (!isOpen) return;
    setNewCode(nextLOCode(los)); setNewTitle(''); setEditingId(null);
    setSelectedClassIds([classId]); setCopyingLO(null); setCopyTargets([]);
    setMovingLO(null); setTargetId(''); setReason(''); setPreview(null); setAcknowledged(false);
  }, [isOpen, currentScope]);
  const close = () => { if (!operation.current) onClose(); };
  React.useEffect(() => {
    if (!isOpen) return;
    const handler = (event: KeyboardEvent) => { if (event.key === 'Escape' && !operation.current) onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);
  const run = async (action: () => Promise<void>) => {
    if (operation.current) return;
    operation.current = true; setBusy(true);
    try { await action(); }
    catch (error) { console.error(error); toast.error(message(error)); }
    finally { operation.current = false; setBusy(false); }
  };
  const className = (id: string) => eligibleClasses.find(cls => cls.id === id)?.name || id;
  const reportResult = (result: Awaited<ReturnType<typeof saveLOMultiClass>>) => {
    if (result.successClasses.length) toast.success(`Berhasil pada ${result.successClasses.length} kelas: ${result.successClasses.map(className).join(', ')}`);
    if (result.skippedClasses.length) toast.info(`Dilewati: ${result.skippedClasses.map(item => `${className(item.classId)} (${item.reason})`).join(', ')}`);
    if (result.failedClasses.length) toast.error(`Gagal: ${result.failedClasses.map(item => `${className(item.classId)}: ${item.error}`).join(', ')}`);
  };
  const handleAddNew = (event: React.FormEvent) => {
    event.preventDefault();
    if (!subjectId.trim() || !newTitle.trim() || !lg.id || !teacherUid) { toast.warning('Lengkapi pelajaran, LG, deskripsi LO, dan identitas guru.'); return; }
    if (!isUAMode && !selectedClassIds.length) { toast.warning('Pilih minimal satu kelas penerima.'); return; }
    void run(async () => {
      let succeeded = false;
      if (isUAMode) {
        const existing = await getLOsForLG({ lgId: lg.id, classId, subjectId, academicYear, semester, isUAMode: true });
        if (existing.some(item => String(item.title || '').trim().toLowerCase() === newTitle.trim().toLowerCase())) throw new Error('LO dengan deskripsi serupa sudah ada.');
        const requested = newCode.trim() || nextLOCode(existing);
        const resolvedCode = existing.some(item => item.code.trim().toLowerCase() === requested.toLowerCase()) ? nextLOCode(existing) : requested;
        await saveLO({ lgId: lg.id, classId, subjectId, academicYear, semester, code: resolvedCode, title: newTitle.trim(), order: existing.reduce((max, item) => Math.max(max, item.order || 0), 0) + 1, teacherId: teacherUid, teacherName });
        succeeded = true; toast.success('LO Unit Aktivitas berhasil ditambahkan.');
      } else {
        const result = await saveLOMultiClass({ lgId: lg.id, targetClassIds: selectedClassIds, subjectId, academicYear, semester, code: newCode.trim() || nextLOCode(los), title: newTitle.trim(), teacherId: teacherUid, teacherName });
        reportResult(result); succeeded = result.successClasses.length > 0;
      }
      if (succeeded) { setNewTitle(''); setNewCode(''); setSelectedClassIds([classId]); await onRefresh(); }
    });
  };
  const handleSaveEdit = (lo: JHAssessmentLO) => {
    if (!title.trim()) { toast.warning('Deskripsi LO tidak boleh kosong.'); return; }
    void run(async () => {
      await saveLO({ id: lo.id, lgId: lg.id, classId, subjectId, academicYear, semester, code: code.trim() || lo.code, title: title.trim(), order: lo.order, teacherId: teacherUid, teacherName });
      setEditingId(null); toast.success('LO diperbarui tanpa mengubah nilai siswa.'); await onRefresh();
    });
  };
  const handleDelete = (lo: JHAssessmentLO) => {
    if (!window.confirm(`Sembunyikan/hapus aktif ${lo.code} dari ${currentName}? Riwayat tidak dihapus permanen.`)) return;
    void run(async () => { await softDeleteLO(lo.id); toast.success('LO dinonaktifkan.'); await onRefresh(); });
  };
  const handleCopy = () => {
    if (!copyingLO || !copyTargets.length) return;
    void run(async () => {
      const result = await saveLOMultiClass({ lgId: lg.id, targetClassIds: copyTargets, subjectId, academicYear, semester, code: copyingLO.code, title: copyingLO.title, teacherId: teacherUid, teacherName });
      reportResult(result);
      if (!result.failedClasses.length) { setCopyingLO(null); setCopyTargets([]); }
    });
  };
  const moveRequest = (): LOParentMoveRequest => {
    if (!movingLO) throw new Error('LO belum dipilih.');
    return { loId: movingLO.id, targetLgId: targetId, scope: { classId, subjectId, academicYear, semester, lgId: lg.id, isUAMode }, actorUid: teacherUid, actorName: teacherName };
  };
  const checkMove = () => {
    const key = currentScope;
    void run(async () => {
      const result = await previewLOParentMove(moveRequest());
      if (latestScope.current === key) { setPreview(result); setAcknowledged(false); }
    });
  };
  const confirmMove = () => {
    if (!preview || !reason.trim() || !acknowledged) return;
    if (!window.confirm(`Pindahkan ${preview.formativeCount} entri nilai dan ${preview.taskCount} task untuk LO ini ke LG tujuan? Nilai sumatif LG tetap di tempat semula.`)) return;
    const request = moveRequest();
    void run(async () => {
      await moveLOToLearningGoal(request, preview, reason);
      toast.success('LO, nilai formatif, task, dan sumber Sheet terkait berhasil dipindahkan. Sumatif tidak diubah.');
      setMovingLO(null); setPreview(null);
      if (onMoved) onMoved(request.targetLgId);
      else await onRefresh();
    });
  };
  if (!isOpen) return null;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Kelola Learning Objectives">
    <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border bg-white shadow-2xl">
      <header className="flex items-start justify-between gap-3 border-b bg-slate-50 p-5">
        <div className="flex items-start gap-3"><Target className="mt-0.5 text-purple-700" size={22} /><div>
          <h2 className="text-base font-bold text-slate-900">Kelola Learning Objectives (LO)</h2>
          <p className="mt-1 text-xs text-slate-600">{currentName} · {lg.code || 'LG'} — {lg.goalText}</p>
          {getLGGrades(lg).length > 1 && <p className="mt-1 text-[11px] text-indigo-700">Asal master grade: {getLGGrades(lg).join(', ')}</p>}
        </div></div>
        <button type="button" disabled={busy} onClick={close} aria-label="Tutup" className="rounded-lg p-1.5 hover:bg-slate-200 disabled:opacity-40"><X size={20} /></button>
      </header>
      <div className="flex-1 space-y-6 overflow-y-auto p-5">
        <form onSubmit={handleAddNew} className="space-y-3 rounded-2xl border border-purple-100 bg-purple-50/50 p-4">
          <h3 className="flex items-center gap-2 text-xs font-bold uppercase text-purple-900"><Plus size={15} />Tambah Learning Objective</h3>
          <fieldset disabled={busy} className="space-y-3">
            <div className="grid gap-3 md:grid-cols-[140px_1fr]">
              <label className="space-y-1 text-xs text-slate-600"><span>Kode LO</span><input value={newCode} onChange={event => setNewCode(event.target.value)} placeholder={nextLOCode(los)} className={inputClass} /></label>
              <label className="space-y-1 text-xs text-slate-600"><span>Deskripsi LO</span><textarea rows={2} value={newTitle} onChange={event => setNewTitle(event.target.value)} className={inputClass} placeholder="Tuliskan indikator/kompetensi LO…" required /></label>
            </div>
            {!isUAMode && eligibleClasses.length > 1 && <div className="space-y-2 border-t border-purple-100 pt-3">
              <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-1 text-xs font-bold text-purple-900"><Layers size={14} />Kelas penerima</span><button type="button" className="text-[11px] text-purple-700 underline" onClick={() => setSelectedClassIds(eligibleClasses.every(cls => selectedClassIds.includes(cls.id)) ? [classId] : eligibleClasses.map(cls => cls.id))}>Pilih semua / hanya kelas ini</button></div>
              <div className="flex flex-wrap gap-2">{eligibleClasses.map(cls => <button type="button" key={cls.id} onClick={() => setSelectedClassIds(previous => previous.includes(cls.id) ? previous.filter(id => id !== cls.id) : [...previous, cls.id])} className={`${buttonClass} ${selectedClassIds.includes(cls.id) ? 'border-purple-600 bg-purple-600 text-white' : 'bg-white text-slate-700'}`}>
                {selectedClassIds.includes(cls.id) ? <CheckSquare size={13} /> : <Square size={13} />}{cls.name}
              </button>)}</div>
              <p className="text-[11px] text-slate-500">LO dibuat mandiri per kelas. Nilai dan riwayat tidak disalin.</p>
            </div>}
            <div className="flex justify-end"><button type="submit" className={`${buttonClass} border-purple-600 bg-purple-600 text-white`}><Plus size={14} />{busy ? 'Memproses…' : 'Simpan LO'}</button></div>
          </fieldset>
        </form>
        <section className="space-y-3">
          <h3 className="text-xs font-bold uppercase text-slate-700">LO aktif ({los.length})</h3>
          {!los.length && <p className="rounded-xl border border-dashed p-6 text-center text-xs text-slate-500">Belum ada LO pada LG ini.</p>}
          <div className="space-y-2">{los.map((lo, index) => <div key={lo.id} className="space-y-3 rounded-xl border border-slate-200 p-3">
            {editingId === lo.id ? <div className="space-y-2">
              <div className="grid gap-2 md:grid-cols-[120px_1fr]"><input aria-label="Kode LO" disabled={busy} value={code} onChange={event => setCode(event.target.value)} className={inputClass} /><textarea aria-label="Deskripsi LO" disabled={busy} value={title} onChange={event => setTitle(event.target.value)} className={inputClass} /></div>
              <div className="flex justify-end gap-2"><button type="button" disabled={busy} onClick={() => setEditingId(null)} className={buttonClass}>Batal</button><button type="button" disabled={busy} onClick={() => handleSaveEdit(lo)} className={`${buttonClass} bg-emerald-600 text-white`}><Check size={13} />Simpan</button></div>
            </div> : <>
              <div className="flex items-start gap-2"><span className="text-xs text-slate-400">{index + 1}.</span><span className="shrink-0 rounded bg-purple-100 px-2 py-0.5 text-[11px] font-bold text-purple-800">{lo.code}</span><p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-xs font-semibold text-slate-900">{lo.title}</p></div>
              <div className="flex flex-wrap justify-end gap-2">
                {!isUAMode && otherClasses.length > 0 && <button type="button" disabled={busy} className={`${buttonClass} text-indigo-700`} onClick={() => { setCopyingLO(lo); setMovingLO(null); setCopyTargets(otherClasses.map(cls => cls.id)); }}><Copy size={13} />Salin ke kelas lain</button>}
                <button type="button" disabled={busy} className={`${buttonClass} text-purple-700`} onClick={() => { setMovingLO(lo); setCopyingLO(null); setTargetId(''); setReason(''); setPreview(null); setAcknowledged(false); }}><ArrowRightLeft size={13} />Ubah LG Induk</button>
                <button type="button" disabled={busy} className={buttonClass} onClick={() => { setEditingId(lo.id); setCode(lo.code); setTitle(lo.title); }}><Edit2 size={13} />Edit LO</button>
                <button type="button" disabled={busy} className={`${buttonClass} text-rose-700`} onClick={() => handleDelete(lo)}><Trash2 size={13} />Hapus</button>
              </div>
            </>}
          </div>)}</div>
        </section>
        {copyingLO && <section className="space-y-3 rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4">
          <h3 className="text-sm font-bold text-indigo-900">Salin {copyingLO.code} ke kelas lain</h3><p className="text-xs text-slate-700">{copyingLO.title}</p>
          <p className="text-[11px] text-slate-500">Hanya definisi LO yang disalin, bukan siswa, task, nilai, tanggal asesmen, atau riwayat.</p>
          <div className="flex flex-wrap gap-2">{otherClasses.map(cls => <label key={cls.id} className="flex items-center gap-2 rounded-lg border bg-white p-2 text-xs"><input type="checkbox" disabled={busy} checked={copyTargets.includes(cls.id)} onChange={() => setCopyTargets(previous => previous.includes(cls.id) ? previous.filter(id => id !== cls.id) : [...previous, cls.id])} />{cls.name}</label>)}</div>
          <div className="flex justify-end gap-2"><button type="button" disabled={busy} className={buttonClass} onClick={() => setCopyingLO(null)}>Batal</button><button type="button" disabled={busy || !copyTargets.length} className={`${buttonClass} bg-indigo-600 text-white`} onClick={handleCopy}>Salin definisi LO</button></div>
        </section>}
        {movingLO && <section className="space-y-3 rounded-2xl border border-amber-300 bg-amber-50/40 p-4">
          <h3 className="flex items-center gap-2 text-sm font-bold text-amber-950"><ArrowRightLeft size={16} />Ubah LG Induk — {movingLO.code}</h3>
          <p className="text-xs text-slate-700">{movingLO.title}</p>
          <p className="text-[11px] leading-relaxed text-slate-600">Memindahkan LO yang sama beserta seluruh entri nilai formatif, task kelas/UA, dan sumber Sheet khusus LO ini. Bukan menyalin atau membuat LO baru.</p>
          <label className="block space-y-1 text-xs"><span>LG tujuan dalam konteks yang sama (termasuk yang di-hide)</span><select disabled={busy} value={targetId} className={inputClass} onChange={event => { setTargetId(event.target.value); setPreview(null); setAcknowledged(false); }}><option value="">Pilih LG tujuan…</option>{destinationGoals.map(goal => <option key={goal.id} value={goal.id}>{goal.code || 'LG'} — {goal.goalText}</option>)}</select></label>
          {!destinationGoals.length && <p className="text-xs text-amber-800">Belum ada LG tujuan. Pastikan file halaman utama juga diganti agar daftar LG diteruskan ke modal ini.</p>}
          <label className="block space-y-1 text-xs"><span>Alasan koreksi (wajib)</span><textarea maxLength={2000} disabled={busy} rows={2} className={inputClass} value={reason} onChange={event => setReason(event.target.value)} placeholder="Contoh: saat membuat LO, LG yang dipilih keliru." /></label>
          <button type="button" disabled={busy || !targetId} className={`${buttonClass} bg-white text-purple-700`} onClick={checkMove}>Periksa data terdampak</button>
          {preview && <div className="space-y-3 rounded-xl border bg-white p-3 text-xs">
            <p><span className="font-semibold">Dari:</span> {preview.fromLabel}</p><p><span className="font-semibold">Ke:</span> {preview.toLabel}</p>
            <p>{preview.formativeCount} entri nilai · {preview.taskCount} task · {preview.sheetSourceCount} sumber Sheet. ID dan isi nilai tetap.</p>
            <p>Kode di tujuan: {preview.targetCode} · Urutan: {preview.targetOrder}. Kode diberi pembeda jika sudah dipakai.</p>
            <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-2 text-amber-900"><AlertTriangle size={15} className="shrink-0" />Sumatif tetap melekat pada LG, tidak ikut dipindah. LG asal: {preview.sourceSummativeCount} nilai sumatif; LG tujuan: {preview.targetSummativeCount}. Tinjau ulang sumatif secara terpisah bila diperlukan.</p>
            <label className="flex items-start gap-2"><input type="checkbox" disabled={busy} checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} /><span>Saya sudah memeriksa LG tujuan dan memahami sumatif serta laporan yang sudah terbit tidak diubah.</span></label>
          </div>}
          <div className="flex flex-wrap justify-end gap-2"><button type="button" disabled={busy} className={buttonClass} onClick={() => { setMovingLO(null); setPreview(null); }}>Batal</button><button type="button" disabled={busy || !preview || !reason.trim() || !acknowledged} className={`${buttonClass} bg-purple-700 text-white`} onClick={confirmMove}>{busy ? <Loader2 size={14} className="animate-spin" /> : <ArrowRightLeft size={14} />}Konfirmasi Pindah LG</button></div>
        </section>}
      </div>
      <footer className="flex items-center justify-between gap-3 border-t bg-slate-50 p-4"><span className="text-[11px] text-slate-500">{busy ? 'Proses berjalan. Jangan tutup tab atau pindah halaman.' : 'Perubahan hanya untuk konteks kelas/UA dan periode ini.'}</span><button type="button" disabled={busy} onClick={close} className={`${buttonClass} bg-white`}>Selesai</button></footer>
    </div>
  </div>;
}
