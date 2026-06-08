import * as React from 'react';
import ObservationTableImporter from './ObservationTableImporter';

interface ObservationBulkPeriodImportProps {
  classes?: any[];
  initialClassId?: string;
  onImportSuccess?: () => void;
  onClose?: () => void;
}

export default function ObservationBulkPeriodImport({ classes = [], initialClassId = 'ALL', onImportSuccess, onClose }: ObservationBulkPeriodImportProps) {
  return (
    <div className="bg-white rounded-[2.5rem] p-6 border border-gray-150 shadow-sm animate-fade-in text-gray-900">
      <div className="mb-6 pb-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <span className="text-[9px] font-black tracking-widest text-emerald-600 uppercase">Lumina Kindergarten</span>
          <h2 className="text-xl font-black text-gray-850 tracking-tight leading-tight mt-0.5">
            Spreadsheet-Style Grid Importer
          </h2>
        </div>
      </div>

      <ObservationTableImporter 
        classes={classes}
        initialClassId={initialClassId}
        onImportSuccess={onImportSuccess} 
        onClose={onClose} 
      />
    </div>
  );
}
