import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { useProject } from "@/state/AppState";
import { projectLength } from "@/lib/frames";

interface TimebaseValue {
  base: number;
  setBase: Dispatch<SetStateAction<number>>;
  maxBase: number;
}

const Ctx = createContext<TimebaseValue | null>(null);

export function TimebaseProvider({ children }: { children: ReactNode }) {
  const { settings } = useProject();
  const maxBase = Math.max(0, projectLength(settings.sources.map((s) => s.segments)) - 1);
  const [base, setBase] = useState(0);
  useEffect(() => {
    setBase((b) => Math.min(Math.max(0, b), maxBase));
  }, [maxBase]);
  const value = useMemo<TimebaseValue>(() => ({ base, setBase, maxBase }), [base, maxBase]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTimebase(): TimebaseValue {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTimebase must be used within a TimebaseProvider");
  return c;
}
