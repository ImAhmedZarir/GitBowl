import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";

const MonacoEditor = lazy(() => import("@monaco-editor/react"));

interface CodeEditorLazyProps {
  value: string;
  language?: string;
  path?: string;
  readOnly?: boolean;
  onChange?: (val: string | undefined) => void;
  height?: string | number;
  theme?: string;
}

export function CodeEditorLazy({
  value,
  language = "plaintext",
  path,
  readOnly = false,
  onChange,
  height = "100%",
  theme = "vs-dark",
}: CodeEditorLazyProps) {
  return (
    <Suspense
      fallback={
        <div className="flex h-full w-full items-center justify-center bg-card text-muted-foreground">
          <div className="flex items-center gap-2 text-xs">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span>Loading editor...</span>
          </div>
        </div>
      }
    >
      <MonacoEditor
        height={height}
        language={language}
        path={path}
        value={value}
        theme={theme}
        onChange={onChange}
        options={{
          readOnly,
          minimap: { enabled: false },
          fontSize: 13,
          fontFamily: "'JetBrains Mono', monospace",
          lineNumbers: "on",
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
          wordWrap: "off",
          padding: { top: 12, bottom: 12 },
          smoothScrolling: true,
        }}
      />
    </Suspense>
  );
}
