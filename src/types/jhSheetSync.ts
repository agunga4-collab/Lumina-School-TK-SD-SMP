import { JHFormativeLevel } from './assessmentBook';

export interface JHSheetColumnMapping {
  studentNameColumn: string;
  classColumn?: string;
  nisColumn?: string;
  comprehensionLevelColumn: string;
  formativeTaskColumn?: string;
  nextActionColumn?: string;
  dateColumn?: string;
}

export type JHSheetLevelResolution = 'Achieved' | 'Not Achieved' | 'SKIP';

export interface JHSheetSourceConfig {
  id: string;
  title: string;
  spreadsheetUrl: string;
  spreadsheetId: string;
  tabName: string;
  headerRow: number; // 1-indexed
  // Context partitioning
  academicYear: string;
  semester: string;
  subjectId: string;
  classId: string; // Regular classId or UA group id
  isUAMode: boolean;
  unitActivityId?: string;
  unitActivityName?: string;
  unitActivityCategory?: string;
  // Specific LO targeting if saved for this LO or LG
  loId?: string;
  lgId?: string;
  // Column mapping
  columnMapping: JHSheetColumnMapping;
  // Custom alias resolutions mapping raw text -> Achieved | Not Achieved | SKIP
  levelAliases?: Record<string, JHSheetLevelResolution>;
  // Confirmed manual student pairings: sheetNormalizedName -> studentId
  confirmedStudentPairs?: Record<string, string>;
  // Explicitly excluded sheet names/rows
  excludedNames?: string[];
  // Audit
  createdBy: string;
  createdByName?: string;
  createdAt: number;
  updatedAt: number;
}

export type JHSheetRowMatchStatus = 
  | 'EXACT_MATCH'
  | 'CONFIRMED_MATCH'
  | 'AMBIGUOUS'
  | 'UNMATCHED'
  | 'DUPLICATE'
  | 'EXCLUDED';

export interface JHParsedSheetRow {
  rowNumber: number; // 1-indexed sheet row
  rawValues: Record<string, string>;
  sheetName: string;
  sheetNIS?: string;
  sheetClass?: string;
  rawLevel: string;
  normalizedLevel: JHFormativeLevel | 'UNASSESSED' | 'AMBIGUOUS';
  rawTask?: string;
  rawNextAction?: string;
  rawDate?: string;
  
  // Student match details
  matchStatus: JHSheetRowMatchStatus;
  matchedStudentId?: string;
  matchedStudentName?: string;
  matchedStudentNIS?: string;
  matchedStudentClass?: string;
  candidateStudents?: {
    id: string;
    name: string;
    nis?: string;
    className?: string;
    confidence: number;
  }[];
  manualOverrideStudentId?: string;
  isExcluded?: boolean;
  validationError?: string;
}

export interface JHSheetSyncLog {
  id: string;
  sourceId: string;
  spreadsheetId: string;
  spreadsheetTitle: string;
  tabName: string;
  headerRow: number;
  loId: string;
  loCode: string;
  loTitle: string;
  lgId: string;
  classId: string;
  subjectId: string;
  academicYear: string;
  semester: string;
  assessmentDate: string;
  isUAMode: boolean;
  syncedBy: string;
  syncedByName: string;
  syncedAt: number;
  stats: {
    totalRows: number;
    createdCount: number;
    updatedCount: number;
    unchangedCount: number;
    skippedCount: number;
    failedCount: number;
  };
  details: {
    studentId: string;
    studentName: string;
    action: 'CREATED' | 'UPDATED' | 'UNCHANGED' | 'SKIPPED' | 'FAILED';
    previousLevel?: string;
    newLevel?: string;
    reason?: string;
  }[];
}
