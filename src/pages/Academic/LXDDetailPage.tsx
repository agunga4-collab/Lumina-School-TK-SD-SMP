import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { jsPDF } from 'jspdf';
import { 
  Plus, Search, Filter, Trash2, Edit2, BookOpen, 
  ChevronLeft, AlertCircle, Loader2, Calendar, User, 
  Tag, Clock, CheckCircle2, FileText, Layers, Map,
  CheckCircle, Target, Smile, Brain, Sparkles, Footprints,
  Type, Download, Share2, Globe, Lock, Printer, X, Save,
  History, UserCheck, HardDrive, ExternalLink
} from 'lucide-react';
import { useOutletContext, useNavigate, useParams, Link } from 'react-router-dom';
import { 
  getLXDById, 
  deleteLXD, 
  updateLXD, 
  getLearningGoals,
  auth
} from '../../lib/firebase';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  getDocs,
  doc,
  getDoc
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { LXD, User as AppUser, LXDType, LearningGoal, LXDStatus, LXDApproval, AppNotification } from '../../types';
import { cn } from '../../lib/utils';
import axios from 'axios';

const STRAND_LABELS = {
  moralSpiritual: "Moral-Spiritual Strand",
  imaginal: "Imaginal Strand",
  rational: "Rational Strand",
  materialPhysical: "Material-Physical Strand"
};

const STRAND_ICONS = {
  moralSpiritual: <Smile size={23} className="text-pink-500" />,
  imaginal: <Sparkles size={23} className="text-purple-500" />,
  rational: <Brain size={23} className="text-blue-500" />,
  materialPhysical: <Footprints size={23} className="text-emerald-500" />
};

export default function LXDDetailPage() {
  const { currentUser } = useOutletContext<{ currentUser: AppUser }>();
  const { id } = useParams();
  const navigate = useNavigate();
  const [lx, setLx] = React.useState<LXD | null>(null);
  const [lgs, setLgs] = React.useState<LearningGoal[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [rejectModalOpen, setRejectModalOpen] = React.useState(false);
  const [rejectionNote, setRejectionNote] = React.useState('');
  const [processingApproval, setProcessingApproval] = React.useState(false);
  const [currentUserData, setCurrentUserData] = React.useState<any>(null);
  const [backingUp, setBackingUp] = React.useState(false);
  const [backupPreviewModalOpen, setBackupPreviewModalOpen] = React.useState(false);
  const [tempPdfBase64, setTempPdfBase64] = React.useState<string | null>(null);

  React.useEffect(() => {
    const fetchUserData = async () => {
      if (!auth.currentUser) return;
      try {
        const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
        if (userDoc.exists()) {
          setCurrentUserData(userDoc.data());
        }
      } catch (err) {
        console.error("Error fetching user data:", err);
      }
    };
    fetchUserData();
  }, []);
  
  const handlePrint = () => {
    if (!lx) return;

    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) {
      alert('Please allow popups for this site to print.');
      return;
    }

    const lxdTypeLabel = {
      'WEEKLY_LESSONS': 'Weekly Lessons',
      'UNIT_AKTIVITAS': 'Unit Aktivitas',
      'LEARNING_JOURNEY': 'Learning Journey'
    }[lx.type] || lx.type;

    const semesterLabel = lx.semester === '1' ? 'Semester 1' : 'Semester 2';

    const strandHTML = (label: string, strand: any) => `
      <div class="strand-card">
        <div class="strand-name">${label}</div>
        ${strand?.indicators?.length > 0 ? `
          <div class="strand-label">INDICATORS</div>
          <ul>${strand.indicators.map((i: string) => `<li>${i}</li>`).join('')}</ul>
        ` : '<div class="strand-label">INDICATORS</div><p>-</p>'}
        <div class="strand-label" style="margin-top:6px">EXPERIENCE</div>
        <p class="strand-value">${strand?.narrative || '-'}</p>
      </div>
    `;

    const meetingHTML = (meeting: any, index: number) => `
      <div class="meeting-block">
        <div class="meeting-number">MEETING ${meeting.meetingNumber || index + 1}</div>
        <div class="meeting-title">${meeting.title || '-'}</div>
        ${meeting.learningObjective?.length > 0 ? `
          <div class="meeting-label">LEARNING OBJECTIVES</div>
          <ul>${meeting.learningObjective.map((lo: string) => `<li>${lo}</li>`).join('')}</ul>
        ` : ''}
        ${meeting.opening ? `<div class="meeting-label">OPENING</div><p>${meeting.opening}</p>` : ''}
        ${meeting.mainActivities ? `<div class="meeting-label">MAIN ACTIVITIES</div><p>${meeting.mainActivities}</p>` : ''}
        ${meeting.closing ? `<div class="meeting-label">CLOSING</div><p>${meeting.closing}</p>` : ''}
        ${meeting.assessmentNotes ? `<div class="meeting-label">ASSESSMENT NOTES</div><p>${meeting.assessmentNotes}</p>` : ''}
      </div>
    `;

    const rubricHTML = lx.rubric?.length > 0 ? `
      <table>
        <thead>
          <tr>
            <th>Learning Goal / Criteria</th>
            <th>Beginning</th>
            <th>Developing</th>
            <th>Achieved</th>
          </tr>
        </thead>
        <tbody>
          ${lx.rubric.map((row: any) => {
            const lg = lgs.find(g => g.id === row.goalId);
            return `
              <tr>
                <td>
                  <strong>${lg?.code || 'GOAL_NOT_FOUND'}</strong><br>
                  <span>${row.criteriaLabel || '-'}</span><br>
                  <small>Assessed in Meeting ${row.assessedInMeeting}</small>
                </td>
                <td>${row.beginning || '-'}</td>
                <td>${row.developing || '-'}</td>
                <td>${row.achieved || '-'}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    ` : '<p>No rubric defined.</p>';

    const signaturesHTML = `
      <div class="signatures">
        <div class="sig-box">
          <div class="sig-label">SUBJECT TEACHER</div>
          <div class="sig-image">
            ${lx.signatures?.subjectTeacher?.signatureUrl
              ? `<img src="${lx.signatures.subjectTeacher.signatureUrl}" />`
              : '<div style="height:50px;border-bottom:1px solid #999;width:100px;margin:auto"></div>'
            }
          </div>
          <div class="sig-name">${lx.signatures?.subjectTeacher?.name || '___________________'}</div>
          <div class="sig-niy">NIY: ${lx.signatures?.subjectTeacher?.niy || '-'}</div>
        </div>
        <div class="sig-box">
          <div class="sig-label">SUBMISSION DATE</div>
          <div style="margin-top:24px;font-size:11pt">
            ${lx.signatures?.submissionDate || '___________________'}
          </div>
        </div>
        <div class="sig-box">
          <div class="sig-label">PRINCIPAL</div>
          <div class="sig-image">
            ${lx.signatures?.principal?.signatureUrl
              ? `<img src="${lx.signatures.principal.signatureUrl}" />`
              : '<div style="height:50px;border-bottom:1px solid #999;width:100px;margin:auto"></div>'
            }
          </div>
          <div class="sig-name">${lx.signatures?.principal?.name || '___________________'}</div>
          <div class="sig-niy">NIY: ${lx.signatures?.principal?.niy || '-'}</div>
        </div>
      </div>
    `;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>LXD - ${lx.title}</title>
        <meta charset="UTF-8">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: Arial, sans-serif;
            font-size: 10.5pt;
            color: #000;
            background: #fff;
            padding: 20mm 18mm;
            line-height: 1.5;
          }
          h1 { font-size: 18pt; font-weight: 900; color: #002366; margin: 6px 0; }
          h2 { font-size: 12pt; font-weight: bold; color: #002366;
               border-bottom: 2px solid #002366; padding-bottom: 4px;
               margin: 18px 0 10px; text-transform: uppercase; }
          p { margin-bottom: 6px; }
          ul { padding-left: 16px; margin-bottom: 6px; }
          li { margin-bottom: 2px; }

          .doc-header { text-align: center; margin-bottom: 20px; padding-bottom: 14px; border-bottom: 2px solid #002366; }
          .school-name { font-size: 9pt; letter-spacing: 2px; color: #666; text-transform: uppercase; }
          .lxd-type-badge { display: inline-block; background: #002366; color: white; font-size: 8pt; padding: 2px 10px; border-radius: 10px; margin: 6px 0; text-transform: uppercase; }
          .meta-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 12px 0; border: 1px solid #ddd; padding: 10px; border-radius: 4px; }
          .meta-item .meta-label { font-size: 7.5pt; color: #888; text-transform: uppercase; }
          .meta-item .meta-value { font-size: 10pt; font-weight: bold; }

          .strand-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px; }
          .strand-card { border: 1px solid #ddd; padding: 8px; border-radius: 4px; }
          .strand-name { font-weight: bold; font-size: 9.5pt; text-transform: uppercase; margin-bottom: 4px; }
          .strand-label { font-size: 7.5pt; color: #888; text-transform: uppercase; margin-top: 6px; margin-bottom: 2px; }
          .strand-value { font-style: italic; font-size: 9.5pt; }

          .overview-item { border: 1px solid #eee; padding: 8px; border-radius: 4px; margin-bottom: 10px; }
          .overview-label { font-size: 7.5pt; color: #888; text-transform: uppercase; margin-bottom: 4px; }

          .meeting-block { border: 1px solid #eee; padding: 10px; margin-bottom: 10px; border-radius: 4px; page-break-inside: avoid; }
          .meeting-number { background: #002366; color: white; font-size: 8pt; font-weight: bold; padding: 2px 8px; border-radius: 3px; display: inline-block; margin-bottom: 6px; }
          .meeting-title { font-weight: bold; font-size: 10pt; margin-bottom: 6px; }
          .meeting-label { font-size: 7.5pt; color: #888; text-transform: uppercase; margin-top: 6px; margin-bottom: 2px; }

          table { width: 100%; border-collapse: collapse; margin-bottom: 12px; page-break-inside: avoid; }
          th { background: #002366; color: white; padding: 6px 8px; text-align: left; font-size: 9.5pt; }
          td { padding: 6px 8px; border: 1px solid #ddd; font-size: 9.5pt; vertical-align: top; }
          tr:nth-child(even) td { background: #f9f9f9; }

          .signatures { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-top: 24px; page-break-inside: avoid; }
          .sig-box { text-align: center; border: 1px solid #ddd; padding: 12px; border-radius: 4px; }
          .sig-label { font-size: 8pt; text-transform: uppercase; color: #777; margin-bottom: 8px; }
          .sig-image { height: 60px; display: flex; align-items: center; justify-content: center; margin-bottom: 8px; }
          .sig-image img { max-height: 60px; max-width: 120px; }
          .sig-name { font-size: 10pt; font-weight: bold; margin-top: 6px; }
          .sig-niy { font-size: 9pt; color: #555; }

          .print-footer { margin-top: 20px; padding-top: 8px; border-top: 1px solid #ddd; text-align: center; font-size: 7.5pt; color: #999; }

          @page { size: A4 portrait; margin: 15mm; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>

        <div class="doc-header">
          <div class="school-name">Lazuardi Global Compassionate School — Junior High</div>
          <div class="lxd-type-badge">Learning Experience Design — ${lxdTypeLabel}</div>
          <h1>${lx.title}</h1>
        </div>

        <div class="meta-grid">
          <div class="meta-item"><div class="meta-label">Subject</div><div class="meta-value">${lx.subject || '-'}</div></div>
          <div class="meta-item"><div class="meta-label">Grade</div><div class="meta-value">${lx.grade || lx.grades?.join(', ') || '-'}</div></div>
          <div class="meta-item"><div class="meta-label">Academic Year</div><div class="meta-value">${lx.academicYear || '-'}</div></div>
          <div class="meta-item"><div class="meta-label">Semester</div><div class="meta-value">${semesterLabel}</div></div>
          <div class="meta-item"><div class="meta-label">Weeks</div><div class="meta-value">${lx.weeks || '-'}</div></div>
          <div class="meta-item"><div class="meta-label">Duration</div><div class="meta-value">${lx.duration || '-'}</div></div>
          <div class="meta-item"><div class="meta-label">Meetings</div><div class="meta-value">${lx.numberOfMeetings || (lx.meetings?.length) || '-'}</div></div>
          <div class="meta-item"><div class="meta-label">Created By</div><div class="meta-value">${lx.createdBy || '-'}</div></div>
        </div>

        <h2>1. Integral Education Strands</h2>
        <div class="strand-grid">
          ${strandHTML(STRAND_LABELS.moralSpiritual, lx.integralStrands?.moralSpiritual)}
          ${strandHTML(STRAND_LABELS.imaginal, lx.integralStrands?.imaginal)}
          ${strandHTML(STRAND_LABELS.rational, lx.integralStrands?.rational)}
          ${strandHTML(STRAND_LABELS.materialPhysical, lx.integralStrands?.materialPhysical)}
        </div>

        <h2>2. Lesson Overview</h2>
        <div class="overview-section">
          ${lx.generativeTopics ? `<div class="overview-item"><div class="overview-label">Generative Topics</div><p>${Array.isArray(lx.generativeTopics) ? lx.generativeTopics.join(', ') : lx.generativeTopics}</p></div>` : ''}
          ${lx.essentialQuestion ? `<div class="overview-item"><div class="overview-label">Essential Question</div><p><i>"${lx.essentialQuestion}"</i></p></div>` : ''}
          <div class="overview-item">
            <div class="overview-label">Linked Goals</div>
            <ul>
              ${lgs.map(lg => `<li><strong>${lg.code}:</strong> ${lg.goalText}</li>`).join('')}
            </ul>
          </div>
          ${lx.type === 'LEARNING_JOURNEY' ? `
            <div class="overview-item"><div class="overview-label">Learning Experience Overview</div><p>${lx.learningExperienceOverview || '-'}</p></div>
            <div class="overview-item"><div class="overview-label">Meet the Expert</div><p>${lx.meetTheExpert || '-'}</p></div>
            <div class="overview-item"><div class="overview-label">Materials and Resources</div><p>${lx.materialsAndResources || '-'}</p></div>
          ` : ''}
        </div>

        <h2>3. Meetings & Detailed Activities</h2>
        <div class="meetings-section">
          ${lx.type === 'WEEKLY_LESSONS' ? (lx.meetings || []).map((m, i) => meetingHTML(m, i)).join('') : ''}
          ${lx.type === 'UNIT_AKTIVITAS' ? (lx.subUnits || []).map(su => `
            <div style="margin-bottom:20px">
              <h3 style="background:#f0f4f8;padding:4px 8px;border-radius:4px;margin-bottom:10px">UA${su.uaNumber}: ${su.uaTitle}</h3>
              ${su.meetings.map((m: any, i: number) => meetingHTML(m, i)).join('')}
            </div>
          `).join('') : ''}
          ${lx.type === 'LEARNING_JOURNEY' ? (lx.milestones || []).map(ml => `
            <div style="margin-bottom:20px">
              <h3 style="background:#e6fffa;color:#2c7a7b;padding:4px 8px;border-radius:4px;margin-bottom:10px">M${ml.milestoneNumber}: ${ml.milestoneTitle}</h3>
              ${ml.meetings.map((m: any, i: number) => meetingHTML(m, i)).join('')}
            </div>
          `).join('') : ''}
        </div>

        <h2>4. Differentiated Instruction</h2>
        <table>
          <thead>
            <tr><th>Element</th><th>Description</th></tr>
          </thead>
          <tbody>
            <tr><td>Content</td><td>${lx.differentiatedInstruction?.content || '-'}</td></tr>
            <tr><td>Process</td><td>${lx.differentiatedInstruction?.process || '-'}</td></tr>
            <tr><td>Product</td><td>${lx.differentiatedInstruction?.product || '-'}</td></tr>
            <tr><td>Environment</td><td>${lx.differentiatedInstruction?.environment || '-'}</td></tr>
          </tbody>
        </table>

        <h2>5. Assessment Rubric</h2>
        ${rubricHTML}

        <h2>6. Submission & Signatures</h2>
        ${signaturesHTML}

        <div class="print-footer">
          Printed from Lumina — Lazuardi GCS Junior High — ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
        
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
              window.close();
            }, 800);
          };
        </script>
      </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
  };
  
  // Signatures form state
  const [sigForm, setSigForm] = React.useState({
    submissionDate: '',
    principal: { name: '', niy: '' },
    subjectTeacher: { name: '', niy: '' }
  });
  const [savingSigs, setSavingSigs] = React.useState(false);

  const fetchData = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const data = await getLXDById(id);
      if (data) {
        setLx(data);
        if (data.signatures) {
          setSigForm({
            submissionDate: data.signatures.submissionDate || '',
            principal: { 
              name: data.signatures.principal?.name || '', 
              niy: data.signatures.principal?.niy || '' 
            },
            subjectTeacher: { 
              name: data.signatures.subjectTeacher?.name || '', 
              niy: data.signatures.subjectTeacher?.niy || '' 
            }
          });
        }
        // Fetch LG texts
        const lgIds = data.type !== 'LEARNING_JOURNEY' 
          ? (data.linkedGoals as string[]) 
          : (data.linkedGoals as any[]).map(x => x.goalId);
        
        if (lgIds.length > 0) {
           const allLgs = await getLearningGoals({ unitId: data?.unitId });
           setLgs(allLgs.filter(g => lgIds.includes(g.id)));
        }
      }
    } catch (error) {
      console.error("Error fetching LXD:", error);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchData();
  }, [id]);

  const handleDelete = async () => {
    if (!lx || !confirm("Hapus LXD ini secara permanen?")) return;
    try {
      await deleteLXD(lx.id);
      navigate('/academic/lxd');
    } catch (error: any) {
      alert(error.message);
    }
  };

  const handleSaveSignatures = async () => {
    if (!lx) return;
    try {
      setSavingSigs(true);
      await updateLXD(lx.id, { signatures: sigForm });
      setLx({ ...lx, signatures: sigForm });
      alert("Signatures saved successfully.");
    } catch (error: any) {
      alert(error.message);
    } finally {
      setSavingSigs(false);
    }
  };

  const handleSubmitForApproval = async () => {
    if (!lx || !currentUser) return;
    try {
      setProcessingApproval(true);
      const approvalData: LXDApproval = {
        status: "PENDING",
        submittedBy: currentUser.email,
        submittedByName: currentUser.displayName,
        submittedAt: Date.now(),
        reviewedBy: null,
        reviewedByName: null,
        reviewedAt: null,
        rejectionNote: null
      };

      await updateLXD(lx.id, { 
        status: "PENDING_APPROVAL",
        approval: approvalData
      });

      // Send notifications to SUPER_ADMIN and HEAD_UNIT
      const adminsQuery = query(
        collection(db, 'users'),
        where('role', 'in', ['SUPER_ADMIN', 'HEAD_UNIT'])
      );
      const adminSnapshot = await getDocs(adminsQuery);
      
      const notificationPromises = adminSnapshot.docs.map(adminDoc => {
        const admin = adminDoc.data();
        if (admin.email === currentUser.email) return Promise.resolve(); // Skip self
        
        return addDoc(collection(db, 'notifications'), {
          userId: admin.email,
          type: 'LXD_SUBMITTED_FOR_APPROVAL',
          message: `LXD "${lx.title}" telah disubmit untuk approval oleh ${currentUser.displayName}`,
          link: `/academic/lxd/${lx.id}`,
          isRead: false,
          createdAt: Date.now()
        });
      });

      await Promise.all(notificationPromises);
      
      await fetchData();
      alert("LXD submitted for approval");
    } catch (error: any) {
      alert(error.message);
    } finally {
      setProcessingApproval(false);
    }
  };

  const handleApprove = async () => {
    if (!lx || !currentUser) return;
    try {
      setProcessingApproval(true);
      const approvalData: LXDApproval = {
        ...(lx.approval as LXDApproval),
        status: "APPROVED",
        reviewedBy: currentUser.email,
        reviewedByName: currentUser.displayName,
        reviewedAt: Date.now()
      };

      await updateLXD(lx.id, { 
        status: "PUBLISHED",
        approval: approvalData
      });

      // Send notification to submitter
      if (lx.approval?.submittedBy) {
        await addDoc(collection(db, 'notifications'), {
          userId: lx.approval.submittedBy,
          type: 'LXD_APPROVED',
          message: `LXD "${lx.title}" telah disetujui oleh ${currentUser.displayName}`,
          link: `/academic/lxd/${lx.id}`,
          isRead: false,
          createdAt: Date.now()
        });
      }

      await fetchData();
      alert("LXD approved and published");
    } catch (error: any) {
      alert(error.message);
    } finally {
      setProcessingApproval(false);
    }
  };

  const handleConfirmReject = async () => {
    if (!lx || !currentUser || !rejectionNote.trim()) {
      alert("Please provide a rejection note.");
      return;
    }
    try {
      setProcessingApproval(true);
      const approvalData: LXDApproval = {
        ...(lx.approval as LXDApproval),
        status: "REJECTED",
        reviewedBy: currentUser.email,
        reviewedByName: currentUser.displayName,
        reviewedAt: Date.now(),
        rejectionNote: rejectionNote
      };

      await updateLXD(lx.id, { 
        status: "REJECTED",
        approval: approvalData
      });

      // Send notification to submitter
      if (lx.approval?.submittedBy) {
        await addDoc(collection(db, 'notifications'), {
          userId: lx.approval.submittedBy,
          type: 'LXD_REJECTED',
          message: `LXD "${lx.title}" ditolak oleh ${currentUser.displayName}. Alasan: ${rejectionNote}`,
          link: `/academic/lxd/${lx.id}`,
          isRead: false,
          createdAt: Date.now()
        });
      }

      setRejectModalOpen(false);
      setRejectionNote('');
      await fetchData();
      alert("LXD rejected");
    } catch (error: any) {
      alert(error.message);
    } finally {
      setProcessingApproval(false);
    }
  };

  const generateLxdPdfBase64 = async (lxdData: LXD | null, learningGoals: LearningGoal[]): Promise<string> => {
    if (!lxdData) throw new Error('LXD data is not available');
    
    const doc = new jsPDF();
    const margin = 15;
    const maxWidth = 180;
    let y = 20;

    const checkPageBreak = (needed: number) => {
      if (y + needed > 270) {
        doc.addPage();
        y = 20;
        return true;
      }
      return false;
    };

    const drawSectionHeader = (title: string) => {
      checkPageBreak(20);
      doc.setFillColor(0, 35, 102); // #002366
      doc.rect(margin, y, 3, 8, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(0, 35, 102);
      doc.text(title.toUpperCase(), margin + 6, y + 6);
      y += 12;
    };

    const drawText = (text: string, options: { fontSize?: number, fontStyle?: 'normal'|'bold'|'italic', color?: [number, number, number], spacing?: number } = {}) => {
      const { fontSize = 10, fontStyle = 'normal', color = [0, 0, 0], spacing = 5 } = options;
      doc.setFont('helvetica', fontStyle);
      doc.setFontSize(fontSize);
      doc.setTextColor(color[0], color[1], color[2]);
      
      const lines = doc.splitTextToSize(text || '-', maxWidth);
      const lineHeight = fontSize * 0.5;
      const height = lines.length * lineHeight;
      checkPageBreak(height + spacing);
      doc.text(lines, margin, y);
      y += height + spacing;
    };

    // 1. Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(100);
    doc.text('Lazuardi GCS Junior High', 105, y, { align: 'center' });
    y += 10;
    
    doc.setFontSize(18);
    doc.setTextColor(0, 35, 102);
    const titleLines = doc.splitTextToSize(lxdData.title || '-', 170);
    doc.text(titleLines, 105, y, { align: 'center' });
    y += (titleLines.length * 8) + 5;

    const lxdTypeLabel = {
      'WEEKLY_LESSONS': 'Weekly Lessons',
      'UNIT_AKTIVITAS': 'Unit Aktivitas',
      'LEARNING_JOURNEY': 'Learning Journey'
    }[lxdData.type] || lxdData.type;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'italic');
    doc.text(`Learning Experience Design: ${lxdTypeLabel.toUpperCase()}`, 105, y, { align: 'center' });
    y += 15;

    // 2. Metadata
    drawSectionHeader('Project Metadata');
    const drawMetadataField = (label: string, value: string) => {
        checkPageBreak(8);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(150);
        doc.text(label.toUpperCase(), margin, y);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(0);
        doc.text(value || '-', margin + 45, y);
        y += 7;
    };

    drawMetadataField('Subject', lxdData.subject || '-');
    drawMetadataField('Grade', lxdData.grade || lxdData.grades?.join(', ') || '-');
    drawMetadataField('Academic Year', lxdData.academicYear || '-');
    drawMetadataField('Semester', lxdData.semester === '1' ? 'Semester 1' : 'Semester 2');
    drawMetadataField('Status', lxdData.status || '-');
    drawMetadataField('Created By', lxdData.createdBy || '-');
    y += 10;

    // 3. Integral Education Strands
    drawSectionHeader('Integral Education Strands');
    const strands = [
        { key: 'moralSpiritual', label: STRAND_LABELS.moralSpiritual },
        { key: 'imaginal', label: STRAND_LABELS.imaginal },
        { key: 'rational', label: STRAND_LABELS.rational },
        { key: 'materialPhysical', label: STRAND_LABELS.materialPhysical }
    ];

    strands.forEach(s => {
        const data = lxdData.integralStrands?.[s.key as keyof typeof lxdData.integralStrands];
        if (!data) return;
        
        drawText(s.label, { fontStyle: 'bold', fontSize: 11, color: [0, 35, 102] });
        drawText('Indicators:', { fontStyle: 'bold', fontSize: 9, color: [150, 150, 150], spacing: 2 });
        if (data.indicators && data.indicators.length > 0) {
            data.indicators.forEach((ind: string) => {
                drawText(`• ${ind}`, { fontSize: 9, spacing: 4 });
            });
        } else {
            drawText('-', { fontSize: 9 });
        }
        drawText('Narrative:', { fontStyle: 'bold', fontSize: 9, color: [150, 150, 150], spacing: 2 });
        drawText(data.narrative || '-', { fontStyle: 'italic', fontSize: 9 });
        y += 5;
    });

    // 4. Lesson Overview
    drawSectionHeader('Lesson Overview');
    drawText('Generative Topics:', { fontStyle: 'bold', fontSize: 10, color: [100, 100, 100], spacing: 2 });
    drawText(Array.isArray(lxdData.generativeTopics) ? lxdData.generativeTopics.join(', ') : (lxdData.generativeTopics || '-'), { fontSize: 10 });
    
    drawText('Driving Questions:', { fontStyle: 'bold', fontSize: 10, color: [100, 100, 100], spacing: 2 });
    drawText(lxdData.essentialQuestion || '-', { fontStyle: 'italic', fontSize: 10 });
    
    drawText('Learning Goals:', { fontStyle: 'bold', fontSize: 10, color: [100, 100, 100], spacing: 2 });
    learningGoals.forEach(lg => {
        drawText(`${lg.code}: ${lg.goalText}`, { fontSize: 10, spacing: 4 });
    });
    y += 10;

    // 5. Assessment Rubrics
    if (lxdData.rubric && lxdData.rubric.length > 0) {
        drawSectionHeader('Assessment Rubrics');
        lxdData.rubric.forEach((row: any) => {
            const lg = learningGoals.find(g => g.id === row.goalId);
            checkPageBreak(35);
            drawText(`Goal: ${lg?.code || '?'}${row.criteriaLabel ? ` - ${row.criteriaLabel}` : ''}`, { fontStyle: 'bold', fontSize: 10 });
            drawText(`Beginning: ${row.beginning || '-'}`, { fontSize: 9, spacing: 3 });
            drawText(`Developing: ${row.developing || '-'}`, { fontSize: 9, spacing: 3 });
            drawText(`Achieved: ${row.achieved || '-'}`, { fontSize: 9, spacing: 3 });
            y += 5;
        });
    }

    // 6. Tanda tangan
    checkPageBreak(60);
    drawSectionHeader('Submission & Signatures');
    drawText(`Submission Date: ${lxdData.signatures?.submissionDate || '-'}`, { fontSize: 10 });
    
    y += 10;
    const sigY = y;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Principal', margin, sigY);
    doc.text('Subject Teacher', margin + 95, sigY);
    
    y += 20;
    doc.setFont('helvetica', 'normal');
    doc.text(lxdData.signatures?.principal?.name || '____________________', margin, y);
    doc.text(lxdData.signatures?.subjectTeacher?.name || '____________________', margin + 95, y);
    
    y += 5;
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(`NIY: ${lxdData.signatures?.principal?.niy || '-'}`, margin, y);
    doc.text(`NIY: ${lxdData.signatures?.subjectTeacher?.niy || '-'}`, margin + 95, y);
    
    // Header & Footer on each page
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(180);
        // Page Header
        doc.text('Lazuardi GCS Junior High - LXD Document', margin, 10);
        doc.text(lxdData.title?.substring(0, 50) || '-', 195, 10, { align: 'right' });
        // Page Footer
        doc.text(`Halaman ${i} dari ${pageCount}`, 195, 285, { align: 'right' });
    }

    return doc.output('datauristring').split(',')[1];
  };

  const handleBackupToDrive = async () => {
    if (!lx) {
      alert("Data LXD belum tersedia");
      return;
    }
    if (lx.status !== 'PUBLISHED') {
      alert("Only PUBLISHED LXD can be backed up to Drive.");
      return;
    }

    try {
      setBackingUp(true);
      const pdfBase64 = await generateLxdPdfBase64(lx, lgs);
      setTempPdfBase64(pdfBase64);
      setBackupPreviewModalOpen(true);
    } catch (error: any) {
      console.error("Backup preview error:", error);
      alert("Gagal membuat preview PDF.");
    } finally {
      setBackingUp(false);
    }
  };

  const confirmBackup = async () => {
    if (!lx || !tempPdfBase64) return;
    
    try {
      setBackingUp(true);
      const response = await axios.post('/api/lxd-backup', {
        lxdId: lx.id,
        pdfBase64: tempPdfBase64
      });

      if (response.data.ok) {
        alert("LXD successfully backed up to Google Drive!");
        setBackupPreviewModalOpen(false);
        setTempPdfBase64(null);
        await fetchData();
      } else {
        alert("Backup failed: " + response.data.message);
      }
    } catch (error: any) {
      console.error("Backup error:", error);
      alert("Backup error: " + (error.response?.data?.message || error.message));
    } finally {
      setBackingUp(false);
    }
  };

  const viewTempPdf = () => {
    if (!tempPdfBase64) return;
    try {
      const blob = new Blob(
        [Uint8Array.from(atob(tempPdfBase64), c => c.charCodeAt(0))],
        { type: 'application/pdf' }
      );
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (err) {
      console.error("Preview error:", err);
      alert("Gagal membuka PDF.");
    }
  };

  if (loading) return (
     <div className="py-40 text-center">
        <Loader2 size={40} className="text-blue-100 animate-spin mx-auto mb-4" />
        <p className="text-gray-400 font-bold uppercase tracking-widest text-sm">Loading LXD Details...</p>
     </div>
  );

  if (!lx) return (
    <div className="py-40 text-center space-y-6">
       <AlertCircle size={64} className="text-gray-100 mx-auto" />
       <h2 className="text-2xl font-black text-gray-300 uppercase tracking-tighter italic">LXD Not Found</h2>
       <button onClick={() => navigate('/academic/lxd')} className="px-8 py-4 bg-gray-50 text-gray-400 rounded-3xl font-bold uppercase text-xs">Back to List</button>
    </div>
  );

  const userRole = currentUserData?.role || currentUser.role;
  const canEdit = userRole === 'SUPER_ADMIN' || userRole === 'HEAD_UNIT' || lx.createdBy === currentUser.email;
  const lxStatus = lx.status || 'DRAFT';

  return (
    <>
      <div className="max-w-6xl mx-auto space-y-10 animate-in fade-in duration-500 pb-20 px-4">
      {/* Header Actions - hidden in print */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-8 no-print">
        <div className="flex items-start gap-4">
           <button 
             onClick={() => navigate('/academic/lxd')}
             className="p-3 bg-white rounded-2xl border border-gray-100 shadow-sm hover:scale-105 active:scale-95 transition-all text-gray-400"
           >
              <ChevronLeft size={20} />
           </button>
           <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                 <span className={cn(
                   "px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest",
                   lxStatus === 'PUBLISHED' ? "bg-emerald-50 text-emerald-600" : 
                   lxStatus === 'PENDING_APPROVAL' ? "bg-amber-50 text-amber-600" :
                   lxStatus === 'REJECTED' ? "bg-red-50 text-red-600" :
                   "bg-orange-50 text-orange-600"
                 )}>
                   {lxStatus}
                 </span>
                 <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-md text-[9px] font-black uppercase tracking-widest">
                   {lx.type.replace('_', ' ')}
                 </span>
                 <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded-md text-[9px] font-black uppercase tracking-widest">
                   {(lx?.unitId || '').replace('_', ' ')}
                 </span>
              </div>
              <h1 className="text-3xl font-black tracking-tight uppercase text-gray-900 leading-tight">
                {lx.title}
              </h1>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                Lazuardi GCS Junior High
              </p>
           </div>
        </div>

        <div className="flex flex-wrap gap-2">
           {lxStatus === 'PENDING_APPROVAL' && (userRole === 'HEAD_UNIT' || userRole === 'SUPER_ADMIN') && (
             <>
               <button 
                 onClick={handleApprove}
                 disabled={processingApproval}
                 className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-sm shadow-emerald-100 disabled:opacity-50"
               >
                 {processingApproval ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />} Approve
               </button>
               <button 
                 onClick={() => setRejectModalOpen(true)}
                 disabled={processingApproval}
                 className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-100 transition-all border border-red-100 disabled:opacity-50"
               >
                  <X size={14} /> Reject
               </button>
             </>
           )}

           {(lxStatus === 'DRAFT' || lxStatus === 'REJECTED') && (userRole !== 'STUDENT' && userRole !== 'PARENT') && (
             <button 
               onClick={handleSubmitForApproval}
               disabled={processingApproval}
               className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-sm shadow-blue-100 disabled:opacity-50"
             >
               {processingApproval ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Submit for Approval
             </button>
           )}

           <button 
             onClick={handlePrint}
             className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-200 transition-all shadow-sm"
           >
              <Printer size={14} /> Preview & Print
           </button>
           
           {lxStatus === 'PUBLISHED' && (
             <button 
               onClick={handleBackupToDrive}
               disabled={backingUp}
               className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-sm shadow-indigo-100 disabled:opacity-50"
             >
                {backingUp ? <Loader2 size={14} className="animate-spin" /> : <HardDrive size={14} />} 
                {lx.backupSummary?.lastBackupAt ? 'Update Backup' : 'Backup to Drive'}
             </button>
           )}

           {canEdit && lxStatus !== 'PENDING_APPROVAL' && (
             <Link 
               to={`/academic/lxd/edit/${lx.id}`}
               className="flex items-center gap-2 px-4 py-2 bg-white text-gray-600 border border-gray-100 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-50 transition-all shadow-sm"
             >
                <Edit2 size={14} /> Edit
             </Link>
           )}
        </div>
      </div>

      </div>

      <div className="lxd-printable">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-3 space-y-12">
            
            {/* HEADER INFO */}
            <div className="space-y-6">
              {lx.backupSummary && (
                <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-3xl flex items-center justify-between gap-4 animate-in slide-in-from-top duration-500">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-100 text-indigo-600 rounded-xl">
                      <HardDrive size={20} />
                    </div>
                    <div>
                      <p className="text-xs font-black text-indigo-900 uppercase tracking-tight">Last Backup to Drive</p>
                      <p className="text-[10px] font-bold text-indigo-400">
                        {new Date(lx.backupSummary.lastBackupAt).toLocaleString('id-ID')}
                      </p>
                    </div>
                  </div>
                  {lx.backupSummary.lastBackupFileUrl && (
                    <a 
                      href={lx.backupSummary.lastBackupFileUrl} 
                      target="_blank" 
                      rel="noreferrer"
                      className="px-4 py-2 bg-white text-indigo-600 border border-indigo-100 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-50 transition-all flex items-center gap-2"
                    >
                      View on Drive <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              )}

              {lx.approval && (
                <div className={cn(
                  "p-4 rounded-3xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-in slide-in-from-top duration-500",
                  lxStatus === 'PENDING_APPROVAL' ? "bg-amber-50 border-amber-100" :
                  lxStatus === 'REJECTED' ? "bg-red-50 border-red-100" :
                  "bg-emerald-50 border-emerald-100"
                )}>
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "w-10 h-10 rounded-2xl flex items-center justify-center",
                      lx.status === 'PENDING_APPROVAL' ? "bg-amber-100 text-amber-700" :
                      lx.status === 'REJECTED' ? "bg-red-100 text-red-700" :
                      "bg-emerald-100 text-emerald-700"
                    )}>
                      {lx.status === 'PENDING_APPROVAL' ? <Clock size={20} /> : 
                       lx.status === 'REJECTED' ? <X size={20} /> : <CheckCircle size={20} />}
                    </div>
                    <div>
                      <h4 className={cn(
                        "text-sm font-black tracking-tight",
                        lx.status === 'PENDING_APPROVAL' ? "text-amber-900" :
                        lx.status === 'REJECTED' ? "text-red-900" :
                        "text-emerald-900"
                      )}>
                        {lx.status === 'PENDING_APPROVAL' ? 'Waiting for approval from Head Unit / Principal' :
                         lx.status === 'REJECTED' ? `Rejected by ${lx.approval.reviewedByName}` :
                         `Approved by ${lx.approval.reviewedByName}`}
                      </h4>
                      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                        {lx.status === 'PENDING_APPROVAL' ? 
                          `Submitted by ${lx.approval.submittedByName} on ${new Date(lx.approval.submittedAt!).toLocaleDateString()}` :
                          `${lx.status === 'REJECTED' ? 'Rejected' : 'Approved'} on ${new Date(lx.approval.reviewedAt!).toLocaleDateString()}`}
                      </p>
                    </div>
                  </div>

                  {lx.status === 'REJECTED' && (
                    <Link 
                      to={`/academic/lxd/edit/${lx.id}`}
                      className="px-5 py-2 bg-red-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-700 transition-all shadow-lg shadow-red-100"
                    >
                      Edit & Resubmit
                    </Link>
                  )}
                </div>
              )}

              {lx.status === 'REJECTED' && lx.approval?.rejectionNote && (
                <div className="p-6 bg-red-50/50 rounded-3xl border-l-4 border-red-500 border-y border-r border-red-100">
                  <div className="flex items-center gap-2 text-red-600 mb-2">
                    <AlertCircle size={16} />
                    <h5 className="text-[10px] font-black uppercase tracking-widest">Rejection Reason</h5>
                  </div>
                  <p className="text-sm font-medium text-red-900 leading-relaxed italic">
                    "{lx.approval.rejectionNote}"
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 p-8 bg-white rounded-[2rem] border border-gray-100 shadow-sm print:shadow-none">
                 <InfoBlock label="Grade" value={lx.grade || lx.grades?.join(', ') || '-'} />
                 <InfoBlock label="Subject" value={lx.subject || lx.interdisciplinarySubjects?.join(', ') || '-'} />
                 <InfoBlock label="Academic Year" value={lx.academicYear} />
                 <InfoBlock label="Semester" value={lx.semester} />
                 <InfoBlock label="Duration" value={lx.weeks || lx.duration || lx.dateRange || '-'} />
                 <InfoBlock label="Meetings" value={lx.numberOfMeetings?.toString() || (lx.meetings?.length.toString()) || '-'} />
                 <InfoBlock label="Created By" value={lx.createdBy} />
                 <InfoBlock label="Updated At" value={new Date(lx.updatedAt).toLocaleDateString()} />
              </div>
            </div>

            {/* SECTION 1: INTEGRAL EDUCATION STRANDS */}
            <section className="space-y-6">
              <SectionHeader title="Integral Education Strands" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {lx.integralStrands && Object.entries(lx.integralStrands).map(([key, details]: [string, any]) => (
                  <div key={key} className="p-6 bg-white rounded-3xl border border-gray-100 shadow-sm space-y-4 print:shadow-none print:border-gray-200">
                    <div className="flex items-center gap-3">
                      {STRAND_ICONS[key as keyof typeof STRAND_ICONS]}
                      <h4 className="text-xs font-black uppercase tracking-widest text-gray-900 border-b-2 border-gray-100 pb-1">
                        {STRAND_LABELS[key as keyof typeof STRAND_LABELS] || key}
                      </h4>
                    </div>
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Indicators</p>
                        <ul className="list-disc list-inside text-xs text-gray-600 font-medium space-y-0.5">
                          {details.indicators?.map((ind: string, i: number) => (
                            <li key={i}>{ind}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Experience</p>
                        <p className="text-xs text-gray-600 leading-relaxed font-medium italic">
                          "{details.narrative}"
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* SECTION 2: LESSON OVERVIEW */}
            <section className="space-y-6">
              <SectionHeader title="Lesson Overview" />
              <div className="bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm space-y-8 print:shadow-none print:border-gray-200">
                 <OverviewItem label="Generative Topics" value={Array.isArray(lx.generativeTopics) ? lx.generativeTopics.join(', ') : lx.generativeTopics} />
                 <OverviewItem label="Essential/Driving Question" value={lx.essentialQuestion} italic />
                 <div className="space-y-2">
                   <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Linked Goals</p>
                   <div className="space-y-2">
                      {lgs.map(lg => (
                        <div key={lg.id} className="flex gap-3 text-xs font-medium text-gray-600">
                          <span className="font-black text-blue-600 shrink-0">{lg.code}</span>
                          <p>{lg.goalText}</p>
                        </div>
                      ))}
                   </div>
                 </div>

                 {lx.type === 'LEARNING_JOURNEY' && (
                   <>
                     <OverviewItem label="Learning Experience Overview" value={lx.learningExperienceOverview} />
                     <OverviewItem label="Meet the Expert" value={lx.meetTheExpert} />
                     <OverviewItem label="Materials and Resources" value={lx.materialsAndResources} />
                     <OverviewItem label="Interdisciplinary Subjects" value={lx.interdisciplinarySubjects?.join(', ')} />
                     <OverviewItem label="Prerequisite Skills" value={lx.prerequisiteSkills?.map(s => `${s.subject}: ${s.skills.join(', ')}`).join(' | ')} />
                     <OverviewItem label="Teachers Involved" value={lx.teachers?.map(t => `${t.email} (${t.subject})`).join(', ')} />
                   </>
                 )}
              </div>
            </section>

            {/* SECTION 3: MEETINGS / SUB UNITS / MILESTONES */}
            <section className="space-y-8">
              <SectionHeader title={lx.type === 'WEEKLY_LESSONS' ? 'Weekly Meetings' : lx.type === 'UNIT_AKTIVITAS' ? 'Sub Units & Meetings' : 'Milestones & Meetings'} />
              
              {lx.type === 'WEEKLY_LESSONS' && (
                <div className="space-y-6">
                  {lx.meetings?.map(m => (
                    <MeetingBlock key={m.meetingNumber} meeting={m} />
                  ))}
                </div>
              )}

              {lx.type === 'UNIT_AKTIVITAS' && (
                <div className="space-y-12">
                  {lx.subUnits?.map(su => (
                    <div key={su.uaNumber} className="space-y-6">
                      <div className="flex items-center gap-4 bg-gray-50 p-4 rounded-2xl border border-gray-100">
                        <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black">UA{su.uaNumber}</div>
                        <h3 className="font-black uppercase text-gray-700 tracking-tight">{su.uaTitle}</h3>
                      </div>
                      {su.meetings.map(m => <MeetingBlock key={m.meetingNumber} meeting={m} />)}
                    </div>
                  ))}
                </div>
              )}

              {lx.type === 'LEARNING_JOURNEY' && (
                <div className="space-y-12">
                  {lx.milestones?.map(ml => (
                    <div key={ml.milestoneNumber} className="space-y-6">
                      <div className="flex items-center gap-4 bg-emerald-50 p-4 rounded-2xl border border-emerald-100">
                        <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-black">M{ml.milestoneNumber}</div>
                        <h3 className="font-black uppercase text-emerald-700 tracking-tight">{ml.milestoneTitle}</h3>
                      </div>
                      {ml.meetings.map(m => <MeetingBlock key={m.meetingNumber} meeting={m} />)}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* SECTION 4: DIFFERENTIATED INSTRUCTION */}
            <section className="space-y-6">
              <SectionHeader title="Differentiated Instruction" />
              <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden print:shadow-none print:border-gray-200">
                 <table className="w-full text-left text-xs border-collapse">
                    <thead>
                       <tr className="bg-gray-50 border-b border-gray-100">
                          <th className="px-6 py-4 font-black uppercase tracking-widest text-gray-400 w-1/4">Element</th>
                          <th className="px-6 py-4 font-black uppercase tracking-widest text-gray-400">Description</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 text-gray-600">
                       <DiffRow label="Content" text={lx.differentiatedInstruction?.content} />
                       <DiffRow label="Process" text={lx.differentiatedInstruction?.process} />
                       <DiffRow label="Product" text={lx.differentiatedInstruction?.product} />
                       <DiffRow label="Environment" text={lx.differentiatedInstruction?.environment} />
                    </tbody>
                 </table>
              </div>
            </section>

            {/* SECTION 5: ASSESSMENT RUBRIC */}
            <section className="space-y-6">
              <SectionHeader title="Assessment Rubric" />
              <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden print:shadow-none print:border-gray-200">
                 <div className="overflow-x-auto">
                   <table className="w-full text-left text-xs border-collapse">
                      <thead>
                         <tr className="bg-blue-600 text-white">
                            <th className="px-6 py-4 font-black uppercase tracking-widest w-1/4">Learning Goal / criteria</th>
                            <th className="px-6 py-4 font-black uppercase tracking-widest">Beginning</th>
                            <th className="px-6 py-4 font-black uppercase tracking-widest">Developing</th>
                            <th className="px-6 py-4 font-black uppercase tracking-widest">Achieved</th>
                         </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                         {lx.rubric?.map((row, i) => {
                           const lg = lgs.find(g => g.id === row.goalId);
                           return (
                             <tr key={i} className="hover:bg-gray-50 transition-all group">
                               <td className="px-6 py-6 space-y-2">
                                  <div className="flex flex-col gap-1">
                                    <span className="font-black text-blue-600 uppercase tracking-widest text-[10px]">{lg?.code || 'GOAL_NOT_FOUND'}</span>
                                    <span className="font-bold text-gray-800">{row.criteriaLabel}</span>
                                  </div>
                                  <div className="inline-flex px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded text-[9px] font-black uppercase">
                                    M{row.assessedInMeeting}
                                  </div>
                               </td>
                               <td className="px-6 py-6 text-gray-500 italic leading-relaxed">{row.beginning || '-'}</td>
                               <td className="px-6 py-6 text-gray-500 italic leading-relaxed">{row.developing || '-'}</td>
                               <td className="px-6 py-6 text-gray-500 italic leading-relaxed font-bold bg-blue-50/20">{row.achieved || '-'}</td>
                             </tr>
                           );
                         })}
                      </tbody>
                   </table>
                 </div>
              </div>
            </section>

            {/* SECTION 6: SUBMISSION & SIGNATURES */}
            <section className="space-y-6">
              <SectionHeader title="Submission & Signatures" />
              <div className="bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm space-y-8 print:shadow-none print:border-gray-200">
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className="space-y-2 col-span-full md:col-span-1">
                       <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Submission Date</label>
                       <input 
                         type="date" 
                         value={sigForm.submissionDate}
                         onChange={e => setSigForm({...sigForm, submissionDate: e.target.value})}
                         className="w-full px-4 py-3 bg-gray-50 rounded-xl border border-gray-100 text-sm font-bold focus:ring-2 focus:ring-blue-100 transition-all no-print"
                       />
                       <p className="hidden print:block text-sm font-bold border-b border-gray-100 pb-2">{sigForm.submissionDate || '-'}</p>
                    </div>

                    <div className="p-6 bg-gray-50 rounded-2xl border border-gray-100 space-y-4 print:bg-white">
                       <div className="flex items-center gap-2 text-blue-600 mb-2">
                          <UserCheck size={18} />
                          <h4 className="text-[10px] font-black uppercase tracking-[0.2em]">Principal</h4>
                       </div>
                       <div className="space-y-4">
                          <div className="space-y-1">
                             <label className="text-[9px] font-black text-gray-300 uppercase tracking-widest">Name</label>
                             <input 
                               type="text" 
                               value={sigForm.principal.name}
                               placeholder="e.g. Fitriani, Ph.D"
                               onChange={e => setSigForm({...sigForm, principal: {...sigForm.principal, name: e.target.value}})}
                               className="w-full px-4 py-2 bg-white rounded-lg border border-gray-100 text-xs font-bold no-print"
                             />
                             <p className="hidden print:block text-xs font-bold border-b border-gray-100 pb-1">{sigForm.principal.name || '................................'}</p>
                          </div>
                          <div className="space-y-1">
                             <label className="text-[9px] font-black text-gray-300 uppercase tracking-widest">NIY</label>
                             <input 
                               type="text" 
                               value={sigForm.principal.niy}
                               placeholder="e.g. 192384912"
                               onChange={e => setSigForm({...sigForm, principal: {...sigForm.principal, niy: e.target.value}})}
                               className="w-full px-4 py-2 bg-white rounded-lg border border-gray-100 text-xs font-bold no-print"
                             />
                             <p className="hidden print:block text-xs font-bold border-b border-gray-100 pb-1">NIY: {sigForm.principal.niy || '................................'}</p>
                          </div>
                       </div>
                    </div>

                    <div className="p-6 bg-gray-50 rounded-2xl border border-gray-100 space-y-4 print:bg-white">
                       <div className="flex items-center gap-2 text-blue-600 mb-2">
                          <UserCheck size={18} />
                          <h4 className="text-[10px] font-black uppercase tracking-[0.2em]">Subject Teacher</h4>
                       </div>
                       <div className="space-y-4">
                          <div className="space-y-1">
                             <label className="text-[9px] font-black text-gray-300 uppercase tracking-widest">Name</label>
                             <input 
                               type="text" 
                               value={sigForm.subjectTeacher.name}
                               onChange={e => setSigForm({...sigForm, subjectTeacher: {...sigForm.subjectTeacher, name: e.target.value}})}
                               className="w-full px-4 py-2 bg-white rounded-lg border border-gray-100 text-xs font-bold no-print"
                             />
                             <p className="hidden print:block text-xs font-bold border-b border-gray-100 pb-1">{sigForm.subjectTeacher.name || '................................'}</p>
                          </div>
                          <div className="space-y-1">
                             <label className="text-[9px] font-black text-gray-300 uppercase tracking-widest">NIY</label>
                             <input 
                               type="text" 
                               value={sigForm.subjectTeacher.niy}
                               onChange={e => setSigForm({...sigForm, subjectTeacher: {...sigForm.subjectTeacher, niy: e.target.value}})}
                               className="w-full px-4 py-2 bg-white rounded-lg border border-gray-100 text-xs font-bold no-print"
                             />
                             <p className="hidden print:block text-xs font-bold border-b border-gray-100 pb-1">NIY: {sigForm.subjectTeacher.niy || '................................'}</p>
                          </div>
                       </div>
                    </div>
                 </div>

                 <div className="flex justify-end pt-4 border-t border-gray-50 no-print">
                    <button 
                      onClick={handleSaveSignatures}
                      disabled={savingSigs}
                      className="flex items-center gap-3 px-8 py-4 bg-[#002366] text-white rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] shadow-xl shadow-blue-100 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
                    >
                      {savingSigs ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                      Save Signatures
                    </button>
                 </div>
              </div>
            </section>
          </div>

          {/* Sidebar Mini - Info */}
          <div className="space-y-6 flex flex-col no-print">
              <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-6">
                 <h3 className="text-[10px] font-black text-gray-300 uppercase tracking-widest">Revision History</h3>
                 <div className="space-y-4">
                    <div className="flex gap-3">
                       <div className="w-1.5 h-1.5 rounded-full bg-blue-600 mt-1" />
                       <div className="space-y-0.5">
                          <p className="text-[11px] font-black text-gray-900 uppercase">Last Updated</p>
                          <p className="text-[10px] font-bold text-gray-400">{new Date(lx.updatedAt).toLocaleString()}</p>
                       </div>
                    </div>
                    <div className="flex gap-3">
                       <div className="w-1.5 h-1.5 rounded-full bg-gray-200 mt-1" />
                       <div className="space-y-0.5">
                          <p className="text-[11px] font-black text-gray-900 uppercase">Created</p>
                          <p className="text-[10px] font-bold text-gray-400">{new Date(lx.createdAt).toLocaleString()}</p>
                       </div>
                    </div>
                 </div>
              </div>
          </div>
        </div>
      </div>


      {/* End of printable content */}

      {/* Reject Modal */}
      <AnimatePresence>
        {rejectModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setRejectModalOpen(false)}
              className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden border border-gray-100"
            >
              <div className="p-8 space-y-6">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center">
                      <AlertCircle size={24} />
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-gray-900 tracking-tight">Reject LXD</h3>
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Provide a reason for rejection</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setRejectModalOpen(false)}
                    className="p-2 text-gray-400 hover:text-gray-900 transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Rejection Note</label>
                  <textarea 
                    value={rejectionNote}
                    onChange={e => setRejectionNote(e.target.value)}
                    placeholder="Describe why this LXD is being rejected..."
                    required
                    className="w-full h-32 px-4 py-3 bg-gray-50 rounded-2xl border border-gray-100 text-sm font-medium focus:ring-2 focus:ring-red-100 transition-all outline-none resize-none"
                  />
                </div>

                <div className="flex gap-4">
                  <button 
                    onClick={() => setRejectModalOpen(false)}
                    className="flex-1 py-3 bg-gray-50 text-gray-400 rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-gray-100 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleConfirmReject}
                    disabled={processingApproval || !rejectionNote.trim()}
                    className="flex-1 py-3 bg-red-600 text-white rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-red-700 shadow-xl shadow-red-100 transition-all disabled:opacity-50"
                  >
                    {processingApproval ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'Confirm Reject'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* Backup Preview Modal */}
        {backupPreviewModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-indigo-900/40 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden border border-indigo-100"
            >
              <div className="p-8 space-y-6">
                <div className="flex items-center gap-4">
                   <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center">
                      <HardDrive size={24} />
                   </div>
                   <div>
                      <h3 className="text-xl font-black text-indigo-900 uppercase tracking-tighter italic">LXD Backup Preview</h3>
                      <p className="text-xs font-bold text-indigo-400 uppercase tracking-widest">Verifikasi PDF sebelum dikirim ke Drive</p>
                   </div>
                </div>

                <div className="p-6 bg-gray-50 rounded-2xl border border-gray-100 space-y-4">
                  <div className="flex items-center gap-3 text-gray-600">
                    <FileText size={18} className="text-indigo-400" />
                    <span className="text-sm font-bold uppercase tracking-tight">{lx.title}</span>
                  </div>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    Dokumen PDF telah digenerate. Silakan lihat preview terlebih dahulu sebelum melakukan backup ke Google Drive.
                  </p>
                </div>

                <div className="flex flex-col gap-3">
                   <button 
                     onClick={viewTempPdf}
                     className="w-full px-4 py-4 bg-white text-indigo-600 border border-indigo-100 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-50 transition-all flex items-center justify-center gap-2"
                   >
                     <ExternalLink size={14} /> Lihat PDF Preview
                   </button>
                   
                   <div className="flex gap-4 w-full">
                      <button 
                        onClick={() => {
                          setBackupPreviewModalOpen(false);
                          setTempPdfBase64(null);
                        }}
                        className="flex-1 px-4 py-3 bg-gray-50 text-gray-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-100 transition-all"
                      >
                        Batal
                      </button>
                      <button 
                        onClick={confirmBackup}
                        disabled={backingUp}
                        className="flex-1 px-4 py-3 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {backingUp ? <Loader2 size={14} className="animate-spin" /> : <HardDrive size={14} />} 
                        Konfirmasi Backup
                      </button>
                   </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

// COMPONENT HELPERS

function InfoBlock({ label, value }: { label: string, value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest">{label}</p>
      <p className="text-xs font-black text-gray-800 uppercase tracking-tight truncate" title={value}>{value}</p>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
   return (
      <div className="flex items-center gap-4">
         <h2 className="text-xs font-black text-[#002366] uppercase tracking-[0.2em]">{title}</h2>
         <div className="flex-1 h-1 bg-[#002366] rounded-full opacity-10" />
      </div>
   );
}

function OverviewItem({ label, value, italic }: { label: string, value?: string, italic?: boolean }) {
  if (!value) return null;
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{label}</p>
      <p className={cn("text-xs leading-relaxed font-medium text-gray-700", italic && "italic font-black text-gray-900")}>
        {value}
      </p>
    </div>
  );
}

function MeetingBlock({ meeting }: { meeting: any; key?: any }) {
  return (
    <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden">
       <div className="bg-gray-50/50 px-8 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
             <span className="w-8 h-8 rounded-lg bg-white border border-gray-100 flex items-center justify-center text-[10px] font-black text-gray-400">#{meeting.meetingNumber}</span>
             <h4 className="font-black uppercase text-gray-800 tracking-tight">{meeting.title}</h4>
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
             {meeting.assessmentType?.map((t: string) => <span key={t} className="px-2 py-0.5 bg-amber-50 text-amber-600 rounded-md text-[8px] font-black uppercase tracking-wider">{t}</span>)}
          </div>
       </div>
       <div className="p-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
             <div className="space-y-4">
                <div className="space-y-1">
                   <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Learning Objectives</p>
                   <ul className="list-disc list-inside text-xs font-bold text-gray-700 space-y-1">
                      {meeting.learningObjective?.map((lo: string, i: number) => <li key={i}>{lo}</li>)}
                   </ul>
                </div>
                <div className="grid grid-cols-3 gap-3">
                   <MiniStage label="Opening" text={meeting.opening} />
                   <MiniStage label="Main" text={meeting.mainActivities} />
                   <MiniStage label="Closing" text={meeting.closing} />
                </div>
             </div>
             <div className="space-y-4">
                <div className="space-y-2">
                   <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Instructional strategies</p>
                   <div className="flex flex-wrap gap-1">
                      {meeting.instructionalStrategies?.map((s: string) => <span key={s} className="px-2 py-0.5 bg-purple-50 text-purple-600 rounded text-[9px] font-black uppercase">#{s}</span>)}
                   </div>
                </div>
                <div className="p-4 bg-gray-50 rounded-2xl space-y-2 border border-gray-100">
                   <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest italic flex items-center gap-2 underline underline-offset-4 decoration-2 decoration-blue-100">Assessment & Differentiation</p>
                   <p className="text-[11px] text-gray-600 leading-relaxed"><span className="font-black">Notes:</span> {meeting.assessmentNotes}</p>
                   <div className="grid grid-cols-3 gap-2 mt-2">
                      <div className="text-[10px]"><span className="font-black text-blue-500 uppercase">Ct:</span> {meeting.differentiationNotes?.content || '-'}</div>
                      <div className="text-[10px]"><span className="font-black text-blue-500 uppercase">Pr:</span> {meeting.differentiationNotes?.process || '-'}</div>
                      <div className="text-[10px]"><span className="font-black text-blue-500 uppercase">Pd:</span> {meeting.differentiationNotes?.product || '-'}</div>
                   </div>
                </div>
             </div>
          </div>
       </div>
    </div>
  );
}

function MiniStage({ label, text }: { label: string, text: string }) {
  return (
    <div className="space-y-1">
      <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{label}</p>
      <p className="text-[10px] text-gray-600 line-clamp-3 leading-snug">{text}</p>
    </div>
  );
}

function DiffRow({ label, text }: { label: string, text?: string }) {
  return (
    <tr className="hover:bg-gray-50/50 transition-all">
       <td className="px-6 py-4 font-black uppercase text-blue-600 text-[10px]">{label}</td>
       <td className="px-6 py-4 italic leading-relaxed">{text || '-'}</td>
    </tr>
  );
}

// PRINT HELPERS

function PrintHeader({ lx }: { lx: LXD }) {
  return (
    <div className="border-b-4 border-[#002366] pb-6">
       <div className="flex justify-between items-start">
          <div className="space-y-2">
             <h1 className="text-xl font-black uppercase tracking-tight text-gray-900 border-b border-gray-200 pb-1 flex items-center gap-3">
                <BookOpen size={20} className="text-[#002366]" />
                Learning Experience Design (LXD)
             </h1>
             <p className="text-[10px] font-black uppercase text-gray-400 tracking-[0.3em]">Lazuardi Global Compassionate School - Junior High</p>
             <h2 className="text-3xl font-black leading-tight mt-4 uppercase italic">{lx.title}</h2>
          </div>
          <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 flex flex-col gap-1 w-[180px]">
             <div className="flex justify-between items-center text-[9px]">
                <span className="font-black text-gray-400 uppercase">Type:</span>
                <span className="font-black uppercase">{lx.type.replace('_', ' ')}</span>
             </div>
             <div className="flex justify-between items-center text-[9px]">
                <span className="font-black text-gray-400 uppercase">Sem:</span>
                <span className="font-black px-2 bg-white rounded border border-gray-100">{lx.semester}</span>
             </div>
             <div className="flex justify-between items-center text-[9px]">
                <span className="font-black text-gray-400 uppercase">Year:</span>
                <span className="font-black">{lx.academicYear}</span>
             </div>
          </div>
       </div>
       <div className="flex flex-wrap gap-8 mt-6 pt-6 border-t border-gray-50">
          <PrintHeadItem label="Subject" value={lx.subject || lx.interdisciplinarySubjects?.join(', ')} />
          <PrintHeadItem label="Grade" value={lx.grade || lx.grades?.join(', ')} />
          <PrintHeadItem label="Weeks / duration" value={lx.weeks || lx.duration || lx.dateRange} />
          <PrintHeadItem label="Meetings" value={lx.numberOfMeetings?.toString() || lx.meetings?.length?.toString()} />
       </div>
    </div>
  );
}

function PrintHeadItem({ label, value }: { label: string, value?: string }) {
  return (
    <div className="space-y-0.5">
       <p className="text-[8px] font-black uppercase text-gray-400 tracking-widest">{label}</p>
       <p className="text-[10px] font-black uppercase">{value || '-'}</p>
    </div>
  );
}

function PrintSection({ title, number, children }: { title: string, number: string, children: React.ReactNode }) {
  return (
    <div className="space-y-4 lxd-section">
       <h3 className="text-[14pt] font-black uppercase text-[#002366] border-b-2 border-[#002366] pb-1 w-fit mb-2">
         {number}. {title}
       </h3>
       {children}
    </div>
  );
}

function PrintMeeting({ meeting }: { meeting: any; key?: any }) {
  return (
    <div className="border border-gray-100 rounded-lg overflow-hidden page-break-inside-avoid mb-4">
       <div className="bg-gray-50 px-4 py-2 border-b border-gray-100 flex justify-between">
          <span className="text-[10pt] font-black uppercase">Meeting #{meeting.meetingNumber}: {meeting.title}</span>
          <span className="text-[8pt] font-bold text-gray-400 uppercase tracking-widest">{meeting.assessmentType?.join(' | ')}</span>
       </div>
       <div className="p-4 space-y-4">
          <div className="grid grid-cols-3 gap-6">
             <div className="col-span-1 space-y-3">
                <div className="space-y-1">
                  <p className="text-[8pt] font-black uppercase text-gray-400">Learning Objectives</p>
                  <ul className="list-disc list-inside text-[9pt] font-medium leading-relaxed text-gray-700">
                     {meeting.learningObjective?.map((lo: string, i: number) => <li key={i}>{lo}</li>)}
                  </ul>
                </div>
                <div className="space-y-1">
                   <p className="text-[8pt] font-black uppercase text-gray-400">Instructional Strategies</p>
                   <p className="text-[9pt] font-black text-purple-600">{meeting.instructionalStrategies?.join(', ')}</p>
                </div>
             </div>
             <div className="col-span-2 space-y-3">
                <div className="flex gap-4">
                   <MiniPrintStage label="Opening" text={meeting.opening} />
                   <MiniPrintStage label="Main Activities" text={meeting.mainActivities} />
                   <MiniPrintStage label="Closing" text={meeting.closing} />
                </div>
                <div className="p-3 bg-gray-50/50 rounded border border-gray-100 space-y-2">
                   <p className="text-[8pt] font-black uppercase text-gray-400 italic">Assessment & Differentiation Context</p>
                   <p className="text-[9pt] leading-relaxed italic text-gray-600">"{meeting.assessmentNotes}"</p>
                   <div className="grid grid-cols-3 gap-4 border-t border-gray-100 pt-2">
                      <p className="text-[8pt] text-gray-600"><span className="font-black text-blue-500 uppercase">CT:</span> {meeting.differentiationNotes?.content || '-'}</p>
                      <p className="text-[8pt] text-gray-600"><span className="font-black text-blue-500 uppercase">PR:</span> {meeting.differentiationNotes?.process || '-'}</p>
                      <p className="text-[8pt] text-gray-600"><span className="font-black text-blue-500 uppercase">PD:</span> {meeting.differentiationNotes?.product || '-'}</p>
                   </div>
                </div>
             </div>
          </div>
       </div>
    </div>
  );
}

function MiniPrintStage({ label, text }: { label: string, text: string }) {
  return (
    <div className="flex-1 space-y-1">
       <p className="text-[8px] font-black uppercase text-gray-300">{label}</p>
       <p className="text-[9px] leading-snug">{text}</p>
    </div>
  );
}

function PrintInfo({ label, value, italic }: { label: string, value?: string, italic?: boolean }) {
  if (!value) return null;
  return (
    <div>
       <span className="font-black uppercase text-gray-400 mr-2">{label}:</span>
       <span className={cn("font-medium", italic && "font-black italic underline underline-offset-2")}>{value}</span>
    </div>
  );
}

function PrintDiffRow({ label, value }: { label: string, value?: string }) {
   return (
     <tr>
        <td className="border border-gray-200 p-2 font-black uppercase bg-gray-50/30 text-blue-600">{label}</td>
        <td className="border border-gray-200 p-2 italic">{value || '-'}</td>
     </tr>
   );
}
