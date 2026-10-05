// src/routes/b69dc4e5088d44c4b57492f25a7a72d3[.]txt.ts
// Direct IndexNow verification key route
import { createFileRoute } from "@tanstack/react-router";

const KEY = "b69dc4e5088d44c4b57492f25a7a72d3";

export const Route = createFileRoute("/b69dc4e5088d44c4b57492f25a7a72d3.txt")({
  server: {
    handlers: {
      GET: async () => {
        return new Response(KEY, {
          status: 200,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "public, max-age=86400",
          },
        });
      },
    },
  },
});
