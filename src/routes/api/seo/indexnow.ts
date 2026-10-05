// src/routes/api/seo/indexnow.ts
// IndexNow Instant Search Engine Indexing for GitBowl
import { createFileRoute } from "@tanstack/react-router";

const DEFAULT_INDEXNOW_KEY = "b69dc4e5088d44c4b57492f25a7a72d3";
const HOST = "gitbowl.zone.id";
const INDEXNOW_API_ENDPOINT = "https://api.indexnow.org/indexnow";

export const Route = createFileRoute("/api/seo/indexnow")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => ({}))) as {
            urls?: string[];
            url?: string;
          };

          const key = process.env["INDEXNOW_KEY"] || DEFAULT_INDEXNOW_KEY;
          const urlList: string[] = [];
          if (Array.isArray(body.urls)) {
            urlList.push(...body.urls);
          } else if (body.url) {
            urlList.push(body.url);
          } else {
            // Default: ping primary site pages
            urlList.push(`https://${HOST}/`, `https://${HOST}/explore`, `https://${HOST}/docs`);
          }

          const payload = {
            host: HOST,
            key,
            keyLocation: `https://${HOST}/${key}.txt`,
            urlList: urlList.slice(0, 100),
          };

          // Submit directly to official IndexNow API (distributes to Bing, Yandex, Naver, Seznam)
          const response = await fetch(INDEXNOW_API_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json; charset=utf-8" },
            body: JSON.stringify(payload),
          });

          return new Response(
            JSON.stringify({
              success: response.ok || response.status === 200 || response.status === 202,
              status: response.status,
              urlsSubmitted: urlList.length,
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        } catch (err: any) {
          return new Response(JSON.stringify({ error: err?.message || "IndexNow failed" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
