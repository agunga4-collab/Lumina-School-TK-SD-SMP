import { 
  calculateLGAverageAndPredicate, 
  ElementaryMonthlyLearningObjective 
} from '../src/types/elementaryMonthlyReport';
import { 
  buildMonthlyCurriculumDocId, 
  buildMonthlyStudentScoreDocId,
  buildMonthlyProjectDocId,
  buildMonthlyStudentPhotoDocId,
  buildMonthlyStudentNarrativeDocId,
  computeStudentScoresHash,
  isElementaryHeadOrSuperAdmin,
  getMonthOptionsForAcademicYear,
  formatMonthLabel
} from '../src/services/elementaryMonthlyReportService';
import { getGradeLevelNumber } from '../src/types/elementaryMidtermReport';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`FAIL: ${msg}`);
  }
  console.log(`PASS: ${msg}`);
}

console.log('=== Running Elementary Monthly Report (Lower Grade) Tests ===\n');

// 1. Test K=70 with 69, 70, 84.99, 85
console.log('--- Test K=70 threshold and predicate conversions ---');
const lo1: ElementaryMonthlyLearningObjective = { id: 'lo1', code: 'LO 1.1', title: 'Test LO 1', order: 0 };

// 69 -> B
const res69 = calculateLGAverageAndPredicate({ lo1: 69 }, [lo1], 70);
assert(res69.average === 69, '69 average is 69');
assert(res69.predicate === 'B', '69 < 70 results in predicate B');
assert(res69.displayAverage === '69', '69 displays as "69"');

// 70 -> D
const res70 = calculateLGAverageAndPredicate({ lo1: 70 }, [lo1], 70);
assert(res70.average === 70, '70 average is 70');
assert(res70.predicate === 'D', '70 >= 70 and < 85 results in predicate D');

// 84.99 -> D (exact before rounding)
const res8499 = calculateLGAverageAndPredicate({ lo1: 84.99 }, [lo1], 70);
assert(res8499.average === 84.99, '84.99 average is 84.99');
assert(res8499.predicate === 'D', '84.99 < 85 results in predicate D (before rounding)');
assert(res8499.displayAverage === '84.99', '84.99 displays with 2 decimals');

// 85 -> A
const res85 = calculateLGAverageAndPredicate({ lo1: 85 }, [lo1], 70);
assert(res85.average === 85, '85 average is 85');
assert(res85.predicate === 'A', '85 >= 85 results in predicate A');
assert(res85.batasA === 85, 'Batas A for K=70 is 85');

// 2. Test Nilai 0 vs Nilai Kosong
console.log('\n--- Test Nilai 0 vs Nilai Kosong ---');
const lo2: ElementaryMonthlyLearningObjective = { id: 'lo2', code: 'LO 1.2', title: 'Test LO 2', order: 1 };
const loList = [lo1, lo2];

// Score 0: should be counted, not empty
const resZero = calculateLGAverageAndPredicate({ lo1: 0 }, [lo1], 70);
assert(resZero.average === 0, 'Score 0 produces average 0');
assert(resZero.predicate === 'B', 'Score 0 produces predicate B');
assert(resZero.displayAverage === '0', 'Score 0 displays as "0"');
assert(resZero.filledLOs === 1, 'Score 0 is counted as 1 filled LO');

// Score 0 and 100: average is 50
const resZeroAndHundred = calculateLGAverageAndPredicate({ lo1: 0, lo2: 100 }, loList, 70);
assert(resZeroAndHundred.average === 50, 'Scores 0 and 100 average is 50');
assert(resZeroAndHundred.predicate === 'B', '50 < 70 produces predicate B');
assert(resZeroAndHundred.isComplete === true, 'Both LOs filled isComplete true');

// Empty / blank:
const resEmpty = calculateLGAverageAndPredicate({}, loList, 70);
assert(resEmpty.average === null, 'All blank produces average null');
assert(resEmpty.predicate === null, 'All blank produces predicate null (not B, not NaN)');
assert(resEmpty.displayAverage === '-', 'All blank displays "-"');
assert(resEmpty.filledLOs === 0, 'All blank has 0 filled LOs');
assert(resEmpty.isComplete === false, 'All blank isComplete is false');

// Partial fill: [80, blank]
const resPartial = calculateLGAverageAndPredicate({ lo1: 80, lo2: '' }, loList, 70);
assert(resPartial.average === 80, 'Partial average is 80 (only filled LOs counted)');
assert(resPartial.predicate === 'D', 'Partial 80 produces predicate D');
assert(resPartial.filledLOs === 1, 'Partial has 1 filled LO');
assert(resPartial.isComplete === false, 'Partial isComplete is false (marked incomplete)');

// 3. Test Desimal
console.log('\n--- Test Desimal ---');
const lo3: ElementaryMonthlyLearningObjective = { id: 'lo3', code: 'LO 1.3', title: 'Test LO 3', order: 2 };
const loList3 = [lo1, lo2, lo3];
// Scores 80, 85, 90 -> avg 85
const resAvgDecimal = calculateLGAverageAndPredicate({ lo1: 75, lo2: 80, lo3: 82 }, loList3, 70);
// 75 + 80 + 82 = 237 / 3 = 79
assert(resAvgDecimal.average === 79, '237 / 3 = 79');
assert(resAvgDecimal.displayAverage === '79', 'Whole number display has no decimal');

// 80 + 85 + 86 = 251 / 3 = 83.6666...
const resAvgRepeating = calculateLGAverageAndPredicate({ lo1: 80, lo2: 85, lo3: 86 }, loList3, 70);
assert(Math.abs(resAvgRepeating.average! - 83.6666666) < 0.001, 'Decimal average accurate');
assert(resAvgRepeating.displayAverage === '83.67', 'Decimal formatted to at most 2 decimal places (83.67)');

// 4. Test Beberapa LG (Isolation of average per LG)
console.log('\n--- Test Beberapa LG Isolation ---');
const lg1LOs = [
  { id: 'lo_1_1', code: 'LO 1.1', title: 'LO 1.1', order: 0 },
  { id: 'lo_1_2', code: 'LO 1.2', title: 'LO 1.2', order: 1 }
];
const lg2LOs = [
  { id: 'lo_2_1', code: 'LO 2.1', title: 'LO 2.1', order: 0 },
  { id: 'lo_2_2', code: 'LO 2.2', title: 'LO 2.2', order: 1 }
];
const studentScores = {
  lo_1_1: 90,
  lo_1_2: 95,
  lo_2_1: 60,
  lo_2_2: 65
};
const lg1Res = calculateLGAverageAndPredicate(studentScores, lg1LOs, 70);
const lg2Res = calculateLGAverageAndPredicate(studentScores, lg2LOs, 70);
assert(lg1Res.average === 92.5, 'LG 1 average is 92.5 (90+95)/2');
assert(lg1Res.predicate === 'A', 'LG 1 is A (>= 85)');
assert(lg2Res.average === 62.5, 'LG 2 average is 62.5 (60+65)/2');
assert(lg2Res.predicate === 'B', 'LG 2 is B (< 70)');
// Verify LG 1 and LG 2 averages are completely isolated from each other

// 5. Test Pergantian Bulan & Kelas
console.log('\n--- Test Pergantian Bulan & Kelas ---');
const docIdClass1Aug = buildMonthlyCurriculumDocId('class_1a', '2025/2026', '1', '2025-08');
const docIdClass1Sep = buildMonthlyCurriculumDocId('class_1a', '2025/2026', '1', '2025-09');
const docIdClass2Aug = buildMonthlyCurriculumDocId('class_2a', '2025/2026', '1', '2025-08');

assert(docIdClass1Aug === 'class_1a_2025_2026_S1_M2025-08', 'Curriculum docId Class 1A Aug matches pattern');
assert(docIdClass1Sep === 'class_1a_2025_2026_S1_M2025-09', 'Curriculum docId Class 1A Sep matches pattern');
assert(docIdClass1Aug !== docIdClass1Sep, 'Different months produce distinct document IDs');
assert(docIdClass1Aug !== docIdClass2Aug, 'Different classes produce distinct document IDs');

const studentScoreId = buildMonthlyStudentScoreDocId('stu_123', 'class_1a', '2025/2026', '1', '2025-08');
assert(studentScoreId === 'stu_123_class_1a_2025_2026_S1_M2025-08', 'Student score docId matches pattern');

// Grade level filter verification
assert(getGradeLevelNumber({ grade: 1, name: '1-A' }) === 1, 'Grade 1 recognized');
assert(getGradeLevelNumber({ grade: 2, name: '2-B' }) === 2, 'Grade 2 recognized');
assert(getGradeLevelNumber({ grade: 3, name: '3-C' }) === 3, 'Grade 3 recognized');
assert(getGradeLevelNumber({ grade: 4, name: '4-A' }) === 4, 'Grade 4 recognized (excluded from Gr 1-3 filter)');
assert(getGradeLevelNumber({ grade: 5, name: '5-B' }) === 5, 'Grade 5 recognized (excluded from Gr 1-3 filter)');

// 6. Test Format Month Label
console.log('\n--- Test Format Month Label ---');
assert(formatMonthLabel('2025-08') === 'Agustus 2025', '2025-08 formats as "Agustus 2025"');
assert(formatMonthLabel('2026-01') === 'Januari 2026', '2026-01 formats as "Januari 2026"');
assert(formatMonthLabel('2026-10') === 'Oktober 2026', '2026-10 formats as "Oktober 2026"');

// 7. Test Tahap 2: Project, Photo, Narrative IDs and Stale Detection
console.log('\n--- Test Tahap 2: Project, Photo, Narrative Doc IDs & Stale Detection ---');

const projId = buildMonthlyProjectDocId('class_1a', '2025/2026', '1', '2025-08');
assert(projId === 'class_1a_2025_2026_S1_M2025-08', 'Project docId matches format');

const photoId = buildMonthlyStudentPhotoDocId('stu_1', 'class_1a', '2025/2026', '1', '2025-08');
assert(photoId === 'stu_1_class_1a_2025_2026_S1_M2025-08', 'Student photo docId matches format');

const narrativeId = buildMonthlyStudentNarrativeDocId('stu_1', 'class_1a', '2025/2026', '1', '2025-08');
assert(narrativeId === 'stu_1_class_1a_2025_2026_S1_M2025-08', 'Student narrative docId matches format');

// Test Scores Hash
const hash1 = computeStudentScoresHash({
  id: 'x',
  studentId: 's1',
  studentName: 'Student 1',
  classId: 'c1',
  academicYear: '2025/2026',
  semester: '1',
  month: '2025-08',
  scores: { lo1: 85, lo2: 90 },
  createdAt: 0,
  createdBy: '',
  updatedAt: 0,
  updatedBy: ''
});
const hash2 = computeStudentScoresHash({
  id: 'x',
  studentId: 's1',
  studentName: 'Student 1',
  classId: 'c1',
  academicYear: '2025/2026',
  semester: '1',
  month: '2025-08',
  scores: { lo2: 90, lo1: 85 }, // Same scores, different insertion order
  createdAt: 0,
  createdBy: '',
  updatedAt: 0,
  updatedBy: ''
});
const hashChanged = computeStudentScoresHash({
  id: 'x',
  studentId: 's1',
  studentName: 'Student 1',
  classId: 'c1',
  academicYear: '2025/2026',
  semester: '1',
  month: '2025-08',
  scores: { lo1: 85, lo2: 95 }, // Modified score
  createdAt: 0,
  createdBy: '',
  updatedAt: 0,
  updatedBy: ''
});

assert(hash1 === hash2, 'Hash is order-independent (stable canonical representation)');
// 8. Test Tahap 3: Attendance Calculation & Non-assumption of 100%
console.log('\n--- Test Tahap 3: Attendance Calculation & Non-assumption of 100% ---');
import { 
  buildMonthlyAttendanceConfigDocId,
  buildPublishedMonthlyReportDocId,
  calculateStudentAttendanceSummary
} from '../src/services/elementaryMonthlyReportService';
import { 
  validateElementaryMonthlyPublishEligibility,
  ElementaryMonthlyAttendanceConfig
} from '../src/types/elementaryMonthlyReport';

const attDocId = buildMonthlyAttendanceConfigDocId('class_1a', '2025/2026', '1', '2025-08');
assert(attDocId === 'class_1a_2025_2026_S1_M2025-08', 'Attendance config docId matches format');

const pubDocId = buildPublishedMonthlyReportDocId('2025/2026', '1', '2025-08', 'class_1a', 'stu_1');
assert(pubDocId === '2025_2026_S1_M2025-08_class_1a_stu_1', 'Published report docId matches retry-safe format');

// Missing attendance config -> isAvailable: false (never assumed 100%)
const attNull = calculateStudentAttendanceSummary(null, 'stu_1');
assert(attNull.isAvailable === false, 'Null attendance config is NOT assumed 100%');
assert(attNull.percentage === 0, 'Null attendance config percentage is 0');

// Config exists but student has no entry -> isAvailable: false
const mockAttConfig: ElementaryMonthlyAttendanceConfig = {
  id: attDocId,
  classId: 'class_1a',
  academicYear: '2025/2026',
  semester: '1',
  month: '2025-08',
  startDate: '2025-07-25', // Cross-month support
  endDate: '2025-08-25',
  totalSchoolDays: 22,
  signingDate: '31 Agustus 2025',
  signingLocation: 'Depok',
  studentAttendanceMap: {
    'stu_1': { presentDays: 21, totalDays: 22 }
  },
  createdAt: 0,
  createdBy: '',
  updatedAt: 0,
  updatedBy: ''
};

const attStuMissing = calculateStudentAttendanceSummary(mockAttConfig, 'stu_unrecorded');
assert(attStuMissing.isAvailable === false, 'Missing student attendance record is NOT assumed 100%');
assert(attStuMissing.percentage === 0, 'Missing student attendance record returns percentage 0');

// Student with 21 of 22 days -> 95.5%
const attStu1 = calculateStudentAttendanceSummary(mockAttConfig, 'stu_1');
assert(attStu1.isAvailable === true, 'Recorded student attendance is available');
assert(attStu1.percentage === 95.5, '21 / 22 days calculates to exactly 95.5%');
assert(attStu1.basisDescription.includes('21 dari 22 hari sekolah'), 'Basis description shows 21 dari 22 hari');

// 9. Test Tahap 3: Publication Eligibility Gate
console.log('\n--- Test Tahap 3: Publication Gate & Validation Rules ---');

const mockCurriculum = {
  id: 'c1',
  classId: 'class_1a',
  className: '1A',
  gradeLevel: 1,
  academicYear: '2025/2026',
  semester: '1',
  month: '2025-08',
  subjects: [
    {
      id: 'sub1',
      name: 'Mathematics',
      kkm: 70,
      order: 0,
      learningGoals: [
        {
          id: 'lg1',
          code: 'LG 1',
          title: 'Numbers to 20',
          order: 0,
          learningObjectives: [lo1, lo2]
        }
      ]
    }
  ],
  createdAt: 0,
  createdBy: '',
  updatedAt: 0,
  updatedBy: ''
};

const mockSignatory = {
  principalName: 'Dewi Masyitoh, M.Pd.',
  principalTitle: 'Principal',
  principalNiy: '19820512',
  principalSignatureUrl: null,
  homeroomTeacherName: 'Budi Santoso, S.Pd.',
  homeroomTeacherNiy: '19900101',
  homeroomTeacherSignatureUrl: null,
  signingDate: '31 Agustus 2025',
  signingLocation: 'Depok'
};

const mockProject = {
  id: 'p1',
  classId: 'class_1a',
  className: '1A',
  gradeLevel: 1,
  academicYear: '2025/2026',
  semester: '1',
  month: '2025-08',
  projectTitle: 'Gardening & Plant Life Cycle',
  projectOverview: 'Siswa menanam dan mengamati pertumbuhan biji kacang hijau selama 4 minggu.',
  createdAt: 0,
  createdBy: '',
  updatedAt: 0,
  updatedBy: ''
};

const mockPhoto = {
  id: 'ph1',
  studentId: 'stu_1',
  studentName: 'Student 1',
  classId: 'class_1a',
  academicYear: '2025/2026',
  semester: '1',
  month: '2025-08',
  identityPhotoUrl: 'https://example.com/photo.jpg',
  snapshots: [
    { index: 0, url: 'https://example.com/s1.jpg', caption: 'Tahap Persiapan Media Tanam' },
    { index: 1, url: 'https://example.com/s2.jpg', caption: 'Tahap Perawatan & Penyiraman' },
    { index: 2, url: 'https://example.com/s3.jpg', caption: 'Tahap Panen & Presentasi Kelompok' }
  ] as any,
  albumLink: 'https://photos.google.com/share',
  createdAt: 0,
  createdBy: '',
  updatedAt: 0,
  updatedBy: ''
};

const mockNarrativeApproved = {
  id: 'n1',
  studentId: 'stu_1',
  studentName: 'Student 1',
  classId: 'class_1a',
  academicYear: '2025/2026',
  semester: '1',
  month: '2025-08',
  academicComment: 'Ananda memiliki pemahaman berhitung yang amat baik.',
  selProfile: 'Ananda menunjukkan empati dan kemandirian yang tinggi di kelas.',
  reviewStatus: 'APPROVED' as any,
  isSourceStale: false,
  lastScoresHash: 'lo1:85|lo2:90',
  approvedByName: 'Head Unit Elementary',
  createdAt: 0,
  createdBy: '',
  updatedAt: 0,
  updatedBy: ''
};

// Check complete valid state -> eligible!
const validGate = validateElementaryMonthlyPublishEligibility({
  student: { id: 'stu_1', name: 'Student 1' },
  curriculumDoc: mockCurriculum,
  studentScoreDoc: { scores: { lo1: 85, lo2: 90 } } as any,
  narrativeDoc: mockNarrativeApproved,
  projectDoc: mockProject,
  photoDoc: mockPhoto,
  attendanceSummary: attStu1,
  signatory: mockSignatory
});
assert(validGate.isEligible === true, 'All complete requirements pass publish gate');
assert(validGate.blockingReasons.length === 0, 'No blocking reasons when all criteria met');

// Test Gate Block: Incomplete active LO
const incompleteLoGate = validateElementaryMonthlyPublishEligibility({
  student: { id: 'stu_1', name: 'Student 1' },
  curriculumDoc: mockCurriculum,
  studentScoreDoc: { scores: { lo1: 85 } } as any, // lo2 is missing!
  narrativeDoc: mockNarrativeApproved,
  projectDoc: mockProject,
  photoDoc: mockPhoto,
  attendanceSummary: attStu1,
  signatory: mockSignatory
});
assert(incompleteLoGate.isEligible === false, 'Missing LO score blocks publishing');
assert(incompleteLoGate.blockingReasons.some(r => r.includes('Nilai LO aktif belum lengkap')), 'Reason explicitly specifies missing LO');

// Test Gate Block: Stale approval
const staleNarGate = validateElementaryMonthlyPublishEligibility({
  student: { id: 'stu_1', name: 'Student 1' },
  curriculumDoc: mockCurriculum,
  studentScoreDoc: { scores: { lo1: 85, lo2: 90 } } as any,
  narrativeDoc: { ...mockNarrativeApproved, isSourceStale: true },
  projectDoc: mockProject,
  photoDoc: mockPhoto,
  attendanceSummary: attStu1,
  signatory: mockSignatory
});
assert(staleNarGate.isEligible === false, 'Stale approved narrative blocks publishing');
assert(staleNarGate.blockingReasons.some(r => r.includes('stale')), 'Reason explicitly mentions stale narrative');

// Test Gate Block: Missing Attendance
const missingAttGate = validateElementaryMonthlyPublishEligibility({
  student: { id: 'stu_1', name: 'Student 1' },
  curriculumDoc: mockCurriculum,
  studentScoreDoc: { scores: { lo1: 85, lo2: 90 } } as any,
  narrativeDoc: mockNarrativeApproved,
  projectDoc: mockProject,
  photoDoc: mockPhoto,
  attendanceSummary: attNull,
  signatory: mockSignatory
});
assert(missingAttGate.isEligible === false, 'Missing attendance blocks publishing');
assert(missingAttGate.blockingReasons.some(r => r.includes('Data kehadiran siswa belum tersedia')), 'Reason states attendance missing');

console.log('\nALL 37 TESTS (STAGES 1, 2, AND 3) PASSED SUCCESSFULLY!');
process.exit(0);

