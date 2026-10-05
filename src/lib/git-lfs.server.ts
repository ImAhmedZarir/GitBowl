// src/lib/git-lfs.server.ts
// Git LFS v1 API Implementation (Batch, Upload, Download, Verify)
import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { getSupabaseAdmin } from "@/integrations/supabase/client.server";

export interface LfsObjectRequest {
  oid: string;
  size: number;
}

export interface LfsBatchRequest {
  operation: "upload" | "download";
  transfers?: string[];
  objects: LfsObjectRequest[];
  hash_algo?: string;
}

export function isLfsPointer(content: string): boolean {
  return (
    content.startsWith("version https://git-lfs.github.com/spec/v1") &&
    content.includes("oid sha256:") &&
    content.includes("size ")
  );
}

export function parseLfsPointer(content: string): { oid: string; size: number } | null {
  if (!isLfsPointer(content)) return null;
  const oidMatch = content.match(/oid sha256:([0-9a-fA-F]{64})/);
  const sizeMatch = content.match(/size (\d+)/);
  if (!oidMatch || !sizeMatch || !oidMatch[1] || !sizeMatch[1]) return null;
  return {
    oid: oidMatch[1].toLowerCase(),
    size: parseInt(sizeMatch[1], 10),
  };
}

/**
 * Handles the Git LFS batch endpoint: POST /info/lfs/objects/batch
 */
export async function handleLfsBatch(
  repoId: string,
  owner: string,
  repoName: string,
  requestUrl: string,
  body: LfsBatchRequest,
) {
  const { operation = "download", objects = [] } = body;
  const baseUrl = new URL(requestUrl).origin;
  const supabase = getSupabaseAdmin();

  // Look up existing LFS objects
  const oids = objects.map((o) => o.oid.toLowerCase());
  const { data: existingRows } = await supabase
    .from("lfs_objects" as any)
    .select("oid, size")
    .eq("repo_id", repoId)
    .in("oid", oids);

  const existingMap = new Map((existingRows || []).map((r: any) => [r.oid, r.size]));

  const responseObjects = objects.map((obj) => {
    const cleanOid = obj.oid.toLowerCase();
    const exists = existingMap.has(cleanOid);

    const lfsObjectUrl = `${baseUrl}/api/public/git/${owner}/${repoName}/info/lfs/objects/${cleanOid}`;
    const verifyUrl = `${baseUrl}/api/public/git/${owner}/${repoName}/info/lfs/objects/verify`;

    if (operation === "upload") {
      // If object already exists, no actions needed
      if (exists) {
        return {
          oid: cleanOid,
          size: obj.size,
          authenticated: true,
        };
      }

      return {
        oid: cleanOid,
        size: obj.size,
        authenticated: true,
        actions: {
          upload: {
            href: lfsObjectUrl,
            expires_in: 86400,
          },
          verify: {
            href: verifyUrl,
          },
        },
      };
    } else {
      // download operation
      if (!exists) {
        return {
          oid: cleanOid,
          size: obj.size,
          error: {
            code: 404,
            message: "Object does not exist",
          },
        };
      }

      return {
        oid: cleanOid,
        size: obj.size,
        authenticated: true,
        actions: {
          download: {
            href: lfsObjectUrl,
            expires_in: 86400,
          },
        },
      };
    }
  });

  return {
    transfer: "basic",
    objects: responseObjects,
  };
}

/**
 * Handles uploading an LFS object: PUT /info/lfs/objects/:oid
 */
export async function handleLfsUpload(
  repoId: string,
  oid: string,
  bodyBuffer: Buffer,
): Promise<{ success: boolean; error?: string }> {
  const cleanOid = oid.toLowerCase();
  const calculatedSha = createHash("sha256").update(bodyBuffer).digest("hex");

  if (calculatedSha !== cleanOid) {
    return {
      success: false,
      error: `Checksum mismatch: expected ${cleanOid}, calculated ${calculatedSha}`,
    };
  }

  const supabase = getSupabaseAdmin();
  const base64Data = bodyBuffer.toString("base64");

  // 1. Store raw payload
  const { error: dataError } = await supabase.from("lfs_data" as any).upsert(
    {
      oid: cleanOid,
      data: base64Data,
      size: bodyBuffer.length,
      created_at: new Date().toISOString(),
    },
    { onConflict: "oid" },
  );

  if (dataError) {
    return { success: false, error: dataError.message };
  }

  // 2. Record LFS object in repository
  const { error: objError } = await supabase.from("lfs_objects" as any).upsert(
    {
      repo_id: repoId,
      oid: cleanOid,
      size: bodyBuffer.length,
      created_at: new Date().toISOString(),
    },
    { onConflict: "repo_id,oid" },
  );

  if (objError) {
    return { success: false, error: objError.message };
  }

  return { success: true };
}

/**
 * Handles downloading an LFS object: GET /info/lfs/objects/:oid
 */
export async function handleLfsDownload(oid: string): Promise<Buffer | null> {
  const supabase = getSupabaseAdmin();
  const cleanOid = oid.toLowerCase();

  const { data, error } = await supabase
    .from("lfs_data" as any)
    .select("data")
    .eq("oid", cleanOid)
    .maybeSingle();

  const row = data as any;
  if (error || !row || !row.data) return null;
  return Buffer.from(row.data, "base64");
}

/**
 * Handles verifying an LFS object: POST /info/lfs/objects/verify
 */
export async function handleLfsVerify(repoId: string, oid: string, size: number): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const cleanOid = oid.toLowerCase();

  const { data } = await supabase
    .from("lfs_objects" as any)
    .select("size")
    .eq("repo_id", repoId)
    .eq("oid", cleanOid)
    .maybeSingle();

  const row = data as any;
  return !!row && (!size || Number(row.size) === Number(size));
}
