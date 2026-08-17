import * as React from 'react';
import { motion } from 'motion/react';
import { Compass, Info, CheckCircle, Clock, Calendar, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { db } from '../../lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import type { UnitActivityEnrollment } from '../../types';

const OFFICIAL_CATEGORIES = [
  'Performing Arts',
  'Arts & Makerspace',
  'Physical Education',
  'Digital Literacy'
];

export function normalizeEnrollmentForUI(e: UnitActivityEnrollment): UnitActivityEnrollment {
  const isLgp = e.isLgp || 
    ['LGP', 'Choir', 'Theatre', 'Musical Theatre Band'].includes(e.normalizedUaName) || 
    ['Choir', 'Theatre', 'Musical Theatre Band'].includes(e.sourceUaName || '');

  const normalizedUaName = isLgp ? 'LGP' : e.normalizedUaName;

  let category = e.category || 'Performing Arts';
  if (isLgp || ['Performing Arts', 'Choir', 'Theatre', 'Musical Theatre Band'].includes(category)) {
    category = 'Performing Arts';
  } else if (['Sports', 'Physical Education'].includes(category)) {
    category = 'Physical Education';
  } else if (['Art', 'Arts & Makerspace'].includes(category)) {
    category = 'Arts & Makerspace';
  } else if (category === 'Digital Literacy') {
    category = 'Digital Literacy';
  } else {
    if (!OFFICIAL_CATEGORIES.includes(category)) {
      category = 'Performing Arts';
    }
  }

  return {
    ...e,
    normalizedUaName,
    category
  };
}

export default function StudentUnitActivitiesPage() {
  const { profile } = useAuth();
  const { activeYear, activeSemester } = useAcademicYear();

  const [enrollments, setEnrollments] = React.useState<UnitActivityEnrollment[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const studentId = profile?.luminaId || '';

  React.useEffect(() => {
    const fetchStudentEnrollments = async () => {
      if (!studentId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const q = query(
          collection(db, 'junior_high_unit_activity_enrollments'),
          where('studentId', '==', studentId)
        );
        const snapshot = await getDocs(q);
        const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UnitActivityEnrollment));
        setEnrollments(list.map(normalizeEnrollmentForUI));
      } catch (err) {
        console.error('Error fetching student UA enrollments:', err);
        setError('Gagal memuat data Unit Aktivitas Anda. Silakan coba beberapa saat lagi.');
      } finally {
        setLoading(false);
      }
    };

    fetchStudentEnrollments();
  }, [studentId]);

  // Filter confirmed enrollments
  const confirmedEnrollments = enrollments.filter(e => e.status === 'CONFIRMED');

  // Filter for the current semester
  const currentSemesterUas = confirmedEnrollments.filter(
    e => e.academicYear === activeYear && String(e.semester) === String(activeSemester)
  );

  // Sorting historical records: newest to oldest
  const sortedHistory = [...confirmedEnrollments].sort((a, b) => {
    if (a.academicYear !== b.academicYear) {
      return b.academicYear.localeCompare(a.academicYear);
    }
    return String(b.semester).localeCompare(String(a.semester));
  });

  const formatUaName = (e: UnitActivityEnrollment) => {
    const isLgp = e.isLgp || ['LGP', 'Choir', 'Theatre', 'Musical Theatre Band'].includes(e.normalizedUaName);
    return isLgp ? 'LGP' : e.normalizedUaName;
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <Compass size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Unit Aktivitas Saya</h1>
            <p className="text-xs text-gray-500 font-medium tracking-tight">
              Tahun Ajaran {activeYear || '-'} • Semester {activeSemester || '-'}
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 p-4 rounded-xl text-xs text-red-600 font-medium flex items-center gap-2">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-xs text-gray-400 font-semibold">Memuat data Unit Aktivitas...</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Semester Ini & Pendaftaran Status */}
          <div className="lg:col-span-2 space-y-6">
            {/* Card "Semester Ini" */}
            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-gray-50">
                <Calendar size={16} className="text-[#002366]" />
                <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Semester Ini</h2>
              </div>

              {currentSemesterUas.length > 0 ? (
                <div className="grid gap-4">
                  {currentSemesterUas.map(ua => (
                    <div
                      key={ua.id}
                      className="p-5 bg-slate-50 rounded-xl border border-slate-100 flex items-start justify-between gap-4"
                    >
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded uppercase tracking-wider">
                          {ua.category}
                        </span>
                        <h3 className="text-base font-bold text-gray-900">{formatUaName(ua)}</h3>
                        <p className="text-xs text-gray-400 font-medium">
                          Tahun Ajaran {ua.academicYear} • Semester {ua.semester}
                        </p>
                      </div>
                      <span className="inline-flex items-center gap-1 bg-green-50 text-green-700 border border-green-100 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide">
                        <CheckCircle size={12} />
                        Terdaftar
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                  <p className="text-xs text-gray-500 font-medium">
                    Belum ada Unit Aktivitas yang tercatat untuk semester ini.
                  </p>
                </div>
              )}
            </div>

            {/* Bagian Pendaftaran Unit Aktivitas */}
            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-gray-50">
                <Info size={16} className="text-gray-400" />
                <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Pendaftaran Unit Aktivitas</h2>
              </div>
              <div className="p-4 bg-amber-50/50 border border-amber-100 rounded-xl flex items-start gap-3">
                <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <h4 className="text-xs font-bold text-amber-900">Informasi Pendaftaran</h4>
                  <p className="text-xs text-amber-700 font-medium">
                    Pendaftaran Unit Aktivitas belum dibuka.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Riwayat Saya */}
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-gray-50">
                <Clock size={16} className="text-[#002366]" />
                <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Riwayat Saya</h2>
              </div>

              {sortedHistory.length > 0 ? (
                <div className="relative border-l border-slate-100 pl-4 space-y-6 py-2">
                  {sortedHistory.map(hist => (
                    <div key={hist.id} className="relative group">
                      {/* Timeline dot */}
                      <div className="absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full bg-slate-300 group-hover:bg-blue-600 transition-colors" />
                      
                      <div className="space-y-1">
                        <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">
                          TA {hist.academicYear} • S{hist.semester}
                        </span>
                        <h4 className="text-xs font-bold text-gray-800">{formatUaName(hist)}</h4>
                        <span className="text-[9px] text-gray-400 font-semibold uppercase tracking-wider block">
                          {hist.category}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 text-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                  <p className="text-xs text-gray-400 font-semibold italic">
                    Riwayat Unit Aktivitas sedang dilengkapi oleh sekolah.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
