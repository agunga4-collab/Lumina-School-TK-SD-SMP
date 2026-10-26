import * as React from 'react';
import { collection, doc } from 'firebase/firestore';
import { useMTSSCases } from '../../hooks/useMTSSCases';
import MTSSCaseTable from './components/MTSSCaseTable';
import CoachingLogDrawer from './components/CoachingLogDrawer';
import MTSSBatchEditor from './components/MTSSBatchEditor';
import { elementaryMTSSService, resolveCaseForStudent } from '../../services/elementaryMTSSService';
import { useAuth } from '../../context/AuthContext';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { getClasses, getActiveStudents, db } from '../../lib/firebase';
import type { Class } from '../../types';
import type { MTSSBatchSheet, MTSSBlockConfig, MTSSStudentRowData } from '../../types/elementaryMTSS';
import { RefreshCw, Plus, FileSpreadsheet, ShieldAlert, ArrowLeft, ChevronUp, ChevronDown, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

type Meta={academicYear:string;semester:string;subject:string;tier:string;classIds:string[];teacherName:string};
type RosterStudent={id:string;name:string;classId:string;className:string};
type SelectedCase={id:string;studentId:string;studentName:string;subject:string;tier:string;academicYear:string};
const SUBJECTS=['Bahasa Indonesia','English','Numeracy','Mengaji'];
const EMPTY_BLOCKS:MTSSBlockConfig[]=[{id:'block_m1',type:'MEETING',label:'Meeting 1'},{id:'block_m2',type:'MEETING',label:'Meeting 2'},{id:'block_a1',type:'ASSESSMENT',label:'Assessment 1'},{id:'block_m3',type:'MEETING',label:'Meeting 3'},{id:'block_m4',type:'MEETING',label:'Meeting 4'},{id:'block_a2',type:'ASSESSMENT',label:'Assessment 2'}];
const control='w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:opacity-50';
const button='inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:opacity-50 cursor-pointer';
const primary='inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:opacity-40 cursor-pointer';
const yearKey=(value:unknown)=>{const raw=String(value??'').trim();const parts=raw.match(/\d{4}/g);return parts&&parts.length>=2?`${parts[0]}/${parts[1]}`:raw;};
const areaKey=(subject:string)=>subject==='Bahasa Indonesia'?'BAHASA_INDONESIA':subject==='English'?'ENGLISH_READING':subject==='Mengaji'?'MENGAJI':'NUMERACY';
const errorText=(error:unknown)=>{const raw=error instanceof Error?error.message:String(error);try{const value=JSON.parse(raw);if(typeof value.error==='string')return value.error;}catch{}return raw;};
function insertBlock(blocks:MTSSBlockConfig[],block:MTSSBlockConfig,afterId?:string):MTSSBlockConfig[]{const next=[...blocks];const index=afterId?next.findIndex(item=>item.id===afterId):-1;next.splice(index>=0?index+1:next.length,0,block);return next;}
function moveBlock(blocks:MTSSBlockConfig[],id:string,direction:'LEFT'|'RIGHT'):MTSSBlockConfig[]{const next=[...blocks];const i=next.findIndex(item=>item.id===id);const j=i+(direction==='LEFT'?-1:1);if(i<0||j<0||j>=next.length)return blocks;[next[i],next[j]]=[next[j],next[i]];return next;}
function makeBlock(type:'MEETING'|'ASSESSMENT',blocks:MTSSBlockConfig[]):MTSSBlockConfig{return{id:`block_${type.toLowerCase()}_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,type,label:`${type==='MEETING'?'Meeting':'Assessment'} ${blocks.filter(block=>block.type===type).length+1}`};}
function withNewBlock(rows:Record<string,MTSSStudentRowData>,ids:string[],block:MTSSBlockConfig):Record<string,MTSSStudentRowData>{const next={...rows};for(const id of ids){const row=next[id];if(row)next[id]={...row,blocks:{...row.blocks,[block.id]:block.type==='MEETING'?{date:'',status:''}:{result:'',dateAssessed:'',note:''}}};}return next;}

export default function MTSSAcademicDashboard(){
  const {profile}=useAuth();const {activeYear}=useAcademicYear();
  const {cases,loading:casesLoading,error:casesError}=useMTSSCases();
  const [tab,setTab]=React.useState<'cases'|'spreadsheet'>('cases');
  const [selectedYear,setSelectedYear]=React.useState(()=>yearKey(activeYear||'2026/2027'));
  const [view,setView]=React.useState<'LIST'|'SETUP'|'EDIT'>('LIST');
  const [sheets,setSheets]=React.useState<MTSSBatchSheet[]>([]);
  const [sheetsBusy,setSheetsBusy]=React.useState(false);const [sheetsError,setSheetsError]=React.useState('');
  const [refreshKey,setRefreshKey]=React.useState(0);const [syncBusy,setSyncBusy]=React.useState(false);
  const [classState,setClassState]=React.useState<{scope:string;items:Class[]}>({scope:'',items:[]});
  const [classBusy,setClassBusy]=React.useState(true);const [classError,setClassError]=React.useState('');const [classReload,setClassReload]=React.useState(0);
  const [search,setSearch]=React.useState('');const [subjectFilter,setSubjectFilter]=React.useState('All');const [tierFilter,setTierFilter]=React.useState('All');const [statusFilter,setStatusFilter]=React.useState('Active');
  const [meta,setMeta]=React.useState<Meta>({academicYear:selectedYear,semester:'Semester 1',subject:'Bahasa Indonesia',tier:'Tier 2',classIds:[],teacherName:''});
  const [setupBlocks,setSetupBlocks]=React.useState<MTSSBlockConfig[]>([]);
  const [roster,setRoster]=React.useState<RosterStudent[]>([]);const [rosterBusy,setRosterBusy]=React.useState(false);const [rosterError,setRosterError]=React.useState('');
  const [selectedIds,setSelectedIds]=React.useState<string[]>([]);
  const selectionScope=React.useRef('');
  const [editingId,setEditingId]=React.useState<string|undefined>();
  const [editBlocks,setEditBlocks]=React.useState<MTSSBlockConfig[]>([]);const [editRows,setEditRows]=React.useState<Record<string,MTSSStudentRowData>>({});const [editIds,setEditIds]=React.useState<string[]>([]);
  const [modified,setModified]=React.useState(false);const [saving,setSaving]=React.useState(false);const saveLock=React.useRef(false);
  const [saveError,setSaveError]=React.useState('');const [lastSavedAt,setLastSavedAt]=React.useState(0);const [editorSession,setEditorSession]=React.useState(0);
  const [selectedCase,setSelectedCase]=React.useState<SelectedCase|null>(null);const [drawerOpen,setDrawerOpen]=React.useState(false);
  const classScope=JSON.stringify([profile?.uid||'',yearKey(selectedYear)]);
  const yearClasses=React.useMemo(()=>classState.scope===classScope?classState.items:[],[classState,classScope]);
  const classesList=React.useMemo(()=>yearClasses.filter(item=>item.status!=='archived'),[yearClasses]);
  const editing=tab==='spreadsheet'&&view==='EDIT';

  const loadSheets=React.useCallback(async()=>{
    if(!profile?.uid)return;
    setSheetsBusy(true);setSheetsError('');
    try{setSheets(await elementaryMTSSService.fetchBatchSheets());}catch(error){setSheetsError(errorText(error));}finally{setSheetsBusy(false);}
  },[profile?.uid]);
  React.useEffect(()=>{void loadSheets();},[loadSheets,refreshKey]);
  React.useEffect(()=>{
    let cancelled=false;setClassBusy(true);setClassError('');
    if(!profile?.uid){setClassBusy(false);return()=>{cancelled=true;};}
    getClasses().then(all=>{if(!cancelled)setClassState({scope:classScope,items:(all||[]).filter(item=>item.unitId==='ELEMENTARY'&&yearKey(item.academicYear)===yearKey(selectedYear))});}).catch(error=>{if(!cancelled)setClassError(errorText(error));}).finally(()=>{if(!cancelled)setClassBusy(false);});
    return()=>{cancelled=true;};
  },[classScope,selectedYear,profile?.uid,classReload]);
  React.useEffect(()=>{
    let cancelled=false;
    if(view!=='SETUP'||!meta.classIds.length){setRoster([]);setRosterBusy(false);return()=>{cancelled=true;};}
    const scope=JSON.stringify([meta.academicYear,meta.classIds,meta.subject,meta.tier]);
    const sameSelectionScope=selectionScope.current===scope;
    if(!sameSelectionScope)setSelectedIds([]);
    setRosterBusy(true);setRosterError('');
    const load=async()=>{
      try{
        const results=await Promise.all(meta.classIds.map(id=>getActiveStudents(id,meta.academicYear)));
        const map=new Map<string,RosterStudent>();
        results.forEach((list,index)=>{const classId=meta.classIds[index];const cls=classesList.find(item=>item.id===classId);if(!cls)throw new Error('Kelas terpilih tidak lagi aktif pada tahun ini.');for(const item of list||[]){if(map.has(item.id)&&map.get(item.id)!.classId!==classId)throw new Error('Ada siswa dengan dua enrollment kelas aktif. Periksa roster sebelum merancang lembar.');map.set(item.id,{id:item.id,name:item.name,classId,className:cls.name});}});
        if(cancelled)return;
        const rows=[...map.values()].sort((a,b)=>a.className.localeCompare(b.className)||a.name.localeCompare(b.name));setRoster(rows);
        const allowed=new Set(rows.map(item=>item.id));
        const defaults=[...new Set(cases.filter(item=>meta.classIds.includes(item.classId)&&item.subject===meta.subject&&item.tier===meta.tier&&item.status!=='Achieved'&&allowed.has(item.studentId)).map(item=>item.studentId))];
        selectionScope.current=scope;
        setSelectedIds(previous=>sameSelectionScope?previous.filter(id=>allowed.has(id)):defaults);
      }catch(error){if(!cancelled){setRoster([]);setSelectedIds([]);setRosterError(errorText(error));}}
      finally{if(!cancelled)setRosterBusy(false);}
    };
    void load();return()=>{cancelled=true;};
  },[view,meta.classIds,meta.academicYear,meta.subject,meta.tier,classesList,cases]);
  // Reconciliation is an explicit action; opening views does not write cases.
  React.useEffect(()=>{
    if(view!=='EDIT'||!modified)return;
    const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};
    window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);
  },[view,modified]);

  const relatedSheets=React.useMemo(()=>selectedCase?sheets.filter(sheet=>sheet.studentIds?.includes(selectedCase.studentId)&&sheet.subject===selectedCase.subject&&yearKey(sheet.academicYear)===yearKey(selectedCase.academicYear)):[],[sheets,selectedCase]);
  const visibleSheets=React.useMemo(()=>sheets.filter(sheet=>yearKey(sheet.academicYear)===yearKey(selectedYear)),[sheets,selectedYear]);
  const yearCases=React.useMemo(()=>{const ids=new Set(classesList.map(item=>item.id));return cases.filter(item=>ids.has(item.classId));},[cases,classesList]);
  const stats=React.useMemo(()=>({active:yearCases.filter(item=>item.status!=='Achieved').length,tier2:yearCases.filter(item=>item.tier==='Tier 2'&&item.status!=='Achieved').length,tier3:yearCases.filter(item=>item.tier==='Tier 3'&&item.status!=='Achieved').length,achieved:yearCases.filter(item=>item.status==='Achieved').length}),[yearCases]);
  const filteredCases=React.useMemo(()=>yearCases.filter(item=>(item.studentName?.toLowerCase().includes(search.toLowerCase())||item.studentId?.toLowerCase().includes(search.toLowerCase()))&&(subjectFilter==='All'||item.subject===subjectFilter)&&(tierFilter==='All'||item.tier===tierFilter)&&(statusFilter==='All'||(statusFilter==='Active'?(item.status||'Active')!=='Achieved':item.status==='Achieved'))),[yearCases,search,subjectFilter,tierFilter,statusFilter]);
  const years=React.useMemo(()=>[...new Set(['2025/2026','2026/2027',yearKey(activeYear),yearKey(selectedYear),...sheets.map(sheet=>yearKey(sheet.academicYear))].filter(Boolean))].sort(),[activeYear,selectedYear,sheets]);
  const saveBlockedReason=React.useMemo(()=>{
    if(!editIds.length)return 'Lembar belum memiliki siswa.';
    if(editIds.some(id=>!editRows[id]||editRows[id].studentId!==id))return 'Identitas baris siswa belum sesuai ID lembar. Data tidak ditimpa otomatis.';
    if(editIds.some(id=>!meta.classIds.includes(editRows[id].classId)))return 'Kelas pada baris siswa tidak sesuai kelas lembar. Periksa relasi sebelum menyimpan.';
    if(new Set(editBlocks.map(block=>block.id)).size!==editBlocks.length)return 'Ada ID sesi ganda. Struktur lama perlu diperiksa sebelum disimpan.';
    if(classBusy||classState.scope!==classScope)return 'Menunggu verifikasi data kelas. Isian tetap tersedia.';
    if(classError)return 'Data kelas belum dapat diverifikasi. Jangan simpan sebelum aksesnya berhasil.';
    if(!meta.classIds.length||meta.classIds.some(id=>!yearClasses.some(cls=>cls.id===id&&yearKey(cls.academicYear)===yearKey(meta.academicYear))))return 'Kelas/tahun lembar belum sesuai metadata. Data lama tidak diubah otomatis.';
    return '';
  },[editIds,editRows,editBlocks,classBusy,classState.scope,classScope,classError,meta.classIds,meta.academicYear,yearClasses]);

  function refresh(){setRefreshKey(value=>value+1);}
  function changeYear(next:string){if(view==='EDIT')return;setSelectedYear(next);if(view==='SETUP'){setMeta(previous=>({...previous,academicYear:next,classIds:[]}));setRoster([]);setSelectedIds([]);selectionScope.current='';}}
  async function syncCases(){if(syncBusy)return;setSyncBusy(true);try{const count=await elementaryMTSSService.reconcileAllMTSSCases();refresh();toast.success(`${count} kasus disinkronkan dari sumber Litnum.`);}catch(error){toast.error(errorText(error));}finally{setSyncBusy(false);}}
  function confirmLeave(){if(saveLock.current)return false;if(!modified)return true;return window.confirm(saveError?'Penyimpanan terakhir belum selesai; sebagian data mungkin sudah tersimpan. Tutup editor tanpa menyelesaikan sinkronisasi?':'Ada perubahan belum disimpan. Tutup editor dan buang perubahan lokal tersebut?');}
  function closeEditor(){if(!confirmLeave())return;setView('LIST');setModified(false);setSaveError('');setDrawerOpen(false);setSelectedCase(null);void loadSheets();}
  function startSetup(){if(view==='EDIT'&&!confirmLeave())return;setMeta({academicYear:selectedYear,semester:'Semester 1',subject:'Bahasa Indonesia',tier:'Tier 2',classIds:[],teacherName:''});setSetupBlocks(EMPTY_BLOCKS.map(item=>({...item})));setSelectedIds([]);selectionScope.current='';setEditingId(undefined);setModified(false);setSaveError('');setView('SETUP');}
  function generate(){
    if(!selectedIds.length||!setupBlocks.length||rosterBusy||rosterError){toast.error('Pilih siswa aktif dan minimal satu sesi terlebih dahulu.');return;}
    const rows:Record<string,MTSSStudentRowData>={};
    for(const id of selectedIds){const pupil=roster.find(item=>item.id===id);if(!pupil){toast.error('Ada siswa di luar roster terpilih.');return;}const found=cases.find(item=>item.id===`${id}_${areaKey(meta.subject)}`);const blocks:Record<string,any>={};for(const block of setupBlocks)blocks[block.id]=block.type==='MEETING'?{date:'',status:''}:{result:'',dateAssessed:'',note:''};rows[id]={studentId:id,studentName:pupil.name,classId:pupil.classId,className:pupil.className,goal:found?.baselineScore||'',teachers:meta.teacherName,baseline:found?.baselineScore||'',current:'',target:found?.targetScore||'',blocks,dateAssessed:'',finalDiagnosis:'Active',notes:''};}
    setEditRows(rows);setEditIds([...selectedIds]);setEditBlocks(setupBlocks.map(item=>({...item})));setEditingId(undefined);setModified(true);setLastSavedAt(0);setEditorSession(value=>value+1);setView('EDIT');
  }
  function openSheet(sheet:MTSSBatchSheet){
    if(view==='EDIT'&&editingId===sheet.id){setDrawerOpen(false);setSelectedCase(null);return;}
    if(view==='EDIT'&&!confirmLeave())return;
    setSelectedYear(yearKey(sheet.academicYear));setMeta({academicYear:sheet.academicYear,semester:sheet.semester,subject:sheet.subject,tier:sheet.tier,classIds:(sheet.classId||'').split(',').map(value=>value.trim()).filter(Boolean),teacherName:sheet.teacherName||''});
    setEditBlocks(sheet.orderedBlocks||[]);setEditRows(sheet.studentsData||{});setEditIds(sheet.studentIds||[]);setEditingId(sheet.id);setSetupBlocks(sheet.orderedBlocks||[]);setModified(false);setSaveError('');setLastSavedAt(sheet.updatedAt||0);setEditorSession(value=>value+1);setView('EDIT');setTab('spreadsheet');setDrawerOpen(false);setSelectedCase(null);
  }
  async function openSource(id:string){if(view==='EDIT'&&editingId===id){setDrawerOpen(false);setSelectedCase(null);return;}try{const sheet=sheets.find(item=>item.id===id)||await elementaryMTSSService.fetchBatchSheetById(id);if(sheet)openSheet(sheet);else toast.error('Sumber tidak tersedia. Catatan riwayat tetap dipertahankan.');}catch(error){toast.error(errorText(error));}}
  async function removeSheet(id:string){if(!window.confirm('Hapus spreadsheet ini? Riwayat intervensi yang sudah tercatat tetap dipertahankan.'))return;try{await elementaryMTSSService.deleteBatchSheet(id);await loadSheets();toast.success('Spreadsheet dihapus; riwayat tetap tersimpan.');}catch(error){toast.error(errorText(error));}}
  function openCaseHistory(id:string,name:string,subject:string,tier:string,studentId?:string,year=selectedYear){const item=cases.find(value=>value.id===id);if(!item){toast.warning('Kasus belum ditemukan. Tidak ada kasus baru dibuat saat membuka riwayat.');return;}setSelectedCase({id:item.id,studentId:studentId||item.studentId,studentName:name,subject,tier,academicYear:year});setDrawerOpen(true);}
  function openRowHistory(id:string,name:string){const resolved=resolveCaseForStudent(cases,id,meta.subject,meta.tier,name);const item=cases.find(value=>value.id===resolved.caseId);const row=editRows[id];if(!item||item.studentId!==id||item.subject!==meta.subject||(row&&item.classId!==row.classId)){toast.warning('Relasi kasus siswa belum dapat dipastikan. Jangan membuat riwayat pada kasus perkiraan.');return;}openCaseHistory(item.id,item.studentName,item.subject,item.tier,id,meta.academicYear);}
  function changeCell(id:string,blockId:string,field:string,value:string){if(saveLock.current)return;setEditRows(previous=>{const row=previous[id];return row?{...previous,[id]:{...row,blocks:{...row.blocks,[blockId]:{...row.blocks?.[blockId],[field]:value}}}}:previous;});setModified(true);}
  function changeRow(id:string,field:keyof MTSSStudentRowData,value:string){if(saveLock.current)return;setEditRows(previous=>previous[id]?{...previous,[id]:{...previous[id],[field]:value}}:previous);setModified(true);}
  function addEditBlock(type:'MEETING'|'ASSESSMENT',afterId?:string){if(saveLock.current)return;const block=makeBlock(type,editBlocks);setEditBlocks(previous=>insertBlock(previous,block,afterId));setEditRows(previous=>withNewBlock(previous,editIds,block));setModified(true);}
  function moveEditBlock(id:string,direction:'LEFT'|'RIGHT'){if(saveLock.current)return;setEditBlocks(previous=>moveBlock(previous,id,direction));setModified(true);}
  function renameEditBlock(id:string,label:string){if(saveLock.current||!label.trim())return;setEditBlocks(previous=>previous.map(block=>block.id===id?{...block,label:label.trim()}:block));setModified(true);}
  function removeEditBlock(id:string,label:string){if(saveLock.current||!window.confirm(`Hapus blok “${label}” dari lembar? Perubahan ini menjadi draft sampai disimpan; riwayat hasil sinkron mengikuti kebijakan arsip yang sudah ada.`))return false;setEditBlocks(previous=>previous.filter(block=>block.id!==id));setEditRows(previous=>{const next={...previous};for(const studentId of editIds){const row=next[studentId];if(!row)continue;const blocks={...row.blocks};delete blocks[id];next[studentId]={...row,blocks};}return next;});setModified(true);return true;}
  async function save(){
    if(saveLock.current||!modified)return;
    if(saveBlockedReason){toast.warning(saveBlockedReason);return;}
    saveLock.current=true;setSaving(true);setSaveError('');
    // Reserve the ID at the first explicit save so retries reuse it after partial failure.
    const id=editingId||doc(collection(db,'elementary_mtss_batch_sheets')).id;setEditingId(id);
    try{
      const selectedClasses=yearClasses.filter(cls=>meta.classIds.includes(cls.id));
      const payload:Omit<MTSSBatchSheet,'id'|'createdAt'|'updatedAt'>={academicYear:meta.academicYear,semester:meta.semester,subject:meta.subject,tier:meta.tier,classId:meta.classIds.join(','),className:selectedClasses.map(cls=>cls.name).join(', '),teacherName:meta.teacherName,orderedBlocks:editBlocks,studentsData:editRows,studentIds:editIds};
      await elementaryMTSSService.saveBatchSheet(payload,id);setModified(false);setLastSavedAt(Date.now());refresh();toast.success('Lembar dan sinkronisasi intervensi berhasil disimpan.');
    }catch(error){const message=`Penyimpanan/sinkronisasi belum selesai: ${errorText(error)}. Isian tetap tersedia; ulangi dengan lembar yang sama.`;setSaveError(message);toast.error('Penyimpanan belum selesai. Periksa pesan pada lembar.');}
    finally{saveLock.current=false;setSaving(false);}
  }

  return<div className="mx-auto max-w-[1600px] space-y-5 px-4 py-5">
    <div hidden={editing} className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-emerald-100 bg-white p-5"><div><h1 className="text-xl font-semibold text-slate-900">MTSS Academic Elementary</h1><p className="mt-1 text-sm text-slate-500">Kasus akademik dan coaching siswa SD</p></div><div className="flex flex-wrap items-end gap-2"><label className="text-xs text-slate-500">Tahun ajaran<select className={`${control} mt-1`} value={yearKey(selectedYear)} onChange={event=>changeYear(event.target.value)}>{years.map(year=><option key={year} value={year}>{year}</option>)}</select></label><button type="button" className={button} disabled={syncBusy} onClick={()=>void syncCases()}><RefreshCw size={15} className={syncBusy?'animate-spin':''}/>{syncBusy?'Menyinkronkan…':'Sinkronkan kasus'}</button></div></header>
      <nav className="flex gap-3 border-b border-slate-200" aria-label="MTSS SD"><button type="button" onClick={()=>setTab('cases')} className={`inline-flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium ${tab==='cases'?'border-emerald-600 text-emerald-800':'border-transparent text-slate-500'} cursor-pointer`}><ShieldAlert size={16}/>Panel Kasus</button><button type="button" onClick={()=>setTab('spreadsheet')} className={`inline-flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium ${tab==='spreadsheet'?'border-emerald-600 text-emerald-800':'border-transparent text-slate-500'} cursor-pointer`}><FileSpreadsheet size={16}/>Spreadsheet Coaching</button></nav>
      {classError&&<div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">Data kelas gagal dimuat: {classError}<button type="button" className="ml-3 rounded underline" onClick={()=>setClassReload(value=>value+1)}>Coba lagi</button></div>}
      <section hidden={tab!=='cases'} className="space-y-4">
        {casesError?<p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">Kasus belum dapat dimuat: {errorText(casesError)}</p>:classError?null:casesLoading||classBusy||classState.scope!==classScope?<p role="status" className="flex items-center gap-2 p-6 text-sm text-slate-500"><Loader2 size={18} className="animate-spin"/>Memuat kasus…</p>:!classError&&<>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[['Kasus aktif',stats.active],['Tier 2',stats.tier2],['Tier 3',stats.tier3],['Lulus / Achieved',stats.achieved]].map(([label,count])=><div key={String(label)} className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold text-slate-800">{count}</p></div>)}</div>
          <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="mb-3 text-xs font-semibold text-slate-500">Distribusi kasus aktif per area</p><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{SUBJECTS.map(subject=><div key={subject}><p className="text-xs text-slate-500">{subject}</p><p className="mt-1 font-semibold text-slate-800">{yearCases.filter(item=>item.subject===subject&&item.status!=='Achieved').length}</p></div>)}</div></div>
          <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-4"><input className={control} aria-label="Cari kasus siswa" placeholder="Cari nama atau ID siswa…" value={search} onChange={event=>setSearch(event.target.value)}/><select className={control} aria-label="Bidang studi" value={subjectFilter} onChange={event=>setSubjectFilter(event.target.value)}><option value="All">Semua bidang studi</option>{SUBJECTS.map(subject=><option key={subject}>{subject}</option>)}</select><select className={control} aria-label="Tier" value={tierFilter} onChange={event=>setTierFilter(event.target.value)}><option value="All">Semua Tier</option><option>Tier 2</option><option>Tier 3</option></select><select className={control} aria-label="Status kasus" value={statusFilter} onChange={event=>setStatusFilter(event.target.value)}><option value="All">Semua status</option><option value="Active">Kasus aktif</option><option value="Achieved">Lulus / Achieved</option></select></div>
          <MTSSCaseTable cases={filteredCases} classesList={classesList} onRefresh={refresh} onLogCoaching={(id,name,subject,tier,studentId)=>openCaseHistory(id,name,subject,tier,studentId,selectedYear)}/>
        </>}
      </section>
      <section hidden={tab!=='spreadsheet'} className="space-y-4">
        {view==='LIST'&&<><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold text-slate-800">Spreadsheet tersimpan</h2><button type="button" className={primary} onClick={startSetup}><Plus size={15}/>Buat spreadsheet</button></div>{sheetsError?<div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{sheetsError}<button type="button" className="ml-3 underline" onClick={()=>void loadSheets()}>Coba lagi</button></div>:sheetsBusy?<p role="status" className="flex items-center gap-2 p-5 text-sm text-slate-500"><Loader2 size={17} className="animate-spin"/>Memuat spreadsheet…</p>:!visibleSheets.length?<p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Belum ada spreadsheet untuk tahun ajaran ini.</p>:<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visibleSheets.map(sheet=><article key={sheet.id} className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex justify-between gap-2 text-xs text-slate-500"><span>{sheet.subject}</span><span>{sheet.tier}</span></div><h3 className="mt-3 font-semibold text-slate-800">{sheet.className||'Kelas belum tersedia'}</h3><p className="mt-1 text-xs text-slate-500">{sheet.academicYear} · {sheet.semester}</p><p className="mt-2 text-xs text-slate-400">{sheet.teacherName?`Pengajar: ${sheet.teacherName}`:'Pengajar belum diatur'}</p><p className="mt-3 text-sm text-slate-600">{sheet.studentIds?.length||0} siswa · {sheet.orderedBlocks?.length||0} sesi</p><div className="mt-4 flex gap-2 border-t border-slate-100 pt-3"><button type="button" className={`${button} flex-1`} onClick={()=>openSheet(sheet)}>Buka spreadsheet</button><button type="button" className={`${button} text-rose-600`} aria-label="Hapus spreadsheet" onClick={()=>void removeSheet(sheet.id)}><Trash2 size={14}/></button></div></article>)}</div>}</>}
        {view==='SETUP'&&<section className="space-y-5 rounded-xl border border-slate-200 bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold text-slate-800">Rancang spreadsheet coaching</h2><button type="button" className={button} onClick={()=>setView('LIST')}><ArrowLeft size={14}/>Kembali</button></div><div className="grid gap-4 md:grid-cols-2"><label className="block text-xs text-slate-500">Bidang studi<select className={`${control} mt-1`} value={meta.subject} onChange={event=>setMeta(previous=>({...previous,subject:event.target.value}))}>{SUBJECTS.map(subject=><option key={subject}>{subject}</option>)}</select></label><label className="block text-xs text-slate-500">Tier<select className={`${control} mt-1`} value={meta.tier} onChange={event=>setMeta(previous=>({...previous,tier:event.target.value}))}><option>Tier 2</option><option>Tier 3</option></select></label><label className="block text-xs text-slate-500">Semester<select className={`${control} mt-1`} value={meta.semester} onChange={event=>setMeta(previous=>({...previous,semester:event.target.value}))}><option>Semester 1</option><option>Semester 2</option></select></label><label className="block text-xs text-slate-500">Pengajar<input className={`${control} mt-1`} value={meta.teacherName} onChange={event=>setMeta(previous=>({...previous,teacherName:event.target.value}))} placeholder="Nama pengajar"/></label></div>
          <fieldset><legend className="mb-2 text-sm font-medium text-slate-700">Kelas aktif · {meta.academicYear}</legend>{classBusy?<p className="text-sm text-slate-500">Memuat kelas…</p>:<div className="flex flex-wrap gap-2">{classesList.map(cls=><label key={cls.id} className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600"><input type="checkbox" checked={meta.classIds.includes(cls.id)} onChange={()=>setMeta(previous=>({...previous,classIds:previous.classIds.includes(cls.id)?previous.classIds.filter(id=>id!==cls.id):[...previous.classIds,cls.id]}))}/>{cls.name}</label>)}</div>}</fieldset>
          <div className="rounded-xl border border-slate-200 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-medium text-slate-700">Pilih siswa aktif</h3><button type="button" className="rounded text-xs font-medium text-emerald-700 underline cursor-pointer" disabled={rosterBusy||!roster.length} onClick={()=>setSelectedIds(selectedIds.length===roster.length?[]:roster.map(item=>item.id))}>{selectedIds.length===roster.length&&roster.length?'Kosongkan pilihan':'Pilih semua'}</button></div>{rosterError?<p role="alert" className="mt-3 text-sm text-rose-700">{rosterError}</p>:rosterBusy?<p className="mt-3 text-sm text-slate-500">Memuat siswa…</p>:!roster.length?<p className="mt-3 text-sm text-slate-400">Pilih kelas untuk memuat siswa.</p>:<div className="mt-3 grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">{roster.map(item=><label key={item.id} className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-100 p-2 text-sm"><input className="mt-1" type="checkbox" checked={selectedIds.includes(item.id)} onChange={()=>setSelectedIds(previous=>previous.includes(item.id)?previous.filter(id=>id!==item.id):[...previous,item.id])}/><span><span className="block text-slate-700">{item.name}</span><span className="text-xs text-slate-400">{item.className}</span></span></label>)}</div>}<p className="mt-3 text-xs text-slate-400">{selectedIds.length} siswa dipilih. Siswa berkebutuhan intervensi dipilih otomatis; pilihan dapat disesuaikan.</p></div>
          <section className="space-y-3"><h3 className="text-sm font-medium text-slate-700">Urutan sesi</h3><div className="space-y-2">{setupBlocks.map((block,index)=><div key={block.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 p-2"><span className="w-20 text-xs text-slate-400">{block.type==='MEETING'?'Pertemuan':'Evaluasi'}</span><input aria-label="Judul sesi" value={block.label} className={`${control} min-w-[120px] flex-1`} onChange={event=>setSetupBlocks(previous=>previous.map(item=>item.id===block.id?{...item,label:event.target.value}:item))}/><button type="button" aria-label="Geser sesi ke atas" className={button} disabled={index===0} onClick={()=>setSetupBlocks(previous=>moveBlock(previous,block.id,'LEFT'))}><ChevronUp size={13}/></button><button type="button" aria-label="Geser sesi ke bawah" className={button} disabled={index===setupBlocks.length-1} onClick={()=>setSetupBlocks(previous=>moveBlock(previous,block.id,'RIGHT'))}><ChevronDown size={13}/></button><button type="button" aria-label="Hapus rancangan sesi" className={button} onClick={()=>setSetupBlocks(previous=>previous.filter(item=>item.id!==block.id))}><Trash2 size={13}/></button></div>)}</div><div className="flex flex-wrap gap-2"><button type="button" className={button} onClick={()=>setSetupBlocks(previous=>[...previous,makeBlock('MEETING',previous)])}><Plus size={13}/>Pertemuan</button><button type="button" className={button} onClick={()=>setSetupBlocks(previous=>[...previous,makeBlock('ASSESSMENT',previous)])}><Plus size={13}/>Evaluasi</button></div></section>
          <footer className="flex justify-end border-t border-slate-100 pt-4"><button type="button" className={primary} disabled={rosterBusy||!!rosterError||!selectedIds.length||!setupBlocks.length||setupBlocks.some(block=>!block.label.trim())} onClick={generate}>Buka rancangan spreadsheet</button></footer>
        </section>}
      </section>
    </div>
    {view==='EDIT'&&<div hidden={!editing}><MTSSBatchEditor key={editorSession} academicYear={meta.academicYear} semester={meta.semester} subject={meta.subject} tier={meta.tier} teacherName={meta.teacherName} blocks={editBlocks} studentIds={editIds} rows={editRows} saving={saving} modified={modified} saveError={saveError} lastSavedAt={lastSavedAt} saveBlockedReason={saveBlockedReason} onSave={()=>void save()} onClose={closeEditor} onCellChange={changeCell} onRowChange={changeRow} onAddBlock={addEditBlock} onMoveBlock={moveEditBlock} onRenameBlock={renameEditBlock} onRemoveBlock={removeEditBlock} onHistory={openRowHistory}/></div>}
    {selectedCase&&<CoachingLogDrawer key={selectedCase.id} caseId={selectedCase.id} studentName={selectedCase.studentName} subject={selectedCase.subject} tier={selectedCase.tier} isOpen={drawerOpen} onClose={()=>{setDrawerOpen(false);setSelectedCase(null);}} onSessionLogged={refresh} onOpenBatchSheet={id=>void openSource(id)} relatedSheets={relatedSheets}/>}
  </div>;
}
