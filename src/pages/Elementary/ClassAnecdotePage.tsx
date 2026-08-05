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
  originalData?: {
    time: string;
    activityContext: string;
    anecdote: string;
    followUp: string;
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
  const canWrite = isSuperAdmin || isElementaryTeacher;

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
  const [modalTime, setModalTime] = React.useState("");
  const [modalActivity, setModalActivity] = React.useState("");
  const [modalAnecdote, setModalAnecdote] = React.useState("");
  const [modalFollowUp, setModalFollowUp] = React.useState("");

  // Speech Recognition tracking
  const [recordingRowId, setRecordingRowId] = React.useState<string | null>(null);
  const [modalRecording, setModalRecording] = React.useState(false);
  const recognitionRef = React.useRef<any>(null);

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
              originalData: {
                time: saved.time || "",
                activityContext: saved.activityContext || "",
                anecdote: saved.anecdote || "",
                followUp: saved.followUp || "",
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
      setRecordingRowId(null);
    } else {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }

      try {
        const rec = new SpeechRecognition();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = "id-ID";

        rec.onstart = () => {
          setRecordingRowId(rowId);
          toast.info("Mulai mendengarkan... Berbicaralah dalam Bahasa Indonesia.");
        };

        rec.onresult = (event: any) => {
          let interimTranscript = "";
          let finalTranscript = "";

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalTranscript += transcript;
            } else {
              interimTranscript += transcript;
            }
          }

          const combinedText = (finalTranscript || interimTranscript).trim();
          if (combinedText) {
            setRows((prevRows) => {
              const updated = prevRows.map((r) => {
                if (r.rowId === rowId) {
                  // Append to previous context with spaces
                  const updatedText = r.anecdote
                    ? `${r.anecdote.trim()} ${combinedText}`
                    : combinedText;
                  return { ...r, anecdote: updatedText, status: "UNSAVED" };
                }
                return r;
              });
              saveDraftsToLocal(updated);
              return updated;
            });
          }
        };

        rec.onerror = (event: any) => {
          console.error("Speech recognition error:", event);
          toast.error(`Error Speech-to-Text: ${event.error || "Izin mikrofon ditolak"}`);
          setRecordingRowId(null);
        };

        rec.onend = () => {
          setRecordingRowId(null);
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
      setModalRecording(false);
    } else {
      try {
        const rec = new SpeechRecognition();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = "id-ID";

        rec.onstart = () => {
          setModalRecording(true);
          toast.info("Mendengarkan...");
        };

        rec.onresult = (event: any) => {
          let interimTranscript = "";
          let finalTranscript = "";

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalTranscript += transcript;
            } else {
              interimTranscript += transcript;
            }
          }

          const combinedText = (finalTranscript || interimTranscript).trim();
          if (combinedText) {
            setModalAnecdote((prev) => (prev ? `${prev.trim()} ${combinedText}` : combinedText));
          }
        };

        rec.onerror = (event: any) => {
          console.error("Modal speech error:", event);
          setModalRecording(false);
        };

        rec.onend = () => {
          setModalRecording(false);
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
      // Determine target document ID
      const finalDocId = row.isDraft
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
        createdAt: row.isDraft ? Timestamp.now() : Timestamp.fromDate(row.originalData ? new Date() : new Date()), // keep original or set current
        updatedAt: Timestamp.now(),
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
              originalData: {
                time: payload.time,
                activityContext: payload.activityContext,
                anecdote: payload.anecdote,
                followUp: payload.followUp || "",
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
      // Basic validations per row
      if (!r.anecdote.trim() || !r.time.trim() || !r.activityContext.trim()) {
        // Skip entirely empty row if it's draft, otherwise fail it
        if (r.isDraft && !r.anecdote.trim() && !r.activityContext.trim()) {
          continue;
        }
        failCount++;
        setRows((prev) =>
          prev.map((row) => (row.rowId === r.rowId ? { ...row, status: "FAILED" } : row))
        );
        continue;
      }

      try {
        const finalDocId = r.isDraft
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
          createdAt: r.isDraft ? Timestamp.now() : Timestamp.now(),
          updatedAt: Timestamp.now(),
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
                originalData: {
                  time: payload.time,
                  activityContext: payload.activityContext,
                  anecdote: payload.anecdote,
                  followUp: payload.followUp || "",
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
  const handleOpenAddModal = () => {
    if (students.length === 0) {
      toast.warning("Daftar siswa kosong atau kelas belum dipilih.");
      return;
    }
    setModalStudentId(students[0].id);
    setModalTime(getCurrentLocalTime());
    setModalActivity("");
    setModalAnecdote("");
    setModalFollowUp("");
    setShowAddModal(true);
  };

  const handleAddFromModal = () => {
    if (!modalStudentId) return;
    const student = students.find((s) => s.id === modalStudentId);
    if (!student) return;

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

    const newRowId = `draft_${student.id}_${Date.now()}`;
    const newRow: AnecdoteRow = {
      rowId: newRowId,
      studentId: student.id,
      studentName: student.name,
      time: modalTime.trim(),
      activityContext: modalActivity.trim(),
      anecdote: modalAnecdote.trim(),
      followUp: modalFollowUp.trim(),
      isDraft: true,
      status: "UNSAVED",
    };

    setRows((prev) => {
      // Find if student currently has only one empty draft row
      const existingRowsForStudent = prev.filter((r) => r.studentId === student.id);
      const isSingleEmptyDraft =
        existingRowsForStudent.length === 1 &&
        existingRowsForStudent[0].isDraft &&
        !existingRowsForStudent[0].anecdote.trim() &&
        !existingRowsForStudent[0].activityContext.trim();

      let updated: AnecdoteRow[];
      if (isSingleEmptyDraft) {
        // Replace the empty draft row with our modal row
        updated = prev.map((r) => (r.studentId === student.id ? newRow : r));
      } else {
        // Append this as an additional row
        updated = [...prev, newRow];
      }
      saveDraftsToLocal(updated);
      return updated;
    });

    setShowAddModal(false);
    toast.success(`Draf anekdot baru ditambahkan untuk ${student.name}. Sila simpan draf ini.`);
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
              onClick={handleOpenAddModal}
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

      {/* Main Roster & Anecdotes Table */}
      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
        {loadingStudents || loadingAnecdotes ? (
          <div className="py-24 flex flex-col items-center justify-center gap-3 text-slate-400">
            <Loader2 className="animate-spin text-indigo-500" size={32} />
            <p className="text-sm font-semibold">Memuat data observasi kelas...</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-slate-400 space-y-2">
            <Info size={32} className="mx-auto text-slate-300" />
            <p className="text-sm font-semibold">Tidak ada siswa aktif ditemukan di kelas ini.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse table-auto min-w-[1000px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-[11px] font-black text-slate-500 uppercase tracking-wider">
                  <th className="py-4 px-4 text-center w-12">No</th>
                  <th className="py-4 px-4 w-52">Nama Siswa</th>
                  <th className="py-4 px-4 w-24">Waktu</th>
                  <th className="py-4 px-4 w-60">Aktivitas / Konteks</th>
                  <th className="py-4 px-4">Catatan Anekdot</th>
                  <th className="py-4 px-4 w-64">Tindak Lanjut</th>
                  <th className="py-4 px-4 text-center w-40">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {rows.map((row, index) => {
                  const isRecording = recordingRowId === row.rowId;

                  return (
                    <tr
                      key={row.rowId}
                      className={`hover:bg-slate-50/50 transition-colors ${
                        row.status === "UNSAVED" ? "bg-amber-50/10" : ""
                      }`}
                    >
                      {/* No */}
                      <td className="py-4 px-4 text-center font-bold text-slate-400">
                        {index + 1}
                      </td>

                      {/* Name & status */}
                      <td className="py-4 px-4 font-semibold text-slate-800 space-y-1">
                        <div>{row.studentName}</div>
                        <div>{renderStatusBadge(row.status)}</div>
                      </td>

                      {/* Time */}
                      <td className="py-4 px-4">
                        <input
                          type="text"
                          value={row.time}
                          disabled={!canWrite}
                          placeholder="09.15"
                          onChange={(e) => handleInputChange(row.rowId, "time", e.target.value)}
                          className="w-full h-10 px-2 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 rounded-lg text-sm text-center font-semibold text-slate-700 bg-white disabled:bg-slate-50"
                          id={`input-time-${row.rowId}`}
                        />
                      </td>

                      {/* Activity/Context */}
                      <td className="py-4 px-4">
                        <input
                          type="text"
                          value={row.activityContext}
                          disabled={!canWrite}
                          placeholder="e.g. Diskusi kelompok"
                          onChange={(e) =>
                            handleInputChange(row.rowId, "activityContext", e.target.value)
                          }
                          className="w-full h-10 px-3 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 rounded-lg text-sm text-slate-700 bg-white disabled:bg-slate-50"
                          id={`input-activity-${row.rowId}`}
                        />
                      </td>

                      {/* Anecdote text area with Mic */}
                      <td className="py-4 px-4 relative">
                        <div className="relative flex items-stretch gap-2">
                          <textarea
                            value={row.anecdote}
                            disabled={!canWrite}
                            placeholder="Tuliskan kejadian faktual dan objektif di sini..."
                            onChange={(e) => handleInputChange(row.rowId, "anecdote", e.target.value)}
                            className="w-full min-h-[80px] p-3 pr-10 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 rounded-lg text-sm text-slate-700 bg-white disabled:bg-slate-50 resize-y"
                            id={`textarea-anecdote-${row.rowId}`}
                          />
                          {canWrite && (
                            <button
                              onClick={() => handleToggleSpeech(row.rowId)}
                              className={`absolute right-3 top-3 p-1.5 rounded-full shadow-xs hover:shadow transition-all flex items-center justify-center ${
                                isRecording
                                  ? "bg-rose-500 text-white animate-pulse hover:bg-rose-600"
                                  : "bg-slate-50 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600"
                              }`}
                              title={isRecording ? "Berhenti Merekam" : "Klik untuk Bicara (Speech-to-Text)"}
                              id={`btn-speech-${row.rowId}`}
                            >
                              {isRecording ? <MicOff size={16} /> : <Mic size={16} />}
                            </button>
                          )}
                        </div>
                        {isRecording && (
                          <div className="text-[10px] font-semibold text-rose-500 flex items-center gap-1.5 mt-1 animate-pulse">
                            <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                            Mendengarkan transkripsi Bahasa Indonesia secara langsung...
                          </div>
                        )}
                      </td>

                      {/* Follow-up Action */}
                      <td className="py-4 px-4">
                        <textarea
                          value={row.followUp}
                          disabled={!canWrite}
                          placeholder="e.g. Berikan apresiasi (opsional)"
                          onChange={(e) => handleInputChange(row.rowId, "followUp", e.target.value)}
                          className="w-full min-h-[80px] p-3 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 rounded-lg text-sm text-slate-700 bg-white disabled:bg-slate-50 resize-y"
                          id={`textarea-followup-${row.rowId}`}
                        />
                      </td>

                      {/* Individual Actions */}
                      <td className="py-4 px-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {canWrite && (
                            <>
                              <button
                                onClick={() => saveRow(row.rowId)}
                                disabled={row.status === "SAVED" || row.status === "SAVING"}
                                className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-xs ${
                                  row.status === "UNSAVED"
                                    ? "bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer"
                                    : "bg-slate-100 text-slate-400 cursor-not-allowed"
                                }`}
                                title="Simpan Catatan Baris Ini"
                                id={`btn-save-row-${row.rowId}`}
                              >
                                {row.status === "SAVING" ? (
                                  <Loader2 size={13} className="animate-spin" />
                                ) : (
                                  <Save size={13} />
                                )}
                                Simpan
                              </button>
                              <button
                                onClick={() => handleDeleteRow(row)}
                                className="inline-flex items-center justify-center p-1.5 text-rose-500 hover:bg-rose-50 border border-transparent hover:border-rose-100 rounded-xl transition-all"
                                title="Hapus Catatan Anekdot"
                                id={`btn-delete-row-${row.rowId}`}
                              >
                                <Trash2 size={15} />
                              </button>
                            </>
                          )}
                          {!canWrite && (
                            <span className="text-xs text-slate-400 italic">Hanya Baca</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Bulk Action Footer */}
        {canWrite && rows.length > 0 && !loadingStudents && !loadingAnecdotes && (
          <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
            <p className="text-xs text-slate-500 font-medium">
              * Draf perubahan otomatis disimpan di browser lokal agar tidak hilang. Simpan permanen ke server Firestore dengan tombol Simpan.
            </p>
            <button
              onClick={saveAllUnsaved}
              disabled={savingAll || rows.filter((r) => r.status === "UNSAVED").length === 0}
              className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold shadow-sm transition-all ${
                rows.filter((r) => r.status === "UNSAVED").length > 0
                  ? "bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer"
                  : "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
              }`}
              id="btn-save-all-changes"
            >
              {savingAll ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Menyimpan Semua...
                </>
              ) : (
                <>
                  <Save size={16} />
                  Simpan Semua Perubahan
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* MANUAL ADD ANECDOTE DIALOG MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in" id="modal-add-anecdote-wrapper">
          <div className="bg-white border border-slate-100 rounded-2xl max-w-lg w-full shadow-xl overflow-hidden animate-slide-up">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <MessageSquare className="text-indigo-600" size={20} />
                <h3 className="font-extrabold text-slate-900 text-lg">
                  Tambah Catatan Baru
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

            <div className="p-6 space-y-4">
              {/* Student Select */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Pilih Siswa
                </label>
                <select
                  value={modalStudentId}
                  onChange={(e) => setModalStudentId(e.target.value)}
                  className="w-full h-10 px-3 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 rounded-xl text-sm text-slate-700 font-semibold bg-white"
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
                  className="w-full h-10 px-3 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 rounded-xl text-sm text-slate-700 bg-white"
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
                  className="w-full h-10 px-3 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 rounded-xl text-sm text-slate-700 bg-white"
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
                  value={modalAnecdote}
                  onChange={(e) => setModalAnecdote(e.target.value)}
                  placeholder="Tuliskan kejadian faktual, objektif, dan terperinci..."
                  className="w-full min-h-[100px] p-3 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 rounded-xl text-sm text-slate-700 bg-white resize-none"
                  id="modal-textarea-anecdote"
                />
                {modalRecording && (
                  <p className="text-[10px] text-rose-500 animate-pulse font-semibold">
                    * Berbicaralah sekarang. Suara Anda sedang ditranskripsikan ke dalam draf di atas.
                  </p>
                )}
              </div>

              {/* Follow Up */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Tindak Lanjut (Opsional)
                </label>
                <input
                  type="text"
                  value={modalFollowUp}
                  onChange={(e) => setModalFollowUp(e.target.value)}
                  placeholder="Contoh: Apresiasi, Observasi lanjutan"
                  className="w-full h-10 px-3 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 rounded-xl text-sm text-slate-700 bg-white"
                  id="modal-input-followup"
                />
              </div>
            </div>

            <div className="p-6 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  if (recognitionRef.current) recognitionRef.current.stop();
                  setShowAddModal(false);
                }}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-100 text-slate-600 text-sm font-bold rounded-xl transition-colors"
                id="modal-btn-cancel"
              >
                Batal
              </button>
              <button
                onClick={handleAddFromModal}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl shadow-xs hover:shadow transition-all"
                id="modal-btn-confirm"
              >
                + Tambah Catatan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
