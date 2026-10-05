// src/routes/api/repo/releases.ts
import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseAdmin } from "@/integrations/supabase/client.server";
import { dispatchRepoWebhooks } from "@/lib/webhooks.server";

export const Route = createFileRoute("/api/repo/releases")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const repoId = url.searchParams.get("repoId");
          if (!repoId) {
            return new Response(JSON.stringify({ error: "Missing repoId" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          const supabase = getSupabaseAdmin();
          const { data: releases, error } = await supabase
            .from("releases" as any)
            .select(
              "id, tag_name, title, body, is_draft, is_prerelease, created_at, published_at, profiles!releases_author_id_fkey(username, display_name)",
            )
            .eq("repo_id", repoId)
            .order("published_at", { ascending: false });

          if (error) throw error;

          return new Response(JSON.stringify({ releases: releases || [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err: any) {
          return new Response(
            JSON.stringify({ error: err.message || "Failed to fetch releases" }),
            {
              status: 500,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
      },

      POST: async ({ request }) => {
        try {
          const authHeader = request.headers.get("authorization");
          if (!authHeader) {
            return new Response(JSON.stringify({ error: "Authentication required" }), {
              status: 401,
              headers: { "Content-Type": "application/json" },
            });
          }

          const supabase = getSupabaseAdmin();
          const token = authHeader.replace(/^Bearer\s+/i, "").trim();
          const { data: userData, error: authError } = await supabase.auth.getUser(token);
          if (authError || !userData?.user) {
            return new Response(JSON.stringify({ error: "Invalid token" }), {
              status: 401,
              headers: { "Content-Type": "application/json" },
            });
          }

          const user = userData.user;
          const body = await request.json().catch(() => ({}));
          const {
            repoId,
            tagName,
            title,
            body: releaseBody,
            isPrerelease = false,
            isDraft = false,
          } = body;

          if (!repoId || !tagName?.trim() || !title?.trim()) {
            return new Response(JSON.stringify({ error: "Missing required fields" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          const cleanTag = tagName.trim().replace(/^refs\/tags\//, "");

          // 1. If body is empty, auto-generate notes from recent commits
          let finalNotes = releaseBody?.trim() || "";
          if (!finalNotes) {
            const { data: commits } = await supabase
              .from("commits")
              .select("message, created_at")
              .eq("repo_id", repoId)
              .order("created_at", { ascending: false })
              .limit(10);

            if (commits && commits.length > 0) {
              finalNotes =
                `## What's Changed\n\n` +
                commits.map((c) => `* ${c.message.split("\n")[0]}`).join("\n");
            } else {
              finalNotes = `Release ${cleanTag}`;
            }
          }

          // 2. Insert release record
          const { data: release, error: insertError } = await supabase
            .from("releases" as any)
            .insert({
              repo_id: repoId,
              tag_name: cleanTag,
              title: title.trim(),
              body: finalNotes,
              is_draft: !!isDraft,
              is_prerelease: !!isPrerelease,
              author_id: user.id,
              published_at: new Date().toISOString(),
            })
            .select("id, tag_name, title, body, is_prerelease, published_at")
            .single();

          if (insertError) throw insertError;

          // 3. Upsert tag ref in refs table
          const { data: repo } = await supabase
            .from("repositories")
            .select("head_sha")
            .eq("id", repoId)
            .single();

          await supabase.from("refs" as any).upsert(
            {
              repo_id: repoId,
              name: `refs/tags/${cleanTag}`,
              sha: repo?.head_sha || "initial",
              updated_at: new Date().toISOString(),
            },
            { onConflict: "repo_id,name" },
          );

          // 4. Dispatch release webhook
          void dispatchRepoWebhooks({
            repoId,
            event: "release",
            payload: {
              action: "published",
              release,
            },
          });

          return new Response(JSON.stringify({ release }), {
            status: 201,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err: any) {
          return new Response(
            JSON.stringify({ error: err.message || "Failed to create release" }),
            {
              status: 500,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
      },
    },
  },
});
