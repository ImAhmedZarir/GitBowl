// src/routes/api/v1/users/$username.ts
// GET /api/v1/users/:username — Get public user profile
import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseAdmin } from "@/integrations/supabase/client.server";
import {
  authenticateApiV1,
  checkApiV1RateLimit,
  v1Response,
  v1RateLimitExceeded,
  formatGitHubUser,
} from "@/lib/api-v1.server";

export const Route = createFileRoute("/api/v1/users/$username")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await authenticateApiV1(request);
        const rateLimit = checkApiV1RateLimit(request, auth.userId);
        if (!rateLimit.allowed) return v1RateLimitExceeded(rateLimit);

        const targetUsername = params.username?.trim();
        if (!targetUsername) {
          return v1Response({ message: "Not Found" }, 404, rateLimit);
        }

        const supabase = getSupabaseAdmin();
        const { data: profile } = await supabase
          .from("profiles")
          .select("*")
          .ilike("username", targetUsername)
          .maybeSingle();

        if (!profile) {
          return v1Response({ message: "Not Found" }, 404, rateLimit);
        }

        return v1Response(formatGitHubUser(profile), 200, rateLimit);
      },
    },
  },
});
