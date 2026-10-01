import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const baseUrl = "https://gitbowl.zone.id";
        const today = new Date().toISOString().split("T")[0];

        // Fetch all public repositories to list in sitemap
        let repoEntries = "";
        try {
          const { data: repos } = await supabaseAdmin
            .from("repositories")
            .select(
              `
              name,
              updated_at,
              profiles (
                username
              )
            `,
            )
            .eq("is_private", false)
            .order("updated_at", { ascending: false })
            .limit(500);

          if (repos && repos.length > 0) {
            repoEntries = repos
              .map((r: any) => {
                const owner = r.profiles?.username || "developer";
                const lastmod = r.updated_at ? r.updated_at.split("T")[0] : today;
                return `  <url>
    <loc>${baseUrl}/${owner}/${r.name}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
              })
              .join("\n");
          }
        } catch (err) {
          console.warn("Could not query repos for sitemap:", err);
        }

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <url>
    <loc>${baseUrl}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
    <image:image>
      <image:loc>${baseUrl}/og-image.png</image:loc>
      <image:title>GitBowl — Your code, in a bowl.</image:title>
    </image:image>
  </url>
  <url>
    <loc>${baseUrl}/explore</loc>
    <lastmod>${today}</lastmod>
    <changefreq>hourly</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>${baseUrl}/new</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${baseUrl}/auth</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${baseUrl}/privacy</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>${baseUrl}/tos</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
${repoEntries ? repoEntries + "\n" : ""}</urlset>`;

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
