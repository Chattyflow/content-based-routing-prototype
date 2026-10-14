import { useEffect, useRef, type ReactNode } from "react";
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

/** Confirmation dialog on the native <dialog> (focus and Escape handled by the browser). */
export function Confirm({ open, title, children, confirmLabel, onConfirm, onCancel }: {
  open: boolean; title: string; children: ReactNode; confirmLabel: string; onConfirm: () => void; onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (open && d && !d.open) d.showModal();
    if (!open && d?.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onCancel} className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl bg-white p-0 shadow-xl" aria-label={title}>
      {open && (
        <div className="space-y-4 p-5">
          <h2 className="text-base font-semibold">{title}</h2>
          <div className="text-sm text-slate-700">{children}</div>
          <div className="flex justify-end gap-2">
            <button className="btn" onClick={onCancel}>Cancel</button>
            <button className="btn btn-primary" onClick={onConfirm}>{confirmLabel}</button>
          </div>
        </div>
      )}
    </dialog>
  );
}
