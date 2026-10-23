import * as React from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { useAcademicYear } from '../../context/AcademicYearContext';
import {
  BookOpen, Layers, TrendingUp, RefreshCw, Loader2, AlertCircle,
  CheckCircle2, ArrowUpRight, Clock, ChevronDown, ChevronRight,
  History, Eye, X, Lock, MessageSquare
} from 'lucide-react';
import type {
  StudentProgressPayload, StudentProgressGoal, StudentProgressLO,
  StudentProgressResult, StudentProgressSum
} from '../../types/studentLearningProgress';

const control='w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50';
const button='inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer';
interface ApiFailure extends Error { code?: string; status?: number; }
interface MetaState { key:string; value:StudentProgressPayload; }
interface DataState { key:string; value:StudentProgressPayload; }
type Detail={kind:'LO';goalId:string;loId:string}|{kind:'SUM';goalId:string};
function errorText(error:unknown):string{return error instanceof Error?error.message:String(error);}
function formatDate(value:string):string {
  const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if(!match)return value||'Tanggal belum tersedia';
  const date=new Date(Number(match[1]),Number(match[2])-1,Number(match[3]),12);
  return date.toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'});
}
function resultLabel(result:StudentProgressResult|null):{title:string;subtitle:string;color:string} {
  if(!result)return{title:'Belum dinilai',subtitle:'Belum ada hasil penilaian pada LO ini.',color:'border-slate-200 bg-slate-50 text-slate-600'};
  if(result.score==='Achieved')return{title:'Achieved',subtitle:'Sudah tercapai',color:'border-emerald-200 bg-emerald-50 text-emerald-800'};
  if(result.score==='Not Achieved')return{title:'Not Achieved',subtitle:'Masih perlu latihan',color:'border-amber-200 bg-amber-50 text-amber-900'};
  if(['A','D','B'].includes(result.score))return{title:`${result.score} · Skala lama`,subtitle:'Hasil lama ditampilkan tanpa konversi.',color:'border-slate-200 bg-slate-50 text-slate-700'};
  return{title:'Skala lain',subtitle:result.score||'Periksa hasil bersama guru.',color:'border-slate-200 bg-slate-50 text-slate-700'};
}
function counts(goals:StudentProgressGoal[]) {
  const los=goals.flatMap(goal=>goal.los);
  const achieved=los.filter(lo=>lo.current?.score==='Achieved').length;
  const practice=los.filter(lo=>lo.current?.score==='Not Achieved').length;
  const unassessed=los.filter(lo=>!lo.current).length;
  return{total:los.length,achieved,practice,unassessed,assessed:los.length-unassessed,other:los.length-achieved-practice-unassessed};
}
async function requestProgress(user:User,params:Record<string,string>,signal:AbortSignal):Promise<StudentProgressPayload> {
  const query=new URLSearchParams(params).toString();
  const url=`/api/student-learning-progress${query?`?${query}`:''}`;
  for(let attempt=0;attempt<2;attempt++){
    if(auth.currentUser?.uid!==user.uid)throw new Error('Akun login berubah. Muat ulang halaman.');
    const token=await user.getIdToken(attempt===1);
    const response=await fetch(url,{method:'GET',headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},credentials:'same-origin',cache:'no-store',signal});
    if(response.status===401&&attempt===0)continue;
    if(!response.headers.get('content-type')?.includes('application/json'))throw new Error('Endpoint Learning Progress belum tersedia pada server ini. Hubungi administrator.');
    const body=await response.json();
    if(!response.ok){const error=new Error(typeof body.error==='string'?body.error:'Learning Progress belum dapat dimuat.') as ApiFailure;error.code=body.code;error.status=response.status;throw error;}
    if(body.version!==1||!body.student||!Array.isArray(body.subjects)||!Array.isArray(body.activities)||!Array.isArray(body.availableYears))throw new Error('Format data Learning Progress belum sesuai. Hubungi administrator.');
    if(auth.currentUser?.uid!==user.uid)throw new Error('Akun login berubah. Muat ulang halaman.');
    return body as StudentProgressPayload;
  }
  throw new Error('Sesi login perlu diperbarui. Silakan masuk kembali.');
}
function SelectBox({label,active,onClick,icon}:{label:string;active:boolean;onClick:()=>void;icon:React.ReactNode}) {
  return<button type="button" aria-pressed={active} onClick={onClick} className={`flex min-h-[62px] items-center gap-2 rounded-xl border px-3 py-3 text-left text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer ${active?'border-blue-600 bg-blue-600 text-white shadow-sm':'border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50'}`}><span className="shrink-0">{icon}</span><span className="break-words leading-snug">{label}</span></button>;
}
function ResultBadge({result}:{result:StudentProgressResult|null}) {
  const state=resultLabel(result);
  return<span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold ${state.color}`}>{result?.score==='Achieved'?<CheckCircle2 size={12}/>:result?.score==='Not Achieved'?<ArrowUpRight size={12}/>:<Clock size={12}/>} {state.title}</span>;
}
function ReadOnlyDialog({title,onClose,children}:{title:string;onClose:()=>void;children:React.ReactNode}) {
  const ref=React.useRef<HTMLDialogElement>(null);
  React.useEffect(()=>{
    const element=ref.current;const previous=document.activeElement as HTMLElement|null;
    if(element&&!element.open)element.showModal();
    return()=>{if(element?.open)element.close();previous?.focus();};
  },[]);
  return<dialog ref={ref} aria-label={title} onCancel={onClose} onClick={event=>{if(event.target===event.currentTarget)onClose();}} className="m-auto max-h-[90vh] w-[92vw] max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-900/40"><div className="flex max-h-[90vh] flex-col"><header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 bg-slate-50 p-4"><div><h2 className="font-bold">{title}</h2><p className="mt-1 text-xs text-slate-500">Hasil asesmen guru · Hanya lihat</p></div><button type="button" autoFocus aria-label="Tutup rincian" className={button} onClick={onClose}><X size={16}/></button></header><div className="min-h-0 space-y-4 overflow-y-auto p-4">{children}</div><footer className="flex shrink-0 justify-end border-t border-slate-100 p-3"><button type="button" className={button} onClick={onClose}>Tutup</button></footer></div></dialog>;
}
function AssessmentDetails({result,current=false}:{result:StudentProgressResult;current?:boolean}) {
  return<article className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"><div className="flex flex-wrap items-center gap-2"><ResultBadge result={result}/>{current&&<span className="rounded bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700">Hasil terkini</span>}</div><p className="text-sm text-slate-500">{resultLabel(result).subtitle}</p><dl className="grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-xs font-semibold text-slate-400">Tanggal asesmen</dt><dd className="mt-1 text-slate-700">{formatDate(result.date)}</dd></div><div><dt className="text-xs font-semibold text-slate-400">Kegiatan</dt><dd className="mt-1 whitespace-pre-wrap text-slate-700">{result.task||'Tidak ada keterangan kegiatan.'}</dd></div></dl>{result.nextAction&&<div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3"><p className="flex items-center gap-1 text-xs font-bold text-blue-800"><ArrowUpRight size={13}/>Tindak lanjut dari guru</p><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">{result.nextAction}</p></div>}<p className="text-xs text-slate-400">Dicatat oleh {result.teacherName||'guru'}{result.correctedAt?' · Penilaian ini pernah dikoreksi.':''}</p></article>;
}
function SummativeDetails({sum}:{sum:StudentProgressSum|null}) {
  if(!sum)return<p className="text-sm text-slate-500">Belum ada hasil sumatif pada tujuan belajar ini.</p>;
  return<div className="space-y-3 rounded-xl border border-indigo-100 bg-indigo-50/40 p-4"><p className="text-lg font-bold text-indigo-900">Sumatif: {sum.score}</p><p className="text-sm text-slate-600">Tanggal asesmen: {formatDate(sum.date)}</p><p className="whitespace-pre-wrap text-sm text-slate-600">Kegiatan: {sum.task||'Belum ada keterangan.'}</p><p className="text-xs text-slate-400">Guru: {sum.teacherName||'—'}</p><p className="text-xs text-slate-500">Hasil sumatif terpisah dari capaian tiap LO; tidak dihitung otomatis pada halaman ini.</p></div>;
}
export default function StudentProgress() {
  const {activeYear,activeSemester,isLoading:periodLoading}=useAcademicYear();
  const [user,setUser]=React.useState<User|null>(auth.currentUser);
  const [authReady,setAuthReady]=React.useState(false);
  const [chosenYear,setChosenYear]=React.useState('');
  const [chosenSemester,setChosenSemester]=React.useState('');
  const [selection,setSelection]=React.useState('');
  const [category,setCategory]=React.useState('');
  const [activityId,setActivityId]=React.useState('');
  const [meta,setMeta]=React.useState<MetaState|null>(null);
  const [metaBusy,setMetaBusy]=React.useState(false);
  const [metaError,setMetaError]=React.useState<{key:string;text:string}|null>(null);
  const [data,setData]=React.useState<DataState|null>(null);
  const [dataBusy,setDataBusy]=React.useState(false);
  const [dataError,setDataError]=React.useState<{key:string;text:string}|null>(null);
  const [refresh,setRefresh]=React.useState(0);
  const [closed,setClosed]=React.useState<Set<string>>(new Set());
  const [detail,setDetail]=React.useState<Detail|null>(null);
  const year=chosenYear||activeYear;
  const semester=chosenSemester||String(activeSemester);
  const periodKey=JSON.stringify([user?.uid||'',year,semester]);
  const metadata=meta?.key===periodKey&&!metaBusy&&metaError?.key!==periodKey?meta.value:null;
  const isUA=selection==='UA';
  const selectedSubject=metadata?.subjects.find(item=>item.key===selection);
  const selectedActivity=metadata?.activities.find(item=>item.id===activityId&&item.category===category);
  const selectedKey=isUA?selectedActivity?.id||'':selectedSubject?.key||'';
  const dataKey=JSON.stringify([periodKey,isUA?'UNIT_ACTIVITY':'SUBJECT',selectedKey]);
  React.useEffect(()=>onAuthStateChanged(auth,value=>{setUser(value);setAuthReady(true);}),[]);
  React.useEffect(()=>{
    setMeta(null);setData(null);setMetaError(null);setDataError(null);setDetail(null);
    setChosenYear('');setChosenSemester('');setSelection('');setCategory('');setActivityId('');
  },[user?.uid]);
  React.useEffect(()=>{
    const controller=new AbortController();
    setMetaError(null);
    if(!authReady||!user||periodLoading||!year||!['1','2'].includes(semester)){setMetaBusy(false);return()=>controller.abort();}
    const currentUser=user;setMetaBusy(true);
    requestProgress(currentUser,{year,semester},controller.signal).then(value=>{if(!controller.signal.aborted)setMeta({key:periodKey,value});})
      .catch(error=>{if(!controller.signal.aborted)setMetaError({key:periodKey,text:errorText(error)});})
      .finally(()=>{if(!controller.signal.aborted)setMetaBusy(false);});
    return()=>controller.abort();
  },[authReady,user?.uid,periodLoading,year,semester,periodKey,refresh]);
  React.useEffect(()=>{setDetail(null);setClosed(new Set());},[dataKey]);
  React.useEffect(()=>{
    const controller=new AbortController();setDataError(null);
    if(!metadata||!user||!selectedKey){setDataBusy(false);return()=>controller.abort();}
    const currentUser=user;const params:Record<string,string>={year,semester};
    if(isUA)params.activity=selectedKey;else params.subject=selectedKey;
    setDataBusy(true);
    requestProgress(currentUser,params,controller.signal).then(value=>{
      if(controller.signal.aborted)return;
      if(!value.selected||!Array.isArray(value.goals))throw new Error('Hasil tujuan belajar belum sesuai format. Hubungi administrator.');
      if(value.student.id!==metadata.student.id)throw new Error('Identitas hasil penilaian tidak sesuai akun.');
      setData({key:dataKey,value});
    }).catch(error=>{if(!controller.signal.aborted)setDataError({key:dataKey,text:errorText(error)});})
      .finally(()=>{if(!controller.signal.aborted)setDataBusy(false);});
    return()=>controller.abort();
  },[metadata,user?.uid,year,semester,isUA,selectedKey,dataKey]);

  const result=metadata&&data?.key===dataKey&&!dataBusy&&dataError?.key!==dataKey?data.value:null;
  const goals=result?.goals||[];
  const stats=counts(goals);
  const years=[...new Set([...(metadata?.availableYears||[]),year].filter(Boolean))].sort((a,b)=>b.localeCompare(a));
  const activityCategories=metadata?[...new Map(metadata.activities.map(item=>[item.category,item.categoryLabel])).entries()]:[];
  const error=metaError?.key===periodKey?metaError.text:dataError?.key===dataKey?dataError.text:'';
  const busy=!authReady||periodLoading||metaBusy||dataBusy;
  const detailGoal=detail?goals.find(goal=>goal.id===detail.goalId):undefined;
  const detailLO=detail?.kind==='LO'?detailGoal?.los.find(lo=>lo.id===detail.loId):undefined;
  const toggleGoal=(id:string)=>setClosed(previous=>{const next=new Set(previous);next.has(id)?next.delete(id):next.add(id);return next;});

  return<div className="mx-auto max-w-6xl space-y-5 p-4 pb-12 sm:p-6">
    <header className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"><div><p className="flex items-center gap-1.5 text-xs font-semibold text-blue-700"><TrendingUp size={14}/>Learning Progress</p><h1 className="mt-1 text-2xl font-extrabold text-slate-900">Perjalanan Belajarku</h1>{metadata?<p className="mt-2 text-sm font-semibold text-slate-600">{metadata.student.name} · {metadata.student.className}</p>:<p className="mt-2 text-sm text-slate-400">{busy?'Memuat profil siswa…':'Hasil belajar dari asesmen guru'}</p>}<p className="mt-2 max-w-xl text-sm text-slate-500">Lihat tujuan yang sudah tercapai dan hal yang masih perlu kamu latih. Kamu tidak perlu mengisi atau mengirim apa pun di halaman ini.</p></div><div className="flex items-center gap-2"><span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-500"><Lock size={12}/>Hanya lihat</span><button type="button" className={button} disabled={busy||!user} onClick={()=>{setDetail(null);setRefresh(value=>value+1);}}><RefreshCw size={14}/>Segarkan</button></div></header>
    {authReady&&!user?<p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Masuk dengan akun siswa untuk melihat perkembangan belajarmu.</p>:<>
      <section aria-label="Periode belajar" className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2"><label className="block"><span className="mb-1 block text-xs font-semibold text-slate-500">Tahun ajaran</span><select className={control} value={year} disabled={!user||metaBusy||periodLoading} onChange={event=>{setChosenYear(event.target.value);setActivityId('');}}>{years.map(item=><option key={item} value={item}>{item}</option>)}</select></label><label className="block"><span className="mb-1 block text-xs font-semibold text-slate-500">Semester</span><select className={control} value={semester} disabled={!user||periodLoading} onChange={event=>setChosenSemester(event.target.value)}><option value="1">Semester 1 (Ganjil)</option><option value="2">Semester 2 (Genap)</option></select></label></section>
      {error&&<div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><AlertCircle size={18} className="shrink-0"/><div><p className="font-bold">Learning Progress belum dapat dimuat.</p><p className="mt-1 whitespace-pre-wrap break-words">{error}</p><p className="mt-1 text-xs">Kondisi ini bukan berarti kamu belum dinilai.</p></div></div>}
      {metaBusy||!authReady||periodLoading?<div role="status" className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-500"><Loader2 size={19} className="animate-spin"/>Memuat pelajaranmu…</div>:metadata&&<>
        {metadata.warnings.map((warning,index)=><p key={index} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{warning}</p>)}
        <section aria-label="Pilih pelajaran" className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4"><h2 className="text-sm font-bold text-slate-800">Pelajaran dan Unit Aktivitasku</h2><div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">{metadata.subjects.map(item=><SelectBox key={item.key} label={item.label} icon={<BookOpen size={15}/>} active={selection===item.key} onClick={()=>setSelection(item.key)}/>)}<SelectBox label="UA" icon={<Layers size={16}/>} active={isUA} onClick={()=>setSelection('UA')}/></div>
          {isUA&&<div className="space-y-3 border-t border-slate-100 pt-3">{!metadata.activities.length?<p className="text-sm text-slate-500">Belum ada Unit Aktivitas terdaftar untukmu pada semester ini.</p>:<><p className="text-xs font-semibold text-slate-500">Pilih kategori aktivitas yang kamu ikuti.</p><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{activityCategories.map(([key,label])=><SelectBox key={key} label={label} icon={<Layers size={14}/>} active={category===key} onClick={()=>{setCategory(key);setActivityId('');}}/>)}</div>{category&&<div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{metadata.activities.filter(item=>item.category===category).map(item=><SelectBox key={item.id} label={item.name} icon={<ChevronRight size={14}/>} active={activityId===item.id} onClick={()=>setActivityId(item.id)}/>)}</div>}</>}</div>}
        </section>
        {dataBusy?<div role="status" className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-500"><Loader2 size={19} className="animate-spin"/>Memuat hasil belajarmu…</div>:!selectedKey&&!error?<p className="rounded-xl border border-dashed border-slate-300 bg-white p-7 text-center text-sm text-slate-500">{isUA?'Pilih kategori dan aktivitas yang kamu ikuti.':'Klik kotak pelajaran untuk melihat hasil LO-mu.'}</p>:result&&<>
          <section className="rounded-xl border border-blue-100 bg-blue-50/50 p-4"><h2 className="text-lg font-bold text-slate-900">{result.selected?.label}</h2><p className="mt-1 text-sm text-slate-500">{year} · Semester {semester} · {goals.length} tujuan belajar</p></section>
          {goals.length>0&&<>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3"><div className="rounded-xl border border-emerald-100 bg-white p-4"><p className="text-xs font-semibold text-emerald-700">LO sudah tercapai</p><p className="mt-1 text-2xl font-bold text-emerald-700">{stats.achieved}</p></div><div className="rounded-xl border border-amber-100 bg-white p-4"><p className="text-xs font-semibold text-amber-800">Masih perlu latihan</p><p className="mt-1 text-2xl font-bold text-amber-800">{stats.practice}</p></div><div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-semibold text-slate-500">Belum dinilai</p><p className="mt-1 text-2xl font-bold text-slate-600">{stats.unassessed}</p></div></div>
            <p className="text-xs text-slate-500">Ringkasan untuk pelajaran/aktivitas dan semester yang dipilih. {stats.assessed} dari {stats.total} LO sudah dinilai.{stats.other>0?` ${stats.other} LO memakai skala lama/lain dan tidak dikonversi menjadi Achieved.`:''}</p>
          </>}
          {!goals.length?<p className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Belum ada tujuan belajar yang dipublikasikan untuk pelajaran/aktivitas ini pada periode terpilih.</p>:goals.map((goal,index)=>{
            const summary=counts([goal]);const open=!closed.has(goal.id);
            return<section key={goal.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><header className="space-y-3 border-b border-slate-100 p-4 sm:p-5"><button type="button" aria-expanded={open} className="flex w-full items-start justify-between gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer" onClick={()=>toggleGoal(goal.id)}><span><span className="text-xs font-bold text-blue-700">Tujuan Belajar {index+1}{goal.code?` · ${goal.code}`:''}</span><span className="mt-1 block whitespace-pre-wrap text-base font-bold leading-relaxed text-slate-900">{goal.text}</span></span>{open?<ChevronDown size={18} className="mt-1 shrink-0 text-slate-400"/>:<ChevronRight size={18} className="mt-1 shrink-0 text-slate-400"/>}</button><div><p className="text-sm font-semibold text-emerald-800">{summary.achieved} dari {summary.total} LO sudah tercapai</p><p className="mt-1 text-xs text-slate-500">{summary.assessed} LO sudah dinilai · {summary.unassessed} LO belum dinilai{summary.other?` · ${summary.other} skala lama/lain`:''}</p></div>{summary.total>0&&<div role="img" aria-label={`${summary.achieved} LO tercapai, ${summary.practice} perlu latihan, ${summary.unassessed} belum dinilai, ${summary.other} skala lain`} className="flex h-2 overflow-hidden rounded-full bg-slate-100"><span className="bg-emerald-500" style={{width:`${summary.achieved/summary.total*100}%`}}/><span className="bg-amber-400" style={{width:`${summary.practice/summary.total*100}%`}}/><span className="bg-slate-400" style={{width:`${summary.other/summary.total*100}%`}}/></div>}</header>
              {open&&<div className="space-y-3 p-4 sm:p-5">{!goal.los.length?<p className="text-sm text-slate-500">LO untuk tujuan belajar ini belum tersedia.</p>:goal.los.map(lo=>{
                const state=resultLabel(lo.current);
                return<article key={lo.id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><p className="text-xs font-bold text-blue-700">{lo.code||'LO'}</p><ResultBadge result={lo.current}/></div><h3 className="mt-2 whitespace-pre-wrap text-sm font-bold leading-relaxed text-slate-800">{lo.title}</h3><p className="mt-2 text-xs text-slate-500">{state.subtitle}</p>{lo.current&&<p className="mt-1 text-xs text-slate-400">Penilaian terakhir: {formatDate(lo.current.date)}</p>}{lo.current?.score==='Not Achieved'&&lo.current.nextAction&&<div className="mt-3 rounded-lg bg-amber-50/70 p-3"><p className="text-xs font-bold text-amber-900">Tindak lanjut dari guru</p><p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{lo.current.nextAction}</p></div>}<div className="mt-3"><button type="button" className={`${button} text-xs text-blue-700`} onClick={()=>setDetail({kind:'LO',goalId:goal.id,loId:lo.id})}><Eye size={14}/>{lo.current?.score==='Not Achieved'?'Lihat tindak lanjut & riwayat':'Lihat rincian & riwayat'}</button></div></article>;
              })}<div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-100 bg-indigo-50/40 p-4"><div><p className="text-xs font-semibold text-indigo-700">Sumatif tujuan belajar ini</p><p className="mt-1 text-base font-bold text-indigo-900">{goal.summative?goal.summative.score:'Belum ada hasil sumatif'}</p></div><button type="button" className={`${button} text-xs text-indigo-700`} onClick={()=>setDetail({kind:'SUM',goalId:goal.id})}><Eye size={14}/>Lihat rincian sumatif</button></div></div>}
            </section>;
          })}
          <p className="flex items-start gap-1.5 text-xs text-slate-400"><MessageSquare size={13} className="shrink-0"/>Halaman ini menampilkan hasil dan tindak lanjut belajar. Catatan internal guru tidak dibagikan melalui halaman ini.</p>
        </>}
      </>}
    </>}
    {detail&&detailGoal&&result&&<ReadOnlyDialog title={detail.kind==='LO'?'Rincian perkembangan LO':'Rincian sumatif'} onClose={()=>setDetail(null)}><div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3"><p className="text-xs font-bold text-blue-700">{result.selected?.label} · {detailGoal.code||'Tujuan Belajar'}</p><p className="mt-1 whitespace-pre-wrap text-sm font-semibold text-slate-800">{detailGoal.text}</p></div>{detail.kind==='SUM'?<SummativeDetails sum={detailGoal.summative}/>:detailLO&&<><div><p className="text-xs font-bold text-blue-700">{detailLO.code}</p><p className="mt-1 whitespace-pre-wrap text-sm font-bold leading-relaxed text-slate-800">{detailLO.title}</p></div>{detailLO.current?<AssessmentDetails result={detailLO.current} current/>:<p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Belum ada hasil penilaian pada LO ini.</p>}<details className="rounded-xl border border-slate-200 p-3"><summary className="flex items-center gap-1.5 rounded text-sm font-bold text-slate-700 focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer"><History size={15}/>Riwayat penilaian ({detailLO.history.length})</summary><div className="mt-3 space-y-3">{detailLO.history.length?detailLO.history.map(item=><AssessmentDetails key={item.id} result={item} current={item.id===detailLO.current?.id}/>):<p className="text-sm text-slate-500">Belum ada riwayat.</p>}</div></details></>}</ReadOnlyDialog>}
  </div>;
}
