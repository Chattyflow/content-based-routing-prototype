// Fictional organisation, users, team policies, demo prompts and an audit
// history, so the dashboard has something to show on first load.

import type { AuditEntry, Policy, PolicyCategory, TeamId, Tier, User } from "../types";
import type { KnownPerson } from "../lib/pii";

export const ORG = "Nordwerk Energie GmbH";

export const TEAMS: Record<TeamId, string> = { hr: "HR", legal: "Legal", marketing: "Marketing", engineering: "Engineering" };

export const USERS: User[] = [
  { id: "u-lena", name: "Lena Hoffmann", role: "HR Lead", team: "hr", avatarColor: "bg-indigo-600" },
  { id: "u-tobias", name: "Tobias Wagner", role: "Legal Counsel", team: "legal", avatarColor: "bg-teal-700" },
  { id: "u-mia", name: "Mia Schulz", role: "Marketing Manager", team: "marketing", avatarColor: "bg-rose-700" },
  { id: "u-jan", name: "Jan Becker", role: "Software Engineer", team: "engineering", avatarColor: "bg-sky-700" },
];

/** Names the personal-data check recognises (all fictional). */
export const PEOPLE: KnownPerson[] = [
  ...USERS.map((u) => ({ id: u.id, name: u.name })),
  { id: "p-daniel", name: "Daniel Krüger" },
  { id: "p-petra", name: "Petra Lindqvist" },
  { id: "p-markus", name: "Markus Brandt" },
];

const ALL_GREEN: Record<PolicyCategory, "green"> = {
  personal: "green", contract_legal: "green", financial_salary: "green", mna_strategy: "green",
  code_secrets: "green", security_incident: "green", marked_confidential: "green",
};

export const PRESETS: Record<"standard" | "strict" | "lenient", { label: string; policy: Policy }> = {
  standard: { label: "Standard", policy: { actions: { ...ALL_GREEN, personal: "mask" }, threshold: 0.7, redAllowed: false, overrideAllowed: true } },
  strict: { label: "Strict", policy: { actions: { ...ALL_GREEN }, threshold: 0.85, redAllowed: false, overrideAllowed: false } },
  lenient: { label: "Lenient", policy: { actions: { ...ALL_GREEN, personal: "mask", financial_salary: "mask", mna_strategy: "mask" }, threshold: 0.6, redAllowed: false, overrideAllowed: true } },
};

export function initialPolicies(): Record<TeamId, Policy> {
  const copy = (p: Policy): Policy => ({ ...p, actions: { ...p.actions } });
  // HR starts on the standard rules so the demo can make it stricter.
  return { hr: copy(PRESETS.standard.policy), legal: copy(PRESETS.standard.policy), marketing: copy(PRESETS.lenient.policy), engineering: copy(PRESETS.standard.policy) };
}

export interface DemoPrompt {
  id: string;
  label: string;
  expect: string;
  text: string;
}

export const DEMO_PROMPTS: DemoPrompt[] = [
  {
    id: "hr", label: "HR performance review", expect: "GREEN",
    text: "Draft the summary of the 2026 performance review for Daniel Krüger (Field Service Planning). Current salary €62,400; we propose no raise this year. After two written warnings, the next step could be a Kündigung if targets are missed again. Reviewer: Lena Hoffmann.",
  },
  {
    id: "contract", label: "Supplier contract", expect: "GREEN",
    text: "Summarise the risks in this supplier contract: Framework agreement with Baltic Grid Components, clause 11.2: Vertragsstrafe of 0.5% per day of delay, capped at 5% of the order value. Liability limited to €2.4m. Payments to IBAN DE44 5001 0517 5407 3249 31 within 30 days. Confidential, NDA applies.",
  },
  {
    id: "customer", label: "Customer email", expect: "ORANGE, masked",
    text: "Please draft a friendly reply to Petra Lindqvist, who called from +49 40 5550 1234 asking when her replacement meter will be installed. Tell her a technician will contact her this week.",
  },
  { id: "slogan", label: "Campaign slogan", expect: "Best model", text: "Write a slogan for our summer campaign" },
  {
    id: "code", label: "Code with an API key", expect: "GREEN",
    text: 'Why does this return 401?\n```python\nimport requests\nAPI_KEY = "nw-demo-7f3a9c2e4b1d8e6f0a5c9b2d"\nresp = requests.get("https://api.payments.example/v1/charges", headers={"Authorization": f"Bearer {API_KEY}"})\n```',
  },
  {
    id: "ambiguous", label: "Ambiguous internal note", expect: "GREEN, playing safe",
    text: "Quick note from today's leadership sync: let's keep the Nordlicht topic internal for now. Figures follow next week.",
  },
];

/** A week of plausible past requests, so the dashboard is not empty. */
export function seedAudit(now = Date.now()): AuditEntry[] {
  type Row = [hoursAgo: number, user: string, categories: PolicyCategory[], routed: Tier, opts?: Partial<AuditEntry>];
  const rows: Row[] = [
    [150, "u-mia", [], "orange"], [149, "u-mia", ["personal"], "orange", { maskedItems: 2 }],
    [140, "u-lena", ["personal", "financial_salary"], "green"], [130, "u-tobias", ["contract_legal", "marked_confidential"], "green"],
    [126, "u-jan", ["code_secrets"], "green"], [120, "u-jan", [], "orange"], [118, "u-mia", [], "orange"],
    [100, "u-tobias", ["contract_legal"], "green", { override: { from: "green", to: "orange", model: "Claude · masked" } }],
    [96, "u-lena", ["personal", "contract_legal"], "green"], [90, "u-mia", ["mna_strategy"], "orange", { maskedItems: 0 }],
    [80, "u-jan", ["security_incident"], "green"], [74, "u-lena", [], "green", { lowConfidence: true, confidence: 0.55 }],
    [70, "u-tobias", ["personal"], "orange", { maskedItems: 3 }], [60, "u-jan", [], "orange", { flag: "too_cautious" }],
    [52, "u-mia", ["personal"], "orange", { maskedItems: 1 }], [45, "u-lena", ["financial_salary"], "green", { flag: "too_cautious" }],
    [40, "u-jan", ["code_secrets"], "green"], [30, "u-tobias", [], "orange"], [26, "u-mia", [], "orange"],
    [20, "u-lena", ["personal"], "orange", { maskedItems: 2, flag: "missed_sensitive" }], [12, "u-jan", [], "green", { lowConfidence: true, confidence: 0.6 }],
    [6, "u-tobias", ["contract_legal", "personal"], "green"],
  ];
  return rows.map(([h, userId, categories, routedTier, opts], i) => ({
    id: `seed-${i}`,
    at: new Date(now - h * 3_600_000).toISOString(),
    userId,
    team: USERS.find((u) => u.id === userId)!.team,
    mode: "auto",
    categories,
    maskedItems: 0,
    recommendedTier: opts?.override?.from ?? routedTier,
    routedTier: opts?.override?.to ?? routedTier,
    model: routedTier === "green" ? "Open-weight model · EU-hosted" : "Claude · masked",
    confidence: 0.9,
    lowConfidence: false,
    ...opts,
  }));
}
