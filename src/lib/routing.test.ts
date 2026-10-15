import { describe, expect, it } from "vitest";
import { DEMO_PROMPTS, PEOPLE, PRESETS, initialPolicies } from "../store/seed";
import { classify } from "./classifier";
import { maskTexts } from "./pii";
import { route } from "./router";

const standard = PRESETS.standard.policy;
const prompt = (id: string) => DEMO_PROMPTS.find((p) => p.id === id)!.text;
const decide = (id: string, policy = standard) => route(classify(prompt(id), PEOPLE), policy);

describe("every demo prompt routes as the demo script expects", () => {
  it("HR performance review with names and salary -> GREEN", () => {
    const d = decide("hr");
    expect(d.tier).toBe("green");
    expect(d.reason).toMatch(/^Kept on EU servers: this looks like/);
  });

  it("supplier contract with penalty clause and IBAN -> GREEN, as a contract", () => {
    const d = decide("contract");
    expect(d.tier).toBe("green");
    expect(d.reason).toBe("Kept on EU servers: this looks like a confidential contract or legal matter.");
  });

  it("customer email with only a name and phone -> ORANGE, masked", () => {
    const c = classify(prompt("customer"), PEOPLE);
    expect(c.detected).toEqual([]);
    const d = route(c, standard);
    expect([d.tier, d.masked]).toEqual(["orange", true]);
    expect(d.reason).toBe("Sent to Claude with 1 name and 1 phone number masked.");
  });

  it("campaign slogan -> best model", () => {
    const d = decide("slogan");
    expect(d.tier).toBe("orange");
    expect(d.reason).toBe("Nothing sensitive found: using the most capable model.");
  });

  it("code with an API key -> GREEN", () => {
    const c = classify(prompt("code"), PEOPLE);
    expect(c.detected).toContain("code_secrets");
    expect(c.categories.find((x) => x.category === "code_secrets")!.fired.map((f) => f.rule.id)).toContain("secret-assign");
    expect(route(c, standard).tier).toBe("green");
  });

  it("ambiguous internal note -> low confidence -> GREEN, playing safe", () => {
    const c = classify(prompt("ambiguous"), PEOPLE);
    expect(c.detected).toEqual([]);
    expect(c.confidence).toBeLessThan(standard.threshold);
    const d = route(c, standard);
    expect([d.tier, d.reason, d.lowConfidence]).toEqual(["green", "Unsure, so playing safe.", true]);
  });
});

describe("admin rules", () => {
  it("a stricter HR team keeps personal data on GREEN", () => {
    expect(decide("customer", PRESETS.strict.policy).tier).toBe("green");
  });

  it("lowering the threshold lets the ambiguous note through", () => {
    expect(decide("ambiguous", { ...standard, threshold: 0.3 }).tier).toBe("orange");
  });

  it("a category set to 'mask' goes to ORANGE instead of GREEN", () => {
    const lenient = initialPolicies().marketing;
    const c = classify("Draft talking points about the acquisition of a smaller grid operator.", PEOPLE);
    expect(c.detected).toEqual(["mna_strategy"]);
    expect(route(c, lenient).tier).toBe("orange");
    expect(route(c, standard).tier).toBe("green");
  });
});

describe("bank account numbers", () => {
  it("masks a number labelled as an IBAN even when it is not a valid IBAN", () => {
    const text = "Here is my IBAN: 97283638882900186538";
    const c = classify(text, PEOPLE);
    expect(c.personalCounts).toEqual({ ACCOUNT: 1 });
    const d = route(c, standard);
    expect([d.tier, d.masked]).toEqual(["orange", true]);
    expect(maskTexts([text], PEOPLE).masked[0]).toBe("Here is my IBAN: [ACCOUNT_1]");
  });

  it("catches German labels and long unlabelled numbers, but not short ones", () => {
    expect(classify("Meine Kontonummer ist 1234 5678 90", PEOPLE).personalCounts).toEqual({ ACCOUNT: 1 });
    expect(classify("Please pay 4111111111111111 today", PEOPLE).personalCounts).toEqual({ ACCOUNT: 1 });
    expect(classify("Konto 1 und 2 are fine", PEOPLE).personal).toEqual([]);
    expect(classify("Order 12345 shipped", PEOPLE).personal).toEqual([]);
  });

  it("keeps it on GREEN for a team whose admin keeps personal data on GREEN", () => {
    expect(route(classify("Here is my IBAN: 97283638882900186538", PEOPLE), PRESETS.strict.policy).tier).toBe("green");
  });
});

describe("masking", () => {
  it("masks the customer email's name and phone number", () => {
    const r = maskTexts([prompt("customer")], PEOPLE);
    expect(r.masked[0]).toContain("[NAME_1]");
    expect(r.masked[0]).toContain("[PHONE_1]");
    expect(r.masked[0]).not.toMatch(/Petra|5550/);
  });

  it("is deterministic: same input, same result", () => {
    const a = classify(prompt("contract"), PEOPLE);
    const b = classify(prompt("contract"), PEOPLE);
    expect({ ...a, timeMs: 0 }).toEqual({ ...b, timeMs: 0 });
  });
});

describe("names of people the workspace does not know", () => {
  const names = (text: string) => classify(text, PEOPLE).personal.filter((p) => p.kind === "NAME").map((p) => p.value);

  it("masks a name after a title: 'i have a patience name Mr. Ahmed Fakh'", () => {
    const text = "i have a patience name Mr. Ahmed Fakh";
    expect(names(text)).toEqual(["Ahmed Fakh"]);
    const d = route(classify(text, PEOPLE), standard);
    expect([d.tier, d.masked]).toEqual(["orange", true]);
    expect(d.reason).toBe("Sent to Claude with 1 name masked.");
    expect(maskTexts([text], PEOPLE).masked[0]).toBe("i have a patience name Mr. [NAME_1]");
  });

  it("finds names after titles, cue words and common first names, in English and German", () => {
    expect(names("mr ahmed fakh called")).toEqual(["ahmed fakh"]);
    expect(names("Frau Yilmaz ruft morgen an")).toEqual(["Yilmaz"]);
    expect(names("Dr. María José García-López will join")).toEqual(["María José García-López"]);
    expect(names("My name is Omar.")).toEqual(["Omar"]);
    expect(names("The customer: Ingrid van der Berg")).toEqual(["Ingrid van der Berg"]);
    expect(names("Ahmed Fakh asked about his invoice")).toEqual(["Ahmed Fakh"]);
  });

  it("gives every mention of the same person the same placeholder and restores the full name", () => {
    const r = maskTexts(["Mr. Ahmed Fakh called. Please call Ahmed back."], PEOPLE);
    expect(r.masked[0]).toBe("Mr. [NAME_1] called. Please call [NAME_1] back.");
    expect(r.restore["[NAME_1]"]).toBe("Ahmed Fakh");
  });

  it("does not see names where there are none", () => {
    for (const text of ["Name the file report.txt", "Our HR team meets at 10", "Classified in 40 ms on EU servers", "Write a slogan for our summer campaign", "Mr. and the team"]) {
      expect(names(text), text).toEqual([]);
    }
  });
});

describe("health and patient data", () => {
  it("keeps a patient's details on GREEN under the standard rules, and still finds the name", () => {
    const c = classify("I have a patient named Ahmed Fakh, diagnosis: diabetes type 2.", PEOPLE);
    expect(c.detected).toContain("health_data");
    expect(c.personal.map((p) => p.value)).toContain("Ahmed Fakh");
    const d = route(c, standard);
    expect(d.tier).toBe("green");
    expect(d.reason).toBe("Kept on EU servers: this looks like health or patient information.");
  });

  it("catches German sick notes", () => {
    expect(classify("Krankmeldung von Frau Yilmaz für nächste Woche", PEOPLE).detected).toContain("health_data");
  });
});

describe("passwords, PINs and codes written in a normal sentence", () => {
  const secret = (text: string) => classify(text, PEOPLE).detected.includes("code_secrets");

  it("keeps them on GREEN, in English and German", () => {
    for (const text of [
      "Here is the code of my app: klooo90-kolliö-osk",
      "Mein Passwort ist Sommerwind!",
      "Passwort: Sommerwind",
      "PIN: 4821",
      "Der WLAN-Schlüssel lautet x7Gh-22kL-pq9",
      "Zugangsdaten für das Portal: lena.h / Hx!92kd",
      "Recovery code: 4F7K-9QPL-22MX",
      "The access code is AB12-CD34",
      "Lizenzschlüssel: ABCDE-12345-FGHIJ",
      "our login is admin / Welcome2026",
    ]) {
      expect(secret(text), text).toBe(true);
      expect(route(classify(text, PEOPLE), standard).tier, text).toBe("green");
    }
  });

  it("does not treat ordinary sentences about codes or passwords as secrets", () => {
    for (const text of [
      "The code is ready for review.",
      "Our project code name is Nordlicht",
      "The password policy is strict",
      "Can you explain what a PIN is?",
      "Please send me the postcode of the Hamburg office",
      "Can you review the code? It is in the file main.py",
      "The code is 200 lines long",
      "Write a slogan for our summer campaign",
    ]) {
      expect(secret(text), text).toBe(false);
    }
  });
});
