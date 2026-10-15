import { ShieldCheck, TriangleAlert, VenetianMask } from "lucide-react";
import type { Tier } from "../types";

export const TIER: Record<Tier, { label: string; short: string; border: string; chip: string; Icon: typeof ShieldCheck }> = {
  green: { label: "GREEN", short: "EU-hosted", border: "border-emerald-600", chip: "border-emerald-300 bg-emerald-50 text-emerald-800", Icon: ShieldCheck },
  orange: { label: "ORANGE", short: "masked", border: "border-amber-500", chip: "border-amber-300 bg-amber-50 text-amber-900", Icon: VenetianMask },
  red: { label: "RED", short: "unmasked", border: "border-rose-600", chip: "border-rose-300 bg-rose-50 text-rose-800", Icon: TriangleAlert },
};

/** Tier with icon and text, never colour alone. */
export function TierPill({ tier, short = true }: { tier: Tier; short?: boolean }) {
  const t = TIER[tier];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${t.chip}`}>
      <t.Icon className="size-3.5" aria-hidden />
      {t.label}
      {short && <span className="font-normal">· {t.short}</span>}
    </span>
  );
}

export function Avatar({ name, color }: { name: string; color: string }) {
  const initials = name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("");
  return <span className={`inline-flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white ${color}`} aria-hidden>{initials}</span>;
}
