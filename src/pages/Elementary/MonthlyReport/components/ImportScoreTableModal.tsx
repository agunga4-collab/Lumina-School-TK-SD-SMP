import * as React from 'react';
import { X, FileSpreadsheet, Check, AlertCircle, ArrowRight, RefreshCw, HelpCircle } from 'lucide-react';
import type { 
  ElementaryMonthlySubject, 
  ElementaryMonthlyLearningObjective,
  ElementaryMonthlyStudentScoreDoc 
} from '../../../../types/elementaryMonthlyReport';
import type { Student } from '../../../../types';
import { toast } from 'sonner';

interface ImportScoreTableModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: Student[];
  subject: ElementaryMonthlySubject | null;
  existingScoresMap: Record<string, ElementaryMonthlyStudentScoreDoc>;
  onImport: (scoresByStudent: Record<string, Record<string, number>>) => Promise<void>;
}

interface ParsedRow {
  rawName: string;
  rawCells: string[];
  matchedStudentId: string | null;
  isAmbiguous: boolean;
  scores: Record<string, number>; // loId -> score
  errors: string[];
}

export const ImportScoreTableModal: React.FC<ImportScoreTableModalProps> = ({
  isOpen,
  onClose,
  students,
  subject,
  existingScoresMap,
  onImport
}) => {
  const [pasteText, setPasteText] = React.useState('');
  const [step, setStep] = React.useState<'PASTE' | 'MAP_AND_VALIDATE'>('PASTE');
  const [nameColIndex, setNameColIndex] = React.useState<number>(0);
  const [columnLoMapping, setColumnLoMapping] = React.useState<Record<number, string>>({}); // colIndex -> loId
  const [parsedHeaders, setParsedHeaders] = React.useState<string[]>([]);
  const [parsedRows, setParsedRows] = React.useState<ParsedRow[]>([]);
  const [saving, setSaving] = React.useState(false);

  // Flatten all LOs in this subject
  const allLOs = React.useMemo(() => {
    if (!subject) return [];
    const list: Array<{ lo: ElementaryMonthlyLearningObjective; lgCode: string }> = [];
    (subject.learningGoals || []).forEach(lg => {
      (lg.learningObjectives || []).forEach(lo => {
        list.push({ lo, lgCode: lg.code });
      });
    });
    return list;
  }, [subject]);

  React.useEffect(() => {
    if (!isOpen) {
      setPasteText('');
      setStep('PASTE');
      setColumnLoMapping({});
      setParsedRows([]);
      setParsedHeaders([]);
    }
  }, [isOpen]);

  if (!isOpen || !subject) return null;

  const handleParsePaste = () => {
    if (!pasteText.trim()) {
      toast.warning('Tempelkan teks tabel dari spreadsheet terlebih dahulu.');
      return;
    }

    const rawLines = pasteText
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l.length > 0);

    if (rawLines.length === 0) {
      toast.warning('Teks tabel kosong.');
      return;
    }

    // Split rows by Tab or Comma (fallback)
    const delimiter = rawLines[0].includes('\t') ? '\t' : rawLines[0].includes(';') ? ';' : ',';
    const rows = rawLines.map(line => line.split(delimiter).map(cell => cell.trim()));

    if (rows.length < 1) {
      toast.warning('Format tabel tidak dikenali.');
      return;
    }

    // First row can be header if not purely student names
    const headerRow = rows[0];
    const dataRows = rows.slice(1);

    setParsedHeaders(headerRow);

    // Auto guess column mapping
    const initialMapping: Record<number, string> = {};
    let guessedNameCol = 0;

    headerRow.forEach((colName, idx) => {
      const lower = colName.toLowerCase();
      if (lower.includes('nama') || lower.includes('name') || lower.includes('siswa') || lower.includes('student')) {
        guessedNameCol = idx;
      } else {
        // Try match colName with LO code (e.g. "LO 1.1", "LO 1", "LO1")
        const cleanCol = lower.replace(/\s+/g, '');
        const matched = allLOs.find(item => {
          const cleanLo = item.lo.code.toLowerCase().replace(/\s+/g, '');
          return cleanCol === cleanLo || cleanCol.includes(cleanLo);
        });
        if (matched) {
          initialMapping[idx] = matched.lo.id;
        } else if (allLOs[idx - 1]) {
          // Sequential fallback if colName looks like a number or index
          initialMapping[idx] = allLOs[idx - 1].lo.id;
        }
      }
    });

    setNameColIndex(guessedNameCol);
    setColumnLoMapping(initialMapping);

    // Initial student matching
    processRows(dataRows, guessedNameCol, initialMapping);
    setStep('MAP_AND_VALIDATE');
  };

  const processRows = (
    rawRowsData: string[][], 
    nameIdx: number, 
    mapping: Record<number, string>
  ) => {
    const results: ParsedRow[] = rawRowsData.map(cells => {
      const rawName = cells[nameIdx] || '';
      const cleanRawName = rawName.toLowerCase().replace(/[^a-z0-9]/g, '');

      // Try find student
      let matchedId: string | null = null;
      let isAmbiguous = false;

      // 1. Exact or strict normalized match
      const exactMatches = students.filter(s => {
        const cleanStudentName = s.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        return cleanStudentName === cleanRawName;
      });

      if (exactMatches.length === 1) {
        matchedId = exactMatches[0].id;
      } else if (exactMatches.length > 1) {
        isAmbiguous = true;
      } else {
        // 2. Substring match
        const partialMatches = students.filter(s => {
          const cleanStudentName = s.name.toLowerCase().replace(/[^a-z0-9]/g, '');
          return cleanStudentName.includes(cleanRawName) || cleanRawName.includes(cleanStudentName);
        });
        if (partialMatches.length === 1 && cleanRawName.length >= 3) {
          matchedId = partialMatches[0].id;
        } else if (partialMatches.length > 1) {
          isAmbiguous = true;
        }
      }

      // Extract scores
      const rowScores: Record<string, number> = {};
      const errors: string[] = [];

      Object.entries(mapping).forEach(([colIdxStr, loId]) => {
        if (!loId) return;
        const colIdx = parseInt(colIdxStr, 10);
        const cellVal = cells[colIdx];
        if (cellVal !== undefined && cellVal !== null && cellVal !== '') {
          const num = parseFloat(cellVal.replace(',', '.'));
          if (isNaN(num)) {
            errors.push(`Kolom ${colIdx + 1}: bukan angka (${cellVal})`);
          } else if (num < 0 || num > 100) {
            errors.push(`Kolom ${colIdx + 1}: nilai di luar 0–100 (${num})`);
          } else {
            rowScores[loId] = num;
          }
        }
      });

      return {
        rawName,
        rawCells: cells,
        matchedStudentId: matchedId,
        isAmbiguous,
        scores: rowScores,
        errors
      };
    });

    setParsedRows(results);
  };

  const handleUpdateStudentMatch = (rowIndex: number, studentId: string) => {
    setParsedRows(prev => {
      const next = [...prev];
      next[rowIndex] = {
        ...next[rowIndex],
        matchedStudentId: studentId || null,
        isAmbiguous: false
      };
      return next;
    });
  };

  const handleUpdateColumnLo = (colIdx: number, loId: string) => {
    const nextMapping = { ...columnLoMapping };
    if (!loId) {
      delete nextMapping[colIdx];
    } else {
      nextMapping[colIdx] = loId;
    }
    setColumnLoMapping(nextMapping);

    // Re-evaluate scores with updated mapping
    setParsedRows(prev => prev.map(row => {
      const rowScores: Record<string, number> = {};
      const errors: string[] = [];
      Object.entries(nextMapping).forEach(([cStr, mappedLoId]) => {
        const c = parseInt(cStr, 10);
        const cellVal = row.rawCells[c];
        if (cellVal !== undefined && cellVal !== null && cellVal !== '') {
          const num = parseFloat(cellVal.replace(',', '.'));
          if (isNaN(num)) {
            errors.push(`Kolom ${c + 1}: bukan angka`);
          } else if (num < 0 || num > 100) {
            errors.push(`Kolom ${c + 1}: nilai di luar 0–100`);
          } else {
            rowScores[mappedLoId] = num;
          }
        }
      });
      return { ...row, scores: rowScores, errors };
    }));
  };

  const handleConfirmImport = async () => {
    // Validate rows
    const validRows = parsedRows.filter(r => r.matchedStudentId && Object.keys(r.scores).length > 0 && r.errors.length === 0);

    if (validRows.length === 0) {
      toast.warning('Tidak ada baris data valid yang siap diimpor. Pastikan nama siswa terpasangkan dan nilai valid.');
      return;
    }

    const unmappedStudents = parsedRows.filter(r => !r.matchedStudentId);
    if (unmappedStudents.length > 0) {
      const proceed = window.confirm(
        `Terdapat ${unmappedStudents.length} baris siswa yang belum terpasangkan dan akan dilewati. Lanjutkan impor untuk ${validRows.length} siswa yang valid?`
      );
      if (!proceed) return;
    }

    setSaving(true);
    try {
      const payload: Record<string, Record<string, number>> = {};
      validRows.forEach(row => {
        if (row.matchedStudentId) {
          payload[row.matchedStudentId] = row.scores;
        }
      });

      await onImport(payload);
      toast.success(`Berhasil mengimpor nilai untuk ${validRows.length} siswa.`);
      onClose();
    } catch (err: any) {
      toast.error('Gagal mengimpor tabel: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
              <FileSpreadsheet size={18} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Impor &amp; Tempel Tabel Nilai</h2>
              <p className="text-xs text-slate-500">Pelajaran: {subject.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 rounded-lg transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {step === 'PASTE' ? (
            <div className="space-y-4">
              <div className="p-3.5 bg-purple-50/70 border border-purple-200 rounded-xl text-xs text-purple-900 space-y-1">
                <p className="font-semibold flex items-center gap-1.5">
                  <FileSpreadsheet size={14} className="text-purple-600" />
                  Petunjuk Tempel Tabel
                </p>
                <p className="text-[11px] text-purple-800 leading-relaxed">
                  Salin (Copy) tabel dari Google Sheet atau Excel yang berisi kolom <strong>Nama Siswa</strong> dan satu atau beberapa kolom <strong>Nilai LO (0–100)</strong>, lalu tempelkan (Paste) ke area di bawah ini.
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Tempelkan Teks Tabel Disini
                </label>
                <textarea
                  rows={10}
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder="Contoh:&#10;Nama Siswa	LO 1.1	LO 1.2&#10;Ahmad Fauzi	85	90&#10;Bella Safira	75	80"
                  className="w-full text-xs font-mono p-3 border border-slate-300 rounded-xl bg-slate-50/50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleParsePaste}
                  className="px-5 py-2.5 text-xs font-bold rounded-xl bg-purple-600 hover:bg-purple-700 text-white shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
                >
                  Pratinjau &amp; Petakan Kolom <ArrowRight size={14} />
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Back to paste */}
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setStep('PASTE')}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  ← Ubah Teks Tempelan
                </button>
                <span className="text-xs text-slate-500 font-medium">
                  {parsedRows.length} baris data terdeteksi
                </span>
              </div>

              {/* Column Mapping Section */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block">
                  Pemetaan Kolom Tabel ke LO
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-[10px] text-slate-500 font-semibold mb-0.5">
                      Kolom Nama Siswa
                    </label>
                    <select
                      value={nameColIndex}
                      onChange={(e) => {
                        const newIdx = parseInt(e.target.value, 10);
                        setNameColIndex(newIdx);
                        processRows(parsedRows.map(r => r.rawCells), newIdx, columnLoMapping);
                      }}
                      className="w-full text-xs font-semibold px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                    >
                      {parsedHeaders.map((h, i) => (
                        <option key={i} value={i}>
                          Kolom {i + 1}: {h || `(Kolom ${i + 1})`}
                        </option>
                      ))}
                    </select>
                  </div>

                  {parsedHeaders.map((headerText, colIdx) => {
                    if (colIdx === nameColIndex) return null;
                    return (
                      <div key={colIdx}>
                        <label className="block text-[10px] text-slate-500 font-semibold mb-0.5 truncate">
                          Kolom {colIdx + 1}: {headerText || `Kolom ${colIdx + 1}`}
                        </label>
                        <select
                          value={columnLoMapping[colIdx] || ''}
                          onChange={(e) => handleUpdateColumnLo(colIdx, e.target.value)}
                          className="w-full text-xs font-semibold px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                        >
                          <option value="">(Abaikan / Jangan Impor)</option>
                          {allLOs.map(({ lo, lgCode }) => (
                            <option key={lo.id} value={lo.id}>
                              {lgCode} · {lo.code} ({lo.title})
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Rows matching & validation table */}
              <div className="border border-slate-200 rounded-xl overflow-x-auto max-h-[350px]">
                <table className="w-full text-xs text-left border-collapse min-w-[700px]">
                  <thead className="bg-slate-100 text-slate-700 sticky top-0 z-10 border-b border-slate-200">
                    <tr>
                      <th className="p-2.5 w-10 text-center font-bold">No</th>
                      <th className="p-2.5 font-bold">Nama di Tabel</th>
                      <th className="p-2.5 font-bold">Pasangan Siswa di Roster Resmi</th>
                      <th className="p-2.5 font-bold">Nilai Dipetakan</th>
                      <th className="p-2.5 font-bold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsedRows.map((row, rIdx) => {
                      const isMatched = !!row.matchedStudentId;
                      const hasError = row.errors.length > 0;
                      return (
                        <tr key={rIdx} className={!isMatched ? 'bg-amber-50/40' : hasError ? 'bg-rose-50/40' : 'hover:bg-slate-50/80'}>
                          <td className="p-2.5 text-center text-slate-400">{rIdx + 1}</td>
                          <td className="p-2.5 font-medium text-slate-800">{row.rawName || '(Kosong)'}</td>
                          <td className="p-2.5">
                            <select
                              value={row.matchedStudentId || ''}
                              onChange={(e) => handleUpdateStudentMatch(rIdx, e.target.value)}
                              className={`w-full max-w-xs text-xs font-semibold px-2 py-1 rounded-lg border ${
                                isMatched ? 'border-emerald-300 bg-emerald-50/50 text-emerald-900' : 'border-amber-300 bg-white text-slate-700'
                              }`}
                            >
                              <option value="">-- Pilih Siswa Roster --</option>
                              {students.map(s => (
                                <option key={s.id} value={s.id}>
                                  {s.name} ({s.nisn || s.id})
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="p-2.5">
                            <div className="flex flex-wrap gap-1">
                              {Object.entries(row.scores).map(([loId, score]) => {
                                const loItem = allLOs.find(i => i.lo.id === loId);
                                return (
                                  <span key={loId} className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px] font-bold text-slate-700">
                                    {loItem?.lo.code || 'LO'}: {score}
                                  </span>
                                );
                              })}
                              {Object.keys(row.scores).length === 0 && (
                                <span className="text-[10px] text-slate-400 italic">Tidak ada nilai</span>
                              )}
                            </div>
                          </td>
                          <td className="p-2.5">
                            {hasError ? (
                              <span className="text-[10px] font-bold text-rose-600 flex items-center gap-1">
                                <AlertCircle size={12} /> {row.errors.join(', ')}
                              </span>
                            ) : isMatched ? (
                              <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">
                                <Check size={12} /> Siap Simpan
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold text-amber-600 flex items-center gap-1">
                                <AlertCircle size={12} /> Belum Cocok
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="p-4 border-t border-slate-200 flex items-center justify-between bg-slate-50">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer"
          >
            Batal
          </button>

          {step === 'MAP_AND_VALIDATE' && (
            <button
              type="button"
              onClick={handleConfirmImport}
              disabled={saving}
              className="px-5 py-2 text-xs font-bold rounded-xl bg-purple-600 hover:bg-purple-700 text-white shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
            >
              {saving ? 'Menyimpan Nilai...' : 'Sinkronkan & Simpan Nilai'}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
};
