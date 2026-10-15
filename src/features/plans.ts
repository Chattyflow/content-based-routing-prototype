// Plans for the routing API. Concept prices in EUR, excluding VAT: edit here.

export type Billing = "monthly" | "yearly";

export interface Plan {
  id: string;
  name: string;
  tagline: string;
  /** Price per month when billed monthly; null = custom quote. */
  monthly: number | null;
  /** Price per year when billed yearly (two months free). */
  yearly: number | null;
  checks: string;
  overage?: string;
  features: string[];
  popular?: boolean;
}

export const PLANS: Plan[] = [
  {
    id: "developer", name: "Developer", tagline: "Try it in your own app.", monthly: 0, yearly: 0,
    checks: "1,000 checks / month",
    features: [
      "Personal data detection and masking (EN/DE): names, emails, phones, IBANs, account numbers, dates of birth",
      "Confidential content: contracts, salaries, M&A, secrets, incidents, health data",
      "Routing decision with a one-line reason",
      "Community support",
    ],
  },
  {
    id: "team", name: "Team", tagline: "For one product or department.", monthly: 49, yearly: 490,
    checks: "50,000 checks / month", overage: "then €0.80 per 1,000",
    features: [
      "Everything in Developer",
      "AI check: a language model as a second opinion next to the rules",
      "Policies per team, with presets",
      "Routing log with metadata only, never content",
      "Email support",
    ],
    popular: true,
  },
  {
    id: "business", name: "Business", tagline: "For regulated organisations.", monthly: 249, yearly: 2490,
    checks: "500,000 checks / month", overage: "then €0.50 per 1,000",
    features: [
      "Everything in Team",
      "Processing in the EU only",
      "Data processing agreement (Art. 28 GDPR)",
      "Custom categories and rules",
      "SSO and audit log export",
      "99.9% uptime SLA, priority support",
    ],
  },
  {
    id: "enterprise", name: "Enterprise", tagline: "Your infrastructure, your rules.", monthly: null, yearly: null,
    checks: "Volume pricing",
    features: [
      "Everything in Business",
      "Self-hosted or private EU cloud",
      "Classifier model tuned on your own reviewed decisions",
      "Support for DPIAs and audits",
      "Dedicated contact",
    ],
  },
];

export const euro = (n: number) => new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);
