// People to talk to: colleagues and contacts outside the organisation (all
// fictional), with a few conversations already going. Person-to-person messages
// never go to an AI model; the other side's replies are simulated.

import { ORG, USERS } from "../../store/seed";

export type Presence = "online" | "away" | "offline";

export interface Contact {
  id: string;
  name: string;
  role: string;
  /** Organisation, for people outside ours. */
  org?: string;
  presence: Presence;
  avatarColor: string;
  /** Simulated replies, used in turn. */
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
const REPLIES: Record<string, string[]> = {
  "u-lena": ["Thanks, I'll take a look this afternoon.", "Sounds good. Can we sync for 10 minutes tomorrow?", "Noted, I'll update the team."],
  "u-tobias": ["Got it. I'll check the clauses and come back to you.", "Please don't forward that outside yet, I'm still reviewing it.", "Thanks, that helps."],
  "u-mia": ["Love it! I'll share it with the agency.", "Back in 20 minutes, then I'll reply properly.", "Can you send me the final version?"],
  "u-jan": ["On it.", "Deployed, should be live in a few minutes.", "Can you send me the error message you see?"],
};

export const CONTACTS: Contact[] = [
  ...USERS.map((u) => ({ id: u.id, name: u.name, role: u.role, presence: PRESENCE[u.id], avatarColor: u.avatarColor, replies: REPLIES[u.id] })),
  { id: "p-daniel", name: "Daniel Krüger", role: "Field Service Planning", presence: "offline", avatarColor: "bg-amber-700",
    replies: ["Sorry, I was out on site. I'll call you back.", "Okay, I'll plan it in for next week."] },
  { id: "p-markus", name: "Markus Brandt", role: "Controlling", presence: "online", avatarColor: "bg-emerald-700",
    replies: ["The Q3 numbers are almost done.", "Let me check and get back to you before lunch."] },
  { id: "x-erik", name: "Erik Sandberg", role: "Account Manager", org: "Baltic Grid Components", presence: "online", avatarColor: "bg-cyan-700",
    replies: ["Thanks! I'll confirm the delivery date by tomorrow.", "Our technician can do Friday morning. Does 9:00 work?", "I'll send the updated quote today."] },
  { id: "x-sofia", name: "Sofia Marino", role: "Lawyer", org: "Marino & Partner", presence: "away", avatarColor: "bg-fuchsia-700",
    replies: ["Thank you, I'll review it and reply by Thursday.", "Could you send the latest draft as a PDF?"] },
  { id: "x-petra", name: "Petra Lindqvist", role: "Customer", org: "Private customer", presence: "offline", avatarColor: "bg-orange-700",
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
