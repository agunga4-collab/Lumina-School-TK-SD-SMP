import type { IncomingMessage, ServerResponse } from 'node:http';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import type { Firestore, Query, DocumentData } from 'firebase-admin/firestore';
import { formatMengajiDisplay, formatNumerasiDisplay } from '../src/utils/litnumLevelNormalizer';

type ApiRequest = IncomingMessage & { originalUrl?: string; query?: Record<string, unknown> };
interface Identity { id:string; name:string; nis:string; classId:string; className:string; grade:number; }
interface AccountProof { uid:string; email:string; emailVerified:boolean; claimStudentId:string; }
interface Level { recordId:string; studentId:string; subjectKey:string; label:string; sessionKey:string; sourceLabel?:string; sourceType?:'LEGACY'|'SESSION'|'CUSTOM_COLUMN'; issue?:string; }
const ENDPOINT='/api/student-lpu-levels';
const AREAS:Record<string,string>={bahasaIndonesia:'BAHASA_INDONESIA',english:'ENGLISH_READING',mengaji:'MENGAJI',numerasi:'NUMERACY'};
const PRIORITY:Record<string,number>={SEMESTER_1_START:1,FALL_ASSESSMENT_2:2,SEMESTER_1_END:2,SPRING_ASSESSMENT_3:3,SEMESTER_2_START:4,SEMESTER_2_END:5};
const clean=(value:unknown)=>String(value??'').trim();
const lower=(value:unknown)=>clean(value).toLowerCase();
const millis=(value:any):number=>typeof value==='number'?value:value?.toMillis?.()||(typeof value?.seconds==='number'?value.seconds*1000:0);
function normalizeYear(value:unknown):string {
  const match=clean(value).match(/^(\d{4})[\/_-](\d{4})$/);
  return match&&Number(match[2])===Number(match[1])+1?`${match[1]}/${match[2]}`:'';
}
function routeValue(value:unknown):string {
  if(Array.isArray(value))return value.map(clean).filter(Boolean).join('/').replace(/^\/+|\/+$/g,'');
  return clean(value).replace(/^\/+|\/+$/g,'');
}
export function isStudentLpuLevelsRequest(req:ApiRequest):boolean {
  for(const raw of [req.originalUrl,req.url]){
    if(!raw)continue;
    try {
      const url=new URL(raw,'http://localhost');
      if(url.pathname.replace(/\/$/,'')===ENDPOINT)return true;
      if(url.pathname.replace(/\/$/,'')==='/api/index'&&
        [routeValue(url.searchParams.get('path')),routeValue(req.query?.path)].some(value=>value==='student-lpu-levels'||value==='api/student-lpu-levels'))return true;
    }catch{return false;}
  }
  return false;
}
class PublicError extends Error {
  constructor(public status:number,public code:string,message:string){super(message);}
}
function parseYear(req:ApiRequest):string {
  const values:string[]=[];
  for(const raw of [req.originalUrl,req.url]){
    if(!raw)continue;
    const url=new URL(raw,'http://localhost');
    if(url.searchParams.getAll('year').length>1)throw new PublicError(400,'INVALID_ARGUMENT','Tahun ajaran tidak boleh dikirim ganda.');
    for(const name of url.searchParams.keys()){
      if(name==='year'){values.push(url.searchParams.get(name)||'');continue;}
      if(name==='path'){
        const value=routeValue(url.searchParams.get(name));
        if(url.searchParams.getAll(name).length!==1||!['student-lpu-levels','api/student-lpu-levels'].includes(value))throw new PublicError(400,'INVALID_ROUTE','Parameter routing tidak valid.');
        continue;
      }
      throw new PublicError(400,'INVALID_ARGUMENT','Parameter permintaan tidak valid. ID siswa/kelas tidak diterima dari browser.');
    }
  }
  if(req.query&&'year' in req.query){
    if(typeof req.query.year!=='string')throw new PublicError(400,'INVALID_ARGUMENT','Tahun ajaran tidak valid.');
    values.push(req.query.year);
  }
  if(req.query)for(const name of Object.keys(req.query)){
    if(!['year','path'].includes(name))throw new PublicError(400,'INVALID_ARGUMENT','Parameter permintaan tidak dikenal.');
    if(name==='path'&&!['student-lpu-levels','api/student-lpu-levels'].includes(routeValue(req.query.path)))throw new PublicError(400,'INVALID_ROUTE','Parameter routing tidak valid.');
  }
  const normalized=values.map(normalizeYear);
  if(normalized.some(value=>!value)||new Set(normalized).size>1)throw new PublicError(400,'INVALID_PERIOD','Pilih tahun ajaran yang valid dan konsisten.');
  return normalized[0]||'';
}
function database():Firestore {
  try{
    if(!getApps().length){
      const raw=process.env.FIREBASE_SERVICE_ACCOUNT;
      if(!raw)throw new Error('missing-credentials');
      const account=JSON.parse(raw);
      if(typeof account.private_key==='string')account.private_key=account.private_key.replace(/\\n/g,'\n');
      initializeApp({credential:cert(account)});
    }
    return getFirestore();
  }catch{throw new PublicError(503,'BACKEND_NOT_CONFIGURED','Layanan level siswa belum dikonfigurasi pada server. Hubungi administrator.');}
}
async function readRows(query:Query<DocumentData>,max=5000):Promise<any[]> {
  const snapshot=await query.limit(max+1).get();
  if(snapshot.size>max)throw new PublicError(503,'READ_LIMIT','Data melebihi batas pembacaan aman. Hubungi administrator; hasil parsial tidak ditampilkan.');
  return snapshot.docs.map(item=>({...item.data(),id:item.id}));
}
function hasAccountProof(profile:DocumentData,id:string,proof:AccountProof):boolean {
  if(proof.claimStudentId)return proof.claimStudentId===id;
  return proof.emailVerified && !!clean(profile.email) && lower(profile.email)===lower(proof.email);
}
async function resolveIdentity(db:Firestore,uid:string,year:string,activeYear:string,proof:AccountProof):Promise<{student:Identity;aliases:string[]}> {
  const userSnapshot=await db.collection('users').doc(uid).get();
  const user=userSnapshot.data();
  if(!userSnapshot.exists||!user||user.role!=='STUDENT'||user.status!=='active')throw new PublicError(403,'STUDENT_ONLY','Halaman ini hanya untuk akun siswa aktif.');
  const id=clean(user.luminaId||user.studentId);
  if(!id||id.includes('/')||id.length>128)throw new PublicError(409,'ACCOUNT_NOT_LINKED','Akun belum terhubung ke ID siswa yang valid.');
  const profileSnapshot=await db.collection('students').doc(id).get();
  if(!profileSnapshot.exists)throw new PublicError(409,'STUDENT_NOT_FOUND','Profil siswa yang terhubung tidak ditemukan.');
  const profile=profileSnapshot.data()!;
  if(!hasAccountProof(profile,id,proof))throw new PublicError(409,'ACCOUNT_LINK_NOT_VERIFIED','Relasi akun siswa belum dapat diverifikasi dengan aman. Admin perlu mencocokkan email siswa di data induk dengan email login terverifikasi, atau menggunakan student ID pada custom claim akun. Data tidak diubah otomatis.');
  const [enrollments,classes]=await Promise.all([
    readRows(db.collection('enrollments').where('studentId','==',id),2000),
    readRows(db.collection('classes').where('unitId','==','JUNIOR_HIGH'),2000)
  ]);
  const resolveClass=(value:unknown)=>{
    const key=clean(value);
    const matches=classes.filter(item=>normalizeYear(item.academicYear)===year&&[item.id,item.name,item.classId].some(candidate=>clean(candidate)===key));
    if(matches.length>1)throw new PublicError(409,'CLASS_AMBIGUOUS','Relasi kelas siswa ambigu. Hubungi administrator.');
    return matches[0];
  };
  const entries=enrollments.filter(item=>item.studentId===id&&normalizeYear(item.academicYear)===year&&item.status==='active');
  const resolved=entries.map(item=>resolveClass(item.classId));
  if(resolved.some(item=>!item))throw new PublicError(409,'CLASS_NOT_RESOLVED','Ada enrollment yang kelasnya belum dapat diverifikasi.');
  if(!entries.length&&year===activeYear){const fallback=resolveClass(profile.classId);if(fallback)resolved.push(fallback);}
  const unique=[...new Map(resolved.filter(Boolean).map(item=>[item.id,item])).values()];
  if(unique.length!==1)throw new PublicError(409,'ENROLLMENT_INVALID',unique.length?'Ada lebih dari satu enrollment kelas aktif. Hubungi administrator.':'Kelas Junior High siswa belum terhubung pada tahun ajaran ini.');
  const cls=unique[0];
  const grade=Number(cls.grade)||Number(/^\s*([789])/.exec(clean(cls.name))?.[1])||0;
  if(![7,8,9].includes(grade))throw new PublicError(409,'GRADE_NOT_RESOLVED','Grade Junior High siswa belum dapat diverifikasi.');
  return {
    student:{id,name:clean(profile.name||profile.fullName||user.displayName),nis:clean(profile.nis||profile.luminaId||id),classId:cls.id,className:clean(cls.name),grade},
    aliases:[...new Set([cls.id,cls.name,cls.classId].map(lower).filter(Boolean))]
  };
}
function levelValue(value:any,subject:string):string {
  const raw=subject==='mengaji'?value?.mengajiLevel||value?.level:subject==='numerasi'?value?.numerasiLevel||value?.mathLevel||value?.level:value?.readingLevel||value?.level;
  return subject==='mengaji'?formatMengajiDisplay(raw):subject==='numerasi'?formatNumerasiDisplay(raw):clean(raw);
}
function resolveOwnLevels(student:Identity,aliases:string[],year:string,records:any[],refs:Record<string,any|null>,cells:any[],readIssues:Record<string,string>) {
  const levels:Record<string,Level>={};
  const issues:Record<string,string>={...readIssues};
  const inOwnClass=(value:any)=>value.studentId===student.id&&normalizeYear(value.schoolYear)===year&&aliases.includes(lower(value.classId));
  const ownRecords=records.filter(value=>inOwnClass(value)&&['JUNIOR_HIGH','JUNIORHIGH'].includes(clean(value.unit)));
  for(const [subject,area]of Object.entries(AREAS)){
    if(issues[subject])continue;
    const key=`${student.id}|${subject}`;
    const ref=refs[subject];
    const legacy=ownRecords.filter(value=>(value.subjectArea||value.area)===area)
      .sort((a,b)=>(PRIORITY[b.sessionKey||b.period]||0)-(PRIORITY[a.sessionKey||a.period]||0)||millis(b.updatedAt)-millis(a.updatedAt)||clean(a.id).localeCompare(clean(b.id)));
    if(!ref){
      const selected=legacy[0];
      if(selected)levels[key]={recordId:clean(selected.id),studentId:student.id,subjectKey:subject,label:levelValue(selected,subject),sessionKey:clean(selected.sessionKey||selected.period),sourceLabel:clean(selected.sessionLabel||selected.sessionKey||selected.period),sourceType:'LEGACY'};
      continue;
    }
    if(!aliases.includes(lower(ref.classId))||normalizeYear(ref.schoolYear)!==year||ref.subjectArea!==area||!['LEGACY','SESSION','CUSTOM_COLUMN'].includes(ref.sourceType)||!clean(ref.sourceId)){
      issues[subject]='Identitas acuan level belum sesuai kelas/pelajaran/periode. Hubungi guru; tidak menggunakan fallback sesi lain.';continue;
    }
    const custom=ref.sourceType==='CUSTOM_COLUMN';
    const candidates=(custom?cells.filter(value=>inOwnClass(value)&&(value.subjectArea||value.area)===area&&clean(value.columnId)===clean(ref.sourceId)):legacy.filter(value=>clean(value.sessionKey||value.period)===clean(ref.sourceId)||clean(value.id)===clean(ref.sourceId)))
      .sort((a,b)=>millis(b.updatedAt)-millis(a.updatedAt)||clean(a.id).localeCompare(clean(b.id)));
    if(custom&&candidates.length>1){issues[subject]='Ada nilai kustom ganda pada acuan level. Hubungi guru.';continue;}
    const selected=candidates[0];
    const label=selected?levelValue(selected,subject):'';
    if(!label)issues[subject]='Belum ada level valid milikmu pada acuan yang dipilih guru. Tidak memakai hasil dari kolom lain.';
    levels[key]={recordId:clean(selected?.id),studentId:student.id,subjectKey:subject,label,sessionKey:clean(ref.sourceId),sourceLabel:clean(ref.sourceLabel||ref.sourceId),sourceType:custom?'CUSTOM_COLUMN':'SESSION',...(!label?{issue:issues[subject]}:{})};
  }
  return {levels,issues};
}
export async function handleStudentLpuLevels(req:ApiRequest,res:ServerResponse):Promise<void> {
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','private, no-store, max-age=0');
  res.setHeader('Vary','Authorization');
  res.setHeader('X-Content-Type-Options','nosniff');
  const send=(status:number,value:unknown)=>{res.statusCode=status;res.end(JSON.stringify(value));};
  try{
    if(req.method!=='GET'){res.setHeader('Allow','GET');send(405,{error:'Metode tidak diizinkan.',code:'METHOD_NOT_ALLOWED'});return;}
    const header=req.headers.authorization;
    if(typeof header!=='string'||!/^Bearer\s+\S+$/i.test(header))throw new PublicError(401,'UNAUTHENTICATED','Masuk dengan akun siswa untuk melihat level.');
    const db=database();
    let proof:AccountProof;
    try{
      const decoded=await getAuth().verifyIdToken(header.replace(/^Bearer\s+/i,''),true);
      proof={uid:decoded.uid,email:clean(decoded.email),emailVerified:decoded.email_verified===true,claimStudentId:clean(decoded.luminaId||decoded.studentId)};
    }catch{throw new PublicError(401,'UNAUTHENTICATED','Sesi login tidak valid. Silakan masuk kembali.');}
    const requestedYear=parseYear(req);
    const config=await db.collection('systemConfig').doc('academicYear').get();
    const activeYear=normalizeYear(config.data()?.activeAcademicYear);
    const year=requestedYear||activeYear;
    if(!year||!activeYear)throw new PublicError(400,'INVALID_PERIOD','Tahun ajaran belum valid.');
    const {student,aliases}=await resolveIdentity(db,proof.uid,year,activeYear,proof);
    let records:any[];
    try{records=await readRows(db.collection('junior_high_literacy_numeracy_records').where('studentId','==',student.id));}
    catch{
      const issues=Object.fromEntries(Object.keys(AREAS).map(subject=>[subject,'Hasil level Litnum belum dapat dibaca. Catatan LPU yang berhasil dimuat tetap ditampilkan.']));
      send(200,{version:1,schoolYear:year,student,levels:{},issues});return;
    }
    const subjects=Object.entries(AREAS);
    const snapshots=await Promise.allSettled(subjects.map(([subject,area])=>db.collection('lpu_subject_references').doc(`${student.classId}_${area}_${year.replace(/\//g,'-')}`).get()));
    const refs:Record<string,any|null>={};const issues:Record<string,string>={};
    snapshots.forEach((value,index)=>{
      const subject=subjects[index][0];
      if(value.status==='fulfilled')refs[subject]=value.value.exists?{...value.value.data(),id:value.value.id}:null;
      else issues[subject]='Referensi level belum dapat dibaca oleh layanan. Coba Segarkan atau hubungi administrator.';
    });
    let cells:any[]=[];
    if(Object.values(refs).some(value=>value?.sourceType==='CUSTOM_COLUMN')){
      try{cells=await readRows(db.collection('junior_high_litnum_cell_values').where('studentId','==',student.id));}
      catch{for(const [subject,value]of Object.entries(refs))if(value?.sourceType==='CUSTOM_COLUMN')issues[subject]='Hasil pada acuan kustom belum dapat dibaca. Tidak memakai fallback sesi lain.';}
    }
    const resolved=resolveOwnLevels(student,aliases,year,records,refs,cells,issues);
    send(200,{version:1,schoolYear:year,student,levels:resolved.levels,issues:resolved.issues});
  }catch(error){
    if(error instanceof PublicError){send(error.status,{error:error.message,code:error.code});return;}
    const code=clean((error as {code?:unknown})?.code);
    console.error('[StudentLpuLevels]',{code:code||'INTERNAL_ERROR'});
    send(503,{error:'Layanan level siswa belum dapat dimuat. Hubungi administrator jika masalah berulang.',code:'LEVELS_UNAVAILABLE'});
  }
}
