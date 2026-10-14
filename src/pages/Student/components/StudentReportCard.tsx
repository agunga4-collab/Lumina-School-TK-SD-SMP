import * as React from 'react';
import { motion } from 'motion/react';
import { FileText, Calendar, Eye, ExternalLink } from 'lucide-react';

export interface StudentReportCardProps {
  id?: string;
  type: string;
  title: string;
  subtitle?: string;
  academicYear: string;
  semester: string | number;
  isViewed: boolean;
  onOpen?: () => void;
  driveUrl?: string;
  disabled?: boolean;
  index?: number;
  buttonIcon?: 'document' | 'external';
  viewedDetails?: {
    studentViewedAt?: string | null;
    parentViewedAt?: string | null;
  };
}

export const StudentReportCard: React.FC<StudentReportCardProps> = ({
  type,
  title,
  subtitle,
  academicYear,
  semester,
  isViewed,
  onOpen,
  disabled = false,
  index = 0,
  buttonIcon = 'document',
  viewedDetails
}) => {
  const isMidterm = type === 'Midterm';
  const isBulanan = type === 'Bulanan';

  const badgeLabel = isMidterm ? 'Midterm' : isBulanan ? 'Bulanan' : 'Lainnya';

  const badgeColor = isMidterm
    ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
    : isBulanan
    ? 'bg-blue-50 text-blue-700 border-blue-100'
    : 'bg-indigo-50 text-indigo-700 border-indigo-100';

  const iconColor = isMidterm
    ? 'bg-emerald-50 text-emerald-600'
    : isBulanan
    ? 'bg-blue-50 text-blue-600'
    : 'bg-indigo-50 text-indigo-600';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.04 }}
      className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow p-5 sm:p-6 flex flex-col justify-between h-full space-y-5"
    >
      {/* Top Header: Icon + Chip Jenis & Status */}
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div
            className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${iconColor}`}
          >
            <FileText size={22} />
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 flex-nowrap">
            <span
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider whitespace-nowrap border ${badgeColor}`}
            >
              {badgeLabel}
            </span>

            {isViewed ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200/60 whitespace-nowrap">
                <Eye size={12} className="shrink-0" />
                <span>Sudah dilihat</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/60 whitespace-nowrap">
                <span>Baru</span>
              </span>
            )}
          </div>
        </div>

        {/* Title & Info */}
        <div className="space-y-1.5">
          <h3 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight leading-snug break-words">
            {title}
          </h3>
          {subtitle && (
            <p className="text-xs text-gray-500 font-medium line-clamp-2 leading-relaxed">
              {subtitle}
            </p>
          )}
          <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 pt-1">
            <Calendar size={13} className="text-gray-400 shrink-0" />
            <span>TA {academicYear} • Semester {semester}</span>
          </div>
        </div>

        {/* Viewed Details Block */}
        {(viewedDetails?.studentViewedAt || viewedDetails?.parentViewedAt) && (
          <div className="mt-3 p-3 bg-gray-50/80 rounded-xl border border-gray-100 text-[11px] space-y-1.5 text-gray-500 font-medium">
            {viewedDetails.studentViewedAt && (
              <div className="flex items-center gap-1.5 leading-tight">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                <span>
                  Dilihat siswa: <strong className="text-gray-700 font-semibold">{viewedDetails.studentViewedAt}</strong>
                </span>
              </div>
            )}
            {viewedDetails.parentViewedAt && (
              <div className="flex items-center gap-1.5 leading-tight">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                <span>
                  Dilihat orang tua/wali: <strong className="text-gray-700 font-semibold">{viewedDetails.parentViewedAt}</strong>
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Action Button */}
      <div className="pt-2">
        {disabled ? (
          <button
            disabled
            type="button"
            className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-gray-100 text-gray-400 border border-gray-200 rounded-xl text-xs font-bold cursor-not-allowed text-center"
          >
            <span>Tautan Tidak Tersedia</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onOpen}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white rounded-xl text-xs font-bold transition-all shadow-sm shadow-blue-200/50 cursor-pointer text-center"
          >
            {buttonIcon === 'external' ? (
              <ExternalLink size={14} className="shrink-0" />
            ) : (
              <FileText size={14} className="shrink-0" />
            )}
            <span>Buka Rapor</span>
          </button>
        )}
      </div>
    </motion.div>
  );
};
