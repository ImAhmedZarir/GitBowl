// src/routes/api/og.ts
// Dynamic High-Resolution OpenGraph Image Generator (1200x630) for GitBowl
import { createFileRoute } from "@tanstack/react-router";

function escapeXml(unsafe: string): string {
  return (unsafe || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export const Route = createFileRoute("/api/og")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const title = url.searchParams.get("title") || "GitBowl";
        const owner = url.searchParams.get("owner") || "gitbowl";
        const description =
          url.searchParams.get("desc") ||
          "High-Performance Git Code Hosting Platform. Your code, in a bowl.";
        const stars = url.searchParams.get("stars") || "0";
        const forks = url.searchParams.get("forks") || "0";

        const cleanTitle = escapeXml(title.slice(0, 45));
        const cleanOwner = escapeXml(owner.slice(0, 30));
        const cleanDesc = escapeXml(description.slice(0, 110));

        const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0a0f1d"/>
      <stop offset="50%" stop-color="#0e172a"/>
      <stop offset="100%" stop-color="#050811"/>
    </linearGradient>
    <linearGradient id="primaryGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#10b981"/>
      <stop offset="100%" stop-color="#059669"/>
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="60" result="blur"/>
    </filter>
  </defs>

  <!-- Background Canvas -->
  <rect width="1200" height="630" fill="url(#bg)"/>

  <!-- Subtle Radial Glow -->
  <circle cx="950" cy="180" r="280" fill="#10b981" opacity="0.12" filter="url(#glow)"/>
  <circle cx="200" cy="500" r="320" fill="#3b82f6" opacity="0.08" filter="url(#glow)"/>

  <!-- Border Frame -->
  <rect x="24" y="24" width="1152" height="582" rx="28" fill="none" stroke="#334155" stroke-width="2" stroke-opacity="0.4"/>

  <!-- Brand Header -->
  <g transform="translate(80, 80)">
    <!-- Bowl Logo Icon -->
    <rect width="56" height="56" rx="16" fill="url(#primaryGrad)"/>
    <path d="M14 24 C14 36, 42 36, 42 24 Z" fill="#ffffff" fill-opacity="0.95"/>
    <rect x="22" y="38" width="12" height="4" rx="2" fill="#ffffff" fill-opacity="0.8"/>
    
    <text x="72" y="38" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="28" font-weight="800" fill="#ffffff" letter-spacing="-0.5">
      GitBowl
    </text>
    <rect x="186" y="16" width="120" height="28" rx="14" fill="#10b981" fill-opacity="0.15" stroke="#10b981" stroke-opacity="0.4"/>
    <text x="246" y="34" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="700" fill="#34d399" text-anchor="middle">
      CLOUD REPO
    </text>
  </g>

  <!-- Repo Owner Path -->
  <text x="80" y="230" font-family="'JetBrains Mono', monospace" font-size="26" font-weight="500" fill="#94a3b8">
    ${cleanOwner} /
  </text>

  <!-- Main Title -->
  <text x="80" y="310" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="64" font-weight="900" fill="#f8fafc" letter-spacing="-1.5">
    ${cleanTitle}
  </text>

  <!-- Description -->
  <text x="80" y="390" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="26" font-weight="400" fill="#94a3b8">
    ${cleanDesc}
  </text>

  <!-- Bottom Badges / Metrics -->
  <g transform="translate(80, 480)">
    <!-- Stars -->
    <rect width="130" height="44" rx="10" fill="#1e293b" stroke="#334155" stroke-width="1.5"/>
    <text x="36" y="28" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="18" fill="#e2e8f0" font-weight="600">
      ★ ${stars}
    </text>
    
    <!-- Forks -->
    <rect x="146" width="130" height="44" rx="10" fill="#1e293b" stroke="#334155" stroke-width="1.5"/>
    <text x="182" y="28" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="18" fill="#e2e8f0" font-weight="600">
      ⑂ ${forks}
    </text>

    <!-- HTTPS Git Smart Protocol Badge -->
    <rect x="292" width="230" height="44" rx="10" fill="#10b981" fill-opacity="0.1" stroke="#10b981" stroke-opacity="0.3"/>
    <text x="407" y="28" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="15" fill="#34d399" font-weight="600" text-anchor="middle">
      ✓ Git Smart-HTTP
    </text>

    <!-- URL on right -->
    <text x="1040" y="28" font-family="'JetBrains Mono', monospace" font-size="18" font-weight="500" fill="#64748b" text-anchor="end">
      https://gitbowl.zone.id
    </text>
  </g>
</svg>
`;

        return new Response(svg, {
          status: 200,
          headers: {
            "Content-Type": "image/svg+xml; charset=utf-8",
            "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400",
          },
        });
      },
    },
  },
});
