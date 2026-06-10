import * as React from 'react';
import { motion } from 'motion/react';
import { 
  ChevronLeft, Printer, Download, 
  ChevronRight, Users, Loader2, AlertCircle,
  Eye, FileText, CheckCircle2
} from 'lucide-react';
import { useOutletContext, useNavigate, useParams } from 'react-router-dom';
import { getReportCardById, updateReportCard, getReportConfig } from '../../../lib/firebase';
import { ReportCard, StudentReport, User as AppUser, ReportConfig } from '../../../types';
import { cn } from '../../../lib/utils';
import { html2canvasWithModernColors } from '../../../lib/html2canvasPatch';
import jsPDF from 'jspdf';

export default function ReportView() {
  const { currentUser } = useOutletContext<{ currentUser: AppUser }>();
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [report, setReport] = React.useState<ReportCard | null>(null);
  const [config, setConfig] = React.useState<ReportConfig | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [generating, setGenerating] = React.useState(false);
  const [selectedStudentIndex, setSelectedStudentIndex] = React.useState(0);

  const reportRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const fetchData = async () => {
      if (!id) return;
      try {
        setLoading(true);
        const [data, conf] = await Promise.all([
          getReportCardById(id),
          getReportConfig(currentUser.unitId)
        ]);
        setReport(data);
        setConfig(conf);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id, currentUser.unitId]);

  const handleDownloadPDF = async () => {
    if (!reportRef.current || !report) return;
    
    setGenerating(true);
    try {
      const student = report.studentReports[selectedStudentIndex];
      const canvas = await html2canvasWithModernColors(reportRef.current, {
        scale: 2,
        useCORS: true,
        logging: false
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });
      
      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`${student.studentName}-${report.period}.pdf`);
    } catch (err) {
      console.error(err);
      alert("Gagal membuat PDF");
    } finally {
      setGenerating(false);
    }
  };

  if (loading) return (
    <div className="py-40 text-center">
      <Loader2 size={40} className="text-blue-100 animate-spin mx-auto mb-4" />
      <p className="text-gray-400 font-bold uppercase tracking-widest text-sm">Menyiapkan Preview Rapor...</p>
    </div>
  );

  if (!report) return (
    <div className="py-20 text-center">
       <AlertCircle size={48} className="text-gray-100 mx-auto" />
       <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">Rapor tidak ditemukan</p>
    </div>
  );

  const currentStudent = report.studentReports[selectedStudentIndex];

  return (
    <div className="max-w-7xl mx-auto space-y-10 animate-in fade-in duration-500 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-center gap-6 bg-white p-6 rounded-[2.5rem] border border-gray-100 shadow-sm sticky top-4 z-50">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(`/academic/rapor/${report.id}`)} className="p-3 bg-gray-50 rounded-xl text-gray-400 hover:text-blue-600 transition-all">
            <ChevronLeft size={20} />
          </button>
          <div className="space-y-0.5">
             <h3 className="text-sm font-black text-gray-900 uppercase italic leading-none">{currentStudent.studentName}</h3>
             <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{report.period} • Preview Rapor</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
           <select 
             className="bg-gray-50 border-none rounded-xl px-4 py-2 text-[10px] font-black uppercase outline-none focus:ring-2 focus:ring-blue-100"
             value={selectedStudentIndex}
             onChange={(e) => setSelectedStudentIndex(parseInt(e.target.value))}
           >
              {report.studentReports.map((s, idx) => (
                <option key={idx} value={idx}>{s.studentName}</option>
              ))}
           </select>

           <button 
             onClick={handleDownloadPDF}
             disabled={generating}
             className="flex items-center gap-2 bg-gray-900 text-white px-6 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-blue-600 transition-all disabled:opacity-50"
           >
              {generating ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} 
              Download PDF
           </button>
        </div>
      </div>

      <div className="flex justify-center">
         {/* The PDF Container - Optimized for A4 aspect ratio */}
         <div className="w-[210mm] bg-gray-200 p-8 shadow-inner overflow-x-auto">
            <div ref={reportRef} className="bg-white min-h-[297mm] p-[20mm] shadow-2xl mx-auto print:shadow-none">
                {report.type === 'END_TERM_LAZUARDI' ? (
                   <EndTermLazuardiLayout report={report} student={currentStudent} config={config} />
                ) : (
                   <MonthlyMidtermLayout report={report} student={currentStudent} />
                )}
            </div>
         </div>
      </div>
    </div>
  );
}

// --- Layout Components ---

function MonthlyMidtermLayout({ report, student }: { report: ReportCard, student: StudentReport }) {
  return (
    <div className="space-y-12 font-serif text-gray-900">
       {/* Header */}
       <div className="flex justify-between items-start border-b-2 border-gray-900 pb-8">
          <div className="space-y-1">
             <h1 className="text-2xl font-bold uppercase tracking-tighter">Lazuardi Junior High School</h1>
             <p className="text-sm font-medium italic">Griya Cinere I, Jl. Telaga Warna Blok H, Depok</p>
          </div>
          <div className="text-right space-y-1">
             <h2 className="text-xl font-bold uppercase">Progress Report</h2>
             <p className="text-xs font-bold uppercase text-gray-500 tracking-[0.3em]">{report.period}</p>
          </div>
       </div>

       {/* Info Table */}
       <div className="grid grid-cols-2 gap-x-16 gap-y-6">
          <InfoField label="Sudent's Name" value={student.studentName} />
          <InfoField label="NISN" value={student.nisn} />
          <InfoField label="Grade / Class" value={report.classId} />
          <InfoField label="Academic Year" value={report.academicYear} />
       </div>

       {/* Spiritual Health */}
       <div className="space-y-4 pt-4">
          <div className="bg-gray-100 px-6 py-3 rounded-sm">
             <h3 className="text-xs font-black uppercase tracking-[0.2em]">Spiritual Health</h3>
          </div>
          <div className="grid grid-cols-[1fr,250px] gap-10 items-start px-2">
             <p className="text-[11px] leading-relaxed italic text-gray-700">{student.spiritualHealth.lgText}</p>
             <div className="border-2 border-gray-900 p-5 text-center font-black text-sm uppercase bg-gray-50/50">
                {student.spiritualHealth.remark || "ALHAMDULILLAH BAIK"}
             </div>
          </div>
       </div>

       {/* Subjects Section */}
       <div className="space-y-14">
          <ReportSection title="Learning Journey (LJ)" subjects={student.subjectScores} filter="LEARNING_JOURNEY" />
          <ReportSection title="Weekly Lessons" subjects={student.subjectScores} filter="WEEKLY_LESSONS" />
          <ReportSection title="Unit Activity" subjects={student.subjectScores} filter="UNIT_AKTIVITAS" />
       </div>

       {/* Self Exploration Reflection */}
       {(student.selfExplorationReflection || report.unitId === 'JUNIOR_HIGH') && (
         <div className="space-y-4 pt-10 border-t border-gray-100">
            <div className="bg-gray-100 px-6 py-3 rounded-sm">
               <h3 className="text-xs font-black uppercase tracking-[0.2em]">Self-Exploration Reflection</h3>
            </div>
            <div className="p-6 bg-gray-50/50 border border-gray-100 italic text-[11px] leading-relaxed text-gray-600">
               {student.selfExplorationReflection || "Siswa telah menyelesaikan program Self-Exploration dengan baik sesuai strand yang dipilih."}
            </div>
         </div>
       )}

       {/* Attendance & Comments */}
       <div className="grid grid-cols-1 md:grid-cols-2 gap-10 pt-10">
          <div className="space-y-4">
             <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400">General Comments</h4>
             <div className="min-h-[150px] p-6 border border-gray-200 text-xs leading-relaxed font-serif italic text-gray-700">
                {report.homeroomComment || "Siswa menunjukkan antusiasme yang baik dalam mengikuti setiap kegiatan pembelajaran."}
             </div>
          </div>
          <div className="space-y-4">
             <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400">Attendance Recap</h4>
             <div className="border border-gray-900 divide-y divide-gray-900">
                <div className="flex justify-between p-3 text-[11px] font-bold uppercase">
                   <span>Sakit (Sick)</span>
                   <span>{student.attendance?.sick || 0} Days</span>
                </div>
                <div className="flex justify-between p-3 text-[11px] font-bold uppercase">
                   <span>Izin (Excused)</span>
                   <span>{student.attendance?.excused || 0} Days</span>
                </div>
                <div className="flex justify-between p-3 text-[11px] font-bold uppercase">
                   <span>Alpa (Absent)</span>
                   <span>{student.attendance?.absent || 0} Days</span>
                </div>
             </div>
          </div>
       </div>

       {/* Legend */}
       <div className="pt-10 flex gap-6 text-[9px] font-bold text-gray-400 italic">
          <span>A = Achieved</span>
          <span>D = Developing</span>
          <span>B = Beginning</span>
       </div>

       {/* Signatures */}
       <div className="pt-24 grid grid-cols-3 gap-12 text-center text-[10px] font-black uppercase tracking-widest">
          <div className="space-y-24">
             <p>Principal</p>
             <p className="border-t border-gray-900 pt-2">( Ms. Shofiyah )</p>
          </div>
          <div className="space-y-24">
             <p>Homeroom Teacher</p>
             <p className="border-t border-gray-900 pt-2">( {report.homeroomTeacherId.split('@')[0].toUpperCase()} )</p>
          </div>
          <div className="space-y-24">
             <p>Parent / Guardian</p>
             <p className="border-t border-gray-900 pt-2">( ____________________ )</p>
          </div>
       </div>
    </div>
  );
}

function EndTermLazuardiLayout({ report, student, config }: { report: ReportCard, student: StudentReport, config: ReportConfig | null }) {
  // Complex layout for End Term would go here...
  // For brevity, using a simpler version of End Term for now
  return (
    <div className="space-y-6">
       <div className="text-center space-y-4 py-20 border-b border-gray-100">
          <h1 className="text-4xl font-serif italic text-gray-900">Student Profile Portfolio</h1>
          <p className="text-sm font-bold uppercase text-gray-400 tracking-[0.5em]">Academic Year {report.academicYear}</p>
          <div className="pt-10">
             <p className="text-xl font-bold uppercase">{student.studentName}</p>
             <p className="text-xs text-gray-400 font-bold uppercase tracking-widest leading-loose">Kelas {report.classId} • NISN {student.nisn}</p>
          </div>
       </div>
       
       <div className="pt-10 space-y-12">
          {Object.entries(student.subjectScores).map(([sub, anyData]) => {
             const data = anyData as { lxdType: string; scores: { goalId: string; goalCode: string; goalText: string; score: string | null }[]; subjectComment?: string };
             return (
            <div key={sub} className="space-y-4">
               <h3 className="text-lg font-bold border-b-2 border-gray-900 pb-2">{sub}</h3>
               <table className="w-full border-collapse border border-gray-900">
                  <thead>
                     <tr className="bg-gray-50">
                        <th className="border border-gray-900 p-4 text-xs text-left">Description</th>
                        <th className="border border-gray-900 p-4 text-xs w-16">B</th>
                        <th className="border border-gray-900 p-4 text-xs w-16">D</th>
                        <th className="border border-gray-900 p-4 text-xs w-16">A</th>
                     </tr>
                  </thead>
                  <tbody>
                     {data.scores.map((s, idx) => (
                       <tr key={idx}>
                          <td className="border border-gray-900 p-4 text-[11px] leading-relaxed italic">{s.goalText}</td>
                          <td className="border border-gray-900 p-4 text-center font-bold">{s.score === 'B' ? '√' : ''}</td>
                          <td className="border border-gray-900 p-4 text-center font-bold">{s.score === 'D' ? '√' : ''}</td>
                          <td className="border border-gray-900 p-4 text-center font-bold">{s.score === 'A' ? '√' : ''}</td>
                       </tr>
                     ))}
                  </tbody>
               </table>
               <div className="p-4 bg-gray-50 border border-gray-900 italic text-[11px] leading-relaxed">
                  <strong>Notes:</strong> {data.subjectComment || "Siswa menunjukkan perkembangan yang stabil."}
               </div>
            </div>
          )})}

          {report.unitId === 'JUNIOR_HIGH' && (
             <div className="space-y-4 pt-10">
                <h3 className="text-lg font-bold border-b-2 border-gray-900 pb-2 uppercase text-center">Self-Exploration Reflection</h3>
                <div className="p-8 border border-gray-100 bg-gray-50/50 italic text-[11px] leading-relaxed text-gray-600 block text-center">
                   {student.selfExplorationReflection || "Siswa telah menyelesaikan program Self-Exploration dengan baik sesuai strand yang dipilih."}
                </div>
             </div>
          )}
       </div>
    </div>
  )
}

function ReportSection({ title, subjects, filter }: { title: string, subjects: StudentReport['subjectScores'], filter: string }) {
  const filteredSubjects = Object.entries(subjects).filter(([_, anyData]) => (anyData as any).lxdType === filter);
  if (filteredSubjects.length === 0) return null;

  return (
    <div className="space-y-6">
       <div className="bg-gray-100 px-4 py-2">
          <h3 className="text-xs font-bold uppercase tracking-widest">{title}</h3>
       </div>
       <div className="space-y-10">
          {filteredSubjects.map(([sub, anyData]) => {
             const data = anyData as { lxdType: string; scores: { goalId: string; goalCode: string; goalText: string; score: string | null }[]; subjectComment?: string };
             return (
             <div key={sub} className="space-y-3">
                <h4 className="text-[13px] font-bold border-b border-gray-200 pb-1">{sub}</h4>
                <div className="space-y-2">
                   {data.scores.map((s, idx) => (
                     <div key={idx} className="grid grid-cols-[1fr,60px] gap-4 items-center text-[11px] leading-relaxed italic">
                        <p>{s.goalText}</p>
                        <div className="text-center font-black">{s.score || '-'}</div>
                     </div>
                   ))}
                </div>
             </div>
          )})}
       </div>
    </div>
  );
}

function InfoField({ label, value }: { label: string, value: string }) {
  return (
    <div className="flex border-b border-gray-200 pb-1">
       <span className="text-[10px] font-bold uppercase text-gray-400 w-20">{label}</span>
       <span className="text-xs font-bold">{value || '-'}</span>
    </div>
  );
}
