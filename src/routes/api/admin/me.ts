// src/routes/api/admin/me.ts
import { createFileRoute } from "@tanstack/react-router";
import { requireAdmin } from "@/lib/admin.server";

export const Route = createFileRoute("/api/admin/me")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const admin = await requireAdmin(request);
        return new Response(
          JSON.stringify({
            ok: true,
            email: admin.email,
            username: admin.username,
            role: "admin",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      },
    },
  },
});
