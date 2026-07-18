import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { 
  ArrowLeft, 
  Plus, 
  Trash2, 
  ArrowUp, 
  ArrowDown, 
  Check, 
  Save, 
  Copy, 
  Archive, 
  ChevronUp, 
  ChevronDown, 
  Edit3, 
  AlertTriangle, 
  X, 
  FileText, 
  Sparkles, 
  Clock, 
  User,
  History,
  Info
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { 
  getLdssTemplatesByAge, 
  saveLdssTemplate, 
  activateLdssTemplate, 
  archiveLdssTemplate 
} from "../../services/ldssTemplateService";
import { LdssTemplate, LdssAge, LdssDomain, LdssIndicator } from "../../types";
import { SEED_DOMAINS_USIA_6 } from "../../data/ldssSeedData6";
import { SEED_DOMAINS_USIA_7 } from "../../data/ldssSeedData7";
import { SEED_DOMAINS_USIA_8 } from "../../data/ldssSeedData8";
import { SEED_DOMAINS_USIA_9 } from "../../data/ldssSeedData9";
import { SEED_DOMAINS_USIA_10 } from "../../data/ldssSeedData10";
import { SEED_DOMAINS_USIA_11 } from "../../data/ldssSeedData11";
import { SEED_DOMAINS_USIA_12 } from "../../data/ldssSeedData12";

interface LdssTemplateEditorProps {
  age: LdssAge;
}

export default function LdssTemplateEditor({ age }: LdssTemplateEditorProps) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const userEmail = profile?.email || "admin@lazuardi.sch.id";

  // Data Loading States
  const [templates, setTemplates] = React.useState<LdssTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = React.useState<LdssTemplate | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = React.useState(false);

  // Accordion Expand/Collapse state (domainId -> boolean)
  const [expandedDomains, setExpandedDomains] = React.useState<Record<string, boolean>>({});

  // Editing values
  const [versionText, setVersionText] = React.useState("v1.0");

  // Validation errors
  const [validationErrors, setValidationErrors] = React.useState<string[]>([]);
  const [showValidationBanner, setShowValidationBanner] = React.useState(false);
  const [showSeedSuccessToast, setShowSeedSuccessToast] = React.useState(false);

  React.useEffect(() => {
    if (sessionStorage.getItem("ldss_seed_success") === "true") {
      setShowSeedSuccessToast(true);
      sessionStorage.removeItem("ldss_seed_success");
      const timer = setTimeout(() => {
        setShowSeedSuccessToast(false);
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, []);

  // Modal / Confirm States
  const [confirmModal, setConfirmModal] = React.useState<{
    type: "delete_domain" | "delete_indicator" | "archive" | "activate" | "leave" | "load_official_confirm";
    targetId?: string; // domainId or indicatorId
    parentId?: string; // domainId for indicator
    title: string;
    message: string;
  } | null>(null);

  // Fetch all templates for this age on mount
  const fetchTemplates = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await getLdssTemplatesByAge(age);
      // Sort templates: Active first, then Draft, then Archived, newest updatedAt first
      const sorted = [...data].sort((a, b) => {
        if (a.status === "active") return -1;
        if (b.status === "active") return 1;
        if (a.status === "draft") return -1;
        if (b.status === "draft") return 1;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });

      setTemplates(sorted);
      if (sorted.length > 0) {
        // Default to active template, otherwise first available
        const active = sorted.find((t) => t.status === "active") || sorted[0];
        setSelectedTemplate(JSON.parse(JSON.stringify(active))); // Deep copy for editing safely
        setVersionText(active.version);
        
        // Auto expand all domains initially for easy editing
        const initialExpanded: Record<string, boolean> = {};
        active.domains.forEach(d => {
          initialExpanded[d.id] = true;
        });
        setExpandedDomains(initialExpanded);
      } else {
        setSelectedTemplate(null);
      }
      setHasUnsavedChanges(false);
    } catch (err) {
      console.error("Error loading templates:", err);
    } finally {
      setLoading(false);
    }
  }, [age]);

  React.useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  // Handle unload alert for unsaved changes
  React.useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = "Anda memiliki perubahan yang belum disimpan. Apakah Anda yakin ingin meninggalkan halaman?";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [hasUnsavedChanges]);

  // Trigger leaving confirmation
  const handleBack = () => {
    if (hasUnsavedChanges) {
      setConfirmModal({
        type: "leave",
        title: "Perubahan Belum Disimpan",
        message: "Anda memiliki perubahan yang belum disimpan pada template ini. Apakah Anda yakin ingin kembali ke daftar pengaturan?",
      });
    } else {
      navigate("/elementary/ldss/settings");
    }
  };

  // Create new template draft
  const handleCreateTemplate = () => {
    const newTemplate: LdssTemplate = {
      id: "template_" + age + "_" + Date.now(),
      age: age,
      version: "v1.0",
      status: "draft",
      domains: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: userEmail
    };

    setSelectedTemplate(newTemplate);
    setVersionText("v1.0");
    setHasUnsavedChanges(true);
  };

  // Load official template draft for Age 6, 7, 8, 9, 10, 11, or 12
  const handleLoadOfficialTemplate = () => {
    if (age !== 6 && age !== 7 && age !== 8 && age !== 9 && age !== 10 && age !== 11 && age !== 12) return;
    const seedDomains = age === 6 
      ? SEED_DOMAINS_USIA_6 
      : age === 7 
        ? SEED_DOMAINS_USIA_7 
        : age === 8
          ? SEED_DOMAINS_USIA_8
          : age === 9
            ? SEED_DOMAINS_USIA_9
            : age === 10
              ? SEED_DOMAINS_USIA_10
              : age === 11
                ? SEED_DOMAINS_USIA_11
                : SEED_DOMAINS_USIA_12;
    const officialTemplate: LdssTemplate = {
      id: `template_${age}_official_` + Date.now(),
      age: age,
      version: "v1.0",
      status: "draft",
      domains: JSON.parse(JSON.stringify(seedDomains)),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: userEmail
    };

    setSelectedTemplate(officialTemplate);
    setVersionText("v1.0");
    setHasUnsavedChanges(true);

    // Expand all domains initially for easier viewing and custom editing
    const expanded: Record<string, boolean> = {};
    seedDomains.forEach(d => {
      expanded[d.id] = true;
    });
    setExpandedDomains(expanded);
  };

  const confirmLoadOfficialTemplate = () => {
    setConfirmModal({
      type: "load_official_confirm",
      title: "Muat Template Resmi?",
      message: `Apakah Anda yakin ingin memuat template resmi bawaan untuk Usia ${age} Tahun? Tindakan ini akan menimpa/mengganti seluruh domain dan indikator yang ada saat ini di draf ini.`,
    });
  };

  // Helper to update selected template domains with unsaved state tracking
  const updateDomains = (newDomains: LdssDomain[]) => {
    if (!selectedTemplate) return;
    
    // Sort domains by order just in case
    const sortedDomains = [...newDomains].sort((a, b) => a.order - b.order);

    setSelectedTemplate({
      ...selectedTemplate,
      domains: sortedDomains,
      updatedAt: new Date().toISOString()
    });
    setHasUnsavedChanges(true);
  };

  // Domain CRUD operations
  const handleAddDomain = () => {
    if (!selectedTemplate) return;
    const isReadOnly = selectedTemplate.status !== "draft";
    if (isReadOnly) return;

    const newId = "domain_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5);
    const newDomain: LdssDomain = {
      id: newId,
      name: "Domain Baru",
      order: selectedTemplate.domains.length + 1,
      indicators: []
    };

    updateDomains([...selectedTemplate.domains, newDomain]);
    // Expand the new domain immediately
    setExpandedDomains(prev => ({ ...prev, [newId]: true }));
  };

  const handleEditDomainName = (domainId: string, newName: string) => {
    if (!selectedTemplate) return;
    const updated = selectedTemplate.domains.map((d) => {
      if (d.id === domainId) {
        return { ...d, name: newName };
      }
      return d;
    });
    updateDomains(updated);
  };

  const handleMoveDomain = (index: number, direction: "up" | "down") => {
    if (!selectedTemplate) return;
    const list = [...selectedTemplate.domains];
    const targetIndex = direction === "up" ? index - 1 : index + 1;

    if (targetIndex < 0 || targetIndex >= list.length) return;

    // Swap elements
    const temp = list[index];
    list[index] = list[targetIndex];
    list[targetIndex] = temp;

    // Renumber orders
    const reordered = list.map((item, idx) => ({
      ...item,
      order: idx + 1
    }));

    updateDomains(reordered);
  };

  const confirmDeleteDomain = (domainId: string, name: string) => {
    setConfirmModal({
      type: "delete_domain",
      targetId: domainId,
      title: "Hapus Domain",
      message: `Apakah Anda yakin ingin menghapus domain "${name || "Domain Baru"}"? Seluruh indikator di dalam domain ini juga akan terhapus.`,
    });
  };

  const executeDeleteDomain = (domainId: string) => {
    if (!selectedTemplate) return;
    const filtered = selectedTemplate.domains.filter((d) => d.id !== domainId);
    
    // Renumber orders
    const reordered = filtered.map((item, idx) => ({
      ...item,
      order: idx + 1
    }));

    updateDomains(reordered);
    setConfirmModal(null);
  };

  // Indicator CRUD operations
  const handleAddIndicator = (domainId: string) => {
    if (!selectedTemplate) return;
    const isReadOnly = selectedTemplate.status !== "draft";
    if (isReadOnly) return;

    const newId = "ind_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5);
    const domain = selectedTemplate.domains.find(d => d.id === domainId);
    if (!domain) return;

    const newIndicator: LdssIndicator = {
      id: newId,
      text: "Indikator baru",
      order: domain.indicators.length + 1
    };

    const updated = selectedTemplate.domains.map((d) => {
      if (d.id === domainId) {
        return {
          ...d,
          indicators: [...d.indicators, newIndicator]
        };
      }
      return d;
    });

    updateDomains(updated);
  };

  const handleEditIndicatorText = (domainId: string, indicatorId: string, text: string) => {
    if (!selectedTemplate) return;
    const updated = selectedTemplate.domains.map((d) => {
      if (d.id === domainId) {
        const updatedInd = d.indicators.map((ind) => {
          if (ind.id === indicatorId) {
            return { ...ind, text };
          }
          return ind;
        });
        return { ...d, indicators: updatedInd };
      }
      return d;
    });
    updateDomains(updated);
  };

  const handleMoveIndicator = (domainId: string, index: number, direction: "up" | "down") => {
    if (!selectedTemplate) return;
    const updated = selectedTemplate.domains.map((d) => {
      if (d.id === domainId) {
        const list = [...d.indicators];
        const targetIndex = direction === "up" ? index - 1 : index + 1;

        if (targetIndex < 0 || targetIndex >= list.length) return d;

        // Swap
        const temp = list[index];
        list[index] = list[targetIndex];
        list[targetIndex] = temp;

        // Renumber orders
        const reordered = list.map((item, idx) => ({
          ...item,
          order: idx + 1
        }));

        return { ...d, indicators: reordered };
      }
      return d;
    });
    updateDomains(updated);
  };

  const confirmDeleteIndicator = (domainId: string, indicatorId: string, text: string) => {
    setConfirmModal({
      type: "delete_indicator",
      targetId: indicatorId,
      parentId: domainId,
      title: "Hapus Indikator",
      message: `Apakah Anda yakin ingin menghapus indikator "${text.substring(0, 40)}${text.length > 40 ? "..." : ""}"?`,
    });
  };

  const executeDeleteIndicator = (domainId: string, indicatorId: string) => {
    if (!selectedTemplate) return;
    const updated = selectedTemplate.domains.map((d) => {
      if (d.id === domainId) {
        const filtered = d.indicators.filter((ind) => ind.id !== indicatorId);
        // Renumber
        const reordered = filtered.map((item, idx) => ({
          ...item,
          order: idx + 1
        }));
        return { ...d, indicators: reordered };
      }
      return d;
    });

    updateDomains(updated);
    setConfirmModal(null);
  };

  // Toggle domain accordion expansion
  const toggleDomainExpanded = (domainId: string) => {
    setExpandedDomains(prev => ({
      ...prev,
      [domainId]: !prev[domainId]
    }));
  };

  // Validate current template data shape
  const validateTemplate = (): boolean => {
    const errors: string[] = [];
    if (!selectedTemplate) return false;

    if (selectedTemplate.domains.length === 0) {
      errors.push("Template harus memiliki minimal 1 Domain.");
    }

    selectedTemplate.domains.forEach((d, dIdx) => {
      const domainNum = dIdx + 1;
      if (!d.name.trim() || d.name === "Domain Baru") {
        errors.push(`Domain #${domainNum} harus memiliki nama yang spesifik dan tidak kosong.`);
      }

      if (d.indicators.length === 0) {
        errors.push(`Domain "${d.name || "Domain Baru"}" harus memiliki minimal 1 Indikator.`);
      }

      d.indicators.forEach((ind, indIdx) => {
        const indNum = indIdx + 1;
        if (!ind.text.trim() || ind.text === "Indikator baru") {
          errors.push(`Indikator #${indNum} pada Domain "${d.name || "Domain Baru"}" tidak boleh kosong.`);
        }
      });
    });

    setValidationErrors(errors);
    return errors.length === 0;
  };

  // Action: Save Draft
  const handleSaveDraft = async () => {
    if (!selectedTemplate) return;
    setSaving(true);
    setShowValidationBanner(false);

    try {
      const payload: LdssTemplate = {
        ...selectedTemplate,
        version: versionText.trim() || "v1.0",
        updatedAt: new Date().toISOString(),
        createdBy: userEmail
      };

      await saveLdssTemplate(payload);
      setHasUnsavedChanges(false);
      // Reload template list silently to refresh
      const data = await getLdssTemplatesByAge(age);
      const sorted = [...data].sort((a, b) => {
        if (a.status === "active") return -1;
        if (b.status === "active") return 1;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
      setTemplates(sorted);
      // Keep selected template but with updated fields
      setSelectedTemplate(payload);
    } catch (err) {
      console.error("Error saving draft:", err);
    } finally {
      setSaving(false);
    }
  };

  // Action: Activate Template
  const handleActivateClick = () => {
    const isValid = validateTemplate();
    if (!isValid) {
      setShowValidationBanner(true);
      return;
    }

    setConfirmModal({
      type: "activate",
      title: "Aktifkan Template",
      message: "Mengaktifkan template ini akan mengarsipkan versi yang sedang aktif saat ini secara otomatis. Versi arsip tidak akan bisa diubah. Lanjutkan?",
    });
  };

  const executeActivateTemplate = async () => {
    if (!selectedTemplate) return;
    setSaving(true);
    setConfirmModal(null);

    try {
      // 1. First save draft to secure current state changes
      const payload: LdssTemplate = {
        ...selectedTemplate,
        version: versionText.trim() || "v1.0",
        updatedAt: new Date().toISOString(),
        createdBy: userEmail
      };
      await saveLdssTemplate(payload);

      // 2. Call activate template service which archives older active template and activates this one
      await activateLdssTemplate(payload.id, age, userEmail);

      setHasUnsavedChanges(false);
      // Reload full templates list
      await fetchTemplates();
    } catch (err) {
      console.error("Error activating template:", err);
    } finally {
      setSaving(false);
    }
  };

  // Action: Archive Template
  const handleArchiveClick = () => {
    setConfirmModal({
      type: "archive",
      title: "Arsip Template",
      message: "Apakah Anda yakin ingin mengarsipkan template versi ini? Versi yang diarsipkan bersifat read-only (tidak dapat diedit).",
    });
  };

  const executeArchiveTemplate = async () => {
    if (!selectedTemplate) return;
    setSaving(true);
    setConfirmModal(null);

    try {
      await archiveLdssTemplate(selectedTemplate.id, userEmail);
      setHasUnsavedChanges(false);
      await fetchTemplates();
    } catch (err) {
      console.error("Error archiving template:", err);
    } finally {
      setSaving(false);
    }
  };

  // Action: Duplicate as new version
  const handleDuplicateTemplate = async () => {
    if (!selectedTemplate) return;
    setSaving(true);

    try {
      // Suggest next version
      let nextVer = "v1.1";
      const match = selectedTemplate.version.match(/^v(\d+)\.(\d+)$/);
      if (match) {
        const major = parseInt(match[1], 10);
        const minor = parseInt(match[2], 10);
        nextVer = `v${major}.${minor + 1}`;
      } else {
        nextVer = selectedTemplate.version + "_copy";
      }

      // Strip original domain/indicator ids so we don't conflict, generate clean deep copies
      const clonedDomains: LdssDomain[] = selectedTemplate.domains.map((d, dIdx) => ({
        id: "domain_" + Date.now() + "_" + dIdx + "_" + Math.random().toString(36).substr(2, 4),
        name: d.name,
        order: d.order,
        indicators: d.indicators.map((ind, indIdx) => ({
          id: "ind_" + Date.now() + "_" + dIdx + "_" + indIdx + "_" + Math.random().toString(36).substr(2, 4),
          text: ind.text,
          order: ind.order
        }))
      }));

      const clonedTemplate: LdssTemplate = {
        id: "template_" + age + "_" + Date.now(),
        age: age,
        version: nextVer,
        status: "draft",
        domains: clonedDomains,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: userEmail
      };

      // Save the newly duplicated draft to Firestore directly
      await saveLdssTemplate(clonedTemplate);

      // Re-fetch all and select the duplicated draft
      await fetchTemplates();
      setSelectedTemplate(clonedTemplate);
      setVersionText(nextVer);
      setHasUnsavedChanges(true);
    } catch (err) {
      console.error("Error duplicating template:", err);
    } finally {
      setSaving(false);
    }
  };

  // Switch edited version from side/header selection dropdown
  const handleSwitchVersion = (temp: LdssTemplate) => {
    if (hasUnsavedChanges) {
      setConfirmModal({
        type: "leave",
        title: "Perubahan Belum Disimpan",
        message: "Anda memiliki perubahan yang belum disimpan. Pindah ke versi lain akan membatalkan perubahan Anda. Lanjutkan?",
        targetId: temp.id // Store the target template ID to switch to upon user confirmation
      });
    } else {
      executeSwitchVersion(temp.id);
    }
  };

  const executeSwitchVersion = (targetId: string) => {
    const target = templates.find(t => t.id === targetId);
    if (target) {
      setSelectedTemplate(JSON.parse(JSON.stringify(target)));
      setVersionText(target.version);
      
      const expanded: Record<string, boolean> = {};
      target.domains.forEach(d => {
        expanded[d.id] = true;
      });
      setExpandedDomains(expanded);
      setHasUnsavedChanges(false);
    }
    setConfirmModal(null);
  };

  // Main UI render
  if (loading) {
    return (
      <div className="bg-white rounded-3xl border border-gray-150 p-16 shadow-sm flex flex-col items-center justify-center space-y-4">
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs text-slate-500 font-bold">Memuat data template instrumen...</p>
      </div>
    );
  }

  const isReadOnly = selectedTemplate ? selectedTemplate.status !== "draft" : false;

  return (
    <div className="space-y-6">
      {/* Editor Sub-Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-5">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBack}
            className="p-2.5 bg-white hover:bg-slate-50 border border-gray-200 rounded-xl text-gray-600 hover:text-gray-900 transition-all cursor-pointer shadow-sm"
            title="Kembali ke Pengaturan LDSS"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="text-left space-y-0.5">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-gray-900 tracking-tight">
                Template LDSS Usia {age} Tahun
              </h2>
              {hasUnsavedChanges && (
                <span className="flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 rounded-full text-[10px] font-bold">
                  <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse"></span>
                  Perubahan belum disimpan
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 font-medium">
              Kelola, rancang, dan aktifkan instrumen screening perkembangan usia {age}.
            </p>
          </div>
        </div>

        {/* Action Buttons Top Bar */}
        <div className="flex items-center gap-2 self-start sm:self-center">
          {selectedTemplate && (
            <>
              {selectedTemplate.status === "draft" && (
                <>
                  <button
                    onClick={handleSaveDraft}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-white border border-gray-200 hover:bg-slate-50 text-gray-700 disabled:opacity-50 text-xs font-black rounded-xl transition-all shadow-sm cursor-pointer"
                  >
                    <Save size={14} />
                    <span>Simpan Draft</span>
                  </button>

                  <button
                    onClick={handleActivateClick}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 text-xs font-black rounded-xl transition-all shadow-sm cursor-pointer"
                  >
                    <Check size={14} />
                    <span>Aktifkan Template</span>
                  </button>
                </>
              )}

              {selectedTemplate.status === "active" && (
                <>
                  <button
                    onClick={handleDuplicateTemplate}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-indigo-50 border border-indigo-150 hover:bg-indigo-100/70 text-indigo-700 disabled:opacity-50 text-xs font-black rounded-xl transition-all shadow-sm cursor-pointer"
                  >
                    <Copy size={14} />
                    <span>Duplikat sebagai Versi Baru</span>
                  </button>
                  <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1 shadow-sm select-none">
                    <Sparkles size={13} className="text-emerald-600 shrink-0" />
                    <span>Aktif</span>
                  </span>
                </>
              )}

              {selectedTemplate.status === "archived" && (
                <>
                  <button
                    onClick={handleDuplicateTemplate}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-indigo-50 border border-indigo-150 hover:bg-indigo-100/70 text-indigo-700 disabled:opacity-50 text-xs font-black rounded-xl transition-all shadow-sm cursor-pointer"
                  >
                    <Copy size={14} />
                    <span>Duplikat sebagai Versi Baru</span>
                  </button>
                  <span className="bg-slate-100 text-slate-500 border border-slate-200 px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1 shadow-sm select-none">
                    <Archive size={13} className="text-slate-400 shrink-0" />
                    <span>Arsip (Read-Only)</span>
                  </span>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Success Toast */}
      {showSeedSuccessToast && (
        <div className="bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-2xl p-4 text-left flex items-start gap-3 shadow-sm">
          <div className="p-1 rounded-full bg-emerald-100 text-emerald-700 shrink-0">
            <Check size={14} />
          </div>
          <div className="space-y-0.5">
            <p className="text-xs font-black">Berhasil Memuat Template</p>
            <p className="text-[11px] font-medium text-emerald-600">Template LDSS Usia {age} v1.0 berhasil dibuat sebagai draft.</p>
          </div>
        </div>
      )}

      {/* Specific Info Banner and Summary Chips */}
      {(age === 6 || age === 7 || age === 8 || age === 9 || age === 10 || age === 11 || age === 12) && selectedTemplate && (
        <div className="bg-gradient-to-r from-indigo-50/40 to-indigo-50/10 border border-indigo-100 rounded-3xl p-5 text-left space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-indigo-100 text-indigo-700 rounded-xl shrink-0 mt-0.5 animate-pulse">
                <Info size={16} />
              </div>
              <div className="space-y-1">
                <h4 className="text-xs font-black text-gray-900 tracking-tight">Instrumen Screening Resmi Usia {age} Tahun</h4>
                <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                  Tinjau seluruh indikator sebelum mengaktifkan template. Pengisian oleh guru akan tersedia setelah template aktif.
                </p>
              </div>
            </div>

            {/* Summary Chips */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <span className="px-3 py-1.5 bg-white border border-indigo-100 rounded-xl text-[10px] font-black text-indigo-700 uppercase tracking-wider shadow-sm select-none">
                15 Domain
              </span>
              <span className="px-3 py-1.5 bg-white border border-indigo-100 rounded-xl text-[10px] font-black text-indigo-700 uppercase tracking-wider shadow-sm select-none">
                75 Indikator
              </span>
              <span className="px-3 py-1.5 bg-white border border-indigo-100 rounded-xl text-[10px] font-black text-indigo-700 uppercase tracking-wider shadow-sm select-none">
                Skor Maksimal Nanti: 225
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Editor Workspace Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        
        {/* Left Panel: Version History and Config */}
        <div className="space-y-6 lg:col-span-1 text-left">
          
          {/* Version Selector Card */}
          <div className="bg-white border border-gray-150 rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="text-xs font-black text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
              <History size={14} className="text-slate-400" />
              Riwayat Versi
            </h3>

            {templates.length === 0 ? (
              <p className="text-xs text-slate-400 font-semibold italic">Belum ada versi yang dibuat.</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => handleSwitchVersion(t)}
                    className={`w-full p-2.5 rounded-xl text-xs font-bold text-left flex items-center justify-between border transition-all ${
                      selectedTemplate?.id === t.id
                        ? "bg-indigo-550 border-indigo-600 text-white hover:bg-indigo-600"
                        : "bg-slate-50/50 border-gray-150 text-gray-700 hover:bg-slate-50"
                    }`}
                  >
                    <div className="space-y-0.5 truncate">
                      <p className="truncate font-black">{t.version}</p>
                      <p className={`text-[10px] ${selectedTemplate?.id === t.id ? "text-indigo-100" : "text-slate-400"}`}>
                        {new Date(t.updatedAt).toLocaleDateString("id-ID")}
                      </p>
                    </div>

                    <span className={`px-1.5 py-0.5 rounded text-[9px] uppercase font-black tracking-wide border shrink-0 ${
                      t.status === "active"
                        ? selectedTemplate?.id === t.id ? "bg-white/20 text-white border-white/20" : "bg-emerald-50 text-emerald-700 border-emerald-100"
                        : t.status === "archived"
                        ? selectedTemplate?.id === t.id ? "bg-white/10 text-white border-white/10" : "bg-slate-100 text-slate-500 border-slate-150"
                        : selectedTemplate?.id === t.id ? "bg-white/20 text-white border-white/20" : "bg-amber-50 text-amber-700 border-amber-100"
                    }`}>
                      {t.status === "active" ? "Aktif" : t.status === "archived" ? "Arsip" : "Draft"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Metadata Card */}
          {selectedTemplate && (
            <div className="bg-white border border-gray-150 rounded-2xl p-5 shadow-sm space-y-3.5">
              <h3 className="text-xs font-black text-gray-800 uppercase tracking-wider">
                Detail Versi
              </h3>

              <div className="space-y-3">
                {/* Version input */}
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wide mb-1.5">
                    Label Versi
                  </label>
                  <input
                    type="text"
                    disabled={isReadOnly}
                    value={versionText}
                    onChange={(e) => {
                      setVersionText(e.target.value);
                      setHasUnsavedChanges(true);
                      if (selectedTemplate) {
                        selectedTemplate.version = e.target.value;
                      }
                    }}
                    className={`w-full px-3 py-2 border rounded-xl text-xs font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-100 h-9 transition-colors ${
                      isReadOnly ? "bg-slate-50 border-gray-100 text-gray-400 cursor-not-allowed" : "bg-white border-gray-150 hover:bg-slate-50"
                    }`}
                    placeholder="Contoh: v1.0"
                  />
                </div>

                {/* Metadata list */}
                <div className="pt-2 border-t border-gray-100 space-y-2 text-[10px] text-slate-400 font-bold">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Clock size={11} /> Pembaruan Terakhir
                    </span>
                    <span className="text-gray-600">
                      {new Date(selectedTemplate.updatedAt).toLocaleDateString("id-ID", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit"
                      })}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <User size={11} /> Penyunting
                    </span>
                    <span className="text-gray-600 truncate max-w-[120px]" title={selectedTemplate.createdBy}>
                      {selectedTemplate.createdBy || "System"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span>Jumlah Domain</span>
                    <span className="text-gray-600 font-black">
                      {selectedTemplate.domains.length} Domain
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span>Jumlah Indikator</span>
                    <span className="text-gray-600 font-black">
                      {selectedTemplate.domains.reduce((sum, d) => sum + d.indicators.length, 0)} Indikator
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Panel: Interactive Builder Workspace */}
        <div className="lg:col-span-3 space-y-6">
          
          {/* Validation Banner */}
          <AnimatePresence>
            {showValidationBanner && validationErrors.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="bg-rose-50 border border-rose-100 text-rose-800 rounded-2xl p-5 text-left space-y-2 shadow-sm"
              >
                <div className="flex items-center gap-2 text-rose-700 font-black text-sm">
                  <AlertTriangle size={16} />
                  <span>Validasi Gagal Sebelum Aktivasi</span>
                </div>
                <ul className="list-disc list-inside text-xs font-medium space-y-1 pl-1">
                  {validationErrors.map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
                <div className="pt-2">
                  <button
                    onClick={() => setShowValidationBanner(false)}
                    className="text-xs font-black text-rose-600 hover:text-rose-800 underline cursor-pointer"
                  >
                    Tutup Peringatan
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Empty Workspace State */}
          {!selectedTemplate ? (
            <div className="bg-white rounded-3xl border border-dashed border-gray-200 p-16 shadow-sm text-center flex flex-col items-center justify-center space-y-5">
              <div className="p-4 bg-indigo-50 text-indigo-600 rounded-2xl">
                <FileText size={32} />
              </div>
              <div className="space-y-1.5 max-w-md mx-auto">
                <h4 className="text-base font-black text-gray-900 tracking-tight">Belum Ada Template Usia {age}</h4>
                <p className="text-xs text-slate-500 font-medium leading-relaxed">
                  Belum ada instrumen screening LDSS yang dibuat untuk anak usia {age} tahun di database. Anda dapat merancang dari kosong atau menggunakan template resmi bawaan.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full max-w-md">
                <button
                  onClick={handleCreateTemplate}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 bg-white border border-gray-200 hover:bg-slate-50 text-gray-700 text-xs font-black rounded-xl transition-all shadow-sm cursor-pointer"
                >
                  <Plus size={14} />
                  <span>Buat dari Kosong</span>
                </button>
                {(age === 6 || age === 7 || age === 8 || age === 9 || age === 10 || age === 11 || age === 12) && (
                  <button
                    onClick={handleLoadOfficialTemplate}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl transition-all shadow-sm cursor-pointer"
                  >
                    <Sparkles size={14} className="text-emerald-100" />
                    <span>Muat Template Resmi</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            
            /* Active Builder Workspace Container */
            <div className="space-y-5">
              
              {/* Domain Header Action */}
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black text-gray-800 uppercase tracking-wider">
                  Struktur Instrumen ({selectedTemplate.domains.length} Domain)
                </h3>

                {!isReadOnly && (
                  <div className="flex items-center gap-2">
                    {(age === 6 || age === 7 || age === 8 || age === 9 || age === 10 || age === 11 || age === 12) && (
                      <button
                        onClick={confirmLoadOfficialTemplate}
                        className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-150 hover:bg-emerald-100/70 text-emerald-700 px-3.5 py-2 rounded-xl text-xs font-black transition-all shadow-sm cursor-pointer"
                      >
                        <Sparkles size={13} className="text-emerald-650 shrink-0" />
                        <span>Muat Template Resmi</span>
                      </button>
                    )}
                    <button
                      onClick={handleAddDomain}
                      className="flex items-center gap-1 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100/70 text-indigo-700 px-3.5 py-2 rounded-xl text-xs font-black transition-all shadow-sm cursor-pointer"
                    >
                      <Plus size={14} />
                      <span>Tambah Domain</span>
                    </button>
                  </div>
                )}
              </div>

              {selectedTemplate.domains.length === 0 ? (
                /* No domains yet */
                <div className="bg-white border border-gray-150 rounded-3xl p-12 text-center flex flex-col items-center justify-center space-y-4">
                  <p className="text-xs text-slate-400 font-bold max-w-sm leading-relaxed">
                    Belum ada domain instrumen. Silakan muat template resmi atau tambahkan domain utama secara manual untuk mengelompokkan indikator screening perkembangan.
                  </p>
                  {!isReadOnly && (
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full max-w-md">
                      {(age === 6 || age === 7 || age === 8 || age === 9 || age === 10 || age === 11 || age === 12) && (
                        <button
                          onClick={confirmLoadOfficialTemplate}
                          className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl transition-all shadow-sm cursor-pointer"
                        >
                          <Sparkles size={14} className="text-emerald-100 shrink-0" />
                          <span>Muat Template Resmi</span>
                        </button>
                      )}
                      <button
                        onClick={handleAddDomain}
                        className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 bg-white border border-gray-200 hover:bg-slate-50 text-gray-700 text-xs font-black rounded-xl transition-all shadow-sm cursor-pointer"
                      >
                        <Plus size={14} />
                        <span>Tambah Domain Manual</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                
                /* Accordions List of Domains */
                <div className="space-y-4">
                  {selectedTemplate.domains.map((domain, dIdx) => {
                    const isExpanded = expandedDomains[domain.id] !== false; // Expanded by default

                    return (
                      <motion.div
                        key={domain.id}
                        layout="position"
                        className="bg-white border border-gray-150 rounded-2xl shadow-sm overflow-hidden"
                      >
                        {/* Domain Card Header */}
                        <div className="flex items-center justify-between px-5 py-4 bg-slate-50/50 border-b border-gray-100 gap-4">
                          <div className="flex items-center gap-3 flex-1 min-w-0 text-left">
                            {/* Order indicator */}
                            <span className="w-6 h-6 bg-slate-100 border border-slate-200 text-slate-500 font-black text-[10px] rounded-lg flex items-center justify-center shrink-0">
                              {dIdx + 1}
                            </span>

                            {/* Inline Edit name input */}
                            <input
                              type="text"
                              disabled={isReadOnly}
                              value={domain.name}
                              onChange={(e) => handleEditDomainName(domain.id, e.target.value)}
                              className={`text-sm font-black text-gray-800 bg-transparent border-b border-transparent focus:border-indigo-400 focus:outline-none flex-1 min-w-0 transition-colors py-0.5 ${
                                isReadOnly ? "cursor-default" : "hover:border-slate-300 focus:bg-white px-1 rounded"
                              }`}
                              placeholder="Ketik nama domain..."
                            />
                          </div>

                          {/* Controls (Reorder, expand, delete) */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            {/* Reorder Buttons */}
                            {!isReadOnly && (
                              <div className="flex items-center border border-gray-150 bg-white rounded-lg">
                                <button
                                  disabled={dIdx === 0}
                                  onClick={() => handleMoveDomain(dIdx, "up")}
                                  className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-20 cursor-pointer"
                                  title="Pindahkan ke atas"
                                >
                                  <ArrowUp size={13} />
                                </button>
                                <div className="w-[1px] h-3 bg-gray-100"></div>
                                <button
                                  disabled={dIdx === selectedTemplate.domains.length - 1}
                                  onClick={() => handleMoveDomain(dIdx, "down")}
                                  className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-20 cursor-pointer"
                                  title="Pindahkan ke bawah"
                                >
                                  <ArrowDown size={13} />
                                </button>
                              </div>
                            )}

                            {/* Delete Domain */}
                            {!isReadOnly && (
                              <button
                                onClick={() => confirmDeleteDomain(domain.id, domain.name)}
                                className="p-1.5 bg-white border border-gray-200 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer shadow-sm"
                                title="Hapus Domain"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}

                            {/* Expand/Collapse Toggle */}
                            <button
                              onClick={() => toggleDomainExpanded(domain.id)}
                              className="p-1.5 bg-white border border-gray-200 text-gray-400 hover:text-gray-700 rounded-lg transition-colors cursor-pointer shadow-sm"
                            >
                              {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                            </button>
                          </div>
                        </div>

                        {/* Domain Card Body (Indicators list) */}
                        <AnimatePresence initial={false}>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.15 }}
                              className="border-t border-gray-100 overflow-hidden"
                            >
                              <div className="p-5 space-y-4">
                                {/* Indicators Header inside Card */}
                                <div className="flex items-center justify-between border-b border-slate-50 pb-2">
                                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wide">
                                    Daftar Indikator ({domain.indicators.length})
                                  </span>

                                  {!isReadOnly && (
                                    <button
                                      onClick={() => handleAddIndicator(domain.id)}
                                      className="flex items-center gap-1 text-[10px] font-black text-indigo-600 hover:text-indigo-800 cursor-pointer bg-indigo-50 px-2 py-1 rounded-md"
                                    >
                                      <Plus size={11} />
                                      <span>Tambah Indikator</span>
                                    </button>
                                  )}
                                </div>

                                {domain.indicators.length === 0 ? (
                                  /* Empty Indicators State */
                                  <div className="py-8 text-center bg-slate-50/50 rounded-xl border border-dashed border-gray-150">
                                    <p className="text-xs text-slate-400 font-semibold mb-2">
                                      Belum ada indikator untuk domain ini.
                                    </p>
                                    {!isReadOnly && (
                                      <button
                                        onClick={() => handleAddIndicator(domain.id)}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 hover:bg-slate-50 text-indigo-600 text-[11px] font-black rounded-lg transition-all shadow-sm cursor-pointer"
                                      >
                                        <Plus size={12} />
                                        <span>Tambah Indikator</span>
                                      </button>
                                    )}
                                  </div>
                                ) : (
                                  
                                  /* Indicators Cards List inside domain */
                                  <div className="space-y-2.5">
                                    {domain.indicators.map((indicator, indIdx) => (
                                      <div
                                        key={indicator.id}
                                        className="flex items-start bg-slate-50/30 border border-gray-150 rounded-xl p-3 gap-3 hover:bg-slate-50/50 transition-colors"
                                      >
                                        {/* Renumber labels */}
                                        <span className="w-5 h-5 bg-white border border-gray-150 text-slate-400 text-[10px] font-black rounded flex items-center justify-center shrink-0 mt-0.5">
                                          {indIdx + 1}
                                        </span>

                                        {/* Indicator Text Area (supports auto wraps) */}
                                        <textarea
                                          disabled={isReadOnly}
                                          value={indicator.text}
                                          onChange={(e) => handleEditIndicatorText(domain.id, indicator.id, e.target.value)}
                                          rows={2}
                                          className={`text-xs font-semibold text-gray-700 bg-transparent border border-transparent focus:border-indigo-200 focus:bg-white focus:outline-none flex-1 py-1 px-1.5 rounded transition-all resize-none ${
                                            isReadOnly ? "cursor-default border-none focus:ring-0 p-0" : "hover:bg-white hover:border-gray-150"
                                          }`}
                                          placeholder="Ketik teks indikator di sini..."
                                        />

                                        {/* Controls (Reorder & delete indicator) */}
                                        <div className="flex items-center gap-1 shrink-0 self-center">
                                          {!isReadOnly && (
                                            <div className="flex flex-col border border-gray-150 bg-white rounded-md overflow-hidden shadow-sm">
                                              <button
                                                disabled={indIdx === 0}
                                                onClick={() => handleMoveIndicator(domain.id, indIdx, "up")}
                                                className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-20 cursor-pointer"
                                              >
                                                <ChevronUp size={11} />
                                              </button>
                                              <div className="h-[1px] bg-gray-100"></div>
                                              <button
                                                disabled={indIdx === domain.indicators.length - 1}
                                                onClick={() => handleMoveIndicator(domain.id, indIdx, "down")}
                                                className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-20 cursor-pointer"
                                              >
                                                <ChevronDown size={11} />
                                              </button>
                                            </div>
                                          )}

                                          {!isReadOnly && (
                                            <button
                                              onClick={() => confirmDeleteIndicator(domain.id, indicator.id, indicator.text)}
                                              className="p-1.5 bg-white border border-gray-150 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer shadow-sm"
                                            >
                                              <Trash2 size={12} />
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Modals Portal (AnimatePresence) */}
      <AnimatePresence>
        {confirmModal && (
          <div className="fixed inset-0 z-55 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => setConfirmModal(null)}
            ></motion.div>

            {/* Modal Dialog Content */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="relative bg-white border border-gray-150 rounded-3xl p-6 shadow-2xl max-w-md w-full text-left space-y-4"
            >
              {/* Alert Triangle for destructive operations */}
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl shrink-0 ${
                  confirmModal.type === "delete_domain" || confirmModal.type === "delete_indicator"
                    ? "bg-rose-50 text-rose-600"
                    : confirmModal.type === "leave"
                    ? "bg-amber-50 text-amber-600"
                    : "bg-indigo-50 text-indigo-600"
                }`}>
                  <AlertTriangle size={20} />
                </div>
                <h4 className="text-base font-black text-gray-900 tracking-tight">
                  {confirmModal.title}
                </h4>
              </div>

              <p className="text-xs text-slate-500 font-medium leading-relaxed">
                {confirmModal.message}
              </p>

              {/* Action buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  onClick={() => setConfirmModal(null)}
                  className="px-4 py-2.5 bg-slate-50 border border-gray-200 hover:bg-slate-100 text-gray-700 text-xs font-black rounded-xl transition-all cursor-pointer shadow-sm"
                >
                  Batal
                </button>

                <button
                  onClick={() => {
                    if (confirmModal.type === "delete_domain" && confirmModal.targetId) {
                      executeDeleteDomain(confirmModal.targetId);
                    } else if (confirmModal.type === "delete_indicator" && confirmModal.targetId && confirmModal.parentId) {
                      executeDeleteIndicator(confirmModal.parentId, confirmModal.targetId);
                    } else if (confirmModal.type === "leave") {
                      setConfirmModal(null);
                      setHasUnsavedChanges(false);
                      if (confirmModal.targetId) {
                        executeSwitchVersion(confirmModal.targetId);
                      } else {
                        navigate("/elementary/ldss/settings");
                      }
                    } else if (confirmModal.type === "activate") {
                      executeActivateTemplate();
                    } else if (confirmModal.type === "archive") {
                      executeArchiveTemplate();
                    } else if (confirmModal.type === "load_official_confirm") {
                      handleLoadOfficialTemplate();
                      setConfirmModal(null);
                    }
                  }}
                  className={`px-4 py-2.5 text-xs font-black rounded-xl transition-all shadow-sm cursor-pointer text-white ${
                    confirmModal.type === "delete_domain" || confirmModal.type === "delete_indicator"
                      ? "bg-rose-600 hover:bg-rose-700"
                      : confirmModal.type === "leave"
                      ? "bg-amber-500 hover:bg-amber-600"
                      : confirmModal.type === "load_official_confirm"
                      ? "bg-emerald-600 hover:bg-emerald-700"
                      : "bg-indigo-600 hover:bg-indigo-700"
                  }`}
                >
                  Ya, Lanjutkan
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
