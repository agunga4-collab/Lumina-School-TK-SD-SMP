import * as React from 'react';
import { motion } from 'motion/react';
import { 
  CheckCircle2, Clock, AlertCircle, UserX, Calendar, 
  ChevronRight, TrendingUp, Bell, Heart, BookOpen, Loader2
} from 'lucide-react';
import { useOutletContext } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { auth, db } from '../../lib/firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';

export default function ChildAttendance() {
  const { selectedStudentId, currentUser } = useOutletContext<{ selectedStudentId?: string | null; currentUser: any }>() || {};
  const [loading, setLoading] = React.useState(true);
  const [studentData, setStudentData] = React.useState<any>(null);
  const [attendanceStats, setAttendanceStats] = React.useState({
    hadir: 0,
    sakit: 0,
    izin: 0,
    alpa: 0,
    total: 0
  });
  const [notifications, setNotifications] = React.useState<any[]>([]);

  React.useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const user = auth.currentUser;
        if (!user) return;

        let studentId = selectedStudentId;
        if (!studentId && currentUser) {
          studentId = currentUser.linkedStudents?.[0];
        }
        if (!studentId) {
          const parentSnap = await getDoc(doc(db, 'users', user.uid));
          if (parentSnap.exists()) {
            const parentData = parentSnap.data();
            studentId = parentData.linkedStudents?.[0];
          }
        }

        if (studentId) {
          // 2. Get Student Data
          const studentSnap = await getDoc(doc(db, 'students', studentId));
          if (studentSnap.exists()) {
            setStudentData(studentSnap.data());
          }

          // 3. Fetch Attendance Records for this month
          const now = new Date();
          const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
          const q = query(
            collection(db, 'attendance_records'),
            where('studentId', '==', studentId),
            where('date', '>=', firstDay.split('T')[0])
          );
          const snap = await getDocs(q);
          const records = snap.docs.map(d => d.data());
          
          setAttendanceStats({
            hadir: records.filter(r => r.status === 'HADIR').length,
            sakit: records.filter(r => r.status === 'SAKIT').length,
            izin: records.filter(r => r.status === 'IZIN').length,
            alpa: records.filter(r => r.status === 'ALPA').length,
            total: records.length
          });

          // Fetch notifications/alerts for this student
          const notifQ = query(
            collection(db, 'notifications'),
            where('userId', '==', user.email),
            where('type', '==', 'ATTENDANCE_ALERT')
          );
          const notifSnap = await getDocs(notifQ);
          setNotifications(notifSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        } else {
          setStudentData(null);
        }
      } catch (err) {
        console.error('Error fetching parent attendance data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [selectedStudentId, currentUser, auth.currentUser]);

  if (loading) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center gap-4">
        <Loader2 size={40} className="animate-spin text-emerald-600" />
        <p className="text-sm font-bold text-gray-500 uppercase tracking-widest">Memuat data kehadiran...</p>
      </div>
    );
  }

  if (!studentData) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center gap-4 text-center p-8">
        <AlertCircle size={48} className="text-gray-300" />
        <h2 className="text-xl font-bold text-gray-900">Data Tidak Ditemukan</h2>
        <p className="text-gray-500 max-w-xs">Belum ada data siswa yang terhubung dengan akun Anda. Mohon hubungi admin sekolah.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Kehadiran {studentData.fullName || studentData.name}</h1>
          <p className="text-gray-500 font-medium tracking-tight">Pantau kedisiplinan dan kesehatan Ananda di sekolah.</p>
        </div>
        <div className="bg-emerald-50 px-4 py-2 rounded-2xl border border-emerald-100 flex items-center gap-2">
           <Heart className="text-emerald-500" size={18} />
           <span className="text-sm font-bold text-emerald-800">
             Status: {attendanceStats.alpa > 0 ? 'Perlu Perhatian' : 'Sangat Baik'}
           </span>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatCard label="Hadir" value={attendanceStats.hadir.toString()} total={attendanceStats.total.toString()} unit="Hari" color="emerald" />
        <StatCard label="Sakit" value={attendanceStats.sakit.toString()} total="-" unit="Hari" color="blue" />
        <StatCard label="Izin" value={attendanceStats.izin.toString()} total="-" unit="Hari" color="yellow" />
        <StatCard label="Alpa" value={attendanceStats.alpa.toString()} total="-" unit="Hari" color="red" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Calendar Preview Section */}
        <div className="md:col-span-2 bg-white rounded-3xl p-8 shadow-sm border border-gray-100 flex flex-col space-y-6">
           <div className="flex justify-between items-center">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <Calendar size={18} className="text-emerald-500" />
                Catatan Kehadiran Bulan April
              </h3>
              <div className="flex gap-1">
                 <div className="w-2 h-2 rounded-full bg-emerald-400" />
                 <div className="w-2 h-2 rounded-full bg-emerald-400" />
                 <div className="w-2 h-2 rounded-full bg-emerald-400" />
              </div>
           </div>

           <div className="grid grid-cols-7 gap-3">
              {['S', 'S', 'R', 'K', 'J', 'S', 'M'].map(d => (
                <div key={d} className="text-center text-[10px] font-black text-gray-300 uppercase py-2">{d}</div>
              ))}
              {Array.from({ length: 30 }).map((_, i) => (
                <div 
                  key={i} 
                  className={cn(
                    "aspect-square rounded-xl flex items-center justify-center text-xs font-bold transition-all border",
                    i + 1 === 22 ? "bg-emerald-600 text-white border-emerald-600 shadow-md scale-110" :
                    i + 1 < 22 ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                    "bg-gray-50 text-gray-300 border-gray-50"
                  )}
                >
                  {i + 1}
                </div>
              ))}
           </div>

           <div className="pt-4 border-t border-gray-50 flex flex-wrap gap-4">
              <Legend color="bg-emerald-500" label="Hadir" />
              <Legend color="bg-blue-500" label="Sakit" />
              <Legend color="bg-yellow-500" label="Izin" />
              <Legend color="bg-red-500" label="Alpa" />
           </div>
        </div>

        {/* Alerts & Insights */}
        <div className="space-y-6">
           <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-4">
              <h3 className="font-bold text-gray-900 flex items-center gap-2 text-sm">
                <Bell size={16} className="text-orange-500" />
                Pemberitahuan
              </h3>
              <div className="space-y-3">
               {notifications.length > 0 ? notifications.map(n => (
                 <div key={n.id} className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                    <p className="text-xs font-bold text-gray-800">{new Date(n.createdAt).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                    <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
                      {n.message}
                    </p>
                 </div>
               )) : (
                 <div className="p-8 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                    <p className="text-[10px] font-bold text-gray-400 uppercase">Tidak ada pemberitahuan baru</p>
                 </div>
               )}
            </div>
         </div>

         <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl p-6 text-white space-y-4 shadow-xl">
            <div className="flex items-center gap-2 opacity-80">
               <TrendingUp size={16} />
               <span className="text-[10px] font-black uppercase tracking-widest">Lumina Insight</span>
            </div>
            <p className="text-sm font-medium leading-relaxed italic">
               {attendanceStats.hadir > 0 
                 ? `Ananda ${studentData.nickname || studentData.fullName} memiliki tingkat kehadiran yang baik bulan ini. Kedisiplinan adalah kunci kesuksesan akademik.`
                 : `Data kehadiran bulan ini belum tersedia. Mari terus pantau progres Ananda bersama Lumina.`}
            </p>
            <button className="w-full py-2 bg-white/20 hover:bg-white/30 transition-all rounded-xl text-xs font-bold border border-white/20">
               Lihat Detail Progres
            </button>
         </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, total, unit, color }: { label: string; value: string; total: string; unit: string; color: string }) {
  const colors = {
    emerald: 'text-emerald-600 bg-emerald-50',
    blue: 'text-blue-600 bg-blue-50',
    yellow: 'text-yellow-600 bg-yellow-50',
    red: 'text-red-600 bg-red-50',
  };
  return (
    <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
      <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-1">{label}</p>
      <div className="flex items-baseline gap-1">
        <span className={cn("text-2xl font-black", (colors as any)[color])}>{value}</span>
        {total !== '-' && <span className="text-xs text-gray-300 font-bold">/ {total}</span>}
        <span className="text-xs text-gray-400 font-bold ml-1">{unit}</span>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className={cn("w-3 h-3 rounded-full", color)} />
      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{label}</span>
    </div>
  );
}
