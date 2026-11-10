import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import {
  Check,
  Copy,
  Info,
  Lightbulb,
  AlertCircle,
  AlertTriangle,
  OctagonAlert,
  ExternalLink,
} from "lucide-react";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

const safeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    "*": [...(defaultSchema.attributes?.["*"] || []), "className", "align", "style"],
    img: [...(defaultSchema.attributes?.img || []), "src", "alt", "width", "height", "align", "loading"],
    div: [...(defaultSchema.attributes?.div || []), "align", "className"],
    p: [...(defaultSchema.attributes?.p || []), "align", "className"],
    h1: [...(defaultSchema.attributes?.h1 || []), "align", "className"],
    h2: [...(defaultSchema.attributes?.h2 || []), "align", "className"],
    h3: [...(defaultSchema.attributes?.h3 || []), "align", "className"],
    span: [...(defaultSchema.attributes?.span || []), "align", "className"],
    table: [...(defaultSchema.attributes?.table || []), "align", "className"],
  },
};

export function MarkdownRenderer({ content, className = "" }: MarkdownRendererProps) {
  if (!content) return null;

  return (
    <div
      className={`markdown-body prose prose-zinc dark:prose-invert max-w-none break-words text-foreground leading-relaxed selection:bg-primary/20 ${className}`}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, safeSchema]]}
        components={{
          h1: ({ children, ...props }) => (
            <h1 {...props} className="mt-6 mb-4 text-2xl sm:text-3xl font-semibold tracking-tight border-b border-border pb-2 text-foreground flex items-center group">
              <span>{children}</span>
            </h1>
          ),
          h2: ({ children, ...props }) => (
            <h2 {...props} className="mt-6 mb-3 text-xl sm:text-2xl font-semibold tracking-tight border-b border-border/80 pb-1.5 text-foreground">
              {children}
            </h2>
          ),
          h3: ({ children, ...props }) => (
            <h3 {...props} className="mt-5 mb-2 text-lg sm:text-xl font-semibold text-foreground tracking-tight">
              {children}
            </h3>
          ),
          h4: ({ children, ...props }) => (
            <h4 {...props} className="mt-4 mb-1.5 text-base font-semibold text-foreground">{children}</h4>
          ),
          p: ({ children, ...props }) => (
            <p {...props} className="mb-4 text-sm sm:text-base leading-7 text-foreground/90">{children}</p>
          ),
          ul: ({ children }) => (
            <ul className="mb-4 ml-6 list-disc space-y-1.5 text-sm sm:text-base text-foreground/90 marker:text-muted-foreground">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-4 ml-6 list-decimal space-y-1.5 text-sm sm:text-base text-foreground/90 marker:text-muted-foreground">
              {children}
            </ol>
          ),
          li: ({ children }) => <li className="leading-7">{children}</li>,
          blockquote: ({ children }) => {
            const textContent = React.Children.toArray(children)
              .map((c: any) => c?.props?.children || c)
              .flat()
              .join(" ");

            const alertMatch = textContent.match(/^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i);

            if (alertMatch) {
              const type = alertMatch[1].toUpperCase();
              let borderClass = "border-blue-500 bg-blue-500/[0.08] text-blue-700 dark:text-blue-300";
              let title = "Note";
              let Icon = Info;

              if (type === "TIP") {
                borderClass = "border-emerald-500 bg-emerald-500/[0.08] text-emerald-700 dark:text-emerald-300";
                title = "Tip";
                Icon = Lightbulb;
              } else if (type === "IMPORTANT") {
                borderClass = "border-purple-500 bg-purple-500/[0.08] text-purple-700 dark:text-purple-300";
                title = "Important";
                Icon = AlertCircle;
              } else if (type === "WARNING") {
                borderClass = "border-amber-500 bg-amber-500/[0.08] text-amber-700 dark:text-amber-300";
                title = "Warning";
                Icon = AlertTriangle;
              } else if (type === "CAUTION") {
                borderClass = "border-red-500 bg-red-500/[0.08] text-red-700 dark:text-red-300";
                title = "Caution";
                Icon = OctagonAlert;
              }

              return (
                <div className={`my-4 rounded-r-lg border-l-4 p-4 text-xs sm:text-sm ${borderClass}`}>
                  <div className="flex items-center gap-2 font-semibold mb-1">
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{title}</span>
                  </div>
                  <div className="text-foreground/90 leading-relaxed font-normal">
                    {children}
                  </div>
                </div>
              );
            }

            return (
              <blockquote className="my-4 border-l-4 border-border pl-4 py-1 text-sm sm:text-base text-muted-foreground italic bg-muted/20 rounded-r-md">
                {children}
              </blockquote>
            );
          },
          table: ({ children }) => (
            <div className="my-5 overflow-x-auto rounded-lg border border-border shadow-xs">
              <table className="w-full border-collapse text-left text-sm">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="border-b border-border bg-muted/60 text-xs font-semibold uppercase text-foreground">
              {children}
            </thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-border [&>tr:nth-child(even)]:bg-muted/20">
              {children}
            </tbody>
          ),
          tr: ({ children }) => <tr className="transition-colors hover:bg-muted/30">{children}</tr>,
          th: ({ children }) => (
            <th className="border-r border-border last:border-r-0 px-3.5 py-2.5 font-semibold text-foreground">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-r border-border last:border-r-0 px-3.5 py-2 text-xs sm:text-sm text-foreground/90">
              {children}
            </td>
          ),
          code: ({ className: codeClassName, children, ...props }) => {
            const isBlock = codeClassName || String(children).includes("\n");
            if (isBlock) {
              const lang = (codeClassName || "").replace(/^language-/, "");
              return <CodeBlock lang={lang} code={String(children).replace(/\n$/, "")} />;
            }
            return (
              <code
                className="rounded-md border border-border bg-muted/60 px-1.5 py-0.5 font-mono text-[12px] font-medium text-foreground"
                {...props}
              >
                {children}
              </code>
            );
          },
          hr: () => <hr className="my-6 border-border" />,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 dark:text-blue-400 font-medium underline underline-offset-2 hover:opacity-80 transition-opacity inline-flex items-center gap-0.5"
            >
              <span>{children}</span>
              {href && !href.startsWith("#") && !href.startsWith("/") && (
                <ExternalLink className="h-3 w-3 inline-block shrink-0 opacity-70 ml-0.5" />
              )}
            </a>
          ),
          img: ({ src, alt, ...props }) => (
            <span className="inline-block my-2">
              <img
                src={src}
                alt={alt || ""}
                {...props}
                className="max-w-full rounded-lg border border-border shadow-xs inline-block align-middle"
                loading="lazy"
              />
            </span>
          ),
          input: (props) => {
            if (props.type === "checkbox") {
              return (
                <input
                  type="checkbox"
                  disabled
                  checked={props.checked}
                  className="mr-2 h-3.5 w-3.5 rounded border-border text-primary align-middle cursor-default"
                />
              );
            }
            return <input {...props} />;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);

  function copyCode() {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="group relative my-4 overflow-hidden rounded-xl border border-border bg-[#0d1117] text-zinc-100 shadow-sm">
      <div className="flex items-center justify-between border-b border-white/[0.08] bg-black/40 px-3.5 py-1.5 text-xs">
        <span className="font-mono text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
          {lang || "code"}
        </span>
        <button
          type="button"
          onClick={copyCode}
          className="flex items-center gap-1.5 rounded-md px-2 py-0.5 font-mono text-[11px] text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          title="Copy code to clipboard"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-emerald-400">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <div className="p-4 overflow-x-auto font-mono text-xs leading-relaxed text-zinc-200">
        <pre className="m-0 p-0 font-mono">
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
}
