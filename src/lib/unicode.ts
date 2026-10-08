// src/lib/unicode.ts
/**
 * Unicode, character encoding, and binary safety utilities for GitBowl.
 *
 * Prevents PostgreSQL database errors such as:
 * - "unsupported Unicode escape sequence" (Postgres error 22P05)
 * - "invalid byte sequence for encoding UTF8: 0x00"
 * - "\u0000 cannot be converted to text / jsonb"
 * - Malformed UTF-16 unpaired surrogate code points
 */

/**
 * Strips raw NUL characters and repairs/removes unpaired UTF-16 surrogates
 * to ensure strings are 100% safe for PostgreSQL text/json/jsonb columns and PostgREST.
 */
export function sanitizeUnicode(str: string | null | undefined): string {
  if (str === null || str === undefined) return "";
  if (typeof str !== "string") str = String(str);

  // 1. Remove raw NUL characters (\0 or \u0000 character)
  let clean = str.replace(/\0/g, "");

  // 2. Remove unpaired UTF-16 surrogate code points
  // High surrogate not followed by low surrogate OR low surrogate without high surrogate
  clean = clean.replace(
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
    "",
  );

  // 3. Normalize Unicode using NFC (Canonical Decomposition, followed by Canonical Composition)
  try {
    clean = clean.normalize("NFC");
  } catch {
    // If normalization fails, proceed with cleaned string
  }

  return clean;
}

/**
 * Checks if a string or buffer contains NUL byte (\0).
 */
export function containsNullByte(input: string | Uint8Array | Buffer | null | undefined): boolean {
  if (!input) return false;
  if (typeof input === "string") {
    return input.includes("\0") || /\0/.test(input);
  }
  if (input instanceof Uint8Array || (typeof Buffer !== "undefined" && Buffer.isBuffer(input))) {
    for (let i = 0; i < input.length; i++) {
      if (input[i] === 0) return true;
    }
  }
  return false;
}

/**
 * Sanitizes a repository file path for GitBowl storage.
 */
export function sanitizeFilePath(rawPath: string | null | undefined): string {
  if (!rawPath) return "unnamed-file";
  let p = sanitizeUnicode(rawPath);
  // Normalize backslashes to forward slashes
  p = p.replace(/\\/g, "/");
  // Remove leading slashes and redundant consecutive slashes
  p = p.replace(/^\/+/, "").replace(/\/+/g, "/");
  // Remove any remaining null or control characters
  // eslint-disable-next-line no-control-regex
  p = p.replace(/[\x00-\x1F\x7F]/g, "");
  return p.trim() || "unnamed-file";
}

/**
 * Sanitizes a commit message, ensuring no null bytes or illegal characters.
 */
export function sanitizeCommitMessage(
  msg: string | null | undefined,
  defaultMsg = "Commit changes",
): string {
  if (!msg) return defaultMsg;
  const clean = sanitizeUnicode(msg).trim();
  return clean.slice(0, 500) || defaultMsg;
}

export interface SanitizableFileItem {
  path: string;
  content: string;
  is_binary?: boolean;
  size?: number;
}

/**
 * Sanitizes an entire file item before insertion into `repo_files`.
 *
 * CRITICAL RULE:
 * If a file is marked text (is_binary = false) but contains NUL bytes (\0),
 * it cannot be safely stored as PostgreSQL text. It is automatically promoted
 * to `is_binary: true` and converted to clean Base64.
 * This preserves binary data without loss and prevents 22P05 database errors.
 */
export function sanitizeFileRecord<T extends SanitizableFileItem>(file: T): T {
  const cleanPath = sanitizeFilePath(file.path);
  let isBinary = Boolean(file.is_binary);
  let content = file.content ?? "";

  if (isBinary) {
    // Ensure base64 contains only valid base64 characters
    content = content.replace(/[^A-Za-z0-9+/=]/g, "");
  } else {
    // Check if the text contains NUL bytes
    if (containsNullByte(content)) {
      // Promote to binary base64 to avoid corrupting data or throwing Postgres error
      isBinary = true;
      if (typeof Buffer !== "undefined") {
        content = Buffer.from(content, "binary").toString("base64");
      } else if (typeof btoa === "function") {
        content = btoa(content);
      }
    } else {
      // Pure text: sanitize unicode escape sequences & surrogates
      content = sanitizeUnicode(content);
    }
  }

  const finalSize = isBinary
    ? Math.round((content.length * 3) / 4)
    : typeof Buffer !== "undefined"
      ? Buffer.byteLength(content, "utf-8")
      : content.length;

  return {
    ...file,
    path: cleanPath,
    content,
    is_binary: isBinary,
    size: file.size ?? finalSize,
  };
}

/**
 * Intercepts low-level database error messages and formats them into
 * human-friendly, informative descriptions.
 */
export function formatFriendlyErrorMessage(rawMessage: string | null | undefined): string {
  if (!rawMessage) return "An unexpected error occurred during repository operation.";

  const lower = rawMessage.toLowerCase();

  if (lower.includes("unsupported unicode escape sequence") || lower.includes("22p05")) {
    return "The repository contains binary or special encoded files that required base64 sanitization. Please retry, and GitBowl will automatically normalize them.";
  }

  if (lower.includes("terminal prompt") || lower.includes("could not read username")) {
    return "Could not access the remote repository. If this repository is private, please provide a Personal Access Token or ensure URL is correct.";
  }

  if (lower.includes("not found") || lower.includes("repository not found")) {
    return "Repository not found on the remote Git host. Please check the spelling of the owner and repository name.";
  }

  if (lower.includes("statement timeout") || lower.includes("timeout")) {
    return "The repository is very large and the request timed out. GitBowl uses adaptive streaming; please try again.";
  }

  return rawMessage;
}
