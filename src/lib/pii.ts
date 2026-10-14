// Client-side PII detection and masking with typed placeholders ([NAME_1], [IBAN_1]).
// The same value always gets the same placeholder across a message and its
// context, so the model can still follow who is who.

export type PiiKind = "NAME" | "EMAIL" | "PHONE" | "IBAN" | "TAX_ID" | "DOB";

export interface PiiMatch {
  kind: PiiKind;
  value: string;
  start: number;
  end: number;
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

export function detect(text: string, people: KnownPerson[] = []): (PiiMatch & { personId?: string })[] {
  const found: (PiiMatch & { personId?: string })[] = [];
  const add = (kind: PiiKind, value: string, start: number, personId?: string) => {
    const end = start + value.length;
    if (found.some((f) => start < f.end && end > f.start)) return; // first, more specific match wins
    found.push({ kind, value, start, end, personId });
  };
  for (const m of text.matchAll(EMAIL)) add("EMAIL", m[0], m.index!);
  for (const m of text.matchAll(IBAN)) if (ibanValid(m[0])) add("IBAN", m[0], m.index!);
  for (const m of text.matchAll(DOB)) add("DOB", m[1], m.index! + m[0].lastIndexOf(m[1]));
  for (const m of text.matchAll(TAX_ID)) add("TAX_ID", m[0], m.index!);
  for (const m of text.matchAll(PHONE)) {
    const digits = m[0].replace(/\D/g, "");
    if (digits.length >= 9 && digits.length <= 15) add("PHONE", m[0].trim(), m.index!);
  }
  for (const v of nameVariants(people)) {
    const re = new RegExp(`(?<![\\p{L}])${escapeRegex(v.text)}(?![\\p{L}])`, "gu");
    for (const m of text.matchAll(re)) add("NAME", m[0], m.index!, v.personId);
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
export function maskTexts(texts: string[], people: KnownPerson[] = []): MaskResult {
  const counters: Record<string, number> = {};
  const byKey = new Map<string, string>();
  const restore: Record<string, string> = {};
  const matches: MaskResult["matches"] = [];

  const masked = texts.map((text, textIndex) => {
    const hits = detect(text, people);
    let out = "";
    let pos = 0;
    for (const h of hits) {
      const key = h.kind === "NAME" && h.personId ? `NAME:${h.personId}` : `${h.kind}:${h.value.replace(/\s/g, "").toLowerCase()}`;
      let placeholder = byKey.get(key);
      if (!placeholder) {
        counters[h.kind] = (counters[h.kind] ?? 0) + 1;
        placeholder = `[${h.kind}_${counters[h.kind]}]`;
        byKey.set(key, placeholder);
        restore[placeholder] = h.kind === "NAME" ? people.find((p) => p.id === h.personId)?.name ?? h.value : h.value;
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
  return text.replace(/\[(NAME|EMAIL|PHONE|IBAN|TAX_ID|DOB)_\d+\]/g, (p) => restore[p] ?? p);
}

export function hasSensitive(text: string, people: KnownPerson[] = []): boolean {
  return detect(text, people).length > 0;
}
