import * as React from "react";
import { useState, useEffect } from "react";
import { useParams, useNavigate, useOutletContext } from "react-router-dom";
import {
  ChevronLeft,
  TrendingUp,
  Clock,
  Calendar,
  Users,
  Target,
  ClipboardList,
  FileText,
  HeartHandshake,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Bell,
  MoreVertical,
  Plus,
  ArrowUpRight,
  BookOpen,
  History,
  MessageSquare,
  FileDown,
  Activity,
  ShieldCheck,
  Cloud,
  RefreshCw,
  Database,
  ExternalLink,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useAuth } from "../../context/AuthContext";
import {
  getMTSSAcademicCaseById,
  getMTSSAcademicGoals,
  getMTSSAcademicSessions,
  getMTSSAcademicMeetings,
  getMTSSAcademicPlans,
  getMTSSAcademicEvaluations,
  getMTSSAcademicParentDocuments,
  updateMTSSAcademicCase,
  addMTSSAcademicSession,
  addMTSSAcademicGoal,
  addMTSSAcademicMeeting,
} from "../../lib/firebase";
import {
  MTSSAcademicCase,
  MTSSAcademicGoal,
  MTSSAcademicSession,
  MTSSAcademicMeeting,
  MTSSAcademicPlan,
  MTSSAcademicEvaluation,
  MTSSAcademicParentDocument,
  MTSSAcademicDomain,
  MTSSAcademicStatus,
  MTSSAcademicTier,
  MTSSAcademicAlert,
  MTSSAcademicStudentContext,
  User,
} from "../../types";
import { cn, formatDate } from "../../lib/utils";
import { format } from "date-fns";
import { generateAlertsForCase } from "../../services/mtssAcademicAlertsService";
import {
  getMTSSAcademicAlerts,
} from "../../lib/firebase";
import { getMTSSAcademicDocuments } from "../../services/mtssAcademicDocumentService";
import { getStudentSupportContext } from "../../services/mtssAcademicContextService";
import { mtssAcademicRegisterService } from "../../services/mtssAcademicRegisterService";
import { mtssAcademicDriveService } from "../../services/mtssAcademicDriveService";
import { toast } from "sonner";

// Components for Tabs
import CaseOverview from "./components/CaseOverview";
import GoalSetting from "./components/GoalSetting";
import SessionLog from "./components/SessionLog";
import MeetingMinutes from "./components/MeetingMinutes";
import ParentCommunication from "./components/ParentCommunication";
import EvaluationReport from "./components/EvaluationReport";
import CaseDocuments from "./components/CaseDocuments";
import StudentSupportContext from "./components/StudentSupportContext";

import { canViewAcademicCase } from "../../services/mtssAcademicPermissionService";
import { getMTSSAcademicAuditLogs } from "../../services/mtssAcademicAuditService";
import AuditTrailPanel from "./components/AuditTrailPanel";

const TABS = [
  { id: "overview", label: "Overview", icon: ClipboardList },
  { id: "context", label: "Support Context", icon: Activity },
  { id: "plan", label: "Intervention Plan", icon: Target },
  { id: "sessions", label: "Session Log", icon: History },
  { id: "meetings", label: "Meetings", icon: Users },
  { id: "evaluations", label: "Evaluations", icon: FileText },
  { id: "parent", label: "Parent Hub", icon: HeartHandshake },
  { id: "documents", label: "Documents", icon: FileDown },
  { id: "audit", label: "Audit Trail", icon: ShieldCheck, privileged: true },
];

export default function CaseDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentUser: fullUser } = useOutletContext<{ currentUser: User }>();

  const [activeTab, setActiveTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [mtssCase, setMtssCase] = useState<MTSSAcademicCase | null>(null);
  const [goals, setGoals] = useState<MTSSAcademicGoal[]>([]);
  const [sessions, setSessions] = useState<MTSSAcademicSession[]>([]);
  const [meetings, setMeetings] = useState<MTSSAcademicMeeting[]>([]);
  const [plans, setPlans] = useState<MTSSAcademicPlan[]>([]);
  const [evaluations, setEvaluations] = useState<MTSSAcademicEvaluation[]>([]);
  const [parentDocs, setParentDocs] = useState<MTSSAcademicParentDocument[]>(
    [],
  );
  const [documentRecords, setDocumentRecords] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<MTSSAcademicAlert[]>([]);
  const [studentContext, setStudentContext] =
    useState<MTSSAcademicStudentContext | null>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const isPrivileged =
    fullUser?.role &&
    [
      "SUPER_ADMIN",
      "SUPER ADMIN",
      "HEAD_UNIT",
      "HEAD UNIT",
      "HEAD_JUNIOR",
      "HEAD JUNIOR",
      "PRINCIPAL",
      "VICE_PRINCIPAL",
      "COORDINATOR",
      "ADMIN",
    ].includes(fullUser.role.toUpperCase().replace(/_/g, " "));

  const finalPrivileged =
    isPrivileged ||
    (fullUser?.role &&
      fullUser.role.toUpperCase().replace(/\s/g, "_") === "SUPER_ADMIN");

  useEffect(() => {
    if (id) fetchData();
  }, [id]);

  const fetchData = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [
        caseData,
        goalsData,
        sessionsData,
        meetingsData,
        plansData,
        evalsData,
        docsData,
        documentRecordsData,
        alertsData,
      ] = await Promise.all([
        getMTSSAcademicCaseById(id),
        getMTSSAcademicGoals(id),
        getMTSSAcademicSessions(id),
        getMTSSAcademicMeetings(id),
        getMTSSAcademicPlans(id),
        getMTSSAcademicEvaluations(id),
        getMTSSAcademicParentDocuments(id),
        getMTSSAcademicDocuments(id),
        getMTSSAcademicAlerts({ caseId: id, status: "OPEN" }),
      ]);

      if (caseData) {
        setMtssCase(caseData);
        // Fetch context after getting case domains
        getStudentSupportContext(
          caseData.studentId,
          caseData.subjectDomains,
        ).then(setStudentContext);

        setGoals(goalsData || []);
        setSessions(sessionsData || []);
        setMeetings(meetingsData || []);
        setPlans(plansData || []);
        setEvaluations(evalsData || []);
        setParentDocs(docsData || []);
        setDocumentRecords(documentRecordsData || []);
        setAlerts(alertsData || []);

        if (finalPrivileged) {
          getMTSSAcademicAuditLogs(id).then(setAuditLogs);
        }

        // TRIGGER BACKGROUND ALERT SCAN
        generateAlertsForCase(caseData, {
          goals: goalsData || [],
          sessions: sessionsData || [],
          meetings: meetingsData || [],
          evaluations: evalsData || [],
          documents: docsData || [],
        }).then(() => {
          getMTSSAcademicAlerts({ caseId: id, status: "OPEN" }).then(setAlerts);
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSync = async () => {
    if (!mtssCase) return;
    setSyncing(true);
    try {
      const result = await mtssAcademicRegisterService.syncCase(
        mtssCase,
        "MANUAL_CASE_DETAIL",
      );
      if (result.success) {
        toast.success("Sync Success", {
          description: "Master Register updated for this case.",
        });
        fetchData();
      } else {
        toast.error("Sync Failed", { description: result.error });
      }
    } catch (err) {
      toast.error("Network Error");
    } finally {
      setSyncing(false);
    }
  };

  const handleManualSyncSnapshot = async () => {
    if (!mtssCase) return;
    toast.promise(mtssAcademicDriveService.syncSnapshot(mtssCase.id), {
      loading: "Generating structured v2 snapshot...",
      success: (res) => {
        fetchData();
        return `Successfully synced snapshot v${res.syncedAt}`;
      },
      error: "Failed to sync snapshot",
    });
  };

  const handleArchivePdf = async () => {
    if (!mtssCase) return;
    setArchiving(true);
    try {
      // In v1 demo, we simulate the upload from browser
      const fileName = `MTSS_Report_${mtssCase.id}_v1.pdf`;
      const result = await mtssAcademicDriveService.archivePdf(mtssCase.id, {
        fileName,
        version: (mtssCase.latestPdfVersion || 0) + 1,
        generatedBy: fullUser?.displayName || "Unknown",
      });

      if (result.success) {
        toast.success("PDF Archived", {
          description: "Latest report snapshot saved to Shared Drive.",
        });
        fetchData();
      } else {
        toast.error("Archive Failed", { description: result.error });
      }
    } catch (err) {
      toast.error("Archive Error");
    } finally {
      setArchiving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 gap-4">
        <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
        <p className="text-slate-500 font-medium">
          Gathering student history...
        </p>
      </div>
    );
  }

  if (!mtssCase) {
    return (
      <div className="p-20 text-center">
        <h2 className="text-2xl font-bold text-slate-800">Case not found</h2>
        <button
          onClick={() => navigate("/junior-high/academic/mtss/cases")}
          className="mt-4 text-indigo-600 font-bold hover:underline"
        >
          Back to Case List
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/50 pb-20">
      {/* Dynamic Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate("/junior-high/academic/mtss/cases")}
                className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 transition-colors"
              >
                <ChevronLeft size={24} />
              </button>
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <h1 className="text-xl font-black text-slate-900">
                    {mtssCase.studentName}
                  </h1>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                      mtssCase.currentTier === "Tier 3"
                        ? "bg-rose-100 text-rose-700"
                        : mtssCase.currentTier === "Tier 2"
                          ? "bg-orange-100 text-orange-700"
                          : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {mtssCase.currentTier}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-sm text-slate-500 font-medium">
                  <span className="bg-slate-100 px-2 py-0.5 rounded text-[10px] font-bold text-slate-500">
                    {mtssCase.className}
                  </span>
                  <span className="flex items-center gap-1">
                    <BookOpen size={14} className="text-slate-400" />{" "}
                    {mtssCase.subjectDomains.join(" • ")}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {finalPrivileged && (
                <div className="flex items-center gap-2 mr-2">
                  <div className="flex items-center gap-1 p-1 bg-gray-50 rounded-xl border border-gray-100">
                    <button
                      onClick={handleRegisterSync}
                      disabled={syncing}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all text-[10px] font-black uppercase tracking-widest shadow-sm",
                        mtssCase.registerSyncStatus === "SYNCED"
                          ? "bg-emerald-50 text-emerald-600 border-emerald-100"
                          : mtssCase.registerSyncStatus === "FAILED"
                            ? "bg-rose-50 text-rose-600 border-rose-100"
                            : "bg-white text-gray-500 border-gray-100 hover:bg-gray-100",
                      )}
                      title={
                        mtssCase.registerSyncStatus === "FAILED"
                          ? `Error: ${mtssCase.lastBackupError}`
                          : "Sync Master Register"
                      }
                    >
                      {syncing ? (
                        <RefreshCw size={12} className="animate-spin" />
                      ) : (
                        <Database size={12} />
                      )}
                      Reg: {mtssCase.registerSyncStatus || "PENDING"}
                    </button>

                    <button
                      onClick={handleArchivePdf}
                      disabled={archiving}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all text-[10px] font-black uppercase tracking-widest shadow-sm",
                        mtssCase.latestPdfFileId
                          ? "bg-indigo-50 text-indigo-600 border-indigo-100"
                          : "bg-white text-gray-500 border-gray-100 hover:bg-gray-100",
                      )}
                      title="Archive PDF to Drive"
                    >
                      {archiving ? (
                        <RefreshCw size={12} className="animate-spin" />
                      ) : (
                        <Cloud size={12} />
                      )}
                      PDF:{" "}
                      {mtssCase.latestPdfFileId
                        ? `v${mtssCase.latestPdfVersion}`
                        : "OFFLINE"}
                    </button>

                    {mtssCase.driveFolderId && (
                      <a
                        href={`https://drive.google.com/drive/folders/${mtssCase.driveFolderId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                        title="Open Shared Drive Folder"
                      >
                        <ExternalLink size={14} />
                      </a>
                    )}
                  </div>
                </div>
              )}

              {alerts.length > 0 && (
                <div
                  className="flex items-center gap-2 px-3 py-1.5 bg-rose-50 text-rose-600 rounded-xl border border-rose-100 animate-pulse cursor-pointer shadow-sm"
                  title="Active SOP Alerts"
                >
                  <Bell size={16} />
                  <span className="text-[10px] font-black uppercase tracking-widest">
                    {alerts.length} Alerts
                  </span>
                </div>
              )}
              <button
                className="p-2.5 text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                title="Export Case PDF"
              >
                <FileDown size={20} />
              </button>
              <CaseStatusBadge status={mtssCase.status} />
              <button className="p-2.5 bg-slate-50 text-slate-400 hover:text-slate-600 rounded-xl transition-colors border border-slate-100">
                <MoreVertical size={20} />
              </button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pt-2">
            {TABS.filter((t) => !t.privileged || finalPrivileged).map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all border-2 ${
                    isActive
                      ? "bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-100"
                      : "bg-white border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                  }`}
                >
                  <Icon size={18} />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Alert Warning Panel */}
      {alerts.length > 0 && (
        <div className="max-w-7xl mx-auto px-6 mt-6">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-rose-50 border-2 border-rose-100 rounded-[32px] p-6 shadow-sm overflow-hidden relative"
          >
            <div className="absolute top-0 right-0 p-8 text-rose-200 opacity-20 pointer-events-none">
              <AlertTriangle size={80} />
            </div>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-rose-600 text-white rounded-xl shadow-lg shadow-rose-100">
                <Bell size={20} />
              </div>
              <h3 className="text-sm font-black text-rose-900 uppercase tracking-widest">
                Crucial SOP Compliance Flags
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className="bg-white p-4 rounded-2xl shadow-sm border border-rose-50 flex items-start gap-4 hover:shadow-md transition-shadow"
                >
                  <div className="w-8 h-8 bg-rose-100 text-rose-600 rounded-lg flex items-center justify-center shrink-0">
                    <AlertCircle size={18} />
                  </div>
                  <div>
                    <p className="text-xs font-black text-slate-900 leading-tight mb-1">
                      {alert.title}
                    </p>
                    <p className="text-[10px] font-medium text-slate-500 leading-relaxed mb-2">
                      {alert.description}
                    </p>
                    <div className="px-2 py-0.5 bg-rose-50 text-rose-700 text-[9px] font-black uppercase tracking-wider rounded border border-rose-100 inline-block">
                      Recommend: {alert.recommendedAction}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="max-w-7xl mx-auto p-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === "overview" && (
              <CaseOverview
                mtssCase={mtssCase}
                goals={goals}
                sessions={sessions}
                meetings={meetings}
                plans={plans}
                evaluations={evaluations}
              />
            )}
            {activeTab === "context" && studentContext && (
              <StudentSupportContext
                context={studentContext}
                studentName={mtssCase.studentName}
              />
            )}
            {activeTab === "plan" && (
              <GoalSetting
                mtssCase={mtssCase}
                goals={goals}
                plans={plans}
                onUpdate={fetchData}
              />
            )}
            {activeTab === "sessions" && (
              <SessionLog
                mtssCase={mtssCase}
                sessions={sessions}
                onUpdate={fetchData}
              />
            )}
            {activeTab === "meetings" && (
              <MeetingMinutes
                mtssCase={mtssCase}
                meetings={meetings}
                onUpdate={fetchData}
              />
            )}
            {activeTab === "evaluations" && (
              <EvaluationReport
                mtssCase={mtssCase}
                evaluations={evaluations}
                onUpdate={fetchData}
              />
            )}
            {activeTab === "parent" && (
              <ParentCommunication
                mtssCase={mtssCase}
                documents={parentDocs}
                onUpdate={fetchData}
              />
            )}
            {activeTab === "documents" && (
              <CaseDocuments
                mtssCase={mtssCase}
                documentRecords={documentRecords}
                initialMeeting={meetings.find(
                  (m) => m.meetingType === "INITIAL",
                )}
                latestEvaluation={evaluations[0]}
                onUpdate={fetchData}
              />
            )}
            {activeTab === "audit" && finalPrivileged && (
              <AuditTrailPanel auditLogs={auditLogs} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function CaseStatusBadge({ status }: { status: MTSSAcademicStatus }) {
  const config = {
    SCREENING: {
      label: "Screening",
      color: "bg-blue-50 text-blue-600 border-blue-200",
    },
    INITIAL_MEETING: {
      label: "Meet Planned",
      color: "bg-amber-50 text-amber-600 border-amber-200",
    },
    ACTIVE: {
      label: "In Progress",
      color: "bg-emerald-50 text-emerald-600 border-emerald-200",
    },
    UNDER_REVIEW: {
      label: "Reviewing",
      color: "bg-violet-50 text-violet-600 border-violet-200",
    },
    ESCALATED: {
      label: "Escalated",
      color: "bg-rose-50 text-rose-600 border-rose-200",
    },
    CLOSED: {
      label: "Case Closed",
      color: "bg-slate-100 text-slate-500 border-slate-200",
    },
  };

  const { label, color } = config[status];

  return (
    <div
      className={`px-4 py-2 font-black text-xs uppercase tracking-widest rounded-xl border-2 flex items-center gap-2 ${color} shadow-sm`}
    >
      <span className="relative flex h-2 w-2">
        <span
          className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${status === "ACTIVE" ? "bg-emerald-400" : "bg-slate-400"}`}
        ></span>
        <span
          className={`relative inline-flex rounded-full h-2 w-2 ${status === "ACTIVE" ? "bg-emerald-500" : "bg-slate-500"}`}
        ></span>
      </span>
      {label}
    </div>
  );
}
