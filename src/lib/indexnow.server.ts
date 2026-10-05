// src/lib/indexnow.server.ts
// Automated Search Engine Notification Service (Bing, Yandex, Seznam, Naver)
// Instant IndexNow notification when repositories or pages are created/updated

const DEFAULT_INDEXNOW_KEY = "b69dc4e5088d44c4b57492f25a7a72d3";
const HOST = "gitbowl.zone.id";

export async function notifySearchEngines(
  urls: string[],
): Promise<{ success: boolean; submitted: number; status?: number }> {
  try {
    const key = process.env["INDEXNOW_KEY"] || DEFAULT_INDEXNOW_KEY;
    const cleanUrls = urls
      .filter(Boolean)
      .map((u) =>
        u.startsWith("http") ? u : `https://${HOST}${u.startsWith("/") ? "" : "/"}${u}`,
      );

    if (cleanUrls.length === 0) {
      return { success: true, submitted: 0 };
    }

    const payload = {
      host: HOST,
      key,
      keyLocation: `https://${HOST}/${key}.txt`,
      urlList: cleanUrls.slice(0, 100),
    };

    const res = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload),
    });

    const isOk = res.ok || res.status === 200 || res.status === 202;
    return { success: isOk, submitted: cleanUrls.length, status: res.status };
  } catch (err) {
    console.warn("[IndexNow] Failed to notify search engines:", err);
    return { success: false, submitted: 0 };
  }
}
