"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  sessionStore,
  rulesStore,
  settingsStore,
  type StoredSession,
  type Settings,
} from "./storage";
import { getSchedule, ProxyError } from "./cult/api";
import type { RulesConfig } from "./cult/rules";
import type { ScheduleResponse } from "./cult/types";

/** Reactive view of the stored Cult session. */
export function useSession() {
  const [session, setSession] = useState<StoredSession | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSession(sessionStore.get());
    setReady(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key === "warmup:session" || e.key === null) setSession(sessionStore.get());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const connect = useCallback((s: StoredSession) => {
    sessionStore.set(s);
    setSession(s);
  }, []);
  const disconnect = useCallback(() => {
    sessionStore.clear();
    setSession(null);
  }, []);

  return { session, ready, connected: !!session, connect, disconnect };
}

export function useRules() {
  const [rules, setRulesState] = useState<RulesConfig | null>(null);
  useEffect(() => setRulesState(rulesStore.get()), []);
  const setRules = useCallback((c: RulesConfig) => {
    rulesStore.set(c);
    setRulesState(c);
  }, []);
  return { rules, setRules };
}

export function useSettings() {
  const [settings, setState] = useState<Settings>(() => settingsStore.get());
  useEffect(() => setState(settingsStore.get()), []);
  const update = useCallback((patch: Partial<Settings>) => {
    settingsStore.set(patch);
    setState(settingsStore.get());
  }, []);
  return { settings, update };
}

interface ScheduleState {
  data: ScheduleResponse | null;
  loading: boolean;
  error: ProxyError | Error | null;
  /** true when the error means the Cult session is no longer valid. */
  sessionExpired: boolean;
  reload: () => void;
}

/** Fetch the schedule through the proxy, scoped to the given centers. */
export function useSchedule(centerIds: number[] | undefined, enabled: boolean): ScheduleState {
  const [data, setData] = useState<ScheduleResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ProxyError | Error | null>(null);
  const key = (centerIds ?? []).join(",");
  const tick = useRef(0);
  const [, force] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getSchedule(centerIds && centerIds.length ? centerIds : undefined)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e as Error);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, tick.current]);

  const reload = useCallback(() => {
    tick.current += 1;
    force((n) => n + 1);
  }, []);

  return {
    data,
    loading,
    error,
    sessionExpired: error instanceof ProxyError && error.sessionExpired,
    reload,
  };
}
