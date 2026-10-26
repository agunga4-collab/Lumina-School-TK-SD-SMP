import type { IncomingMessage, ServerResponse } from 'node:http';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import type { Firestore, Query, QuerySnapshot, DocumentData } from 'firebase-admin/firestore';
import { JH_SUBJECT_CATALOG, isSameJHSubject, findCatalogEntry, normalizeSubjectName } from '../src/constants/juniorHighSubjectCatalog';
import type {
  StudentProgressActivity, StudentProgressGoal, StudentProgressIdentity,
  StudentProgressPayload, StudentProgressResult, StudentProgressSum,
  StudentDailyEntryItem, StudentDailySection
} from '../src/types/studentLearningProgress';

type ApiRequest = IncomingMessage & { originalUrl?: string };
class PublicError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
const clean=(value:unknown)=>String(value??'').trim();
const lower=(value:unknown)=>clean(value).toLowerCase();
const segment=(value:string)=>encodeURIComponent(value).replace(/~/g,'%7E');
const hiddenSubjects=new Set(['seni_rupa','seni_musik','physical_education','digital_literacy']);
const subjects=JH_SUBJECT_CATALOG.filter(item=>!hiddenSubjects.has(item.key));
const categories=[
  {key:'Arts & Makerspace',label:'Seni Rupa',activities:['Papercraft','Makerspace','Seni Kreasi Bebas','Membatik','Painting']},
  {key:'Performing Arts',label:'Seni Musik',activities:['Orkestra','Choir','Theatre','LGP','Traditional Music','Drumline','Musical Theatre Band']},
  {key:'Physical Education',label:'PE',activities:['Bola Kecil','Bola Besar','Senam & Gerak Berirama','Atletik','Swimming & Physical Training']},
  {key:'Digital Literacy',label:'Digital Literacy',activities:['Animation','Videography','Graphic Design','3D Structure Building','Coding']}
];
const validDocId=(value:string)=>!!value&&value.length<=128&&!value.includes('/');
const yearKey=(value:unknown)=>{const match=clean(value).match(/^(\d{4})[\/_-](\d{4})$/);return match&&Number(match[2])===Number(match[1])+1?`${match[1]}/${match[2]}`:'';};
const millis=(value:any):number=>typeof value==='number'&&Number.isFinite(value)?value:typeof value?.toMillis==='function'?value.toMillis():typeof value?.seconds==='number'?value.seconds*1000:0;
function categoryKey(value:unknown):string {
  const aliases:Record<string,string>={
    'arts & makerspace':'Arts & Makerspace','seni rupa':'Arts & Makerspace','seni rupa (arts & makerspace)':'Arts & Makerspace',
    'performing arts':'Performing Arts','seni musik':'Performing Arts','seni musik (performing arts)':'Performing Arts',
    'physical education':'Physical Education','pe':'Physical Education','pjok':'Physical Education',
    'digital literacy':'Digital Literacy','dl':'Digital Literacy'
  };
  return aliases[lower(value)]||'';
}
function activityName(category:string,value:unknown):string {
  const name=['orchestra','orkestra'].includes(lower(value))?'Orkestra':clean(value);
  return categories.find(item=>item.key===category)?.activities.find(item=>lower(item)===lower(name))||name;
}
function activityIdentity(category:string,name:string):string { return `UA:${segment(category)}:${segment(activityName(category,name))}`; }
function normalizeIdentity(value:unknown):string {
  const raw=clean(value);
  if(raw.startsWith('JUNIOR_HIGH_UA_V2_'))return parseGroup(raw)?.id||'';
  try {
    const parts=raw.split(':');
    if(parts.length!==3||parts[0]!=='UA')return'';
    const category=categoryKey(decodeURIComponent(parts[1]));const name=activityName(category,decodeURIComponent(parts[2]));
    return category&&name?activityIdentity(category,name):'';
  }catch{return'';}
}
function parseGroup(value:unknown):{id:string;category:string;name:string}|null {
  const raw=clean(value);const prefix='JUNIOR_HIGH_UA_V2_';
  if(!raw.startsWith(prefix))return null;
  try{
    const parts=raw.slice(prefix.length).split('~');
    if(parts.length!==3||!['ALL','7','8','9'].includes(decodeURIComponent(parts[2])))return null;
    const category=categoryKey(decodeURIComponent(parts[0]));const name=activityName(category,decodeURIComponent(parts[1]));
    return category&&name?{id:activityIdentity(category,name),category,name}:null;
  }catch{return null;}
}
function sameActivity(value:DocumentData,id:string):boolean {
  if(value.assessmentMode!=='UNIT_ACTIVITY')return false;
  const group=parseGroup(value.assessmentGroupId||value.classId);
  if(!group||group.id!==id)return false;
  return !value.unitActivityId||normalizeIdentity(value.unitActivityId)===group.id;
}
function normalizeEnrollment(value:DocumentData):StudentProgressActivity|null {
  const raw=value.normalizedUaName||value.sourceUaName||value.unitActivityName||value.activityName;
  const name=['orchestra','orkestra'].includes(lower(raw))?'Orkestra':clean(raw);
  const declared=categoryKey(value.category);
  const known=categories.find(item=>item.activities.some(activity=>lower(activity)===lower(name)));
  if(!name||(declared&&known&&declared!==known.key))return null;
  const category=declared||known?.key||'';
  if(!category)return null;
  const canonical=activityName(category,name);
  return {id:activityIdentity(category,canonical),name:canonical,category,categoryLabel:categories.find(item=>item.key===category)!.label};
}
function adminDatabase():Firestore {
  try {
    if(!getApps().length){
      const raw=process.env.FIREBASE_SERVICE_ACCOUNT;
      if(!raw)throw new Error('missing-credentials');
      const account=JSON.parse(raw);
      if(typeof account.private_key==='string')account.private_key=account.private_key.replace(/\\n/g,'\n');
      initializeApp({credential:cert(account)});
    }
    return getFirestore();
  }catch{throw new PublicError(503,'BACKEND_NOT_CONFIGURED','Layanan Learning Progress belum dikonfigurasi. Hubungi administrator.');}
}
async function bounded(query:Query<DocumentData>,max:number):Promise<QuerySnapshot<DocumentData>> {
  const snapshot=await query.limit(max+1).get();
  if(snapshot.size>max)throw new PublicError(503,'READ_LIMIT','Data periode ini melebihi batas pembacaan aman. Hubungi administrator; hasil parsial tidak ditampilkan.');
  return snapshot;
}
const unpack=(snapshot:QuerySnapshot<DocumentData>)=>snapshot.docs.map(item=>({...item.data(),id:item.id} as DocumentData&{id:string}));
function publicResult(value:DocumentData):StudentProgressResult {
  return {id:clean(value.id),score:clean(value.comprehensionLevel),date:clean(value.date),task:clean(value.formativeTask),nextAction:clean(value.nextAction),teacherName:clean(value.teacherName),createdAt:millis(value.createdAt),correctedAt:millis(value.correctedAt)};
}
function published(value:DocumentData,year:string):boolean {
  return value.isActive!==false&&(value.status||'PUBLISHED')==='PUBLISHED'&&(!value.academicYear||value.academicYear===year);
}
async function resolveStudent(db:Firestore,uid:string,requestedYear:string,activeYear:string) {
  const account=await db.collection('users').doc(uid).get();
  const actor=account.data();
  if(!account.exists||!actor||actor.status!=='active'||actor.role!=='STUDENT')throw new PublicError(403,'STUDENT_ONLY','Halaman ini hanya untuk akun siswa aktif.');
  const studentId=clean(actor.luminaId||actor.studentId);
  if(!validDocId(studentId))throw new PublicError(409,'ACCOUNT_NOT_LINKED','Akun belum terhubung ke profil siswa yang valid. Hubungi administrator.');
  const [studentSnapshot,enrollmentSnapshot,classSnapshot]=await Promise.all([
    db.collection('students').doc(studentId).get(),
    bounded(db.collection('enrollments').where('studentId','==',studentId),2000),
    bounded(db.collection('classes').where('unitId','==','JUNIOR_HIGH'),2000)
  ]);
  if(!studentSnapshot.exists)throw new PublicError(409,'STUDENT_NOT_FOUND','Profil siswa yang terhubung belum ditemukan.');
  const student=studentSnapshot.data()!;
  const enrollments=unpack(enrollmentSnapshot).filter(item=>item.studentId===studentId&&item.status==='active');
  const classes=unpack(classSnapshot);
  const matchClass=(key:string,year:string)=>{
    const list=classes.filter(item=>yearKey(item.academicYear)===year&&(item.id===key||item.name===key||item.classId===key));
    if(list.length>1)throw new PublicError(409,'CLASS_AMBIGUOUS','Relasi kelas siswa ambigu. Hubungi administrator.');
    return list[0];
  };
  const availableYears=new Set<string>();
  for(const enrollment of enrollments){
    const year=yearKey(enrollment.academicYear);
    if(year&&matchClass(clean(enrollment.classId),year))availableYears.add(year);
  }
  const currentFallback=matchClass(clean(student.classId),activeYear);
  if(currentFallback)availableYears.add(activeYear);
  const selected=enrollments.filter(item=>yearKey(item.academicYear)===requestedYear);
  const candidates=selected.map(item=>matchClass(clean(item.classId),requestedYear)).filter((item):item is DocumentData&{id:string}=>!!item);
  if(selected.length&&candidates.length!==selected.length)throw new PublicError(409,'CLASS_NOT_RESOLVED','Ada enrollment yang kelasnya belum dapat diverifikasi pada tahun ajaran ini.');
  if(!selected.length&&requestedYear===activeYear&&currentFallback)candidates.push(currentFallback);
  const unique=[...new Map(candidates.map(item=>[item.id,item])).values()];
  if(unique.length>1)throw new PublicError(409,'MULTIPLE_ENROLLMENTS','Ada lebih dari satu enrollment kelas aktif pada tahun ajaran ini. Hubungi administrator.');
  const cls=unique[0];
  if(!cls)throw new PublicError(409,'NO_JH_ENROLLMENT','Belum ada relasi kelas Junior High yang dapat diverifikasi untuk tahun ajaran terpilih.');
  const grade=Number(clean(cls.grade||cls.gradeLevel))||Number(/^\s*([789])/.exec(clean(cls.name))?.[1])||0;
  if(![7,8,9].includes(grade))throw new PublicError(409,'GRADE_NOT_RESOLVED','Grade siswa belum dapat diverifikasi. Hubungi administrator.');
  const identity:StudentProgressIdentity={id:studentId,name:clean(student.name||student.fullName||actor.displayName),classId:cls.id,className:clean(cls.name),grade};
  availableYears.add(requestedYear);
  return {identity,availableYears:[...availableYears].sort((a,b)=>b.localeCompare(a))};
}
function makeGoals(goalDocs:DocumentData[],loDocs:DocumentData[],formativeDocs:DocumentData[],sumDocs:DocumentData[]):StudentProgressGoal[] {
  return goalDocs.sort((a,b)=>clean(a.code).localeCompare(clean(b.code),'id',{numeric:true})||a.id.localeCompare(b.id)).map(goal=>{
    const objectives=loDocs.filter(lo=>lo.lgId===goal.id&&lo.isActive!==false)
      .sort((a,b)=>(Number(a.order)||0)-(Number(b.order)||0)||a.id.localeCompare(b.id));
    const sumMatches=sumDocs.filter(value=>value.lgId===goal.id);
    if(sumMatches.length>1)throw new PublicError(409,'SUMMATIVE_CONFLICT','Ada nilai sumatif ganda pada periode ini. Hubungi guru untuk memeriksa konflik; nilai tidak dipilih otomatis.');
    const rawSum=sumMatches[0];
    const summative:StudentProgressSum|null=rawSum?{score:clean(rawSum.summativeScore),date:clean(rawSum.date),task:clean(rawSum.summativeTask),teacherName:clean(rawSum.teacherName),updatedAt:millis(rawSum.updatedAt)}:null;
    return {
      id:goal.id,code:clean(goal.code),text:clean(goal.goalText),summative,
      los:objectives.map(lo=>{
        const history=formativeDocs.filter(value=>value.lgId===goal.id&&value.loId===lo.id)
          .sort((a,b)=>millis(a.createdAt)-millis(b.createdAt)||a.id.localeCompare(b.id)).map(publicResult);
        return {id:lo.id,code:clean(lo.code),title:clean(lo.title),order:Number(lo.order)||0,current:history[history.length-1]||null,history:[...history].reverse()};
      })
    };
  });
}
async function resultFor(db:Firestore,student:StudentProgressIdentity,year:string,semester:string,subjectKey:string,activity:StudentProgressActivity|null):Promise<StudentProgressGoal[]> {
  const base=(name:string)=>db.collection(name).where('academicYear','==',year).where('semester','==',semester);
  const [goalSnapshot,loSnapshot,formativeSnapshot,sumSnapshot]=await Promise.all([
    bounded(activity?db.collection('learning_goals').where('unitId','==','JUNIOR_HIGH'):db.collection('learning_goals').where('unitId','==','JUNIOR_HIGH').where('grade','==',String(student.grade)),5000),
    bounded(activity?base('jh_ab_los').where('assessmentMode','==','UNIT_ACTIVITY'):base('jh_ab_los').where('classId','==',student.classId),10000),
    bounded(base('jh_ab_formative_entries').where('studentId','==',student.id),10000),
    bounded(base('jh_ab_summative_entries').where('studentId','==',student.id),10000)
  ]);
  const subject=subjects.find(item=>item.key===subjectKey);
  const goals=unpack(goalSnapshot).filter(goal=>{
    if(!published(goal,year))return false;
    if(!activity)return !!subject&&isSameJHSubject(goal.subject,subject.label)&&goal.assessmentMode!=='UNIT_ACTIVITY'&&!goal.unitActivityId;
    if(goal.unitActivityId){
      const identity=normalizeIdentity(goal.unitActivityId);
      if(!identity)throw new PublicError(409,'INVALID_ACTIVITY_GOAL','Ada relasi aktivitas pada LG yang belum valid. Hubungi guru.');
      return identity===activity.id;
    }
    const category=categories.find(item=>item.key===activity.category)!;
    return lower(goal.subject)===lower(activity.name)||[category.key,category.label].some(label=>lower(goal.subject)===lower(label)||isSameJHSubject(goal.subject,label));
  });
  const ids=new Set(goals.map(goal=>goal.id));
  const validContext=(value:DocumentData)=>activity?sameActivity(value,activity.id):value.assessmentMode!=='UNIT_ACTIVITY'&&value.classId===student.classId&&!!subject&&isSameJHSubject(value.subjectId,subject.label);
  const los=unpack(loSnapshot).filter(value=>ids.has(value.lgId)&&validContext(value));
  const formative=unpack(formativeSnapshot).filter(value=>value.studentId===student.id&&ids.has(value.lgId)&&validContext(value));
  const sums=unpack(sumSnapshot).filter(value=>value.studentId===student.id&&ids.has(value.lgId)&&validContext(value));
  return makeGoals(goals,los,formative,sums);
}
function getTodayWIB(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function isUnitActivityItem(item: DocumentData): boolean {
  if (item.assessmentMode === 'UNIT_ACTIVITY') return true;
  if (clean(item.unitActivityName).length > 0) return true;
  if (typeof item.classId === 'string' && item.classId.startsWith('JUNIOR_HIGH_UA_')) return true;
  return false;
}

function resolveUAActivityName(item: DocumentData): string {
  if (clean(item.unitActivityName)) return clean(item.unitActivityName);
  const fromGroup = parseGroup(item.assessmentGroupId || item.classId);
  if (fromGroup?.name) return fromGroup.name;
  return clean(item.subjectId) || 'UA';
}

function resolveUACategory(item: DocumentData, actName: string, uaCategoryMap: Map<string, string>): string {
  const explicit = categoryKey(item.unitActivityCategory);
  if (explicit) return explicit;
  if (clean(item.unitActivityCategory)) return clean(item.unitActivityCategory);

  const fromGroup = parseGroup(item.assessmentGroupId || item.classId);
  if (fromGroup?.category) {
    const parsed = categoryKey(fromGroup.category);
    if (parsed) return parsed;
    if (clean(fromGroup.category)) return clean(fromGroup.category);
  }

  if (actName && uaCategoryMap.has(actName)) {
    const fromMap = categoryKey(uaCategoryMap.get(actName));
    if (fromMap) return fromMap;
    const rawMap = uaCategoryMap.get(actName);
    if (clean(rawMap)) return clean(rawMap);
  }

  if (actName) {
    const knownConfig = categories.find(c =>
      c.activities.some(act => lower(act) === lower(actName))
    );
    if (knownConfig) return knownConfig.key;
  }

  const asCat = categoryKey(actName);
  if (asCat) return asCat;

  if (item.subjectId) {
    const fromSubj = categoryKey(item.subjectId);
    if (fromSubj) return fromSubj;
  }

  return '';
}

export async function handleStudentLearningProgress(req:ApiRequest,res:ServerResponse):Promise<void> {
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','private, no-store, max-age=0');
  res.setHeader('Vary','Authorization');
  res.setHeader('X-Content-Type-Options','nosniff');
  const send=(status:number,value:unknown)=>{res.statusCode=status;res.end(JSON.stringify(value));};
  try {
    if(req.method!=='GET'){res.setHeader('Allow','GET');send(405,{error:'Metode tidak diizinkan.',code:'METHOD_NOT_ALLOWED'});return;}
    const header=req.headers.authorization;
    if(typeof header!=='string'||!/^Bearer\s+\S+$/i.test(header))throw new PublicError(401,'UNAUTHENTICATED','Silakan masuk dengan akun siswa.');
    const db=adminDatabase();
    let uid='';
    try{uid=(await getAuth().verifyIdToken(header.replace(/^Bearer\s+/i,''),true)).uid;}
    catch{throw new PublicError(401,'UNAUTHENTICATED','Sesi login sudah tidak valid. Silakan masuk kembali.');}
    const url=new URL(req.originalUrl||req.url||'/','http://localhost');
    const yearParam = url.searchParams.get('year');
    const semesterParam = url.searchParams.get('semester');
    const dateParam = url.searchParams.get('date');
    const subjectKey = clean(url.searchParams.get('subject'));
    const activityId = clean(url.searchParams.get('activity'));
    const config=await db.collection('systemConfig').doc('academicYear').get();
    const activeYear=yearKey(config.data()?.activeAcademicYear);
    const year=yearKey(yearParam||activeYear);
    const semester=clean(semesterParam||config.data()?.activeSemester);
    if(!year||!activeYear||!['1','2'].includes(semester))throw new PublicError(400,'INVALID_PERIOD','Pilih tahun ajaran dan semester yang valid.');
    const {identity,availableYears}=await resolveStudent(db,uid,year,activeYear);
    const enrollmentSnapshot=await bounded(db.collection('junior_high_unit_activity_enrollments').where('studentId','==',identity.id).where('academicYear','==',year),2000);
    const activitiesMap=new Map<string,StudentProgressActivity>();
    const uaCategoryMap=new Map<string,string>();
    const warnings:string[]=[];
    for(const enrollment of unpack(enrollmentSnapshot)){
      if(enrollment.studentId!==identity.id||String(enrollment.semester)!==semester||enrollment.status!=='CONFIRMED')continue;
      const normalized=normalizeEnrollment(enrollment);
      if(!normalized){warnings.push('Ada kepesertaan UA yang pemetaannya belum jelas. Hubungi sekolah agar dapat ditampilkan.');continue;}
      activitiesMap.set(normalized.id,normalized);
      if(normalized.category)uaCategoryMap.set(normalized.name,normalized.category);
    }
    const activities=[...activitiesMap.values()].sort((a,b)=>a.category.localeCompare(b.category)||a.name.localeCompare(b.name));

    // Base query for student records
    const base=(name:string)=>db.collection(name).where('academicYear','==',year).where('semester','==',semester);
    const [formativeSnapshot, sumSnapshot, classSharedTasksSnap, studentSharedTasksSnap]=await Promise.all([
      bounded(base('jh_ab_formative_entries').where('studentId','==',identity.id),10000),
      bounded(base('jh_ab_summative_entries').where('studentId','==',identity.id),10000),
      bounded(base('jh_ab_shared_tasks').where('classId','==',identity.classId),5000).catch(()=>({docs:[]} as any)),
      bounded(base('jh_ab_shared_tasks').where('studentIds','array-contains',identity.id),5000).catch(()=>({docs:[]} as any))
    ]);

    const allFormative=unpack(formativeSnapshot).filter(f=>f.studentId===identity.id);
    const allSummative=unpack(sumSnapshot).filter(s=>s.studentId===identity.id);

    // Combine and deduplicate shared tasks
    const sharedTasksMap=new Map<string,DocumentData>();
    for(const doc of unpack(classSharedTasksSnap)) sharedTasksMap.set(doc.id,doc);
    for(const doc of unpack(studentSharedTasksSnap)) sharedTasksMap.set(doc.id,doc);
    const allSharedTasks=[...sharedTasksMap.values()].filter(t=>
      t.classId===identity.classId||(Array.isArray(t.studentIds)&&t.studentIds.includes(identity.id))
    );

    // Extract all distinct activity dates (YYYY-MM-DD)
    const dateSet=new Set<string>();
    for(const f of allFormative){const d=clean(f.date);if(/^\d{4}-\d{2}-\d{2}$/.test(d))dateSet.add(d);}
    for(const s of allSummative){const d=clean(s.date);if(/^\d{4}-\d{2}-\d{2}$/.test(d))dateSet.add(d);}
    for(const t of allSharedTasks){const d=clean(t.date);if(/^\d{4}-\d{2}-\d{2}$/.test(d))dateSet.add(d);}
    const availableDates=[...dateSet].sort();
    const latestDateWithRecords=availableDates.length?availableDates[availableDates.length-1]:null;

    // Resolve target date
    const reqDate=clean(dateParam);
    const selectedDate=reqDate&&/^\d{4}-\d{2}-\d{2}$/.test(reqDate)
      ? reqDate
      : (latestDateWithRecords||getTodayWIB());

    // Filter items on selectedDate
    const dateFormative=allFormative.filter(f=>f.date===selectedDate);
    const dateSummative=allSummative.filter(s=>s.date===selectedDate);
    const dateSharedTasks=allSharedTasks.filter(t=>t.date===selectedDate);

    // Fetch LO and LG metadata if there are items
    const loMap=new Map<string,DocumentData>();
    const lgMap=new Map<string,DocumentData>();
    if(dateFormative.length>0||dateSummative.length>0||dateSharedTasks.length>0){
      const [loSnapshot,lgSnapshot]=await Promise.all([
        bounded(base('jh_ab_los'),10000).catch(()=>({docs:[]} as any)),
        bounded(db.collection('learning_goals').where('unitId','==','JUNIOR_HIGH'),5000).catch(()=>({docs:[]} as any))
      ]);
      for(const lo of unpack(loSnapshot)) loMap.set(lo.id,lo);
      for(const lg of unpack(lgSnapshot)) lgMap.set(lg.id,lg);
    }

    const dailyItems:StudentDailyEntryItem[]=[];

    // 1. Formative items
    for(const f of dateFormative){
      const isUA=isUnitActivityItem(f);
      const actName=isUA?resolveUAActivityName(f):undefined;
      const cat=isUA?(resolveUACategory(f,actName||'',uaCategoryMap)||'Tanpa Kategori'):undefined;
      const catLabel=cat?(categories.find(c=>c.key===cat)?.label||cat):undefined;
      const catalogMatch=!isUA?findCatalogEntry(f.subjectId):undefined;
      const subjectKey=isUA?(cat||'ua'):(catalogMatch?.key||normalizeSubjectName(f.subjectId));
      const subjectLabel=isUA?(catLabel||cat||'Unit Aktivitas'):(catalogMatch?.label||clean(f.subjectId)||'Mata Pelajaran');

      const loDoc=f.loId?loMap.get(f.loId):undefined;
      const lgDoc=f.lgId?lgMap.get(f.lgId):undefined;

      // Complete history of assessments for this LO
      const loHistory=allFormative
        .filter(item=>item.loId===f.loId&&isUnitActivityItem(item)===isUA&&(!isUA||resolveUAActivityName(item)===actName))
        .sort((a,b)=>millis(b.createdAt)-millis(a.createdAt)||b.id.localeCompare(a.id))
        .map(publicResult);

      dailyItems.push({
        id:f.id,
        type:'FORMATIVE',
        date:f.date,
        isUA,
        subjectKey,
        subjectLabel,
        unitActivityName:actName,
        unitActivityCategory:cat,
        unitActivityCategoryLabel:catLabel,
        lgId:clean(f.lgId),
        lgCode:clean(lgDoc?.code),
        lgText:clean(lgDoc?.goalText),
        loId:clean(f.loId),
        loCode:clean(loDoc?.code)||'LO',
        loTitle:clean(loDoc?.title),
        score:clean(f.comprehensionLevel),
        task:clean(f.formativeTask)||'Kegiatan formatif',
        nextAction:clean(f.nextAction),
        teacherName:clean(f.teacherName),
        createdAt:millis(f.createdAt),
        correctedAt:millis(f.correctedAt),
        history:loHistory
      });
    }

    // 2. Summative items
    for(const s of dateSummative){
      const isUA=isUnitActivityItem(s);
      const actName=isUA?resolveUAActivityName(s):undefined;
      const cat=isUA?(resolveUACategory(s,actName||'',uaCategoryMap)||'Tanpa Kategori'):undefined;
      const catLabel=cat?(categories.find(c=>c.key===cat)?.label||cat):undefined;
      const catalogMatch=!isUA?findCatalogEntry(s.subjectId):undefined;
      const subjectKey=isUA?(cat||'ua'):(catalogMatch?.key||normalizeSubjectName(s.subjectId));
      const subjectLabel=isUA?(catLabel||cat||'Unit Aktivitas'):(catalogMatch?.label||clean(s.subjectId)||'Mata Pelajaran');
      const lgDoc=s.lgId?lgMap.get(s.lgId):undefined;

      dailyItems.push({
        id:s.id,
        type:'SUMMATIVE',
        date:s.date,
        isUA,
        subjectKey,
        subjectLabel,
        unitActivityName:actName,
        unitActivityCategory:cat,
        unitActivityCategoryLabel:catLabel,
        lgId:clean(s.lgId),
        lgCode:clean(lgDoc?.code),
        lgText:clean(lgDoc?.goalText),
        score:clean(s.summativeScore),
        task:clean(s.summativeTask)||'Asesmen sumatif',
        teacherName:clean(s.teacherName),
        createdAt:millis(s.createdAt)
      });
    }

    // 3. Shared tasks (unassessed activities)
    for(const t of dateSharedTasks){
      const isUA=isUnitActivityItem(t);
      const actName=isUA?resolveUAActivityName(t):undefined;
      const alreadyAssessed=dateFormative.some(f=>
        f.loId===t.loId&&(isUA?resolveUAActivityName(f)===actName:isSameJHSubject(f.subjectId,t.subjectId))
      );
      if(alreadyAssessed)continue;

      const cat=isUA?(resolveUACategory(t,actName||'',uaCategoryMap)||'Tanpa Kategori'):undefined;
      const catLabel=cat?(categories.find(c=>c.key===cat)?.label||cat):undefined;
      const catalogMatch=!isUA?findCatalogEntry(t.subjectId):undefined;
      const subjectKey=isUA?(cat||'ua'):(catalogMatch?.key||normalizeSubjectName(t.subjectId));
      const subjectLabel=isUA?(catLabel||cat||'Unit Aktivitas'):(catalogMatch?.label||clean(t.subjectId)||'Mata Pelajaran');

      const loDoc=t.loId?loMap.get(t.loId):undefined;
      const lgDoc=t.lgId?lgMap.get(t.lgId):undefined;

      dailyItems.push({
        id:t.id,
        type:'SHARED_TASK',
        date:t.date,
        isUA,
        subjectKey,
        subjectLabel,
        unitActivityName:actName,
        unitActivityCategory:cat,
        unitActivityCategoryLabel:catLabel,
        lgId:clean(t.lgId),
        lgCode:clean(lgDoc?.code),
        lgText:clean(lgDoc?.goalText),
        loId:clean(t.loId),
        loCode:clean(loDoc?.code)||'LO',
        loTitle:clean(loDoc?.title),
        score:undefined,
        task:clean(t.formativeTask)||'Kegiatan Asesmen',
        teacherName:clean(t.teacherName),
        createdAt:millis(t.createdAt)
      });
    }

    // Group items into dailySections
    const sectionsMap=new Map<string,StudentDailySection>();
    for(const item of dailyItems){
      const sectionKey=item.isUA
        ? `UA_${item.unitActivityCategory||'UNCATEGORIZED'}`
        : `REG_${item.subjectKey}`;
      if(!sectionsMap.has(sectionKey)){
        sectionsMap.set(sectionKey,{
          key:sectionKey,
          title:item.isUA
            ? `${item.unitActivityCategoryLabel||item.unitActivityCategory||'Unit Aktivitas'} (UA)`
            : item.subjectLabel,
          isUA:item.isUA,
          category:item.unitActivityCategory,
          categoryLabel:item.unitActivityCategoryLabel,
          items:[]
        });
      }
      sectionsMap.get(sectionKey)!.items.push(item);
    }

    // Sort sections: academic subjects first, then UA categories
    const dailySections=[...sectionsMap.values()].sort((a,b)=>{
      if(!a.isUA&&b.isUA)return -1;
      if(a.isUA&&!b.isUA)return 1;
      if(!a.isUA&&!b.isUA){
        const idxA=subjects.findIndex(s=>s.key===a.items[0]?.subjectKey);
        const idxB=subjects.findIndex(s=>s.key===b.items[0]?.subjectKey);
        if(idxA!==-1&&idxB!==-1)return idxA-idxB;
        return a.title.localeCompare(b.title);
      }
      const idxA=categories.findIndex(c=>c.key===a.category);
      const idxB=categories.findIndex(c=>c.key===b.category);
      if(idxA!==-1&&idxB!==-1)return idxA-idxB;
      return a.title.localeCompare(b.title);
    });

    // Backward compatibility for subject or activity queries
    const subject=subjectKey?subjects.find(item=>item.key===subjectKey):undefined;
    const activity=activityId?activitiesMap.get(activityId):undefined;
    const selected=subject?{key:subject.key,label:subject.label,kind:'SUBJECT' as const}:activity?{key:activity.id,label:activity.name,kind:'UNIT_ACTIVITY' as const}:null;
    const goals=selected?await resultFor(db,identity,year,semester,subjectKey,activity||null):null;

    const body:StudentProgressPayload={
      version:1,
      student:identity,
      academicYear:year,
      semester,
      availableYears,
      availableDates,
      latestDateWithRecords,
      selectedDate,
      subjects:subjects.map(item=>({key:item.key,label:item.label})),
      activities,
      dailySections,
      warnings:[...new Set(warnings)],
      feedbackPolicy:'INTERNAL_NOTES_NOT_SHARED',
      selected,
      goals
    };
    send(200,body);
  }catch(error){
    if(error instanceof PublicError){send(error.status,{error:error.message,code:error.code});return;}
    const code=clean((error as {code?:unknown})?.code);
    console.error('[StudentLearningProgress]',{code:code||'INTERNAL_ERROR'});
    send(503,{error:code==='9'||code==='failed-precondition'?'Query Learning Progress membutuhkan pemeriksaan indeks. Hubungi administrator.':'Learning Progress belum dapat dimuat. Hubungi administrator jika masalah berulang.',code:'PROGRESS_UNAVAILABLE'});
  }
}

