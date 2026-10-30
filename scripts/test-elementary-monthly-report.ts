import { 
  calculateLGAverageAndPredicate, 
  ElementaryMonthlyLearningObjective 
} from '../src/types/elementaryMonthlyReport';
import { 
  buildMonthlyCurriculumDocId, 
  buildMonthlyStudentScoreDocId,
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

console.log('\nALL TESTS PASSED SUCCESSFULLY!');
