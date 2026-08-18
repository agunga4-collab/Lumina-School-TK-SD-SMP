import * as React from "react";
import { useAuth } from "../../context/AuthContext";
import { useAcademicYear } from "../../context/AcademicYearContext";
import { getClasses, getActiveStudents } from "../../lib/firebase";
import { Class, Student } from "../../types";
import {
  collection,
  query,
  where,
  getDocs,
  setDoc,
  doc,
  deleteDoc,
  Timestamp,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { toast } from "sonner";
import {
  MessageSquare,
  Mic,
  MicOff,
  Save,
  Trash2,
  Plus,
  Calendar,
  ChevronDown,
  Loader2,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Clock,
  ArrowRight,
  Info
} from "lucide-react";
import { isTeacherAssignedToClass } from "../../services/classTeacherAssignmentService";

enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: db ? "" : null, // auth.currentUser is not directly exported in some variations, we check local context if needed
    },
    operationType,
    path,
  };
  console.error("Firestore Error: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

const getInitials = (name: string) => {
  if (!name) return "";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
};

interface AnecdoteRow {
  rowId: string; // Document ID from Firestore, or temporary draft ID
  studentId: string;
  studentName: string;
  time: string;
  activityContext: string;
  anecdote: string;
  followUp: string;
  isDraft: boolean;
  status: "UNSAVED" | "SAVING" | "SAVED" | "FAILED";
  createdAt?: Timestamp;
  originalData?: {
    time: string;
    activityContext: string;
    anecdote: string;
    followUp: string;
    createdAt?: Timestamp;
  };
}

export default function ClassAnecdotePage() {
  const { profile } = useAuth();
  const { activeYear } = useAcademicYear();

  // Access checks
  const isElementaryTeacher =
    profile &&
    ["TEACHER", "HOMEROOM_TEACHER", "BK_MENTOR"].includes(profile.role) &&
    profile.unitId === "ELEMENTARY";
  const isElementaryHead = profile && profile.role === "HEAD_UNIT" && profile.unitId === "ELEMENTARY";
  const isSuperAdmin = profile && profile.role === "SUPER_ADMIN";
  const isAuthorized = isSuperAdmin || isElementaryHead || isElementaryTeacher;
  const canWrite = isSuperAdmin || isElementaryHead || isElementaryTeacher;

  // Local state
  const [classes, setClasses] = React.useState<Class[]>([]);
  const [selectedClass, setSelectedClass] = React.useState<Class | null>(null);
  const [students, setStudents] = React.useState<Student[]>([]);
  const [selectedDate, setSelectedDate] = React.useState<string>(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  });

  const [rows, setRows] = React.useState<AnecdoteRow[]>([]);
  const [loadingClasses, setLoadingClasses] = React.useState(true);
  const [loadingStudents, setLoadingStudents] = React.useState(false);
  const [loadingAnecdotes, setLoadingAnecdotes] = React.useState(false);
  const [savingAll, setSavingAll] = React.useState(false);

  // Modal State for custom/extra additions
  const [showAddModal, setShowAddModal] = React.useState(false);
  const [modalStudentId, setModalStudentId] = React.useState("");
  const [modalStudentName, setModalStudentName] = React.useState("");
  const [modalStudentLocked, setModalStudentLocked] = React.useState(false);
  const [modalTime, setModalTime] = React.useState("");
  const [modalActivity, setModalActivity] = React.useState("");
  const [modalAnecdote, setModalAnecdote] = React.useState("");
  const [modalFollowUp, setModalFollowUp] = React.useState("");
  const [isEditingNote, setIsEditingNote] = React.useState(false);
  const [currentEditingRowId, setCurrentEditingRowId] = React.useState<string | null>(null);
  const [modalSaving, setModalSaving] = React.useState(false);
  const [expandedNotes, setExpandedNotes] = React.useState<Record<string, boolean>>({});

  const toggleExpandNote = (rowId: string) => {
    setExpandedNotes((prev) => ({ ...prev, [rowId]: !prev[rowId] }));
  };

  // Speech Recognition tracking
  const [recordingRowId, setRecordingRowId] = React.useState<string | null>(null);
  const [modalRecording, setModalRecording] = React.useState(false);
  const recognitionRef = React.useRef<any>(null);

  // Speech-to-Text dynamic states and refs for preventing stale closures
  const [sttBaseText, _setSttBaseText] = React.useState("");
  const [sttFinalTranscript, _setSttFinalTranscript] = React.useState("");
  const [sttInterimText, _setSttInterimText] = React.useState("");

  const sttBaseTextRef = React.useRef("");
  const sttFinalTranscriptRef = React.useRef("");
  const sttInterimTextRef = React.useRef("");

  const setSttBaseText = (val: string) => {
    _setSttBaseText(val);
    sttBaseTextRef.current = val;
  };

  const setSttFinalTranscript = (val: string | ((prev: string) => string)) => {
    if (typeof val === "function") {
      _setSttFinalTranscript((prev) => {
        const next = val(prev);
        sttFinalTranscriptRef.current = next;
        return next;
      });
    } else {
      _setSttFinalTranscript(val);
      sttFinalTranscriptRef.current = val;
    }
  };

  const setSttInterimText = (val: string) => {
    _setSttInterimText(val);
    sttInterimTextRef.current = val;
  };

  // Helper to resolve current local time as HH.MM string
  const getCurrentLocalTime = () => {
    const now = new Date();
    const hrs = String(now.getHours()).padStart(2, "0");
    const mins = String(now.getMinutes()).padStart(2, "0");
    return `${hrs}.${mins}`;
  };

  // Load classes
  React.useEffect(() => {
    const loadClassesData = async () => {
      if (!profile || !activeYear) return;
      try {
        setLoadingClasses(true);
        const allClasses = await getClasses() || [];
        // Filter: Elementary, active, matching year
        let filtered = allClasses.filter(
          (c) => c.unitId === "ELEMENTARY" && c.status !== "archived" && c.academicYear === activeYear
        );

        if (!isSuperAdmin && !isElementaryHead) {
          // Standard teachers only see their assigned classes
          filtered = filtered.filter((c) => isTeacherAssignedToClass(c, profile.uid));
        }

        setClasses(filtered);
        if (filtered.length > 0) {
          setSelectedClass(filtered[0]);
        }
      } catch (err) {
        console.error("Failed to load classes for anecdotes:", err);
        toast.error("Gagal memuat daftar kelas.");
      } finally {
        setLoadingClasses(false);
      }
    };
    loadClassesData();
  }, [profile, activeYear]);

  // Load students and matching saved anecdotes
  const loadClassData = async () => {
    if (!selectedClass || !activeYear) return;
    try {
      setLoadingStudents(true);
      setLoadingAnecdotes(true);

      // 1. Get student roster
      const roster = await getActiveStudents(selectedClass.id, activeYear) || [];
      setStudents(roster);

      // 2. Load Firestore Anecdotes for this class and date
      // Convert selected date string to start and end of day Timestamps
      const start = new Date(`${selectedDate}T00:00:00`);
      const end = new Date(`${selectedDate}T23:59:59.999`);

      const collectionPath = "class_anecdotes";
      const q = query(
        collection(db, collectionPath),
        where("classId", "==", selectedClass.id),
        where("academicYearId", "==", activeYear),
        where("date", ">=", Timestamp.fromDate(start)),
        where("date", "<=", Timestamp.fromDate(end))
      );

      const snapshot = await getDocs(q);
      const savedDocs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as any[];

      // 3. Reconstruct rows
      const initialRows: AnecdoteRow[] = [];

      // Look at saved local drafts from localStorage to persist unsaved work
      const localDraftKey = `anecdote_drafts_${selectedClass.id}_${selectedDate}`;
      const savedLocalDraftsStr = localStorage.getItem(localDraftKey);
      const localDrafts: any[] = savedLocalDraftsStr ? JSON.parse(savedLocalDraftsStr) : [];

      roster.forEach((student) => {
        // Find saved anecdotes for this student
        const studentSaved = savedDocs.filter((d) => d.studentId === student.id);

        if (studentSaved.length > 0) {
          studentSaved.forEach((saved) => {
            // Check if there is a newer local draft matching this rowId
            const matchingLocal = localDrafts.find((ld) => ld.rowId === saved.id);
            const timeVal = matchingLocal ? matchingLocal.time : saved.time || getCurrentLocalTime();
            const activityVal = matchingLocal ? matchingLocal.activityContext : saved.activityContext || "";
            const anecdoteVal = matchingLocal ? matchingLocal.anecdote : saved.anecdote || "";
            const followUpVal = matchingLocal ? matchingLocal.followUp : saved.followUp || "";

            const isModified =
              timeVal !== saved.time ||
              activityVal !== (saved.activityContext || "") ||
              anecdoteVal !== (saved.anecdote || "") ||
              followUpVal !== (saved.followUp || "");

            initialRows.push({
              rowId: saved.id,
              studentId: student.id,
              studentName: student.name,
              time: timeVal,
              activityContext: activityVal,
              anecdote: anecdoteVal,
              followUp: followUpVal,
              isDraft: false,
              status: isModified ? "UNSAVED" : "SAVED",
              createdAt: saved.createdAt,
              originalData: {
                time: saved.time || "",
                activityContext: saved.activityContext || "",
                anecdote: saved.anecdote || "",
                followUp: saved.followUp || "",
                createdAt: saved.createdAt,
              },
            });
          });
        } else {
          // If no saved doc, see if we have an unsaved draft from localStorage
          const studentDrafts = localDrafts.filter((ld) => ld.studentId === student.id && ld.isDraft);

          if (studentDrafts.length > 0) {
            studentDrafts.forEach((draft) => {
              initialRows.push({
                rowId: draft.rowId,
                studentId: student.id,
                studentName: student.name,
                time: draft.time,
                activityContext: draft.activityContext,
                anecdote: draft.anecdote,
                followUp: draft.followUp,
                isDraft: true,
                status: "UNSAVED",
              });
            });
          } else {
            // Fallback: render a single empty blank row for the student
            initialRows.push({
              rowId: `draft_${student.id}_0`,
              studentId: student.id,
              studentName: student.name,
              time: getCurrentLocalTime(),
              activityContext: "",
              anecdote: "",
              followUp: "",
              isDraft: true,
              status: "UNSAVED",
            });
          }
        }
      });

      setRows(initialRows);
    } catch (err) {
      console.error("Failed to load anecdotes:", err);
      toast.error("Gagal memuat catatan anekdot.");
    } finally {
      setLoadingStudents(false);
      setLoadingAnecdotes(false);
    }
  };

  React.useEffect(() => {
    loadClassData();
    // Stop recording when date/class changes
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setRecordingRowId(null);
    }
  }, [selectedClass, selectedDate, activeYear]);

  // Persist unsaved drafts to localStorage
  const saveDraftsToLocal = (updatedRows: AnecdoteRow[]) => {
    if (!selectedClass) return;
    const localDraftKey = `anecdote_drafts_${selectedClass.id}_${selectedDate}`;
    // We only need to save rows that are UNSAVED or are drafts
    const draftsToSave = updatedRows
      .filter((r) => r.status === "UNSAVED" || r.isDraft)
      .map((r) => ({
        rowId: r.rowId,
        studentId: r.studentId,
        studentName: r.studentName,
        time: r.time,
        activityContext: r.activityContext,
        anecdote: r.anecdote,
        followUp: r.followUp,
        isDraft: r.isDraft,
      }));

    if (draftsToSave.length > 0) {
      localStorage.setItem(localDraftKey, JSON.stringify(draftsToSave));
    } else {
      localStorage.removeItem(localDraftKey);
    }
  };

  // Handle single cell input changes
  const handleInputChange = (rowId: string, field: keyof AnecdoteRow, value: string) => {
    if (!canWrite) return;
    setRows((prevRows) => {
      const updated = prevRows.map((r) => {
        if (r.rowId === rowId) {
          const updatedRow = { ...r, [field]: value };
          // Determine status
          if (!updatedRow.isDraft && updatedRow.originalData) {
            const hasChanged =
              updatedRow.time !== updatedRow.originalData.time ||
              updatedRow.activityContext !== updatedRow.originalData.activityContext ||
              updatedRow.anecdote !== updatedRow.originalData.anecdote ||
              updatedRow.followUp !== updatedRow.originalData.followUp;
            updatedRow.status = hasChanged ? "UNSAVED" : "SAVED";
          } else {
            updatedRow.status = "UNSAVED";
          }
          return updatedRow;
        }
        return r;
      });
      saveDraftsToLocal(updated);
      return updated;
    });
  };

  // Toggle Speech to Text
  const handleToggleSpeech = (rowId: string) => {
    if (!canWrite) return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error("Browser Anda tidak mendukung Speech-to-Text. Silakan gunakan Google Chrome.");
      return;
    }

    if (recordingRowId === rowId) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    } else {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }

      try {
        const rec = new SpeechRecognition();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = "id-ID";

        const currentRow = rows.find(r => r.rowId === rowId);
        const initialText = currentRow?.anecdote || "";
        setSttBaseText(initialText);
        setSttFinalTranscript("");
        setSttInterimText("");

        rec.onstart = () => {
          setRecordingRowId(rowId);
          toast.info("Mulai mendengarkan... Berbicaralah dalam Bahasa Indonesia.");
        };

        rec.onresult = (event: any) => {
          let finalPart = "";
          let interimPart = "";

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalPart += transcript;
            } else {
              interimPart += transcript;
            }
          }

          if (finalPart) {
            setSttFinalTranscript((prev) => prev + " " + finalPart);
          }
          setSttInterimText(interimPart);
        };

        rec.onerror = (event: any) => {
          console.error("Speech recognition error:", event);
          toast.error(`Error Speech-to-Text: ${event.error || "Izin mikrofon ditolak"}`);
          setRecordingRowId(null);
        };

        rec.onend = () => {
          setRecordingRowId(null);
          const completedText = `${sttBaseTextRef.current} ${sttFinalTranscriptRef.current}`.replace(/\s+/g, " ").trim();
          
          setRows((prevRows) => {
            const updated = prevRows.map((r) => {
              if (r.rowId === rowId) {
                return { ...r, anecdote: completedText, status: "UNSAVED" };
              }
              return r;
            });
            saveDraftsToLocal(updated);
            return updated;
          });

          // Reset STT states
          setSttBaseText("");
          setSttFinalTranscript("");
          setSttInterimText("");
        };

        recognitionRef.current = rec;
        rec.start();
      } catch (err) {
        console.error("Failed to start speech recognition:", err);
        toast.error("Gagal mengaktifkan mikrofon.");
        setRecordingRowId(null);
      }
    }
  };

  // Modal Speech to Text
  const handleToggleModalSpeech = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error("Browser Anda tidak mendukung Speech-to-Text.");
      return;
    }

    if (modalRecording) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    } else {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }

      try {
        const rec = new SpeechRecognition();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = "id-ID";

        setSttBaseText(modalAnecdote || "");
        setSttFinalTranscript("");
        setSttInterimText("");

        rec.onstart = () => {
          setModalRecording(true);
          toast.info("Mendengarkan...");
        };

        rec.onresult = (event: any) => {
          let finalPart = "";
          let interimPart = "";

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalPart += transcript;
            } else {
              interimPart += transcript;
            }
          }

          if (finalPart) {
            setSttFinalTranscript((prev) => prev + " " + finalPart);
          }
          setSttInterimText(interimPart);
        };

        rec.onerror = (event: any) => {
          console.error("Modal speech error:", event);
          toast.error(`Error Speech-to-Text: ${event.error || "Izin mikrofon ditolak"}`);
          setModalRecording(false);
        };

        rec.onend = () => {
          setModalRecording(false);
          const completedText = `${sttBaseTextRef.current} ${sttFinalTranscriptRef.current}`.replace(/\s+/g, " ").trim();
          setModalAnecdote(completedText);
          
          setSttBaseText("");
          setSttFinalTranscript("");
          setSttInterimText("");
        };

        recognitionRef.current = rec;
        rec.start();
      } catch (err) {
        console.error("Modal speech start fail:", err);
        setModalRecording(false);
      }
    }
  };

  // Save a single row to Firestore
  const saveRow = async (rowId: string) => {
    if (!selectedClass || !profile) return;
    const row = rows.find((r) => r.rowId === rowId);
    if (!row) return;

    // Validation: Anecdote and time must be entered
    if (!row.anecdote.trim()) {
      toast.error(`Catatan anekdot untuk ${row.studentName} masih kosong.`);
      return;
    }
    if (!row.time.trim()) {
      toast.error(`Waktu untuk ${row.studentName} harus diisi.`);
      return;
    }
    if (!row.activityContext.trim()) {
      toast.error(`Aktivitas/Konteks untuk ${row.studentName} harus diisi.`);
      return;
    }

    // Set row to saving state
    setRows((prev) =>
      prev.map((r) => (r.rowId === rowId ? { ...r, status: "SAVING" } : r))
    );

    try {
      const isDraftRow = row.isDraft || row.rowId.startsWith("draft_");
      // Determine target document ID
      const finalDocId = isDraftRow
        ? `anecdote_${selectedClass.id}_${row.studentId}_${Date.now()}`
        : row.rowId;

      const docRef = doc(db, "class_anecdotes", finalDocId);

      // Parse the local date string to midnight Timestamp
      const observationDate = Timestamp.fromDate(new Date(`${selectedDate}T00:00:00`));

      const payload = {
        studentId: row.studentId,
        studentName: row.studentName,
        classId: selectedClass.id,
        className: selectedClass.name,
        unit: "ELEMENTARY",
        academicYearId: activeYear,
        date: observationDate,
        time: row.time.trim(),
        activityContext: row.activityContext.trim(),
        anecdote: row.anecdote.trim(),
        followUp: row.followUp.trim() || null,
        createdBy: {
          uid: profile.uid,
          name: profile.displayName || profile.email,
          role: profile.role,
        },
        createdAt: isDraftRow ? serverTimestamp() : (row.createdAt || serverTimestamp()),
        updatedAt: serverTimestamp(),
      };

      await setDoc(docRef, payload);

      setRows((prev) =>
        prev.map((r) => {
          if (r.rowId === rowId) {
            return {
              ...r,
              rowId: finalDocId,
              isDraft: false,
              status: "SAVED",
              createdAt: r.createdAt || Timestamp.now(),
              originalData: {
                time: payload.time,
                activityContext: payload.activityContext,
                anecdote: payload.anecdote,
                followUp: payload.followUp || "",
                createdAt: r.createdAt || Timestamp.now(),
              },
            };
          }
          return r;
        })
      );

      // Refresh local drafts storage
      setTimeout(() => {
        setRows((currentRows) => {
          saveDraftsToLocal(currentRows);
          return currentRows;
        });
      }, 50);

      toast.success(`Catatan untuk ${row.studentName} berhasil disimpan.`);
    } catch (err) {
      console.error("Failed to save row:", err);
      setRows((prev) =>
        prev.map((r) => (r.rowId === rowId ? { ...r, status: "FAILED" } : r))
      );
      toast.error(`Gagal menyimpan catatan untuk ${row.studentName}.`);
      handleFirestoreError(err, OperationType.WRITE, `class_anecdotes/${rowId}`);
    }
  };

  // Save all unsaved rows
  const saveAllUnsaved = async () => {
    const unsavedRows = rows.filter((r) => r.status === "UNSAVED");
    if (unsavedRows.length === 0) {
      toast.info("Semua perubahan sudah tersimpan.");
      return;
    }

    setSavingAll(true);
    let successCount = 0;
    let failCount = 0;

    for (const r of unsavedRows) {
      const isDraftRow = r.isDraft || r.rowId.startsWith("draft_");
      // Basic validations per row
      if (!r.anecdote.trim() || !r.time.trim() || !r.activityContext.trim()) {
        // Skip entirely empty row if it's draft, otherwise fail it
        if (isDraftRow && !r.anecdote.trim() && !r.activityContext.trim()) {
          continue;
        }
        failCount++;
        setRows((prev) =>
          prev.map((row) => (row.rowId === r.rowId ? { ...row, status: "FAILED" } : row))
        );
        continue;
      }

      try {
        const finalDocId = isDraftRow
          ? `anecdote_${selectedClass!.id}_${r.studentId}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`
          : r.rowId;

        const docRef = doc(db, "class_anecdotes", finalDocId);
        const observationDate = Timestamp.fromDate(new Date(`${selectedDate}T00:00:00`));

        const payload = {
          studentId: r.studentId,
          studentName: r.studentName,
          classId: selectedClass!.id,
          className: selectedClass!.name,
          unit: "ELEMENTARY",
          academicYearId: activeYear,
          date: observationDate,
          time: r.time.trim(),
          activityContext: r.activityContext.trim(),
          anecdote: r.anecdote.trim(),
          followUp: r.followUp.trim() || null,
          createdBy: {
            uid: profile!.uid,
            name: profile!.displayName || profile!.email,
            role: profile!.role,
          },
          createdAt: isDraftRow ? serverTimestamp() : (r.createdAt || serverTimestamp()),
          updatedAt: serverTimestamp(),
        };

        await setDoc(docRef, payload);
        successCount++;

        setRows((prev) =>
          prev.map((row) => {
            if (row.rowId === r.rowId) {
              return {
                ...row,
                rowId: finalDocId,
                isDraft: false,
                status: "SAVED",
                createdAt: r.createdAt || Timestamp.now(),
                originalData: {
                  time: payload.time,
                  activityContext: payload.activityContext,
                  anecdote: payload.anecdote,
                  followUp: payload.followUp || "",
                  createdAt: r.createdAt || Timestamp.now(),
                },
              };
            }
            return row;
          })
        );
      } catch (err) {
        console.error("Bulk save item error:", err);
        failCount++;
        setRows((prev) =>
          prev.map((row) => (row.rowId === r.rowId ? { ...row, status: "FAILED" } : row))
        );
      }
    }

    setSavingAll(false);

    // Refresh local storage drafts
    setRows((currentRows) => {
      saveDraftsToLocal(currentRows);
      return currentRows;
    });

    if (successCount > 0) {
      toast.success(`${successCount} catatan berhasil disimpan.`);
    }
    if (failCount > 0) {
      toast.error(`${failCount} catatan gagal disimpan. Silakan periksa kembali.`);
    }
  };

  // Delete/Clear anecdote row
  const handleDeleteRow = async (row: AnecdoteRow) => {
    if (!canWrite) return;
    if (!window.confirm(`Apakah Anda yakin ingin menghapus catatan anekdot untuk ${row.studentName}?`)) {
      return;
    }

    try {
      if (!row.isDraft) {
        // Delete from Firestore
        await deleteDoc(doc(db, "class_anecdotes", row.rowId));
        toast.success(`Catatan untuk ${row.studentName} berhasil dihapus.`);
      }

      // Check if student has other rows remaining
      const otherStudentRows = rows.filter((r) => r.studentId === row.studentId && r.rowId !== row.rowId);

      if (otherStudentRows.length > 0) {
        // Just remove this extra row from state
        setRows((prev) => {
          const updated = prev.filter((r) => r.rowId !== row.rowId);
          saveDraftsToLocal(updated);
          return updated;
        });
      } else {
        // If it was the only row, revert/reset it to a single empty draft row
        setRows((prev) => {
          const updated = prev.map((r) => {
            if (r.rowId === row.rowId) {
              return {
                rowId: `draft_${row.studentId}_0`,
                studentId: row.studentId,
                studentName: row.studentName,
                time: getCurrentLocalTime(),
                activityContext: "",
                anecdote: "",
                followUp: "",
                isDraft: true,
                status: "UNSAVED" as const,
              };
            }
            return r;
          });
          saveDraftsToLocal(updated);
          return updated;
        });
      }
    } catch (err) {
      console.error("Delete failed:", err);
      toast.error("Gagal menghapus catatan.");
      handleFirestoreError(err, OperationType.DELETE, `class_anecdotes/${row.rowId}`);
    }
  };

  // Modal manual note addition
  const openAddNoteModal = (studentId?: string) => {
    if (students.length === 0) {
      toast.warning("Daftar siswa kosong atau kelas belum dipilih.");
      return;
    }

    if (studentId) {
      const student = students.find((s) => s.id === studentId);
      if (student) {
        setModalStudentId(student.id);
        setModalStudentName(student.name);
        setModalStudentLocked(true);
      }
    } else {
      setModalStudentId(students[0].id);
      setModalStudentName(students[0].name);
      setModalStudentLocked(false);
    }

    setModalTime(getCurrentLocalTime());
    setModalActivity("");
    setModalAnecdote("");
    setModalFollowUp("");
    setIsEditingNote(false);
    setCurrentEditingRowId(null);
    setShowAddModal(true);
  };

  const openEditNoteModal = (row: AnecdoteRow) => {
    setModalStudentId(row.studentId);
    setModalStudentName(row.studentName);
    setModalStudentLocked(true);
    setModalTime(row.time);
    setModalActivity(row.activityContext);
    setModalAnecdote(row.anecdote);
    setModalFollowUp(row.followUp);
    setIsEditingNote(true);
    setCurrentEditingRowId(row.rowId);
    setShowAddModal(true);
  };

  const handleSaveFromModal = async () => {
    if (!modalStudentId || !selectedClass || !profile) return;
    const student = students.find((s) => s.id === modalStudentId);
    const sName = student ? student.name : modalStudentName;

    if (!modalAnecdote.trim()) {
      toast.error("Catatan anekdot wajib diisi.");
      return;
    }
    if (!modalTime.trim()) {
      toast.error("Waktu wajib diisi.");
      return;
    }
    if (!modalActivity.trim()) {
      toast.error("Aktivitas/Konteks wajib diisi.");
      return;
    }

    setModalSaving(true);
    try {
      const isDraftRow = !currentEditingRowId || currentEditingRowId.startsWith("draft_");
      const finalDocId = isEditingNote && !isDraftRow
        ? currentEditingRowId!
        : `anecdote_${selectedClass.id}_${modalStudentId}_${Date.now()}`;

      const docRef = doc(db, "class_anecdotes", finalDocId);
      const observationDate = Timestamp.fromDate(new Date(`${selectedDate}T00:00:00`));

      const payload = {
        studentId: modalStudentId,
        studentName: sName,
        classId: selectedClass.id,
        className: selectedClass.name,
        unit: "ELEMENTARY",
        academicYearId: activeYear,
        date: observationDate,
        time: modalTime.trim(),
        activityContext: modalActivity.trim(),
        anecdote: modalAnecdote.trim(),
        followUp: modalFollowUp.trim() || null,
        createdBy: {
          uid: profile.uid,
          name: profile.displayName || profile.email,
          role: profile.role,
        },
        createdAt: (isEditingNote && !isDraftRow) ? (rows.find(r => r.rowId === finalDocId)?.createdAt || serverTimestamp()) : serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await setDoc(docRef, payload);

      const updatedRow: AnecdoteRow = {
        rowId: finalDocId,
        studentId: modalStudentId,
        studentName: sName,
        time: payload.time,
        activityContext: payload.activityContext,
        anecdote: payload.anecdote,
        followUp: payload.followUp || "",
        isDraft: false,
        status: "SAVED",
        createdAt: Timestamp.now(),
        originalData: {
          time: payload.time,
          activityContext: payload.activityContext,
          anecdote: payload.anecdote,
          followUp: payload.followUp || "",
          createdAt: Timestamp.now(),
        }
      };

      setRows((prev) => {
        let nextRows: AnecdoteRow[];
        if (isEditingNote && !isDraftRow) {
          nextRows = prev.map((r) => (r.rowId === currentEditingRowId ? updatedRow : r));
        } else {
          const filteredPrev = prev.filter(
            (r) => !(r.studentId === modalStudentId && r.isDraft && !r.anecdote.trim() && !r.activityContext.trim())
          );
          nextRows = [...filteredPrev, updatedRow];
        }
        saveDraftsToLocal(nextRows);
        return nextRows;
      });

      setShowAddModal(false);
      toast.success(isEditingNote ? `Catatan untuk ${sName} berhasil diperbarui.` : `Catatan baru untuk ${sName} berhasil disimpan.`);
    } catch (err) {
      console.error("Modal save failed:", err);
      toast.error("Gagal menyimpan catatan.");
    } finally {
      setModalSaving(false);
    }
  };

  // Unauthorized screen
  if (!isAuthorized) {
    return (
      <div className="max-w-xl mx-auto my-16 p-8 bg-white rounded-2xl border border-slate-100 shadow-sm text-center space-y-6" id="auth-unauthorized-wrapper">
        <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto" id="unauth-icon-container">
          <AlertCircle size={32} />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-black text-slate-800 uppercase tracking-wide">
            Akses Terbatas
          </h2>
          <p className="text-slate-500 text-sm">
            Maaf, halaman ini hanya dapat diakses oleh Guru Unit Elementary, Kepala SD, atau Admin.
          </p>
        </div>
      </div>
    );
  }

  // Row render status badges
  const renderStatusBadge = (status: AnecdoteRow["status"]) => {
    switch (status) {
      case "SAVED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full">
            <CheckCircle2 size={12} />
            Tersimpan
          </span>
        );
      case "SAVING":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-100 rounded-full animate-pulse">
            <Loader2 size={12} className="animate-spin" />
            Menyimpan...
          </span>
        );
      case "FAILED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-100 rounded-full">
            <AlertCircle size={12} />
            Gagal
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-100 rounded-full">
            <Info size={12} />
            Belum Disimpan
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto px-4 py-6" id="class-anecdote-page-wrapper">
      {/* Top Header Card */}
      <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
              <MessageSquare size={24} />
            </div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              Anekdot Kelas
            </h1>
          </div>
          <p className="text-sm text-slate-500 max-w-xl">
            Catat observasi singkat, peristiwa penting, dan tindak lanjut perkembangan siswa di kelas secara langsung atau menggunakan transkripsi suara.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {canWrite && (
            <button
              onClick={() => openAddNoteModal()}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl shadow-sm hover:shadow transition-all w-full sm:w-auto"
              id="btn-add-anecdote"
            >
              <Plus size={18} />
              Tambah Catatan
            </button>
          )}
        </div>
      </div>

      {/* Filter and Config Bar */}
      <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex flex-col sm:flex-row flex-wrap items-center gap-4">
        {/* Class Filter */}
        <div className="flex flex-col gap-1 w-full sm:w-64">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Kelas Aktif
          </label>
          <div className="relative">
            {loadingClasses ? (
              <div className="h-10 px-3 bg-white border border-slate-200 rounded-xl flex items-center justify-center text-xs text-slate-400">
                <Loader2 size={16} className="animate-spin mr-2" />
                Memuat kelas...
              </div>
            ) : (
              <select
                value={selectedClass?.id || ""}
                onChange={(e) => {
                  const match = classes.find((c) => c.id === e.target.value);
                  if (match) setSelectedClass(match);
                }}
                className="w-full h-10 pl-3 pr-10 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all appearance-none cursor-pointer"
                id="select-class-filter"
              >
                {classes.length === 0 ? (
                  <option value="">Tidak ada kelas diampu</option>
                ) : (
                  classes.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.name} ({cls.academicYear})
                    </option>
                  ))
                )}
              </select>
            )}
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400">
              <ChevronDown size={16} />
            </div>
          </div>
        </div>

        {/* Date Filter */}
        <div className="flex flex-col gap-1 w-full sm:w-48">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Tanggal Observasi
          </label>
          <div className="relative">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full h-10 px-3 pr-10 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all cursor-pointer"
              id="input-date-filter"
            />
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400">
              <Calendar size={16} />
            </div>
          </div>
        </div>

        {/* Info/Stats Summary */}
        <div className="sm:ml-auto flex items-center gap-4 bg-white border border-slate-200/60 rounded-xl px-4 py-2 shadow-xs self-stretch sm:self-auto justify-between sm:justify-start">
          <div className="text-center sm:text-left">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Siswa</p>
            <p className="text-lg font-black text-slate-800">{students.length}</p>
          </div>
          <div className="h-8 w-px bg-slate-100 hidden sm:block"></div>
          <div className="text-center sm:text-left">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tercatat</p>
            <p className="text-lg font-black text-emerald-600">
              {rows.filter((r) => !r.isDraft && r.status === "SAVED").length}
            </p>
          </div>
          <div className="h-8 w-px bg-slate-100 hidden sm:block"></div>
          <div className="text-center sm:text-left">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Belum Simpan</p>
            <p className="text-lg font-black text-amber-500">
              {rows.filter((r) => r.status === "UNSAVED").length}
            </p>
          </div>
        </div>
      </div>

      {/* Main Roster & Anecdotes Container */}
      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden" id="anecdotes-container">
        {loadingStudents || loadingAnecdotes ? (
          <div className="py-24 flex flex-col items-center justify-center gap-3 text-slate-400" id="loading-spinner">
            <Loader2 className="animate-spin text-indigo-500" size={32} />
            <p className="text-sm font-semibold">Memuat data observasi kelas...</p>
          </div>
        ) : students.length === 0 ? (
          <div className="py-16 text-center text-slate-400 space-y-2" id="empty-students">
            <Info size={32} className="mx-auto text-slate-300" />
            <p className="text-sm font-semibold">Tidak ada siswa aktif ditemukan di kelas ini.</p>
          </div>
        ) : (
          <div>
            {/* DESKTOP VIEW (Visible on md and larger) */}
            <div className="hidden md:block overflow-x-auto" id="desktop-view">
              <table className="w-full text-left border-collapse table-auto min-w-[1000px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-[11px] font-black text-slate-500 uppercase tracking-wider">
                    <th className="py-4 px-6 text-center w-16">No</th>
                    <th className="py-4 px-6 w-72">Siswa</th>
                    <th className="py-4 px-6">Daftar Catatan Anekdot (Hari Ini)</th>
                    <th className="py-4 px-6 text-center w-48">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {students.map((student, index) => {
                    const studentNotes = rows.filter(
                      (r) =>
                        r.studentId === student.id &&
                        !(r.isDraft && !r.anecdote.trim() && !r.activityContext.trim())
                    );

                    return (
                      <tr
                        key={student.id}
                        className="hover:bg-slate-50/20 transition-colors align-top"
                        id={`desktop-student-row-${student.id}`}
                      >
                        {/* No */}
                        <td className="py-6 px-6 text-center font-bold text-slate-400">
                          {index + 1}
                        </td>

                        {/* Student Info & Badge */}
                        <td className="py-6 px-6 space-y-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-sm shrink-0">
                              {getInitials(student.name)}
                            </div>
                            <div>
                              <div className="font-extrabold text-slate-900 text-sm leading-snug">
                                {student.name}
                              </div>
                              <p className="text-xs text-slate-400 mt-0.5">
                                NISN: {student.nisn || "-"}
                              </p>
                            </div>
                          </div>

                          <div>
                            {studentNotes.length > 0 ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-full shadow-xs">
                                {studentNotes.length} Catatan
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-slate-400 bg-slate-50 border border-slate-100 rounded-full">
                                Belum ada catatan
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Stacked Notes Column */}
                        <td className="py-6 px-6">
                          {studentNotes.length === 0 ? (
                            <div className="text-slate-400 italic text-sm py-2">
                              Belum ada catatan observasi untuk hari ini.
                            </div>
                          ) : (
                            <div className="space-y-4">
                              {studentNotes.map((note) => {
                                const isExpanded = !!expandedNotes[note.rowId];
                                const isLongText = note.anecdote.length > 180;
                                return (
                                  <div
                                    key={note.rowId}
                                    className="bg-slate-50/50 border border-slate-100 rounded-2xl p-4 space-y-3 relative hover:bg-slate-50 hover:border-slate-200 transition-all shadow-xs"
                                    id={`desktop-note-card-${note.rowId}`}
                                  >
                                    <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                                      <div className="flex items-center gap-2">
                                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-full">
                                          <Clock size={12} className="text-indigo-500" />
                                          {note.time}
                                        </span>
                                        {renderStatusBadge(note.status)}
                                      </div>
                                      
                                      <div className="flex items-center gap-1.5">
                                        {canWrite && (
                                          <>
                                            <button
                                              onClick={() => openEditNoteModal(note)}
                                              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-white border border-transparent hover:border-slate-100 rounded-xl transition-all shadow-xs"
                                              title="Edit Catatan"
                                              id={`btn-edit-note-desktop-${note.rowId}`}
                                            >
                                              <Save size={13} className="text-indigo-600" />
                                            </button>
                                            <button
                                              onClick={() => handleDeleteRow(note)}
                                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-white border border-transparent hover:border-slate-100 rounded-xl transition-all shadow-xs"
                                              title="Hapus Catatan"
                                              id={`btn-delete-note-desktop-${note.rowId}`}
                                            >
                                              <Trash2 size={13} className="text-rose-500" />
                                            </button>
                                          </>
                                        )}
                                      </div>
                                    </div>

                                    <div className="text-sm space-y-2 text-slate-700">
                                      <div>
                                        <span className="font-extrabold text-slate-400 text-[10px] uppercase tracking-wider block sm:inline mr-2">
                                          Konteks:
                                        </span>
                                        <span className="font-semibold text-slate-800">
                                          {note.activityContext}
                                        </span>
                                      </div>

                                      <div>
                                        <span className="font-extrabold text-slate-400 text-[10px] uppercase tracking-wider block sm:inline mr-2">
                                          Catatan:
                                        </span>
                                        <span className="text-slate-700 leading-relaxed break-words font-medium">
                                          {isLongText && !isExpanded
                                            ? `${note.anecdote.slice(0, 180)}...`
                                            : note.anecdote}
                                        </span>
                                        {isLongText && (
                                          <button
                                            onClick={() => toggleExpandNote(note.rowId)}
                                            className="text-xs font-black text-indigo-600 hover:text-indigo-700 ml-1.5 focus:outline-none"
                                          >
                                            {isExpanded ? "Sembunyikan" : "Lihat selengkapnya"}
                                          </button>
                                        )}
                                      </div>

                                      {note.followUp && (
                                        <div className="bg-amber-50/40 border border-amber-100/60 rounded-xl p-3 mt-2">
                                          <span className="font-extrabold text-amber-800 text-[10px] uppercase tracking-wider block mb-1">
                                            Tindak Lanjut:
                                          </span>
                                          <p className="text-slate-700 font-medium break-words leading-relaxed">
                                            {note.followUp}
                                          </p>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </td>

                        {/* Inline Add Note button */}
                        <td className="py-6 px-6 text-center">
                          {canWrite && (
                            <button
                              onClick={() => openAddNoteModal(student.id)}
                              className="inline-flex items-center gap-1.5 px-3 py-2 border border-indigo-200 hover:border-indigo-300 text-indigo-600 hover:bg-indigo-50 text-xs font-extrabold rounded-xl transition-all cursor-pointer uppercase tracking-wider shadow-xs hover:shadow-md"
                              id={`btn-add-student-note-desktop-${student.id}`}
                            >
                              <Plus size={14} />
                              Catatan
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* MOBILE VIEW (Visible on md and smaller) */}
            <div className="block md:hidden p-4 space-y-4" id="mobile-view">
              {students.map((student) => {
                const studentNotes = rows.filter(
                  (r) =>
                    r.studentId === student.id &&
                    !(r.isDraft && !r.anecdote.trim() && !r.activityContext.trim())
                );

                return (
                  <div
                    key={student.id}
                    className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm space-y-4 hover:border-indigo-100 transition-all"
                    id={`mobile-student-card-${student.id}`}
                  >
                    {/* Header: Avatar, Name, + Add button */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-sm shrink-0">
                          {getInitials(student.name)}
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-800 text-sm leading-snug">
                            {student.name}
                          </h4>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {studentNotes.length > 0 ? `${studentNotes.length} Catatan` : "Belum ada catatan"}
                          </p>
                        </div>
                      </div>

                      {canWrite && (
                        <button
                          onClick={() => openAddNoteModal(student.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 text-indigo-600 rounded-xl text-xs font-bold transition-all uppercase tracking-wider"
                          id={`btn-add-student-note-mobile-${student.id}`}
                        >
                          <Plus size={14} />
                          Catatan
                        </button>
                      )}
                    </div>

                    {/* Stacked Note Cards for Mobile */}
                    {studentNotes.length > 0 && (
                      <div className="space-y-3 pt-3 border-t border-slate-50">
                        {studentNotes.map((note) => {
                          const isExpanded = !!expandedNotes[note.rowId];
                          const isLongText = note.anecdote.length > 100;

                          return (
                            <div
                              key={note.rowId}
                              className="bg-slate-50/50 border border-slate-100 rounded-xl p-3 space-y-2.5"
                              id={`mobile-note-card-${note.rowId}`}
                            >
                              <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                                <div className="flex items-center gap-2">
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-full">
                                    <Clock size={10} />
                                    {note.time}
                                  </span>
                                  {renderStatusBadge(note.status)}
                                </div>

                                <div className="flex items-center gap-1">
                                  {canWrite && (
                                    <>
                                      <button
                                        onClick={() => openEditNoteModal(note)}
                                        className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg transition-all"
                                        title="Edit Catatan"
                                        id={`btn-edit-note-mobile-${note.rowId}`}
                                      >
                                        <Save size={13} className="text-indigo-500" />
                                      </button>
                                      <button
                                        onClick={() => handleDeleteRow(note)}
                                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition-all"
                                        title="Hapus Catatan"
                                        id={`btn-delete-note-mobile-${note.rowId}`}
                                      >
                                        <Trash2 size={13} className="text-rose-500" />
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>

                              <div className="text-xs space-y-1.5 text-slate-700">
                                <div>
                                  <span className="font-extrabold text-slate-400 uppercase tracking-wider text-[10px] mr-2">
                                    Konteks:
                                  </span>
                                  <span className="font-semibold text-slate-800">
                                    {note.activityContext}
                                  </span>
                                </div>

                                <div>
                                  <span className="font-extrabold text-slate-400 uppercase tracking-wider text-[10px] mr-2">
                                    Catatan:
                                  </span>
                                  <span className="text-slate-700 font-medium break-words leading-relaxed">
                                    {isLongText && !isExpanded
                                      ? `${note.anecdote.slice(0, 100)}...`
                                      : note.anecdote}
                                  </span>
                                  {isLongText && (
                                    <button
                                      onClick={() => toggleExpandNote(note.rowId)}
                                      className="text-xs font-black text-indigo-600 hover:text-indigo-700 ml-1 focus:outline-none"
                                    >
                                      {isExpanded ? "Sembunyikan" : "Lihat selengkapnya"}
                                    </button>
                                  )}
                                </div>

                                {note.followUp && (
                                  <div className="bg-amber-50/40 border border-amber-100/50 rounded-xl p-2.5 mt-1">
                                    <span className="font-extrabold text-amber-800 text-[9px] uppercase tracking-wider block mb-0.5">
                                      Tindak Lanjut:
                                    </span>
                                    <span className="text-slate-700 font-medium break-words leading-relaxed">
                                      {note.followUp}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* MANUAL ADD ANECDOTE DIALOG MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in" id="modal-add-anecdote-wrapper">
          <div className="bg-white border border-slate-100 rounded-2xl max-w-2xl w-full shadow-xl overflow-hidden animate-slide-up">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <MessageSquare className="text-indigo-600" size={20} />
                <h3 className="font-extrabold text-slate-900 text-lg">
                  {isEditingNote ? "Edit Catatan Anekdot" : "Tambah Catatan Baru"}
                </h3>
              </div>
              <button
                onClick={() => {
                  if (recognitionRef.current) recognitionRef.current.stop();
                  setShowAddModal(false);
                }}
                className="p-1 rounded-lg hover:bg-slate-200 text-slate-400 transition-colors"
                id="btn-close-modal"
              >
                <Trash2 size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Context Info (Class & Date) */}
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs">
                <div>
                  <span className="text-slate-400 font-bold block uppercase tracking-wider text-[9px]">Kelas</span>
                  <span className="text-slate-700 font-bold">{selectedClass?.name}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-bold block uppercase tracking-wider text-[9px]">Tanggal Observasi</span>
                  <span className="text-slate-700 font-bold">{selectedDate}</span>
                </div>
              </div>

              {/* Student Select */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Pilih Siswa
                </label>
                <select
                  value={modalStudentId}
                  disabled={modalStudentLocked}
                  onChange={(e) => {
                    setModalStudentId(e.target.value);
                    const match = students.find((s) => s.id === e.target.value);
                    if (match) setModalStudentName(match.name);
                  }}
                  className="w-full h-11 px-3 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 rounded-xl text-sm text-slate-700 font-bold bg-white disabled:bg-slate-50 disabled:text-slate-500 cursor-pointer disabled:cursor-not-allowed"
                  id="modal-select-student"
                >
                  {students.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Time */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Waktu
                </label>
                <input
                  type="text"
                  value={modalTime}
                  onChange={(e) => setModalTime(e.target.value)}
                  placeholder="09.15"
                  className="w-full h-11 px-3 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 rounded-xl text-sm text-slate-700 bg-white"
                  id="modal-input-time"
                />
              </div>

              {/* Activity Context */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Aktivitas / Konteks
                </label>
                <input
                  type="text"
                  value={modalActivity}
                  onChange={(e) => setModalActivity(e.target.value)}
                  placeholder="Contoh: Diskusi kelompok, Membaca, Istirahat"
                  className="w-full h-11 px-3 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 rounded-xl text-sm text-slate-700 bg-white"
                  id="modal-input-activity"
                />
              </div>

              {/* Anecdote text area with Mic */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Catatan Anekdot
                  </label>
                  <button
                    onClick={handleToggleModalSpeech}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold shadow-xs transition-all ${
                      modalRecording
                        ? "bg-rose-500 text-white animate-pulse"
                        : "bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
                    }`}
                    id="modal-btn-speech"
                  >
                    {modalRecording ? <MicOff size={12} /> : <Mic size={12} />}
                    {modalRecording ? "Mendengarkan..." : "Bicara (Mic)"}
                  </button>
                </div>
                <textarea
                  value={modalRecording ? `${sttBaseText} ${sttFinalTranscript} ${sttInterimText}`.replace(/\s+/g, " ").trim() : modalAnecdote}
                  onChange={(e) => setModalAnecdote(e.target.value)}
                  placeholder="Tuliskan kejadian faktual, objektif, dan terperinci..."
                  className="w-full min-h-[140px] p-3 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 rounded-xl text-sm text-slate-700 bg-white resize-y leading-relaxed"
                  id="modal-textarea-anecdote"
                />
                {modalRecording && (
                  <div className="space-y-1 mt-1">
                    <p className="text-[10px] text-rose-500 animate-pulse font-semibold">
                      * Berbicaralah sekarang. Suara Anda sedang ditranskripsikan ke dalam draf di atas.
                    </p>
                    {sttInterimText && (
                      <div className="text-xs text-slate-400 italic bg-slate-50 border border-slate-100 p-2 rounded-md">
                        Preview: {sttInterimText}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Follow Up */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Tindak Lanjut (Opsional)
                </label>
                <textarea
                  value={modalFollowUp}
                  onChange={(e) => setModalFollowUp(e.target.value)}
                  placeholder="Contoh: Apresiasi, Observasi lanjutan, Hubungi orang tua"
                  className="w-full min-h-[80px] p-3 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 rounded-xl text-sm text-slate-700 bg-white resize-y leading-relaxed"
                  id="modal-textarea-followup"
                />
              </div>
            </div>

            <div className="p-6 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  if (recognitionRef.current) recognitionRef.current.stop();
                  setShowAddModal(false);
                }}
                disabled={modalSaving}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-100 text-slate-600 text-sm font-bold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                id="modal-btn-cancel"
              >
                Batal
              </button>
              <button
                onClick={handleSaveFromModal}
                disabled={modalSaving}
                className="inline-flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl shadow-xs hover:shadow transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                id="modal-btn-confirm"
              >
                {modalSaving ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Menyimpan...
                  </>
                ) : (
                  <>
                    {isEditingNote ? "Simpan Perubahan" : "Tambah Catatan"}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
