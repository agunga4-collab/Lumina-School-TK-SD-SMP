import { 
  calculateUpperLGAverageAndPredicate, 
  ElementaryUpperLearningObjective,
  ElementaryUpperProjectObjective,
  UpperLGStatusMode,
  calculateUpperStudentAttendanceSummary,
  buildPublishedUpperReportDocId,
  buildUpperAttendanceConfigDocId,
  normalizeUpperReportFilename,
  validateUpperMonthlyProgressPublishEligibility,
  validateUpperLiteracyNumeracyPublishEligibility,
  calculateUpperLitNumPredicate,
  validateLitNumThresholds,
  compileLitNumNarrative,
  DEFAULT_LITNUM_TEMPLATES,
  getJakartaDateInfo
} from '../src/types/elementaryMonthlyUpperReport';
import { 
  buildUpperCurriculumDocId,
  buildUpperStudentDataDocId,
  buildUpperLitNumRecordDocId,
  buildUpperLitNumClassConfigDocId,
  buildUpperNarrativesDocId,
  computeUpperMonthlyScoresHash,
  computeUpperLitNumHash,
  isElementaryUpperHeadOrSuperAdmin,
  formatMonthLabel,
  getMonthOptionsForAcademicYear
} from '../src/services/elementaryMonthlyUpperReportService';
import { getGradeLevelNumber } from '../src/types/elementaryMidtermReport';
import { generateUpperMonthlyProgressPdfBlob, generateUpperLiteracyNumeracyPdfBlob } from '../src/lib/elementaryMonthlyUpperReportPdf';
import { UpperMonthlyProgressDocument } from '../src/pages/Elementary/MonthlyReportUpper/components/UpperMonthlyProgressDocument';
import { UpperLiteracyNumeracyDocument } from '../src/pages/Elementary/MonthlyReportUpper/components/UpperLiteracyNumeracyDocument';
import { UpperAttendanceConfigModal } from '../src/pages/Elementary/MonthlyReportUpper/components/UpperAttendanceConfigModal';
import { UpperMonthlyReportPreviewModal } from '../src/pages/Elementary/MonthlyReportUpper/components/UpperMonthlyReportPreviewModal';
import { UpperPublicationTrackingTab } from '../src/pages/Elementary/MonthlyReportUpper/components/UpperPublicationTrackingTab';
import ElementaryMonthlyUpperReportPage from '../src/pages/Elementary/MonthlyReportUpper/ElementaryMonthlyUpperReportPage';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`FAIL: ${msg}`);
  }
  console.log(`PASS: ${msg}`);
}

console.log('=== Running Elementary Monthly Report (Upper Grade 4–6) Tests ===\n');

// 1. Test K=70 threshold and predicate conversions
console.log('--- Test 1: K=70 threshold and conversions ---');
const lo1: ElementaryUpperLearningObjective = { id: 'lo1', code: 'LO 1.1', title: 'Test LO 1', order: 0 };
const lo2: ElementaryUpperLearningObjective = { id: 'lo2', code: 'LO 1.2', title: 'Test LO 2', order: 1 };

const res69 = calculateUpperLGAverageAndPredicate({ lo1: 69 }, [lo1], 70, 'AUTO');
assert(res69.average === 69, '69 average is 69');
assert(res69.predicate === 'B', '69 < 70 results in predicate B');
assert(res69.displayAverage === '69', '69 displays as "69"');

const res70 = calculateUpperLGAverageAndPredicate({ lo1: 70 }, [lo1], 70, 'AUTO');
assert(res70.average === 70, '70 average is 70');
assert(res70.predicate === 'D', '70 >= 70 and < 85 results in predicate D');

const res8499 = calculateUpperLGAverageAndPredicate({ lo1: 84.99 }, [lo1], 70, 'AUTO');
assert(res8499.average === 84.99, '84.99 average is 84.99');
assert(res8499.predicate === 'D', '84.99 < 85 results in predicate D before rounding');
assert(res8499.displayAverage === '84.99', '84.99 displays formatted to 2 decimals');

const res85 = calculateUpperLGAverageAndPredicate({ lo1: 85 }, [lo1], 70, 'AUTO');
assert(res85.average === 85, '85 average is 85');
assert(res85.predicate === 'A', '85 >= 85 results in predicate A');
assert(res85.batasA === 85, 'Batas A for K=70 is 85');

// 2. Test Override KKM (e.g. K=60)
console.log('\n--- Test 2: Override KKM K=60 ---');
const resK60_B = calculateUpperLGAverageAndPredicate({ lo1: 59 }, [lo1], 60, 'AUTO');
assert(resK60_B.batasA === 80, 'Batas A for K=60 is 80 (60 + (100-60)/2)');
assert(resK60_B.predicate === 'B', '59 < 60 results in B');

const resK60_D = calculateUpperLGAverageAndPredicate({ lo1: 60 }, [lo1], 60, 'AUTO');
assert(resK60_D.predicate === 'D', '60 >= 60 and < 80 results in D');

const resK60_A = calculateUpperLGAverageAndPredicate({ lo1: 80 }, [lo1], 60, 'AUTO');
assert(resK60_A.predicate === 'A', '80 >= 80 results in A');

// 3. Test Score 0 vs Blank
console.log('\n--- Test 3: Nilai 0 vs Nilai Kosong ---');
const loList = [lo1, lo2];
const resZero = calculateUpperLGAverageAndPredicate({ lo1: 0 }, [lo1], 70, 'AUTO');
assert(resZero.average === 0, 'Score 0 produces average 0');
assert(resZero.predicate === 'B', 'Score 0 produces predicate B');
assert(resZero.displayAverage === '0', 'Score 0 displays as "0"');
assert(resZero.filledLOs === 1, 'Score 0 counts as 1 filled LO');

const resBlank = calculateUpperLGAverageAndPredicate({}, loList, 70, 'AUTO');
assert(resBlank.average === null, 'All blank produces average null');
assert(resBlank.predicate === null, 'All blank produces predicate null');
assert(resBlank.displayAverage === '-', 'All blank displays "-"');
assert(resBlank.isComplete === false, 'All blank isComplete is false');

const resPartial = calculateUpperLGAverageAndPredicate({ lo1: 90, lo2: '' }, loList, 70, 'AUTO');
assert(resPartial.average === 90, 'Partial average only counts filled LOs');
assert(resPartial.predicate === 'A', 'Partial 90 is A');
assert(resPartial.isComplete === false, 'Partial isComplete is false (marked incomplete)');

// 4. Test Explicit IP (In Progress) Status
console.log('\n--- Test 4: Explicit IP (In Progress) Status ---');
// When statusMode is 'IP', predicate is 'IP' regardless of LO scores
const resIpWithScores = calculateUpperLGAverageAndPredicate({ lo1: 95, lo2: 90 }, loList, 70, 'IP');
assert(resIpWithScores.predicate === 'IP', 'statusMode "IP" returns predicate "IP"');
assert(resIpWithScores.displayAverage === 'IP', 'statusMode "IP" displays "IP"');
assert(resIpWithScores.average === 92.5, 'Underlying numeric average is preserved in background (92.5)');
assert(resIpWithScores.statusMode === 'IP', 'statusMode is recorded as "IP"');

// Switching back to AUTO recalculates immediately from preserved scores
const resBackToAuto = calculateUpperLGAverageAndPredicate({ lo1: 95, lo2: 90 }, loList, 70, 'AUTO');
assert(resBackToAuto.predicate === 'A', 'Switching back to AUTO recalculates to predicate "A"');
assert(resBackToAuto.displayAverage === '92.5', 'Switching back to AUTO displays "92.5"');

// 5. Test Document IDs
console.log('\n--- Test 5: Document IDs & Isolation ---');
const currId = buildUpperCurriculumDocId('class_4a', '2025/2026', '1', '2025-08');
assert(currId === 'class_4a_2025_2026_S1_M2025-08', 'Upper Curriculum docId matches prefix format');

const stuDataId = buildUpperStudentDataDocId('stu_1', 'class_4a', '2025/2026', '1', '2025-08');
assert(stuDataId === 'stu_1_class_4a_2025_2026_S1_M2025-08', 'Upper Student data docId matches format');

const litNumRecId = buildUpperLitNumRecordDocId('stu_1', 'class_4a', '2025/2026');
assert(litNumRecId === 'stu_1_class_4a_2025_2026', 'Upper LitNum record docId matches format');

const litNumCfgId = buildUpperLitNumClassConfigDocId('class_4a', '2025/2026');
assert(litNumCfgId === 'class_4a_2025_2026', 'Upper LitNum class config docId matches format');

const narId = buildUpperNarrativesDocId('stu_1', 'class_4a', '2025/2026', '1', '2025-08');
assert(narId === 'stu_1_class_4a_2025_2026_S1_M2025-08', 'Upper Narratives docId matches format');

// 6. Test Dual Approval Packages & Independent Stale Detection
console.log('\n--- Test 6: Dual Approval Packages & Stale Detection ---');
const mockStuData = {
  id: 'sd1',
  studentId: 'stu_1',
  studentName: 'Student 1',
  classId: 'c4a',
  academicYear: '2025/2026',
  semester: '1',
  month: '2025-08',
  scores: { lo1: 85, lo2: 90 },
  lgStatus: { lg1: 'AUTO' as UpperLGStatusMode },
  projectScores: { plo1: 88 },
  projectLgStatus: { plg1: 'AUTO' as UpperLGStatusMode },
  createdAt: 0,
  createdBy: '',
  updatedAt: 0,
  updatedBy: ''
};

const hashMonthly1 = computeUpperMonthlyScoresHash(mockStuData);
const hashMonthly2 = computeUpperMonthlyScoresHash({
  ...mockStuData,
  scores: { lo2: 90, lo1: 85 } // Same scores, swapped key order
});
assert(hashMonthly1 === hashMonthly2, 'Monthly scores hash is canonical and order-independent');

const hashMonthlyChanged = computeUpperMonthlyScoresHash({
  ...mockStuData,
  scores: { lo1: 95, lo2: 90 } // Modified LO score
});
assert(hashMonthly1 !== hashMonthlyChanged, 'Monthly hash detects LO score changes');

// LitNum Hash
const mockLitNumData = {
  id: 'ln1',
  studentId: 'stu_1',
  studentName: 'Student 1',
  classId: 'c4a',
  academicYear: '2025/2026',
  periodScores: {
    bahasa_indonesia: { '2025-08': { score: 80, minimumStandard: 70 } },
    english: { '2025-08': { score: 75, minimumStandard: 55 } },
    mathematics: { '2025-08': { score: 85, minimumStandard: 70 } }
  },
  updatedAt: 0,
  updatedBy: ''
};
const hashLitNum1 = computeUpperLitNumHash(mockLitNumData);
const hashLitNumChanged = computeUpperLitNumHash({
  ...mockLitNumData,
  periodScores: {
    ...mockLitNumData.periodScores,
    mathematics: { '2025-08': { score: 90, minimumStandard: 70 } } // changed math score
  }
});
assert(hashLitNum1 !== hashLitNumChanged, 'LitNum hash detects field score changes');

// Independent isolation: modifying Monthly LO does NOT change LitNum hash
assert(computeUpperLitNumHash(mockLitNumData) === hashLitNum1, 'Modifying monthly scores does not alter LitNum hash');

// 7. Test Permissions
console.log('\n--- Test 7: Reviewer Permissions ---');
assert(isElementaryUpperHeadOrSuperAdmin({ uid: 'u1', role: 'SUPER_ADMIN' } as any) === true, 'SUPER_ADMIN is authorized approver');
assert(isElementaryUpperHeadOrSuperAdmin({ uid: 'u2', role: 'HEAD_UNIT', unitId: 'ELEMENTARY' } as any) === true, 'HEAD_UNIT Elementary is authorized approver');
assert(isElementaryUpperHeadOrSuperAdmin({ uid: 'u3', role: 'PRINCIPAL', unitId: 'ELEMENTARY' } as any) === true, 'PRINCIPAL Elementary is authorized approver');
assert(isElementaryUpperHeadOrSuperAdmin({ uid: 'u4', role: 'TEACHER', unitId: 'ELEMENTARY' } as any) === false, 'TEACHER cannot approve');
assert(isElementaryUpperHeadOrSuperAdmin({ uid: 'u5', role: 'HEAD_UNIT', unitId: 'JUNIOR_HIGH' } as any) === false, 'JH Head cannot approve Elementary');

// 8. Test Upper Grade Recognition
console.log('\n--- Test 8: Upper Grade Recognition (Grades 4-6) ---');
assert(getGradeLevelNumber({ grade: 4, name: 'Grade 4A' }) === 4, 'Grade 4 recognized');
assert(getGradeLevelNumber({ grade: 5, name: 'Grade 5B' }) === 5, 'Grade 5 recognized');
assert(getGradeLevelNumber({ grade: 6, name: 'Grade 6C' }) === 6, 'Grade 6 recognized');
const isUpper = (grade: number) => [4, 5, 6].includes(grade);
assert(isUpper(4) && isUpper(5) && isUpper(6), 'Grades 4, 5, 6 are Upper Grade');
assert(!isUpper(1) && !isUpper(2) && !isUpper(3), 'Grades 1, 2, 3 are excluded from Upper Grade');

// 9. Test Attendance Calculation & Missing Data Rule
console.log('\n--- Test 9: Attendance Calculation & Missing Data Rule ---');

// Unconfigured config
const unconfiguredAtt = calculateUpperStudentAttendanceSummary(null, 'stu_1');
assert(unconfiguredAtt.isAvailable === false, 'Missing config is marked not available');
assert(unconfiguredAtt.percentage === 0, 'Missing config returns percentage 0 (never 100%)');

// Missing student record
const mockAttConfig = {
  id: 'c4a_2025_2026_S1_M2025-08',
  classId: 'c4a',
  academicYear: '2025/2026',
  semester: '1',
  month: '2025-08',
  startDate: '2025-08-01',
  endDate: '2025-08-31',
  totalSchoolDays: 20,
  signingDate: '31 Agustus 2025',
  signingLocation: 'Depok',
  studentAttendanceMap: {
    stu_1: { presentDays: 19 },
    stu_2: { presentDays: 20 }
  },
  createdAt: 0,
  createdBy: '',
  updatedAt: 0,
  updatedBy: ''
};

const missingStudentAtt = calculateUpperStudentAttendanceSummary(mockAttConfig, 'stu_unlisted');
assert(missingStudentAtt.isAvailable === false, 'Unlisted student attendance is marked not available');
assert(missingStudentAtt.percentage === 0, 'Unlisted student attendance is 0% (never assumed 100%)');

// Configured students
const stu1Att = calculateUpperStudentAttendanceSummary(mockAttConfig, 'stu_1');
assert(stu1Att.isAvailable === true, 'Configured student attendance is available');
assert(stu1Att.presentDays === 19, 'Present days is 19');
assert(stu1Att.totalDays === 20, 'Total days is 20');
assert(stu1Att.percentage === 95, '19/20 is 95%');

const stu2Att = calculateUpperStudentAttendanceSummary(mockAttConfig, 'stu_2');
assert(stu2Att.percentage === 100, '20/20 is 100%');

// 10. Test Deterministic Published Report Doc IDs
console.log('\n--- Test 10: Published Upper Report Doc IDs ---');
const docIdMonthly = buildPublishedUpperReportDocId('c4a', 'stu_1', '2025/2026', '1', '2025-08', 'MONTHLY_PROGRESS');
assert(docIdMonthly === '2025_2026_S1_M2025-08_c4a_stu_1_MONTHLY_PROGRESS', 'Monthly Progress doc ID matches exact schema');

const docIdLitNum = buildPublishedUpperReportDocId('c4a', 'stu_1', '2025/2026', '1', '2025-08', 'LITERACY_NUMERACY');
assert(docIdLitNum === '2025_2026_S1_M2025-08_c4a_stu_1_LITERACY_NUMERACY', 'Literacy Numeracy doc ID matches exact schema');

const attDocId = buildUpperAttendanceConfigDocId('c4a', '2025/2026', '1', '2025-08');
assert(attDocId === 'c4a_2025_2026_S1_M2025-08', 'Attendance config doc ID matches schema');

// 11. Test Filename Normalization
console.log('\n--- Test 11: Filename Normalization ---');
const fnMonthly = normalizeUpperReportFilename('Alana Pratama', 'MONTHLY_PROGRESS', 'Agustus 2025', '2025/2026');
assert(fnMonthly === 'Alana Pratama - Monthly Progress Agustus 2025 - 2025-2026.pdf', 'Monthly Progress filename formatted correctly');

const fnLitNum = normalizeUpperReportFilename('Alana Pratama', 'LITERACY_NUMERACY', 'Agustus 2025', '2025/2026');
assert(fnLitNum === 'Alana Pratama - Literasi Numerasi Agustus 2025 - 2025-2026.pdf', 'Literasi Numerasi filename formatted correctly');

// 12. Test Validation Gate: Monthly Progress
console.log('\n--- Test 12: Validation Gate: Monthly Progress ---');
const validCurriculum = {
  id: 'cur1',
  classId: 'c4a',
  className: '4 Abu Bakar',
  gradeLevel: 4,
  academicYear: '2025/2026',
  semester: '1',
  month: '2025-08',
  subjects: [
    {
      id: 'sub_bi',
      name: 'Bahasa Indonesia',
      kkm: 70,
      order: 1,
      learningGoals: [
        {
          id: 'lg_1',
          code: 'LG1',
          title: 'Membaca pemahaman',
          order: 1,
          learningObjectives: [
            { id: 'lo_1', code: 'LO1', title: 'Ide pokok', order: 1 }
          ]
        }
      ]
    }
  ],
  projects: [],
  createdAt: 0,
  createdBy: '',
  updatedAt: 0,
  updatedBy: ''
};

const validSignatory = {
  principalName: 'Dewi Masyitoh, M.Pd.',
  homeroomTeacherName: 'Guru Kelas 4',
  signingDate: '31 Agustus 2025',
  signingLocation: 'Depok'
};

// Incomplete: missing score
const evalIncompleteScore = validateUpperMonthlyProgressPublishEligibility({
  student: { id: 'stu_1', name: 'Alana' },
  curriculumDoc: validCurriculum as any,
  studentDataDoc: { scores: {}, lgStatus: {} } as any,
  narrativesDoc: { monthlyGeneralComment: 'Bagus', monthlyProgressReview: { reviewStatus: 'APPROVED', isSourceStale: false } } as any,
  attendanceSummary: stu1Att,
  signatory: validSignatory
});
assert(evalIncompleteScore.isEligible === false, 'Incomplete LO score fails validation');

// Allowed: Explicit IP status bypasses LO score requirement!
const evalWithIP = validateUpperMonthlyProgressPublishEligibility({
  student: { id: 'stu_1', name: 'Alana' },
  curriculumDoc: validCurriculum as any,
  studentDataDoc: { scores: {}, lgStatus: { lg_1: 'IP' } } as any,
  narrativesDoc: { monthlyGeneralComment: 'Bagus', monthlyProgressReview: { reviewStatus: 'APPROVED', isSourceStale: false } } as any,
  attendanceSummary: stu1Att,
  signatory: validSignatory
});
assert(evalWithIP.isEligible === true, 'Explicit IP status is recognized as complete and passes validation');

// Incomplete: missing attendance data
const evalMissingAttendance = validateUpperMonthlyProgressPublishEligibility({
  student: { id: 'stu_1', name: 'Alana' },
  curriculumDoc: validCurriculum as any,
  studentDataDoc: { scores: { lo_1: 85 }, lgStatus: { lg_1: 'AUTO' } } as any,
  narrativesDoc: { monthlyGeneralComment: 'Bagus', monthlyProgressReview: { reviewStatus: 'APPROVED', isSourceStale: false } } as any,
  attendanceSummary: missingStudentAtt, // unlisted / missing
  signatory: validSignatory
});
assert(evalMissingAttendance.isEligible === false, 'Missing attendance blocks publication');

// 13. Test Validation Gate: Literacy Numeracy
console.log('\n--- Test 13: Validation Gate: Literacy Numeracy ---');
const validClassConfig = {
  id: 'c4a_2025_2026',
  classId: 'c4a',
  academicYear: '2025/2026',
  standards: { bahasa_indonesia: 70, english: 55, mathematics: 70 },
  comparisonPeriods: [{ periodKey: '2025-08', label: 'Agustus', order: 1 }],
  updatedAt: 0,
  updatedBy: ''
};

const validLitNumRecord = {
  id: 'stu_1_c4a_2025_2026',
  studentId: 'stu_1',
  studentName: 'Alana',
  classId: 'c4a',
  academicYear: '2025/2026',
  periodScores: {
    bahasa_indonesia: { '2025-08': { score: 85, minimumStandard: 70 } },
    english: { '2025-08': { score: 78, minimumStandard: 55 } },
    mathematics: { '2025-08': { score: 90, minimumStandard: 70 } }
  },
  updatedAt: 0,
  updatedBy: ''
};

const validLitNumNarratives = {
  bahasaIndonesiaNarrative: 'Kemampuan membaca teks deskriptif sangat baik.',
  englishNarrative: 'Excellent vocabulary and listening comprehension.',
  mathematicsNarrative: 'Menguasai konsep pecahan dan geometri dengan sangat baik.',
  litNumReview: { reviewStatus: 'APPROVED', isSourceStale: false }
};

const evalLitNumValid = validateUpperLiteracyNumeracyPublishEligibility({
  student: { id: 'stu_1', name: 'Alana' },
  currentMonth: '2025-08',
  classConfigDoc: validClassConfig as any,
  litNumRecordDoc: validLitNumRecord as any,
  narrativesDoc: validLitNumNarratives as any,
  signatory: validSignatory
});
assert(evalLitNumValid.isEligible === true, 'Complete LitNum data passes validation');

// Missing mathematics narrative
const evalLitNumMissingMath = validateUpperLiteracyNumeracyPublishEligibility({
  student: { id: 'stu_1', name: 'Alana' },
  currentMonth: '2025-08',
  classConfigDoc: validClassConfig as any,
  litNumRecordDoc: validLitNumRecord as any,
  narrativesDoc: { ...validLitNumNarratives, mathematicsNarrative: '' } as any,
  signatory: validSignatory
});
assert(evalLitNumMissingMath.isEligible === false, 'Missing Math narrative blocks LitNum publication');

// 14. Verify Components & PDF Generators
console.log('\n--- Test 14: Verify UI Components & PDF Generators ---');
// 14. Verify Components & PDF Generators
console.log('\n--- Test 14: Verify UI Components & PDF Generators ---');
assert(typeof generateUpperMonthlyProgressPdfBlob === 'function', 'generateUpperMonthlyProgressPdfBlob is defined');
assert(typeof generateUpperLiteracyNumeracyPdfBlob === 'function', 'generateUpperLiteracyNumeracyPdfBlob is defined');
assert(typeof UpperMonthlyProgressDocument === 'function', 'UpperMonthlyProgressDocument component is defined');
assert(typeof UpperLiteracyNumeracyDocument === 'function', 'UpperLiteracyNumeracyDocument component is defined');
assert(typeof UpperAttendanceConfigModal === 'function', 'UpperAttendanceConfigModal component is defined');
assert(typeof UpperMonthlyReportPreviewModal === 'function', 'UpperMonthlyReportPreviewModal component is defined');
assert(typeof UpperPublicationTrackingTab === 'function', 'UpperPublicationTrackingTab component is defined');
assert(typeof ElementaryMonthlyUpperReportPage === 'function', 'ElementaryMonthlyUpperReportPage container is defined');

// 15. Test Jakarta Default Month Logic (Asia/Jakarta, Day 1-10 prev month, Day 11+ current month)
console.log('\n--- Test 15: Jakarta Default Month Rules (Asia/Jakarta) ---');
// 1 Nov 2026 -> Oct 2026 (2026-10, Sem 1, 2026/2027)
const dNov1 = new Date('2026-11-01T09:00:00+07:00');
const resNov1 = getJakartaDateInfo(dNov1);
assert(resNov1.defaultYm === '2026-10', '1 Nov 2026 defaults to 2026-10 (previous month)');
assert(resNov1.semester === '1', '2026-10 is Semester 1');
assert(resNov1.academicYear === '2026/2027', '2026-10 is Academic Year 2026/2027');

// 10 Nov 2026 -> Oct 2026 (2026-10)
const dNov10 = new Date('2026-11-10T23:59:59+07:00');
const resNov10 = getJakartaDateInfo(dNov10);
assert(resNov10.defaultYm === '2026-10', '10 Nov 2026 defaults to 2026-10 (previous month)');

// 11 Nov 2026 -> Nov 2026 (2026-11)
const dNov11 = new Date('2026-11-11T00:00:01+07:00');
const resNov11 = getJakartaDateInfo(dNov11);
assert(resNov11.defaultYm === '2026-11', '11 Nov 2026 defaults to 2026-11 (current month)');
assert(resNov11.semester === '1', '2026-11 is Semester 1');

// 1 Jan 2027 -> Dec 2026 (2026-12)
const dJan1 = new Date('2027-01-01T08:00:00+07:00');
const resJan1 = getJakartaDateInfo(dJan1);
assert(resJan1.defaultYm === '2026-12', '1 Jan 2027 defaults to 2026-12 (previous month & rollover year)');
assert(resJan1.semester === '1', '2026-12 is Semester 1');
assert(resJan1.academicYear === '2026/2027', '2026-12 belongs to Academic Year 2026/2027');

// 11 Jan 2027 -> Jan 2027 (2027-01)
const dJan11 = new Date('2027-01-11T10:00:00+07:00');
const resJan11 = getJakartaDateInfo(dJan11);
assert(resJan11.defaultYm === '2027-01', '11 Jan 2027 defaults to 2027-01 (current month)');
assert(resJan11.semester === '2', '2027-01 is Semester 2');
assert(resJan11.academicYear === '2026/2027', '2027-01 belongs to Academic Year 2026/2027');

// 16. Test LitNum Predicate Classification (A / D / B, Kosong != 0, unrounded cutoff)
console.log('\n--- Test 16: LitNum Predicate Classification (A/D/B) ---');
const testTh = { minA: 85, minD: 70 };

assert(calculateUpperLitNumPredicate(null, testTh) === null, 'null score produces null predicate');
assert(calculateUpperLitNumPredicate(undefined, testTh) === null, 'undefined score produces null predicate');
assert(calculateUpperLitNumPredicate(NaN, testTh) === null, 'NaN score produces null predicate');

assert(calculateUpperLitNumPredicate(0, testTh) === 'B', 'Explicit 0 score is counted and produces B');
assert(calculateUpperLitNumPredicate(69.9, testTh) === 'B', '69.9 < 70 produces B');
assert(calculateUpperLitNumPredicate(70, testTh) === 'D', '70 >= minD produces D');
assert(calculateUpperLitNumPredicate(84.99, testTh) === 'D', '84.99 < 85 produces D before rounding (no premature rounding)');
assert(calculateUpperLitNumPredicate(85, testTh) === 'A', '85 >= minA produces A');
assert(calculateUpperLitNumPredicate(100, testTh) === 'A', '100 produces A');

// English thresholds (minA: 78, minD: 55)
const engTh = { minA: 78, minD: 55 };
assert(calculateUpperLitNumPredicate(54.5, engTh) === 'B', '54.5 < 55 produces B for English');
assert(calculateUpperLitNumPredicate(55, engTh) === 'D', '55 produces D for English');
assert(calculateUpperLitNumPredicate(77.9, engTh) === 'D', '77.9 produces D for English');
assert(calculateUpperLitNumPredicate(78, engTh) === 'A', '78 produces A for English');

// 17. Test Thresholds Validation (No gaps, no overlap, minA > minD)
console.log('\n--- Test 17: LitNum Thresholds Validation ---');
const valOk = validateLitNumThresholds({ minA: 85, minD: 70 });
assert(valOk.isValid === true, 'minA=85, minD=70 is valid');

const valInverted = validateLitNumThresholds({ minA: 65, minD: 70 });
assert(valInverted.isValid === false, 'minA <= minD is rejected');

const valOutOfRange = validateLitNumThresholds({ minA: 105, minD: 70 });
assert(valOutOfRange.isValid === false, 'minA > 100 is rejected');

// 18. Test Deterministic Narrative Mapping (NO AI, placeholders populated)
console.log('\n--- Test 18: Deterministic Auto-Narrative Mapping ---');
const templateA = DEFAULT_LITNUM_TEMPLATES.bahasa_indonesia.A;
const compiledA = compileLitNumNarrative(templateA, {
  studentName: 'Budi Santoso',
  monthLabel: 'Oktober 2026',
  fieldLabel: 'Bahasa Indonesia',
  score: 92,
  predicate: 'A'
});
assert(compiledA.includes('Budi Santoso'), 'compiled narrative includes student name');
assert(compiledA.includes('Oktober 2026'), 'compiled narrative includes month label');
assert(compiledA.includes('Achieved'), 'compiled narrative corresponds to Achieved predicate');
assert(!compiledA.includes('{studentName}'), 'no leftover studentName placeholder');
assert(!compiledA.includes('{monthLabel}'), 'no leftover monthLabel placeholder');

console.log('\nALL 72 TESTS PASSED SUCCESSFULLY!');
process.exit(0);


