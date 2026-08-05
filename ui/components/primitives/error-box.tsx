import { cn } from "@/lib/utils";

export function ErrorBox({ message, className }: { message: string; className?: string }) {
  const nl = message.indexOf("\n");
  const headline = (nl >= 0 ? message.slice(0, nl) : message).trim();
  const detail = nl >= 0 ? message.slice(nl + 1).replace(/\s+$/, "") : "";
  return (
    <div className={cn("flex w-full max-w-xl select-text flex-col items-stretch gap-2", className)}>
      {headline && (
        <div className="text-center text-xs leading-relaxed text-muted-foreground/70">{headline}</div>
      )}
      {detail && (
        <pre
          data-wheel-scroll
          className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded border border-border bg-[#0d0d10] p-2.5 text-left font-mono text-[11px] leading-snug text-foreground/75"
        >
          {detail}
        </pre>
      )}
    </div>
  );
}
