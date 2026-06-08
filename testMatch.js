function normalizeSearchName(str) {
  return String(str || '')
    .normalize('NFD')                     // Normalize unicode characters
    .replace(/[\u0300-\u036f]/g, '')     // Remove diacritics
    .replace(/[\u200b-\u200d\uFEFF]/g, '') // Remove zero-width characters/invisible spaces
    .replace(/\u00a0/g, ' ')             // Convert non-breaking spaces
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')        // Convert punctuation/special characters to spaces
    .replace(/\s+/g, ' ')                // Collapse whitespace
    .trim();
}

function robustMatchStudent(nameVal, list) {
  const val = normalizeSearchName(nameVal);
  console.log(`Normalized query val: '${val}'`);
  if (!val) {
    return { student: null, isAmbiguous: false, candidates: [] };
  }

  // Avoid matching row headers (like "Sentra", "Domain", etc.) as system students
  if (val.includes('sentra') || val.includes('domain') || val.includes('perkembangan') || val.includes('activity')) {
    return { student: null, isAmbiguous: false, candidates: [] };
  }

  // 1. Exact normalized name match (Highest priority)
  const exactNameMatches = list.filter(s => normalizeSearchName(s.name) === val);
  console.log(`Exact name matches size: ${exactNameMatches.length}`);
  if (exactNameMatches.length === 1) {
    return { student: exactNameMatches[0], isAmbiguous: false, candidates: exactNameMatches };
  } else if (exactNameMatches.length > 1) {
    return { student: null, isAmbiguous: true, candidates: exactNameMatches };
  }

  // 2. Exact nickname match (Priority 2)
  const exactNickMatches = list.filter(s => s.nickName && normalizeSearchName(s.nickName) === val);
  console.log(`Exact nick matches size: ${exactNickMatches.length}`);
  if (exactNickMatches.length === 1) {
    return { student: exactNickMatches[0], isAmbiguous: false, candidates: exactNickMatches };
  } else if (exactNickMatches.length > 1) {
    return { student: null, isAmbiguous: true, candidates: exactNickMatches };
  }

  // 3. Contains-based normalized match (Fallback priority 3)
  const containsMatches = [];
  list.forEach(s => {
    const sName = normalizeSearchName(s.name);
    const sNick = s.nickName ? normalizeSearchName(s.nickName) : '';
    if (sName.includes(val) || val.includes(sName) || (sNick && (sNick.includes(val) || val.includes(sNick)))) {
      containsMatches.push(s);
    }
  });
  console.log(`Contains matches size: ${containsMatches.length}`);

  if (containsMatches.length === 1) {
    return { student: containsMatches[0], isAmbiguous: false, candidates: containsMatches };
  } else if (containsMatches.length > 1) {
    return { student: null, isAmbiguous: true, candidates: containsMatches };
  }

  // 4. Token-based similarity search (Fallback priority 4)
  const scoredCandidates = [];
  
  list.forEach(s => {
    const sName = normalizeSearchName(s.name);
    const sNick = s.nickName ? normalizeSearchName(s.nickName) : '';
    
    // Split into tokens
    const sTokens = sName.split(' ');
    const valTokens = val.split(' ');
    
    // Simple Jaccard Index
    const sSet = new Set(sTokens);
    const valSet = new Set(valTokens);
    
    const intersection = new Set([...sSet].filter(x => valSet.has(x)));
    const union = new Set([...sSet, ...valSet]);
    
    const jaccardScore = intersection.size / union.size;
    
    // Partial token overlap (how many query tokens are matched in the name)
    const matchedTokensCount = valTokens.filter(t => sSet.has(t)).length;
    const overlapScore = matchedTokensCount / valTokens.length;
    
    // Combined weighted score favoring solid matches but flexible on extra/minor missing words
    const combinedScore = (jaccardScore * 0.4) + (overlapScore * 0.6);
    
    if (combinedScore >= 0.5) {
      scoredCandidates.push({ student: s, score: combinedScore });
    }
  });

  console.log(`Scored candidates size: ${scoredCandidates.length}`);
  if (scoredCandidates.length > 0) {
    scoredCandidates.sort((a, b) => b.score - a.score);
    console.log("Top scored candidates:", JSON.stringify(scoredCandidates.slice(0, 3), null, 2));
    const highestScore = scoredCandidates[0].score;
    const topMatches = scoredCandidates.filter(c => Math.abs(c.score - highestScore) <= 0.05);

    if (topMatches.length === 1) {
      return { student: topMatches[0].student, isAmbiguous: false, candidates: [topMatches[0].student] };
    } else {
      return { student: null, isAmbiguous: true, candidates: topMatches.map(c => c.student) };
    }
  }

  return { student: null, isAmbiguous: false, candidates: [] };
}

// Simulated student data loaded from Firestore
const list = [
  {
    "id": "LMN-1780736085523-005",
    "name": "Keenandra Arkana Dayarana", // Wait, is the Firestore field 'name' or 'fullName'?
    "nickName": "Arka",
    "classId": "Pra TK Panda",
    "academicYear": "2025/2026",
    "unitId": "KINDERGARTEN"
  }
];

const result = robustMatchStudent("Keenandra Arkana Dayarana", list);
console.log("Result:", JSON.stringify(result, null, 2));
