// Small client-side store.
// - Saved (localStorage, when available): current user, team policies, routing log.
// - Session only (memory): the chat and each request's routing details for the
//   admin view. The real routing log never stores content, so neither do we.

import { useSyncExternalStore } from "react";
import type { AuditEntry, Policy, TeamId } from "../types";
import type { Classification } from "../lib/classifier";
import type { MaskResult } from "../lib/pii";
import type { Decision } from "../lib/router";
import { initialPolicies, seedAudit, USERS } from "./seed";

export interface ChatItem {
  id: string;
  userId: string;
  text: string;
  reply: string | null; // null while the answer is being written
}

export interface RoutingDetail {
  text: string;
  classification: Classification;
  decision: Decision;
  mask?: MaskResult;
  sentText: string; // exactly what the model received
}

interface Saved {
  userId: string;
  policies: Record<TeamId, Policy>;
  audit: AuditEntry[];
}

export interface State extends Saved {
  chat: ChatItem[];
  details: Record<string, RoutingDetail>;
}

const KEY = "content-based-routing:v3";

function fresh(): Saved {
  return { userId: USERS[0].id, policies: initialPolicies(), audit: seedAudit() };
}

function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Saved;
  } catch {
    // no storage or bad data: start fresh
  }
  return fresh();
}

let state: State = { ...load(), chat: [], details: {} };
const listeners = new Set<() => void>();

function set(next: State) {
  state = next;
  try {
    const saved: Saved = { userId: state.userId, policies: state.policies, audit: state.audit };
    localStorage.setItem(KEY, JSON.stringify(saved));
  } catch {
    // keep working in memory
  }
  listeners.forEach((l) => l());
}

export const useStore = () => useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => state);
export const getState = () => state;

export const actions = {
  setUser: (userId: string) => set({ ...state, userId }),
  setPolicy: (team: TeamId, policy: Policy) => set({ ...state, policies: { ...state.policies, [team]: policy } }),
  ask: (item: ChatItem, entry: AuditEntry, detail: RoutingDetail) =>
    set({ ...state, chat: [...state.chat, item], audit: [...state.audit, entry], details: { ...state.details, [entry.id]: detail } }),
  answer: (id: string, reply: string) => set({ ...state, chat: state.chat.map((c) => (c.id === id ? { ...c, reply } : c)) }),
  reset: () => set({ ...fresh(), chat: [], details: {} }),
};
