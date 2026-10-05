// src/routes/api/v1/user/index.ts
// GET /api/v1/user — Get authenticated user
import { createFileRoute } from "@tanstack/react-router";
import {
  authenticateApiV1,
  checkApiV1RateLimit,
  v1Response,
  v1RateLimitExceeded,
  formatGitHubUser,
} from "@/lib/api-v1.server";

export const Route = createFileRoute("/api/v1/user/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await authenticateApiV1(request);
        const rateLimit = checkApiV1RateLimit(request, auth.userId);
        if (!rateLimit.allowed) return v1RateLimitExceeded(rateLimit);

        if (!auth.userId || !auth.profile) {
          return v1Response(
            {
              message: "Requires authentication",
              documentation_url: "https://gitbowl.dev/api/docs",
            },
            401,
            rateLimit,
          );
        }

        return v1Response(formatGitHubUser(auth.profile), 200, rateLimit);
      },
    },
  },
});
