import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className = "" }: MarkdownRendererProps) {
  if (!content) return null;

  return (
    <div
      className={`prose prose-sm dark:prose-invert max-w-none break-words text-foreground leading-relaxed ${className}`}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="mt-6 mb-4 text-2xl font-bold tracking-tight border-b border-border pb-2 text-foreground">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-5 mb-3 text-xl font-semibold tracking-tight border-b border-border/60 pb-1.5 text-foreground">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-4 mb-2 text-lg font-semibold text-foreground">{children}</h3>
          ),
          h4: ({ children }) => (
            <h4 className="mt-3 mb-1.5 text-base font-medium text-foreground">{children}</h4>
          ),
          p: ({ children }) => (
            <p className="mb-3 text-sm leading-normal text-muted-foreground">{children}</p>
          ),
          ul: ({ children }) => (
            <ul className="mb-3 ml-6 list-disc space-y-1 text-sm text-muted-foreground">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-3 ml-6 list-decimal space-y-1 text-sm text-muted-foreground">
              {children}
            </ol>
          ),
          li: ({ children }) => <li className="text-sm">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="my-3 border-l-4 border-primary/40 bg-muted/30 px-4 py-2 italic text-sm text-muted-foreground rounded-r-md">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="my-4 overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-left text-sm">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="border-b border-border bg-muted/60 text-xs font-semibold uppercase text-foreground">
              {children}
            </thead>
          ),
          tbody: ({ children }) => <tbody className="divide-y divide-border">{children}</tbody>,
          tr: ({ children }) => <tr className="hover:bg-muted/30 transition-colors">{children}</tr>,
          th: ({ children }) => <th className="px-3 py-2 font-semibold">{children}</th>,
          td: ({ children }) => <td className="px-3 py-2 text-xs">{children}</td>,
          code: ({ className: codeClassName, children, ...props }) => {
            const isBlock = codeClassName || String(children).includes("\n");
            if (isBlock) {
              return (
                <div className="my-3 overflow-x-auto rounded-lg border border-border bg-card p-3 font-mono text-xs">
                  <code className="text-foreground font-mono" {...props}>
                    {children}
                  </code>
                </div>
              );
            }
            return (
              <code
                className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs font-medium text-primary"
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
              className="text-primary font-medium underline hover:text-primary/80 transition-colors"
            >
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
