// tests/seo-acceptance.test.mjs
// Verification suite for Supercharged SEO, Social Cards, Sitemaps, and Structured Data
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

console.log("=== GitBowl Supercharged SEO Acceptance Tests ===");

// 1. Root Layout SEO & Meta Tags
console.log("\n[Test 1] Verifying Root Layout Meta Tags & JSON-LD...");
const rootSrc = fs.readFileSync(path.resolve("src/routes/__root.tsx"), "utf8");

assert.ok(
  rootSrc.includes("https://gitbowl.zone.id/"),
  "Root layout must reference canonical domain https://gitbowl.zone.id/",
);
assert.ok(rootSrc.includes("og:image"), "Root layout must include OpenGraph social card image");
assert.ok(
  rootSrc.includes("twitter:card") && rootSrc.includes("summary_large_image"),
  "Root layout must configure large image Twitter cards",
);
assert.ok(
  rootSrc.includes("SCHEMA_ORGANIZATION"),
  "Root layout must inject Organization structured data",
);
assert.ok(
  rootSrc.includes("SCHEMA_WEBAPPLICATION"),
  "Root layout must inject WebApplication structured data",
);
assert.ok(
  rootSrc.includes("SCHEMA_WEBSITE"),
  "Root layout must inject WebSite structured data with SearchAction",
);
assert.ok(
  rootSrc.includes("SCHEMA_FAQ"),
  "Root layout must inject FAQPage structured data for rich search snippets",
);
console.log("✓ Root layout SEO and Schema.org structured data verified.");

// 2. Dynamic OpenGraph Generator Route
console.log("\n[Test 2] Verifying Dynamic OpenGraph Image Route (/api/og)...");
const ogRoutePath = path.resolve("src/routes/api/og.ts");
assert.ok(fs.existsSync(ogRoutePath), "Dynamic /api/og route must exist");
const ogSrc = fs.readFileSync(ogRoutePath, "utf8");
assert.ok(
  ogSrc.includes('width="1200" height="630"'),
  "/api/og canvas must be standard 1200x630 resolution",
);
assert.ok(ogSrc.includes("image/svg+xml"), "/api/og must return SVG format");
console.log("✓ Dynamic OpenGraph image generator verified.");

// 3. XML Sitemap & Image Extensions
console.log("\n[Test 3] Verifying Sitemaps and Discoverability...");
const sitemapSrc = fs.readFileSync(path.resolve("src/routes/sitemap[.]xml.ts"), "utf8");
assert.ok(
  sitemapSrc.includes('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"'),
  "Sitemap must support Google Image Sitemap extension",
);
assert.ok(sitemapSrc.includes("/docs"), "Sitemap must include /docs route");
assert.ok(sitemapSrc.includes("/explore"), "Sitemap must include /explore route");
assert.ok(sitemapSrc.includes("changefreq"), "Sitemap must define changefreq");
assert.ok(sitemapSrc.includes("priority"), "Sitemap must define search priority");
console.log("✓ XML Sitemap verified.");

// 4. Instant Indexing via IndexNow
console.log("\n[Test 4] Verifying IndexNow Instant Crawl & Key Verification...");
const indexNowPath = path.resolve("src/routes/api/seo/indexnow.ts");
assert.ok(fs.existsSync(indexNowPath), "IndexNow route must exist");
const indexNowSrc = fs.readFileSync(indexNowPath, "utf8");
assert.ok(
  indexNowSrc.includes("https://api.indexnow.org/indexnow"),
  "IndexNow must submit to official IndexNow API endpoint",
);

const keyFilePath = path.resolve("public/b69dc4e5088d44c4b57492f25a7a72d3.txt");
assert.ok(fs.existsSync(keyFilePath), "IndexNow verification file must exist in public directory");
const keyFileContent = fs.readFileSync(keyFilePath, "utf8").trim();
assert.equal(keyFileContent, "b69dc4e5088d44c4b57492f25a7a72d3");
console.log("✓ IndexNow instant indexing verified.");

// 5. Robots.txt Directives
console.log("\n[Test 5] Verifying robots.txt Crawler Directives...");
const robotsSrc = fs.readFileSync(path.resolve("public/robots.txt"), "utf8");
assert.ok(
  robotsSrc.includes("Sitemap: https://gitbowl.zone.id/sitemap.xml"),
  "robots.txt must point to sitemap",
);
assert.ok(robotsSrc.includes("Allow: /docs"), "robots.txt must allow /docs");
assert.ok(robotsSrc.includes("Allow: /explore"), "robots.txt must allow /explore");
assert.ok(robotsSrc.includes("Disallow: /admin"), "robots.txt must disallow /admin");
assert.ok(
  robotsSrc.includes("User-agent: Googlebot"),
  "robots.txt must define Googlebot directives",
);
console.log("✓ robots.txt directives verified.");

// 6. Route-Specific JSON-LD & Breadcrumbs
console.log("\n[Test 6] Verifying Route-Specific Structured Data...");
const repoSrc = fs.readFileSync(path.resolve("src/routes/$owner/$repo.tsx"), "utf8");
assert.ok(
  repoSrc.includes("SoftwareSourceCode"),
  "Repo route must output SoftwareSourceCode JSON-LD",
);
assert.ok(repoSrc.includes("BreadcrumbList"), "Repo route must output BreadcrumbList JSON-LD");

const profileSrc = fs.readFileSync(path.resolve("src/routes/$owner/index.tsx"), "utf8");
assert.ok(profileSrc.includes("ProfilePage"), "Profile route must output ProfilePage JSON-LD");

const docsSrc = fs.readFileSync(path.resolve("src/routes/docs.tsx"), "utf8");
assert.ok(docsSrc.includes("TechArticle"), "Docs route must output TechArticle JSON-LD");

console.log("✓ Route-specific structured data verified.");

console.log("\nAll Supercharged SEO Acceptance Tests Passed Successfully!");
