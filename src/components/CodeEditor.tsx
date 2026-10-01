import Editor from "@monaco-editor/react";
import { languageFor } from "@/lib/repo";

export default function CodeEditor({
  path,
  value,
  readOnly,
  onChange,
}: {
  path: string;
  value: string;
  readOnly: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <Editor
      height="100%"
      path={path}
      language={languageFor(path)}
      value={value}
      theme={
        typeof document !== "undefined" && document.documentElement.classList.contains("dark")
          ? "vs-dark"
          : "vs"
      }
      onChange={(v) => onChange(v ?? "")}
      options={{
        readOnly,
        minimap: { enabled: true },
        fontSize: 13,
        fontFamily: "JetBrains Mono, monospace",
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 2,
        wordWrap: "on",
      }}
    />
  );
}
