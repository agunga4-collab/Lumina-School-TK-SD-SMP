import * as React from "react";
import { useAuth } from "../../context/AuthContext";
import { useAcademicYear } from "../../context/AcademicYearContext";
import { getClasses, getActiveStudents, db } from "../../lib/firebase";
import type { Class, Student } from "../../types";
import { collection, query, where, getDocs, setDoc, doc, deleteDoc, Timestamp, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner";
import { MessageSquare, Mic, MicOff, Save, Trash2, Plus, Loader2, AlertCircle, RefreshCw, Clock, X, CheckCircle2, History, ChevronDown, ChevronUp } from "lucide-react";
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

// Match identifiers only. Names are never used to attach a note to a child.
function groupHistoryNotes(notes: HistoryNote[], students: Student[]) {
  const aliases = new Map<string, Set<string>>();
  for (const student of students) {
    for (const raw of [student.id, student.nis, student.nisn]) {
      const alias = text(raw).trim();
      if (!alias) continue;
      const owners = aliases.get(alias) || new Set<string>();
      owners.add(student.id); aliases.set(alias, owners);
    }
  }
  const byStudent = new Map<string, HistoryNote[]>();
  let unmatchedCount = 0;
  for (const note of notes) {
    const matches = new Set<string>();
    for (const raw of [note.studentId, note.nis, note.nisn]) {
      const alias = text(raw).trim();
      if (alias) aliases.get(alias)?.forEach(id => matches.add(id));
    }
    if (matches.size !== 1) { unmatchedCount++; continue; }
    const studentId = [...matches][0];
    const list = byStudent.get(studentId) || [];
    list.push(note); byStudent.set(studentId, list);
  }
  for (const list of byStudent.values()) {
    list.sort((a,b) => millis(b.date)-millis(a.date) || timeMinutes(b.time)-timeMinutes(a.time) || millis(b.createdAt)-millis(a.createdAt) || b.id.localeCompare(a.id));
  }
  return { byStudent, unmatchedCount };
}

function StudentHistoryPanel({ studentName, academicYear, observationDate, notes, busy, error, onRetry }: {
  studentName: string; academicYear: string; observationDate: string;
  notes: HistoryNote[]; busy: boolean; error: string; onRetry: () => void;
}) {
  const [shown, setShown] = React.useState(5);
  return <section className="space-y-3 rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4" aria-label={`Riwayat catatan ${studentName}`}>
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="flex items-center gap-2 text-sm font-bold text-indigo-950"><History size={16}/>Riwayat catatan · {studentName}</h3><p className="mt-1 text-xs text-slate-500">Catatan tersimpan lintas tanggal · TA {academicYear} · Hanya lihat</p></div><button type="button" className={`${button} text-xs`} disabled={busy} onClick={onRetry}><RefreshCw size={13} className={busy ? "animate-spin" : ""}/>Segarkan riwayat</button></header>
    {error ? <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><p className="font-bold">Riwayat belum dapat dimuat, bukan berarti tidak ada catatan.</p><p className="mt-1 whitespace-pre-wrap break-words text-xs">{error}</p><button type="button" className={`${button} mt-2 text-xs`} onClick={onRetry}>Coba lagi</button></div> : busy ? <p role="status" className="flex items-center gap-2 rounded-xl bg-white p-4 text-sm text-slate-500"><Loader2 size={17} className="animate-spin"/>Memuat catatan tersimpan…</p> : !notes.length ? <p className="rounded-xl border border-dashed border-indigo-200 bg-white p-4 text-sm text-slate-500">Belum ada catatan tersimpan untuk anak ini pada tahun ajaran {academicYear}. Draft yang belum disimpan tidak masuk riwayat.</p> : <>
      <div className="space-y-3">{notes.slice(0,shown).map(note => {
        const date = asDate(note.date);
        const sameDay = !!date && localDate(date) === observationDate;
        return <article key={note.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3"><p className="font-bold text-slate-800">{formatDate(note.date)}<span className="ml-2 inline-flex items-center gap-1 text-xs font-normal text-slate-500"><Clock size={12}/>{note.time || "—"}</span></p>{sameDay && <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">Tanggal yang dipilih</span>}</div>
          {note.activityContext && <div className="mt-3"><p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Aktivitas / Konteks</p><p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-700">{note.activityContext}</p></div>}
          <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]"><div className="min-w-0"><p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">Catatan anekdot</p><div className="text-sm text-slate-700"><ExpandableText value={note.anecdote}/></div></div><div className="min-w-0"><p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">Tindak lanjut</p><div className="text-sm text-slate-700"><ExpandableText value={note.followUp}/></div></div></div>
          <footer className="mt-4 flex flex-wrap gap-x-5 gap-y-1 border-t border-slate-100 pt-3 text-xs text-slate-500"><p>Pencatat: <span className="font-semibold text-slate-600">{note.createdBy?.name || "Belum tersedia"}</span></p><p>Dicatat: {formatStamp(note.createdAt)}</p>{millis(note.updatedAt)>millis(note.createdAt)+1000 && <p>Diperbarui: {formatStamp(note.updatedAt)}</p>}</footer>
        </article>;
      })}</div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500"><p>{Math.min(shown,notes.length)} dari {notes.length} catatan · Terbaru di atas</p>{shown < notes.length && <button type="button" className={`${button} text-xs`} onClick={() => setShown(current => current+5)}>Tampilkan 5 catatan berikutnya</button>}</div>
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

  // One class/year read is shared by every expanded child; no per-child N+1 query.
  const historyContext=JSON.stringify([profile?.uid || "",classId,year]);
  const [openHistory,setOpenHistory]=React.useState<{context:string;ids:Set<string>}>({context:"",ids:new Set()});
  const [historyNotes,setHistoryNotes]=React.useState<HistoryNote[]>([]);
  const [historyBusy,setHistoryBusy]=React.useState(false);
  const [historyError,setHistoryError]=React.useState<{scope:string;message:string}|null>(null);
  const [historyLoadedScope,setHistoryLoadedScope]=React.useState("");
  const [historyReload,setHistoryReload]=React.useState(0);
  const openHistoryIds=openHistory.context===historyContext ? openHistory.ids : new Set<string>();
  const hasOpenHistory=openHistoryIds.size>0;
  const historyReadScope=JSON.stringify([historyContext,historyRevision,historyReload]);
  const historyReady=historyLoadedScope===historyReadScope&&!historyBusy&&historyError?.scope!==historyReadScope;
  React.useEffect(()=>{setOpenHistory({context:historyContext,ids:new Set()});},[historyContext]);
  React.useEffect(()=>{
    let cancelled=false;
    setHistoryError(null);setHistoryLoadedScope("");
    if(!hasOpenHistory||!isAuthorized||!selectedClass||!year||locked){setHistoryBusy(false);return()=>{cancelled=true;};}
    const currentClassId=selectedClass.id;
    setHistoryBusy(true);
    const load=async()=>{
      try{
        const snapshot=await getDocs(query(collection(db,"class_anecdotes"),where("classId","==",currentClassId),where("academicYearId","==",year)));
        const result:HistoryNote[]=snapshot.docs.map(item=>{
          const value=item.data();
          return {id:item.id,studentId:text(value.studentId),studentName:text(value.studentName),date:value.date,time:text(value.time),activityContext:text(value.activityContext),anecdote:text(value.anecdote),followUp:text(value.followUp),createdBy:value.createdBy,createdAt:value.createdAt,updatedAt:value.updatedAt,nis:text(value.nis),nisn:text(value.nisn)};
        });
        if(!cancelled){setHistoryNotes(result);setHistoryLoadedScope(historyReadScope);}
      }catch(error){if(!cancelled)setHistoryError({scope:historyReadScope,message:errorMessage(error)});}
      finally{if(!cancelled)setHistoryBusy(false);}
    };
    void load();return()=>{cancelled=true;};
  },[hasOpenHistory,isAuthorized,selectedClass,year,historyReadScope,locked]);
  const historyGroups=React.useMemo(()=>historyReady&&readyDaily ? groupHistoryNotes(historyNotes,students) : {byStudent:new Map<string,HistoryNote[]>(),unmatchedCount:0},[historyReady,readyDaily,historyNotes,students]);
  const toggleHistory=(studentId:string)=>{
    setOpenHistory(previous=>{
      const ids=previous.context===historyContext ? new Set(previous.ids) : new Set<string>();
      if(ids.has(studentId))ids.delete(studentId);else ids.add(studentId);
      return {context:historyContext,ids};
    });
  };
  const refreshHistory=()=>setHistoryReload(current=>current+1);
  const sortedStudents=[...dailyStudents].sort((a,b)=>a.name.localeCompare(b.name,"id"));

  if(!isAuthorized)return <div className="mx-auto my-12 max-w-xl rounded-2xl border border-slate-200 bg-white p-8 text-center"><AlertCircle size={32} className="mx-auto mb-3 text-rose-500"/><h1 className="text-lg font-bold text-slate-800">Akses Terbatas</h1><p className="mt-2 text-sm text-slate-500">Halaman ini hanya untuk Guru Elementary, Kepala SD, atau Admin yang berwenang.</p></div>;
  return <div className="mx-auto max-w-[1600px] space-y-5 px-4 py-6" id="class-anecdote-page-wrapper">
    <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div><h1 className="flex items-center gap-2 text-2xl font-extrabold text-slate-900"><span className="rounded-lg bg-indigo-50 p-2 text-indigo-600"><MessageSquare size={24}/></span>Anekdot Kelas</h1><p className="mt-2 max-w-2xl text-sm text-slate-500">Catat observasi harian dan buka riwayat catatan langsung di bawah nama setiap anak. Tidak perlu berpindah tab.</p></div>{canWrite&&<button type="button" className={primary} disabled={!readyDaily||!students.length||locked} onClick={()=>openAdd()}><Plus size={17}/>Tambah Catatan</button>}</header>
    <section className="flex flex-wrap items-end gap-4 rounded-2xl border border-slate-200 bg-white p-4"><label className="block min-w-[220px] flex-1"><span className="mb-1 block text-xs font-bold text-slate-500">Kelas Aktif · {year||"—"}</span><select className={control} value={classId} disabled={classBusy||locked} onChange={event=>{if(locks.current.size||bulkLock.current)return;setClassId(event.target.value);}}>{!classes.length&&<option value="">{classBusy?"Memuat kelas…":"Tidak ada kelas aktif"}</option>}{classes.map(item=><option key={item.id} value={item.id}>{item.name} ({item.academicYear})</option>)}</select></label><label className="block min-w-[190px]"><span className="mb-1 block text-xs font-bold text-slate-500">Tanggal Observasi Harian</span><input type="date" className={control} value={selectedDate} disabled={locked} onChange={event=>{if(validDate(event.target.value)&&!locks.current.size&&!bulkLock.current)setSelectedDate(event.target.value);}}/></label><button type="button" className={button} disabled={dailyBusy||locked||!selectedClass} onClick={()=>{setDailyReload(current=>current+1);refreshHistory();}}><RefreshCw size={15} className={dailyBusy?"animate-spin":""}/>Segarkan</button></section>
    {classError&&<div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><p className="font-bold">Daftar kelas belum dapat dimuat.</p><p className="mt-1 break-words">{classError}</p><button type="button" className={`${button} mt-3`} onClick={()=>setClassReload(current=>current+1)}>Coba lagi</button></div>}
    {dailyError?.scope===scope&&<div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><p className="font-bold">Catatan harian gagal dimuat, bukan berarti tidak ada catatan.</p><p className="mt-1 whitespace-pre-wrap break-words">{dailyError.message}</p><button type="button" className={`${button} mt-3`} onClick={()=>setDailyReload(current=>current+1)}>Coba lagi</button></div>}
    {classBusy||dailyBusy?<div role="status" className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500"><Loader2 size={20} className="animate-spin"/>Memuat daftar siswa dan catatan harian…</div>:!selectedClass?<p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Pilih kelas aktif terlebih dahulu.</p>:readyDaily&&<>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4"><p className="text-sm text-slate-600">{dailyStudents.length} siswa · <span className="font-semibold text-emerald-700">{savedCount} catatan tersimpan</span> · <span className="font-semibold text-amber-700">{pending.length} draft berisi</span><span className="mt-1 block text-xs text-slate-400">Ringkasan untuk {formatDate(selectedDate)}. Tombol riwayat menampilkan catatan tersimpan lintas tanggal pada tahun ajaran aktif.</span></p></div>
      {historyReady&&historyGroups.unmatchedCount>0&&<p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Ada {historyGroups.unmatchedCount} catatan kelas yang belum dapat dipetakan ke daftar siswa aktif melalui ID/NIS/NISN yang unik. Datanya tidak dihapus dan tidak dipasangkan berdasarkan nama. Periksa relasi siswa sebelum mengubah data.</p>}
      {!dailyStudents.length?<p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Belum ada siswa aktif pada kelas/tahun ajaran ini.</p>:<div className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="overflow-x-auto"><table className="w-full min-w-[760px] border-collapse text-left text-sm"><thead><tr className="border-b border-slate-200 bg-slate-50 text-xs font-bold text-slate-500"><th className="w-12 p-4">No.</th><th className="w-[280px] p-4">Siswa</th><th className="p-4">Catatan Anekdot · {formatDate(selectedDate)}</th><th className="w-32 p-4 text-right">Aksi</th></tr></thead><tbody>{sortedStudents.map((student,index)=>{
        const notes=dailyRows.filter(row=>row.studentId===student.id&&(!row.isDraft||meaningful(row))).sort((a,b)=>timeMinutes(a.time)-timeMinutes(b.time)||a.rowId.localeCompare(b.rowId));
        const expanded=openHistoryIds.has(student.id);
        const previousNotes=historyGroups.byStudent.get(student.id)||[];
        const panelId=`anecdote-history-${encodeURIComponent(student.id)}`;
        const currentHistoryError=historyError?.scope===historyReadScope?historyError.message:"";
        return <React.Fragment key={student.id}>
          <tr className={`border-b border-slate-100 align-top ${expanded?"bg-indigo-50/20":""}`}><td className="p-4 font-semibold text-slate-400">{index+1}</td><td className="p-4"><div className="flex items-start gap-3"><span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-indigo-100 bg-indigo-50 text-xs font-bold text-indigo-600">{initials(student.name)}</span><div className="min-w-0"><p className="font-bold text-slate-900">{student.name}</p><p className="mt-1 text-xs text-slate-400">{student.nisn?`NISN: ${student.nisn}`:student.nis?`NIS: ${student.nis}`:"NISN: —"}</p><button type="button" aria-expanded={expanded} aria-controls={panelId} onClick={()=>toggleHistory(student.id)} className={`mt-3 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 cursor-pointer ${expanded?"border-indigo-200 bg-indigo-100 text-indigo-800":"border-slate-200 bg-white text-indigo-700 hover:bg-indigo-50"}`}><History size={13}/>{expanded?"Tutup riwayat":"Riwayat catatan"}{historyReady?` (${previousNotes.length})`:""}{expanded?<ChevronUp size={13}/>:<ChevronDown size={13}/>}</button></div></div></td><td className="p-4">{!notes.length?<p className="py-2 text-sm italic text-slate-400">Belum ada catatan observasi untuk tanggal ini.</p>:<div className="space-y-3">{notes.map(row=><article key={row.rowId} className={`rounded-xl border p-3 ${row.status==="FAILED"?"border-rose-200 bg-rose-50/30":row.isDraft||row.status!=="SAVED"?"border-amber-200 bg-amber-50/30":"border-slate-200 bg-white"}`}><div className="flex flex-wrap items-center justify-between gap-2"><p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500"><Clock size={12}/>{row.time||"—"}</p><StatusBadge status={savingIds.has(row.rowId)?"SAVING":row.status}/></div>{row.activityContext&&<p className="mt-2 whitespace-pre-wrap break-words text-xs font-bold text-slate-700">{row.activityContext}</p>}<div className="mt-2 text-sm text-slate-700"><ExpandableText value={row.anecdote}/></div>{row.followUp&&<div className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-600"><p className="mb-1 font-bold text-slate-400">Tindak lanjut</p><ExpandableText value={row.followUp}/></div>}<div className="mt-3 flex flex-wrap items-center justify-between gap-2"><p className="text-[11px] text-slate-400">{row.isDraft?"Draft lokal · belum tersimpan di server":`Pencatat: ${row.createdBy?.name||"Belum tersedia"}`}</p>{canManage(row)&&<div className="flex gap-2"><button type="button" disabled={locked} className={`${button} px-2 py-1 text-xs`} onClick={()=>selectEditor({scope,row:{...row}})}>Buka / Edit</button><button type="button" disabled={locked} className={`${button} px-2 py-1 text-xs text-rose-600 hover:bg-rose-50`} aria-label={`Hapus ${row.isDraft?"draft":"catatan"} ${student.name}`} onClick={()=>void removeNote(row)}><Trash2 size={12}/></button></div>}</div></article>)}</div>}</td><td className="p-4 text-right">{canWrite&&<button type="button" className={`${button} whitespace-nowrap text-xs`} disabled={locked} onClick={()=>openAdd(student.id)}><Plus size={13}/>Catatan</button>}</td></tr>
          {expanded&&<tr className="border-b border-indigo-100"><td colSpan={4} className="bg-slate-50/60 px-3 py-4 sm:px-6"><div id={panelId}><StudentHistoryPanel key={`${historyReadScope}|${student.id}`} studentName={student.name} academicYear={year} observationDate={selectedDate} notes={previousNotes} busy={historyBusy||(!historyReady&&!currentHistoryError)} error={currentHistoryError} onRetry={refreshHistory}/></div></td></tr>}
        </React.Fragment>;
      })}</tbody></table></div></div>}
      <footer className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4"><p className="max-w-2xl text-xs text-slate-500">Draft belum masuk riwayat sebelum disimpan. Membuka/menutup riwayat hanya membaca catatan, tidak mengubah data.</p>{canWrite&&<button type="button" className={primary} disabled={locked||!pending.length} onClick={()=>void saveAll()}>{savingAll?<Loader2 size={15} className="animate-spin"/>:<Save size={15}/>} {savingAll?"Menyimpan…":`Simpan Semua (${pending.length})`}</button>}</footer>
    </>}
    {editor&&editor.scope===scope&&selectedClass&&<NoteEditor key={`${editor.scope}|${editor.row.rowId}`} state={editor} className={selectedClass.name} observationDate={selectedDate} students={students} saving={savingIds.has(editor.row.rowId)||savingAll} onChange={updateEditor} onSave={()=>void saveEditor()} onClose={closeEditor}/>}
  </div>;
}
