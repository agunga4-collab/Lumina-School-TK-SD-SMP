import * as React from 'react';
import { cn } from '../lib/utils';

interface AttendanceStatusSelectorProps {
  value: string | null;
  onChange: (status: any) => void;
  attendanceType: 'DAILY' | 'DHUHUR';
  layout?: 'desktop' | 'mobile';
  disabled?: boolean;
}

export default function AttendanceStatusSelector({
  value,
  onChange,
  attendanceType,
  layout = 'desktop',
  disabled = false,
}: AttendanceStatusSelectorProps) {
  if (attendanceType === 'DHUHUR') {
    const dhuhurOptions = [
      { key: 'H', label: 'H', fullLabel: 'Hadir', colorClass: 'bg-green-500 text-white shadow-md', hoverClass: 'hover:bg-green-50 hover:text-green-500 text-gray-500' },
      { key: 'T', label: 'T', fullLabel: 'Terlambat', colorClass: 'bg-orange-500 text-white shadow-md', hoverClass: 'hover:bg-orange-50 hover:text-orange-500 text-gray-500' },
      { key: 'A', label: 'A', fullLabel: 'Absen', colorClass: 'bg-red-500 text-white shadow-md', hoverClass: 'hover:bg-red-50 hover:text-red-500 text-gray-500' },
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
                className={cn(
                  "h-11 rounded-xl text-xs font-black transition-all flex items-center justify-center border border-transparent",
                  isActive 
                    ? opt.colorClass 
                    : "bg-gray-50 hover:bg-gray-100 border-gray-100 text-gray-600",
                  disabled && "opacity-50 cursor-not-allowed"
                )}
                aria-pressed={isActive}
              >
                {opt.fullLabel}
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
    { key: 'HADIR', label: 'H', fullLabel: 'Hadir', colorClass: 'bg-green-500 text-white shadow-md', hoverClass: 'hover:bg-green-50 hover:text-green-500 text-gray-500' },
    { key: 'SAKIT', label: 'S', fullLabel: 'Sakit', colorClass: 'bg-blue-500 text-white shadow-md', hoverClass: 'hover:bg-blue-50 hover:text-blue-500 text-gray-500' },
    { key: 'IZIN', label: 'I', fullLabel: 'Izin', colorClass: 'bg-yellow-500 text-white shadow-md', hoverClass: 'hover:bg-yellow-50 hover:text-yellow-500 text-gray-500' },
    { key: 'ALPA', label: 'A', fullLabel: 'Alpa', colorClass: 'bg-red-500 text-white shadow-md', hoverClass: 'hover:bg-red-50 hover:text-red-500 text-gray-500' },
  ];

  if (layout === 'mobile') {
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 w-full" id="daily-status-selector-mobile">
        {dailyOptions.map((opt) => {
          const isActive = value === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              disabled={disabled}
              onClick={() => onChange(opt.key)}
              className={cn(
                "h-11 rounded-xl text-xs font-black transition-all flex items-center justify-center border border-transparent",
                isActive 
                  ? opt.colorClass 
                  : "bg-gray-50 hover:bg-gray-100 border-gray-100 text-gray-600",
                disabled && "opacity-50 cursor-not-allowed"
              )}
              aria-pressed={isActive}
            >
              {opt.fullLabel}
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
