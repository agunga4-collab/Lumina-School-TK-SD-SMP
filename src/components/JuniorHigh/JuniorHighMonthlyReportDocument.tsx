import * as React from 'react';
import type { Student, ClassReportSummary, JuniorHighMonthlyReportComment } from '../../types';

export interface JuniorHighMonthlyReportDocumentProps {
  student: Student;
  className: string;
  periodKey: string;
  logos?: any;
  reportConfig?: any;
  homeroomTeacherProfile?: any;
  homeroomTeacherName?: string;
  classSummary?: ClassReportSummary | null;
  weeklyLessons?: { title: string; summary: string }[];
  selfExplorationSlots?: { slot: number; strandNameSnapshot: string; activityNameSnapshot: string; reflectionText: string }[];
  attendance?: { sickLeave: number; excusedLeave: number; absent: number } | null;
  attendanceAvailable?: boolean;
  comment?: JuniorHighMonthlyReportComment | null;
  isPreview?: boolean;
  documentIdPrefix?: string;
}

const englishMonths = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export function getEnglishPeriodDetails(periodKey: string) {
  if (!periodKey || !periodKey.includes('-')) {
    return { day: '31', monthName: 'August', year: '2026' };
  }
  const [yearStr, monthStr] = periodKey.split('-');
  const yearVal = parseInt(yearStr, 10);
  const monthVal = parseInt(monthStr, 10);
  const monthIdx = monthVal - 1;
  const monthName = (monthIdx >= 0 && monthIdx < 12) ? englishMonths[monthIdx] : 'August';
  
  // Get last day of the month
  const lastDay = new Date(yearVal, monthVal, 0).getDate();
  
  return {
    day: String(lastDay),
    monthName,
    year: String(yearVal)
  };
}

export const JuniorHighMonthlyReportDocument: React.FC<JuniorHighMonthlyReportDocumentProps> = ({
  student,
  className,
  periodKey,
  logos,
  reportConfig,
  homeroomTeacherProfile,
  homeroomTeacherName,
  classSummary,
  weeklyLessons = [],
  selfExplorationSlots = [],
  attendance,
  attendanceAvailable = true,
  comment,
  isPreview = false,
  documentIdPrefix = 'jh-pdf'
}) => {
  const periodDetails = getEnglishPeriodDetails(periodKey);

  const displayComment = comment?.generalComment || '';
  const isFinalComment = comment?.status === 'FINAL';

  return (
    <div className="jh-monthly-report-wrapper flex flex-col items-center gap-8 print:gap-0 print:m-0 print:p-0">
      {/* PAGE 1 */}
      <div 
        id={`${documentIdPrefix}-page-1`}
        className="jh-page-sheet bg-white text-slate-900 shadow-md print:shadow-none relative flex flex-col justify-between"
        style={{
          width: '794px',
          height: '1123px',
          minWidth: '794px',
          minHeight: '1123px',
          maxHeight: '1123px',
          padding: '24px',
          boxSizing: 'border-box',
          backgroundColor: '#ffffff',
          position: 'relative',
          fontFamily: "'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
          pageBreakAfter: 'always',
          breakAfter: 'page'
        }}
      >
        {/* Frame Border */}
        <div 
          style={{
            flex: 1,
            border: '3px solid #002366',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxSizing: 'border-box',
            position: 'relative',
            overflow: 'hidden'
          }}
        >
          {/* Header & Tables Container */}
          <div>
            {/* Kop Lazuardi Junior High */}
            <div className="flex items-start justify-between">
              <div>
                {logos?.JUNIOR_HIGH?.rectangular ? (
                  <img 
                    src={logos.JUNIOR_HIGH.rectangular} 
                    alt="Lazuardi Junior High Logo" 
                    style={{ width: '180px', height: 'auto', maxHeight: '60px', objectFit: 'contain' }}
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="flex flex-col">
                    <span className="text-base font-extrabold text-[#002366] uppercase tracking-wider">
                      Lazuardi
                    </span>
                    <span className="text-xs font-semibold text-slate-600">
                      Junior High School
                    </span>
                  </div>
                )}
              </div>
              <div className="text-[11px] text-slate-800 space-y-0.5 text-right font-medium leading-relaxed">
                <div>Student's name : <span className="font-bold">{student.name}</span></div>
                <div>Class : <span className="font-bold">{className || '-'}</span></div>
                <div>Period : <span className="font-bold">{periodDetails.monthName} {periodDetails.year}</span></div>
              </div>
            </div>

            {/* Title */}
            <div className="text-center my-3.5">
              <h1 className="text-sm font-black tracking-wider text-[#002366] uppercase">
                STUDENT'S MONTHLY PROGRESS REPORT
              </h1>
            </div>

            {/* Blue Divider Line */}
            <div style={{ height: '4px', backgroundColor: '#002366', width: '100%' }} className="mb-5" />

            {/* Table 1: Learning Journey & Summary */}
            <div className="mb-5">
              <table className="w-full text-left border-collapse" style={{ tableLayout: 'fixed' }}>
                <thead>
                  <tr className="bg-[#002366] text-white text-[10px] font-bold uppercase tracking-wider">
                    <th className="border border-[#002366] p-2.5 w-[35%]">LEARNING JOURNEY</th>
                    <th className="border border-[#002366] p-2.5 w-[65%]">SUMMARY</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-white text-[10.5px]">
                    <td className="border border-slate-300 p-3 font-bold align-top text-slate-900 leading-snug">
                      {classSummary?.sections?.learningJourney?.title || 'Learning Journey'}
                    </td>
                    <td className="border border-slate-300 p-3 text-slate-700 align-top leading-relaxed whitespace-pre-wrap">
                      {classSummary?.sections?.learningJourney?.summary || (
                        <span className="text-slate-400 italic">No summary available for this period.</span>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Table 2: Weekly Lessons & Summary */}
            <div className="overflow-hidden">
              <table className="w-full text-left border-collapse" style={{ tableLayout: 'fixed' }}>
                <thead>
                  <tr className="bg-[#002366] text-white text-[10px] font-bold uppercase tracking-wider">
                    <th className="border border-[#002366] p-2.5 w-[35%]">WEEKLY LESSONS</th>
                    <th className="border border-[#002366] p-2.5 w-[65%]">SUMMARY</th>
                  </tr>
                </thead>
                <tbody>
                  {weeklyLessons.length > 0 ? (
                    weeklyLessons.map((item, idx) => (
                      <tr key={idx} className="bg-white text-[10px]">
                        <td className="border border-slate-300 p-2.5 font-bold align-top text-slate-900 leading-snug">
                          {item.title}
                        </td>
                        <td className="border border-slate-300 p-2.5 text-slate-700 align-top leading-relaxed whitespace-pre-wrap">
                          {item.summary}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr className="bg-white text-[10px]">
                      <td colSpan={2} className="border border-slate-300 p-4 text-center text-slate-400 italic">
                        No weekly lessons recorded for this period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Page 1 Footer Strip */}
          <div 
            style={{
              backgroundColor: '#002366',
              margin: 'auto -24px -24px -24px',
              height: '28px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              boxSizing: 'border-box',
              gap: '1px'
            }}
          >
            <div style={{ fontSize: '7px', color: '#ffffff', fontWeight: 600, textTransform: 'none', lineHeight: 1.1, textAlign: 'center' }}>
              Griya Cinere I, Jl. Garuda Ujung No. 35, Cinere, Kec Limo, Kota Depok, Jawa barat 16515
            </div>
            <div style={{ fontSize: '7px', color: '#ffffff', fontWeight: 600, textTransform: 'none', lineHeight: 1.1, textAlign: 'center' }}>
              Telp. (021) 753 4841 Email: information@lazuardi.sch.id WhatsApp: +62 813 8925 7784
            </div>
          </div>
        </div>
      </div>

      {/* PAGE 2 */}
      <div 
        id={`${documentIdPrefix}-page-2`}
        className="jh-page-sheet bg-white text-slate-900 shadow-md print:shadow-none relative flex flex-col justify-between"
        style={{
          width: '794px',
          height: '1123px',
          minWidth: '794px',
          minHeight: '1123px',
          maxHeight: '1123px',
          padding: '24px',
          boxSizing: 'border-box',
          backgroundColor: '#ffffff',
          position: 'relative',
          fontFamily: "'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
        }}
      >
        {/* Frame Border */}
        <div 
          style={{
            flex: 1,
            border: '3px solid #002366',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxSizing: 'border-box',
            position: 'relative',
            overflow: 'hidden'
          }}
        >
          {/* Header & Content Container */}
          <div>
            {/* Kop Lazuardi Junior High Page 2 */}
            <div className="flex items-start justify-between">
              <div>
                {logos?.JUNIOR_HIGH?.rectangular ? (
                  <img 
                    src={logos.JUNIOR_HIGH.rectangular} 
                    alt="Lazuardi Junior High Logo" 
                    style={{ width: '180px', height: 'auto', maxHeight: '60px', objectFit: 'contain' }}
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="flex flex-col">
                    <span className="text-base font-extrabold text-[#002366] uppercase tracking-wider">
                      Lazuardi
                    </span>
                    <span className="text-xs font-semibold text-slate-600">
                      Junior High School
                    </span>
                  </div>
                )}
              </div>
              <div className="text-[11px] text-slate-800 space-y-0.5 text-right font-medium leading-relaxed">
                <div>Student's name : <span className="font-bold">{student.name}</span></div>
                <div>Class : <span className="font-bold">{className || '-'}</span></div>
                <div>Period : <span className="font-bold">{periodDetails.monthName} {periodDetails.year}</span></div>
              </div>
            </div>

            {/* Title Page 2 */}
            <div className="text-center my-3.5">
              <h1 className="text-sm font-black tracking-wider text-[#002366] uppercase">
                STUDENT'S MONTHLY PROGRESS REPORT
              </h1>
            </div>

            {/* Blue Divider Line */}
            <div style={{ height: '4px', backgroundColor: '#002366', width: '100%' }} className="mb-5" />

            {/* Table 1: Self Exploration & Monthly Reflections */}
            <div className="mb-5">
              <table className="w-full text-left border-collapse" style={{ tableLayout: 'fixed' }}>
                <thead>
                  <tr className="bg-[#002366] text-white text-[10px] font-bold uppercase tracking-wider">
                    <th className="border border-[#002366] p-2.5 w-[35%]">SELF EXPLORATION</th>
                    <th className="border border-[#002366] p-2.5 w-[65%]">MONTHLY REFLECTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {selfExplorationSlots.length > 0 ? (
                    selfExplorationSlots.map((slot) => (
                      <tr key={slot.slot} className="bg-white text-[10px]">
                        <td className="border border-slate-300 p-2.5 align-top text-slate-900 leading-snug">
                          <div className="font-bold text-[#002366] mb-0.5">Slot {slot.slot}</div>
                          <div className="font-semibold text-slate-800">{slot.strandNameSnapshot}</div>
                          <div className="text-[9px] text-slate-500 mt-0.5">{slot.activityNameSnapshot}</div>
                        </td>
                        <td className="border border-slate-300 p-2.5 text-slate-700 align-top leading-relaxed whitespace-pre-wrap">
                          {slot.reflectionText}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr className="bg-white text-[10px]">
                      <td colSpan={2} className="border border-slate-300 p-3 text-center text-slate-400 italic">
                        No self-exploration reflections approved for this period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Table 2: Attendance & General Comments */}
            <div className="mb-5">
              <table className="w-full text-left border-collapse" style={{ tableLayout: 'fixed' }}>
                <thead>
                  <tr className="bg-[#002366] text-white text-[10px] font-bold uppercase tracking-wider">
                    <th className="border border-[#002366] p-2.5 w-[35%]">Attendance</th>
                    <th className="border border-[#002366] p-2.5 w-[65%]">GENERAL COMMENTS</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-white text-[10px]">
                    <td className="border border-slate-300 p-3 align-top text-slate-900 font-semibold space-y-1.5">
                      <div>Sick Leave : <span className="font-bold text-slate-950">{attendanceAvailable ? (attendance?.sickLeave ?? 0) : '-'}</span></div>
                      <div>Excused Leave : <span className="font-bold text-slate-950">{attendanceAvailable ? (attendance?.excusedLeave ?? 0) : '-'}</span></div>
                      <div>Absent : <span className="font-bold text-slate-950">{attendanceAvailable ? (attendance?.absent ?? 0) : '-'}</span></div>
                    </td>
                    <td className="border border-slate-300 p-3 text-slate-800 align-top leading-relaxed whitespace-pre-wrap text-[10px]">
                      {displayComment ? (
                        <div>
                          {displayComment}
                          {isPreview && !isFinalComment && (
                            <span className="block mt-1 text-[9px] text-amber-600 font-bold italic">
                              (Catatan: Komentar ini masih berstatus DRAFT)
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">No general comments recorded.</span>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Signatures Area */}
            <div className="pt-2">
              <div className="text-[10px] font-medium text-slate-800 mb-0.5">
                Depok, {periodDetails.day} {periodDetails.monthName} {periodDetails.year}
              </div>
              <div className="text-[10px] font-semibold text-slate-800 mb-2">
                Acknowledged by,
              </div>
              
              <div className="grid grid-cols-2 gap-12 mt-2">
                {/* Left: Principal */}
                <div className="flex flex-col justify-between" style={{ minHeight: '85px' }}>
                  <div className="text-[10px] font-bold text-slate-800">Principal</div>
                  <div style={{ height: '36px' }} className="flex items-center">
                    {reportConfig?.principalSignatureUrl ? (
                      <img 
                        src={reportConfig.principalSignatureUrl} 
                        alt="Principal Signature" 
                        style={{ height: '36px', width: 'auto', objectFit: 'contain' }}
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div style={{ height: '36px' }} />
                    )}
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-slate-900 underline leading-tight">
                      {reportConfig?.principalName || "Principal"}
                    </div>
                    <div className="text-[8.5px] text-slate-500 leading-tight">
                      NIY: {reportConfig?.principalNIY || "-"}
                    </div>
                  </div>
                </div>

                {/* Right: Homeroom Teacher */}
                <div className="flex flex-col justify-between" style={{ minHeight: '85px' }}>
                  <div className="text-[10px] font-bold text-slate-800">Homeroom Teacher</div>
                  <div style={{ height: '36px' }} className="flex items-center">
                    {homeroomTeacherProfile?.signatureUrl ? (
                      <img 
                        src={homeroomTeacherProfile.signatureUrl} 
                        alt="Homeroom Teacher Signature" 
                        style={{ height: '36px', width: 'auto', objectFit: 'contain' }}
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div style={{ height: '36px' }} />
                    )}
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-slate-900 underline leading-tight">
                      {homeroomTeacherName || homeroomTeacherProfile?.displayName || "Wali Kelas"}
                    </div>
                    <div className="text-[8.5px] text-slate-500 leading-tight">
                      NIY: {homeroomTeacherProfile?.niy || "-"}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Page 2 Footer Strip */}
          <div 
            style={{
              backgroundColor: '#002366',
              margin: 'auto -24px -24px -24px',
              height: '28px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              boxSizing: 'border-box',
              gap: '1px'
            }}
          >
            <div style={{ fontSize: '7px', color: '#ffffff', fontWeight: 600, textTransform: 'none', lineHeight: 1.1, textAlign: 'center' }}>
              Griya Cinere I, Jl. Garuda Ujung No. 35, Cinere, Kec Limo, Kota Depok, Jawa barat 16515
            </div>
            <div style={{ fontSize: '7px', color: '#ffffff', fontWeight: 600, textTransform: 'none', lineHeight: 1.1, textAlign: 'center' }}>
              Telp. (021) 753 4841 Email: information@lazuardi.sch.id WhatsApp: +62 813 8925 7784
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
