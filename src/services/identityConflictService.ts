export interface ConflictRecord {
  id: string; // docId or inviteId
  name: string;
  normalizedName: string;
  nis: string; // luminaId or id
  oldLuminaId?: string;
  nisn: string;
  nickname: string;
  gender: string;
  classId: string;
  unitId: string;
  parentEmail: string;
  fatherName?: string;
  motherName?: string;
  email: string;
  status: string; // "active", "pending", "used", "revoked", etc.
  source: 'students' | 'roleInvites'; // record source
}

export type ConflictStatus = 'CONFLICT' | 'HIGH CONFIDENCE CONFLICT' | 'NEEDS REVIEW';

export interface ConflictGroup {
  id: string; // unique group id
  primaryName: string; // display center name
  status: ConflictStatus;
  records: ConflictRecord[];
  reason: string;
}

export interface ConflictScanResult {
  totalScanned: number;
  totalUniqueNames: number;
  totalConflicts: number; // Groups with CONFLICT or HIGH CONFIDENCE
  totalNeedsReview: number; // Groups with NEEDS REVIEW
  groups: ConflictGroup[];
}

/**
 * Normalizes full names: lowercase, trim, remove punctuation, tidy extra spaces.
 * This is the cornerstone of Lumina GCS's student identity resolution.
 */
export function normalizeFullName(name: string): string {
  if (!name) return "";
  return name
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_\`~()?'"’‘“]/g, " ") // replace punctuation with spaces
    .replace(/\s+/g, " ")                              // unify multiple spaces
    .trim();
}

/**
 * Calculates standard Levenshtein distance between two strings
 */
export function getLevenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

/**
 * Similarity metric based on Levenshtein (0 to 1)
 */
export function getNameSimilarityScore(name1: string, name2: string): number {
  const n1 = normalizeFullName(name1);
  const n2 = normalizeFullName(name2);
  const dist = getLevenshteinDistance(n1, n2);
  const maxLen = Math.max(n1.length, n2.length);
  if (maxLen === 0) return 1;
  return 1 - dist / maxLen;
}

/**
 * Similarity metric based on word token sets (0 to 1)
 */
export function getTokenSimilarityScore(name1: string, name2: string): number {
  const n1 = normalizeFullName(name1);
  const n2 = normalizeFullName(name2);
  const tokens1 = new Set(n1.split(" ").filter(t => t.length > 1));
  const tokens2 = new Set(n2.split(" ").filter(t => t.length > 1));
  if (tokens1.size === 0 || tokens2.size === 0) return 0;

  let intersection = 0;
  tokens1.forEach(t => {
    if (tokens2.has(t)) intersection++;
  });

  const union = new Set([...tokens1, ...tokens2]).size;
  return intersection / union;
}

/**
 * Core conflict detection algorithm.
 * Groups records with matching names or flags close matches for review.
 */
export function detectIdentityConflicts(records: ConflictRecord[]): ConflictScanResult {
  const totalScanned = records.length;
  
  // 1. Group records by exact normalized name
  const exactGroupsMap = new Map<string, ConflictRecord[]>();
  for (const rec of records) {
    const norm = rec.normalizedName;
    if (!norm) continue;
    if (!exactGroupsMap.has(norm)) {
      exactGroupsMap.set(norm, []);
    }
    exactGroupsMap.get(norm)!.push(rec);
  }

  const exactNames = Array.from(exactGroupsMap.keys());
  const totalUniqueNames = exactNames.length;

  const conflictGroups: ConflictGroup[] = [];
  
  // Track records that got assigned to an exact name conflict group
  const exactConflictRecordIds = new Set<string>();

  // 2. Identify exact name matches with conflicting details
  let groupIdCounter = 1;
  exactGroupsMap.forEach((groupRecords, normName) => {
    if (groupRecords.length > 1) {
      // Check if there's an identity conflict (different IDs or different NIS values)
      const uniqueIDs = new Set(groupRecords.map(r => r.id));
      const uniqueNIS = new Set(groupRecords.map(r => r.nis).filter(Boolean));

      // If they share exactly the same ID and NIS, it's the exact same entity in students vs roleInvites
      const isDivergent = uniqueIDs.size > 1 || uniqueNIS.size > 1;

      if (isDivergent) {
        // Evaluate if unit/class/ortu supports it -> HIGH CONFIDENCE CONFLICT
        let isHighConfidence = false;
        
        // Check for same parentEmail (if defined)
        const parentEmails = groupRecords.map(r => r.parentEmail?.toLowerCase().trim()).filter(Boolean);
        const hasSameParent = parentEmails.length > 1 && new Set(parentEmails).size === 1;

        // Check for same classId
        const classes = groupRecords.map(r => r.classId).filter(Boolean);
        const hasSameClass = classes.length > 1 && new Set(classes).size === 1;

        // Check for same unitId
        const units = groupRecords.map(r => r.unitId).filter(Boolean);
        const hasSameUnit = units.length > 1 && new Set(units).size === 1;

        let reason = "Nama pendaftaran sama tetapi NIS/ID berbeda (Conflict)";
        if (hasSameParent || hasSameClass || hasSameUnit) {
          isHighConfidence = true;
          const supports: string[] = [];
          if (hasSameParent) supports.push("Email Ortu Sama");
          if (hasSameClass) supports.push("Kelas Sama");
          if (hasSameUnit) supports.push("Unit Sama");
          reason = `Kecocokan Tinggi: Nama sama didukung oleh ${supports.join(", ")}`;
        }

        conflictGroups.push({
          id: `EXACT_GRP_${groupIdCounter++}`,
          primaryName: groupRecords[0].name,
          status: isHighConfidence ? "HIGH CONFIDENCE CONFLICT" : "CONFLICT",
          records: groupRecords,
          reason
        });

        // Mark their IDs to avoid duplicating in "needs review" checks
        groupRecords.forEach(r => exactConflictRecordIds.add(r.id));
      }
    }
  });

  // 3. Similar name comparison (NEEDS REVIEW)
  // Compare each unique name nameA to other names nameB.
  for (let i = 0; i < exactNames.length; i++) {
    const nameA = exactNames[i];
    const recsA = exactGroupsMap.get(nameA)!;

    for (let j = i + 1; j < exactNames.length; j++) {
      const nameB = exactNames[j];
      const recsB = exactGroupsMap.get(nameB)!;

      // Calculate similarity
      const levScore = getNameSimilarityScore(nameA, nameB);
      const tokenScore = getTokenSimilarityScore(nameA, nameB);

      // Criteria for "similar but different" (Needs Review)
      const isSimilar = (levScore >= 0.75 && levScore < 1.0) || (tokenScore >= 0.65 && tokenScore < 1.0);

      if (isSimilar) {
        // Gather all records for both similar names
        const combinedRecords = [...recsA, ...recsB];

        // Ensure we actually have records that aren't already flagged in an exact conflict
        const unflaggedRecords = combinedRecords.filter(r => !exactConflictRecordIds.has(r.id));
        if (unflaggedRecords.length > 1) {
          const name1Str = recsA[0].name;
          const name2Str = recsB[0].name;
          
          conflictGroups.push({
            id: `SIMILAR_GRP_${groupIdCounter++}`,
            primaryName: `${name1Str} ≈ ${name2Str}`,
            status: "NEEDS REVIEW",
            records: combinedRecords,
            reason: `Kemiripan Nama (Levenshtein: ${Math.round(levScore*100)}%, Token: ${Math.round(tokenScore*100)}%)`
          });
        }
      }
    }
  }

  // Calculate totals
  const totalConflicts = conflictGroups.filter(g => g.status === "CONFLICT" || g.status === "HIGH CONFIDENCE CONFLICT").length;
  const totalNeedsReview = conflictGroups.filter(g => g.status === "NEEDS REVIEW").length;

  return {
    totalScanned,
    totalUniqueNames,
    totalConflicts,
    totalNeedsReview,
    groups: conflictGroups
  };
}
