export type Tier = "green" | "orange" | "red";

/** Confidential business content the classifier looks for. Personal data is separate. */
export type ConfidentialCategory = "contract_legal" | "financial_salary" | "mna_strategy" | "code_secrets" | "security_incident" | "marked_confidential";
export type PolicyCategory = ConfidentialCategory | "personal";

/** What the admin wants for a category: keep on GREEN, mask and allow ORANGE, or allow any model. */
export type CategoryAction = "green" | "mask" | "any";

export type TeamId = "hr" | "legal" | "marketing" | "engineering";

export interface Policy {
  actions: Record<PolicyCategory, CategoryAction>;
  /** Below this confidence the request stays on GREEN. 0..1 */
  threshold: number;
  redAllowed: boolean;
}

export interface User {
  id: string;
  name: string;
  role: string;
  team: TeamId;
  avatarColor: string;
}

/** One routed request, as admins see it. Detected categories only, never the content. */
export interface AuditEntry {
  id: string;
  at: string;
  userId: string;
  team: TeamId;
  categories: PolicyCategory[];
  maskedItems: number;
  routedTier: Tier;
  model: string;
  reason: string;
  confidence: number;
  lowConfidence: boolean;
}
