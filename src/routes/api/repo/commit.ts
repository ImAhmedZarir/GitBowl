import { createFileRoute } from "@tanstack/react-router";
import { commitChanges, CommitError } from "@/lib/commit-service.server";

export const Route = createFileRoute("/api/repo/commit")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const authHeader = request.headers.get("authorization");
          if (!authHeader) {
            return new Response(
              JSON.stringify({ error: "Authentication required to commit changes" }),
              { status: 401, headers: { "Content-Type": "application/json" } },
            );
          }

          const body = await request.json().catch(() => ({}));
          const { repoId, message, files, expectedHeadSha, branch } = body;

          const result = await commitChanges({
            repoId,
            authHeader,
            message: (message || "").trim(),
            files,
            expectedHeadSha,
            branch,
          });

          return new Response(JSON.stringify(result), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err: any) {
          if (err instanceof CommitError) {
            return new Response(JSON.stringify({ error: err.message }), {
              status: err.statusCode,
              headers: { "Content-Type": "application/json" },
            });
          }

          console.error("[Commit API] Unexpected error:", err);
          return new Response(
            JSON.stringify({ error: err.message || "Failed to commit changes" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
