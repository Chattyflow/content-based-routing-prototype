// Small client-side store: mode, current user, team policies and the audit log.
// Saved to localStorage when available; the demo works without it.

import { useSyncExternalStore } from "react";
import type { AuditEntry, Mode, Policy, TeamId } from "../types";
import { initialPolicies, seedAudit, USERS } from "./seed";

export interface State {
  mode: Mode;
  userId: string;
  policies: Record<TeamId, Policy>;
  audit: AuditEntry[];
}

const KEY = "content-based-routing:v1";

function fresh(): State {
  return { mode: "manual", userId: USERS[0].id, policies: initialPolicies(), audit: seedAudit() };
}

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as State;
  } catch {
    // no storage or bad data: start fresh
  }
  return fresh();
}

let state = load();
const listeners = new Set<() => void>();

function set(next: State) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // keep working in memory
  }
  listeners.forEach((l) => l());
}

export const useStore = () => useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => state);

export const actions = {
  setMode: (mode: Mode) => set({ ...state, mode }),
  setUser: (userId: string) => set({ ...state, userId }),
  setPolicy: (team: TeamId, policy: Policy) => set({ ...state, policies: { ...state.policies, [team]: policy } }),
  log: (entry: AuditEntry) => set({ ...state, audit: [...state.audit, entry] }),
  updateLog: (id: string, patch: Partial<AuditEntry>) => set({ ...state, audit: state.audit.map((e) => (e.id === id ? { ...e, ...patch } : e)) }),
  reset: () => set(fresh()),
};
