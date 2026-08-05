import CodeMirror, { EditorView, keymap } from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import { indentWithTab } from "@codemirror/commands";
import { oneDark } from "@codemirror/theme-one-dark";

const appTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "transparent",
      height: "100%",
      fontSize: "12.5px",
    },
    ".cm-scroller": {
      fontFamily:
        "ui-monospace, 'SFMono-Regular', 'JetBrains Mono', Consolas, monospace",
      lineHeight: "1.6",
      overflow: "auto",
    },
    "&.cm-focused": { outline: "none" },
    ".cm-gutters": {
      backgroundColor: "transparent",
      borderRight: "1px solid var(--border)",
      color: "#4b4b54",
    },
    ".cm-activeLine": { backgroundColor: "rgba(255,255,255,0.028)" },
    ".cm-activeLineGutter": { backgroundColor: "rgba(255,255,255,0.028)" },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
      backgroundColor: "rgba(99,102,241,0.28)",
    },
    ".cm-content": { caretColor: "#c7c7ff" },
  },
  { dark: true },
);

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function CodeEditor({ value, onChange, placeholder }: Props) {
  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      theme={oneDark}
      placeholder={placeholder}
      extensions={[python(), keymap.of([indentWithTab]), appTheme]}
      basicSetup={{
        lineNumbers: true,
        foldGutter: false,
        highlightActiveLine: true,
        highlightActiveLineGutter: true,
        autocompletion: false,
        bracketMatching: true,
        closeBrackets: true,
        indentOnInput: true,
      }}
      height="100%"
      style={{ height: "100%" }}
    />
  );
}
