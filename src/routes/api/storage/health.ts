import { createFileRoute } from "@tanstack/react-router";
import { checkDriveHealth } from "@/lib/gdrive.server";

export const Route = createFileRoute("/api/storage/health")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const health = await checkDriveHealth();
          return new Response(
            JSON.stringify({
              ...health,
              provider: "Google Drive (Central Storage)",
              serviceAccount: "gitbowl-store@gitbowl.iam.gserviceaccount.com",
              targetFolderId: "1kmpvKOO6Naofeq5V2je1GBxVvHl6Gwos",
              folderName: health.folderName || "GitBowl-Store",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        } catch (err: any) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: err?.message || "Storage health check failed",
            }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
