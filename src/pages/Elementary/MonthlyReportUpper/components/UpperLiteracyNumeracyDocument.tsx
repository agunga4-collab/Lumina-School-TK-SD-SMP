import * as React from 'react';
import type {
  ElementaryUpperLiteracyNumeracySnapshot,
  ElementaryUpperLitNumClassConfigDoc,
  ElementaryUpperLitNumRecordDoc,
  ElementaryUpperStudentNarrativesDoc,
  ElementaryUpperReportSignatory,
  UpperLitNumSubjectField
} from '../../../../types/elementaryMonthlyUpperReport';
import { UPPER_LITNUM_FIELDS } from '../../../../types/elementaryMonthlyUpperReport';
import { formatMonthLabel } from '../../../../services/elementaryMonthlyUpperReportService';
import type { Student, Class } from '../../../../types';

export interface UpperLiteracyNumeracyDocumentProps {
  snapshot?: ElementaryUpperLiteracyNumeracySnapshot | null;
  previewData?: {
    student: Student;
    classInfo?: Class | null;
    academicYear: string;
    semester: string;
    month: string;
    monthLabel: string;
    classConfigDoc: ElementaryUpperLitNumClassConfigDoc | null;
    recordDoc: ElementaryUpperLitNumRecordDoc | null;
    narrativesDoc: ElementaryUpperStudentNarrativesDoc | null;
    signatory: ElementaryUpperReportSignatory;
  } | null;
  isDraft?: boolean;
  onReadyChange?: (ready: boolean) => void;
}

export const UpperLiteracyNumeracyDocument: React.FC<UpperLiteracyNumeracyDocumentProps> = ({
  snapshot,
  previewData,
  isDraft = false,
  onReadyChange
}) => {
  const student = snapshot ? snapshot.student : previewData?.student;
  const studentName = student?.name || 'Nama Siswa';
  const studentNisn = student && 'nisn' in student ? student.nisn : ((student as Student)?.nis || (student as Student)?.nisn || '-');
  const className = snapshot ? snapshot.student.className : (previewData?.classInfo?.name || 'Class');
  const gradeLevel = snapshot ? snapshot.student.grade : (previewData?.classInfo?.level || 4);

  const academicYear = snapshot ? snapshot.academicYear : (previewData?.academicYear || '2025/2026');
  const semester = snapshot ? snapshot.semester : (previewData?.semester || '1');
  const month = snapshot ? snapshot.month : (previewData?.month || '');
  const monthLabel = snapshot ? snapshot.monthLabel : (previewData?.monthLabel || formatMonthLabel(month));

  const classConfig = snapshot ? snapshot.classConfig : previewData?.classConfigDoc;
  const record = snapshot ? snapshot.record : previewData?.recordDoc;
  const narratives = snapshot ? snapshot.narratives : {
    bahasaIndonesiaNarrative: previewData?.narrativesDoc?.bahasaIndonesiaNarrative || 'Belum ada narasi Bahasa Indonesia.',
    englishNarrative: previewData?.narrativesDoc?.englishNarrative || 'Belum ada narasi English.',
    mathematicsNarrative: previewData?.narrativesDoc?.mathematicsNarrative || 'Belum ada narasi Mathematics.'
  };

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

  // Periods to chart: use comparisonPeriods if available, or fallback to current month
  const periods = React.useMemo(() => {
    if (classConfig?.comparisonPeriods && classConfig.comparisonPeriods.length > 0) {
      return classConfig.comparisonPeriods;
    }
    return [{ periodKey: month, label: monthLabel.split(' ')[0] || month, order: 1 }];
  }, [classConfig, month, monthLabel]);

  React.useEffect(() => {
    if (onReadyChange) {
      onReadyChange(true);
    }
  }, [onReadyChange]);

  // Chart Dimensions & Calculations
  const chartHeight = 175;
  const chartWidth = 710;
  const paddingLeft = 40;
  const paddingRight = 20;
  const paddingTop = 25;
  const paddingBottom = 40;
  const innerWidth = chartWidth - paddingLeft - paddingRight;
  const innerHeight = chartHeight - paddingTop - paddingBottom;

  // Subjects to chart
  const subjects = UPPER_LITNUM_FIELDS;
  const groupWidth = innerWidth / subjects.length;

  return (
    <div className="elem-upper-litnum-document-container flex flex-col items-center gap-6 py-6 print:p-0 print:gap-0">
      {isDraft && (
        <div className="bg-amber-100 text-amber-900 border border-amber-300 px-4 py-1.5 rounded-full text-xs font-bold shadow-sm">
          PRATINJAU DOKUMEN LITERASI &amp; NUMERASI (DRAFT)
        </div>
      )}

      {/* STRICT 1-PAGE A4 (794px x 1123px) */}
      <div
        className="elem-monthly-upper-page bg-white text-slate-800 shadow-xl print:shadow-none"
        style={{
          width: '794px',
          minHeight: '1123px',
          maxHeight: '1123px',
          boxSizing: 'border-box',
          padding: '24px 30px',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {/* Header / Kop Biru */}
        <div
          style={{
            backgroundColor: '#1e3a8a',
            color: '#ffffff',
            borderRadius: '8px',
            padding: '10px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '12px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '8px',
                backgroundColor: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 900,
                color: '#1e3a8a',
                fontSize: '22px'
              }}
            >
              L
            </div>
            <div>
              <h2 style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '0.8px', textTransform: 'uppercase', margin: 0 }}>
                Sekolah Lazuardi Elementary
              </h2>
              <p style={{ fontSize: '10px', color: '#93c5fd', margin: '2px 0 0 0', fontWeight: 600 }}>
                Global Compassionate School · Upper Grade (Gr. 4–6)
              </p>
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <h1 style={{ fontSize: '12.5px', fontWeight: 900, letterSpacing: '0.5px', textTransform: 'uppercase', margin: 0, color: '#f8fafc' }}>
              PERKEMBANGAN CAPAIAN KECAKAPAN LITERASI &amp; NUMERASI
            </h1>
            <span style={{ fontSize: '10px', color: '#bfdbfe', fontWeight: 700, textTransform: 'uppercase' }}>
              Monthly Literacy &amp; Numeracy · {monthLabel}
            </span>
          </div>
        </div>

        {/* Identity Bar */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.2fr 1fr 1fr',
            gap: '6px 16px',
            backgroundColor: '#f8fafc',
            border: '1px solid #cbd5e1',
            borderRadius: '8px',
            padding: '8px 14px',
            marginBottom: '12px',
            fontSize: '10px'
          }}
        >
          <div style={{ display: 'flex', gap: '6px' }}>
            <span style={{ color: '#64748b', fontWeight: 700, minWidth: '85px' }}>Student&apos;s Name</span>
            <span style={{ color: '#0f172a', fontWeight: 800 }}>: {studentName}</span>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <span style={{ color: '#64748b', fontWeight: 700, minWidth: '75px' }}>Class / Grade</span>
            <span style={{ color: '#0f172a', fontWeight: 700 }}>: {className} (Gr. {gradeLevel})</span>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <span style={{ color: '#64748b', fontWeight: 700, minWidth: '70px' }}>Period</span>
            <span style={{ color: '#1e3a8a', fontWeight: 800 }}>: {monthLabel}</span>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <span style={{ color: '#64748b', fontWeight: 700, minWidth: '85px' }}>NIS / NISN</span>
            <span style={{ color: '#0f172a', fontWeight: 700 }}>: {studentNisn}</span>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <span style={{ color: '#64748b', fontWeight: 700, minWidth: '75px' }}>Academic Year</span>
            <span style={{ color: '#0f172a', fontWeight: 700 }}>: {academicYear}</span>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <span style={{ color: '#64748b', fontWeight: 700, minWidth: '70px' }}>Semester</span>
            <span style={{ color: '#0f172a', fontWeight: 700 }}>: Semester {semester}</span>
          </div>
        </div>

        {/* CLUSTERED BAR CHART SECTION */}
        <div
          style={{
            border: '1px solid #1e3a8a',
            borderRadius: '8px',
            backgroundColor: '#ffffff',
            padding: '10px 14px',
            marginBottom: '12px'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div style={{ fontSize: '11px', fontWeight: 800, color: '#1e3a8a', textTransform: 'uppercase' }}>
              Grafik Capaian Literasi &amp; Numerasi
            </div>
            {/* Chart Legend */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '9px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ display: 'inline-block', width: '12px', height: '12px', backgroundColor: '#e2e8f0', border: '1px solid #94a3b8', borderRadius: '2px' }} />
                <span style={{ color: '#475569', fontWeight: 600 }}>Standar Minimal</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ display: 'inline-block', width: '12px', height: '12px', backgroundColor: '#2563eb', borderRadius: '2px' }} />
                <span style={{ color: '#1e3a8a', fontWeight: 700 }}>Capaian Siswa</span>
              </div>
            </div>
          </div>

          {/* Crisp Native SVG Clustered Chart */}
          <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
            <svg width={chartWidth} height={chartHeight} style={{ overflow: 'visible' }}>
              {/* Y-axis gridlines and labels (0, 25, 50, 75, 100) */}
              {[0, 25, 50, 75, 100].map(val => {
                const y = paddingTop + innerHeight - (val / 100) * innerHeight;
                return (
                  <g key={val}>
                    <line
                      x1={paddingLeft}
                      y1={y}
                      x2={paddingLeft + innerWidth}
                      y2={y}
                      stroke={val === 0 ? '#64748b' : '#e2e8f0'}
                      strokeWidth={val === 0 ? 1.5 : 1}
                      strokeDasharray={val === 0 ? undefined : '3 3'}
                    />
                    <text
                      x={paddingLeft - 8}
                      y={y + 3.5}
                      textAnchor="end"
                      fontSize="9"
                      fill="#64748b"
                      fontWeight="600"
                    >
                      {val}
                    </text>
                  </g>
                );
              })}

              {/* Subject Groups */}
              {subjects.map((sub, sIdx) => {
                const groupX = paddingLeft + sIdx * groupWidth;
                const standardVal = classConfig?.standards?.[sub.field] || sub.defaultStandard || 70;
                const subPeriods = periods;
                const slotWidth = groupWidth / subPeriods.length;

                return (
                  <g key={sub.field}>
                    {/* Background separator between subjects */}
                    {sIdx > 0 && (
                      <line
                        x1={groupX}
                        y1={paddingTop}
                        x2={groupX}
                        y2={paddingTop + innerHeight}
                        stroke="#cbd5e1"
                        strokeWidth={1}
                        strokeDasharray="4 4"
                      />
                    )}

                    {/* Bars for each comparison period */}
                    {subPeriods.map((p, pIdx) => {
                      const periodKey = p.periodKey;
                      const scoreEntry = record?.periodScores?.[sub.field]?.[periodKey];
                      const rawScore = scoreEntry?.score;
                      const hasScore = typeof rawScore === 'number' && !isNaN(rawScore);
                      const studentScore = hasScore ? rawScore : 0;

                      const slotX = groupX + pIdx * slotWidth;
                      const barPairWidth = Math.min(34, slotWidth - 8);
                      const barWidth = barPairWidth / 2 - 1.5;
                      const startX = slotX + (slotWidth - barPairWidth) / 2;

                      // Heights
                      const stdHeight = (Math.min(100, standardVal) / 100) * innerHeight;
                      const stdY = paddingTop + innerHeight - stdHeight;

                      const scoreHeight = (Math.min(100, studentScore) / 100) * innerHeight;
                      const scoreY = paddingTop + innerHeight - scoreHeight;

                      return (
                        <g key={p.periodKey}>
                          {/* Standard Bar (Grey) */}
                          <rect
                            x={startX}
                            y={stdY}
                            width={barWidth}
                            height={stdHeight}
                            fill="#e2e8f0"
                            stroke="#94a3b8"
                            strokeWidth={0.5}
                            rx={1.5}
                          />
                          <text
                            x={startX + barWidth / 2}
                            y={stdY - 3}
                            textAnchor="middle"
                            fontSize="8"
                            fill="#64748b"
                            fontWeight="700"
                          >
                            {standardVal}
                          </text>

                          {/* Student Score Bar (Blue) */}
                          {hasScore ? (
                            <>
                              <rect
                                x={startX + barWidth + 2}
                                y={scoreY}
                                width={barWidth}
                                height={scoreHeight}
                                fill="#2563eb"
                                rx={1.5}
                              />
                              <text
                                x={startX + barWidth + 2 + barWidth / 2}
                                y={scoreY - 3}
                                textAnchor="middle"
                                fontSize="8.5"
                                fill="#1e3a8a"
                                fontWeight="800"
                              >
                                {studentScore}
                              </text>
                            </>
                          ) : (
                            <text
                              x={startX + barWidth + 2 + barWidth / 2}
                              y={paddingTop + innerHeight - 8}
                              textAnchor="middle"
                              fontSize="8"
                              fill="#94a3b8"
                              fontStyle="italic"
                            >
                              -
                            </text>
                          )}

                          {/* Period Label under bars */}
                          <text
                            x={startX + barPairWidth / 2}
                            y={paddingTop + innerHeight + 12}
                            textAnchor="middle"
                            fontSize="8"
                            fill="#475569"
                            fontWeight="600"
                          >
                            {p.label || periodKey}
                          </text>
                        </g>
                      );
                    })}

                    {/* Subject Group Title */}
                    <text
                      x={groupX + groupWidth / 2}
                      y={paddingTop + innerHeight + 28}
                      textAnchor="middle"
                      fontSize="10"
                      fill="#1e3a8a"
                      fontWeight="800"
                      textTransform="uppercase"
                    >
                      {sub.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* SECTION: DESKRIPSI GRAFIK (3 DISTINCT NARRATIVE BOXES) */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '8px' }}>
          <div
            style={{
              backgroundColor: '#1e3a8a',
              color: '#ffffff',
              padding: '5px 12px',
              borderRadius: '6px',
              fontSize: '10px',
              fontWeight: 800,
              letterSpacing: '0.8px',
              textTransform: 'uppercase'
            }}
          >
            DESKRIPSI GRAFIK
          </div>

          {/* 1. Bahasa Indonesia */}
          <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden', backgroundColor: '#ffffff' }}>
            <div
              style={{
                backgroundColor: '#f1f5f9',
                padding: '4px 10px',
                fontSize: '9.5px',
                fontWeight: 800,
                color: '#1e3a8a',
                borderBottom: '1px solid #cbd5e1',
                display: 'flex',
                justifyContent: 'space-between'
              }}
            >
              <span>1. Bahasa Indonesia</span>
              <span style={{ fontSize: '8.5px', color: '#64748b', fontWeight: 600 }}>Capaian &amp; Analisis Guru</span>
            </div>
            <div style={{ padding: '8px 12px', fontSize: '9px', lineHeight: '1.45', color: '#1e293b', minHeight: '52px' }}>
              {narratives.bahasaIndonesiaNarrative}
            </div>
          </div>

          {/* 2. English */}
          <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden', backgroundColor: '#ffffff' }}>
            <div
              style={{
                backgroundColor: '#f1f5f9',
                padding: '4px 10px',
                fontSize: '9.5px',
                fontWeight: 800,
                color: '#1e3a8a',
                borderBottom: '1px solid #cbd5e1',
                display: 'flex',
                justifyContent: 'space-between'
              }}
            >
              <span>2. English</span>
              <span style={{ fontSize: '8.5px', color: '#64748b', fontWeight: 600 }}>Teacher&apos;s Review &amp; Progress</span>
            </div>
            <div style={{ padding: '8px 12px', fontSize: '9px', lineHeight: '1.45', color: '#1e293b', minHeight: '52px' }}>
              {narratives.englishNarrative}
            </div>
          </div>

          {/* 3. Mathematics */}
          <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden', backgroundColor: '#ffffff' }}>
            <div
              style={{
                backgroundColor: '#f1f5f9',
                padding: '4px 10px',
                fontSize: '9.5px',
                fontWeight: 800,
                color: '#1e3a8a',
                borderBottom: '1px solid #cbd5e1',
                display: 'flex',
                justifyContent: 'space-between'
              }}
            >
              <span>3. Mathematics</span>
              <span style={{ fontSize: '8.5px', color: '#64748b', fontWeight: 600 }}>Capaian &amp; Analisis Guru</span>
            </div>
            <div style={{ padding: '8px 12px', fontSize: '9px', lineHeight: '1.45', color: '#1e293b', minHeight: '52px' }}>
              {narratives.mathematicsNarrative}
            </div>
          </div>
        </div>

        {/* TITIMANGSA & SIGNATURES SECTION */}
        <div style={{ marginTop: 'auto', paddingTop: '4px' }}>
          <div style={{ textAlign: 'right', fontSize: '9px', color: '#334155', fontWeight: 600, marginBottom: '6px' }}>
            {signatory.signingLocation}, {signatory.signingDate}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: '12px',
              textAlign: 'center',
              fontSize: '9px'
            }}
          >
            {/* Homeroom Teacher */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span style={{ color: '#64748b', fontWeight: 700, marginBottom: '2px' }}>Acknowledged by,</span>
              <span style={{ color: '#0f172a', fontWeight: 700, marginBottom: '2px' }}>Homeroom Teacher</span>
              <div style={{ height: '42px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {signatory.homeroomTeacherSignatureUrl ? (
                  <img
                    src={signatory.homeroomTeacherSignatureUrl}
                    alt="Signature"
                    style={{ maxHeight: '40px', maxWidth: '90px', objectFit: 'contain' }}
                  />
                ) : null}
              </div>
              <div style={{ fontWeight: 800, color: '#0f172a', borderTop: '1px solid #94a3b8', width: '85%', paddingTop: '3px' }}>
                {signatory.homeroomTeacherName}
              </div>
              {signatory.homeroomTeacherNiy && (
                <span style={{ fontSize: '8px', color: '#64748b' }}>NIY. {signatory.homeroomTeacherNiy}</span>
              )}
            </div>

            {/* Parents */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span style={{ color: '#64748b', fontWeight: 700, marginBottom: '2px' }}>Acknowledged by,</span>
              <span style={{ color: '#0f172a', fontWeight: 700, marginBottom: '2px' }}>Parents</span>
              <div style={{ height: '42px' }} />
              <div style={{ fontWeight: 800, color: '#0f172a', borderTop: '1px solid #94a3b8', width: '85%', paddingTop: '3px' }}>
                ( .......................................... )
              </div>
            </div>

            {/* Principal */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span style={{ color: '#64748b', fontWeight: 700, marginBottom: '2px' }}>Approved by,</span>
              <span style={{ color: '#0f172a', fontWeight: 700, marginBottom: '2px' }}>Principal</span>
              <div style={{ height: '42px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {signatory.principalSignatureUrl ? (
                  <img
                    src={signatory.principalSignatureUrl}
                    alt="Signature"
                    style={{ maxHeight: '40px', maxWidth: '90px', objectFit: 'contain' }}
                  />
                ) : null}
              </div>
              <div style={{ fontWeight: 800, color: '#0f172a', borderTop: '1px solid #94a3b8', width: '85%', paddingTop: '3px' }}>
                {signatory.principalName}
              </div>
              {signatory.principalNiy && (
                <span style={{ fontSize: '8px', color: '#64748b' }}>NIY. {signatory.principalNiy}</span>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            borderTop: '1px solid #e2e8f0',
            paddingTop: '6px',
            marginTop: '8px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '8.5px',
            color: '#94a3b8'
          }}
        >
          <span>Sekolah Lazuardi Elementary · Literacy &amp; Numeracy Report</span>
          <span>Halaman 1 dari 1 (Dokumen Terpisah)</span>
        </div>
      </div>
    </div>
  );
};
