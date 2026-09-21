export type IncidentReportStatus = 'DRAFT' | 'MENUNGGU_APPROVAL' | 'APPROVED';

export interface IncidentReport {
  id?: string;
  unit: 'JUNIOR_HIGH';
  status: IncidentReportStatus;
  
  // Student Information
  studentId: string;
  studentNameSnapshot: string;
  classId: string;
  classNameSnapshot: string;
  
  // Incident Details
  incidentDate: string; // YYYY-MM-DD
  incidentTime?: string; // HH:mm
  witnessesOrAdultsPresent?: string;
  incidentPlace: string;
  incidentDescription: string;
  actionTreatmentTaken: string;
  childConditionFollowingIncident: string;
  suggestionNextTreatment: string;
  
  // Author Teacher Information
  teacherId: string;
  teacherName: string;
  teacherSignatureUrl?: string | null;
  
  // Timestamps
  createdAt: number;
  updatedAt: number;
  submittedAt?: number;
  
  // Approval Information (Head Unit)
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: number;
  principalSignatureUrl?: string | null;
}
