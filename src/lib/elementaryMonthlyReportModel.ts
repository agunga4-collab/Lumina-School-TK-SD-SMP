import {
  calculateLGAverageAndPredicate,
  ELEMENTARY_MONTHLY_TEMPLATE_VERSION,
} from '../types/elementaryMonthlyReport';
import type {
  ElementaryMonthlyAttendanceConfig,
  ElementaryMonthlyAttendanceSummary,
  ElementaryMonthlyCurriculumDoc,
  ElementaryMonthlyProjectDoc,
  ElementaryMonthlyReportSignatory,
  ElementaryMonthlyReportSnapshot,
  ElementaryMonthlyStudentNarrativeDoc,
  ElementaryMonthlyStudentPhotoDoc,
  ElementaryMonthlyStudentScoreDoc,
  LGAverageResult,
} from '../types/elementaryMonthlyReport';
import type { Class, ReportConfig, User } from '../types';
import { resolveElementaryMonthlyIdentityPhoto } from './elementaryMonthlyPhoto';

export { ELEMENTARY_MONTHLY_TEMPLATE_VERSION } from '../types/elementaryMonthlyReport';

/** Resolve the assigned teacher, never the user performing publication. */
export function resolveElementaryMonthlyTeacherId(classData: Partial<Class> | null): string {
  if (!classData) return '';
  if (classData.teacherAssignments?.length) {
    const homeroom = classData.teacherAssignments.filter(item => item.role === 'HOMEROOM_TEACHER');
    if (!homeroom.length) return '';
    if (homeroom.length !== 1 || !homeroom[0].isPrimary) {
      throw new Error('Penugasan wali kelas tidak tunggal/utama. Perbaiki penugasan kelas sebelum menerbitkan rapor.');
    }
    const id = homeroom[0].userId?.trim() || '';
    return /^INVITE[:_]/i.test(id) ? '' : id;
  }
  const ids = Array.from(new Set([
    ...(classData.homeroomTeacherIds || []),
    ...(classData.homeroomTeacherId ? [classData.homeroomTeacherId] : []),
  ].filter(Boolean)));
  if (ids.length > 1) {
    throw new Error('Penugasan wali kelas lama memiliki beberapa ID yang berbeda. Pilih satu wali kelas utama.');
  }
  const id = ids[0]?.trim() || '';
  return /^INVITE[:_]/i.test(id) ? '' : id;
}

export function resolveElementaryMonthlyLogo(logos: unknown): string {
  const elementary = (logos as { ELEMENTARY?: { reportHeaderLogo?: { originalUrl?: unknown }; rectangular?: unknown } } | null)?.ELEMENTARY;
  const header = elementary?.reportHeaderLogo?.originalUrl;
  const rectangular = elementary?.rectangular;
  return typeof header === 'string' && header.trim()
    ? header.trim()
    : typeof rectangular === 'string' ? rectangular.trim() : '';
}

export function resolveElementaryMonthlySignatory(params: {
  classData: Partial<Class> | null;
  teacherProfile: (Partial<User> & { name?: string }) | null;
  reportConfig: Partial<ReportConfig> | null;
  attendanceConfig: Pick<ElementaryMonthlyAttendanceConfig, 'signingDate' | 'signingLocation'> | null;
}): ElementaryMonthlyReportSignatory {
  const { classData, teacherProfile, reportConfig, attendanceConfig } = params;
  const teacherId = resolveElementaryMonthlyTeacherId(classData);
  const assignment = classData?.teacherAssignments?.find(item => item.userId === teacherId && item.role === 'HOMEROOM_TEACHER');
  const teacherName = teacherProfile?.displayName || teacherProfile?.name || assignment?.displayName || classData?.homeroomTeacherName || '';
  return {
    principalName: reportConfig?.principalName?.trim() || '',
    principalTitle: reportConfig?.principalTitle?.trim() || '',
    principalNiy: reportConfig?.principalNIY?.trim() || '',
    principalSignatureUrl: reportConfig?.principalSignatureUrl || null,
    homeroomTeacherId: teacherId,
    homeroomTeacherName: teacherId && !teacherName.includes('@') ? teacherName.trim() : '',
    homeroomTeacherNiy: teacherId ? teacherProfile?.niy?.trim() || '' : '',
    homeroomTeacherSignatureUrl: teacherId
      ? teacherProfile?.signatureUrl || classData?.teacherSignatureUrl || null
      : null,
    signingDate: attendanceConfig?.signingDate?.trim() || '',
    signingLocation: attendanceConfig?.signingLocation?.trim() || '',
  };
}

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

export function formatElementaryMonthlyReportMonth(month: string): string {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  return match ? `${MONTH_NAMES[Number(match[2]) - 1]} ${match[1]}` : month;
}

/** Shared by the browser and authenticated publication API; no external access. */
export function buildElementaryMonthlyAttendanceSummary(
  config: ElementaryMonthlyAttendanceConfig | null,
  studentId: string,
): ElementaryMonthlyAttendanceSummary {
  const record = config?.studentAttendanceMap?.[studentId];
  const totalDays = record?.totalDays ?? config?.totalSchoolDays ?? 0;
  const presentDays = record?.presentDays;
  const valid = Boolean(
    config && record && Number.isFinite(totalDays) && totalDays > 0 &&
    typeof presentDays === 'number' && Number.isFinite(presentDays) &&
    presentDays >= 0 && presentDays <= totalDays,
  );
  const percentage = valid ? Math.round((presentDays! / totalDays) * 1000) / 10 : 0;
  return {
    startDate: config?.startDate || '',
    endDate: config?.endDate || '',
    presentDays: valid ? presentDays! : 0,
    totalDays: Number.isFinite(totalDays) ? totalDays : 0,
    percentage,
    basisDescription: valid
      ? `${presentDays} dari ${totalDays} hari sekolah (${percentage}%)`
      : config
        ? 'Data presensi siswa belum diisi atau tidak valid (tidak diasumsikan 100%)'
        : 'Belum dikonfigurasi',
    isAvailable: valid,
  };
}

export interface BuildElementaryMonthlyReportSnapshotParams {
  student: { id: string; name: string; nisn?: string; nis?: string; photoUrl?: string };
  classId: string;
  className: string;
  gradeLevel: number;
  academicYear: string;
  semester: string;
  month: string;
  curriculumDoc: ElementaryMonthlyCurriculumDoc | null;
  studentScoreDoc: Pick<ElementaryMonthlyStudentScoreDoc, 'scores'> | null;
  projectDoc: ElementaryMonthlyProjectDoc | null;
  photoDoc: ElementaryMonthlyStudentPhotoDoc | null;
  narrativeDoc: ElementaryMonthlyStudentNarrativeDoc | null;
  attendanceSummary: ElementaryMonthlyAttendanceSummary | null;
  signatory: ElementaryMonthlyReportSignatory | null;
  logoUrl?: string | null;
}

/**
 * One serializable model for the draft renderer and the server's frozen snapshot.
 * Missing draft inputs remain empty; publication eligibility is checked separately.
 * Never call this to upgrade or replace an already published legacy snapshot.
 */
export function buildElementaryMonthlyReportSnapshot(
  params: BuildElementaryMonthlyReportSnapshotParams,
): ElementaryMonthlyReportSnapshot {
  const {
    student, classId, className, gradeLevel, academicYear, semester, month,
    curriculumDoc, studentScoreDoc, projectDoc, photoDoc, narrativeDoc,
    attendanceSummary, signatory, logoUrl,
  } = params;
  const curriculum: ElementaryMonthlyCurriculumDoc = curriculumDoc || {
    id: '', classId, className, gradeLevel, academicYear, semester, month,
    subjects: [], createdAt: 0, createdBy: '', updatedAt: 0, updatedBy: '',
  };
  const scores = studentScoreDoc?.scores || {};
  const lgResults: Record<string, LGAverageResult> = {};
  for (const subject of curriculum.subjects || []) {
    for (const goal of subject.learningGoals || []) {
      // Preserve the original mean and exact, unrounded K + (100 - K) / 2 boundary.
      const kkm = goal.kkmOverride ?? subject.kkm ?? 70;
      lgResults[goal.id] = calculateLGAverageAndPredicate(scores, goal.learningObjectives || [], kkm);
    }
  }
  const sourceSnapshots = photoDoc?.snapshots || [];
  const identityPhoto = resolveElementaryMonthlyIdentityPhoto(photoDoc, student.photoUrl);
  const snapshots: ElementaryMonthlyReportSnapshot['photos']['snapshots'] = [
    sourceSnapshots[0] || { index: 0, url: '', caption: '' },
    sourceSnapshots[1] || { index: 1, url: '', caption: '' },
    sourceSnapshots[2] || { index: 2, url: '', caption: '' },
  ];
  const snapshot: ElementaryMonthlyReportSnapshot = {
    templateVersion: ELEMENTARY_MONTHLY_TEMPLATE_VERSION,
    logoUrl: logoUrl || '',
    student: {
      id: student.id,
      name: student.name,
      nisn: student.nisn || student.nis || '',
      className,
      grade: gradeLevel,
    },
    academicYear,
    semester,
    month,
    monthLabel: formatElementaryMonthlyReportMonth(month),
    curriculum,
    scoresSummary: { scores, lgResults },
    project: {
      projectTitle: projectDoc?.projectTitle || '',
      projectOverview: projectDoc?.projectOverview || '',
      sharedAlbumLink: projectDoc?.sharedAlbumLink || '',
    },
    photos: {
      identityPhotoUrl: identityPhoto?.url || '',
      ...(identityPhoto ? { identityPhoto } : {}),
      identityPhotoSource: identityPhoto?.url && identityPhoto.url === student.photoUrl?.trim() ? 'master' : 'monthly',
      snapshots,
      albumLink: photoDoc?.albumLink || '',
    },
    narratives: {
      academicComment: narrativeDoc?.academicComment || '',
      selProfile: narrativeDoc?.selProfile || '',
      approvedBy: narrativeDoc?.reviewedBy || '',
      approvedByName: narrativeDoc?.reviewedByName || '',
      ...(narrativeDoc?.reviewedAt != null ? { approvedAt: narrativeDoc.reviewedAt } : {}),
    },
    attendance: attendanceSummary || buildElementaryMonthlyAttendanceSummary(null, student.id),
    signatory: signatory || {
      principalName: '', principalTitle: '', principalNiy: '', principalSignatureUrl: null,
      homeroomTeacherName: '', homeroomTeacherId: '', homeroomTeacherNiy: '',
      homeroomTeacherSignatureUrl: null, signingDate: '', signingLocation: '',
    },
  };
  // Detach nested curriculum/photo objects; subsequent UI edits cannot mutate this model.
  return JSON.parse(JSON.stringify(snapshot)) as ElementaryMonthlyReportSnapshot;
}
