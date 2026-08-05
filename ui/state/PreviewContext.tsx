import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { useProject } from "@/state/AppState";
import type { PreviewMode } from "@/lib/preview";

interface PreviewValue {
  mode: PreviewMode;
  setMode: Dispatch<SetStateAction<PreviewMode>>;
  sourceIndex: number;
  setSourceIndex: Dispatch<SetStateAction<number>>;
  onCycle: () => void;
  juxLeft: number;
  juxRight: number;
  setJuxLeft: (i: number) => void;
  setJuxRight: (i: number) => void;
  fullscreen: boolean;
  setFullscreen: Dispatch<SetStateAction<boolean>>;
}

const Ctx = createContext<PreviewValue | null>(null);

export function PreviewProvider({ children }: { children: ReactNode }) {
  const { settings } = useProject();
  const sideCount = settings.sources.filter((s) => s.path).length;

  const [mode, setMode] = useState<PreviewMode>("single");
  const [sourceIndex, setSourceIndex] = useState(0);
  const [juxLeft, setJuxLeft] = useState(0);
  const [juxRight, setJuxRight] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);

  const onCycle = useCallback(
    () => setSourceIndex((i) => (sideCount > 0 ? (i + 1) % sideCount : 0)),
    [sideCount],
  );
  useEffect(() => {
    setSourceIndex((i) => (sideCount > 0 ? Math.min(i, sideCount - 1) : 0));
  }, [sideCount]);
  useEffect(() => {
    if (sideCount === 0) return;
    setJuxLeft((i) => Math.min(i, sideCount - 1));
    setJuxRight((i) => Math.min(i, sideCount - 1));
  }, [sideCount]);

  const value = useMemo<PreviewValue>(
    () => ({
      mode,
      setMode,
      sourceIndex,
      setSourceIndex,
      onCycle,
      juxLeft,
      juxRight,
      setJuxLeft,
      setJuxRight,
      fullscreen,
      setFullscreen,
    }),
    [mode, sourceIndex, onCycle, juxLeft, juxRight, fullscreen],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePreview(): PreviewValue {
  const c = useContext(Ctx);
  if (!c) throw new Error("usePreview must be used within a PreviewProvider");
  return c;
}
