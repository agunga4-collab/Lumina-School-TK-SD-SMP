import * as React from 'react';
import { useState, useEffect, useMemo } from 'react';
import { 
  BookOpen, Calendar, Award, CheckCircle2, AlertCircle, 
  Clock, Edit3, History as HistoryIcon, Loader2, Sparkles, X, ChevronRight, Check
} from 'lucide-react';
import { useOutletContext } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { db, handleFirestoreError } from '../../lib/firebase';
import { 
  collection, doc, getDoc, getDocs, query, where, orderBy, 
  serverTimestamp, runTransaction, onSnapshot, DocumentData, Timestamp 
} from 'firebase/firestore';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { 
  SURAH_LIST, 
  JUZ_BOUNDARIES, 
  Surah, 
  getSurahByNumber, 
  getJuzBoundary, 
  getSurahsInJuz, 
  getAyahRangeForSurahInJuz 
} from '../../constants/quranReference';
import { QuranParticipant, QuranReadingLog, QuranReadingLogHistory } from '../../services/quranService';

const APPRECIATION_MESSAGES = [
  "Alhamdulillah! Bacaanmu hari ini sudah tercatat. Teruslah istiqomah bersama Al-Qur'an.",
  "Barakallahufiik! Setiap huruf yang kamu baca bernilai kebaikan di sisi Allah.",
  "Masya Allah! Langkah kecil yang konsisten ini akan menjadi cahaya di hari kiamat.",
  "Alhamdulillah, bacaanmu bertambah lagi hari ini. Malaikat mencatat kebaikanmu!",
  "Luar biasa! Menjaga interaksi dengan Al-Qur'an adalah kunci ketenangan hati.",
  "Alhamdulillah! Semoga Al-Qur'an kelak menjadi syafaat bagi kehidupanmu.",
  "Hebat! Semangat membacamu hari ini sangat menginspirasi. Pertahankan ya!",
  "Barakallah! Allah mencintai amalan yang konsisten, sekecil apapun itu.",
  "Masya Allah, satu langkah lebih dekat dengan kecintaan pada Kalam Ilahi.",
  "Alhamdulillah! Jadikan Al-Qur'an sebagai sahabat setiamu setiap hari.",
  "Pilihan yang mulia! Waktu berhargamu dihiasi dengan tilawah Al-Qur'an.",
  "Alhamdulillah! Semoga keberkahan Al-Qur'an senantiasa menyertai harimu."
];

function getWibDateString(date = new Date()): string {
  const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
  const wibDate = new Date(utc + (3600000 * 7));
  const year = wibDate.getFullYear();
  const month = String(wibDate.getMonth() + 1).padStart(2, '0');
  const day = String(wibDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function StudentQuranPage() {
  const { currentUser } = useOutletContext<{ currentUser: any }>();
  const { profile } = useAuth();
  const { activeYear } = useAcademicYear();

  const [loading, setLoading] = useState<boolean>(true);
  const [participant, setParticipant] = useState<QuranParticipant | null>(null);
  const [participantStatus, setParticipantStatus] = useState<'loading' | 'active' | 'inactive' | 'unregistered' | 'error'>('loading');
  const [studentUid, setStudentUid] = useState<string>('');
  
  const [logs, setLogs] = useState<QuranReadingLog[]>([]);
  const [logsLoading, setLogsLoading] = useState<boolean>(false);

  // Form State
  const [readDate, setReadDate] = useState<string>(getWibDateString());
  const [juz, setJuz] = useState<number>(1);
  const [surahNumber, setSurahNumber] = useState<number>(1);
  const [ayat, setAyat] = useState<number>(1);
  const [note, setNote] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Edit & History Modal State
  const [editingLog, setEditingLog] = useState<QuranReadingLog | null>(null);
  const [historyModalLogId, setHistoryModalLogId] = useState<string | null>(null);
  const [historyList, setHistoryList] = useState<QuranReadingLogHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);

  // Appreciation Modal State
  const [appreciationModal, setAppreciationModal] = useState<{
    isOpen: boolean;
    message: string;
    log: QuranReadingLog | null;
  }>({
    isOpen: false,
    message: '',
    log: null
  });

  // 1. Identify correct student ID
  useEffect(() => {
    const resolveStudentIdentity = async () => {
      if (!currentUser && !profile) {
        setParticipantStatus('error');
        setLoading(false);
        return;
      }

      const activeUser = currentUser || profile;
      const sId = (activeUser?.luminaId || activeUser?.studentId || activeUser?.uid || '').trim();

      if (!sId) {
        setParticipantStatus('error');
        setLoading(false);
        return;
      }

      const unit = (activeUser?.unitId || activeUser?.unit || '').toUpperCase();
      let confirmedUnit = unit;
      try {
        const studentSnap = await getDoc(doc(db, 'students', sId));
        if (studentSnap.exists()) {
          const sData = studentSnap.data();
          if (sData.unitId || sData.unit) {
            confirmedUnit = (sData.unitId || sData.unit).toUpperCase();
          }
        }
      } catch (err) {
        console.warn("Could not verify student unit from master record:", err);
      }

      if (confirmedUnit && confirmedUnit !== 'ELEMENTARY') {
        setParticipantStatus('error');
        setLoading(false);
        return;
      }

      setStudentUid(sId);

      // 2. Listen to participant document
      const partRef = doc(db, 'elementary_quran_participants', sId);
      const unsubscribe = onSnapshot(partRef, (snap) => {
        if (snap.exists()) {
          const data = snap.data() as QuranParticipant;
          setParticipant(data);
          if (data.status === 'active') {
            setParticipantStatus('active');
          } else {
            setParticipantStatus('inactive');
          }
        } else {
          setParticipant(null);
          setParticipantStatus('unregistered');
        }
        setLoading(false);
      }, (err) => {
        console.error("Error listening to participant status:", err);
        setParticipantStatus('error');
        setLoading(false);
      });

      return () => unsubscribe();
    };

    resolveStudentIdentity();
  }, [currentUser, profile]);

  // 3. Query reading logs for this studentUid
  useEffect(() => {
    if (!studentUid || participantStatus === 'loading' || participantStatus === 'unregistered' || participantStatus === 'error') {
      setLogs([]);
      return;
    }

    setLogsLoading(true);
    const logsRef = collection(db, 'elementary_quran_reading_logs');
    const qLogs = query(
      logsRef,
      where('studentUid', '==', studentUid),
      orderBy('readDate', 'desc'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribeLogs = onSnapshot(qLogs, (snapshot) => {
      const fetchedLogs: QuranReadingLog[] = [];
      snapshot.forEach(docSnap => {
        fetchedLogs.push({
          id: docSnap.id,
          ...docSnap.data()
        } as QuranReadingLog);
      });
      setLogs(fetchedLogs);
      setLogsLoading(false);
    }, (err) => {
      console.error("Error listening to reading logs:", err);
      toast.error("Gagal memuat riwayat bacaan Al-Qur'an.");
      setLogsLoading(false);
    });

    return () => unsubscribeLogs();
  }, [studentUid, participantStatus]);

  const availableSurahsInJuz = useMemo(() => {
    return getSurahsInJuz(juz);
  }, [juz]);

  useEffect(() => {
    const surahs = getSurahsInJuz(juz);
    if (!surahs.some(s => s.surahNumber === surahNumber)) {
      if (surahs.length > 0) {
        setSurahNumber(surahs[0].surahNumber);
      }
    }
  }, [juz]);

  const ayahRange = useMemo(() => {
    const numJuz = Number(juz);
    const numSurah = Number(surahNumber);
    if (!numJuz || !numSurah || isNaN(numJuz) || isNaN(numSurah)) {
      return null;
    }
    return getAyahRangeForSurahInJuz(numJuz, numSurah);
  }, [juz, surahNumber]);

  useEffect(() => {
    if (ayahRange) {
      if (ayat < ayahRange.startAyah || ayat > ayahRange.endAyah) {
        setAyat(ayahRange.startAyah);
      }
    }
  }, [juz, surahNumber, ayahRange]);

  const handleJuzChange = (newJuz: number) => {
    setJuz(newJuz);
    const surahs = getSurahsInJuz(newJuz);
    if (surahs.length > 0) {
      setSurahNumber(surahs[0].surahNumber);
      const range = getAyahRangeForSurahInJuz(newJuz, surahs[0].surahNumber);
      if (range) {
        setAyat(range.startAyah);
      }
    }
  };

  const handleSurahChange = (newSurahNum: number) => {
    setSurahNumber(newSurahNum);
    const range = getAyahRangeForSurahInJuz(juz, newSurahNum);
    if (range) {
      setAyat(range.startAyah);
    }
  };

  const summary = useMemo(() => {
    if (logs.length === 0) {
      return {
        lastRead: null,
        uniqueDaysCount: 0,
        currentStreak: 0,
        readToday: false
      };
    }

    const lastRead = logs[0];
    const uniqueDates = Array.from(new Set(logs.map(l => l.readDate))).sort().reverse();
    const uniqueDaysCount = uniqueDates.length;

    const todayStr = getWibDateString();
    const readToday = uniqueDates.includes(todayStr);

    let currentStreak = 0;
    const today = new Date();
    const todayWibStr = getWibDateString(today);
    
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    const yesterdayWibStr = getWibDateString(yesterday);

    let startDateStr = todayWibStr;
    if (!uniqueDates.includes(todayWibStr)) {
      if (uniqueDates.includes(yesterdayWibStr)) {
        startDateStr = yesterdayWibStr;
      } else {
        currentStreak = 0;
      }
    }

    if (uniqueDates.includes(startDateStr)) {
      let d = new Date();
      if (startDateStr === yesterdayWibStr) {
        d.setDate(d.getDate() - 1);
      }
      
      while (true) {
        const dStr = getWibDateString(d);
        if (uniqueDates.includes(dStr)) {
          currentStreak++;
          d.setDate(d.getDate() - 1);
        } else {
          break;
        }
      }
    }

    return {
      lastRead,
      uniqueDaysCount,
      currentStreak,
      readToday
    };
  }, [logs]);

  const handleSubmitLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || participantStatus !== 'active') return;

    const todayWib = getWibDateString();
    if (readDate > todayWib) {
      toast.error('Tanggal bacaan tidak boleh di masa depan.');
      return;
    }

    const range = getAyahRangeForSurahInJuz(juz, surahNumber);
    if (!range) {
      toast.error('Kombinasi Juz dan Surat tidak valid.');
      return;
    }
    if (ayat < range.startAyah || ayat > range.endAyah) {
      toast.error(`Ayat tidak valid untuk Juz ${juz} pada surat ini. Rentang valid: ${range.startAyah} - ${range.endAyah}.`);
      return;
    }

    const surahObj = getSurahByNumber(surahNumber);
    if (!surahObj) {
      toast.error('Pilihan surat tidak valid.');
      return;
    }

    try {
      setSubmitting(true);
      const activeUser = currentUser || profile;
      const sName = participant?.studentName || activeUser?.displayName || activeUser?.name || 'Siswa';
      const cId = participant?.classId || activeUser?.classId || '';
      const cName = participant?.className || '';

      const logData: Omit<QuranReadingLog, 'id'> = {
        studentUid,
        studentName: sName,
        classId: cId,
        className: cName,
        unit: 'ELEMENTARY',
        readDate,
        juz,
        surahNumber,
        surahName: surahObj.name,
        ayat,
        note: note.trim() ? note.trim().substring(0, 200) : '',
        createdAt: serverTimestamp(),
        updatedAt: null,
        editCount: 0,
        source: 'app'
      };

      const newDocRef = doc(collection(db, 'elementary_quran_reading_logs'));
      await runTransaction(db, async (transaction) => {
        transaction.set(newDocRef, logData);
      });

      const savedLog: QuranReadingLog = {
        id: newDocRef.id,
        ...logData,
        createdAt: Date.now()
      };

      setNote('');

      const randomMsg = APPRECIATION_MESSAGES[Math.floor(Math.random() * APPRECIATION_MESSAGES.length)];
      setAppreciationModal({
        isOpen: true,
        message: randomMsg,
        log: savedLog
      });

    } catch (err: any) {
      console.error("Error saving quran reading log:", err);
      handleFirestoreError(err, 'create', 'elementary_quran_reading_logs');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || !editingLog || !editingLog.id || participantStatus !== 'active') return;

    const range = getAyahRangeForSurahInJuz(editingLog.juz, editingLog.surahNumber);
    if (!range) {
      toast.error('Kombinasi Juz dan Surat pada edit tidak valid.');
      return;
    }
    if (editingLog.ayat < range.startAyah || editingLog.ayat > range.endAyah) {
      toast.error(`Ayat tidak valid untuk Juz ${editingLog.juz} pada surat ini.`);
      return;
    }

    const surahObj = getSurahByNumber(editingLog.surahNumber);
    if (!surahObj) return;

    try {
      setSubmitting(true);
      const logRef = doc(db, 'elementary_quran_reading_logs', editingLog.id);
      const historyRef = doc(collection(db, `elementary_quran_reading_logs/${editingLog.id}/history`));

      const activeUid = studentUid;

      await runTransaction(db, async (transaction) => {
        const currentSnap = await transaction.get(logRef);
        if (!currentSnap.exists()) {
          throw new Error("Dokumen bacaan tidak ditemukan.");
        }

        const currentData = currentSnap.data() as QuranReadingLog;

        if (
          currentData.readDate === editingLog.readDate &&
          currentData.juz === editingLog.juz &&
          currentData.surahNumber === editingLog.surahNumber &&
          currentData.ayat === editingLog.ayat &&
          (currentData.note || '') === (editingLog.note || '')
        ) {
          return;
        }

        const historyData: Omit<QuranReadingLogHistory, 'id'> = {
          readDate: currentData.readDate,
          juz: currentData.juz,
          surahNumber: currentData.surahNumber,
          surahName: currentData.surahName,
          ayat: currentData.ayat,
          note: currentData.note || '',
          changedAt: serverTimestamp(),
          changedByUid: activeUid
        };
        transaction.set(historyRef, historyData);

        const newEditCount = (currentData.editCount || 0) + 1;
        transaction.update(logRef, {
          readDate: editingLog.readDate,
          juz: editingLog.juz,
          surahNumber: editingLog.surahNumber,
          surahName: surahObj.name,
          ayat: editingLog.ayat,
          note: editingLog.note ? editingLog.note.trim().substring(0, 200) : '',
          editCount: newEditCount,
          updatedAt: serverTimestamp()
        });
      });

      toast.success("Bacaan berhasil diperbarui.");
      setEditingLog(null);
    } catch (err: any) {
      console.error("Error updating quran log:", err);
      toast.error("Gagal memperbarui bacaan.");
    } finally {
      setSubmitting(false);
    }
  };

  const openHistoryModal = async (logId: string) => {
    setHistoryModalLogId(logId);
    setHistoryLoading(true);
    setHistoryList([]);

    try {
      const historyColRef = collection(db, `elementary_quran_reading_logs/${logId}/history`);
      const qHistory = query(historyColRef, orderBy('changedAt', 'desc'));
      const snap = await getDocs(qHistory);
      const list: QuranReadingLogHistory[] = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() } as QuranReadingLogHistory);
      });
      setHistoryList(list);
    } catch (err) {
      console.error("Error loading log history:", err);
      toast.error("Gagal memuat riwayat perubahan.");
    } finally {
      setHistoryLoading(false);
    }
  };

  if (loading || participantStatus === 'loading') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
      </div>
    );
  }

  if (participantStatus === 'error' || participantStatus === 'unregistered') {
    return (
      <div className="max-w-2xl mx-auto p-6 md:p-12">
        <div className="bg-amber-50 border border-amber-200 rounded-3xl p-8 text-center shadow-sm">
          <BookOpen className="w-12 h-12 text-amber-600 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-amber-900 mb-2">Sahabat Qur&apos;an</h2>
          <p className="text-amber-700 text-sm md:text-base leading-relaxed">
            Kamu belum terdaftar di Sahabat Qur&apos;an. Tanyakan ke gurumu ya.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-emerald-800 to-teal-700 rounded-3xl p-6 md:p-10 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 opacity-10 pointer-events-none flex items-center justify-end pr-10">
          <BookOpen className="w-64 h-64" />
        </div>
        <div className="relative z-10 space-y-2">
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-md px-3.5 py-1 rounded-full text-xs font-semibold text-emerald-100">
            <Sparkles className="w-3.5 h-3.5 text-emerald-300" />
            Program Harian Elementary
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight">Sahabat Qur&apos;an</h1>
          <p className="text-emerald-100 text-sm md:text-base max-w-xl font-medium">
            Catat dan pantau progres bacaan Al-Qur&apos;an harianmu dengan mudah dan menyenangkan.
          </p>
        </div>
      </div>

      {/* Inactive Notice */}
      {participantStatus === 'inactive' && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 md:p-6 text-amber-800 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
          <p className="text-sm font-medium">
            Status kepesertaanmu saat ini sedang nonaktif. Kamu masih dapat melihat riwayat bacaan, namun belum dapat menambah atau mengedit catatan baru.
          </p>
        </div>
      )}

      {/* Summary Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className={cn(
          "rounded-2xl p-5 border shadow-sm flex flex-col justify-between transition",
          summary.readToday ? "bg-emerald-50/70 border-emerald-200" : "bg-white border-slate-100"
        )}>
          <div className="flex items-center justify-between text-slate-500 mb-4">
            <span className="text-xs font-bold uppercase tracking-wider">Hari Ini</span>
            <Calendar className="w-4 h-4 text-emerald-600" />
          </div>
          <div>
            {summary.readToday ? (
              <div className="flex items-center gap-2 text-emerald-700 font-bold text-base">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                Sudah Membaca
              </div>
            ) : (
              <div className="flex items-center gap-2 text-amber-700 font-bold text-base">
                <Clock className="w-5 h-5 text-amber-500" />
                Belum Membaca
              </div>
            )}
            <p className="text-xs text-slate-500 mt-1">
              {summary.readToday ? "Alhamdulillah, tugas hari ini beres!" : "Yuk catat bacaanmu hari ini."}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-4">
            <span className="text-xs font-bold uppercase tracking-wider">Streak Aktif</span>
            <Sparkles className="w-4 h-4 text-amber-500" />
          </div>
          <div>
            <div className="text-3xl font-black text-slate-900">
              {summary.currentStreak} <span className="text-sm font-bold text-slate-500">hari</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">Membaca berturut-turut</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-4">
            <span className="text-xs font-bold uppercase tracking-wider">Total Hari</span>
            <Award className="w-4 h-4 text-teal-600" />
          </div>
          <div>
            <div className="text-3xl font-black text-slate-900">
              {summary.uniqueDaysCount} <span className="text-sm font-bold text-slate-500">hari unik</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">Akumulasi kebiasaan baik</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-4">
            <span className="text-xs font-bold uppercase tracking-wider">Terakhir Dibaca</span>
            <BookOpen className="w-4 h-4 text-emerald-600" />
          </div>
          <div>
            {summary.lastRead ? (
              <div>
                <div className="text-sm font-bold text-slate-900 truncate">
                  Juz {summary.lastRead.juz} • {summary.lastRead.surahName}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">Ayat {summary.lastRead.ayat}</p>
              </div>
            ) : (
              <p className="text-xs font-medium text-slate-400">Belum ada riwayat</p>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Grid: Form Input & History */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {participantStatus === 'active' && (
          <div className="lg:col-span-5 bg-white rounded-3xl p-6 md:p-8 border border-slate-100 shadow-sm space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-lg font-black text-slate-900">Catat Bacaan Baru</h2>
              <p className="text-xs text-slate-500 mt-0.5">Pilih juz, surah, dan ayat terakhir yang kamu baca.</p>
            </div>

            <form onSubmit={handleSubmitLog} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Tanggal Bacaan
                </label>
                <input 
                  type="date"
                  value={readDate}
                  max={getWibDateString()}
                  onChange={(e) => setReadDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Pilih Juz (1 - 30)
                </label>
                <select
                  value={juz}
                  onChange={(e) => handleJuzChange(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {Array.from({ length: 30 }, (_, i) => i + 1).map(j => (
                    <option key={j} value={j}>Juz {j}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Nama Surat
                </label>
                <select
                  value={surahNumber}
                  onChange={(e) => handleSurahChange(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {availableSurahsInJuz.map(s => (
                    <option key={s.surahNumber} value={s.surahNumber}>
                      {s.surahNumber}. {s.surahName} ({s.totalVerses} ayat)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Nomor Ayat Terakhir
                  </label>
                  <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                    Rentang: {ayahRange.startAyah} - {ayahRange.endAyah}
                  </span>
                </div>
                <input 
                  type="number"
                  min={ayahRange.startAyah}
                  max={ayahRange.endAyah}
                  value={ayat}
                  onChange={(e) => setAyat(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Catatan (Opsional, maks 200 karakter)
                </label>
                <textarea 
                  rows={2}
                  maxLength={200}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Misal: Lancar dan tartil..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-6 rounded-xl shadow-lg shadow-emerald-600/20 transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Menyimpan...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-5 h-5" />
                    Simpan Catatan Bacaan
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        <div className={cn(
          "space-y-6",
          participantStatus === 'active' ? "lg:col-span-7" : "lg:col-span-12"
        )}>
          <div className="bg-white rounded-3xl p-6 md:p-8 border border-slate-100 shadow-sm space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-lg font-black text-slate-900">Riwayat Bacaan</h2>
                <p className="text-xs text-slate-500 mt-0.5">Daftar pencatatan harianmu yang telah tersimpan.</p>
              </div>
              <span className="bg-slate-100 text-slate-700 px-3 py-1 rounded-full text-xs font-bold">
                {logs.length} Entri
              </span>
            </div>

            {logsLoading ? (
              <div className="py-12 flex justify-center">
                <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
              </div>
            ) : logs.length === 0 ? (
              <div className="py-12 text-center text-slate-400 space-y-2">
                <BookOpen className="w-10 h-10 mx-auto opacity-40" />
                <p className="text-sm font-medium">Belum ada riwayat bacaan yang tercatat.</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                {logs.map((log) => (
                  <div 
                    key={log.id} 
                    className="bg-slate-50 hover:bg-slate-100/70 border border-slate-200/60 rounded-2xl p-4 transition space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="bg-emerald-100 text-emerald-800 text-[11px] font-black px-2.5 py-0.5 rounded-full">
                            Juz {log.juz}
                          </span>
                          <h3 className="text-sm font-bold text-slate-900">
                            {log.surahNumber}. {log.surahName} • Ayat {log.ayat}
                          </h3>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                          <span className="font-semibold text-slate-700">{log.readDate}</span>
                          <span>•</span>
                          <span>Input: {log.createdAt?.toDate ? log.createdAt.toDate().toLocaleDateString('id-ID') : 'Baru saja'}</span>
                          {log.editCount > 0 && (
                            <>
                              <span>•</span>
                              <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-md">
                                Diedit ({log.editCount}x)
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {log.editCount > 0 && log.id && (
                          <button
                            onClick={() => openHistoryModal(log.id!)}
                            className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1 bg-blue-50 px-2.5 py-1.5 rounded-xl border border-blue-100"
                          >
                            <HistoryIcon className="w-3.5 h-3.5" />
                            Riwayat
                          </button>
                        )}

                        {participantStatus === 'active' && (
                          <button
                            onClick={() => setEditingLog(log)}
                            className="text-xs font-semibold text-slate-700 hover:bg-white bg-slate-200/60 px-3 py-1.5 rounded-xl transition flex items-center gap-1 border border-slate-300/40"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            Edit
                          </button>
                        )}
                      </div>
                    </div>

                    {log.note && (
                      <p className="text-xs text-slate-600 bg-white/80 border border-slate-200/40 p-2.5 rounded-xl italic">
                        &ldquo;{log.note}&rdquo;
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* APPRECIATION MODAL */}
      {appreciationModal.isOpen && appreciationModal.log && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl text-center space-y-6 relative overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
              <Sparkles className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h3 className="text-2xl font-black text-slate-900">Alhamdulillah!</h3>
              <p className="text-sm font-medium text-slate-600 leading-relaxed">
                {appreciationModal.message}
              </p>
            </div>

            <div className="bg-emerald-50 border border-emerald-200/70 rounded-2xl p-4 text-left space-y-1">
              <div className="text-xs font-bold text-emerald-800 uppercase tracking-wider">Bacaan Disimpan</div>
              <div className="text-sm font-black text-slate-900">
                Juz {appreciationModal.log.juz} • {appreciationModal.log.surahName} (Ayat {appreciationModal.log.ayat})
              </div>
              <div className="text-xs text-slate-500">Tanggal: {appreciationModal.log.readDate}</div>
            </div>

            <button
              onClick={() => setAppreciationModal({ isOpen: false, message: '', log: null })}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 px-6 rounded-2xl shadow-lg shadow-emerald-600/20 transition"
            >
              Lanjutkan
            </button>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {editingLog && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 md:p-8 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h3 className="text-lg font-black text-slate-900">Edit Catatan Bacaan</h3>
              <button 
                onClick={() => setEditingLog(null)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateLog} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Tanggal Bacaan
                </label>
                <input 
                  type="date"
                  value={editingLog.readDate}
                  max={getWibDateString()}
                  onChange={(e) => setEditingLog({ ...editingLog, readDate: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-800"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Pilih Juz (1 - 30)
                </label>
                <select
                  value={editingLog.juz}
                  onChange={(e) => {
                    const newJ = Number(e.target.value);
                    const surahs = getSurahsInJuz(newJ);
                    const sNum = surahs[0]?.surahNumber || 1;
                    const rng = getAyahRangeForSurahInJuz(newJ, sNum);
                    setEditingLog({
                      ...editingLog,
                      juz: newJ,
                      surahNumber: sNum,
                      surahName: surahs[0]?.surahName || '',
                      ayat: rng.startAyah
                    });
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-800"
                >
                  {Array.from({ length: 30 }, (_, i) => i + 1).map(j => (
                    <option key={j} value={j}>Juz {j}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Nama Surat
                </label>
                <select
                  value={editingLog.surahNumber}
                  onChange={(e) => {
                    const sNum = Number(e.target.value);
                    const surahObj = getSurahByNumber(sNum);
                    const rng = getAyahRangeForSurahInJuz(editingLog.juz, sNum);
                    setEditingLog({
                      ...editingLog,
                      surahNumber: sNum,
                      surahName: surahObj?.name || '',
                      ayat: rng.startAyah
                    });
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-800"
                >
                  {getSurahsInJuz(editingLog.juz).map(s => (
                    <option key={s.surahNumber} value={s.surahNumber}>
                      {s.surahNumber}. {s.surahName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Nomor Ayat Terakhir
                </label>
                <input 
                  type="number"
                  min={1}
                  value={editingLog.ayat}
                  onChange={(e) => setEditingLog({ ...editingLog, ayat: Number(e.target.value) })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-800"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Catatan
                </label>
                <textarea 
                  rows={2}
                  maxLength={200}
                  value={editingLog.note || ''}
                  onChange={(e) => setEditingLog({ ...editingLog, note: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingLog(null)}
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-6 rounded-xl shadow-md transition flex items-center gap-2 disabled:opacity-50"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* HISTORY MODAL */}
      {historyModalLogId && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 md:p-8 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2">
                <HistoryIcon className="w-5 h-5 text-blue-600" />
                <h3 className="text-lg font-black text-slate-900">Riwayat Perubahan Bacaan</h3>
              </div>
              <button 
                onClick={() => setHistoryModalLogId(null)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {historyLoading ? (
              <div className="py-12 flex justify-center">
                <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
              </div>
            ) : historyList.length === 0 ? (
              <p className="text-center py-8 text-slate-400 text-sm">Tidak ada riwayat perubahan.</p>
            ) : (
              <div className="space-y-3">
                {historyList.map((h, idx) => (
                  <div key={h.id || idx} className="bg-slate-50 border border-slate-200/60 rounded-2xl p-4 space-y-2 text-xs">
                    <div className="flex items-center justify-between text-slate-500 font-semibold">
                      <span>Perubahan #{historyList.length - idx}</span>
                      <span>{h.changedAt?.toDate ? h.changedAt.toDate().toLocaleString('id-ID') : 'Beberapa saat lalu'}</span>
                    </div>
                    <div className="bg-white p-3 rounded-xl border border-slate-200/60 space-y-1">
                      <div className="font-bold text-slate-800">
                        Juz {h.juz} • {h.surahName} (Ayat {h.ayat})
                      </div>
                      <div className="text-slate-500">Tanggal bacaan: {h.readDate}</div>
                      {h.note && <div className="italic text-slate-600">&ldquo;{h.note}&rdquo;</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
