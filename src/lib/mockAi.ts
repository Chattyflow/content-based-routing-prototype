// Mocked AI replies: realistic canned answers per kind of request. They are
// written from the text the model actually received, so a masked request gets
// an answer with placeholders, like a real masked model would give.

export function mockReply(sentText: string): string {
  const t = sentText.toLowerCase();
  const name = sentText.match(/\[NAME_\d+\]/)?.[0] ?? sentText.match(/Petra Lindqvist|Daniel Krüger/)?.[0] ?? "the customer";

  if (/performance review/.test(t)) {
    return [
      "Summary of the 2026 performance review (draft):",
      "- Targets in field service planning were missed in two review periods, documented in two written warnings.",
      "- No salary increase is proposed for this year.",
      "- Agreed next step: a final improvement period with monthly check-ins; if targets are missed again, HR and Legal will assess a dismissal.",
      "Tone: factual, no judgement of the person. Please check against the personnel file before sharing.",
    ].join("\n");
  }
  if (/supplier contract|framework agreement|vertragsstrafe/.test(t)) {
    return [
      "Main risks in the supplier contract:",
      "1. Penalty (clause 11.2): 0.5 % per day of delay, capped at 5 % of the order value. The cap is low for grid-critical parts; consider 10 %.",
      "2. Liability is limited to €2.4m, below the likely damage of a supply failure.",
      "3. Payment within 30 days to a new bank account: verify it by phone before the first payment.",
      "4. The NDA applies, so the summary should stay internal.",
    ].join("\n");
  }
  if (/replacement meter|reply to/.test(t)) {
    return [`Dear ${name},`, "", "thank you for your call. A technician will contact you this week to arrange a date for installing your replacement meter. If a time suits you better, just reply to this email.", "", "Kind regards,", "Customer Service, Nordwerk Energie"].join("\n");
  }
  if (/slogan|campaign/.test(t)) {
    return ["Three ideas for the summer campaign:", "1. \"Sunshine in, savings on.\"", "2. \"Summer power, made simple.\"", "3. \"Long days. Low bills.\""].join("\n");
  }
  if (/401|api_key|requests\.get/.test(t)) {
    return [
      "A 401 means the API rejected the credentials. Likely causes:",
      "1. The key is a live key used against a test endpoint (or the other way round).",
      "2. The header format: this API may expect the key as the username of HTTP basic auth rather than a Bearer token.",
      "",
      "Also: the key is hard-coded in the source. Move it to an environment variable and rotate it, since it has now been shared.",
    ].join("\n");
  }
  if (/leadership|note/.test(t)) {
    return "Noted. Suggested follow-up: send the figures to the leadership group only, once they are final, and mark the message as internal.";
  }
  return `Here is a first answer to "${sentText.slice(0, 80)}". In the full product this would come from the routed model; in this prototype the reply is mocked.`;
}
