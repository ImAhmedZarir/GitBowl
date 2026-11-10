// src/lib/firebase-verify.server.ts
// Server-side cryptographic verification of Firebase ID tokens using Node.js crypto
import crypto from "node:crypto";

interface CachedCerts {
  certs: Record<string, string>;
  expiresAt: number;
}

let certsCache: CachedCerts | null = null;

const FIREBASE_PROJECT_ID =
  process.env["VITE_FIREBASE_PROJECT_ID"] || process.env["FIREBASE_PROJECT_ID"] || "gitbowl";

async function getGooglePublicCerts(): Promise<Record<string, string>> {
  const now = Date.now();
  if (certsCache && certsCache.expiresAt > now) {
    return certsCache.certs;
  }

  try {
    const res = await fetch(
      "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com",
    );
    if (!res.ok) throw new Error(`Google certs fetch failed: ${res.statusText}`);

    // Parse Cache-Control max-age
    const cc = res.headers.get("cache-control") || "";
    const match = cc.match(/max-age=(\d+)/);
    const maxAgeSec = match ? parseInt(match[1], 10) : 3600;

    const certs = (await res.json()) as Record<string, string>;
    certsCache = {
      certs,
      expiresAt: now + maxAgeSec * 1000,
    };
    return certs;
  } catch (err) {
    if (certsCache) return certsCache.certs;
    throw err;
  }
}

export interface VerifiedFirebaseClaims {
  uid: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  firebase?: {
    sign_in_provider?: string;
  };
}

/**
 * Verifies a Firebase ID token:
 * 1. Checks 3-segment JWT format.
 * 2. Checks signature against Google's public x509 certificates.
 * 3. Verifies aud === FIREBASE_PROJECT_ID.
 * 4. Verifies iss === https://securetoken.google.com/<FIREBASE_PROJECT_ID>.
 * 5. Verifies token is not expired (exp > now).
 * 6. Verifies sub is a non-empty string.
 */
export async function verifyFirebaseIdToken(token: string): Promise<VerifiedFirebaseClaims | null> {
  if (!token || typeof token !== "string") return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    const headerJson = Buffer.from(parts[0], "base64url").toString("utf-8");
    const payloadJson = Buffer.from(parts[1], "base64url").toString("utf-8");
    const header = JSON.parse(headerJson);
    const payload = JSON.parse(payloadJson);

    if (header.alg !== "RS256" || !header.kid) {
      return null;
    }

    // Check payload standard claims
    const nowSec = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < nowSec - 60) {
      return null; // Expired
    }

    const expectedIss = `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`;
    if (payload.iss !== expectedIss) {
      return null; // Invalid issuer
    }

    if (payload.aud !== FIREBASE_PROJECT_ID) {
      return null; // Invalid audience
    }

    if (!payload.sub || typeof payload.sub !== "string") {
      return null; // Invalid subject
    }

    // Verify signature with Google public key
    const certs = await getGooglePublicCerts();
    const certificate = certs[header.kid];
    if (!certificate) {
      return null; // Unknown kid
    }

    const signedData = `${parts[0]}.${parts[1]}`;
    const signature = Buffer.from(parts[2], "base64url");

    const verifier = crypto.createVerify("RSA-SHA256");
    verifier.update(signedData);
    const isValid = verifier.verify(certificate, signature);

    if (!isValid) {
      return null;
    }

    return {
      uid: payload.sub,
      email: payload.email,
      email_verified: Boolean(payload.email_verified),
      name: payload.name,
      picture: payload.picture,
      firebase: payload.firebase,
    };
  } catch {
    return null;
  }
}
