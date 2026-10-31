export type ElementaryMonthlyPredicate = 'A' | 'D' | 'B';

export interface ElementaryMonthlyLearningObjective {
  id: string;
  code: string;
  title: string;
  order: number;
}

export interface ElementaryMonthlyLearningGoal {
  id: string;
  code: string;
  title: string;
  order: number;
  kkmOverride?: number; // 0 < K < 100
  learningObjectives: ElementaryMonthlyLearningObjective[];
}

export interface ElementaryMonthlySubject {
  id: string;
  name: string;
  kkm: number; // default 70, 0 < K < 100
  order: number;
  learningGoals: ElementaryMonthlyLearningGoal[];
}

export interface ElementaryMonthlyCurriculumDoc {
  id: string; // `${classId}_${normYear}_S${semester}_M${month}`
  classId: string;
  className: string;
  gradeLevel: number;
  academicYear: string;
  semester: string;
  month: string; // 'YYYY-MM'
  subjects: ElementaryMonthlySubject[];
  createdAt: number;
  createdBy: string;
  createdByName?: string;
  updatedAt: number;
  updatedBy: string;
  updatedByName?: string;
}

export interface ElementaryMonthlyStudentScoreDoc {
  id: string; // `${studentId}_${classId}_${normYear}_S${semester}_M${month}`
  studentId: string;
  studentName: string;
  classId: string;
  academicYear: string;
  semester: string;
  month: string; // 'YYYY-MM'
  scores: Record<string, number>; // loId -> score (0-100)
  createdAt: number;
  createdBy: string;
  createdByName?: string;
  updatedAt: number;
  updatedBy: string;
  updatedByName?: string;
}

export interface LGAverageResult {
  average: number | null; // null if all blank
  displayAverage: string; // e.g. "84.99", "70", "-"
  predicate: ElementaryMonthlyPredicate | null;
  kkm: number;
  batasA: number;
  totalLOs: number;
  filledLOs: number;
  isComplete: boolean;
}

/**
 * Calculates the arithmetic average of LO scores for an LG, and derives
 * the predicate based on KKM and Batas A = K + (100 - K) / 2.
 * 
 * Rules:
 * - Empty/blank is NOT zero.
 * - If all LOs are blank -> average is null, predicate is null.
 * - Conversion uses exact floating number before rounding.
 * - Display average formatted to at most 2 decimals.
 */
export function calculateLGAverageAndPredicate(
  scores: Record<string, number | undefined | null | string>,
  loList: ElementaryMonthlyLearningObjective[],
  kkm: number = 70
): LGAverageResult {
  const effectiveKkm = (typeof kkm === 'number' && kkm > 0 && kkm < 100) ? kkm : 70;
  const batasA = effectiveKkm + (100 - effectiveKkm) / 2;

  let sum = 0;
  let filledCount = 0;
  const totalLOs = loList.length;

  for (const lo of loList) {
    const rawVal = scores[lo.id];
    if (rawVal !== undefined && rawVal !== null && rawVal !== '') {
      const num = typeof rawVal === 'number' ? rawVal : parseFloat(String(rawVal).replace(',', '.'));
      if (!isNaN(num) && num >= 0 && num <= 100) {
        sum += num;
        filledCount++;
      }
    }
  }

  if (filledCount === 0 || totalLOs === 0) {
    return {
      average: null,
      displayAverage: '-',
      predicate: null,
      kkm: effectiveKkm,
      batasA,
      totalLOs,
      filledLOs: 0,
      isComplete: false
    };
  }

  const rawAvg = sum / filledCount;

  let predicate: ElementaryMonthlyPredicate;
  if (rawAvg >= batasA) {
    predicate = 'A';
  } else if (rawAvg >= effectiveKkm) {
    predicate = 'D';
  } else {
    predicate = 'B';
  }

  // Display average formatted up to 2 decimal places without trailing unnecessary zeros
  const rounded2 = Math.round(rawAvg * 100) / 100;
  const displayAverage = Number.isInteger(rounded2) ? String(rounded2) : rounded2.toFixed(2).replace(/\.?0+$/, '');

  return {
    average: rawAvg,
    displayAverage,
    predicate,
    kkm: effectiveKkm,
    batasA,
    totalLOs,
    filledLOs: filledCount,
    isComplete: filledCount === totalLOs && totalLOs > 0
  };
}

export const ELEMENTARY_DEFAULT_SUBJECT_TEMPLATES = [
  'Bahasa Indonesia',
  'Mathematics',
  'English',
  'Pendidikan Agama Islam',
  'Arts and Crafts',
  'Physical Education',
  'Information and Communications Technology',
  'Tematik'
];

// ==========================================
// TAHAP 2: PROYEK & FOTO TYPES
// ==========================================

export interface ElementaryMonthlyProjectDoc {
  id: string; // `${classId}_${normYear}_S${semester}_M${month}`
  classId: string;
  className: string;
  gradeLevel: number;
  academicYear: string;
  semester: string;
  month: string; // 'YYYY-MM'
  projectTitle: string;
  projectOverview: string;
  sharedAlbumLink?: string;
  createdAt: number;
  createdBy: string;
  createdByName?: string;
  updatedAt: number;
  updatedBy: string;
  updatedByName?: string;
}

export interface ElementaryMonthlyCropSettings {
  x?: number;
  y?: number;
  zoom?: number;
  aspectRatio?: number;
}

export interface ElementaryMonthlyPhotoSnapshot {
  index: number; // 0, 1, 2
  url: string; // Storage URL or authenticated streaming URL e.g. /api/elementary-monthly/photo-stream/:fileId
  caption: string;
  driveFileId?: string;
  folderId?: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  version?: number;
  cropSettings?: ElementaryMonthlyCropSettings;
  uploadedBy?: string;
  uploadedByName?: string;
  uploadedAt?: number;
}

export interface ElementaryMonthlyIdentityPhoto {
  url?: string;
  driveFileId?: string;
  folderId?: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  version?: number;
  cropSettings?: ElementaryMonthlyCropSettings;
  uploadedBy?: string;
  uploadedByName?: string;
  uploadedAt?: number;
}

export interface ElementaryMonthlyStudentPhotoDoc {
  id: string; // `${studentId}_${classId}_${normYear}_S${semester}_M${month}`
  studentId: string;
  studentName: string;
  classId: string;
  academicYear: string;
  semester: string;
  month: string; // 'YYYY-MM'
  identityPhotoUrl?: string; // Optional custom photo for this report
  identityPhoto?: ElementaryMonthlyIdentityPhoto; // Shared Drive photo metadata
  snapshots: [
    ElementaryMonthlyPhotoSnapshot,
    ElementaryMonthlyPhotoSnapshot,
    ElementaryMonthlyPhotoSnapshot
  ];
  albumLink?: string;
  createdAt: number;
  createdBy: string;
  createdByName?: string;
  updatedAt: number;
  updatedBy: string;
  updatedByName?: string;
}

// ==========================================
// TAHAP 2: NARASI & APPROVAL TYPES
// ==========================================

export type ElementaryMonthlyReviewStatus = 
  | 'DRAFT' 
  | 'SUBMITTED' 
  | 'APPROVED' 
  | 'NEEDS_REVISION';

export interface ElementaryMonthlyStudentNarrativeDoc {
  id: string; // `${studentId}_${classId}_${normYear}_S${semester}_M${month}`
  studentId: string;
  studentName: string;
  classId: string;
  academicYear: string;
  semester: string;
  month: string; // 'YYYY-MM'
  
  // 1. Academic Comments (berdasarkan LG/LO, nilai angka, ADB, catatan guru)
  academicComment: string;
  academicDraft?: string;
  
  // 2. Social Emotional Profile (SEL, fokus bulanan & observasi)
  selProfile: string;
  selDraft?: string;
  
  // Single Review Package covering both narratives
  reviewStatus: ElementaryMonthlyReviewStatus;
  reviewNotes?: string; // Catatan revisi jika dikembalikan (wajib jika NEEDS_REVISION)
  
  // Timestamps & Audit
  submittedAt?: number;
  submittedBy?: string;
  submittedByName?: string;
  
  reviewedAt?: number;
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedRole?: string;
  
  // Change detection: flag if source scores were modified after submission/approval
  lastScoresHash?: string;
  isSourceStale?: boolean;
  
  createdAt: number;
  createdBy: string;
  createdByName?: string;
  updatedAt: number;
  updatedBy: string;
  updatedByName?: string;
}

// ==========================================
// TAHAP 3: PREVIEW, PDF, PUBLIKASI & TRACKING
// ==========================================

export interface ElementaryMonthlyAttendanceConfig {
  id: string; // `${classId}_${normYear}_S${semester}_M${month}`
  classId: string;
  className?: string;
  academicYear: string;
  semester: string;
  month: string; // 'YYYY-MM'
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  totalSchoolDays: number;
  signingDate: string; // Titimangsa, e.g. "Depok, 31 Oktober 2025"
  signingLocation: string; // e.g. "Depok"
  studentAttendanceMap: Record<string, {
    presentDays: number;
    totalDays?: number;
    notes?: string;
  }>;
  createdAt: number;
  createdBy: string;
  updatedAt: number;
  updatedBy: string;
}

export interface ElementaryMonthlyReportSignatory {
  principalName: string;
  principalTitle?: string;
  principalNiy?: string;
  principalSignatureUrl?: string | null;
  homeroomTeacherName: string;
  homeroomTeacherNiy?: string;
  homeroomTeacherSignatureUrl?: string | null;
  signingDate: string;
  signingLocation: string;
}

export interface ElementaryMonthlyAttendanceSummary {
  startDate: string;
  endDate: string;
  presentDays: number;
  totalDays: number;
  percentage: number;
  basisDescription: string;
  isAvailable: boolean;
}

export interface ElementaryMonthlyReportSnapshot {
  student: {
    id: string;
    name: string;
    nisn: string;
    className: string;
    grade: number;
  };
  academicYear: string;
  semester: string;
  month: string;
  monthLabel: string;
  curriculum: ElementaryMonthlyCurriculumDoc;
  scoresSummary: {
    scores: Record<string, number>;
    lgResults: Record<string, LGAverageResult>;
  };
  project: {
    projectTitle: string;
    projectOverview: string;
    sharedAlbumLink?: string;
  };
  photos: {
    identityPhotoUrl?: string;
    snapshots: [
      ElementaryMonthlyPhotoSnapshot,
      ElementaryMonthlyPhotoSnapshot,
      ElementaryMonthlyPhotoSnapshot
    ];
    albumLink?: string;
  };
  narratives: {
    academicComment: string;
    selProfile: string;
    approvedByName?: string;
    approvedAt?: number;
  };
  attendance: ElementaryMonthlyAttendanceSummary;
  signatory: ElementaryMonthlyReportSignatory;
}

export type ElementaryMonthlyDeliveryStatus = 'NOT_SENT' | 'SENT' | 'REVOKED';

export interface PublishedElementaryMonthlyReportDoc {
  id: string; // `${normYear}_S${semester}_M${month}_${classId}_${studentId}`
  unit: 'ELEMENTARY';
  reportType: 'MONTHLY_REPORT';
  studentId: string;
  studentNameSnapshot: string;
  nisnSnapshot: string;
  classId: string;
  classNameSnapshot: string;
  gradeSnapshot: number;
  academicYear: string;
  semester: string;
  month: string;
  monthLabel: string;
  version: number;
  status: 'PUBLISHED';
  deliveryStatus: ElementaryMonthlyDeliveryStatus;
  isSentToPortal: boolean;
  sentAt: number | null;
  sentBy: string | null;
  sentByName?: string | null;
  reportSnapshot: ElementaryMonthlyReportSnapshot;
  driveFileUrl?: string;
  driveFileId?: string;
  fileName?: string;
  generatedBy: string;
  generatedByName?: string;
  generatedAt: number;
  // Tracking
  isOpened: boolean;
  firstOpenedAt: number | null;
  lastOpenedAt: number | null;
  openCount: number;
  openedByEmail: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ElementaryMonthlyPublishValidationResult {
  isEligible: boolean;
  blockingReasons: string[];
  warnings: string[];
}

/**
 * Pre-publish validation gate for Elementary Lower Grade Monthly Report.
 * Strict checks:
 * 1. Active LO scores must be complete (no missing scores).
 * 2. KKM/KKTP and predicate conversion must be valid.
 * 3. Both narratives must be APPROVED and not stale.
 * 4. Mandatory photos (identity photo + 3 snapshots with captions) must be complete.
 * 5. Project title & overview must be filled.
 * 6. Attendance must be calculated and present (data not missing).
 * 7. Titimangsa / signing date must be valid.
 */
export function validateElementaryMonthlyPublishEligibility(params: {
  student: { id: string; name: string };
  curriculumDoc: ElementaryMonthlyCurriculumDoc | null;
  studentScoreDoc: ElementaryMonthlyStudentScoreDoc | null;
  narrativeDoc: ElementaryMonthlyStudentNarrativeDoc | null;
  projectDoc: ElementaryMonthlyProjectDoc | null;
  photoDoc: ElementaryMonthlyStudentPhotoDoc | null;
  attendanceSummary: ElementaryMonthlyAttendanceSummary | null;
  signatory: ElementaryMonthlyReportSignatory | null;
}): ElementaryMonthlyPublishValidationResult {
  const blockingReasons: string[] = [];
  const warnings: string[] = [];

  const {
    curriculumDoc,
    studentScoreDoc,
    narrativeDoc,
    projectDoc,
    photoDoc,
    attendanceSummary,
    signatory
  } = params;

  // 1. Curriculum & LO Scores
  if (!curriculumDoc || !curriculumDoc.subjects || curriculumDoc.subjects.length === 0) {
    blockingReasons.push('Struktur mata pelajaran dan Learning Goals belum dikonfigurasi.');
  } else {
    let missingLoCount = 0;
    let totalLoCount = 0;
    const scores = studentScoreDoc?.scores || {};

    for (const sub of curriculumDoc.subjects) {
      for (const lg of sub.learningGoals || []) {
        for (const lo of lg.learningObjectives || []) {
          totalLoCount++;
          const val = scores[lo.id];
          if (val === undefined || val === null || val === '') {
            missingLoCount++;
          }
        }
      }
    }

    if (totalLoCount === 0) {
      blockingReasons.push('Belum ada Learning Objective (LO) yang terdaftar pada kurikulum bulan ini.');
    } else if (missingLoCount > 0) {
      blockingReasons.push(`Nilai LO aktif belum lengkap (${missingLoCount} dari ${totalLoCount} LO masih kosong).`);
    }
  }

  // 2. Narratives Approval & Stale Check
  if (!narrativeDoc) {
    blockingReasons.push('Narasi siswa (Academic Comments & SEL) belum dibuat.');
  } else {
    if (narrativeDoc.reviewStatus !== 'APPROVED') {
      blockingReasons.push(
        `Narasi belum disetujui (Status saat ini: ${
          narrativeDoc.reviewStatus === 'SUBMITTED'
            ? 'Menunggu Review Head Unit'
            : narrativeDoc.reviewStatus === 'NEEDS_REVISION'
            ? 'Perlu Revisi Guru'
            : 'Draft'
        }).`
      );
    }
    if (narrativeDoc.isSourceStale) {
      blockingReasons.push('Persetujuan narasi usang (stale): nilai LO siswa telah diubah setelah approval narasi.');
    }
    if (!narrativeDoc.academicComment || !narrativeDoc.academicComment.trim()) {
      blockingReasons.push('Academic Comments wajib diisi.');
    }
    if (!narrativeDoc.selProfile || !narrativeDoc.selProfile.trim()) {
      blockingReasons.push('Social Emotional Profile (SEL) wajib diisi.');
    }
  }

  // 3. Project Documentation
  if (!projectDoc || !projectDoc.projectTitle || !projectDoc.projectTitle.trim()) {
    blockingReasons.push('Judul proyek kelas bulan ini belum diisi.');
  }
  if (!projectDoc || !projectDoc.projectOverview || !projectDoc.projectOverview.trim()) {
    blockingReasons.push('Project Overview kelas bulan ini belum diisi.');
  }

  // 4. Photos & Captions
  if (!photoDoc) {
    blockingReasons.push('Dokumentasi foto siswa belum diunggah.');
  } else {
    const snapshots = photoDoc.snapshots || [];
    let emptySnapshots = 0;
    let emptyCaptions = 0;
    for (let i = 0; i < 3; i++) {
      const snap = snapshots[i];
      if (!snap || !snap.url || !snap.url.trim()) {
        emptySnapshots++;
      }
      if (!snap || !snap.caption || !snap.caption.trim()) {
        emptyCaptions++;
      }
    }
    if (emptySnapshots > 0) {
      blockingReasons.push(`Foto Project Snapshot belum lengkap (3 foto wajib, ${emptySnapshots} masih kosong).`);
    }
    if (emptyCaptions > 0) {
      blockingReasons.push(`Caption foto Project Snapshot belum lengkap (${emptyCaptions} caption masih kosong).`);
    }
  }

  // 5. Attendance Calculation
  if (!attendanceSummary || !attendanceSummary.isAvailable) {
    blockingReasons.push('Data kehadiran siswa belum tersedia atau belum dikonfigurasi (data tidak boleh diasumsikan 100%).');
  } else if (attendanceSummary.totalDays <= 0) {
    blockingReasons.push('Total hari efektif sekolah pada periode kehadiran harus lebih dari 0.');
  }

  // 6. Titimangsa & Signatories
  if (!signatory || !signatory.signingDate || !signatory.signingDate.trim()) {
    blockingReasons.push('Titimangsa penandatanganan rapor belum ditentukan.');
  }
  if (!signatory || !signatory.principalName || !signatory.principalName.trim()) {
    warnings.push('Nama Principal belum terkonfigurasi pada profil sekolah.');
  }
  if (!signatory || !signatory.homeroomTeacherName || !signatory.homeroomTeacherName.trim()) {
    warnings.push('Nama Homeroom Teacher belum terkonfigurasi.');
  }

  return {
    isEligible: blockingReasons.length === 0,
    blockingReasons,
    warnings
  };
}
