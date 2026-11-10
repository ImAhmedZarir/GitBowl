// src/routes/api/repo/archive.ts
import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseAdmin } from "@/integrations/supabase/client.server";
import { getActor, requireRepoAccess } from "@/lib/authz.server";
import JSZip from "jszip";

export const Route = createFileRoute("/api/repo/archive")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const repoId = url.searchParams.get("repoId");
          const ref = url.searchParams.get("ref") || "main";

          if (!repoId) {
            return new Response(JSON.stringify({ error: "Missing repoId" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          const supabase = getSupabaseAdmin();
          const { data: repo, error: repoErr } = await supabase
            .from("repositories")
            .select("id, name, is_private, owner_id, org_id")
            .eq("id", repoId)
            .maybeSingle();

          if (repoErr || !repo) {
            return new Response(JSON.stringify({ error: "Repository not found" }), {
              status: 404,
              headers: { "Content-Type": "application/json" },
            });
          }

          // Strict Authorization Check
          const actor = await getActor(request);
          const access = await requireRepoAccess(actor, repo, "read");
          if (!access.allowed) {
            return new Response(JSON.stringify({ error: access.error || "Not found" }), {
              status: access.status || 404,
              headers: { "Content-Type": "application/json" },
            });
          }

          // Fetch all repo files
          const { data: files, error: filesErr } = await supabase
            .from("repo_files")
            .select("path, content, is_binary")
            .eq("repo_id", repoId);

          if (filesErr) throw filesErr;

          const zip = new JSZip();
          const rootFolder = `${repo.name}-${ref.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
          const folder = zip.folder(rootFolder);

          if (files && files.length > 0) {
            for (const f of files) {
              const content = f.content ?? "";
              if (f.is_binary) {
                folder?.file(f.path, content, { base64: true });
              } else {
                folder?.file(f.path, content);
              }
            }
          } else {
            folder?.file("README.md", `# ${repo.name}\n\nEmpty repository archive.`);
          }

          const zipBuffer = await zip.generateAsync({
            type: "nodebuffer",
            compression: "DEFLATE",
            compressionOptions: { level: 6 },
          });

          const isPrivate = Boolean(repo.is_private);
          const cacheControl = isPrivate ? "private, no-store" : "public, max-age=60";

          return new Response(zipBuffer, {
            status: 200,
            headers: {
              "Content-Type": "application/zip",
              "Content-Disposition": `attachment; filename="${repo.name}-${ref}.zip"`,
              "Cache-Control": cacheControl,
            },
          });
        } catch (err: any) {
          return new Response(
            JSON.stringify({ error: err.message || "Failed to generate archive" }),
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
