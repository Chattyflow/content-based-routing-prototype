// Client-side PII detection and masking with typed placeholders ([NAME_1], [IBAN_1]).
// The same value always gets the same placeholder across a message and its
// context, so the model can still follow who is who.

export type PiiKind = "NAME" | "EMAIL" | "PHONE" | "IBAN" | "ACCOUNT" | "TAX_ID" | "DOB";

export interface PiiMatch {
  kind: PiiKind;
  value: string;
  start: number;
  end: number;
}

/** Personal data found elsewhere (the AI check), masked wherever it appears. */
export interface PiiExtra {
  kind: PiiKind;
  value: string;
}

export interface KnownPerson {
  id: string;
  name: string; // "Lena Hoffmann"
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const IBAN = /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){3,7}(?: ?[A-Z0-9]{1,3})?\b/g;
// German tax ID (Steuer-IdNr): 11 digits, often written 12 345 678 901.
const TAX_ID = /\b\d{2} ?\d{3} ?\d{3} ?\d{3}\b/g;
// Dates of birth only when labelled as such, so ordinary dates stay readable.
const DOB = /(?:born(?: on)?|date of birth|DOB|geb\.|geboren(?: am)?|Geburtsdatum)[:\s]+(\d{1,2}\.\d{1,2}\.\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})/gi;
const PHONE = /(?<![\w+])(?:\+\d{1,3}[ -]?|0)\d{1,4}(?:[ /-]?\d{2,5}){2,4}(?![\w])/g;
// Bank account or IBAN-like number right after a label, even if it is not a valid IBAN.
const ACCOUNT_LABELLED = /(?:IBAN|BIC|account(?: number| no\.?)?|acct\.?|Kontonummer|Konto(?:-?nr\.?)?|Bankverbindung|bank details|card number|Kartennummer)\s*(?:is|ist|:|=|-)?\s*([A-Z]{0,2}\d[\dA-Z ]{6,40}\d)/gi;
// Long digit runs on their own are typical of account and card numbers.
const LONG_NUMBER = /(?<![\w.,])\d{12,24}(?![\w.,])/g;

// Names of people the workspace does not know, found from context:
//   a title ("Mr. Ahmed Fakh", "Frau Yilmaz"), a cue ("patient Ahmed Fakh",
//   "my name is Ahmed"), or a common first name followed by a surname.
// The title itself stays readable; only the name is masked.
// Case matters: "HR team" and "40 ms" are not titles. Lowercase only for the casual "mr ahmed".
const TITLE = /(?<!\p{L})(?:(?:Mr|Mrs|Ms|Miss|Mx|Dr|Prof|Sir|Madam|Herr|Frau|Hr|Fr|mr|mrs|herr|frau)\.?|(?:dr|prof)\.)(?=[ \t])/gu;
const NAME_CUE = /(?<!\p{L})(?:my name is|name is|named|name|called|patient(?:in|en|innen|s)?|client|customer|tenant|employee|colleague|heißt|namens|Kunde|Kundin|Mitarbeiter(?:in)?)(?:[ \t]*(?::|is|ist))?(?!\p{L})/giu;
const TITLES = new Set(["mr", "mrs", "ms", "miss", "mx", "dr", "prof", "sir", "madam", "herr", "frau", "hr", "fr"]);
const PARTICLES = new Set(["von", "van", "de", "der", "den", "al", "el", "bin", "ibn", "da", "di", "le", "la", "du"]);
// Words that are never part of a name, so "named the file" or "customer The…" find nothing.
const NOT_NAMES = new Set([
  "a", "an", "and", "or", "the", "is", "was", "are", "be", "to", "of", "in", "on", "at", "for", "from", "with", "who", "which", "that", "this", "these", "those",
  "he", "she", "they", "we", "i", "you", "it", "his", "her", "their", "our", "my", "your", "its", "has", "have", "had", "will", "would", "can", "please",
  "about", "after", "before", "today", "yesterday", "tomorrow", "service", "support", "team", "success", "care", "number", "id", "file", "list",
  "und", "oder", "der", "die", "das", "ein", "eine", "ist", "war", "mit", "von", "für", "aus", "bei", "er", "sie", "es", "wir", "ich", "heute", "gestern",
]);
// Common first names, used only when a capitalised surname follows ("Ahmed Fakh").
const FIRST_NAMES = new Set([
  "ahmed", "ahmad", "mohammed", "mohamed", "muhammad", "mahmoud", "ali", "omar", "hassan", "hussein", "khalid", "youssef", "yusuf", "ibrahim", "mustafa",
  "fatima", "aisha", "layla", "leila", "mariam", "maryam", "noor", "zainab", "amira", "samir", "karim", "rami", "tarek", "nadia", "yasmin",
  "mehmet", "ayse", "fatma", "emre", "murat", "elif", "zeynep", "burak", "hakan", "selin",
  "anna", "maria", "thomas", "michael", "andreas", "stefan", "christian", "peter", "klaus", "jürgen", "sabine", "julia", "laura", "katharina", "sophie",
  "lukas", "felix", "jonas", "leon", "paul", "sebastian", "alexander", "matthias", "martin", "frank", "monika", "ursula", "petra", "claudia", "sandra",
  "john", "james", "robert", "david", "richard", "joseph", "daniel", "george", "mary", "sarah", "emma", "olivia", "emily", "jessica", "jennifer", "linda",
  "carlos", "juan", "jose", "luis", "sofia", "elena", "isabel", "lucia", "marco", "giulia", "francesca", "pierre", "marie", "camille", "nicolas",
  "ivan", "olga", "natalia", "dmitri", "sergei", "piotr", "agnieszka", "katarzyna", "jan", "lars", "erik", "ingrid", "priya", "raj", "anil", "wei", "chen",
]);

/** The name that starts at `pos` (after optional spaces and titles), or null. */
function takeName(text: string, pos: number, allowLowercase: boolean): { start: number; end: number } | null {
  const word = /[ \t]*(\p{L}[\p{L}'’-]*)(\.?)/uy;
  const parts: { start: number; end: number; particle: boolean }[] = [];
  let lowercase = false;
  word.lastIndex = pos;
  for (let m = word.exec(text); m && parts.length < 4; m = word.exec(text)) {
    const w = m[1];
    const key = w.toLowerCase();
    const start = m.index + m[0].length - m[2].length - w.length;
    const end = start + w.length;
    if (!parts.length && TITLES.has(key)) continue; // "name Mr. Ahmed"
    if (parts.length && !lowercase && PARTICLES.has(key)) { parts.push({ start, end, particle: true }); continue; }
    if (NOT_NAMES.has(key)) break;
    const capital = /^\p{Lu}/u.test(w) && /\p{Ll}/u.test(w); // "Fakh", "McKay"; not "NDA" or "I"
    if (capital && !lowercase) parts.push({ start, end, particle: false });
    else if (!capital && allowLowercase && (lowercase || !parts.length) && parts.length < 2) { lowercase = true; parts.push({ start, end, particle: false }); }
    else break;
    if (m[2]) break; // a full stop ends the name
  }
  while (parts.length && parts.at(-1)!.particle) parts.pop();
  return parts.length ? { start: parts[0].start, end: parts.at(-1)!.end } : null;
}

/** Names found from context, with every later mention of the same person. */
function contextNames(text: string): { value: string; start: number; personId: string }[] {
  const spans: { start: number; end: number }[] = [];
  const push = (s: { start: number; end: number } | null, minWords = 1) => {
    if (!s || text.slice(s.start, s.end).split(/\s+/).length < minWords) return;
    if (!spans.some((x) => s.start < x.end && s.end > x.start)) spans.push(s);
  };
  for (const m of text.matchAll(TITLE)) push(takeName(text, m.index! + m[0].length, true));
  for (const m of text.matchAll(NAME_CUE)) push(takeName(text, m.index! + m[0].length, false));
  for (const m of text.matchAll(/(?<!\p{L})\p{Lu}\p{Ll}+(?=[ \t]+\p{Lu})/gu)) {
    if (FIRST_NAMES.has(m[0].toLowerCase())) push(takeName(text, m.index!, false), 2);
  }

  const out: { value: string; start: number; personId: string }[] = [];
  for (const s of spans) {
    const value = text.slice(s.start, s.end);
    const personId = `found:${value}`;
    out.push({ value, start: s.start, personId });
    // Other mentions of the same person: the full name, or one part of it on its own.
    const variants = [value, ...value.split(/\s+/).filter((p) => p.length >= 3 && !PARTICLES.has(p.toLowerCase()) && /^\p{Lu}/u.test(p))];
    for (const v of variants) {
      for (const m of text.matchAll(new RegExp(`(?<!\\p{L})${escapeRegex(v)}(?!\\p{L})`, "gu"))) out.push({ value: m[0], start: m.index!, personId });
    }
  }
  return out;
}

/** IBAN checksum (ISO 13616, mod 97), so random letters and digits are not masked. */
export function ibanValid(candidate: string): boolean {
  const s = candidate.replace(/\s/g, "").toUpperCase();
  if (s.length < 15 || s.length > 34) return false;
  const rearranged = s.slice(4) + s.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const v = /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of v) remainder = (remainder * 10 + Number(d)) % 97;
  }
  return remainder === 1;
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Full names, surnames and first names of the demo's (fictional) people. */
function nameVariants(people: KnownPerson[]) {
  const out: { text: string; personId: string }[] = [];
  for (const p of people) {
    const parts = p.name.replace(/^(Dr\.|Prof\.)\s+/, "").split(/\s+/);
    out.push({ text: p.name, personId: p.id });
    if (parts.length > 1) {
      out.push({ text: parts.slice(-1)[0], personId: p.id });
      out.push({ text: parts[0], personId: p.id });
    }
  }
  return out.sort((a, b) => b.text.length - a.text.length);
}

export function detect(text: string, people: KnownPerson[] = [], extra: PiiExtra[] = []): (PiiMatch & { personId?: string })[] {
  const found: (PiiMatch & { personId?: string })[] = [];
  const add = (kind: PiiKind, value: string, start: number, personId?: string) => {
    const end = start + value.length;
    if (found.some((f) => start < f.end && end > f.start)) return; // first, more specific match wins
    found.push({ kind, value, start, end, personId });
  };
  for (const m of text.matchAll(EMAIL)) add("EMAIL", m[0], m.index!);
  // Known people first, so "Mr. Daniel Krüger" keeps the known person's placeholder.
  for (const v of nameVariants(people)) {
    const re = new RegExp(`(?<![\\p{L}])${escapeRegex(v.text)}(?![\\p{L}])`, "gu");
    for (const m of text.matchAll(re)) add("NAME", m[0], m.index!, v.personId);
  }
  for (const n of contextNames(text)) add("NAME", n.value, n.start, n.personId);
  for (const m of text.matchAll(IBAN)) if (ibanValid(m[0])) add("IBAN", m[0], m.index!);
  for (const m of text.matchAll(ACCOUNT_LABELLED)) {
    if (m[1].replace(/\D/g, "").length >= 8) add("ACCOUNT", m[1].trim(), m.index! + m[0].lastIndexOf(m[1]));
  }
  for (const m of text.matchAll(DOB)) add("DOB", m[1], m.index! + m[0].lastIndexOf(m[1]));
  for (const m of text.matchAll(TAX_ID)) add("TAX_ID", m[0], m.index!);
  for (const m of text.matchAll(PHONE)) {
    const digits = m[0].replace(/\D/g, "");
    if (digits.length >= 9 && digits.length <= 15) add("PHONE", m[0].trim(), m.index!);
  }
  for (const m of text.matchAll(LONG_NUMBER)) add("ACCOUNT", m[0], m.index!);
  // Only values that really occur in the text are masked, so a model cannot invent any.
  for (const x of [...extra].sort((a, b) => b.value.length - a.value.length)) {
    const re = new RegExp(`(?<![\\p{L}\\d])${escapeRegex(x.value)}(?![\\p{L}\\d])`, "giu");
    for (const m of text.matchAll(re)) add(x.kind, m[0], m.index!, x.kind === "NAME" ? `found:${x.value}` : undefined);
  }
  return found.sort((a, b) => a.start - b.start);
}

export interface MaskResult {
  masked: string[];
  /** placeholder -> original value (first value seen for that placeholder) */
  restore: Record<string, string>;
  matches: (PiiMatch & { placeholder: string; textIndex: number })[];
  count: number;
}

/** Mask several texts with one consistent set of placeholders. */
export function maskTexts(texts: string[], people: KnownPerson[] = [], extra: PiiExtra[] = []): MaskResult {
  const counters: Record<string, number> = {};
  const byKey = new Map<string, string>();
  const restore: Record<string, string> = {};
  const matches: MaskResult["matches"] = [];

  const masked = texts.map((text, textIndex) => {
    const hits = detect(text, people, extra);
    let out = "";
    let pos = 0;
    for (const h of hits) {
      const key = h.kind === "NAME" && h.personId ? `NAME:${h.personId}` : `${h.kind}:${h.value.replace(/\s/g, "").toLowerCase()}`;
      let placeholder = byKey.get(key);
      if (!placeholder) {
        counters[h.kind] = (counters[h.kind] ?? 0) + 1;
        placeholder = `[${h.kind}_${counters[h.kind]}]`;
        byKey.set(key, placeholder);
        restore[placeholder] = h.kind !== "NAME" ? h.value
          : h.personId?.startsWith("found:") ? h.personId.slice(6)
          : people.find((p) => p.id === h.personId)?.name ?? h.value;
      }
      matches.push({ ...h, placeholder, textIndex });
      out += text.slice(pos, h.start) + placeholder;
      pos = h.end;
    }
    return out + text.slice(pos);
  });
  return { masked, restore, matches, count: matches.length };
}

/** Put the original values back, on this device only (used to display a masked model's reply). */
export function unmask(text: string, restore: Record<string, string>): string {
  return text.replace(/\[(NAME|EMAIL|PHONE|IBAN|ACCOUNT|TAX_ID|DOB)_\d+\]/g, (p) => restore[p] ?? p);
}

export function hasSensitive(text: string, people: KnownPerson[] = []): boolean {
  return detect(text, people).length > 0;
}
