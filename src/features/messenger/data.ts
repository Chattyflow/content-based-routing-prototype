// People to talk to: colleagues and contacts outside the organisation (all
// fictional), with a few conversations already going. In a real product the
// messages go to the person. In this prototype the other side is played by a
// model on OpenRouter (server/api.ts, /api/dm) using `about`, with personal data
// masked first; without a key, the canned `replies` are used.

import { ORG, USERS } from "../../store/seed.ts";

export type Presence = "online" | "away" | "offline";

export interface Contact {
  id: string;
  name: string;
  role: string;
  /** Organisation, for people outside ours. */
  org?: string;
  presence: Presence;
  avatarColor: string;
  /** Who they are, for the model that plays them. */
  about: string;
  /** Canned replies, used in turn when the model is not available. */
  replies: string[];
}

export interface Message {
  id: string;
  from: "me" | string; // a contact id
  text: string;
  at: number;
}

export const isExternal = (c: Contact) => Boolean(c.org);

const PRESENCE: Record<string, Presence> = { "u-lena": "online", "u-tobias": "online", "u-mia": "away", "u-jan": "online" };
const ABOUT: Record<string, string> = {
  "u-lena": "You lead HR: hiring, performance reviews, contracts of employment, sick leave and payroll questions. Warm, organised, careful with personal data.",
  "u-tobias": "You are Legal Counsel: supplier contracts, NDAs, penalty clauses, disputes. Precise and a little cautious; you don't like confidential documents leaving the company before you've reviewed them.",
  "u-mia": "You run Marketing: campaigns, the website, social media and the summer campaign with an outside agency. Upbeat and quick.",
  "u-jan": "You are a software engineer on the internal platform team, including the AI workspace and its routing service. Practical and brief; you ask for error messages and steps to reproduce.",
  "p-daniel": "You plan field service: technician schedules, meter installations and replacements at customers' homes.",
  "p-markus": "You work in Controlling: budgets, quarterly figures, forecasts and supplier invoices. Exact with numbers.",
  "x-erik": "You are an account manager at Baltic Grid Components, a supplier of smart meters and grid parts to Nordwerk Energie. You handle orders, quotes, delivery dates and installation teams. Friendly and service-minded, but you don't promise what you can't confirm.",
  "x-sofia": "You are a lawyer at Marino & Partner, an outside law firm advising Nordwerk Energie on contracts and disputes. Formal and precise; you ask for documents in writing.",
  "x-petra": "You are a private customer of Nordwerk Energie waiting for a replacement electricity meter. Polite, a bit impatient about the delay.",
};

const REPLIES: Record<string, string[]> = {
  "u-lena": ["Thanks, I'll take a look this afternoon.", "Sounds good. Can we sync for 10 minutes tomorrow?", "Noted, I'll update the team."],
  "u-tobias": ["Got it. I'll check the clauses and come back to you.", "Please don't forward that outside yet, I'm still reviewing it.", "Thanks, that helps."],
  "u-mia": ["Love it! I'll share it with the agency.", "Back in 20 minutes, then I'll reply properly.", "Can you send me the final version?"],
  "u-jan": ["On it.", "Deployed, should be live in a few minutes.", "Can you send me the error message you see?"],
};

export const CONTACTS: Contact[] = [
  ...USERS.map((u) => ({ id: u.id, name: u.name, role: u.role, presence: PRESENCE[u.id], avatarColor: u.avatarColor, about: ABOUT[u.id], replies: REPLIES[u.id] })),
  { id: "p-daniel", about: ABOUT["p-daniel"], name: "Daniel Krüger", role: "Field Service Planning", presence: "offline", avatarColor: "bg-amber-700",
    replies: ["Sorry, I was out on site. I'll call you back.", "Okay, I'll plan it in for next week."] },
  { id: "p-markus", about: ABOUT["p-markus"], name: "Markus Brandt", role: "Controlling", presence: "online", avatarColor: "bg-emerald-700",
    replies: ["The Q3 numbers are almost done.", "Let me check and get back to you before lunch."] },
  { id: "x-erik", about: ABOUT["x-erik"], name: "Erik Sandberg", role: "Account Manager", org: "Baltic Grid Components", presence: "online", avatarColor: "bg-cyan-700",
    replies: ["Thanks! I'll confirm the delivery date by tomorrow.", "Our technician can do Friday morning. Does 9:00 work?", "I'll send the updated quote today."] },
  { id: "x-sofia", about: ABOUT["x-sofia"], name: "Sofia Marino", role: "Lawyer", org: "Marino & Partner", presence: "away", avatarColor: "bg-fuchsia-700",
    replies: ["Thank you, I'll review it and reply by Thursday.", "Could you send the latest draft as a PDF?"] },
  { id: "x-petra", about: ABOUT["x-petra"], name: "Petra Lindqvist", role: "Customer", org: "Private customer", presence: "offline", avatarColor: "bg-orange-700",
    replies: ["Thank you for letting me know!", "Friday works for me."] },
];

const min = 60_000;

/** A few conversations so the window does not start empty. */
export function seedThreads(now = Date.now()): Record<string, Message[]> {
  const m = (from: string, text: string, ago: number, i: number): Message => ({ id: `seed-${from}-${i}`, from, text, at: now - ago * min });
  return {
    "u-tobias": [m("me", "Do you have the signed NDA from Baltic Grid?", 95, 1), m("u-tobias", "Not yet, Erik said end of the week. I'll forward it when it's in.", 90, 2)],
    "u-jan": [m("u-jan", "The routing service deploy is done. Shout if anything looks off.", 40, 1)],
    "u-mia": [m("u-mia", "Summer campaign draft is in the shared folder, would love your feedback.", 180, 1)],
    "x-erik": [m("x-erik", "Hi! The replacement meters ship on Wednesday. Do you need the installation team as well?", 25, 1)],
    "x-sofia": [m("me", "Thanks for the call earlier, I'll send the documents tomorrow.", 60 * 26, 1), m("x-sofia", "Perfect, thank you.", 60 * 25, 2)],
  };
}

/** Unread at the start: the last message is theirs and fairly recent. */
export const SEED_UNREAD: Record<string, number> = { "u-jan": 1, "x-erik": 1 };

export { ORG };
