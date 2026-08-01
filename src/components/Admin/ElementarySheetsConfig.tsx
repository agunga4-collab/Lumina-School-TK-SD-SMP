import React from "react";
import { 
  FileText, 
  Sparkles, 
  CheckCircle2, 
  XCircle, 
  HelpCircle, 
  Loader2, 
  Save, 
  ExternalLink, 
  RefreshCw, 
  Check, 
  Play
} from "lucide-react";
import { toast } from "sonner";
import { collection, doc, getDoc, setDoc, getDocs, Timestamp } from "firebase/firestore";
import { db, auth } from "../../lib/firebase";
import { Class } from "../../types";

interface ElementarySheetsConfigProps {
  classes: Class[];
  currentAcademicYear: string;
}

interface TabResults {
  exists: boolean;
  headersValid: boolean;
  error?: string;
  detectedHeaders?: string[];
}

export default function ElementarySheetsConfig({ classes, currentAcademicYear }: ElementarySheetsConfigProps) {
  const [selectedClassId, setSelectedClassId] = React.useState<string>("");
  const [selectedYear, setSelectedYear] = React.useState<string>(currentAcademicYear || "2026/2027");
  const [spreadsheetUrl, setSpreadsheetUrl] = React.useState<string>("");
  const [isActive, setIsActive] = React.useState<boolean>(true);
  
  // Custom list of academic years
  const academicYearsList = ["2024/2025", "2025/2026", "2026/2027", "2027/2028"];

  // Tab names state
  const [tabs, setTabs] = React.useState<Record<string, string>>({
    P1_NUMERACY: "P1 Numerasi",
    P1_BAHASA_INDONESIA: "P1 Bahasa Indonesia",
    P1_ENGLISH_READING: "P1 English Reading",
    P1_MENGAJI: "P1 Mengaji",

    P2_NUMERACY: "P2 Numerasi",
    P2_BAHASA_INDONESIA: "P2 Bahasa Indonesia",
    P2_ENGLISH_READING: "P2 English Reading",
    P2_MENGAJI: "P2 Mengaji",

    P3_NUMERACY: "P3 Numerasi",
    P3_BAHASA_INDONESIA: "P3 Bahasa Indonesia",
    P3_ENGLISH_READING: "P3 English Reading",
    P3_MENGAJI: "P3 Mengaji"
  });

  // Action states
  const [isTesting, setIsTesting] = React.useState<boolean>(false);
  const [testResults, setTestResults] = React.useState<Record<string, TabResults> | null>(null);
  const [testGeneralError, setTestGeneralError] = React.useState<string | null>(null);
  
  const [isSaving, setIsSaving] = React.useState<boolean>(false);
  const [isCreatingTemplate, setIsCreatingTemplate] = React.useState<boolean>(false);
  const [loadingConfig, setLoadingConfig] = React.useState<boolean>(false);

  // Filter elementary classes
  const elementaryClasses = React.useMemo(() => {
    return classes.filter(c => c.unitId === "ELEMENTARY" && c.status !== "archived");
  }, [classes]);

  // Extract spreadsheet ID dynamically
  const extractedSpreadsheetId = React.useMemo(() => {
    if (!spreadsheetUrl) return "";
    const matches = spreadsheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return matches ? matches[1] : spreadsheetUrl.trim();
  }, [spreadsheetUrl]);

  // Helpers
  function academicYearKey(year: string): string {
    return year.replace(/\//g, "-");
  }

  function sheetConfigId(year: string, classId: string): string {
    return `${academicYearKey(year)}__${classId}`;
  }

  // Load existing configuration when class or year changes
  React.useEffect(() => {
    if (!selectedClassId || !selectedYear) return;

    const loadConfig = async () => {
      try {
        setLoadingConfig(true);
        setTestResults(null);
        setTestGeneralError(null);
        
        const configId = sheetConfigId(selectedYear, selectedClassId);
        const configRef = doc(db, "elementaryLiteracyNumeracySheetConfigs", configId);
        const snap = await getDoc(configRef);
        
        if (snap.exists()) {
          const data = snap.data();
          setSpreadsheetUrl(data.spreadsheetUrl || "");
          setIsActive(data.isActive !== false);
          if (data.tabs && typeof data.tabs === "object") {
            setTabs(prev => ({
              ...prev,
              ...data.tabs
            }));
          }
          toast.success("Konfigurasi kelas berhasil dimuat.");
        } else {
          // Reset URL and use defaults
          setSpreadsheetUrl("");
          setIsActive(true);
          setTabs({
            P1_NUMERACY: "P1 Numerasi",
            P1_BAHASA_INDONESIA: "P1 Bahasa Indonesia",
            P1_ENGLISH_READING: "P1 English Reading",
            P1_MENGAJI: "P1 Mengaji",

            P2_NUMERACY: "P2 Numerasi",
            P2_BAHASA_INDONESIA: "P2 Bahasa Indonesia",
            P2_ENGLISH_READING: "P2 English Reading",
            P2_MENGAJI: "P2 Mengaji",

            P3_NUMERACY: "P3 Numerasi",
            P3_BAHASA_INDONESIA: "P3 Bahasa Indonesia",
            P3_ENGLISH_READING: "P3 English Reading",
            P3_MENGAJI: "P3 Mengaji"
          });
        }
      } catch (err: any) {
        console.error("Error loading config:", err);
        toast.error("Gagal memuat konfigurasi: " + err.message);
      } finally {
        setLoadingConfig(false);
      }
    };

    loadConfig();
  }, [selectedClassId, selectedYear]);

  // Handler: Test Connection & Header Validity
  const handleTestConnection = async () => {
    if (!spreadsheetUrl.trim()) {
      toast.error("Masukkan URL Google Sheet terlebih dahulu");
      return;
    }
    try {
      setIsTesting(true);
      setTestResults(null);
      setTestGeneralError(null);

      const idToken = await auth.currentUser?.getIdToken();
      const response = await fetch("/api/elementary/sheets/test-connection", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken}`
        },
        body: JSON.stringify({
          spreadsheetUrl,
          tabs
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Gagal melakukan uji koneksi");
      }

      if (data.success) {
        setTestResults(data.results);
        const hasErrors = Object.values(data.results || {}).some((res: any) => !res.exists || !res.headersValid);
        if (hasErrors) {
          toast.error("Uji koneksi selesai dengan beberapa kesalahan tab/header.");
        } else {
          toast.success("Uji koneksi sukses! Semua tab & header valid.");
        }
      } else {
        setTestGeneralError(data.error || "Terjadi kesalahan tidak diketahui.");
      }
    } catch (err: any) {
      console.error("Uji koneksi error:", err);
      setTestGeneralError(err.message);
      toast.error(err.message || "Gagal menguji koneksi spreadsheet.");
    } finally {
      setIsTesting(false);
    }
  };

  // Handler: Save Configuration
  const handleSaveConfig = async () => {
    if (!selectedClassId) {
      toast.error("Pilih Kelas terlebih dahulu");
      return;
    }
    if (!selectedYear) {
      toast.error("Pilih Tahun Ajaran terlebih dahulu");
      return;
    }
    if (!spreadsheetUrl.trim()) {
      toast.error("Tautan URL Google Sheet wajib diisi");
      return;
    }
    if (!extractedSpreadsheetId) {
      toast.error("Gagal mengekstrak ID Spreadsheet dari URL");
      return;
    }

    try {
      setIsSaving(true);
      const selectedClassObj = elementaryClasses.find(c => c.id === selectedClassId);
      const className = selectedClassObj?.name || selectedClassId;

      const configId = sheetConfigId(selectedYear, selectedClassId);
      const configRef = doc(db, "elementaryLiteracyNumeracySheetConfigs", configId);

      const payload = {
        unitId: "ELEMENTARY",
        academicYear: selectedYear,
        academicYearKey: academicYearKey(selectedYear),
        classId: selectedClassId,
        className,
        spreadsheetId: extractedSpreadsheetId,
        spreadsheetUrl: spreadsheetUrl.trim(),
        isActive,
        templateVersion: 1,
        tabs,
        updatedAt: Timestamp.now(),
        updatedBy: auth.currentUser?.uid || "admin"
      };

      // Check if it's new or existing for createdAt field
      const snap = await getDoc(configRef);
      if (!snap.exists()) {
        Object.assign(payload, {
          createdAt: Timestamp.now(),
          createdBy: auth.currentUser?.uid || "admin"
        });
      } else {
        const existingData = snap.data();
        Object.assign(payload, {
          createdAt: existingData.createdAt || Timestamp.now(),
          createdBy: existingData.createdBy || auth.currentUser?.uid || "admin"
        });
      }

      await setDoc(configRef, payload);
      toast.success("Konfigurasi berhasil disimpan ke Firestore!");
    } catch (err: any) {
      console.error("Gagal menyimpan konfigurasi:", err);
      toast.error("Gagal menyimpan konfigurasi: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Handler: Create Google Sheet Template with All 12 Tabs
  const handleCreateFullTemplate = async () => {
    if (!selectedClassId) {
      toast.error("Pilih kelas terlebih dahulu untuk membuat template");
      return;
    }

    try {
      setIsCreatingTemplate(true);
      const idToken = await auth.currentUser?.getIdToken();
      const response = await fetch("/api/elementary/sheets/create-full-template", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken}`
        },
        body: JSON.stringify({
          classId: selectedClassId,
          academicYear: selectedYear,
          tabs
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Gagal membuat berkas Google Sheet");
      }

      setSpreadsheetUrl(data.spreadsheetUrl);
      toast.success("Google Sheet Template baru berhasil dibuat dengan 12 tab!");
    } catch (err: any) {
      console.error("Gagal membuat template:", err);
      toast.error(err.message || "Gagal membuat berkas template Google Sheet");
    } finally {
      setIsCreatingTemplate(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-gray-900 tracking-tight italic uppercase">
            Konfigurasi Google Sheet Literasi & Numerasi SD
          </h2>
          <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">
            Petakan tautan resmi Google Spreadsheet dan nama-nama tab per periode untuk setiap kelas SD.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Form Controls */}
        <div className="lg:col-span-2 bg-white p-6 sm:p-8 rounded-[2rem] border border-gray-100 shadow-sm space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Year Selection */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">Tahun Ajaran</label>
              <select
                value={selectedYear}
                onChange={e => setSelectedYear(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 text-xs px-3.5 py-3 rounded-xl outline-none focus:ring-1 focus:ring-slate-950 font-semibold text-slate-800"
              >
                {academicYearsList.map(yr => (
                  <option key={yr} value={yr}>{yr}</option>
                ))}
              </select>
            </div>

            {/* Class Selection */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">Pilih Kelas SD</label>
              <select
                value={selectedClassId}
                onChange={e => setSelectedClassId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 text-xs px-3.5 py-3 rounded-xl outline-none focus:ring-1 focus:ring-slate-950 font-bold text-slate-800"
              >
                <option value="">-- Pilih Kelas SD --</option>
                {elementaryClasses.map(cls => (
                  <option key={cls.id} value={cls.id}>{cls.name}</option>
                ))}
              </select>
            </div>
          </div>

          {loadingConfig ? (
            <div className="flex items-center justify-center py-12 gap-2 text-slate-500 text-xs font-bold uppercase">
              <Loader2 size={16} className="animate-spin text-slate-500" />
              Memuat Konfigurasi Kelas...
            </div>
          ) : (
            <>
              {/* Spreadsheet Details */}
              <div className="space-y-4 pt-2 border-t border-gray-100">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">
                      Tautan URL Google Spreadsheet
                    </label>
                    <span className="text-[10px] text-indigo-600 font-bold uppercase">Wajib Dibagikan (Editor/Viewer)</span>
                  </div>
                  <input
                    type="text"
                    placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                    value={spreadsheetUrl}
                    onChange={e => setSpreadsheetUrl(e.target.value)}
                    disabled={!selectedClassId}
                    className="w-full bg-slate-50 border border-slate-200 text-xs px-4 py-3 rounded-xl outline-none focus:ring-1 focus:ring-slate-950 font-medium text-slate-800 disabled:opacity-50"
                  />
                </div>

                {extractedSpreadsheetId && (
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between text-[11px] text-slate-600">
                    <span className="font-mono text-slate-500">
                      ID: {extractedSpreadsheetId}
                    </span>
                    <span className="font-semibold text-[9px] px-1.5 py-0.5 bg-slate-200 text-slate-700 rounded-md uppercase tracking-wider">
                      TEREKSTRAKSI
                    </span>
                  </div>
                )}

                {/* Status Switch */}
                <div className="flex items-center gap-3 py-1">
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={isActive}
                    disabled={!selectedClassId}
                    onChange={e => setIsActive(e.target.checked)}
                    className="w-4 h-4 rounded text-slate-900 focus:ring-slate-900 border-slate-300 cursor-pointer accent-slate-900"
                  />
                  <label htmlFor="isActive" className="text-xs font-black text-slate-700 uppercase tracking-wider cursor-pointer">
                    Konfigurasi Berstatus Aktif (Dapat digunakan oleh Guru)
                  </label>
                </div>
              </div>

              {/* TABS CONFIGURATION GRID */}
              <div className="space-y-4 pt-4 border-t border-gray-100">
                <div>
                  <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                    Nama Tab Spreadsheet Per Periode & Area
                  </h3>
                  <p className="text-[10px] text-slate-400 font-medium leading-normal mt-0.5">
                    Tentukan nama tab persis seperti yang tertulis di Google Sheets untuk dibaca oleh backend secara otomatis.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Period 1 (P1) */}
                  <div className="space-y-3 bg-slate-50/40 p-4 rounded-2xl border border-gray-100">
                    <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest block border-b border-slate-100 pb-1.5">
                      PERIODE 1 (P1)
                    </span>
                    <div className="space-y-2">
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-400 uppercase">Numerasi</label>
                        <input
                          type="text"
                          value={tabs.P1_NUMERACY}
                          disabled={!selectedClassId}
                          onChange={e => setTabs(prev => ({ ...prev, P1_NUMERACY: e.target.value }))}
                          className="w-full bg-white border border-slate-200 text-xs px-3 py-2 rounded-xl focus:ring-1 focus:ring-slate-900 outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-400 uppercase">Bahasa Indonesia</label>
                        <input
                          type="text"
                          value={tabs.P1_BAHASA_INDONESIA}
                          disabled={!selectedClassId}
                          onChange={e => setTabs(prev => ({ ...prev, P1_BAHASA_INDONESIA: e.target.value }))}
                          className="w-full bg-white border border-slate-200 text-xs px-3 py-2 rounded-xl focus:ring-1 focus:ring-slate-900 outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-400 uppercase">English Reading</label>
                        <input
                          type="text"
                          value={tabs.P1_ENGLISH_READING}
                          disabled={!selectedClassId}
                          onChange={e => setTabs(prev => ({ ...prev, P1_ENGLISH_READING: e.target.value }))}
                          className="w-full bg-white border border-slate-200 text-xs px-3 py-2 rounded-xl focus:ring-1 focus:ring-slate-900 outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-400 uppercase">Mengaji</label>
                        <input
                          type="text"
                          value={tabs.P1_MENGAJI}
                          disabled={!selectedClassId}
                          onChange={e => setTabs(prev => ({ ...prev, P1_MENGAJI: e.target.value }))}
                          className="w-full bg-white border border-slate-200 text-xs px-3 py-2 rounded-xl focus:ring-1 focus:ring-slate-900 outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Period 2 (P2) */}
                  <div className="space-y-3 bg-slate-50/40 p-4 rounded-2xl border border-gray-100">
                    <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest block border-b border-slate-100 pb-1.5">
                      PERIODE 2 (P2)
                    </span>
                    <div className="space-y-2">
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-400 uppercase">Numerasi</label>
                        <input
                          type="text"
                          value={tabs.P2_NUMERACY}
                          disabled={!selectedClassId}
                          onChange={e => setTabs(prev => ({ ...prev, P2_NUMERACY: e.target.value }))}
                          className="w-full bg-white border border-slate-200 text-xs px-3 py-2 rounded-xl focus:ring-1 focus:ring-slate-900 outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-400 uppercase">Bahasa Indonesia</label>
                        <input
                          type="text"
                          value={tabs.P2_BAHASA_INDONESIA}
                          disabled={!selectedClassId}
                          onChange={e => setTabs(prev => ({ ...prev, P2_BAHASA_INDONESIA: e.target.value }))}
                          className="w-full bg-white border border-slate-200 text-xs px-3 py-2 rounded-xl focus:ring-1 focus:ring-slate-900 outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-400 uppercase">English Reading</label>
                        <input
                          type="text"
                          value={tabs.P2_ENGLISH_READING}
                          disabled={!selectedClassId}
                          onChange={e => setTabs(prev => ({ ...prev, P2_ENGLISH_READING: e.target.value }))}
                          className="w-full bg-white border border-slate-200 text-xs px-3 py-2 rounded-xl focus:ring-1 focus:ring-slate-900 outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-400 uppercase">Mengaji</label>
                        <input
                          type="text"
                          value={tabs.P2_MENGAJI}
                          disabled={!selectedClassId}
                          onChange={e => setTabs(prev => ({ ...prev, P2_MENGAJI: e.target.value }))}
                          className="w-full bg-white border border-slate-200 text-xs px-3 py-2 rounded-xl focus:ring-1 focus:ring-slate-900 outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Period 3 (P3) */}
                  <div className="space-y-3 bg-slate-50/40 p-4 rounded-2xl border border-gray-100">
                    <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest block border-b border-slate-100 pb-1.5">
                      PERIODE 3 (P3)
                    </span>
                    <div className="space-y-2">
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-400 uppercase">Numerasi</label>
                        <input
                          type="text"
                          value={tabs.P3_NUMERACY}
                          disabled={!selectedClassId}
                          onChange={e => setTabs(prev => ({ ...prev, P3_NUMERACY: e.target.value }))}
                          className="w-full bg-white border border-slate-200 text-xs px-3 py-2 rounded-xl focus:ring-1 focus:ring-slate-900 outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-400 uppercase">Bahasa Indonesia</label>
                        <input
                          type="text"
                          value={tabs.P3_BAHASA_INDONESIA}
                          disabled={!selectedClassId}
                          onChange={e => setTabs(prev => ({ ...prev, P3_BAHASA_INDONESIA: e.target.value }))}
                          className="w-full bg-white border border-slate-200 text-xs px-3 py-2 rounded-xl focus:ring-1 focus:ring-slate-900 outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-400 uppercase">English Reading</label>
                        <input
                          type="text"
                          value={tabs.P3_ENGLISH_READING}
                          disabled={!selectedClassId}
                          onChange={e => setTabs(prev => ({ ...prev, P3_ENGLISH_READING: e.target.value }))}
                          className="w-full bg-white border border-slate-200 text-xs px-3 py-2 rounded-xl focus:ring-1 focus:ring-slate-900 outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-400 uppercase">Mengaji</label>
                        <input
                          type="text"
                          value={tabs.P3_MENGAJI}
                          disabled={!selectedClassId}
                          onChange={e => setTabs(prev => ({ ...prev, P3_MENGAJI: e.target.value }))}
                          className="w-full bg-white border border-slate-200 text-xs px-3 py-2 rounded-xl focus:ring-1 focus:ring-slate-900 outline-none"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ACTION BUTTONS */}
              <div className="flex flex-wrap items-center gap-3 pt-6 border-t border-gray-100">
                {/* Uji Koneksi */}
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={isTesting || !spreadsheetUrl || !selectedClassId}
                  className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-800 disabled:opacity-50 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-sm"
                >
                  {isTesting ? (
                    <>
                      <Loader2 size={13} className="animate-spin text-slate-700" />
                      Sedang Menguji...
                    </>
                  ) : (
                    <>
                      <RefreshCw size={13} className="text-slate-600" />
                      Uji Koneksi & Header
                    </>
                  )}
                </button>

                {/* Buat Template */}
                <button
                  type="button"
                  onClick={handleCreateFullTemplate}
                  disabled={isCreatingTemplate || !selectedClassId}
                  className="flex items-center gap-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 disabled:opacity-50 border border-indigo-200/40 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-sm"
                >
                  {isCreatingTemplate ? (
                    <>
                      <Loader2 size={13} className="animate-spin text-indigo-600" />
                      Membuat Berkas...
                    </>
                  ) : (
                    <>
                      <Sparkles size={13} className="text-indigo-600" />
                      Buat Template Google Sheet
                    </>
                  )}
                </button>

                {/* Simpan Konfigurasi */}
                <button
                  type="button"
                  onClick={handleSaveConfig}
                  disabled={isSaving || !selectedClassId || !spreadsheetUrl}
                  className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white disabled:bg-slate-200 disabled:text-slate-400 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-md shadow-slate-900/10"
                >
                  {isSaving ? (
                    <>
                      <Loader2 size={13} className="animate-spin text-white" />
                      Menyimpan...
                    </>
                  ) : (
                    <>
                      <Save size={13} className="text-white" />
                      Simpan Konfigurasi
                    </>
                  )}
                </button>

                {/* Buka Google Sheet */}
                {spreadsheetUrl && (
                  <a
                    href={spreadsheetUrl}
                    target="_blank"
                    referrerPolicy="no-referrer"
                    className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200/40 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-sm"
                  >
                    Buka Google Sheet
                    <ExternalLink size={12} />
                  </a>
                )}
              </div>
            </>
          )}
        </div>

        {/* Right Column: Connection Test Result / Instructions Panel */}
        <div className="space-y-6">
          {/* Test connection output block */}
          {testResults && (
            <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm space-y-4">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block border-b border-gray-50 pb-2">
                Hasil Uji Koneksi Tab & Header
              </span>

              <div className="space-y-2 max-h-[400px] overflow-auto">
                {Object.entries(testResults || {}).map(([tabKey, res]: [string, any]) => (
                  <div 
                    key={tabKey} 
                    className={`p-3 rounded-2xl border flex flex-col gap-1.5 ${
                      res.exists && res.headersValid 
                        ? "bg-emerald-50/30 border-emerald-100" 
                        : "bg-red-50/30 border-red-150"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <span className="text-[10px] font-black text-slate-800 block">
                          {tabKey.replace("_", " ")}
                        </span>
                        <span className="text-[10px] text-slate-500 italic">
                          Tab: "{tabs[tabKey] || tabKey}"
                        </span>
                      </div>
                      {res.exists && res.headersValid ? (
                        <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                      ) : (
                        <XCircle size={16} className="text-red-600 shrink-0 mt-0.5" />
                      )}
                    </div>

                    <div className="text-[10px] leading-normal font-semibold space-y-1">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${res.exists ? "bg-emerald-500" : "bg-red-500"}`} />
                        <span className={res.exists ? "text-emerald-800" : "text-red-800"}>
                          {res.exists ? "Tab Ditemukan" : "Tab Tidak Ada"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${res.headersValid ? "bg-emerald-500" : "bg-red-500"}`} />
                        <span className={res.headersValid ? "text-emerald-800" : "text-red-800"}>
                          {res.headersValid ? "Struktur Header Valid" : "Struktur Header Tidak Valid / NIS Hilang"}
                        </span>
                      </div>
                      
                      {res.error && (
                        <p className="text-[9px] text-red-600 bg-red-50/50 p-2 rounded-lg font-mono border border-red-100 mt-1 leading-relaxed">
                          ERR: {res.error}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {testGeneralError && (
            <div className="bg-red-50/40 border border-red-100 p-6 rounded-[2rem] shadow-sm space-y-2">
              <span className="text-[10px] font-black text-red-600 uppercase tracking-wider block">
                Kesalahan Sistem / Akses
              </span>
              <p className="text-xs text-slate-700 leading-relaxed">
                Backend tidak dapat memproses koneksi Google Sheet:
              </p>
              <div className="text-[10px] bg-white p-3 border border-red-150 rounded-xl text-red-700 font-mono leading-relaxed max-h-[200px] overflow-auto">
                {testGeneralError}
              </div>
            </div>
          )}

          {/* Quick Guide */}
          <div className="bg-slate-900 text-white p-6 sm:p-8 rounded-[2rem] shadow-lg space-y-4">
            <div className="flex items-center gap-2 text-indigo-400">
              <HelpCircle size={18} />
              <h3 className="text-xs font-black uppercase tracking-wider">Panduan Pemetaan Sheet</h3>
            </div>

            <p className="text-[11px] text-[#9d9da6] leading-relaxed">
              Ikuti petunjuk di bawah untuk pemetaan lembar kerja Google Sheets yang mulus:
            </p>

            <ul className="space-y-3 text-[10px] leading-relaxed text-slate-300">
              <li className="flex gap-2 items-start">
                <span className="text-indigo-400 font-bold shrink-0">1.</span>
                <span><b>Akun Layanan (Service Account)</b> wajib diundang ke sheet sebagai pembaca (Viewer) atau editor (Writer).</span>
              </li>
              <li className="flex gap-2 items-start">
                <span className="text-indigo-400 font-bold shrink-0">2.</span>
                <span><b>Struktur Tab</b> harus memiliki baris 1 sebagai nama-nama kolom header, dan kolom pertama wajib memuat <b>"ID Siswa"</b> atau <b>"NIS"</b> sebagai primary key siswa.</span>
              </li>
              <li className="flex gap-2 items-start">
                <span className="text-indigo-400 font-bold shrink-0">3.</span>
                <span>Jangan ubah ID Siswa (NIS) yang tertera agar pemetaan nilai ke database tidak tertukar.</span>
              </li>
              <li className="flex gap-2 items-start">
                <span className="text-indigo-400 font-bold shrink-0">4.</span>
                <span>Gunakan tombol <b>Buat Template</b> untuk generate instan berkas Google Sheet multi-tab yang telah disesuaikan dengan format Lazuardi secara otomatis!</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
