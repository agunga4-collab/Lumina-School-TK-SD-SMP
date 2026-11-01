import assert from 'node:assert/strict';
import { createElementaryMonthlySELService, canManageSELRubrics, monthLabel, validateNarrativeForSELReview } from '../server/elementaryMonthlySEL.server';
import { createElementaryMonthlyPhotoService, canManageMonthlyPhotoClass } from '../server/elementaryMonthlyDrivePhoto.server';
import { createBlankSELRubric, SEL_LEVELS, normalizeSELAchievement, renderSELText, validateSELRubric, selSourceFingerprint, assembleRubricSEL, validateSELSource } from '../src/lib/elementaryMonthlySELBank';
import type { SELRubric, ElementaryMonthlySelSource } from '../src/types/elementaryMonthlyReport';

// A transaction mock with staged atomic writes and serialized concurrency. No SDK connection is created.
class MemoryDB {
  rows = new Map<string, any>();
  failCommit = false;
  queue: Promise<any> = Promise.resolve();
  snapshot(path: string) { const value = this.rows.get(path); return { id: path.split('/').at(-1), exists: value !== undefined, data: () => value === undefined ? undefined : structuredClone(value) }; }
  collection(name: string) {
    const query = (filters: any[] = []): any => ({
      doc: (id: string) => ({ path: `${name}/${id}`, get: async () => this.snapshot(`${name}/${id}`) }),
      where: (key: string, op: string, value: any) => { assert.equal(op, '=='); return query([...filters,[key,value]]); },
      get: async () => ({ docs: [...this.rows.entries()].filter(([path,value]) => path.startsWith(name+'/') && path.split('/').length === 2 && filters.every(([k,v]) => value[k] === v)).map(([path]) => this.snapshot(path)) })
    });
    return query();
  }
  async runTransaction(fn: any) {
    const run = this.queue.then(async () => {
      const writes: any[] = [];
      let writing = false;
      const result = await fn({
        get: async (r: any) => { assert.equal(writing,false,'All reads precede writes'); return this.snapshot(r.path); },
        set: (r: any,v: any) => { writing=true; writes.push([r.path,structuredClone(v)]); },
        update: (r: any,v: any) => { writing=true; assert.ok(this.rows.has(r.path)); writes.push([r.path,{...structuredClone(this.rows.get(r.path)),...structuredClone(v)}]); }
      });
      if (this.failCommit) throw new Error('Simulated storage failure');
      for (const [path,value] of writes) this.rows.set(path,value);
      return result;
    });
    this.queue=run.catch(()=>undefined);
    return run;
  }
}
let count=0;
function check(condition: unknown, title: string) { assert.ok(condition,title); count++; console.log(`PASS ${count}: ${title}`); }
async function rejects(fn: () => Promise<any>, code: string, title: string) { await assert.rejects(fn, (e: any)=>e.code===code); count++; console.log(`PASS ${count}: ${title}`); }
async function main() {
  const db = new MemoryDB();
  const admin: any={uid:'admin',name:'Admin',profile:{status:'active',role:'HEAD_UNIT',unitId:'ELEMENTARY'}};
  const teacher: any={uid:'teacher',name:'Teacher',profile:{status:'active',role:'TEACHER',unitId:'ELEMENTARY'}};
  const stranger: any={uid:'stranger',name:'Other',profile:{status:'active',role:'TEACHER',unitId:'ELEMENTARY'}};
  const period={academicYear:'2026/2027',semester:'1',month:'2026-10',gradeLevel:1};
  for (const id of ['a','b']) db.rows.set('classes/'+id,{name:'1'+id,unitId:'ELEMENTARY',status:'active',academicYear:period.academicYear,grade:1,homeroomTeacherId:'teacher'});
  db.rows.set('students/student',{name:'Contoh Siswa',nickname:'Contoh',classId:'a',academicYear:period.academicYear,status:'active'});
  db.rows.set('users/teacher',teacher.profile);
  const photos = createElementaryMonthlyPhotoService({getDb:()=>db,getDrive:()=>{throw new Error('Drive must never be called');},verifyIdToken:async token=>{if(token==='valid')return{uid:'teacher'};throw new Error('Invalid');}});
  const service=createElementaryMonthlySELService({getDb:()=>db,authorize:photos.authorizeScope,now:()=>12345});
  const ctx={classId:'a',studentId:'student',...period};
  check(canManageSELRubrics(admin),'Authorized Elementary head can manage rubrics');
  check(!canManageSELRubrics(teacher),'Teacher cannot manage rubrics');
  check(!canManageSELRubrics({...admin,profile:{...admin.profile,unitId:'JUNIOR_HIGH'}}),'Other unit head cannot manage rubrics');
  check(!canManageSELRubrics({...admin,profile:{...admin.profile,status:'inactive'}}),'Inactive admin cannot manage rubrics');
  check(canManageMonthlyPhotoClass(teacher,db.rows.get('classes/a'))&&!canManageMonthlyPhotoClass(stranger,db.rows.get('classes/a')),'Real assignment checker distinguishes assigned and other teachers');
  await rejects(()=>photos.authenticate('Bearer bad'),'PHOTO_AUTH_INVALID','Invalid token rejected by existing authentication');
  check((await photos.authenticate('Bearer valid')).uid==='teacher','Verified identity uses stored profile');
  await rejects(()=>service.context(stranger,ctx),'PHOTO_SCOPE_DENIED','Unassigned teacher cannot load class rubric');
  await rejects(()=>service.narrative(stranger,{...ctx,action:'save'}),'PHOTO_SCOPE_DENIED','Unassigned teacher cannot save student');
  await rejects(()=>service.saveRubric(teacher,{rubric:{}}),'SEL_ADMIN_REQUIRED','Backend rejects teacher configuration writes');
  const blank=createBlankSELRubric(period);
  check(blank.classIds.length===0,'Recipient classes default empty');
  check(blank.aspects.every(a=>SEL_LEVELS.every(l=>a.levels[l].every(v=>v.text===''))),'All default wording empty');
  check(createBlankSELRubric({...period,gradeLevel:3}).aspects.map(a=>a.title).join(',')==='Empati,Motivasi Diri,Komunikasi','Grade 3 aspects preserved');
  check(normalizeSELAchievement('SD')==='SB'&&normalizeSELAchievement('')==='','Legacy SD aliases SB; empty remains unassessed');
  check(renderSELText('{namaSiswa} / {namaPanggilan} / {bulan} / {kelas}',{namaSiswa:'A',namaPanggilan:'B',bulan:'C',kelas:'D'})==='A / B / C / D','All four placeholders render deterministically');
  let rubric: SELRubric={...blank,id:'rubric1'};
  rubric=(await service.saveRubric(admin,{rubric,expectedRevision:0})).rubric;
  check(rubric.status==='DRAFT','Incomplete draft persists');
  await rejects(()=>service.applyRubric(admin,{rubricId:rubric.id,expectedRevision:rubric.revision}),'SEL_INCOMPLETE','Incomplete draft cannot be applied');
  rubric={...rubric,name:'Rubrik contoh uji',classIds:['a','b'],opening:'Catatan {namaPanggilan}:',closing:'Penutup {bulan} {kelas}.',aspects:rubric.aspects.map(a=>({...a,levels:Object.fromEntries(SEL_LEVELS.map(l=>[l,[{id:'v1',text:`${a.title} ${l} untuk {namaSiswa}.`},{id:'v2',text:`Varian dua ${l} {namaPanggilan}.`}]])) as any}))};
  check(!validateSELRubric(rubric).length,'Fully populated mixed-level rubric validates');
  rubric=(await service.saveRubric(admin,{rubric,expectedRevision:rubric.revision})).rubric;
  const retry=(await service.saveRubric(admin,{rubric,expectedRevision:0})).rubric;
  check(retry.revision===rubric.revision,'Identical save retry does not allocate revision');
  await rejects(()=>service.saveRubric(admin,{rubric:{...rubric,name:'stale'},expectedRevision:0}),'SEL_DRAFT_CONFLICT','Concurrent draft edits rejected');
  const double=await Promise.all([service.applyRubric(admin,{rubricId:rubric.id,expectedRevision:rubric.revision}),service.applyRubric(admin,{rubricId:rubric.id,expectedRevision:rubric.revision})]);
  check(double.every(r=>r.results.length===2)&&[...db.rows.keys()].filter(k=>k.startsWith('elem_monthly_sel_bindings/')).length===2,'Concurrent double-click creates one binding per class');
  const afterApply=await service.saveRubric(admin,{rubric,expectedRevision:rubric.revision});
  check(afterApply.rubric.status==='APPLIED','Lost apply response recovered by save/apply retry');
  rubric=afterApply.rubric;
  await rejects(()=>service.saveRubric(admin,{rubric:{...rubric,name:'overwrite'},expectedRevision:rubric.revision}),'SEL_IMMUTABLE','Applied version is immutable');
  let next: SELRubric={...rubric,id:'rubric2',previousId:rubric.id,revision:0,status:'DRAFT' as const,name:'Version 2'};
  next=(await service.saveRubric(admin,{rubric:next,expectedRevision:0})).rubric;
  check(next.version===2,'New version tracks previous version');
  let conflicts: any[]=[];
  try{await service.applyRubric(admin,{rubricId:next.id,expectedRevision:next.revision});assert.fail();}catch(e:any){assert.equal(e.code,'SEL_BINDING_CONFLICT');conflicts=e.details.conflicts;}
  check(conflicts.length===2,'Conflict returns every affected class');
  check((await service.context(teacher,ctx)).rubric.id===rubric.id,'Conflict does not partially replace any bindings');
  // A new competing binding revision invalidates a previously displayed confirmation.
  const firstBinding=[...db.rows.entries()].find(([k,v])=>k.startsWith('elem_monthly_sel_bindings/')&&v.classId==='a')!;
  db.rows.set(firstBinding[0],{...firstBinding[1],revision:firstBinding[1].revision+1});
  await rejects(()=>service.applyRubric(admin,{rubricId:next.id,expectedRevision:next.revision,confirmReplacement:true,conflicts}),'SEL_BINDING_CONFLICT','Stale replacement confirmation rejected after concurrent binding change');
  try{await service.applyRubric(admin,{rubricId:next.id,expectedRevision:next.revision});}catch(e:any){conflicts=e.details.conflicts;}
  db.failCommit=true;
  await assert.rejects(()=>service.applyRubric(admin,{rubricId:next.id,expectedRevision:next.revision,confirmReplacement:true,conflicts}));
  db.failCommit=false;
  check((await service.context(teacher,ctx)).rubric.id===rubric.id,'Storage failure leaves all bindings unchanged');
  await service.applyRubric(admin,{rubricId:next.id,expectedRevision:next.revision,confirmReplacement:true,conflicts});
  check((await service.context(teacher,ctx)).rubric.id===next.id,'Confirmed replacement applies all classes');
  check((await service.applyRubric(admin,{rubricId:rubric.id,expectedRevision:rubric.revision})).results.every(r=>r.status==='SUPERSEDED'),'Retry old apply never reactivates replaced rubric');
  let source: ElementaryMonthlySelSource={schemaVersion:2,rubricId:next.id,rubricVersion:next.version,classId:'a',academicYear:period.academicYear,semester:period.semester,month:period.month,opening:next.opening,closing:next.closing,
    placeholders:{namaSiswa:'Contoh Siswa',namaPanggilan:'Contoh',bulan:monthLabel(period.month),kelas:'1a'},aspects:{}};
  next={...next,status:'APPLIED'};
  check(validateSELSource(source,next).length>0&&assembleRubricSEL(source,next)==='','Unassessed source produces no fabricated narrative');
  for(const [index,a]of next.aspects.entries()) { const achievement=index===0?'MB':'SAB';const variant=a.levels[achievement][index];source.aspects![a.key]={achievement,variantId:variant.id,selectedText:renderSELText(variant.text,source.placeholders!),teacherNote:index?'Catatan individual.':''}; }
  check(!validateSELSource(source,next).length,'Mixed achievements and variants remain separate');
  const text=assembleRubricSEL(source,next);
  check(text.includes('MB')&&text.includes('SAB')&&text.includes('Catatan individual.'),'Assembly uses exact selections and individual note');
  source={...source,lastAssembledText:text,assembledFingerprint:selSourceFingerprint(source),isManuallyEdited:false};
  const nar={academicComment:'Komentar akademik contoh yang memadai.',selProfile:text,selSource:source};
  let saved=(await service.narrative(teacher,{...ctx,action:'save',narrativeDoc:nar,expectedRevision:0})).narrativeDoc;
  const stored=(await service.narrative(teacher,{...ctx,action:'save',narrativeDoc:nar,expectedRevision:0})).narrativeDoc;
  check(stored.revision===saved.revision&&stored.selSource.aspects[next.aspects[0].key].achievement==='MB','Save/retry/reload preserves source and final without duplicate revision');
  await rejects(()=>service.narrative(teacher,{...ctx,action:'save',narrativeDoc:{...nar,selProfile:'Concurrent text'},expectedRevision:0}),'SEL_NARRATIVE_CONFLICT','Stale student save rejected');
  await rejects(()=>service.narrative(teacher,{...ctx,action:'save',narrativeDoc:{...nar,selSource:{...source,classId:'b'}},expectedRevision:saved.revision}),'SEL_SOURCE_SCOPE','Cross-class source rejected');
  const modified=structuredClone(source); modified.aspects![next.aspects[0].key].teacherNote='changed';
  check(validateNarrativeForSELReview({...saved,selSource:modified},next).some(e=>e.includes('Sumber berubah')),'Source edits require a new accepted assembly');
  check(!validateNarrativeForSELReview({...saved,selProfile:'Narasi final yang diedit manual.',selSource:{...source,isManuallyEdited:true}},next).length,'Manual final edits are allowed with complete unchanged assembled source');
  const forged=structuredClone(source); forged.aspects![next.aspects[0].key].selectedText='Invented';
  check(validateSELSource(forged,next).some(e=>e.includes('snapshot')),'Forged wording snapshot rejected at review');
  saved=(await service.narrative(teacher,{...ctx,action:'submit'})).narrativeDoc;
  check(saved.reviewStatus==='SUBMITTED','Complete rubric narrative submits');
  await rejects(()=>service.narrative(teacher,{...ctx,action:'save',narrativeDoc:nar,expectedRevision:saved.revision}),'SEL_LOCKED','Submitted content locked at backend');
  await rejects(()=>service.narrative(teacher,{...ctx,action:'approve'}),'SEL_ADMIN_REQUIRED','Teacher cannot approve own narrative');
  await rejects(()=>service.narrative(admin,{...ctx,action:'revision',reviewNotes:''}),'SEL_REVIEW_NOTE','Revision requires feedback');
  saved=(await service.narrative(admin,{...ctx,action:'revision',reviewNotes:'Periksa catatan.'})).narrativeDoc;
  check(saved.reviewStatus==='NEEDS_REVISION','Review can request revision');
  await service.narrative(teacher,{...ctx,action:'submit'});
  db.rows.set('elem_monthly_student_scores/'+saved.id,{scores:{lo:90}});
  await rejects(()=>service.narrative(admin,{...ctx,action:'approve'}),'SEL_SCORES_CHANGED','Score change after submit blocks approval');
  await service.narrative(teacher,{...ctx,action:'unlock'});
  await service.narrative(teacher,{...ctx,action:'submit'});
  saved=(await service.narrative(admin,{...ctx,action:'approve'})).narrativeDoc;
  check(saved.reviewStatus==='APPROVED','Re-submitted current sources can be approved');
  await rejects(()=>service.narrative(teacher,{...ctx,action:'unlock'}),'SEL_ADMIN_REQUIRED','Approved unlock requires authorized reviewer');
  saved=(await service.narrative(admin,{...ctx,action:'unlock'})).narrativeDoc;
  check(saved.reviewStatus==='DRAFT'&&!saved.reviewedBy,'Authorized unlock resets approval before content changes');
  // Version replacement must not modify student data or force adoption of the newest rubric.
  const third=(await service.saveRubric(admin,{rubric:{...next,id:'rubric3',previousId:next.id,revision:0,name:'Third version'},expectedRevision:0})).rubric;
  let c3:any[]=[];try{await service.applyRubric(admin,{rubricId:third.id,expectedRevision:third.revision});}catch(e:any){c3=e.details.conflicts;}
  await service.applyRubric(admin,{rubricId:third.id,expectedRevision:third.revision,confirmReplacement:true,conflicts:c3});
  check((await service.context(teacher,{...ctx,rubricId:next.id})).pinnedRubric.id===next.id,'Older pinned rubric remains readable after replacement');
  saved=(await service.narrative(teacher,{...ctx,action:'save',narrativeDoc:{...nar,selProfile:'Final manual tetap pada versi dua.'},expectedRevision:saved.revision})).narrativeDoc;
  check(saved.selSource.rubricId===next.id,'New active version does not overwrite student pinned version or final');
  await service.narrative(teacher,{...ctx,action:'submit'});
  const legacy={...saved,selSource:{templateVersion:'v1',aspects:{old:{mode:'custom',customText:'Observasi lama.'}}},reviewStatus:'DRAFT'};
  db.rows.set('elem_monthly_student_narratives/'+saved.id,legacy);
  check(!validateNarrativeForSELReview(legacy as any,null).length,'Legacy narrative remains valid without rubric migration or inferred achievement');
  await service.narrative(teacher,{...ctx,action:'submit'});
  const copied=(await service.saveRubric(admin,{rubric:{...third,id:'copy-period',previousId:third.id,revision:0,month:'2026-11',classIds:[]},expectedRevision:0})).rubric;
  check(copied.status==='DRAFT'&&copied.classIds.length===0&&!('selSource'in copied)&&!('selProfile'in copied),'Period copy persists definition only, no student sources or narratives');
  const before=[...db.rows.entries()];
  const badClass={...third,id:'bad-class',revision:0,classIds:['wrong']}; db.rows.set('classes/wrong',{...db.rows.get('classes/a'),grade:2});
  await rejects(()=>service.saveRubric(admin,{rubric:badClass,expectedRevision:0}),'SEL_CLASS_GRADE','Recipient grade mismatch rejected by backend');
  db.rows.set('classes/wrong-unit',{...db.rows.get('classes/a'),unitId:'JUNIOR_HIGH'});
  await rejects(()=>service.saveRubric(admin,{rubric:{...third,id:'wrong-unit-rubric',revision:0,classIds:['wrong-unit']},expectedRevision:0}),'PHOTO_SCOPE_DENIED','Recipient other unit rejected');
  db.rows.set('classes/wrong-year',{...db.rows.get('classes/a'),academicYear:'2025/2026'});
  await rejects(()=>service.saveRubric(admin,{rubric:{...third,id:'wrong-year-rubric',revision:0,classIds:['wrong-year']},expectedRevision:0}),'PHOTO_SCOPE_DENIED','Recipient other academic year rejected');
  check(before.filter(([k])=>k.startsWith('elem_monthly_student_narratives/')).length===1,'No batch migration or duplicate student documents created');
  console.log(`\n${count} SEL assertions passed. All database/auth calls are mocks; no real Firestore, account, Drive or deployment tested.`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
