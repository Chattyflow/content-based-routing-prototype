// The classifier: simple, deterministic and explainable. In production it would
// run on the vendor's EU infrastructure before a request leaves; here it runs in
// the browser.
//
// - Personal data: regular expressions (see pii.ts).
// - Confidential content: weighted keyword and pattern rules per category, in
//   English and German. A category's score is the sum of its fired rules,
//   capped at 1; it counts as detected from DETECT_AT.

import type { ConfidentialCategory } from "../types.ts";
import type { AiCheck } from "./aiCheck.ts";
import { detect, type KnownPerson, type PiiExtra, type PiiKind, type PiiMatch } from "./pii.ts";

export const DETECT_AT = 0.5;

export interface Rule {
  id: string;
  category: ConfidentialCategory;
  label: string;
  weight: number;
  pattern: RegExp;
}

export const CATEGORY_INFO: Record<ConfidentialCategory, { label: string; reason: string }> = {
  contract_legal: { label: "Contract / legal terms", reason: "a confidential contract or legal matter" },
  financial_salary: { label: "Financial figures / salaries", reason: "salary or financial information" },
  mna_strategy: { label: "M&A / strategy", reason: "merger or strategy plans" },
  code_secrets: { label: "Source code / secrets", reason: "source code with a secret in it" },
  security_incident: { label: "Security incident", reason: "a security incident" },
  health_data: { label: "Health / patient data", reason: "health or patient information" },
  marked_confidential: { label: "Marked confidential", reason: "a document marked confidential" },
};

export const RULES: Rule[] = [
  // Contract / legal
  { id: "nda", category: "contract_legal", label: "NDA / Geheimhaltung", weight: 0.6, pattern: /\b(NDA|non-disclosure|Geheimhaltungsvereinbarung)\b/i },
  { id: "penalty", category: "contract_legal", label: "Penalty clause / Vertragsstrafe", weight: 0.7, pattern: /\b(Vertragsstrafen?|Konventionalstrafen?|penalty clauses?|liquidated damages)\b/i },
  { id: "clause", category: "contract_legal", label: "Clause / § reference", weight: 0.25, pattern: /\b(clauses?|Klauseln?)\b|§\s?\d+/i },
  { id: "liability", category: "contract_legal", label: "Liability / Haftung", weight: 0.3, pattern: /\b(liability|Haftung\w*|indemnif\w*)\b/i },
  { id: "contract", category: "contract_legal", label: "Contract / Vertrag", weight: 0.3, pattern: /\b(framework agreement|Rahmenvertrag|contracts?|Vertrag|Verträge)\b/i },
  { id: "dismissal", category: "contract_legal", label: "Dismissal / Kündigung", weight: 0.5, pattern: /\b(Kündigung|termination of employment|dismissal|Abmahnung\w*|written warnings?)\b/i },

  // Financial figures / salaries
  { id: "salary", category: "financial_salary", label: "Salary / Gehalt", weight: 0.6, pattern: /\b(Gehalt|Gehälter|salary|salaries|Vergütung|compensation|bonus)\b/i },
  { id: "amount", category: "financial_salary", label: "Money amount", weight: 0.25, pattern: /(€|EUR)\s?\d[\d.,]*|\d[\d.,]*\s?(€|EUR|Mio\.?|million|m\b)/i },
  { id: "results", category: "financial_salary", label: "Revenue / forecast", weight: 0.4, pattern: /\b(revenue|Umsatz|EBITDA|margins?|forecast|Prognose|P&L|quarterly results)\b/i },
  { id: "figures", category: "financial_salary", label: "Figures / Zahlen", weight: 0.15, pattern: /\b(figures|Zahlen|numbers)\b/i },

  // M&A / strategy
  { id: "mna", category: "mna_strategy", label: "Merger / acquisition", weight: 0.7, pattern: /\b(merger|acquisition|takeover|Übernahme|Fusion|due diligence|letter of intent|LOI)\b/i },
  { id: "codename", category: "mna_strategy", label: "Project codename", weight: 0.1, pattern: /\b(Project|Projekt)\s+[A-Z][a-z]+\b|\bthe [A-Z][a-z]+ topic\b/ },
  { id: "leadership", category: "mna_strategy", label: "Leadership / board", weight: 0.15, pattern: /\b(leadership|board|Vorstand|Aufsichtsrat|executive)\b/i },
  { id: "keep-internal", category: "mna_strategy", label: "Keep internal", weight: 0.2, pattern: /\bkeep\b.{0,30}\binternal\b|\bnoch nicht kommunizieren\b/i },
  { id: "strategy", category: "mna_strategy", label: "Strategy / roadmap", weight: 0.2, pattern: /\b(strategy|Strategie|roadmap|market entry)\b/i },

  // Source code / secrets
  { id: "code-block", category: "code_secrets", label: "Code block", weight: 0.4, pattern: /```[\s\S]*?```/ },
  { id: "api-key", category: "code_secrets", label: "String that looks like an API key", weight: 0.8, pattern: /\b(sk|pk|rk)_(live|test)_[A-Za-z0-9]{12,}|\bAKIA[0-9A-Z]{16}\b|\bghp_[A-Za-z0-9]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { id: "secret-assign", category: "code_secrets", label: "Secret assigned in code", weight: 0.6, pattern: /\b(api[_-]?key|secret|password|passwort|token)\s*[:=]/i },
  { id: "code-syntax", category: "code_secrets", label: "Code syntax", weight: 0.3, pattern: /\b(import \w+|def \w+\(|function \w+\(|SELECT .+ FROM)\b/ },

  // Security incidents
  { id: "incident", category: "security_incident", label: "Incident / breach", weight: 0.6, pattern: /\b(security incident|Sicherheitsvorfall|breach|ransomware|compromised|kompromittiert|CVE-\d{4}-\d+)\b/i },
  { id: "phishing", category: "security_incident", label: "Phishing / vulnerability", weight: 0.4, pattern: /\b(phishing|vulnerability|Schwachstelle|exploit)\b/i },
  { id: "forensics", category: "security_incident", label: "Outage / forensics", weight: 0.3, pattern: /\b(outage|Ausfall|forensics?|Forensik)\b/i },

  // Health / patient data (a special category under GDPR Art. 9)
  { id: "patient", category: "health_data", label: "Patient / Patient(in)", weight: 0.5, pattern: /\b(patients?|Patient(?:in|en|innen)?)\b/i },
  { id: "diagnosis", category: "health_data", label: "Diagnosis / medical record", weight: 0.6, pattern: /\b(diagnos(?:is|es|ed)|Diagnosen?|Befund\w*|medical (?:record|history|report)s?|Krankenakte\w*|Anamnese)\b/i },
  { id: "sick-leave", category: "health_data", label: "Sick leave / Krankmeldung", weight: 0.5, pattern: /\b(sick (?:note|leave)|Krankmeldung\w*|Krankschreibung\w*|arbeitsunfähig\w*|AU-Bescheinigung)/i },
  { id: "condition", category: "health_data", label: "Medical condition", weight: 0.5, pattern: /\b(diabetes|cancer|Krebs\w*|depression|Depressionen?|pregnan\w*|schwanger\w*|HIV|disability|Behinderung)\b/i },
  { id: "treatment", category: "health_data", label: "Treatment / medication", weight: 0.3, pattern: /\b(medication|Medikament\w*|prescriptions?|therapy|Therapie|surgery|symptoms?|Symptome?|hospital|Krankenhaus)\b/i },

  // Marked confidential
  { id: "marked", category: "marked_confidential", label: "Marked confidential / vertraulich", weight: 0.7, pattern: /\b(confidential|vertraulich|streng vertraulich|internal only|nur für den internen Gebrauch|do not forward)\b/i },
];

export interface FiredRule {
  rule: Rule;
  match: string;
}

export interface CategoryScore {
  category: ConfidentialCategory;
  score: number;
  detected: boolean;
  fired: FiredRule[];
}

export interface Classification {
  personal: PiiMatch[];
  personalCounts: Partial<Record<PiiKind, number>>;
  categories: CategoryScore[];
  detected: ConfidentialCategory[];
  /** Strongest confidential signal (0..1), detected or not. */
  maxScore: number;
  /** How sure the classifier is about its own verdict (0..1). */
  confidence: number;
  timeMs: number;
  /** Result of the optional AI check, when it ran. */
  ai?: AiCheck;
  /** Personal data only the AI check found, to be masked as well. */
  extra?: PiiExtra[];
}

export function classify(text: string, people: KnownPerson[] = []): Classification {
  const t0 = performance.now();
  const fired = RULES.flatMap((rule) => {
    const m = text.match(rule.pattern);
    return m ? [{ rule, match: m[0].slice(0, 60) }] : [];
  });
  const categories: CategoryScore[] = (Object.keys(CATEGORY_INFO) as ConfidentialCategory[]).map((category) => {
    const f = fired.filter((x) => x.rule.category === category);
    const score = Math.min(1, +f.reduce((sum, x) => sum + x.rule.weight, 0).toFixed(2));
    return { category, score, detected: score >= DETECT_AT, fired: f };
  });
  const detected = categories.filter((c) => c.detected).map((c) => c.category);
  const maxScore = Math.max(0, ...categories.map((c) => c.score));

  // Clear evidence either way gives high confidence; weak signals that do not
  // add up to a detection are exactly the cases where the classifier is unsure.
  const confidence = detected.length
    ? Math.min(0.99, 0.5 + maxScore * 0.5)
    : Math.max(0.3, Math.min(0.97, 1 - maxScore * 1.5));

  const personal = detect(text, people);
  const personalCounts: Classification["personalCounts"] = {};
  for (const p of personal) personalCounts[p.kind] = (personalCounts[p.kind] ?? 0) + 1;

  return { personal, personalCounts, categories, detected, maxScore, confidence: +confidence.toFixed(2), timeMs: performance.now() - t0 };
}
