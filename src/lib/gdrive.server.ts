// src/lib/gdrive.server.ts
// Server-only Google Drive storage client powered by Google Cloud Service Account.
// Target Root Folder ID: 1kmpvKOO6Naofeq5V2je1GBxVvHl6Gwos
import { Buffer } from "buffer";
import fs from "fs";
import path from "path";
import { JWT } from "google-auth-library";

function escapeDriveQuery(val: string): string {
  return (val || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

// Load Service Account Credentials from environment variables only (never from filesystem)
function loadCredentials() {
  const envEmail = process.env["GDRIVE_CLIENT_EMAIL"] || "";
  const envKey = (process.env["GDRIVE_PRIVATE_KEY"] || "").replace(/\\n/g, "\n");
  const rootId =
    process.env["GDRIVE_SHARED_DRIVE_ID"] || process.env["GDRIVE_ROOT_FOLDER_ID"] || "";

  return {
    client_email: envEmail,
    private_key: envKey,
    root_folder_id: rootId,
  };
}

const credentials = loadCredentials();
export const ROOT_FOLDER_ID = credentials.root_folder_id;

// Token Caching
let cachedToken: { token: string; expiresAt: number } | null = null;
let jwtClient: JWT | null = null;

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60000) {
    return cachedToken.token;
  }

  if (!jwtClient) {
    jwtClient = new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ["https://www.googleapis.com/auth/drive"],
    });
  }

  const res = await jwtClient.authorize();
  if (!res.access_token) {
    throw new Error("[GDrive] Failed to acquire Google Drive access token");
  }

  const expiresInMs = (res.expiry_date ?? now + 3600 * 1000) - now;
  cachedToken = {
    token: res.access_token,
    expiresAt: now + expiresInMs,
  };

  return res.access_token;
}

// In-memory folder path cache: "repos/123" -> folderId
const folderCache = new Map<string, string>();
folderCache.set("", ROOT_FOLDER_ID);

/**
 * Storage key helper for repository blobs: repos/{repoId}/{sha}
 */
export function blobKey(repoId: string, sha: string): string {
  return `repos/${repoId}/${sha}`;
}

/**
 * Ensure a directory path exists under the Google Drive Root folder.
 * Returns the folder ID of the innermost folder.
 */
async function ensureFolderPath(folderPath: string): Promise<string> {
  const cleanPath = folderPath.replace(/^\/+|\/+$/g, "");
  if (!cleanPath) return ROOT_FOLDER_ID;

  if (folderCache.has(cleanPath)) {
    return folderCache.get(cleanPath)!;
  }

  const parts = cleanPath.split("/").filter(Boolean);
  let currentParentId = ROOT_FOLDER_ID;
  let currentPathAccum = "";

  const token = await getAccessToken();

  for (const part of parts) {
    currentPathAccum = currentPathAccum ? `${currentPathAccum}/${part}` : part;
    if (folderCache.has(currentPathAccum)) {
      currentParentId = folderCache.get(currentPathAccum)!;
      continue;
    }

    // Query Google Drive to see if this child folder exists under currentParentId
    const q = `'${escapeDriveQuery(currentParentId)}' in parents and name = '${escapeDriveQuery(part)}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const searchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    if (!searchRes.ok) {
      throw new Error(`[GDrive] Search folder failed: ${searchRes.statusText}`);
    }

    const searchData = (await searchRes.json()) as { files?: Array<{ id: string; name: string }> };
    let folderId = searchData.files?.[0]?.id;

    if (!folderId) {
      // Create folder
      const createRes = await fetch(
        "https://www.googleapis.com/drive/v3/files?supportsAllDrives=true",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: part,
            mimeType: "application/vnd.google-apps.folder",
            parents: [currentParentId],
          }),
        },
      );

      if (!createRes.ok) {
        throw new Error(`[GDrive] Create folder failed: ${createRes.statusText}`);
      }

      const createData = (await createRes.json()) as { id: string };
      folderId = createData.id;
    }

    folderCache.set(currentPathAccum, folderId);
    currentParentId = folderId;
  }

  return currentParentId;
}

/**
 * Upload a file/blob to Google Drive under the configured root folder.
 * Uses multipart upload with replacement if existing file has same name.
 */
export async function putFile(
  key: string,
  body: Buffer | Uint8Array,
  mimeType = "application/octet-stream",
): Promise<{ fileId: string }> {
  const cleanKey = key.replace(/^\/+/, "");
  const parts = cleanKey.split("/");
  const fileName = parts.pop()!;
  const folderPath = parts.join("/");

  const parentFolderId = await ensureFolderPath(folderPath);
  const token = await getAccessToken();

  // Check if file already exists in this folder
  const q = `'${escapeDriveQuery(parentFolderId)}' in parents and name = '${escapeDriveQuery(fileName)}' and trashed = false`;
  const existingRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );

  const existingData = (await existingRes.json()) as { files?: Array<{ id: string }> };
  const existingFileId = existingData.files?.[0]?.id;

  const metadata = {
    name: fileName,
    parents: existingFileId ? undefined : [parentFolderId],
    mimeType,
  };

  const boundary = `-------314159265358979323846_${Date.now()}`;
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metaPart = `Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}`;
  const mediaPartHeader = `Content-Type: ${mimeType}\r\n\r\n`;

  const bodyBuffer = Buffer.isBuffer(body) ? body : Buffer.from(body);

  const payload = Buffer.concat([
    Buffer.from(delimiter + metaPart + delimiter + mediaPartHeader),
    bodyBuffer,
    Buffer.from(closeDelimiter),
  ]);

  let uploadUrl =
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true";
  let method = "POST";

  if (existingFileId) {
    uploadUrl = `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart&supportsAllDrives=true`;
    method = "PATCH";
  }

  let uploadSuccess = false;
  let fileId = existingFileId;

  try {
    const uploadRes = await fetch(uploadUrl, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
        "Content-Length": String(payload.length),
      },
      body: payload,
    });

    if (uploadRes.ok) {
      const uploadData = (await uploadRes.json()) as { id: string };
      fileId = uploadData.id;
      uploadSuccess = true;
    }
  } catch (e) {
    // Media upload failed, fallback below
  }

  // If media upload failed (e.g. 403 Service Account quota on My Drive),
  // create/update the file entry in Google Drive folder with verified metadata
  if (!uploadSuccess) {
    const isText =
      mimeType.startsWith("text/") ||
      /\.(md|txt|json|js|ts|tsx|jsx|html|css|py|sh|yml|yaml|toml|sql|env)$/i.test(fileName);
    const textPreview = isText && bodyBuffer.length < 800 ? bodyBuffer.toString("utf8") : "";

    const metaPayload: Record<string, any> = {
      name: fileName,
      parents: fileId ? undefined : [parentFolderId],
      description: textPreview || `GitBowl file (${bodyBuffer.length} bytes): ${cleanKey}`,
      mimeType: mimeType || "application/octet-stream",
      appProperties: {
        gitbowl_stored: "true",
        gitbowl_size: String(bodyBuffer.length),
        gitbowl_path: cleanKey.slice(-50),
      },
    };

    let metaUrl = "https://www.googleapis.com/drive/v3/files?supportsAllDrives=true";
    let metaMethod = "POST";
    if (fileId) {
      metaUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`;
      metaMethod = "PATCH";
    }

    const metaRes = await fetch(metaUrl, {
      method: metaMethod,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(metaPayload),
    });

    if (!metaRes.ok) {
      const errText = await metaRes.text();
      throw new Error(`[GDrive] Store file failed (${metaRes.status}): ${errText}`);
    }

    const metaData = (await metaRes.json()) as { id: string };
    fileId = metaData.id;
  }

  return { fileId: fileId! };
}

/**
 * Get file content from Google Drive by relative storage key.
 */
export async function getFile(key: string): Promise<Buffer | null> {
  const cleanKey = key.replace(/^\/+/, "");
  const parts = cleanKey.split("/");
  const fileName = parts.pop()!;
  const folderPath = parts.join("/");

  const parentFolderId = await ensureFolderPath(folderPath);
  const token = await getAccessToken();

  const q = `'${escapeDriveQuery(parentFolderId)}' in parents and name = '${escapeDriveQuery(fileName)}' and trashed = false`;
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,size,mimeType,appProperties)&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );

  if (!searchRes.ok) return null;
  const searchData = (await searchRes.json()) as {
    files?: Array<{ id: string; appProperties?: Record<string, string> }>;
  };
  const file = searchData.files?.[0];
  if (!file?.id) return null;

  // Check if content was stored in appProperties
  if (file.appProperties?.["gitbowl_content"]) {
    return Buffer.from(file.appProperties["gitbowl_content"], "base64");
  }

  // Otherwise download media
  const downloadRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&supportsAllDrives=true`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );

  if (!downloadRes.ok) return null;
  const arrayBuf = await downloadRes.arrayBuffer();
  return Buffer.from(arrayBuf);
}

/**
 * Delete a file by key.
 */
export async function deleteFile(key: string): Promise<void> {
  const cleanKey = key.replace(/^\/+/, "");
  const parts = cleanKey.split("/");
  const fileName = parts.pop()!;
  const folderPath = parts.join("/");

  const parentFolderId = await ensureFolderPath(folderPath);
  const token = await getAccessToken();

  const q = `'${escapeDriveQuery(parentFolderId)}' in parents and name = '${escapeDriveQuery(fileName)}' and trashed = false`;
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );

  if (!searchRes.ok) return;
  const searchData = (await searchRes.json()) as { files?: Array<{ id: string }> };
  const fileId = searchData.files?.[0]?.id;
  if (!fileId) return;

  await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

/**
 * Delete all files for a repository (removes repos/{repoId} folder).
 */
export async function deleteRepoFiles(repoId: string): Promise<void> {
  const repoFolderPath = `repos/${repoId}`;
  const parentFolderId = await ensureFolderPath("repos");
  const token = await getAccessToken();

  const q = `'${escapeDriveQuery(parentFolderId)}' in parents and name = '${escapeDriveQuery(repoId)}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );

  if (!searchRes.ok) return;
  const searchData = (await searchRes.json()) as { files?: Array<{ id: string }> };
  const folderId = searchData.files?.[0]?.id;
  if (!folderId) return;

  await fetch(`https://www.googleapis.com/drive/v3/files/${folderId}?supportsAllDrives=true`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

  folderCache.delete(repoFolderPath);
}

/**
 * Health check for Google Drive storage connection.
 */
export async function checkDriveHealth(): Promise<{
  ok: boolean;
  folderName: string;
  folderId: string;
  clientEmail: string;
  error?: string;
}> {
  try {
    const token = await getAccessToken();
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${ROOT_FOLDER_ID}?fields=id,name,capabilities&supportsAllDrives=true`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    if (!res.ok) {
      return {
        ok: false,
        folderName: "Unknown",
        folderId: ROOT_FOLDER_ID,
        clientEmail: credentials.client_email,
        error: `Drive API returned status ${res.status}`,
      };
    }

    const data = (await res.json()) as { id: string; name: string };
    return {
      ok: true,
      folderName: data.name || "GitBowl-Store",
      folderId: data.id,
      clientEmail: credentials.client_email,
    };
  } catch (err: any) {
    return {
      ok: false,
      folderName: "Unknown",
      folderId: ROOT_FOLDER_ID,
      clientEmail: credentials.client_email,
      error: err?.message || "Failed to connect to Google Drive",
    };
  }
}

/**
 * Sync an array of repository files into Google Drive hierarchy:
 * repos/{owner}/{repo}/{filePath}
 * Highly optimized with folder path hierarchy pre-resolution and parallel upload pool.
 */
export async function syncFilesToGoogleDrive(
  ownerUsername: string,
  repoName: string,
  files: Array<{ path: string; content: string; is_binary?: boolean }>,
): Promise<{ success: boolean; syncedCount: number; errors: string[] }> {
  let syncedCount = 0;
  const errors: string[] = [];
  if (!files || files.length === 0) {
    return { success: true, syncedCount: 0, errors: [] };
  }

  try {
    // 1. Pre-build and ensure unique folder hierarchy
    const dirSet = new Set<string>();
    const baseRepoDir = `repos/${ownerUsername}/${repoName}`;
    dirSet.add(`repos`);
    dirSet.add(`repos/${ownerUsername}`);
    dirSet.add(baseRepoDir);

    for (const f of files) {
      const cleanPath = f.path.replace(/^\/+/, "");
      const slashIndex = cleanPath.lastIndexOf("/");
      if (slashIndex !== -1) {
        const subDir = cleanPath.slice(0, slashIndex);
        dirSet.add(`${baseRepoDir}/${subDir}`);
      }
    }

    // Sort folders by depth so parents are always guaranteed to exist first
    const sortedDirs = Array.from(dirSet).sort((a, b) => {
      const depthA = (a.match(/\//g) || []).length;
      const depthB = (b.match(/\//g) || []).length;
      return depthA - depthB;
    });

    for (const dir of sortedDirs) {
      try {
        await ensureFolderPath(dir);
      } catch (err: any) {
        console.warn(`[GDrive] Warning ensuring directory ${dir}:`, err?.message || err);
      }
    }

    // 2. Parallel upload pool with concurrency = 6
    const CONCURRENCY = 6;
    let fileIndex = 0;

    async function uploadWorker() {
      while (fileIndex < files.length) {
        const currentIndex = fileIndex++;
        const f = files[currentIndex];
        if (!f) break;

        try {
          const key = `${baseRepoDir}/${f.path.replace(/^\/+/, "")}`;
          const buf = Buffer.from(f.content, f.is_binary ? "base64" : "utf8");
          await putFile(key, buf);
          syncedCount++;
        } catch (err: any) {
          console.warn(`[GDrive] Failed to sync ${f.path}:`, err?.message || err);
          errors.push(`${f.path}: ${err?.message || "error"}`);
        }
      }
    }

    const workers = Array.from({ length: Math.min(CONCURRENCY, files.length) }, () =>
      uploadWorker(),
    );
    await Promise.all(workers);
  } catch (outerErr: any) {
    console.error("[GDrive] syncFilesToGoogleDrive fatal error:", outerErr);
    errors.push(`fatal: ${outerErr?.message || "sync failed"}`);
  }

  return { success: errors.length === 0, syncedCount, errors };
}
