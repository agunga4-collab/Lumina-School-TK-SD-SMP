import * as React from 'react';
import { motion } from 'motion/react';
import { 
  FileText, Plus, Search, Filter, 
  ChevronRight, Calendar, Users, 
  CheckCircle2, Clock, AlertCircle, Loader2
} from 'lucide-react';
import { useOutletContext, useNavigate, Link } from 'react-router-dom';
import { getReportCards, publishReportCard } from '../../../lib/firebase';
import { ReportCard, User as AppUser } from '../../../types';
import { cn } from '../../../lib/utils';

const STATUS_COLORS = {
  DRAFT: 'bg-gray-100 text-gray-600',
  SUBMITTED: 'bg-blue-50 text-blue-600',
  APPROVED: 'bg-emerald-50 text-emerald-600',
  PUBLISHED: 'bg-purple-50 text-purple-600'
};

export default function ReportList() {
  const { currentUser } = useOutletContext<{ currentUser: AppUser }>();
  const navigate = useNavigate();
  const [reports, setReports] = React.useState<ReportCard[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filterType, setFilterType] = React.useState<string>('ALL');

  React.useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const data = await getReportCards({ 
          unitId: currentUser.role === 'SUPER_ADMIN' ? undefined : currentUser.unitId 
        });
        setReports(data || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [currentUser]);

  const filteredReports = reports.filter(r => filterType === 'ALL' || r.type === filterType);

  return (
    <div className="max-w-7xl mx-auto space-y-10 animate-in fade-in duration-500 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div className="space-y-1">
          <h1 className="text-4xl font-black tracking-tighter italic uppercase text-gray-900 leading-none">
            Learning <span className="text-blue-600">Reports</span>
          </h1>
          <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Managemen Rapor Lazuardi</p>
        </div>

        <Link
          to="/academic/rapor/new"
          className="flex items-center gap-3 bg-gray-900 text-white px-8 py-4 rounded-[2rem] font-black uppercase text-xs tracking-widest hover:bg-blue-600 hover:scale-105 active:scale-95 transition-all shadow-xl shadow-gray-200"
        >
          <Plus size={18} /> Buat Sesi Rapor
        </Link>
      </div>

      <div className="bg-white p-8 rounded-[3rem] border border-gray-100 shadow-sm space-y-8">
        <div className="flex flex-wrap gap-4 items-center justify-between">
           <div className="flex items-center gap-2 bg-gray-50 p-2 rounded-2xl">
              {['ALL', 'MONTHLY', 'MIDTERM', 'END_TERM_LAZUARDI'].map(t => (
                <button
                  key={t}
                  onClick={() => setFilterType(t)}
                  className={cn(
                    "px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                    filterType === t ? "bg-white text-blue-600 shadow-sm" : "text-gray-400 hover:text-gray-600"
                  )}
                >
                  {t.replace('_', ' ')}
                </button>
              ))}
           </div>
        </div>

        {loading ? (
          <div className="py-20 text-center">
            <Loader2 size={40} className="text-blue-100 animate-spin mx-auto mb-4" />
            <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">Memuat Data Rapor...</p>
          </div>
        ) : filteredReports.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredReports.map(report => (
              <button
                key={report.id}
                onClick={() => navigate(`/academic/rapor/${report.id}`)}
                className="group p-8 bg-white border border-gray-100 rounded-[2.5rem] text-left hover:border-blue-200 hover:shadow-xl hover:shadow-blue-50 transition-all flex flex-col justify-between gap-8 h-full"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className={cn(
                      "px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest",
                      STATUS_COLORS[report.status]
                    )}>
                      {report.status}
                    </span>
                    <span className="text-[9px] font-black text-gray-300 uppercase tracking-widest">{report.academicYear}</span>
                  </div>
                  
                  <h3 className="text-xl font-black text-gray-900 group-hover:text-blue-600 leading-tight uppercase italic transition-colors">
                    {report.period}
                  </h3>

                  <div className="flex flex-wrap gap-3">
                    <div className="flex items-center gap-1.5 px-3 py-1 bg-gray-50 text-gray-500 rounded-lg text-[10px] font-bold">
                       <Users size={12} /> Class {report.classId}
                    </div>
                    <div className="flex items-center gap-1.5 px-3 py-1 bg-gray-50 text-gray-500 rounded-lg text-[10px] font-bold">
                       <FileText size={12} /> {report.type.replace('_', ' ')}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-6 border-t border-gray-50">
                   <div className="flex items-center gap-2 text-[9px] font-black text-gray-300 uppercase tracking-widest text-left">
                      <Clock size={12} /> {new Date(report.createdAt).toLocaleDateString()}
                   </div>
                   <div className="flex items-center gap-3">
                     {report.status === 'APPROVED' && (currentUser.role === 'HEAD_UNIT' || currentUser.role === 'SUPER_ADMIN') && (
                       <button
                         onClick={(e) => {
                           e.stopPropagation();
                           if (confirm("Publish rapor ini ke portal siswa & orang tua?")) {
                             publishReportCard(report.id).then(() => {
                               alert("Berhasil dipublikasi!");
                               window.location.reload();
                             });
                           }
                         }}
                         className="px-4 py-2 bg-purple-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-purple-700 shadow-xl shadow-purple-100 transition-all"
                       >
                         Publish
                       </button>
                     )}
                     <ChevronRight size={20} className="text-gray-200 group-hover:text-blue-400 group-hover:translate-x-1 transition-all shrink-0" />
                   </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="py-20 text-center space-y-4 border-2 border-dashed border-gray-50 rounded-[3rem]">
            <AlertCircle size={48} className="text-gray-100 mx-auto" />
            <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">Belum ada sesi rapor untuk ditampilkan</p>
          </div>
        )}
      </div>
    </div>
  );
}
