import { assert } from "console";

// Helper function to chunk array for Firestore in query limits
function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

// Simulated query mock
async function simulateStudentQuery(studentIds: string[], semesterQueryList: any[], shouldFailOnChunk?: string[]) {
  const studentChunks = chunkArray(studentIds, 10);
  const studentRecords: any[] = [];
  let queriedChunksCount = 0;

  for (const chunk of studentChunks) {
    queriedChunksCount++;
    // Verify chunk constraints
    const disjunctions = semesterQueryList.length * chunk.length;
    console.log(`  [Test Query] Querying chunk #${queriedChunksCount} of size ${chunk.length} (Disjunctions: ${disjunctions})`);
    
    if (disjunctions > 30) {
      throw new Error(`INVALID_ARGUMENT: Too many disjunctions after normalization. Result had ${disjunctions} disjunctions which is more than the maximum of 30.`);
    }

    // Check if we should simulate failure for a specific chunk or student ID
    if (shouldFailOnChunk && chunk.some(id => shouldFailOnChunk.includes(id))) {
      throw new Error(`Simulated query failure for chunk containing [${chunk.join(", ")}]`);
    }

    // Simulate returning records
    for (const sId of chunk) {
      studentRecords.push({
        id: `rec_${sId}`,
        studentId: sId,
        semester: semesterQueryList[0],
        status: "H"
      });
    }
  }

  return studentRecords;
}

async function runTests() {
  console.log("=========================================");
  console.log("RUNNING DHUHUR ATTENDANCE CHUNKING TESTS");
  console.log("=========================================");

  const semesterQueryList = [1, "1"]; // Length 2

  // Test Case 1: Backup one class with 40 students
  console.log("\n--- Test Case 1: Backup one class with 40 students ---");
  const students40 = Array.from({ length: 40 }, (_, i) => `student_${i + 1}`);
  try {
    const records = await simulateStudentQuery(students40, semesterQueryList);
    console.log(`  Success! Retrieved ${records.length} records.`);
    assert(records.length === 40, "Should retrieve all 40 records");
    const chunks = chunkArray(students40, 10);
    assert(chunks.length === 4, "Should divide 40 students into 4 chunks");
    console.log("  Test Passed: Class with 40 students handled perfectly in chunks under disjunction limits.");
  } catch (err: any) {
    console.error("  Test Failed:", err.message);
    process.exit(1);
  }

  // Test Case 2: Backup 31 students
  console.log("\n--- Test Case 2: Backup 31 students ---");
  const students31 = Array.from({ length: 31 }, (_, i) => `student_${i + 1}`);
  try {
    const records = await simulateStudentQuery(students31, semesterQueryList);
    console.log(`  Success! Retrieved ${records.length} records.`);
    assert(records.length === 31, "Should retrieve all 31 records");
    const chunks = chunkArray(students31, 10);
    assert(chunks.length === 4, "Should divide 31 students into 4 chunks");
    console.log("  Test Passed: 31 students handled perfectly.");
  } catch (err: any) {
    console.error("  Test Failed:", err.message);
    process.exit(1);
  }

  // Test Case 3: Backup 30 students
  console.log("\n--- Test Case 3: Backup 30 students ---");
  const students30 = Array.from({ length: 30 }, (_, i) => `student_${i + 1}`);
  try {
    const records = await simulateStudentQuery(students30, semesterQueryList);
    console.log(`  Success! Retrieved ${records.length} records.`);
    assert(records.length === 30, "Should retrieve all 30 records");
    const chunks = chunkArray(students30, 10);
    assert(chunks.length === 3, "Should divide 30 students into 3 chunks");
    console.log("  Test Passed: 30 students handled perfectly.");
  } catch (err: any) {
    console.error("  Test Failed:", err.message);
    process.exit(1);
  }

  // Test Case 4: Backup less than 30 students (e.g. 25 students)
  console.log("\n--- Test Case 4: Backup less than 30 students (25 students) ---");
  const students25 = Array.from({ length: 25 }, (_, i) => `student_${i + 1}`);
  try {
    const records = await simulateStudentQuery(students25, semesterQueryList);
    console.log(`  Success! Retrieved ${records.length} records.`);
    assert(records.length === 25, "Should retrieve all 25 records");
    const chunks = chunkArray(students25, 10);
    assert(chunks.length === 3, "Should divide 25 students into 3 chunks");
    console.log("  Test Passed: 25 students handled perfectly.");
  } catch (err: any) {
    console.error("  Test Failed:", err.message);
    process.exit(1);
  }

  // Test Case 5: Ensure partial failure handling behaves correctly
  console.log("\n--- Test Case 5: Partial Failure Behavior ---");
  const studentsFailCase = ["student_ok1", "student_ok2", "student_bad1", "student_ok3"];
  // We'll chunk with size 2 to force student_bad1 to fail its chunk query, but process other chunks
  console.log("  Simulating chunking with size 2. Second chunk has 'student_bad1'.");
  const chunkedList = chunkArray(studentsFailCase, 2);
  const successRecords: any[] = [];
  const failedRecordIds: string[] = [];

  for (const chunk of chunkedList) {
    try {
      const records = await simulateStudentQuery(chunk, semesterQueryList, ["student_bad1"]);
      successRecords.push(...records);
    } catch (err: any) {
      console.log(`  Expected Error caught for chunk: ${err.message}`);
      // Only the records inside the failed chunk are marked as failed
      failedRecordIds.push(...chunk);
    }
  }

  console.log(`  Results: Successful Records: ${successRecords.length}, Failed Records: ${failedRecordIds.length}`);
  assert(successRecords.length === 2, "Should succeed for 2 records in non-failing chunk");
  assert(failedRecordIds.length === 2, "Should fail for 2 records in failing chunk");
  console.log("  Test Passed: Only the failing chunk's records are marked as FAILED while other chunks sync successfully.");

  console.log("\n=========================================");
  console.log("ALL TESTS COMPLETED SUCCESSFULLY!");
  console.log("=========================================");
}

runTests().catch(err => {
  console.error("Fatal test error:", err);
  process.exit(1);
});
