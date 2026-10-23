import * as React from 'react';
import { useOutletContext } from 'react-router-dom';
import { useAcademicYear } from '../../context/AcademicYearContext';
import type { LpuTrackerActor, LpuTrackerStudent, LpuTrackerCell, LpuTrackerLevel, LpuTrackerCoachAssignment, LpuTrackerLegacyRow, LpuTrackerSubject } from '../../types/learningPowerUpTracker';
import { TRACKER_SUBJECTS, loadLpuTrackerCells, loadLpuTrackerCoaches, trackerLevelKey, loadLpuTrackerLegacy } from '../../services/learningPowerUpTrackerService';
import { loadOwnLpuLevelsViaApi } from '../../services/studentLpuLevelsService';
import { RefreshCw, Loader2, AlertCircle, Lock } from 'lucide-react';

const errorText=(error:unknown)=>error instanceof Error?error.message:String(error);
const control='mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20';
function updatedDate(value:number):string {
  return value?new Date(value).toLocaleString('id-ID',{timeZone:'Asia/Jakarta',dateStyle:'medium',timeStyle:'short'}):'Belum ada isian';
}
export default function LearningPowerUpStudentPage() {
  const {currentUser}=useOutletContext<{currentUser:LpuTrackerActor&{luminaId?:string;studentId?:string}}>();
  const {activeYear}=useAcademicYear();
  const [year,setYear]=React.useState(activeYear||'');
  const [semester,setSemester]=React.useState('ALL');
  const [subject,setSubject]=React.useState('ALL');
  const [student,setStudent]=React.useState<LpuTrackerStudent|null>(null);
  const [cells,setCells]=React.useState<LpuTrackerCell[]>([]);
  const [levels,setLevels]=React.useState<Record<string,LpuTrackerLevel>>({});
  const [coaches,setCoaches]=React.useState<LpuTrackerCoachAssignment[]>([]);
  const [issues,setIssues]=React.useState<Partial<Record<LpuTrackerSubject,string>>>({});
  const [errors,setErrors]=React.useState<Record<string,string>>({});
  const [loaded,setLoaded]=React.useState({identity:false,cells:false,levels:false,coaches:false});
  const [loading,setLoading]=React.useState(true);
  const [refresh,setRefresh]=React.useState(0);
  const [legacy,setLegacy]=React.useState<LpuTrackerLegacyRow[]|null>(null);
  const [loadingLegacy,setLoadingLegacy]=React.useState(false);
  const [legacyError,setLegacyError]=React.useState('');
  const [loadedScope,setLoadedScope]=React.useState('');
  const scope=JSON.stringify([currentUser?.uid||'',year]);
  const scopeRef=React.useRef(scope);scopeRef.current=scope;
  React.useEffect(()=>{if(activeYear)setYear(activeYear);},[activeYear]);
  React.useEffect(()=>{
    let cancelled=false;
    const controller=new AbortController();
    setLoading(true);setErrors({});setLoadedScope('');
    setLoaded({identity:false,cells:false,levels:false,coaches:false});
    setStudent(null);setCells([]);setLevels({});setCoaches([]);setIssues({});setLegacy(null);setLegacyError('');
    if(!year||currentUser?.role!=='STUDENT'){setLoading(false);return()=>{cancelled=true;controller.abort();};}
    const load=async()=>{
      try {
        // Server verifies account ownership before returning the student ID.
        const own=await loadOwnLpuLevelsViaApi(year,controller.signal);
        if(cancelled)return;
        setStudent(own.student);setLevels(own.levels);setIssues(own.issues);
        setLoadedScope(scope);
        setLoaded({identity:true,cells:false,levels:true,coaches:false});
        const [values,assignments]=await Promise.allSettled([
          loadLpuTrackerCells(year,undefined,undefined,own.student.id),
          loadLpuTrackerCoaches(year,undefined,own.student.id)
        ]);
        if(cancelled)return;
        const problems:Record<string,string>={};
        if(values.status==='fulfilled')setCells(values.value.filter(cell=>cell.studentId===own.student.id&&cell.visible));
        else problems['Catatan LPU']=errorText(values.reason);
        if(assignments.status==='fulfilled')setCoaches(assignments.value.filter(value=>value.studentId===own.student.id));
        else problems['Coach']=errorText(assignments.reason);
        setErrors(problems);
        setLoaded({identity:true,cells:values.status==='fulfilled',levels:true,coaches:assignments.status==='fulfilled'});
      }catch(error){if(!cancelled)setErrors({'Identitas / layanan level':errorText(error)});}
      finally{if(!cancelled)setLoading(false);}
    };
    void load();
    return()=>{cancelled=true;controller.abort();};
  },[year,currentUser?.uid,currentUser?.role,currentUser?.status,currentUser?.luminaId,currentUser?.studentId,refresh]);
  const current=loadedScope===scope;
  const ready=current?loaded:{identity:false,cells:false,levels:false,coaches:false};
  const ownStudent=current?student:null;
  const years=[...new Set([activeYear,year].filter(Boolean))];
  if(currentUser?.role!=='STUDENT')return<p className="p-8 text-rose-700">Halaman ini hanya untuk akun siswa.</p>;
  return<div className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
    <header className="rounded-2xl border border-slate-200 bg-white p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold text-emerald-700">Lumina Junior High · Learning Power-Up</p><h1 className="mt-1 text-2xl font-bold text-slate-900">Laporan Learning Power-Up Saya</h1></div><span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-500"><Lock size={12}/>Hanya lihat</span></div><p className="mt-2 text-sm text-slate-500">Seluruh catatan dari awal sampai akhir periode. Data diisi guru; halaman ini hanya untuk dibaca.</p>{ownStudent&&<p className="mt-3 text-xs text-slate-600">Siswa: {ownStudent.name} · Kelas: {ownStudent.className} · NIS: {ownStudent.nis}</p>}</header>
    <section className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4" aria-label="Filter laporan LPU">
      <label className="min-w-[150px] text-xs font-semibold text-slate-600">Tahun ajaran<select value={year} onChange={event=>setYear(event.target.value)} className={control}>{years.map(item=><option key={item} value={item}>{item}</option>)}</select></label>
      <label className="min-w-[150px] text-xs font-semibold text-slate-600">Semester<select value={semester} onChange={event=>setSemester(event.target.value)} className={control}><option value="ALL">Seluruh semester</option><option value="1">Semester 1</option><option value="2">Semester 2</option></select></label>
      <label className="min-w-[170px] text-xs font-semibold text-slate-600">Pelajaran<select value={subject} onChange={event=>setSubject(event.target.value)} className={control}><option value="ALL">Seluruh pelajaran</option>{TRACKER_SUBJECTS.map(item=><option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
      <button type="button" disabled={loading} onClick={()=>setRefresh(value=>value+1)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50 cursor-pointer"><RefreshCw size={14} className={loading?'animate-spin':''}/>Segarkan</button>
    </section>
    {loading&&<p role="status" className="flex items-center gap-2 p-4 text-sm text-slate-500"><Loader2 size={17} className="animate-spin"/>Memuat laporan pribadi…</p>}
    {Object.entries(errors).map(([source,error])=><div key={source} role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><AlertCircle size={17} className="shrink-0"/><div><p className="font-bold">{source} belum dapat dimuat</p><p className="mt-1 whitespace-pre-wrap break-words">{error}</p><p className="mt-1 text-xs">Kondisi ini bukan berarti catatanmu kosong atau level belum ditetapkan.</p></div></div>)}
    {ownStudent&&ready.identity&&TRACKER_SUBJECTS.filter(item=>subject==='ALL'||item.key===subject).map(item=>{
      const rows=cells.filter(cell=>cell.studentId===ownStudent.id&&cell.subjectKey===item.key&&(semester==='ALL'||cell.semester===semester)).sort((a,b)=>a.semester.localeCompare(b.semester)||a.order-b.order||a.columnId.localeCompare(b.columnId));
      const level=levels[trackerLevelKey(ownStudent.id,item.key)];
      const issue=issues[item.key]||level?.issue;
      return<section key={item.key} className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><header className="border-b border-slate-100 p-5"><h2 className="text-lg font-bold text-slate-900">{item.label}</h2>{issue?<p role="alert" className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">{issue}</p>:<p className="mt-1 text-sm text-slate-600">Level terkini dari Literasi &amp; Numerasi: <span className="font-bold text-emerald-800">{ready.levels?level?.label||'Belum ditetapkan':'Belum dapat dimuat'}</span></p>}{!issue&&level&&<p className="mt-1 text-xs text-slate-400">Sumber: {level.sourceLabel||level.sessionKey||'Literasi & Numerasi'}{level.sourceType==='LEGACY'?' · Sumber lama, belum ada acuan manual untuk pelajaran ini.':''}</p>}{item.key==='numerasi'&&<p className="mt-2 text-xs text-slate-500">{!ready.coaches?loading?'Memuat coach…':'Data coach belum dapat dimuat.':coaches.filter(coach=>semester==='ALL'||coach.semester===semester).map(coach=>`Coach Semester ${coach.semester}: ${coach.coachName||'Belum ditetapkan'}`).join(' · ')||'Coach belum ditetapkan'}</p>}</header>
        {!ready.cells?<p className="p-5 text-sm text-slate-500">{loading?'Memuat catatan LPU…':'Catatan LPU belum dapat dimuat. Periksa pesan error lalu klik Segarkan.'}</p>:rows.length?<div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-600"><tr><th className="p-3">Semester</th><th className="min-w-[180px] p-3">Kolom / Kegiatan</th><th className="min-w-[130px] p-3">Periode</th><th className="min-w-[170px] p-3">Hasil / Catatan Guru</th><th className="min-w-[140px] p-3">Pembaruan Isian</th></tr></thead><tbody>{rows.map(cell=><tr key={cell.id} className="border-t border-slate-100"><td className="p-3 align-top">{cell.semester}</td><td className="p-3 align-top font-semibold text-slate-800">{cell.label}</td><td className="p-3 align-top text-slate-500">{cell.periodLabel||'—'}</td><td className="whitespace-pre-wrap break-words p-3 align-top">{cell.value===''?<span className="text-slate-400">Belum ada catatan</span>:String(cell.value)}</td><td className="p-3 align-top text-xs text-slate-400">{updatedDate(cell.valueUpdatedAt)}</td></tr>)}</tbody></table></div>:<p className="p-5 text-sm text-slate-500">Belum ada kolom/catatan yang ditujukan kepada Anda pada periode ini.</p>}
      </section>;
    })}
    {ownStudent&&ready.identity&&<section className="rounded-2xl border border-slate-200 bg-white p-4"><button type="button" disabled={loadingLegacy} className="rounded text-sm text-slate-600 underline focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50 cursor-pointer" onClick={async()=>{
      if(legacy){setLegacy(null);return;}
      const requestedScope=scope;setLoadingLegacy(true);setLegacyError('');
      try{const values=await loadLpuTrackerLegacy(year,ownStudent.id);if(scopeRef.current===requestedScope)setLegacy(values.filter(value=>value.studentId===ownStudent.id));}
      catch(error){if(scopeRef.current===requestedScope)setLegacyError(errorText(error));}
      finally{if(scopeRef.current===requestedScope)setLoadingLegacy(false);}
    }}>{loadingLegacy?'Memuat riwayat…':legacy?'Tutup riwayat tugas lama':'Lihat riwayat tugas lama'}</button>{legacyError&&<p role="alert" className="mt-3 text-sm text-rose-700">Riwayat belum dapat dimuat: {legacyError}</p>}{legacy&&<div className="mt-4 space-y-3"><p className="text-xs text-slate-500">Riwayat sistem lama tetap disimpan. Tidak ada tombol mengirim atau mengubah status.</p>{legacy.map(row=><article key={row.id} className="rounded-xl border border-slate-200 p-3 text-xs"><p className="font-semibold">{TRACKER_SUBJECTS.find(item=>item.key===row.subjectKey)?.label||row.subjectKey} · {row.date||'Tanggal tidak tercatat'}</p><p className="mt-1">{row.title}</p>{row.instructions&&<p className="mt-1 whitespace-pre-wrap text-slate-500">{row.instructions}</p>}<p className="mt-2 text-slate-400">Status historis: {row.status}</p></article>)}{!legacy.length&&<p className="text-xs text-slate-400">Tidak ada riwayat tugas lama pada tahun ajaran ini.</p>}</div>}</section>}
  </div>;
}
