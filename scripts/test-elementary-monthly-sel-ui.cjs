/* Optional local UI harness: npm install --no-save jsdom @testing-library/dom @testing-library/user-event.
 * All services are replaced while bundling this harness. No live Firebase/Drive requests are made. */
const path=require('node:path');
const fs=require('node:fs');
const os=require('node:os');
const assert=require('node:assert/strict');
const esbuild=require('esbuild');
const extra=process.env.LUMINA_TEST_NODE_MODULES;
const extraRequire=name=>extra?require(path.join(extra,name)):require(name);
const {JSDOM}=extraRequire('jsdom');
const {getByRole,getByLabelText,findByText,waitFor}=extraRequire('@testing-library/dom');
const userEvent=extraRequire('@testing-library/user-event').default;
const project=path.resolve(__dirname,'..');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'lumina-sel-ui-'));
(async()=>{
 const serviceMock=`
 export { computeStudentScoresHash, isElementaryHeadOrSuperAdmin } from '${project}/src/lib/elementaryMonthlyReportCore';
 export const fetchElementaryMonthlyStudentNarratives=(...a)=>window.__mock.load(...a);
 export const saveElementaryMonthlyStudentNarrativeDoc=(...a)=>window.__mock.save(...a);
 export const submitElementaryMonthlyNarrativeForReview=async()=>{};
 export const bulkSubmitElementaryMonthlyNarratives=async()=>0;
 export const reviewElementaryMonthlyNarrative=async()=>{};
 export const bulkApproveElementaryMonthlyNarratives=async()=>0;
 export const unlockElementaryMonthlyNarrativeForEdit=async()=>{};
 export const refineElementaryMonthlyNarrativeAI=async()=>'';
 `;
 const rubricMock=`
 export const fetchMonthlySELContext=async input=>window.__mock.context(input);
 export const listMonthlySELRubrics=async input=>window.__mock.list(input);
 export const saveMonthlySELRubric=async rubric=>window.__mock.saveRubric(rubric);
 export const applyMonthlySELRubric=async()=>({results:[]});
 export class SELRequestError extends Error {}
 `;
 const entry=`
 import React from 'react'; import {createRoot} from 'react-dom/client';
 import {NarrativeAndApprovalTab} from '${project}/src/pages/Elementary/MonthlyReport/components/NarrativeAndApprovalTab';
 import {createBlankSELRubric,SEL_LEVELS} from '${project}/src/lib/elementaryMonthlySELBank';
 const period={academicYear:'2026/2027',semester:'1',month:'2026-10',gradeLevel:1};
 const rubric={...createBlankSELRubric(period),id:'r1',version:1,status:'APPLIED',name:'Rubrik uji',classIds:['a','b'],opening:'Pembuka {namaSiswa}.',closing:'Penutup {kelas}.',aspects:createBlankSELRubric(period).aspects.map(a=>({...a,levels:Object.fromEntries(SEL_LEVELS.map(l=>[l,[{id:'v1',text:a.title+' '+l+' {namaPanggilan}.'}]]))}))};
 window.__mock={fail:false,docs:{},pending:{},defer:false,
 load(cls,year,semester,month){return this.defer?new Promise(resolve=>{this.pending[cls]=resolve;}):Promise.resolve(this.docs[cls+':'+month]||{});},
 async save(payload){if(this.fail)throw new Error('mock save failed');payload.revision=(payload.revision||0)+1;const key=payload.classId+':'+payload.month;this.docs[key]={...this.docs[key],[payload.studentId]:JSON.parse(JSON.stringify(payload))};this.docs[payload.classId]=this.docs[key];},
 list(input){return {classes:input.gradeLevel===1?[{id:'a',name:'1a'},{id:'b',name:'1b'}]:[{id:'c',name:'2c'}],rubrics:[]};},
 async saveRubric(r){this.savedRubric=JSON.parse(JSON.stringify({...r,createdAt:1,revision:r.revision+1}));return {rubric:this.savedRubric};},
 context(input){return {rubric:this.noRubric?null:rubric,pinnedRubric:input.rubricId?rubric:null,binding:null,canManage:false};}};
 const root=createRoot(document.getElementById('root'));
 window.mount=(cls='a',month='2026-10',isAdmin=false)=>root.render(<NarrativeAndApprovalTab curriculumDoc={null} studentScoresMap={{}} students={[{id:'s1',name:'Alice',nickname:'Ali'},{id:'s2',name:'Bob'}]} selectedClass={{id:cls,name:'1'+cls,grade:1}} selectedYear="2026/2027" selectedSemester="1" selectedMonth={month} monthLabel={month==='2026-11'?'November 2026':'Oktober 2026'} currentUser={{uid:isAdmin?'admin':'teacher',role:isAdmin?'HEAD_UNIT':'TEACHER',status:'active',unitId:'ELEMENTARY'}}/>);
 window.mount();
 `;
 await esbuild.build({stdin:{contents:entry,loader:'tsx',resolveDir:project},outfile:path.join(temporary,'ui.js'),bundle:true,platform:'browser',format:'iife',jsx:'automatic',plugins:[{name:'mocks',setup(build){
 build.onResolve({filter:/services\/elementaryMonthlyReportService$/},()=>({path:'report',namespace:'mock'}));
 build.onResolve({filter:/services\/elementaryMonthlySELService$/},()=>({path:'sel',namespace:'mock'}));
 build.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:args.path==='report'?serviceMock:rubricMock,loader:'ts',resolveDir:project}));
 }}]});

 const dom=new JSDOM('<div id="root"></div>',{runScripts:'dangerously',url:'http://localhost',pretendToBeVisual:true});
 const window=dom.window; const document=window.document;
 const errors=[];window.addEventListener('error',e=>errors.push(e.message));
 let network=0;window.fetch=()=>{network++;throw new Error('Network forbidden in this harness');};
 window.confirm=()=>true;
 window.eval(fs.readFileSync(path.join(temporary,'ui.js'),'utf8'));
 const user=userEvent.setup({document});
 const button=name=>getByRole(document.body,'button',{name,exact:true});
 const final=()=>[...document.querySelectorAll('textarea')].at(-1);
 const wait=fn=>waitFor(fn,{container:document.body,timeout:3000});
 const fill=async(element,text)=>{await user.clear(element);if(text)await user.type(element,text);};
 let checks=0;const pass=text=>{checks++;console.log('PASS '+checks+': '+text);};
 await wait(()=>assert.ok(button('Gunakan rubrik aktif (mulai Belum dinilai)')));
 await user.click(button('Gunakan rubrik aktif (mulai Belum dinilai)'));
 await wait(()=>assert.ok(getByLabelText(document.body,'Capaian Disiplin Diri')));
 assert.equal(getByLabelText(document.body,'Capaian Disiplin Diri').value,'');assert.equal(getByLabelText(document.body,'Capaian Keterlibatan Sosial').value,'');pass('Every aspect starts unassessed');
 await user.selectOptions(getByLabelText(document.body,'Capaian Disiplin Diri'),'MB');
 await user.selectOptions(getByLabelText(document.body,'Capaian Keterlibatan Sosial'),'SAB');
 await fill(final(),'Narasi final manual yang harus tetap aman.');
 await user.click(button('Susun Narasi SEL'));await findByText(document.body,'Konfirmasi Timpa Narasi Final');
 await user.click(button('Batal (Pertahankan Editan)'));assert.equal(final().value,'Narasi final manual yang harus tetap aman.');pass('Cancel assembly preserves manually edited final');
 await user.click(button('Susun Narasi SEL'));await user.click(button('Ya, Ganti Narasi Final'));
 assert.match(final().value,/Disiplin Diri MB Ali/);assert.match(final().value,/Keterlibatan Sosial SAB Ali/);pass('Accepted assembly keeps mixed achievements without AI');
 const assembled=final().value;
 await fill(document.querySelectorAll('fieldset fieldset textarea')[0],'Catatan individual terbaru.');assert.equal(final().value,assembled);pass('Changing source does not overwrite final');
 await user.click(button('Simpan Draf'));await findByText(document.body,'Tersimpan',{exact:true});
 assert.equal(window.__mock.docs.a.s1.selSource.aspects.disiplin_diri.teacherNote,'Catatan individual terbaru.');pass('Save includes structured source and final');
 await fill(final(),'Draf yang tidak boleh hilang setelah simpan gagal.');window.__mock.fail=true;
 await user.click(getByRole(document.body,'button',{name:/Bob/}));await findByText(document.body,'Gagal simpan',{exact:true});
 assert.equal(final().value,'Draf yang tidak boleh hilang setelah simpan gagal.');assert.ok(getByRole(document.body,'heading',{name:'Alice',exact:true}));pass('Failed save blocks student switch and retains draft');
 window.mount('b');await findByText(document.body,'Draf baru',{exact:true});assert.equal(final().value,'');pass('Other class starts with its own empty final');
 window.mount('a');await findByText(document.body,'Belum disimpan',{exact:true});assert.equal(final().value,'Draf yang tidak boleh hilang setelah simpan gagal.');pass('Returning to class restores unsaved draft with sources');
 window.__mock.fail=false;await user.click(button('Simpan Draf'));await findByText(document.body,'Tersimpan',{exact:true});
 await user.click(getByRole(document.body,'button',{name:/Bob/}));await wait(()=>assert.ok(getByRole(document.body,'heading',{name:'Bob',exact:true})));assert.equal(final().value,'');pass('Successful switch does not carry prior student final');
 window.mount('a','2026-11');await wait(()=>assert.ok(getByRole(document.body,'heading',{name:/Narasi.*November 2026/})));await wait(()=>assert.equal(document.querySelector('fieldset').disabled,false));await findByText(document.body,'Draf baru',{exact:true});assert.equal(final().value,'');pass('Different period never inherits another period final');
 window.mount('a','2026-10');await wait(()=>assert.ok(getByRole(document.body,'heading',{name:/Narasi.*Oktober 2026/})));await wait(()=>assert.equal(document.querySelector('fieldset').disabled,false));await findByText(document.body,'Tersimpan',{exact:true});assert.equal(final().value,'Draf yang tidak boleh hilang setelah simpan gagal.');pass('Saved source and final restore after period switch');
 window.__mock.noRubric=true;window.mount('empty');await wait(()=>assert.ok(document.body.textContent.includes('Rubrik aktif belum tersedia.')));await wait(()=>assert.equal(document.querySelector('fieldset').disabled,false));
 await fill(final(),'Narasi manual tetap dapat ditulis tanpa rubrik.');assert.equal(final().value,'Narasi manual tetap dapat ditulis tanpa rubrik.');pass('Missing rubric keeps manual final editable without fabricated source');window.__mock.noRubric=false;
 window.__mock.defer=true;window.mount('c');await wait(()=>assert.ok(window.__mock.pending.c));
 window.mount('d');await wait(()=>assert.ok(window.__mock.pending.d));
 window.__mock.pending.d({s1:{studentId:'s1',academicComment:'D academic',selProfile:'Final D',reviewStatus:'DRAFT',revision:1}});await wait(()=>assert.equal(final().value,'Final D'));
 window.__mock.pending.c({s1:{studentId:'s1',academicComment:'C academic',selProfile:'WRONG C',reviewStatus:'DRAFT',revision:1}});
 await new Promise(resolve=>setTimeout(resolve,20));assert.equal(final().value,'Final D');pass('Late load response cannot cross class context');
 window.__mock.defer=false;window.mount('a','2026-10',true);
 await wait(()=>assert.equal(button('Pengaturan Rubrik SEL').closest('fieldset').disabled,false));
 await user.click(button('Pengaturan Rubrik SEL'));
 const dialog=await wait(()=>getByRole(document.body,'dialog',{name:'Konfigurasi rubrik SEL'}));
 await wait(()=>assert.equal(dialog.querySelectorAll('input[type=checkbox]').length,3));
 assert.equal([...dialog.querySelectorAll('input[type=checkbox]')].filter(i=>i.checked).length,0);
 assert.ok([...dialog.querySelectorAll('textarea')].every(t=>t.value===''));pass('Admin config starts with empty recipients and empty school wording');
 await user.click(getByLabelText(dialog,'Pilih semua kelas dalam paralel ini'));
 assert.equal([...dialog.querySelectorAll('input[type=checkbox]')].filter(i=>i.checked).length,3);pass('Admin select-all selects every eligible class');
 await user.click(getByRole(dialog,'button',{name:'Simpan Draf',exact:true}));
 await wait(()=>assert.ok(window.__mock.savedRubric));assert.equal(window.__mock.savedRubric.status,'DRAFT');assert.equal(window.__mock.savedRubric.classIds.length,2);pass('Incomplete admin draft saves one shared rubric definition');
 await user.click(getByRole(dialog,'button',{name:'Salin ke periode lain sebagai draf',exact:true}));
 assert.equal([...dialog.querySelectorAll('input[type=checkbox]')].filter(i=>i.checked).length,0);pass('Period copy clears recipients and creates draft');
 await user.click(getByRole(dialog,'button',{name:'Simpan Draf',exact:true}));
 await wait(()=>assert.equal(window.__mock.savedRubric.classIds.length,0));
 assert.ok(window.__mock.savedRubric.previousId);assert.equal('selSource' in window.__mock.savedRubric,false);assert.equal('selProfile' in window.__mock.savedRubric,false);pass('Admin copy carries no student achievements, notes or narrative');
 await user.click(getByRole(dialog,'button',{name:'Tutup',exact:true}));
 assert.deepEqual(errors,[]);assert.equal(network,0);pass('Real React components render without runtime errors or external requests');
 console.log(checks+' local JSDOM UI assertions passed. Firebase/auth/Drive services mocked.');
 window.close();
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>fs.rmSync(temporary,{recursive:true,force:true}));
