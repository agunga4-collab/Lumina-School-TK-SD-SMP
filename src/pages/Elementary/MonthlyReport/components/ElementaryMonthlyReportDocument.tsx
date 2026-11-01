import * as React from 'react';
import type { 
  ElementaryMonthlyReportSnapshot,
  ElementaryMonthlyAttendanceSummary,
  ElementaryMonthlyReportSignatory,
  ElementaryMonthlyCurriculumDoc,
  ElementaryMonthlyStudentNarrativeDoc,
  ElementaryMonthlyProjectDoc,
  ElementaryMonthlyStudentPhotoDoc,
  LGAverageResult
} from '../../../../types/elementaryMonthlyReport';
import { calculateLGAverageAndPredicate } from '../../../../types/elementaryMonthlyReport';
import { buildElementaryMonthlyReportSnapshot } from '../../../../lib/elementaryMonthlyReportModel';
import { resolveElementaryMonthlyImage, waitForElementaryMonthlyPages } from '../../../../lib/elementaryMonthlyReportRender';
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
  onRenderError?: (message: string | null) => void;
}

export const ElementaryMonthlyReportDocument: React.FC<ElementaryMonthlyReportDocumentProps> = ({
  snapshot,
  previewData,
  isDraft = false,
  onReadyChange,
  onRenderError
}) => {
  const report = React.useMemo(() => snapshot || (previewData ? buildElementaryMonthlyReportSnapshot({
    student: previewData.student,
    classId: previewData.classInfo?.id || previewData.curriculumDoc?.classId || '',
    className: previewData.classInfo?.name || previewData.curriculumDoc?.className || '',
    gradeLevel: Number(previewData.classInfo?.grade || previewData.curriculumDoc?.gradeLevel || 0),
    academicYear: previewData.academicYear,
    semester: previewData.semester,
    month: previewData.month,
    curriculumDoc: previewData.curriculumDoc,
    studentScoreDoc: { scores: previewData.scoresMap },
    narrativeDoc: previewData.narrativeDoc,
    projectDoc: previewData.projectDoc,
    photoDoc: previewData.photoDoc,
    attendanceSummary: previewData.attendanceSummary,
    signatory: previewData.signatory,
    logoUrl: previewData.logoUrl || null
  }) : null), [snapshot, previewData]);

  const student = report?.student;
  const academicYear = report?.academicYear || '';
  const semester = report?.semester || '';
  const month = report?.month || '';
  const monthLabel = report?.monthLabel || '';
  const curriculum = report?.curriculum;
  const scoresMap = report?.scoresSummary?.scores || {};
  const lgResultsMap = React.useMemo<Record<string, LGAverageResult>>(() => {
    if (report?.scoresSummary?.lgResults) return report.scoresSummary.lgResults;
    const results: Record<string, LGAverageResult> = {};
    for (const subject of curriculum?.subjects || []) {
      for (const goal of subject.learningGoals || []) {
        results[goal.id] = calculateLGAverageAndPredicate(scoresMap, goal.learningObjectives || [], goal.kkmOverride || subject.kkm || 70);
      }
    }
    return results;
  }, [report, curriculum, scoresMap]);
  const project = report?.project || { projectTitle: '', projectOverview: '', sharedAlbumLink: '' };
  const photos = report?.photos || { identityPhotoUrl: '', snapshots: [], albumLink: '' };
  const narratives = report?.narratives || { academicComment: '', selProfile: '' };
  const attendance = report?.attendance || {
    startDate: '', endDate: '', presentDays: 0, totalDays: 0, percentage: 0,
    basisDescription: 'Belum dikonfigurasi', isAvailable: false
  };
  const signatory: ElementaryMonthlyReportSignatory = report?.signatory || {
    principalName: '', principalTitle: '', principalNiy: '', principalSignatureUrl: null,
    homeroomTeacherName: '', homeroomTeacherNiy: '', homeroomTeacherSignatureUrl: null,
    signingDate: '', signingLocation: ''
  };
  const logoUrl = report?.logoUrl || '';
  const studentName = student?.name || 'Nama Siswa belum diisi';
  const studentNisn = student?.nisn || '-';
  const className = student?.className || '-';
  const gradeLevel = student?.grade || '-';
  const signingLine = signatory.signingDate.toLowerCase().startsWith(signatory.signingLocation.toLowerCase() + ',')
    ? signatory.signingDate
    : [signatory.signingLocation, signatory.signingDate].filter(Boolean).join(', ');
  const rawAlbumLink = photos.albumLink || project.sharedAlbumLink || '';
  const albumLink = /^https?:\/\//i.test(rawAlbumLink) ? rawAlbumLink : '';
  const rootRef = React.useRef<HTMLDivElement>(null);
  const callbacksRef = React.useRef({ onReadyChange, onRenderError });
  callbacksRef.current = { onReadyChange, onRenderError };
  const scope = {
    classId: curriculum?.classId || previewData?.classInfo?.id || '',
    studentId: student?.id || '', academicYear, semester, month
  };
  const sources = Array.from(new Set([
    logoUrl, photos.identityPhotoUrl || '', ...photos.snapshots.map(photo => photo.url || ''),
    signatory.principalSignatureUrl || '', signatory.homeroomTeacherSignatureUrl || ''
  ].filter(Boolean)));
  const assetKey = JSON.stringify({ scope, sources });
  const contentKey = JSON.stringify([report, isDraft]);
  const [assetState, setAssetState] = React.useState<{ key: string; urls: Record<string, string>; error: string | null }>({ key: '', urls: {}, error: null });
  const [renderError, setRenderError] = React.useState<string | null>(null);
  const resolvedImages = assetState.key === assetKey ? assetState.urls : {};

  React.useEffect(() => {
    const controller = new AbortController();
    callbacksRef.current.onReadyChange?.(false);
    callbacksRef.current.onRenderError?.(null);
    setRenderError(null);
    setAssetState({ key: '', urls: {}, error: null });
    Promise.all(sources.map(async source => [source, await resolveElementaryMonthlyImage(source, scope, controller.signal)] as const))
      .then(entries => {
        if (!controller.signal.aborted) setAssetState({ key: assetKey, urls: Object.fromEntries(entries), error: null });
      })
      .catch(error => {
        if (!controller.signal.aborted) {
          const message = error instanceof Error ? error.message : 'Gambar laporan gagal dimuat.';
          setAssetState({ key: assetKey, urls: {}, error: message });
          setRenderError(message);
          callbacksRef.current.onRenderError?.(message);
        }
      });
    return () => controller.abort();
  }, [assetKey]);

  React.useEffect(() => {
    const controller = new AbortController();
    callbacksRef.current.onReadyChange?.(false);
    if (!rootRef.current || assetState.key !== assetKey || assetState.error) return () => controller.abort();
    setRenderError(null);
    callbacksRef.current.onRenderError?.(null);
    const pages = Array.from(rootRef.current.querySelectorAll<HTMLElement>('[data-monthly-page]')) as HTMLElement[];
    waitForElementaryMonthlyPages(pages, controller.signal).then(() => {
      if (!controller.signal.aborted) callbacksRef.current.onReadyChange?.(true);
    }).catch(error => {
      if (!controller.signal.aborted) {
        const message = error instanceof Error ? error.message : 'Renderer laporan belum siap.';
        setRenderError(message);
        callbacksRef.current.onRenderError?.(message);
      }
    });
    return () => controller.abort();
  }, [assetState, assetKey, contentKey]);

  return (
    <div ref={rootRef} className="flex flex-col items-center gap-8 py-4 print:p-0" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '32px', padding: '16px 0', flexShrink: 0 }}>
      {renderError && (
        <div role="alert" data-html2canvas-ignore="true" style={{ width: 794, padding: 12, border: '1px solid #dc2626', color: '#991b1b', background: '#fef2f2', fontSize: 13 }}>
          {renderError}
        </div>
      )}
      {/* ============================================================ */}
      {/* PAGE 1: KOP, IDENTITAS, BASIC LITERACY & NUMERACY, COMMENTS, PROJECT */}
      {/* ============================================================ */}
      <div 
        data-monthly-page="1"
        className="elem-monthly-page bg-white shadow-xl print:shadow-none relative flex flex-col justify-between"
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          width: '794px',
          minWidth: '794px',
          maxWidth: '794px',
          minHeight: '1123px',
          flexShrink: 0,
          overflow: 'visible',
          overflowWrap: 'anywhere',
          gap: '14px',
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
              borderRadius: 0,
              padding: '16px 20px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              boxShadow: '0 2px 4px rgba(0,0,0,0.06)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ width: '130px', height: '52px', backgroundColor: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px' }}>
                {logoUrl ? (
                  <img src={resolvedImages[logoUrl]} alt="Logo resmi Elementary" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                ) : (
                  <span style={{ fontSize: '9px', color: '#475569', textAlign: 'center' }}>Logo Elementary belum dikonfigurasi</span>
                )}
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
              borderRadius: 0,
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
                  borderRadius: 0,
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
                    src={resolvedImages[photos.identityPhotoUrl]} 
                    alt={studentName}
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
                borderRadius: 0,
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
                (A: Achieved · D: Developing · B: Beginning)
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
                              padding: '2.5px 6px',
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
                              padding: '2.5px 8px',
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
                              <td style={{ borderRight: '1px solid #cbd5e1', padding: '2.5px 6px', textAlign: 'center', color: '#64748b' }}>
                                •
                              </td>
                              <td style={{ borderRight: '1px solid #cbd5e1', padding: '2.5px 8px', lineHeight: '1.35', color: '#1e293b' }}>
                                {lg.title}
                              </td>
                              {/* Predicate Checkmarks (No raw numbers printed!) */}
                              <td style={{ borderRight: '1px solid #cbd5e1', padding: '1px', textAlign: 'center', width: '35px' }}>
                                {pred === 'A' ? (
                                  <span style={{ color: '#15803d', fontWeight: 900, fontSize: '12px', lineHeight: '1' }}>✓</span>
                                ) : null}
                              </td>
                              <td style={{ borderRight: '1px solid #cbd5e1', padding: '1px', textAlign: 'center', width: '35px' }}>
                                {pred === 'D' ? (
                                  <span style={{ color: '#1e40af', fontWeight: 900, fontSize: '12px', lineHeight: '1' }}>✓</span>
                                ) : null}
                              </td>
                              <td style={{ padding: '1px', textAlign: 'center', width: '35px' }}>
                                {pred === 'B' ? (
                                  <span style={{ color: '#d97706', fontWeight: 900, fontSize: '12px', lineHeight: '1' }}>✓</span>
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
                borderRadius: 0,
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
                borderRadius: 0,
                padding: '10px 14px',
                fontSize: '9.5px',
                lineHeight: '1.5',
                color: '#1e293b',
                backgroundColor: '#ffffff',
                minHeight: '62px',
                whiteSpace: 'pre-wrap'
              }}
            >
              {narratives.academicComment || 'Academic Comments belum diisi.'}
            </div>
          </div>

          {/* SECTION: PROJECT */}
          <div>
            <div 
              style={{
                backgroundColor: '#1e3a8a',
                color: '#ffffff',
                padding: '4px 10px',
                borderRadius: 0,
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
                borderRadius: 0,
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
              <p style={{ margin: 0, textAlign: 'justify', whiteSpace: 'pre-wrap' }}>
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
        data-monthly-page="2"
        className="elem-monthly-page bg-white shadow-xl print:shadow-none relative flex flex-col justify-between"
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          width: '794px',
          minWidth: '794px',
          maxWidth: '794px',
          minHeight: '1123px',
          flexShrink: 0,
          overflow: 'visible',
          overflowWrap: 'anywhere',
          gap: '14px',
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
                borderRadius: 0,
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
                borderRadius: 0,
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
                          borderRadius: 0,
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
                            src={resolvedImages[snap.url]} 
                            alt={`Project Snapshot ${idx + 1}`}
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
                          minHeight: '24px',
                          border: '1px solid #cbd5e1',
                          padding: '5px',
                          whiteSpace: 'pre-wrap'
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
                {albumLink ? (
                  <a 
                    href={albumLink} data-monthly-album="true" 
                    target="_blank" 
                    rel="noreferrer"
                    style={{
                      color: '#2563eb',
                      textDecoration: 'underline',
                      fontWeight: 600,
                      wordBreak: 'break-all'
                    }}
                  >
                    {albumLink}
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
                borderRadius: 0,
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
                borderRadius: 0,
                padding: '10px 14px',
                fontSize: '9.5px',
                lineHeight: '1.5',
                color: '#1e293b',
                backgroundColor: '#ffffff',
                minHeight: '66px',
                whiteSpace: 'pre-wrap'
              }}
            >
              {narratives.selProfile || 'Social Emotional Profile belum diisi.'}
            </div>
          </div>

          {/* SECTION: LEGENDA & ATTENDANCE ROW */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '12px', marginBottom: '16px' }}>
            {/* Criteria Legend Box */}
            <div 
              style={{
                border: '1px solid #cbd5e1',
                borderRadius: 0,
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
                  <strong style={{ color: '#15803d' }}>A — Achieved</strong>
                </div>
                <div>
                  <strong style={{ color: '#1e40af' }}>D — Developing</strong>
                </div>
                <div>
                  <strong style={{ color: '#d97706' }}>B — Beginning</strong>
                </div>
              </div>
            </div>

            {/* Attendance Percentage Box */}
            <div 
              style={{
                border: '1px solid #cbd5e1',
                borderRadius: 0,
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
              {signingLine || 'Titimangsa belum dikonfigurasi'}
            </div>

            {/* Signatures: Principal, Homeroom Teacher, Parents */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', textAlign: 'center' }}>
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
                      src={resolvedImages[signatory.principalSignatureUrl]} 
                      alt="Signature"
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
                      src={resolvedImages[signatory.homeroomTeacherSignatureUrl]} 
                      alt="Signature"
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

              {/* 1. Parents / Guardian */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span style={{ fontSize: '9px', fontWeight: 700, color: '#475569' }}>
                  Mengetahui,
                </span>
                <span style={{ fontSize: '9.5px', fontWeight: 800, color: '#0f172a', marginTop: '1px' }}>
                  Parents / Guardian
                </span>
                <div style={{ height: '54px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {/* Space for physical or digital parent signature */}
                </div>
                <div style={{ width: '80%', borderTop: '1px solid #0f172a', paddingTop: '3px' }}>
                  <span style={{ fontSize: '9px', color: '#475569' }}>________________________</span>
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
