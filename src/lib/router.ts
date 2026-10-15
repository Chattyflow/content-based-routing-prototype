// Turns a classification plus the team's admin policy into a routing decision:
// tier, model and a one-line reason.
//
//   confidential content          -> GREEN (unless the admin relaxed that category)
//   personal data only            -> ORANGE with masking
//   nothing sensitive             -> the most capable model
//   confidence below the threshold -> GREEN, "Unsure, so playing safe."

import type { CategoryAction, ConfidentialCategory, Policy, PolicyCategory, Tier } from "../types";
import { CATEGORY_INFO, type Classification } from "./classifier";
import type { PiiKind } from "./pii";

export interface Model {
  id: string;
  label: string; // as shown on replies
  tier: Tier;
}

export const MODELS: Model[] = [
  { id: "eu-open", label: "Open-weight model · EU-hosted", tier: "green" },
  { id: "claude", label: "Claude · masked", tier: "orange" },
  { id: "gpt", label: "GPT · masked", tier: "orange" },
  { id: "gemini", label: "Gemini · masked", tier: "orange" },
  { id: "claude-red", label: "Claude · unmasked", tier: "red" },
];
export const modelById = (id: string) => MODELS.find((m) => m.id === id)!;
export const BEST_MASKED = modelById("claude");

const ACTION_RANK: Record<CategoryAction, number> = { green: 0, mask: 1, any: 2 };

export interface Decision {
  tier: Tier;
  model: Model;
  reason: string;
  lowConfidence: boolean;
  /** Which policy rule made the decision. */
  drivenBy: PolicyCategory | "confidence" | "none";
  masked: boolean;
}

const PII_WORDS: Record<PiiKind, [string, string]> = {
  NAME: ["name", "names"],
  EMAIL: ["email address", "email addresses"],
  PHONE: ["phone number", "phone numbers"],
  IBAN: ["IBAN", "IBANs"],
  ACCOUNT: ["account number", "account numbers"],
  TAX_ID: ["tax ID", "tax IDs"],
  DOB: ["date of birth", "dates of birth"],
};

export function describeMasking(counts: Classification["personalCounts"]): string {
  const parts = (Object.entries(counts) as [PiiKind, number][]).map(([k, n]) => `${n} ${PII_WORDS[k][n === 1 ? 0 : 1]}`);
  if (parts.length <= 1) return parts[0] ?? "nothing";
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

export function route(c: Classification, policy: Policy): Decision {
  const hasPersonal = c.personal.length > 0;
  // The strictest action among everything detected wins.
  const triggers: { category: PolicyCategory; action: CategoryAction; score: number }[] = [
    ...c.categories.filter((x) => x.detected).map((x) => ({ category: x.category as PolicyCategory, action: policy.actions[x.category], score: x.score })),
    ...(hasPersonal ? [{ category: "personal" as const, action: policy.actions.personal, score: 1 }] : []),
  ].sort((a, b) => ACTION_RANK[a.action] - ACTION_RANK[b.action] || b.score - a.score);
  const strictest = triggers[0];
  const green = modelById("eu-open");

  if (strictest?.action === "green") {
    const reason = strictest.category === "personal"
      ? `Kept on EU servers: your team keeps personal data (${describeMasking(c.personalCounts)}) on GREEN.`
      : `Kept on EU servers: this looks like ${CATEGORY_INFO[strictest.category as ConfidentialCategory].reason}.`;
    return { tier: "green", model: green, reason, lowConfidence: false, drivenBy: strictest.category, masked: false };
  }
  if (c.confidence < policy.threshold) {
    return { tier: "green", model: green, reason: "Unsure, so playing safe.", lowConfidence: true, drivenBy: "confidence", masked: false };
  }
  if (hasPersonal && policy.actions.personal === "mask") {
    return { tier: "orange", model: BEST_MASKED, reason: `Sent to Claude with ${describeMasking(c.personalCounts)} masked.`, lowConfidence: false, drivenBy: "personal", masked: true };
  }
  if (strictest?.action === "mask") {
    return {
      tier: "orange", model: BEST_MASKED, masked: true, lowConfidence: false, drivenBy: strictest.category,
      reason: `Sent to Claude with masking: your team allows ${CATEGORY_INFO[strictest.category as ConfidentialCategory]?.label.toLowerCase() ?? "this content"} on ORANGE.`,
    };
  }
  if (hasPersonal && policy.actions.personal === "any" && policy.redAllowed) {
    return { tier: "red", model: modelById("claude-red"), reason: "Your team allows personal data unmasked: using the most capable model.", lowConfidence: false, drivenBy: "personal", masked: false };
  }
  return {
    tier: "orange", model: BEST_MASKED, masked: true, lowConfidence: false, drivenBy: "none",
    reason: hasPersonal ? `Sent to Claude with ${describeMasking(c.personalCounts)} masked.` : "Nothing sensitive found: using the most capable model.",
  };
}
