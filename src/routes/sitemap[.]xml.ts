// src/routes/sitemap[.]xml.ts
// Comprehensive XML Sitemap for Search Engine Discovery & Indexing
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function escapeXml(unsafe: string): string {
  return (unsafe || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const baseUrl = "https://gitbowl.zone.id";
        const today = new Date().toISOString().split("T")[0];

        // 1. Fetch public repositories
        let repoEntries = "";
        try {
          const { data: repos } = await supabaseAdmin
            .from("repositories")
            .select(
              "id, name, description, updated_at, profiles!repositories_owner_id_fkey(username)",
            )
            .eq("is_private", false)
            .order("updated_at", { ascending: false })
            .limit(1000);

          if (repos && repos.length > 0) {
            repoEntries = repos
              .map((r: any) => {
                const owner = escapeXml(r.profiles?.username || "developer");
                const name = escapeXml(r.name);
                const desc = escapeXml(r.description || `Repository ${r.name} hosted on GitBowl`);
                const lastmod = r.updated_at ? r.updated_at.split("T")[0] : today;
                const ogImageUrl = `${baseUrl}/api/og?title=${encodeURIComponent(r.name)}&amp;owner=${encodeURIComponent(r.profiles?.username || "")}`;

                return `  <url>
    <loc>${baseUrl}/${owner}/${name}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.85</priority>
    <image:image>
      <image:loc>${ogImageUrl}</image:loc>
      <image:title>${name} — ${desc}</image:title>
    </image:image>
  </url>`;
              })
              .join("\n");
          }
        } catch (err) {
          console.warn("Could not query repos for sitemap:", err);
        }

        // 2. Fetch public user profiles
        let profileEntries = "";
        try {
          const { data: profiles } = await supabaseAdmin
            .from("profiles")
            .select("username, created_at")
            .limit(500);

          if (profiles && profiles.length > 0) {
            profileEntries = profiles
              .map((p: any) => {
                const username = escapeXml(p.username);
                return `  <url>
    <loc>${baseUrl}/${username}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`;
              })
              .join("\n");
          }
        } catch (err) {
          console.warn("Could not query profiles for sitemap:", err);
        }

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <!-- Core Static Landing & Platform Hubs -->
  <url>
    <loc>${baseUrl}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
    <image:image>
      <image:loc>${baseUrl}/og-image.png</image:loc>
      <image:title>GitBowl — High-Performance Git Code Hosting Platform</image:title>
      <image:caption>Host, push, pull, and edit code with Smart-HTTP protocol</image:caption>
    </image:image>
  </url>
  <url>
    <loc>${baseUrl}/explore</loc>
    <lastmod>${today}</lastmod>
    <changefreq>hourly</changefreq>
    <priority>0.95</priority>
  </url>
  <url>
    <loc>${baseUrl}/docs</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>${baseUrl}/api/docs</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.85</priority>
  </url>
  <url>
    <loc>${baseUrl}/privacy</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
  <url>
    <loc>${baseUrl}/tos</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>

  <!-- Public Repositories -->
${repoEntries}

  <!-- Public Developer Profiles -->
${profileEntries}
</urlset>`;

        return new Response(xml, {
          status: 200,
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "public, max-age=3600, s-maxage=3600",
          },
        });
      },
    },
  },
});
