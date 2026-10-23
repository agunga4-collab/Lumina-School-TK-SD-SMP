import * as React from "react";
import { useAuth } from "../../context/AuthContext";
import { useAcademicYear } from "../../context/AcademicYearContext";
import { getClasses, getActiveStudents, db } from "../../lib/firebase";
import type { Class, Student } from "../../types";
import { collection, query, where, getDocs, setDoc, doc, deleteDoc, Timestamp, serverTimestamp } from "firebase/firestore";
import type { QueryConstraint } from "firebase/firestore";
import { toast } from "sonner";
import { MessageSquare, Mic, MicOff, Save, Trash2, Plus, Loader2, AlertCircle, RefreshCw, Clock, Search, X, CheckCircle2, History, Calendar } from "lucide-react";
import { isTeacherAssignedToClass } from "../../services/classTeacherAssignmentService";

type Status = "UNSAVED" | "SAVING" | "SAVED" | "FAILED";
interface Creator { uid: string; name: string; email?: string; role: string; }
interface Values { time: string; activityContext: string; anecdote: string; followUp: string; }
interface AnecdoteRow extends Values {
  rowId: string;
  studentId: string;
  studentName: string;
  isDraft: boolean;
  status: Status;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  createdBy?: Creator;
  originalData?: Values;
}
interface HistoryNote extends Values {
  id: string;
  studentId: string;
  studentName: string;
  date: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  createdBy?: Creator;
  nis?: string;
  nisn?: string;
}
interface EditorState { scope: string; row: AnecdoteRow; }
const control = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-60";
const button = "inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer";
const primary = "inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer";
const text = (value: unknown): string => value == null ? "" : String(value);
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
const meaningful = (row: Values) => !!(row.anecdote.trim() || row.activityContext.trim() || row.followUp.trim());
const valuesOf = (row: Values): Values => ({ time: row.time, activityContext: row.activityContext, anecdote: row.anecdote, followUp: row.followUp });
const sameValues = (a: Values, b: Values) => a.time === b.time && a.activityContext === b.activityContext && a.anecdote === b.anecdote && a.followUp === b.followUp;
const localDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
const localTime = () => { const date = new Date(); return `${String(date.getHours()).padStart(2,"0")}.${String(date.getMinutes()).padStart(2,"0")}`; };
const draftKey = (classId: string, date: string) => `anecdote_drafts_${classId}_${date}`;
const newId = () => `${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return Number.isFinite(date.getTime()) && localDate(date) === value;
}
function asDate(value: unknown): Date | null {
  if (!value) return null;
  let result: Date;
  if (typeof (value as Timestamp).toDate === "function") result = (value as Timestamp).toDate();
  else if (value instanceof Date) result = value;
  else if (typeof value === "number") result = new Date(value);
  else if (typeof value === "string") result = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
  else if (typeof (value as { seconds?: number }).seconds === "number") result = new Date((value as { seconds: number }).seconds * 1000);
  else return null;
  return Number.isFinite(result.getTime()) ? result : null;
}
const millis = (value: unknown) => asDate(value)?.getTime() || 0;
const formatDate = (value: unknown) => asDate(value)?.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) || "Tanggal tidak tersedia";
const formatStamp = (value: unknown) => asDate(value)?.toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) || "—";
function timeMinutes(value: string): number {
  const match = /^(\d{1,2})[.:](\d{2})$/.exec(value.trim());
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return -1;
  return Number(match[1])*60 + Number(match[2]);
}
function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase() : name.slice(0,2).toUpperCase();
}
function emptyRow(student: Student): AnecdoteRow {
  return { rowId: `draft_${student.id}_0`, studentId: student.id, studentName: student.name, time: localTime(), activityContext: "", anecdote: "", followUp: "", isDraft: true, status: "UNSAVED" };
}
function readDrafts(key: string): any[] {
  try { const data = JSON.parse(localStorage.getItem(key) || "[]"); return Array.isArray(data) ? data.filter(item => item && typeof item.rowId === "string" && typeof item.studentId === "string") : []; }
  catch { return []; }
}
function persistDrafts(key: string, rows: AnecdoteRow[]) {
  try {
    const drafts = rows.filter(row => meaningful(row) && (row.isDraft || row.status === "UNSAVED" || row.status === "FAILED"))
      .map(row => ({ rowId: row.rowId, studentId: row.studentId, studentName: row.studentName, ...valuesOf(row), isDraft: row.isDraft }));
    if (drafts.length) localStorage.setItem(key, JSON.stringify(drafts));
    else localStorage.removeItem(key);
  } catch { toast.warning("Draft belum dapat disimpan di browser. Simpan catatan sebelum meninggalkan halaman."); }
}
function StatusBadge({ status }: { status: Status }) {
  const color = status === "SAVED" ? "border-emerald-100 bg-emerald-50 text-emerald-700" : status === "FAILED" ? "border-rose-100 bg-rose-50 text-rose-700" : status === "SAVING" ? "border-blue-100 bg-blue-50 text-blue-700" : "border-amber-100 bg-amber-50 text-amber-700";
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${color}`}>{status === "SAVED" ? <CheckCircle2 size={11} /> : status === "SAVING" ? <Loader2 size={11} className="animate-spin" /> : null}{status === "SAVED" ? "Tersimpan" : status === "SAVING" ? "Menyimpan…" : status === "FAILED" ? "Gagal disimpan" : "Draft belum disimpan"}</span>;
}
function ExpandableText({ value, max = 280 }: { value: string; max?: number }) {
  const [expanded, setExpanded] = React.useState(false);
  if (!value.trim()) return <span className="text-slate-400">—</span>;
  return <div><p className="whitespace-pre-wrap break-words leading-relaxed">{value.length > max && !expanded ? `${value.slice(0,max)}…` : value}</p>{value.length > max && <button type="button" aria-expanded={expanded} className="mt-1 rounded text-xs font-bold text-indigo-600 hover:underline focus-visible:ring-2 focus-visible:ring-indigo-500 cursor-pointer" onClick={() => setExpanded(current => !current)}>{expanded ? "Ringkas" : "Lihat selengkapnya"}</button>}</div>;
}

function AnecdoteHistory({ selectedClass, academicYear, students, revision }: {
  selectedClass: Class | null; academicYear: string; students: Student[]; revision: number;
}) {
  const [period, setPeriod] = React.useState<"ALL" | "RANGE">("ALL");
  const [start, setStart] = React.useState("");
  const [end, setEnd] = React.useState("");
  const [applied, setApplied] = React.useState<{ start: string; end: string } | null>(null);
  const [search, setSearch] = React.useState("");
  const [reload, setReload] = React.useState(0);
  const [notes, setNotes] = React.useState<HistoryNote[]>([]);
  const [loadedScope, setLoadedScope] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<{ scope: string; message: string } | null>(null);
  const [shown, setShown] = React.useState(50);
  const classId = selectedClass?.id || "";
  const scope = JSON.stringify([classId, academicYear, period, period === "RANGE" ? applied?.start : "", period === "RANGE" ? applied?.end : ""]);
  const ready = !!classId && !!academicYear && (period === "ALL" || !!applied);
  React.useEffect(() => {
    let cancelled = false;
    setError(null); setLoadedScope(""); setShown(50);
    if (!ready) { setBusy(false); return () => { cancelled = true; }; }
    setBusy(true);
    const load = async () => {
      try {
        const constraints: QueryConstraint[] = [where("classId", "==", classId), where("academicYearId", "==", academicYear)];
        if (period === "RANGE" && applied) {
          const nextDay = new Date(`${applied.end}T00:00:00`);
          nextDay.setDate(nextDay.getDate()+1);
          constraints.push(where("date", ">=", Timestamp.fromDate(new Date(`${applied.start}T00:00:00`))), where("date", "<", Timestamp.fromDate(nextDay)));
        }
        const snapshot = await getDocs(query(collection(db,"class_anecdotes"), ...constraints));
        const result: HistoryNote[] = snapshot.docs.map(item => {
          const value = item.data();
          return { id: item.id, studentId: text(value.studentId), studentName: text(value.studentName) || "Nama tidak tersedia", date: value.date, time: text(value.time), activityContext: text(value.activityContext), anecdote: text(value.anecdote), followUp: text(value.followUp), createdBy: value.createdBy, createdAt: value.createdAt, updatedAt: value.updatedAt, nis: text(value.nis), nisn: text(value.nisn) };
        });
        result.sort((a,b) => millis(b.date)-millis(a.date) || timeMinutes(b.time)-timeMinutes(a.time) || millis(b.createdAt)-millis(a.createdAt) || b.id.localeCompare(a.id));
        if (!cancelled) { setNotes(result); setLoadedScope(scope); }
      } catch (issue) { if (!cancelled) setError({ scope, message: errorMessage(issue) }); }
      finally { if (!cancelled) setBusy(false); }
    };
    void load();
    return () => { cancelled = true; };
  }, [scope, ready, classId, academicYear, period, applied, reload, revision]);
  React.useEffect(() => { setShown(50); }, [search]);
  const roster = React.useMemo(() => new Map(students.map(student => [student.id, student])), [students]);
  const usable = ready && !busy && loadedScope === scope && error?.scope !== scope;
  const filtered = usable ? notes.filter(note => {
    const student = roster.get(note.studentId);
    return `${note.studentName} ${note.nisn || student?.nisn || ""} ${note.nis || student?.nis || ""}`.toLowerCase().includes(search.trim().toLowerCase());
  }) : [];
  const uniqueStudents = new Set(filtered.map(note => note.studentId).filter(Boolean)).size;
  return <section className="space-y-4" aria-label="Riwayat Anekdot">
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-bold text-slate-900">Riwayat Anekdot · {selectedClass?.name || "Pilih kelas"}</h2><p className="mt-1 text-sm text-slate-500">Catatan tersimpan lintas tanggal · Tahun ajaran {academicYear || "—"} · Hanya lihat</p></div><button type="button" className={button} disabled={!ready || busy} onClick={() => setReload(current => current+1)}><RefreshCw size={15} />Segarkan</button></div>
      <div className="grid items-end gap-3 md:grid-cols-2"><label className="block"><span className="mb-1 block text-xs font-bold text-slate-500">Periode riwayat</span><select value={period} onChange={event => setPeriod(event.target.value as "ALL" | "RANGE")} className={control}><option value="ALL">Semua tanggal pada tahun ajaran aktif</option><option value="RANGE">Rentang tanggal observasi</option></select></label><label className="relative block"><span className="mb-1 block text-xs font-bold text-slate-500">Cari siswa</span><div className="relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Nama / NIS / NISN…" className={`${control} pl-9`} /></div></label></div>
      {period === "RANGE" && <div className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]"><label className="block"><span className="mb-1 block text-xs font-bold text-slate-500">Mulai</span><input type="date" className={control} value={start} onChange={event => setStart(event.target.value)} /></label><label className="block"><span className="mb-1 block text-xs font-bold text-slate-500">Sampai</span><input type="date" className={control} value={end} min={start || undefined} onChange={event => setEnd(event.target.value)} /></label><button type="button" className={primary} onClick={() => { if (!validDate(start) || !validDate(end) || start>end) { toast.warning("Isi rentang tanggal yang valid."); return; } setApplied({ start,end }); }}>Terapkan</button></div>}
      {period === "RANGE" && applied && <p className="text-xs text-slate-500">Rentang diterapkan: {formatDate(applied.start)} – {formatDate(applied.end)}. Perubahan tanggal baru berlaku setelah klik Terapkan.</p>}
    </div>
    {error?.scope === scope ? <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><p className="font-bold">Riwayat gagal dimuat, bukan berarti tidak ada catatan.</p><p className="mt-1 whitespace-pre-wrap break-words">{error.message}</p><button type="button" className={`${button} mt-3`} onClick={() => setReload(current => current+1)}>Coba lagi</button></div> : busy ? <div role="status" className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white p-8 text-slate-500"><Loader2 className="animate-spin" size={20} />Memuat riwayat…</div> : !ready ? <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">{!classId ? "Pilih kelas terlebih dahulu." : "Isi dan terapkan rentang tanggal untuk melihat riwayat."}</p> : usable && <>
      <div className="flex flex-wrap gap-3"><div className="rounded-xl border border-slate-200 bg-white px-4 py-3"><p className="text-xs text-slate-500">Catatan sesuai filter</p><p className="text-xl font-bold text-indigo-700">{filtered.length}</p></div><div className="rounded-xl border border-slate-200 bg-white px-4 py-3"><p className="text-xs text-slate-500">Siswa unik tercatat</p><p className="text-xl font-bold text-emerald-700">{uniqueStudents}</p></div></div>
      {!filtered.length ? <p className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">{search.trim() ? "Tidak ada catatan yang sesuai pencarian." : "Belum ada catatan tersimpan untuk kelas/periode ini."}</p> : <>
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white"><table className="w-full min-w-[1120px] border-collapse text-left text-sm"><thead><tr className="border-b border-slate-200 bg-slate-50 text-xs font-bold text-slate-600">{["Tanggal Observasi","Siswa","Waktu","Aktivitas / Konteks","Catatan Anekdot","Tindak Lanjut","Pencatat"].map(label => <th key={label} className="p-3 align-top">{label}</th>)}</tr></thead><tbody>{filtered.slice(0,shown).map(note => {
          const student = roster.get(note.studentId);
          return <tr key={note.id} className="border-b border-slate-100 align-top hover:bg-slate-50/50"><td className="min-w-[130px] p-3 font-semibold text-slate-700">{formatDate(note.date)}</td><td className="min-w-[170px] p-3"><p className="font-bold text-slate-800">{note.studentName}</p><p className="mt-1 text-xs text-slate-400">{note.nisn || student?.nisn || note.nis || student?.nis || ""}</p></td><td className="p-3 whitespace-nowrap text-slate-600">{note.time || "—"}</td><td className="min-w-[160px] p-3 whitespace-pre-wrap break-words text-slate-700">{note.activityContext || "—"}</td><td className="min-w-[280px] p-3 text-slate-700"><ExpandableText value={note.anecdote} /></td><td className="min-w-[220px] p-3 text-slate-700"><ExpandableText value={note.followUp} /></td><td className="min-w-[180px] p-3 text-slate-600"><p className="font-semibold">{note.createdBy?.name || "—"}</p><p className="mt-1 text-xs text-slate-400">Dicatat: {formatStamp(note.createdAt)}</p>{millis(note.updatedAt)>millis(note.createdAt)+1000 && <p className="mt-1 text-xs text-slate-400">Diperbarui: {formatStamp(note.updatedAt)}</p>}</td></tr>;
        })}</tbody></table></div>
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500"><span>{Math.min(shown,filtered.length)} dari {filtered.length} catatan ditampilkan</span>{shown<filtered.length && <button type="button" className={button} onClick={() => setShown(current => current+50)}>Muat lebih banyak</button>}</div>
      </>}
    </>}
  </section>;
}

function NoteEditor({ state, className, observationDate, students, saving, onChange, onSave, onClose }: {
  state: EditorState; className: string; observationDate: string; students: Student[]; saving: boolean;
  onChange: (changes: Partial<AnecdoteRow>) => void; onSave: () => void; onClose: () => void;
}) {
  const dialogRef = React.useRef<HTMLDialogElement>(null);
  const recognition = React.useRef<any>(null);
  const base = React.useRef("");
  const finalText = React.useRef("");
  const [recording, setRecording] = React.useState(false);
  const [preview, setPreview] = React.useState("");
  const onChangeRef = React.useRef(onChange); onChangeRef.current = onChange;
  const rowRef = React.useRef(state.row); rowRef.current = state.row;
  React.useEffect(() => {
    const element = dialogRef.current;
    const previous = document.activeElement as HTMLElement | null;
    if (element && !element.open) element.showModal();
    return () => { const rec=recognition.current; if(rec){ rec.onend=null; rec.onresult=null; rec.onerror=null; try{rec.abort();}catch{} } if(element?.open)element.close(); previous?.focus(); };
  }, []);
  const flushSpeech = () => {
    const rec=recognition.current;
    if (!rec) return;
    rec.onend=null; rec.onresult=null; rec.onerror=null;
    try { rec.abort(); } catch {}
    const value=`${base.current} ${finalText.current}`.replace(/\s+/g," ").trim();
    onChangeRef.current({ anecdote:value });
    recognition.current=null; setRecording(false); setPreview("");
  };
  const close = () => { if(saving)return; if(recognition.current)flushSpeech(); onClose(); };
  const toggleSpeech = () => {
    if (recognition.current) { flushSpeech(); return; }
    const SpeechRecognition=(window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) { toast.error("Browser ini belum mendukung transkripsi suara. Gunakan Chrome atau ketik catatan secara manual."); return; }
    try {
      const rec=new SpeechRecognition();
      rec.continuous=true; rec.interimResults=true; rec.lang="id-ID";
      base.current=rowRef.current.anecdote; finalText.current="";
      rec.onstart=()=>setRecording(true);
      rec.onresult=(event:any)=>{
        let interim=""; let completed="";
        for(let i=event.resultIndex;i<event.results.length;i++) {
          if(event.results[i].isFinal)completed+=` ${event.results[i][0].transcript}`;
          else interim+=` ${event.results[i][0].transcript}`;
        }
        finalText.current+=completed;
        setPreview(`${base.current} ${finalText.current} ${interim}`.replace(/\s+/g," ").trim());
      };
      rec.onerror=(event:any)=>{ toast.error(`Transkripsi suara: ${event.error || "Mikrofon tidak dapat diakses"}`); };
      rec.onend=()=>{
        if(recognition.current!==rec)return;
        onChangeRef.current({ anecdote:`${base.current} ${finalText.current}`.replace(/\s+/g," ").trim() });
        recognition.current=null; setRecording(false); setPreview("");
      };
      recognition.current=rec; rec.start();
    } catch { recognition.current=null; setRecording(false); toast.error("Gagal mengaktifkan mikrofon."); }
  };
  const row=state.row;
  return <dialog ref={dialogRef} aria-label={row.isDraft ? "Tambah Catatan Anekdot" : "Edit Catatan Anekdot"} onCancel={event=>{event.preventDefault();close();}} onClick={event=>{if(event.target===event.currentTarget)close();}} className="m-auto max-h-[92vh] w-[92vw] max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-900/40">
    <form onSubmit={event=>{event.preventDefault();if(!saving&&!recording)onSave();}} className="flex max-h-[92vh] flex-col">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 p-4"><h2 className="flex items-center gap-2 text-lg font-bold"><MessageSquare size={20} className="text-indigo-600" />{row.isDraft?"Tambah Catatan Baru":"Edit Catatan Anekdot"}</h2><button type="button" aria-label="Tutup" className={button} disabled={saving} onClick={close}><X size={16}/></button></header>
      <div className="min-h-0 space-y-4 overflow-y-auto p-5">
        <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs"><div><p className="text-slate-400">Kelas</p><p className="font-bold">{className}</p></div><div><p className="text-slate-400">Tanggal Observasi</p><p className="font-bold">{formatDate(observationDate)}</p></div></div>
        <label className="block"><span className="mb-1 block text-xs font-bold text-slate-500">Siswa</span><select className={control} value={row.studentId} disabled={saving||recording||!row.isDraft} onChange={event=>{const student=students.find(item=>item.id===event.target.value);if(student)onChange({studentId:student.id,studentName:student.name});}}>{!students.some(student=>student.id===row.studentId)&&<option value={row.studentId}>{row.studentName}</option>}{students.map(student=><option key={student.id} value={student.id}>{student.name}</option>)}</select></label>
        <div className="grid gap-3 sm:grid-cols-[140px_1fr]"><label className="block"><span className="mb-1 block text-xs font-bold text-slate-500">Waktu *</span><input required className={control} value={row.time} disabled={saving||recording} placeholder="09.15" onChange={event=>onChange({time:event.target.value})}/></label><label className="block"><span className="mb-1 block text-xs font-bold text-slate-500">Aktivitas / Konteks *</span><input required className={control} value={row.activityContext} disabled={saving||recording} placeholder="Diskusi kelompok, membaca, istirahat…" onChange={event=>onChange({activityContext:event.target.value})}/></label></div>
        <div><div className="mb-1 flex items-center justify-between gap-2"><label htmlFor="anecdote-editor-text" className="text-xs font-bold text-slate-500">Catatan Anekdot *</label><button type="button" disabled={saving} onClick={toggleSpeech} className={`${button} text-xs ${recording?"border-rose-300 bg-rose-50 text-rose-700":"text-indigo-600"}`}>{recording?<MicOff size={14}/>:<Mic size={14}/>} {recording?"Hentikan Mic":"Bicara (Mic)"}</button></div><textarea id="anecdote-editor-text" required rows={6} className={`${control} resize-y leading-relaxed`} value={recording?preview||row.anecdote:row.anecdote} disabled={saving||recording} placeholder="Tuliskan kejadian faktual, objektif, dan terperinci…" onChange={event=>onChange({anecdote:event.target.value})}/>{recording&&<p role="status" className="mt-1 text-xs font-semibold text-rose-600">Mendengarkan Bahasa Indonesia. Hentikan mikrofon sebelum menyimpan.</p>}</div>
        <label className="block"><span className="mb-1 block text-xs font-bold text-slate-500">Tindak Lanjut (opsional)</span><textarea rows={3} className={`${control} resize-y leading-relaxed`} value={row.followUp} disabled={saving||recording} onChange={event=>onChange({followUp:event.target.value})}/></label>
        <p className="text-xs text-slate-400">Perubahan disimpan sebagai draft lokal. Catatan masuk ke server setelah Anda menekan Simpan.</p>
      </div>
      <footer className="flex shrink-0 justify-end gap-2 border-t border-slate-100 bg-slate-50 p-4"><button type="button" className={button} disabled={saving} onClick={close}>Tutup · Simpan Draft</button><button type="submit" className={primary} disabled={saving||recording}>{saving?<Loader2 size={15} className="animate-spin"/>:<Save size={15}/>} {saving?"Menyimpan…":"Simpan Catatan"}</button></footer>
    </form>
  </dialog>;
}

export default function ClassAnecdotePage() {
  const { profile }=useAuth();
  const { activeYear }=useAcademicYear();
  const isElementaryTeacher=!!profile && ["TEACHER","HOMEROOM_TEACHER","BK_MENTOR"].includes(profile.role) && profile.unitId==="ELEMENTARY";
  const isElementaryHead=!!profile && profile.role==="HEAD_UNIT" && profile.unitId==="ELEMENTARY";
  const isSuperAdmin=!!profile && profile.role==="SUPER_ADMIN";
  const isAuthorized=isSuperAdmin||isElementaryHead||isElementaryTeacher;
  const canWrite=isAuthorized;
  const year=activeYear||"";
  const [classes,setClasses]=React.useState<Class[]>([]);
  const [classId,setClassId]=React.useState("");
  const [classBusy,setClassBusy]=React.useState(true);
  const [classError,setClassError]=React.useState("");
  const [classReload,setClassReload]=React.useState(0);
  const [tab,setTab]=React.useState<"DAILY"|"HISTORY">("DAILY");
  const [selectedDate,setSelectedDate]=React.useState(()=>localDate());
  const [students,setStudents]=React.useState<Student[]>([]);
  const [rows,setRows]=React.useState<AnecdoteRow[]>([]);
  const rowsRef=React.useRef<AnecdoteRow[]>([]);
  const [dailyBusy,setDailyBusy]=React.useState(false);
  const [dailyError,setDailyError]=React.useState<{scope:string;message:string}|null>(null);
  const [loadedScope,setLoadedScope]=React.useState("");
  const [dailyReload,setDailyReload]=React.useState(0);
  const [historyRevision,setHistoryRevision]=React.useState(0);
  const [editor,setEditor]=React.useState<EditorState|null>(null);
  const editorRef=React.useRef<EditorState|null>(null);
  const [savingIds,setSavingIds]=React.useState<Set<string>>(new Set());
  const locks=React.useRef<Set<string>>(new Set());
  const [savingAll,setSavingAll]=React.useState(false);
  const bulkLock=React.useRef(false);
  const selectedClass=classes.find(item=>item.id===classId)||null;
  const scope=JSON.stringify([classId,year,selectedDate]);
  const scopeRef=React.useRef(scope);scopeRef.current=scope;
  const key=draftKey(classId,selectedDate);
  const locked=savingIds.size>0||savingAll;
  const readyDaily=loadedScope===scope&&!dailyBusy&&dailyError?.scope!==scope;
  const dailyRows=readyDaily?rows:[];
  const dailyStudents=readyDaily?students:[];
  const canManage=(row:AnecdoteRow)=>canWrite&&(row.isDraft||!row.createdBy?.uid||row.createdBy.uid===profile?.uid||isSuperAdmin);
  const setDailyRows=(next:AnecdoteRow[],persist=true)=>{rowsRef.current=next;setRows(next);if(persist)persistDrafts(key,next);};
  const selectEditor=(next:EditorState|null)=>{editorRef.current=next;setEditor(next);};

  React.useEffect(()=>{
    let cancelled=false;
    setClasses([]);setClassBusy(true);setClassError("");
    if(!profile||!year||!isAuthorized){setClassBusy(false);return()=>{cancelled=true;};}
    getClasses().then(all=>{
      if(cancelled)return;
      let list=(all||[]).filter(item=>item.unitId==="ELEMENTARY"&&item.status!=="archived"&&item.academicYear===year);
      if(!isSuperAdmin&&!isElementaryHead&&!isElementaryTeacher)list=list.filter(item=>isTeacherAssignedToClass(item,profile.uid));
      setClasses(list);setClassId(previous=>list.some(item=>item.id===previous)?previous:list[0]?.id||"");
    }).catch(error=>{if(!cancelled)setClassError(errorMessage(error));}).finally(()=>{if(!cancelled)setClassBusy(false);});
    return()=>{cancelled=true;};
  },[profile,year,isAuthorized,isSuperAdmin,isElementaryHead,isElementaryTeacher,classReload]);

  React.useEffect(()=>{
    let cancelled=false;
    setDailyError(null);setLoadedScope("");selectEditor(null);
    if(!isAuthorized||!selectedClass||!year||!validDate(selectedDate)){setDailyBusy(false);return()=>{cancelled=true;};}
    const currentClass=selectedClass;
    setDailyBusy(true);
    const load=async()=>{
      try {
        const start=new Date(`${selectedDate}T00:00:00`);const end=new Date(start);end.setDate(end.getDate()+1);
        const [roster,snapshot]=await Promise.all([
          getActiveStudents(currentClass.id,year),
          getDocs(query(collection(db,"class_anecdotes"),where("classId","==",currentClass.id),where("academicYearId","==",year),where("date",">=",Timestamp.fromDate(start)),where("date","<",Timestamp.fromDate(end))))
        ]);
        if(cancelled)return;
        const list=roster||[];
        const saved=snapshot.docs.map(item=>({...item.data(),id:item.id})) as any[];
        const drafts=readDrafts(key);
        const next:AnecdoteRow[]=[];
        for(const student of list){
          const docs=saved.filter(item=>item.studentId===student.id);
          for(const savedNote of docs){
            const originalData:Values={time:text(savedNote.time),activityContext:text(savedNote.activityContext),anecdote:text(savedNote.anecdote),followUp:text(savedNote.followUp)};
            const draft=drafts.find(item=>item.rowId===savedNote.id);
            const values=draft?{time:text(draft.time),activityContext:text(draft.activityContext),anecdote:text(draft.anecdote),followUp:text(draft.followUp)}:originalData;
            next.push({rowId:savedNote.id,studentId:student.id,studentName:student.name,...values,isDraft:false,status:sameValues(values,originalData)?"SAVED":"UNSAVED",createdAt:savedNote.createdAt,updatedAt:savedNote.updatedAt,createdBy:savedNote.createdBy,originalData});
          }
          for(const draft of drafts.filter(item=>item.studentId===student.id&&item.isDraft&&!docs.some(note=>note.id===item.rowId))){
            next.push({rowId:draft.rowId,studentId:student.id,studentName:student.name,time:text(draft.time)||localTime(),activityContext:text(draft.activityContext),anecdote:text(draft.anecdote),followUp:text(draft.followUp),isDraft:true,status:"UNSAVED"});
          }
          if(!next.some(item=>item.studentId===student.id))next.push(emptyRow(student));
        }
        next.sort((a,b)=>a.studentName.localeCompare(b.studentName,"id")||timeMinutes(a.time)-timeMinutes(b.time)||a.rowId.localeCompare(b.rowId));
        rowsRef.current=next;setRows(next);setStudents(list);setLoadedScope(scope);
      }catch(error){if(!cancelled)setDailyError({scope,message:errorMessage(error)});}
      finally{if(!cancelled)setDailyBusy(false);}
    };
    void load();return()=>{cancelled=true;};
  },[scope,selectedClass,year,selectedDate,isAuthorized,key,dailyReload]);

  const updateEditor=(changes:Partial<AnecdoteRow>)=>{
    const current=editorRef.current;if(!current||current.scope!==scopeRef.current)return;
    let row={...current.row,...changes};
    row.status=!row.isDraft&&row.originalData&&sameValues(row,row.originalData)?"SAVED":"UNSAVED";
    const next={scope:current.scope,row};editorRef.current=next;setEditor(next);
    const without=rowsRef.current.filter(item=>item.rowId!==row.rowId);
    setDailyRows([...without,row]);
  };
  const openAdd=(studentId?:string)=>{
    if(!canWrite||!readyDaily||locks.current.size||bulkLock.current)return;
    const student=students.find(item=>item.id===studentId)||students[0];
    if(!student){toast.warning("Tidak ada siswa aktif pada kelas ini.");return;}
    const placeholder=rowsRef.current.find(item=>item.studentId===student.id&&item.isDraft&&!meaningful(item));
    const row=placeholder?{...placeholder,time:localTime()}:{...emptyRow(student),rowId:`draft_${student.id}_${newId()}`};
    selectEditor({scope,row});
  };
  const closeEditor=()=>{selectEditor(null);};
  const validate=(row:AnecdoteRow)=>{
    if(!row.anecdote.trim())return"Catatan anekdot wajib diisi.";
    if(!row.time.trim())return"Waktu wajib diisi.";
    if(!row.activityContext.trim())return"Aktivitas/Konteks wajib diisi.";
    return"";
  };
  const saveNote=async(row:AnecdoteRow,quiet=false):Promise<boolean>=>{
    if(!selectedClass||!profile||!year||!canManage(row)||scope!==scopeRef.current)return false;
    if(locks.current.has(row.rowId))return false;
    const issue=validate(row);if(issue){if(!quiet)toast.warning(issue);return false;}
    const saveScope=scope;const saveKey=key;const currentClass=selectedClass;
    locks.current.add(row.rowId);setSavingIds(new Set(locks.current));
    const wasDraft=row.isDraft||row.rowId.startsWith("draft_");
    try {
      const id=wasDraft?`anecdote_${currentClass.id}_${row.studentId}_${newId()}`:row.rowId;
      const creator:Creator=row.createdBy||{uid:profile.uid,name:profile.displayName||profile.email||"",email:profile.email||"",role:profile.role};
      const payload={studentId:row.studentId,studentName:row.studentName,classId:currentClass.id,className:currentClass.name,unit:"ELEMENTARY",academicYearId:year,date:Timestamp.fromDate(new Date(`${selectedDate}T00:00:00`)),time:row.time.trim(),activityContext:row.activityContext.trim(),anecdote:row.anecdote.trim(),followUp:row.followUp.trim()||null,createdBy:creator,createdAt:wasDraft?serverTimestamp():row.createdAt||serverTimestamp(),updatedAt:serverTimestamp()};
      await setDoc(doc(db,"class_anecdotes",id),payload);
      if(scopeRef.current===saveScope){
        const now=Timestamp.now();
        const saved:AnecdoteRow={...row,rowId:id,time:payload.time,activityContext:payload.activityContext,anecdote:payload.anecdote,followUp:payload.followUp||"",isDraft:false,status:"SAVED",createdAt:row.createdAt||now,updatedAt:now,createdBy:creator,originalData:{time:payload.time,activityContext:payload.activityContext,anecdote:payload.anecdote,followUp:payload.followUp||""}};
        const next=[...rowsRef.current.filter(item=>item.rowId!==row.rowId),saved];
        rowsRef.current=next;setRows(next);persistDrafts(saveKey,next);
      }
      setHistoryRevision(current=>current+1);
      if(!quiet)toast.success(`Catatan untuk ${row.studentName} berhasil disimpan.`);
      return true;
    }catch(error){
      if(scopeRef.current===saveScope){const next=rowsRef.current.map(item=>item.rowId===row.rowId?{...item,status:"FAILED" as const}:item);rowsRef.current=next;setRows(next);persistDrafts(saveKey,next);}
      if(!quiet)toast.error(`Gagal menyimpan: ${errorMessage(error)}`);
      return false;
    }finally{locks.current.delete(row.rowId);setSavingIds(new Set(locks.current));}
  };
  const saveEditor=async()=>{
    const current=editorRef.current;
    if(!current||current.scope!==scope||locks.current.size||bulkLock.current)return;
    if(await saveNote(current.row))closeEditor();
  };
  const saveAll=async()=>{
    if(bulkLock.current||locks.current.size)return;
    const pending=rowsRef.current.filter(row=>meaningful(row)&&row.status!=="SAVED"&&canManage(row));
    if(!pending.length)return;
    bulkLock.current=true;setSavingAll(true);
    let success=0;
    try{for(const row of pending){if(await saveNote(row,true))success++;}setHistoryRevision(current=>current+1);if(success)toast.success(`${success} catatan berhasil disimpan.`);if(success<pending.length)toast.error(`${pending.length-success} catatan belum tersimpan. Periksa isian dan izin akses.`);}
    finally{bulkLock.current=false;setSavingAll(false);}
  };
  const removeNote=async(row:AnecdoteRow)=>{
    if(!canManage(row)||locks.current.size||bulkLock.current)return;
    if(!window.confirm(`Hapus ${row.isDraft?"draft":"catatan"} anekdot untuk ${row.studentName}?`))return;
    const removeScope=scope;
    locks.current.add(row.rowId);setSavingIds(new Set(locks.current));
    try{
      if(!row.isDraft)await deleteDoc(doc(db,"class_anecdotes",row.rowId));
      if(scopeRef.current===removeScope){const next=rowsRef.current.filter(item=>item.rowId!==row.rowId);const student=students.find(item=>item.id===row.studentId);if(student&&!next.some(item=>item.studentId===row.studentId))next.push(emptyRow(student));setDailyRows(next);}
      setHistoryRevision(current=>current+1);toast.success("Catatan berhasil dihapus.");
    }catch(error){toast.error(`Gagal menghapus: ${errorMessage(error)}`);}
    finally{locks.current.delete(row.rowId);setSavingIds(new Set(locks.current));}
  };
  const pending=dailyRows.filter(row=>meaningful(row)&&row.status!=="SAVED"&&canManage(row));
  const savedCount=dailyRows.filter(row=>!row.isDraft).length;

  if(!isAuthorized)return <div className="mx-auto my-12 max-w-xl rounded-2xl border border-slate-200 bg-white p-8 text-center"><AlertCircle size={32} className="mx-auto mb-3 text-rose-500"/><h1 className="text-lg font-bold text-slate-800">Akses Terbatas</h1><p className="mt-2 text-sm text-slate-500">Halaman ini hanya untuk Guru Elementary, Kepala SD, atau Admin yang berwenang.</p></div>;
  return <div className="mx-auto max-w-[1600px] space-y-5 px-4 py-6" id="class-anecdote-page-wrapper">
    <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div><h1 className="flex items-center gap-2 text-2xl font-extrabold text-slate-900"><span className="rounded-lg bg-indigo-50 p-2 text-indigo-600"><MessageSquare size={24}/></span>Anekdot Kelas</h1><p className="mt-2 max-w-2xl text-sm text-slate-500">Catat observasi siswa dan lihat kembali isi anekdot yang sudah tersimpan pada tanggal-tanggal sebelumnya.</p></div>{canWrite&&<button type="button" className={primary} disabled={!readyDaily||!students.length||locked} onClick={()=>{setTab("DAILY");openAdd();}}><Plus size={17}/>Tambah Catatan</button>}</header>
    <div className="flex w-fit max-w-full flex-wrap gap-1 rounded-2xl border border-slate-200 bg-white p-1" aria-label="Tampilan Anekdot Kelas">{([{id:"DAILY",label:"Catatan Harian"},{id:"HISTORY",label:"Riwayat Anekdot"}] as const).map(item=><button key={item.id} type="button" aria-pressed={tab===item.id} disabled={locked} onClick={()=>setTab(item.id)} className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-bold transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 cursor-pointer ${tab===item.id?"bg-indigo-600 text-white":"text-slate-600 hover:bg-indigo-50"}`}>{item.id==="HISTORY"?<History size={15}/>:<Calendar size={15}/>} {item.label}</button>)}</div>
    <section className="flex flex-wrap items-end gap-4 rounded-2xl border border-slate-200 bg-white p-4"><label className="block min-w-[220px] flex-1"><span className="mb-1 block text-xs font-bold text-slate-500">Kelas Aktif · {year||"—"}</span><select className={control} value={classId} disabled={classBusy||locked} onChange={event=>{if(locks.current.size||bulkLock.current)return;setClassId(event.target.value);}}>{!classes.length&&<option value="">{classBusy?"Memuat kelas…":"Tidak ada kelas aktif"}</option>}{classes.map(item=><option key={item.id} value={item.id}>{item.name} ({item.academicYear})</option>)}</select></label>{tab==="DAILY"&&<><label className="block min-w-[190px]"><span className="mb-1 block text-xs font-bold text-slate-500">Tanggal Observasi Harian</span><input type="date" className={control} value={selectedDate} disabled={locked} onChange={event=>{if(validDate(event.target.value)&&!locks.current.size&&!bulkLock.current)setSelectedDate(event.target.value);}}/></label><button type="button" className={button} disabled={dailyBusy||locked||!selectedClass} onClick={()=>setDailyReload(current=>current+1)}><RefreshCw size={15}/>Segarkan</button></>}</section>
    {classError&&<div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><p>Gagal memuat kelas: {classError}</p><button type="button" className={`${button} mt-2`} onClick={()=>setClassReload(current=>current+1)}>Coba lagi</button></div>}
    {tab==="HISTORY"?<AnecdoteHistory selectedClass={selectedClass} academicYear={year} students={students} revision={historyRevision}/>:<>
      {dailyError?.scope===scope?<div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><p className="font-bold">Catatan harian gagal dimuat.</p><p className="mt-1 break-words">{dailyError.message}</p><button type="button" className={`${button} mt-2`} onClick={()=>setDailyReload(current=>current+1)}>Coba lagi</button></div>:dailyBusy||classBusy?<div role="status" className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white p-10 text-sm text-slate-500"><Loader2 size={22} className="animate-spin"/>Memuat observasi kelas…</div>:!selectedClass?<p className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">Pilih kelas aktif terlebih dahulu.</p>:readyDaily&&<>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4"><p className="text-sm text-slate-600">{dailyStudents.length} siswa · <span className="font-semibold text-emerald-700">{savedCount} catatan tersimpan</span> · <span className="text-amber-700">{pending.length} draft berisi</span></p>{pending.length>0&&<button type="button" className={primary} disabled={locked} onClick={()=>void saveAll()}>{savingAll?<Loader2 size={15} className="animate-spin"/>:<Save size={15}/>}Simpan Semua Draft ({pending.length})</button>}</div>
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white"><table className="w-full min-w-[850px] border-collapse text-left text-sm"><thead><tr className="border-b border-slate-200 bg-slate-50 text-xs font-bold text-slate-500"><th className="w-14 p-4 text-center">No</th><th className="w-64 p-4">Siswa</th><th className="p-4">Catatan Anekdot · {formatDate(selectedDate)}</th><th className="w-36 p-4 text-center">Aksi</th></tr></thead><tbody>{dailyStudents.map((student,index)=>{
          const studentNotes=dailyRows.filter(row=>row.studentId===student.id&&meaningful(row));
          return <tr key={student.id} className="border-b border-slate-100 align-top hover:bg-slate-50/30"><td className="p-4 text-center font-bold text-slate-400">{index+1}</td><td className="p-4"><div className="flex items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-indigo-100 bg-indigo-50 font-bold text-indigo-600">{initials(student.name)}</span><div><p className="font-bold text-slate-900">{student.name}</p><p className="mt-1 text-xs text-slate-400">NISN: {student.nisn||"—"}</p></div></div><p className="mt-2 text-xs text-slate-400">{studentNotes.length?`${studentNotes.length} catatan`:"Belum ada catatan pada tanggal ini"}</p></td><td className="space-y-3 p-4">{!studentNotes.length?<p className="py-2 text-sm italic text-slate-400">Belum ada catatan observasi untuk tanggal ini.</p>:studentNotes.map(note=><article key={note.rowId} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex flex-wrap items-center gap-2"><span className="inline-flex items-center gap-1 rounded-full border border-indigo-100 bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-700"><Clock size={11}/>{note.time}</span><StatusBadge status={savingIds.has(note.rowId)?"SAVING":note.status}/></div>{canManage(note)&&<div className="flex items-center gap-1"><button type="button" className={`${button} px-2 py-1 text-xs`} disabled={locked} onClick={()=>selectEditor({scope,row:{...note}})}>Edit</button>{note.status!=="SAVED"&&<button type="button" className={`${button} px-2 py-1 text-xs text-indigo-600`} disabled={locked} onClick={()=>void saveNote(note)}>Simpan</button>}<button type="button" aria-label={`Hapus catatan ${student.name}`} className={`${button} px-2 py-1 text-rose-600`} disabled={locked} onClick={()=>void removeNote(note)}><Trash2 size={13}/></button></div>}</div><p className="text-sm font-semibold text-slate-700">{note.activityContext||"Konteks belum diisi"}</p><div className="text-sm text-slate-700"><ExpandableText value={note.anecdote}/></div>{note.followUp&&<div className="rounded-xl border border-amber-100 bg-amber-50/50 p-3 text-sm text-slate-700"><p className="mb-1 text-xs font-bold text-amber-800">Tindak Lanjut</p><ExpandableText value={note.followUp}/></div>}<p className="border-t border-slate-100 pt-2 text-xs text-slate-400">{note.isDraft?"Draft lokal, belum tersimpan di server.":`Dicatat oleh: ${note.createdBy?.name||"—"} · ${formatStamp(note.createdAt)}`}{!note.isDraft&&millis(note.updatedAt)>millis(note.createdAt)+1000?` · Diubah ${formatStamp(note.updatedAt)}`:""}</p></article>)}</td><td className="p-4 text-center"><button type="button" className={`${button} text-xs text-indigo-600`} disabled={locked} onClick={()=>openAdd(student.id)}><Plus size={14}/>Catatan</button></td></tr>;
        })}{!dailyStudents.length&&<tr><td colSpan={4} className="p-10 text-center text-slate-500">Tidak ada siswa aktif pada kelas ini.</td></tr>}</tbody></table></div>
      </>}
    </>}
    {editor&&editor.scope===scope&&selectedClass&&<NoteEditor key={editor.row.rowId} state={editor} className={selectedClass.name} observationDate={selectedDate} students={students} saving={savingIds.has(editor.row.rowId)} onChange={updateEditor} onSave={()=>void saveEditor()} onClose={closeEditor}/>}
  </div>;
}
