import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  query, 
  where, 
  writeBatch,
  runTransaction
} from "firebase/firestore";
import { db, handleFirestoreError } from "../lib/firebase";
import { LdssTemplate, LdssAge, LdssTemplateStatus } from "../types";

const COLLECTION_NAME = "ldssTemplates";

/**
 * Fetch all LDSS templates from Firestore
 */
export async function getAllLdssTemplates(): Promise<LdssTemplate[]> {
  try {
    const querySnapshot = await getDocs(collection(db, COLLECTION_NAME));
    const templates: LdssTemplate[] = [];
    querySnapshot.forEach((docSnap) => {
      templates.push({ id: docSnap.id, ...docSnap.data() } as LdssTemplate);
    });
    return templates;
  } catch (error) {
    handleFirestoreError(error, "list", COLLECTION_NAME);
  }
}

/**
 * Fetch all templates for a specific age
 */
export async function getLdssTemplatesByAge(age: LdssAge): Promise<LdssTemplate[]> {
  try {
    const q = query(collection(db, COLLECTION_NAME), where("age", "==", age));
    const querySnapshot = await getDocs(q);
    const templates: LdssTemplate[] = [];
    querySnapshot.forEach((docSnap) => {
      templates.push({ id: docSnap.id, ...docSnap.data() } as LdssTemplate);
    });
    return templates;
  } catch (error) {
    handleFirestoreError(error, "list", `${COLLECTION_NAME}?age=${age}`);
  }
}

/**
 * Save or update a single LDSS template (e.g., Save Draft)
 */
export async function saveLdssTemplate(template: LdssTemplate): Promise<void> {
  try {
    const docRef = doc(db, COLLECTION_NAME, template.id);
    await setDoc(docRef, template);
  } catch (error) {
    handleFirestoreError(error, "write", `${COLLECTION_NAME}/${template.id}`);
  }
}

/**
 * Activate a template for a specific age.
 * When activating, any currently active template for the same age is archived.
 */
export async function activateLdssTemplate(templateId: string, age: LdssAge, email: string): Promise<void> {
  try {
    // 1. Fetch all templates for this age
    const allTemplates = await getLdssTemplatesByAge(age);
    const batch = writeBatch(db);
    const now = new Date().toISOString();

    // 2. Loop through and archive any currently active template
    allTemplates.forEach((t) => {
      if (t.status === "active" && t.id !== templateId) {
        const docRef = doc(db, COLLECTION_NAME, t.id);
        batch.update(docRef, {
          status: "archived",
          updatedAt: now,
          updatedBy: email
        });
      }
    });

    // 3. Mark target template as active
    const targetRef = doc(db, COLLECTION_NAME, templateId);
    batch.update(targetRef, {
      status: "active",
      publishedAt: now,
      updatedAt: now,
      updatedBy: email
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, "write", `${COLLECTION_NAME}/${templateId}/activate`);
  }
}

/**
 * Archive a non-active template
 */
export async function archiveLdssTemplate(templateId: string, email: string): Promise<void> {
  try {
    const docRef = doc(db, COLLECTION_NAME, templateId);
    const now = new Date().toISOString();
    await setDoc(docRef, {
      status: "archived",
      updatedAt: now,
      updatedBy: email
    }, { merge: true });
  } catch (error) {
    handleFirestoreError(error, "write", `${COLLECTION_NAME}/${templateId}/archive`);
  }
}

/**
 * Seed official LDSS Usia 6 template atomically
 */
export async function seedLdssTemplateAge6(email: string, seedDomains: any[]): Promise<string> {
  const seedTemplateId = "template_6_official_v1_0";
  const docRef = doc(db, COLLECTION_NAME, seedTemplateId);

  try {
    // 1. Fetch current templates for age 6
    const existing = await getLdssTemplatesByAge(6);
    if (existing && existing.length > 0) {
      throw new Error("Template Usia 6 sudah ada.");
    }

    // 2. Perform transaction to write safely
    return await runTransaction(db, async (transaction) => {
      const docSnap = await transaction.get(docRef);
      if (docSnap.exists()) {
        throw new Error("Template resmi Usia 6 sudah ada di database.");
      }

      const now = new Date().toISOString();
      const template: LdssTemplate = {
        id: seedTemplateId,
        age: 6,
        version: "v1.0",
        status: "draft",
        domains: seedDomains,
        createdAt: now,
        updatedAt: now,
        createdBy: email
      };

      transaction.set(docRef, template);
      return seedTemplateId;
    });
  } catch (error: any) {
    if (error.message && (error.message.includes("sudah ada") || error.message.includes("sudah pernah"))) {
      throw error;
    }
    handleFirestoreError(error, "write", `${COLLECTION_NAME}/${seedTemplateId}/seed`);
    throw error;
  }
}

/**
 * Seed official LDSS Usia 7 template atomically with validation
 */
export async function seedLdssTemplateAge7(email: string, seedDomains: any[]): Promise<string> {
  const seedTemplateId = "template_7_official_v1_0";
  const docRef = doc(db, COLLECTION_NAME, seedTemplateId);

  // Verification
  if (seedDomains.length !== 15) {
    throw new Error("Verifikasi Gagal: Jumlah domain harus tepat 15.");
  }
  let totalInds = 0;
  for (const dom of seedDomains) {
    if (!dom.indicators || dom.indicators.length !== 5) {
      throw new Error(`Verifikasi Gagal: Domain '${dom.name}' harus memiliki tepat 5 indikator.`);
    }
    totalInds += dom.indicators.length;
  }
  if (totalInds !== 75) {
    throw new Error("Verifikasi Gagal: Total indikator harus tepat 75.");
  }

  try {
    // 1. Fetch current templates for age 7
    const existing = await getLdssTemplatesByAge(7);
    if (existing && existing.length > 0) {
      throw new Error("Template Usia 7 sudah ada.");
    }

    // 2. Perform transaction to write safely
    return await runTransaction(db, async (transaction) => {
      const docSnap = await transaction.get(docRef);
      if (docSnap.exists()) {
        throw new Error("Template resmi Usia 7 sudah ada di database.");
      }

      const now = new Date().toISOString();
      const template: LdssTemplate = {
        id: seedTemplateId,
        age: 7,
        version: "v1.0",
        status: "draft",
        domains: seedDomains,
        createdAt: now,
        updatedAt: now,
        createdBy: email
      };

      transaction.set(docRef, template);
      return seedTemplateId;
    });
  } catch (error: any) {
    if (error.message && (error.message.includes("sudah ada") || error.message.includes("sudah pernah") || error.message.includes("Verifikasi Gagal"))) {
      throw error;
    }
    handleFirestoreError(error, "write", `${COLLECTION_NAME}/${seedTemplateId}/seed`);
    throw error;
  }
}

/**
 * Seed official LDSS Usia 8 template atomically with validation
 */
export async function seedLdssTemplateAge8(email: string, seedDomains: any[]): Promise<string> {
  const seedTemplateId = "template_8_official_v1_0";
  const docRef = doc(db, COLLECTION_NAME, seedTemplateId);

  // Verification
  if (seedDomains.length !== 15) {
    throw new Error("Verifikasi Gagal: Jumlah domain harus tepat 15.");
  }
  let totalInds = 0;
  for (const dom of seedDomains) {
    if (!dom.indicators || dom.indicators.length !== 5) {
      throw new Error(`Verifikasi Gagal: Domain '${dom.name}' harus memiliki tepat 5 indikator.`);
    }
    totalInds += dom.indicators.length;
  }
  if (totalInds !== 75) {
    throw new Error("Verifikasi Gagal: Total indikator harus tepat 75.");
  }

  try {
    // 1. Fetch current templates for age 8
    const existing = await getLdssTemplatesByAge(8);
    if (existing && existing.length > 0) {
      throw new Error("Template Usia 8 sudah ada.");
    }

    // 2. Perform transaction to write safely
    return await runTransaction(db, async (transaction) => {
      const docSnap = await transaction.get(docRef);
      if (docSnap.exists()) {
        throw new Error("Template resmi Usia 8 sudah ada di database.");
      }

      const now = new Date().toISOString();
      const template: LdssTemplate = {
        id: seedTemplateId,
        age: 8,
        version: "v1.0",
        status: "draft",
        domains: seedDomains,
        createdAt: now,
        updatedAt: now,
        createdBy: email
      };

      transaction.set(docRef, template);
      return seedTemplateId;
    });
  } catch (error: any) {
    if (error.message && (error.message.includes("sudah ada") || error.message.includes("sudah pernah") || error.message.includes("Verifikasi Gagal"))) {
      throw error;
    }
    handleFirestoreError(error, "write", `${COLLECTION_NAME}/${seedTemplateId}/seed`);
    throw error;
  }
}

/**
 * Seed official LDSS Usia 9 template atomically with validation
 */
export async function seedLdssTemplateAge9(email: string, seedDomains: any[]): Promise<string> {
  const seedTemplateId = "template_9_official_v1_0";
  const docRef = doc(db, COLLECTION_NAME, seedTemplateId);

  // Verification
  if (seedDomains.length !== 15) {
    throw new Error("Verifikasi Gagal: Jumlah domain harus tepat 15.");
  }
  let totalInds = 0;
  for (const dom of seedDomains) {
    if (!dom.indicators || dom.indicators.length !== 5) {
      throw new Error(`Verifikasi Gagal: Domain '${dom.name}' harus memiliki tepat 5 indikator.`);
    }
    totalInds += dom.indicators.length;
  }
  if (totalInds !== 75) {
    throw new Error("Verifikasi Gagal: Total indikator harus tepat 75.");
  }

  try {
    // 1. Fetch current templates for age 9
    const existing = await getLdssTemplatesByAge(9);
    if (existing && existing.length > 0) {
      throw new Error("Template Usia 9 sudah ada.");
    }

    // 2. Perform transaction to write safely
    return await runTransaction(db, async (transaction) => {
      const docSnap = await transaction.get(docRef);
      if (docSnap.exists()) {
        throw new Error("Template resmi Usia 9 sudah ada di database.");
      }

      const now = new Date().toISOString();
      const template: LdssTemplate = {
        id: seedTemplateId,
        age: 9,
        version: "v1.0",
        status: "draft",
        domains: seedDomains,
        createdAt: now,
        updatedAt: now,
        createdBy: email
      };

      transaction.set(docRef, template);
      return seedTemplateId;
    });
  } catch (error: any) {
    if (error.message && (error.message.includes("sudah ada") || error.message.includes("sudah pernah") || error.message.includes("Verifikasi Gagal"))) {
      throw error;
    }
    handleFirestoreError(error, "write", `${COLLECTION_NAME}/${seedTemplateId}/seed`);
    throw error;
  }
}

/**
 * Seed official LDSS Usia 10 template atomically with validation
 */
export async function seedLdssTemplateAge10(email: string, seedDomains: any[]): Promise<string> {
  const seedTemplateId = "template_10_official_v1_0";
  const docRef = doc(db, COLLECTION_NAME, seedTemplateId);

  // Verification
  if (seedDomains.length !== 15) {
    throw new Error("Verifikasi Gagal: Jumlah domain harus tepat 15.");
  }
  let totalInds = 0;
  for (const dom of seedDomains) {
    if (!dom.indicators || dom.indicators.length !== 5) {
      throw new Error(`Verifikasi Gagal: Domain '${dom.name}' harus memiliki tepat 5 indikator.`);
    }
    totalInds += dom.indicators.length;
  }
  if (totalInds !== 75) {
    throw new Error("Verifikasi Gagal: Total indikator harus tepat 75.");
  }

  try {
    // 1. Fetch current templates for age 10
    const existing = await getLdssTemplatesByAge(10);
    if (existing && existing.length > 0) {
      throw new Error("Template Usia 10 sudah ada.");
    }

    // 2. Perform transaction to write safely
    return await runTransaction(db, async (transaction) => {
      const docSnap = await transaction.get(docRef);
      if (docSnap.exists()) {
        throw new Error("Template resmi Usia 10 sudah ada di database.");
      }

      const now = new Date().toISOString();
      const template: LdssTemplate = {
        id: seedTemplateId,
        age: 10,
        version: "v1.0",
        status: "draft",
        domains: seedDomains,
        createdAt: now,
        updatedAt: now,
        createdBy: email
      };

      transaction.set(docRef, template);
      return seedTemplateId;
    });
  } catch (error: any) {
    if (error.message && (error.message.includes("sudah ada") || error.message.includes("sudah pernah") || error.message.includes("Verifikasi Gagal"))) {
      throw error;
    }
    handleFirestoreError(error, "write", `${COLLECTION_NAME}/${seedTemplateId}/seed`);
    throw error;
  }
}

/**
 * Seed official LDSS Usia 11 template atomically with validation
 */
export async function seedLdssTemplateAge11(email: string, seedDomains: any[]): Promise<string> {
  const seedTemplateId = "template_11_official_v1_0";
  const docRef = doc(db, COLLECTION_NAME, seedTemplateId);

  // Verification
  if (seedDomains.length !== 15) {
    throw new Error("Verifikasi Gagal: Jumlah domain harus tepat 15.");
  }
  let totalInds = 0;
  for (const dom of seedDomains) {
    if (!dom.indicators || dom.indicators.length !== 5) {
      throw new Error(`Verifikasi Gagal: Domain '${dom.name}' harus memiliki tepat 5 indikator.`);
    }
    totalInds += dom.indicators.length;
  }
  if (totalInds !== 75) {
    throw new Error("Verifikasi Gagal: Total indikator harus tepat 75.");
  }

  try {
    // 1. Fetch current templates for age 11
    const existing = await getLdssTemplatesByAge(11);
    if (existing && existing.length > 0) {
      throw new Error("Template Usia 11 sudah ada.");
    }

    // 2. Perform transaction to write safely
    return await runTransaction(db, async (transaction) => {
      const docSnap = await transaction.get(docRef);
      if (docSnap.exists()) {
        throw new Error("Template resmi Usia 11 sudah ada di database.");
      }

      const now = new Date().toISOString();
      const template: LdssTemplate = {
        id: seedTemplateId,
        age: 11,
        version: "v1.0",
        status: "draft",
        domains: seedDomains,
        createdAt: now,
        updatedAt: now,
        createdBy: email
      };

      transaction.set(docRef, template);
      return seedTemplateId;
    });
  } catch (error: any) {
    if (error.message && (error.message.includes("sudah ada") || error.message.includes("sudah pernah") || error.message.includes("Verifikasi Gagal"))) {
      throw error;
    }
    handleFirestoreError(error, "write", `${COLLECTION_NAME}/${seedTemplateId}/seed`);
    throw error;
  }
}

/**
 * Seed official LDSS Usia 12 template atomically with validation
 */
export async function seedLdssTemplateAge12(email: string, seedDomains: any[]): Promise<string> {
  const seedTemplateId = "template_12_official_v1_0";
  const docRef = doc(db, COLLECTION_NAME, seedTemplateId);

  // Verification
  if (seedDomains.length !== 15) {
    throw new Error("Verifikasi Gagal: Jumlah domain harus tepat 15.");
  }
  let totalInds = 0;
  for (const dom of seedDomains) {
    if (!dom.indicators || dom.indicators.length !== 5) {
      throw new Error(`Verifikasi Gagal: Domain '${dom.name}' harus memiliki tepat 5 indikator.`);
    }
    totalInds += dom.indicators.length;
  }
  if (totalInds !== 75) {
    throw new Error("Verifikasi Gagal: Total indikator harus tepat 75.");
  }

  try {
    // 1. Fetch current templates for age 12
    const existing = await getLdssTemplatesByAge(12);
    if (existing && existing.length > 0) {
      throw new Error("Template Usia 12 sudah ada.");
    }

    // 2. Perform transaction to write safely
    return await runTransaction(db, async (transaction) => {
      const docSnap = await transaction.get(docRef);
      if (docSnap.exists()) {
        throw new Error("Template resmi Usia 12 sudah ada di database.");
      }

      const now = new Date().toISOString();
      const template: LdssTemplate = {
        id: seedTemplateId,
        age: 12,
        version: "v1.0",
        status: "draft",
        domains: seedDomains,
        createdAt: now,
        updatedAt: now,
        createdBy: email
      };

      transaction.set(docRef, template);
      return seedTemplateId;
    });
  } catch (error: any) {
    if (error.message && (error.message.includes("sudah ada") || error.message.includes("sudah pernah") || error.message.includes("Verifikasi Gagal"))) {
      throw error;
    }
    handleFirestoreError(error, "write", `${COLLECTION_NAME}/${seedTemplateId}/seed`);
    throw error;
  }
}





