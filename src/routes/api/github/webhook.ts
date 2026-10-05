// src/routes/api/github/webhook.ts
// Receives GitHub webhook notifications for bi-directional synchronization with cryptographic signature verification
import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseAdmin } from "@/integrations/supabase/client.server";
import { pullFromGitHub } from "@/lib/github-sync.server";
import crypto from "crypto";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): boolean {
  if (!signatureHeader || !secret) return false;
  if (!signatureHeader.startsWith("sha256=")) return false;

  const expectedSignature =
    "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

  const sigBuf = Buffer.from(signatureHeader, "utf8");
  const expBuf = Buffer.from(expectedSignature, "utf8");

  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}

export const Route = createFileRoute("/api/github/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const signature = request.headers.get("x-hub-signature-256");
        const rawBody = await request.text();

        // If no signature header provided, immediately reject with 401
        if (!signature) {
          return json({ error: "Missing X-Hub-Signature-256 header" }, 401);
        }

        let payload: any;
        try {
          payload = JSON.parse(rawBody);
        } catch {
          return json({ error: "Invalid JSON payload" }, 400);
        }

        const repository = payload?.repository;
        if (!repository) return json({ error: "Missing repository in payload" }, 400);

        const fullName = repository.full_name || ""; // e.g. "owner/repo"
        const [owner, name] = fullName.split("/");
        if (!owner || !name) return json({ error: "Invalid repository full_name" }, 400);

        const supabase = getSupabaseAdmin();
        const { data: syncConfig } = await supabase
          .from("repo_github_sync" as any)
          .select("*")
          .ilike("github_owner", owner)
          .ilike("github_repo", name)
          .maybeSingle();

        // Per-repo webhook secret or global fallback secret
        const secret =
          (syncConfig as any)?.webhook_secret || process.env["GITHUB_WEBHOOK_SECRET"] || "";

        // Ignore events for repos without a configured secret
        if (!secret) {
          return json({ error: "No webhook secret configured for this repository" }, 401);
        }

        // Cryptographically verify signature using timingSafeEqual
        const isValid = verifyWebhookSignature(rawBody, signature, secret);
        if (!isValid) {
          return json({ error: "Invalid webhook signature" }, 401);
        }

        const event = request.headers.get("x-github-event");
        if (event === "ping") {
          return json({ message: "pong" }, 200);
        }

        if (!syncConfig) {
          return json(
            { message: "No matching GitBowl sync found for this GitHub repository" },
            200,
          );
        }

        // Pull latest updates into GitBowl
        const headCommitMessage = payload.head_commit?.message || "Sync update from GitHub";
        const result = await pullFromGitHub((syncConfig as any).repo_id, headCommitMessage);

        return json({
          success: result.success,
          error: result.error,
          repoId: (syncConfig as any).repo_id,
        });
      },
    },
  },
});
