// src/routes/api/auth/check-username.ts
// Secure endpoint to check username availability against validation rules, reserved handles, and existing profiles/orgs.
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { validateUsername, normalizeUsername } from "@/lib/username";
import { json, error } from "@/lib/http.server";

export const Route = createFileRoute("/api/auth/check-username")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const raw = url.searchParams.get("username") || "";
          const excludeUserId = url.searchParams.get("excludeUserId") || "";
          const username = normalizeUsername(raw);

          if (!username) {
            return json({ available: false, reason: "Username is required" });
          }

          // 1. Comprehensive syntax & reserved names validation
          const validation = validateUsername(username);
          if (!validation.valid) {
            return json({
              available: false,
              reason: validation.error || "Invalid username format",
            });
          }

          // 2. Query database profiles using exact equality on normalized username
          let query = supabaseAdmin
            .from("profiles")
            .select("id, username")
            .eq("username", username);

          if (excludeUserId) {
            query = query.neq("id", excludeUserId);
          }

          const { data: profileData, error: profileErr } = await query;

          if (profileErr) {
            return json(
              { available: false, reason: "Database error checking availability" },
              { status: 500 },
            );
          }

          if (profileData && profileData.length > 0) {
            return json({
              available: false,
              reason: "This username is already taken",
            });
          }

          // 3. Check if handle is taken by an organization slug
          const { data: orgData, error: orgErr } = await (supabaseAdmin.from("orgs" as any) as any)
            .select("id, slug")
            .eq("slug", username);

          if (orgErr) {
            return json(
              { available: false, reason: "Database error checking organization names" },
              { status: 500 },
            );
          }

          if (orgData && orgData.length > 0) {
            return json({
              available: false,
              reason: "This handle is already taken by an organization",
            });
          }

          return json({ available: true });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Server error checking username";
          return error(msg, 500);
        }
      },
    },
  },
});
