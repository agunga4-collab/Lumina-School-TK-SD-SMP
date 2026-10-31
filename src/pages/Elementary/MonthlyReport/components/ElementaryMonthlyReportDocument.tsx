import * as React from 'react';
import { Check, ExternalLink, Calendar, Award, UserCheck, HeartHandshake } from 'lucide-react';
import type { 
  ElementaryMonthlyReportSnapshot,
  ElementaryMonthlyAttendanceSummary,
  ElementaryMonthlyReportSignatory,
  ElementaryMonthlyCurriculumDoc,
  ElementaryMonthlyStudentNarrativeDoc,
  ElementaryMonthlyProjectDoc,
  ElementaryMonthlyStudentPhotoDoc,
  LGAverageResult,
  calculateLGAverageAndPredicate
} from '../../../../types/elementaryMonthlyReport';
import { formatMonthLabel } from '../../../../services/elementaryMonthlyReportService';
import type { Student, Class } from '../../../../types';

export interface ElementaryMonthlyReportDocumentProps {
  snapshot?: ElementaryMonthlyReportSnapshot | null;
  previewData?: {
    student: Student;
    classInfo?: Class | null;
    academicYear: string;
    semester: string;
    month: string;
    monthLabel: string;
    curriculumDoc: ElementaryMonthlyCurriculumDoc | null;
    scoresMap: Record<string, number>;
    narrativeDoc: ElementaryMonthlyStudentNarrativeDoc | null;
    projectDoc: ElementaryMonthlyProjectDoc | null;
    photoDoc: ElementaryMonthlyStudentPhotoDoc | null;
    attendanceSummary: ElementaryMonthlyAttendanceSummary;
    signatory: ElementaryMonthlyReportSignatory;
    logoUrl?: string | null;
  } | null;
  isDraft?: boolean;
  onReadyChange?: (ready: boolean) => void;
}

export const ElementaryMonthlyReportDocument: React.FC<ElementaryMonthlyReportDocumentProps> = ({
  snapshot,
  previewData,
  isDraft = false,
  onReadyChange
}) => {
  // Extract data from snapshot or previewData
  const student = snapshot ? snapshot.student : previewData?.student;
  const academicYear = snapshot ? snapshot.academicYear : previewData?.academicYear || '2025/2026';
  const semester = snapshot ? snapshot.semester : previewData?.semester || '1';
  const month = snapshot ? snapshot.month : previewData?.month || '';
  const monthLabel = snapshot ? snapshot.monthLabel : (previewData?.monthLabel || formatMonthLabel(month));

  const curriculum = snapshot ? snapshot.curriculum : previewData?.curriculumDoc;
  const scoresMap = snapshot ? snapshot.scoresSummary?.scores || {} : previewData?.scoresMap || {};
  
  // Calculate LG results map
  const lgResultsMap = React.useMemo<Record<string, LGAverageResult>>(() => {
    if (snapshot && snapshot.scoresSummary?.lgResults) {
      return snapshot.scoresSummary.lgResults;
    }
    const map: Record<string, LGAverageResult> = {};
    if (curriculum?.subjects) {
      for (const sub of curriculum.subjects) {
        for (const lg of sub.learningGoals || []) {
          const kkm = lg.kkmOverride || sub.kkm || 70;
          map[lg.id] = calculateLGAverageAndPredicate(scoresMap, lg.learningObjectives || [], kkm);
        }
      }
    }
    return map;
  }, [snapshot, curriculum, scoresMap]);

  const project = snapshot ? snapshot.project : {
    projectTitle: previewData?.projectDoc?.projectTitle || 'Belum diisi',
    projectOverview: previewData?.projectDoc?.projectOverview || 'Project Overview belum diisi.',
    sharedAlbumLink: previewData?.projectDoc?.sharedAlbumLink || ''
  };

  const photos = snapshot ? snapshot.photos : {
    identityPhotoUrl: previewData?.photoDoc?.identityPhotoUrl || '',
    snapshots: previewData?.photoDoc?.snapshots || [
      { index: 0, url: '', caption: '' },
      { index: 1, url: '', caption: '' },
      { index: 2, url: '', caption: '' }
    ],
    albumLink: previewData?.photoDoc?.albumLink || ''
  };

  const narratives = snapshot ? snapshot.narratives : {
    academicComment: previewData?.narrativeDoc?.academicComment || 'Belum ada Academic Comments.',
    selProfile: previewData?.narrativeDoc?.selProfile || 'Belum ada Social Emotional Profile.',
    approvedByName: previewData?.narrativeDoc?.approvedByName || ''
  };

  const attendance = snapshot ? snapshot.attendance : (previewData?.attendanceSummary || {
    startDate: '',
    endDate: '',
    presentDays: 0,
    totalDays: 0,
    percentage: 0,
    basisDescription: 'Belum dikonfigurasi',
    isAvailable: false
  });

  const signatory = snapshot ? snapshot.signatory : (previewData?.signatory || {
    principalName: 'Dewi Masyitoh, M.Pd.',
    principalTitle: 'Principal',
    principalNiy: '19820512',
    principalSignatureUrl: null,
    homeroomTeacherName: previewData?.classInfo?.homeroomTeacherName || 'Homeroom Teacher',
    homeroomTeacherNiy: '',
    homeroomTeacherSignatureUrl: null,
    signingDate: 'Depok, ' + monthLabel,
    signingLocation: 'Depok'
  });

  // Image loading trackers for PDF generation readiness
  const [imagesLoaded, setImagesLoaded] = React.useState<number>(0);
  const totalTrackedImages = React.useMemo(() => {
    let count = 0;
    if (photos.identityPhotoUrl) count++;
    for (const snap of photos.snapshots || []) {
      if (snap?.url) count++;
    }
    if (signatory.principalSignatureUrl) count++;
    if (signatory.homeroomTeacherSignatureUrl) count++;
    return count;
  }, [photos, signatory]);

  React.useEffect(() => {
    if (onReadyChange) {
      if (totalTrackedImages === 0 || imagesLoaded >= totalTrackedImages) {
        onReadyChange(true);
      } else {
        // Fallback timer in case image fails to trigger onLoad
        const timer = setTimeout(() => onReadyChange(true), 1500);
        return () => clearTimeout(timer);
      }
    }
  }, [imagesLoaded, totalTrackedImages, onReadyChange]);

  const handleImageLoaded = () => {
    setImagesLoaded(prev => prev + 1);
  };

  const studentName = student?.name || 'Nama Siswa';
  const studentNisn = (student as any)?.nisn || (student as any)?.nis || '-';
  const className = (student as any)?.className || previewData?.classInfo?.name || 'Class 1';
  const gradeLevel = (student as any)?.grade || (previewData?.classInfo ? (previewData.classInfo.grade || 1) : 1);

  return (
    <div className="flex flex-col items-center gap-8 py-4 bg-slate-100 print:bg-white print:p-0">
      {/* ============================================================ */}
      {/* PAGE 1: KOP, IDENTITAS, BASIC LITERACY & NUMERACY, COMMENTS, PROJECT */}
      {/* ============================================================ */}
      <div 
        id="elem-monthly-pdf-page-1"
        className="elem-monthly-page bg-white shadow-xl print:shadow-none relative flex flex-col justify-between overflow-hidden"
        style={{
          width: '794px',
          minWidth: '794px',
          maxWidth: '794px',
          minHeight: '1123px',
          height: '1123px',
          padding: '36px 42px',
          boxSizing: 'border-box',
          backgroundColor: '#ffffff',
          color: '#0f172a',
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
        }}
      >
        {isDraft && (
          <div 
            style={{
              position: 'absolute',
              top: '400px',
              left: '120px',
              transform: 'rotate(-30deg)',
              fontSize: '64px',
              fontWeight: 900,
              color: 'rgba(239, 68, 68, 0.12)',
              pointerEvents: 'none',
              letterSpacing: '8px',
              zIndex: 10
            }}
          >
            INTERNAL DRAFT
          </div>
        )}

        <div>
          {/* Header Banner / Kop Biru */}
          <div 
            style={{
              backgroundColor: '#1e3a8a',
              color: '#ffffff',
              borderRadius: '12px',
              padding: '16px 20px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              boxShadow: '0 2px 4px rgba(0,0,0,0.06)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div 
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '10px',
                  backgroundColor: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 900,
                  color: '#1e3a8a',
                  fontSize: '20px',
                  letterSpacing: '-1px'
                }}
              >
                L
              </div>
              <div>
                <h2 style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase', margin: 0 }}>
                  Sekolah Lazuardi Elementary
                </h2>
                <p style={{ fontSize: '10px', color: '#93c5fd', margin: '2px 0 0 0', fontWeight: 600 }}>
                  Global Compassionate School · Lower Grade (Gr. 1–3)
                </p>
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <h1 style={{ fontSize: '15px', fontWeight: 900, letterSpacing: '0.5px', textTransform: 'uppercase', margin: 0, color: '#f8fafc' }}>
                STUDENT&apos;S PROGRESS REPORT
              </h1>
              <span style={{ fontSize: '10px', color: '#bfdbfe', fontWeight: 700, textTransform: 'uppercase' }}>
                Monthly Assessment · {monthLabel}
              </span>
            </div>
          </div>

          {/* Identity Grid with Student Photo on the Right */}
          <div 
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 92px',
              gap: '16px',
              backgroundColor: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: '10px',
              padding: '12px 16px',
              marginBottom: '16px'
            }}
          >
            {/* Metadata Fields */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', fontSize: '10.5px' }}>
              <div style={{ display: 'flex', gap: '6px' }}>
                <span style={{ color: '#64748b', fontWeight: 700, minWidth: '85px' }}>Student Name</span>
                <span style={{ color: '#0f172a', fontWeight: 800 }}>: {studentName}</span>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <span style={{ color: '#64748b', fontWeight: 700, minWidth: '85px' }}>Academic Year</span>
                <span style={{ color: '#0f172a', fontWeight: 700 }}>: {academicYear}</span>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <span style={{ color: '#64748b', fontWeight: 700, minWidth: '85px' }}>NIS / NISN</span>
                <span style={{ color: '#0f172a', fontWeight: 700 }}>: {studentNisn}</span>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <span style={{ color: '#64748b', fontWeight: 700, minWidth: '85px' }}>Semester</span>
                <span style={{ color: '#0f172a', fontWeight: 700 }}>: Semester {semester}</span>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <span style={{ color: '#64748b', fontWeight: 700, minWidth: '85px' }}>Class / Grade</span>
                <span style={{ color: '#0f172a', fontWeight: 700 }}>: {className} (Grade {gradeLevel})</span>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <span style={{ color: '#64748b', fontWeight: 700, minWidth: '85px' }}>Report Period</span>
                <span style={{ color: '#1e3a8a', fontWeight: 800 }}>: {monthLabel}</span>
              </div>
            </div>

            {/* Student Passport Photo */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div 
                style={{
                  width: '74px',
                  height: '92px',
                  borderRadius: '6px',
                  border: '1px solid #94a3b8',
                  overflow: 'hidden',
                  backgroundColor: '#e2e8f0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                {photos.identityPhotoUrl ? (
                  <img 
                    src={photos.identityPhotoUrl} 
                    alt={studentName}
                    onLoad={handleImageLoaded}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <div style={{ textAlign: 'center', padding: '4px' }}>
                    <span style={{ fontSize: '9px', color: '#64748b', fontWeight: 700, display: 'block' }}>
                      Foto Siswa
                    </span>
                    <span style={{ fontSize: '8px', color: '#94a3b8' }}>3 x 4</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* SECTION: BASIC LITERACY AND NUMERACY */}
          <div style={{ marginBottom: '14px' }}>
            <div 
              style={{
                backgroundColor: '#1e3a8a',
                color: '#ffffff',
                padding: '5px 12px',
                borderRadius: '6px 6px 0 0',
                fontSize: '10px',
                fontWeight: 800,
                letterSpacing: '0.8px',
                textTransform: 'uppercase',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <span>BASIC LITERACY AND NUMERACY</span>
              <span style={{ fontSize: '9px', fontWeight: 600, color: '#93c5fd' }}>
                (A: Amat Baik · D: Diharapkan · B: Berkembang)
              </span>
            </div>

            <table 
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                border: '1px solid #1e3a8a',
                fontSize: '9.5px',
                backgroundColor: '#ffffff'
              }}
            >
              <thead>
                <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '1px solid #1e3a8a', textAlign: 'center' }}>
                  <th style={{ borderRight: '1px solid #cbd5e1', padding: '5px 6px', width: '38px', fontWeight: 800 }}>NO</th>
                  <th style={{ borderRight: '1px solid #cbd5e1', padding: '5px 8px', textAlign: 'left', fontWeight: 800 }}>
                    SUBJECTS &amp; LEARNING GOALS
                  </th>
                  <th style={{ padding: '3px 0', width: '105px', fontWeight: 800 }} colSpan={3}>
                    <div style={{ paddingBottom: '3px', borderBottom: '1px solid #cbd5e1' }}>ACHIEVEMENT</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', fontSize: '9px', fontWeight: 900 }}>
                      <span style={{ color: '#15803d' }}>A</span>
                      <span style={{ borderLeft: '1px solid #cbd5e1', borderRight: '1px solid #cbd5e1', color: '#1e40af' }}>D</span>
                      <span style={{ color: '#d97706' }}>B</span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {!curriculum || !curriculum.subjects || curriculum.subjects.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: '16px', textAlign: 'center', color: '#64748b' }}>
                      Belum ada mata pelajaran dan Learning Goals untuk periode ini.
                    </td>
                  </tr>
                ) : (
                  curriculum.subjects.map((sub, sIdx) => {
                    return (
                      <React.Fragment key={sub.id}>
                        {/* Subject Banner Row */}
                        <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #cbd5e1' }}>
                          <td 
                            style={{
                              borderRight: '1px solid #cbd5e1',
                              padding: '4px 6px',
                              textAlign: 'center',
                              fontWeight: 800,
                              color: '#1e3a8a'
                            }}
                          >
                            {sIdx + 1}
                          </td>
                          <td 
                            colSpan={4} 
                            style={{
                              padding: '4px 8px',
                              fontWeight: 800,
                              color: '#0f172a',
                              textTransform: 'uppercase',
                              letterSpacing: '0.2px'
                            }}
                          >
                            {sub.name}
                          </td>
                        </tr>

                        {/* Learning Goals Rows under this Subject */}
                        {sub.learningGoals?.map((lg) => {
                          const res = lgResultsMap[lg.id];
                          const pred = res?.predicate || null;

                          return (
                            <tr key={lg.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                              <td style={{ borderRight: '1px solid #cbd5e1', padding: '4px 6px', textAlign: 'center', color: '#64748b' }}>
                                •
                              </td>
                              <td style={{ borderRight: '1px solid #cbd5e1', padding: '4px 8px', lineHeight: '1.35', color: '#1e293b' }}>
                                {lg.title}
                              </td>
                              {/* Predicate Checkmarks (No raw numbers printed!) */}
                              <td style={{ borderRight: '1px solid #cbd5e1', padding: '2px', textAlign: 'center', width: '35px' }}>
                                {pred === 'A' ? (
                                  <span style={{ color: '#15803d', fontWeight: 900, fontSize: '12px' }}>✓</span>
                                ) : null}
                              </td>
                              <td style={{ borderRight: '1px solid #cbd5e1', padding: '2px', textAlign: 'center', width: '35px' }}>
                                {pred === 'D' ? (
                                  <span style={{ color: '#1e40af', fontWeight: 900, fontSize: '12px' }}>✓</span>
                                ) : null}
                              </td>
                              <td style={{ padding: '2px', textAlign: 'center', width: '35px' }}>
                                {pred === 'B' ? (
                                  <span style={{ color: '#d97706', fontWeight: 900, fontSize: '12px' }}>✓</span>
                                ) : null}
                              </td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* SECTION: COMMENTS (ACADEMIC) */}
          <div style={{ marginBottom: '14px' }}>
            <div 
              style={{
                backgroundColor: '#1e3a8a',
                color: '#ffffff',
                padding: '4px 10px',
                borderRadius: '6px 6px 0 0',
                fontSize: '9.5px',
                fontWeight: 800,
                letterSpacing: '0.8px',
                textTransform: 'uppercase'
              }}
            >
              COMMENTS
            </div>
            <div 
              style={{
                border: '1px solid #1e3a8a',
                borderRadius: '0 0 6px 6px',
                padding: '10px 14px',
                fontSize: '9.5px',
                lineHeight: '1.5',
                color: '#1e293b',
                backgroundColor: '#ffffff',
                minHeight: '62px'
              }}
            >
              {narratives.academicComment}
            </div>
          </div>

          {/* SECTION: PROJECT */}
          <div>
            <div 
              style={{
                backgroundColor: '#1e3a8a',
                color: '#ffffff',
                padding: '4px 10px',
                borderRadius: '6px 6px 0 0',
                fontSize: '9.5px',
                fontWeight: 800,
                letterSpacing: '0.8px',
                textTransform: 'uppercase'
              }}
            >
              PROJECT : {project.projectTitle}
            </div>
            <div 
              style={{
                border: '1px solid #1e3a8a',
                borderRadius: '0 0 6px 6px',
                padding: '10px 14px',
                fontSize: '9.5px',
                lineHeight: '1.5',
                color: '#1e293b',
                backgroundColor: '#ffffff'
              }}
            >
              <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: '3px' }}>
                Project Overview :
              </div>
              <p style={{ margin: 0, textAlign: 'justify' }}>
                {project.projectOverview}
              </p>
            </div>
          </div>
        </div>

        {/* Page 1 Footer */}
        <div 
          style={{
            borderTop: '1px solid #cbd5e1',
            paddingTop: '6px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '8.5px',
            color: '#64748b'
          }}
        >
          <span>{studentName} · {className} · {monthLabel}</span>
          <span style={{ fontWeight: 700 }}>Page 1 of 2</span>
        </div>
      </div>

      {/* ============================================================ */}
      {/* PAGE 2: PROJECT SNAPSHOT, SEL PROFILE, LEGENDA, ATTENDANCE, SIGNATURES */}
      {/* ============================================================ */}
      <div 
        id="elem-monthly-pdf-page-2"
        className="elem-monthly-page bg-white shadow-xl print:shadow-none relative flex flex-col justify-between overflow-hidden"
        style={{
          width: '794px',
          minWidth: '794px',
          maxWidth: '794px',
          minHeight: '1123px',
          height: '1123px',
          padding: '36px 42px',
          boxSizing: 'border-box',
          backgroundColor: '#ffffff',
          color: '#0f172a',
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
        }}
      >
        <div>
          {/* Page 2 Mini Header */}
          <div 
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderBottom: '2px solid #1e3a8a',
              paddingBottom: '8px',
              marginBottom: '16px'
            }}
          >
            <div>
              <span style={{ fontSize: '11px', fontWeight: 900, color: '#1e3a8a', textTransform: 'uppercase' }}>
                Sekolah Lazuardi Elementary
              </span>
              <span style={{ fontSize: '10px', color: '#64748b', marginLeft: '8px' }}>
                · Monthly Progress Report
              </span>
            </div>
            <div style={{ fontSize: '10px', color: '#0f172a', fontWeight: 700 }}>
              {studentName} ({className}) · {monthLabel}
            </div>
          </div>

          {/* SECTION: PROJECT SNAPSHOT (3 Photos + Captions) */}
          <div style={{ marginBottom: '14px' }}>
            <div 
              style={{
                backgroundColor: '#1e3a8a',
                color: '#ffffff',
                padding: '4px 10px',
                borderRadius: '6px 6px 0 0',
                fontSize: '9.5px',
                fontWeight: 800,
                letterSpacing: '0.8px',
                textTransform: 'uppercase'
              }}
            >
              PROJECT SNAPSHOT
            </div>

            <div 
              style={{
                border: '1px solid #1e3a8a',
                borderRadius: '0 0 6px 6px',
                padding: '12px 14px',
                backgroundColor: '#ffffff'
              }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>
                {[0, 1, 2].map((idx) => {
                  const snap = photos.snapshots?.[idx];
                  return (
                    <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div 
                        style={{
                          width: '100%',
                          height: '138px',
                          borderRadius: '8px',
                          border: '1px solid #cbd5e1',
                          overflow: 'hidden',
                          backgroundColor: '#f1f5f9',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        {snap?.url ? (
                          <img 
                            src={snap.url} 
                            alt={`Project Snapshot ${idx + 1}`}
                            onLoad={handleImageLoaded}
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover'
                            }}
                          />
                        ) : (
                          <div style={{ textAlign: 'center', padding: '8px', color: '#94a3b8' }}>
                            <span style={{ fontSize: '9px', fontWeight: 600, display: 'block' }}>
                              Foto Snapshot {idx + 1}
                            </span>
                          </div>
                        )}
                      </div>
                      <div 
                        style={{
                          fontSize: '8.5px',
                          lineHeight: '1.35',
                          color: '#334155',
                          textAlign: 'center',
                          fontStyle: 'italic',
                          minHeight: '24px'
                        }}
                      >
                        {snap?.caption || `Dokumentasi kegiatan proyek ${idx + 1}`}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Link Photo Project */}
              <div 
                style={{
                  marginTop: '10px',
                  paddingTop: '8px',
                  borderTop: '1px dashed #cbd5e1',
                  fontSize: '9.5px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span style={{ fontWeight: 800, color: '#0f172a' }}>Link Photo Project :</span>
                {photos.albumLink || project.sharedAlbumLink ? (
                  <a 
                    href={photos.albumLink || project.sharedAlbumLink} 
                    target="_blank" 
                    rel="noreferrer"
                    style={{
                      color: '#2563eb',
                      textDecoration: 'underline',
                      fontWeight: 600,
                      wordBreak: 'break-all'
                    }}
                  >
                    {photos.albumLink || project.sharedAlbumLink}
                  </a>
                ) : (
                  <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Tautan album belum tersedia</span>
                )}
              </div>
            </div>
          </div>

          {/* SECTION: SOCIAL EMOTIONAL PROFILE */}
          <div style={{ marginBottom: '14px' }}>
            <div 
              style={{
                backgroundColor: '#1e3a8a',
                color: '#ffffff',
                padding: '4px 10px',
                borderRadius: '6px 6px 0 0',
                fontSize: '9.5px',
                fontWeight: 800,
                letterSpacing: '0.8px',
                textTransform: 'uppercase'
              }}
            >
              SOCIAL EMOTIONAL PROFILE
            </div>
            <div 
              style={{
                border: '1px solid #1e3a8a',
                borderRadius: '0 0 6px 6px',
                padding: '10px 14px',
                fontSize: '9.5px',
                lineHeight: '1.5',
                color: '#1e293b',
                backgroundColor: '#ffffff',
                minHeight: '66px'
              }}
            >
              {narratives.selProfile}
            </div>
          </div>

          {/* SECTION: LEGENDA & ATTENDANCE ROW */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '12px', marginBottom: '16px' }}>
            {/* Criteria Legend Box */}
            <div 
              style={{
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                padding: '8px 12px',
                backgroundColor: '#f8fafc',
                fontSize: '8.5px',
                lineHeight: '1.4'
              }}
            >
              <div style={{ fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', marginBottom: '4px', fontSize: '9px' }}>
                Kriteria Capaian (Predikat) :
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', color: '#334155' }}>
                <div>
                  <strong style={{ color: '#15803d' }}>A (Amat Baik)</strong> : Capaian melampaui kriteria ketuntasan
                </div>
                <div>
                  <strong style={{ color: '#1e40af' }}>D (Diharapkan)</strong> : Capaian telah memenuhi kriteria ketuntasan
                </div>
                <div>
                  <strong style={{ color: '#d97706' }}>B (Berkembang)</strong> : Masih memerlukan bimbingan dan pendampingan
                </div>
              </div>
            </div>

            {/* Attendance Percentage Box */}
            <div 
              style={{
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                padding: '8px 12px',
                backgroundColor: '#f8fafc',
                fontSize: '8.5px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center'
              }}
            >
              <div style={{ fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', marginBottom: '3px', fontSize: '9px' }}>
                Attendance (Kehadiran) :
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                <span style={{ fontSize: '18px', fontWeight: 900, color: '#1e3a8a' }}>
                  {attendance.isAvailable ? `${attendance.percentage}%` : '-'}
                </span>
                <span style={{ fontSize: '8.5px', color: '#475569', fontWeight: 600 }}>
                  {attendance.basisDescription}
                </span>
              </div>
            </div>
          </div>

          {/* SECTION: TITIMANGSA & 3 SIGNATURES */}
          <div style={{ marginTop: '12px' }}>
            {/* Titimangsa */}
            <div style={{ textAlign: 'right', fontSize: '9.5px', fontWeight: 700, color: '#0f172a', marginBottom: '14px' }}>
              {signatory.signingLocation}, {signatory.signingDate}
            </div>

            {/* 3 Signatures: Parents, Homeroom Teacher, Principal */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', textAlign: 'center' }}>
              {/* 1. Parents / Guardian */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span style={{ fontSize: '9px', fontWeight: 700, color: '#475569' }}>
                  Mengetahui,
                </span>
                <span style={{ fontSize: '9.5px', fontWeight: 800, color: '#0f172a', marginTop: '1px' }}>
                  Orang Tua / Wali
                </span>
                <div style={{ height: '54px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {/* Space for physical or digital parent signature */}
                </div>
                <div style={{ width: '80%', borderTop: '1px solid #0f172a', paddingTop: '3px' }}>
                  <span style={{ fontSize: '9px', color: '#475569' }}>( ............................................. )</span>
                </div>
              </div>

              {/* 2. Homeroom Teacher */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span style={{ fontSize: '9px', fontWeight: 700, color: '#475569' }}>
                  Guru Kelas,
                </span>
                <span style={{ fontSize: '9.5px', fontWeight: 800, color: '#0f172a', marginTop: '1px' }}>
                  Homeroom Teacher
                </span>
                <div style={{ height: '54px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {signatory.homeroomTeacherSignatureUrl ? (
                    <img 
                      src={signatory.homeroomTeacherSignatureUrl} 
                      alt="Signature"
                      onLoad={handleImageLoaded}
                      style={{ maxHeight: '48px', maxWidth: '120px', objectFit: 'contain' }}
                    />
                  ) : null}
                </div>
                <div style={{ width: '85%', borderTop: '1px solid #0f172a', paddingTop: '3px' }}>
                  <span style={{ fontSize: '9.5px', fontWeight: 800, color: '#0f172a', display: 'block' }}>
                    {signatory.homeroomTeacherName}
                  </span>
                  {signatory.homeroomTeacherNiy && (
                    <span style={{ fontSize: '8px', color: '#64748b' }}>
                      NIY: {signatory.homeroomTeacherNiy}
                    </span>
                  )}
                </div>
              </div>

              {/* 3. Principal */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span style={{ fontSize: '9px', fontWeight: 700, color: '#475569' }}>
                  Kepala Sekolah,
                </span>
                <span style={{ fontSize: '9.5px', fontWeight: 800, color: '#0f172a', marginTop: '1px' }}>
                  {signatory.principalTitle || 'Principal'}
                </span>
                <div style={{ height: '54px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {signatory.principalSignatureUrl ? (
                    <img 
                      src={signatory.principalSignatureUrl} 
                      alt="Signature"
                      onLoad={handleImageLoaded}
                      style={{ maxHeight: '48px', maxWidth: '120px', objectFit: 'contain' }}
                    />
                  ) : null}
                </div>
                <div style={{ width: '85%', borderTop: '1px solid #0f172a', paddingTop: '3px' }}>
                  <span style={{ fontSize: '9.5px', fontWeight: 800, color: '#0f172a', display: 'block' }}>
                    {signatory.principalName}
                  </span>
                  {signatory.principalNiy && (
                    <span style={{ fontSize: '8px', color: '#64748b' }}>
                      NIY: {signatory.principalNiy}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Page 2 Footer */}
        <div 
          style={{
            borderTop: '1px solid #cbd5e1',
            paddingTop: '6px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '8.5px',
            color: '#64748b'
          }}
        >
          <span>{studentName} · {className} · {monthLabel}</span>
          <span style={{ fontWeight: 700 }}>Page 2 of 2</span>
        </div>
      </div>
    </div>
  );
};
