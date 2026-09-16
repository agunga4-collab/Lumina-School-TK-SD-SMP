import * as React from 'react';
import { cn } from '../lib/utils';

interface AttendanceStatusSelectorProps {
  value: string | null;
  onChange: (status: any) => void;
  attendanceType: 'DAILY' | 'DHUHUR';
  layout?: 'desktop' | 'mobile';
  disabled?: boolean;
  schoolStatus?: string | null;
}

export default function AttendanceStatusSelector({
  value,
  onChange,
  attendanceType,
  layout = 'desktop',
  disabled = false,
  schoolStatus = null,
}: AttendanceStatusSelectorProps) {
  if (attendanceType === 'DHUHUR' && schoolStatus && ['SAKIT', 'IZIN', 'ALPA'].includes(schoolStatus)) {
    return (
      <div className={cn(
        "inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border",
        schoolStatus === 'SAKIT' && "bg-blue-50 border-blue-100 text-blue-600",
        schoolStatus === 'IZIN' && "bg-amber-50 border-amber-100 text-amber-600",
        schoolStatus === 'ALPA' && "bg-red-50 border-red-100 text-red-600",
        layout === 'desktop' ? 'mx-auto' : 'w-full'
      )}>
        <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
        Tidak Masuk Sekolah ({schoolStatus === 'SAKIT' ? 'Sakit' : schoolStatus === 'IZIN' ? 'Izin' : 'Alpa'})
      </div>
    );
  }

  if (attendanceType === 'DHUHUR') {
    const dhuhurOptions = [
      { key: 'H', label: 'H', fullLabel: 'Hadir', colorClass: 'bg-green-600 text-white shadow-md', hoverClass: 'hover:bg-green-50 hover:text-green-500 text-gray-500' },
      { key: 'T', label: 'T', fullLabel: 'Terlambat', colorClass: 'bg-orange-500 text-white shadow-md', hoverClass: 'hover:bg-orange-50 hover:text-orange-500 text-gray-500' },
      { key: 'A', label: 'A', fullLabel: 'Absen', colorClass: 'bg-red-600 text-white shadow-md', hoverClass: 'hover:bg-red-50 hover:text-red-500 text-gray-500' },
    ];

    if (layout === 'mobile') {
      return (
        <div className="grid grid-cols-3 gap-2 w-full" id="dhuhur-status-selector-mobile">
          {dhuhurOptions.map((opt) => {
            const isActive = value === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                disabled={disabled}
                onClick={() => onChange(opt.key)}
                aria-label={`${opt.fullLabel} (${isActive ? 'Terpilih' : 'Pilih'})`}
                aria-pressed={isActive}
                className={cn(
                  "min-h-[44px] min-w-[44px] rounded-xl text-xs font-black transition-all flex items-center justify-center border",
                  isActive 
                    ? cn(opt.colorClass, "border-black/10 ring-4 ring-offset-1", 
                         opt.key === 'H' && "ring-green-100",
                         opt.key === 'T' && "ring-orange-100",
                         opt.key === 'A' && "ring-red-100"
                      ) 
                    : "bg-gray-50 hover:bg-gray-100 border-gray-200 text-gray-700",
                  disabled && "opacity-50 cursor-not-allowed"
                )}
              >
                <span className="flex items-center gap-1">
                  <span>{opt.key}</span>
                  {isActive && <span className="text-[11px]" aria-hidden="true">✓</span>}
                </span>
              </button>
            );
          })}
        </div>
      );
    }

    // Desktop
    return (
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit mx-auto" id="dhuhur-status-selector-desktop">
        {dhuhurOptions.map((opt) => {
          const isActive = value === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              disabled={disabled}
              onClick={() => onChange(opt.key)}
              title={opt.fullLabel}
              className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center transition-all text-[11px] font-black border border-transparent",
                isActive 
                  ? opt.colorClass 
                  : opt.hoverClass,
                disabled && "opacity-50 cursor-not-allowed"
              )}
              aria-pressed={isActive}
            >
              {opt.key}
            </button>
          );
        })}
      </div>
    );
  }

  // Daily
  const dailyOptions = [
    { key: 'HADIR', label: 'H', fullLabel: 'Hadir', colorClass: 'bg-green-600 text-white shadow-md', hoverClass: 'hover:bg-green-50 hover:text-green-500 text-gray-500' },
    { key: 'SAKIT', label: 'S', fullLabel: 'Sakit', colorClass: 'bg-blue-600 text-white shadow-md', hoverClass: 'hover:bg-blue-50 hover:text-blue-500 text-gray-500' },
    { key: 'IZIN', label: 'I', fullLabel: 'Izin', colorClass: 'bg-yellow-600 text-white shadow-md', hoverClass: 'hover:bg-yellow-50 hover:text-yellow-500 text-gray-500' },
    { key: 'ALPA', label: 'A', fullLabel: 'Alpa', colorClass: 'bg-red-600 text-white shadow-md', hoverClass: 'hover:bg-red-50 hover:text-red-500 text-gray-500' },
  ];

  if (layout === 'mobile') {
    return (
      <div className="grid grid-cols-4 gap-2 w-full" id="daily-status-selector-mobile">
        {dailyOptions.map((opt) => {
          const isActive = value === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              disabled={disabled}
              onClick={() => onChange(opt.key)}
              aria-label={`${opt.fullLabel} (${isActive ? 'Terpilih' : 'Pilih'})`}
              aria-pressed={isActive}
              className={cn(
                "min-h-[44px] min-w-[44px] rounded-xl text-xs font-black transition-all flex items-center justify-center border",
                isActive 
                  ? cn(opt.colorClass, "border-black/10 ring-4 ring-offset-1",
                       opt.key === 'HADIR' && "ring-green-100",
                       opt.key === 'SAKIT' && "ring-blue-100",
                       opt.key === 'IZIN' && "ring-yellow-100",
                       opt.key === 'ALPA' && "ring-red-100"
                      )
                  : "bg-gray-50 hover:bg-gray-100 border-gray-200 text-gray-700",
                disabled && "opacity-50 cursor-not-allowed"
              )}
            >
              <span className="flex items-center gap-1">
                <span>{opt.label}</span>
                {isActive && <span className="text-[11px]" aria-hidden="true">✓</span>}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  // Desktop Daily
  return (
    <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit mx-auto" id="daily-status-selector-desktop">
      {dailyOptions.map((opt) => {
        const isActive = value === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            disabled={disabled}
            onClick={() => onChange(opt.key)}
            title={opt.fullLabel}
            className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center transition-all text-[11px] font-black border border-transparent",
              isActive 
                ? opt.colorClass 
                : opt.hoverClass,
              disabled && "opacity-50 cursor-not-allowed"
            )}
            aria-pressed={isActive}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
