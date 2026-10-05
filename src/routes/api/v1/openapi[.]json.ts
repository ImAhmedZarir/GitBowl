// src/routes/api/v1/openapi[.]json.ts
// OpenAPI 3.1 Specification for GitBowl REST API v1
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/v1/openapi.json")({
  server: {
    handlers: {
      GET: async () => {
        const spec = {
          openapi: "3.1.0",
          info: {
            title: "GitBowl REST API v1",
            version: "1.0.0",
            description:
              "GitHub-compatible REST API for GitBowl. Manage repositories, commits, branches, issues, pull requests, and file contents.",
            contact: {
              name: "GitBowl Support",
              url: "https://gitbowl.dev",
            },
          },
          servers: [{ url: "https://gitbowl.dev/api/v1", description: "GitBowl Production API" }],
          components: {
            securitySchemes: {
              BearerAuth: {
                type: "http",
                scheme: "bearer",
                bearerFormat: "PAT / JWT",
                description: "Personal Access Token starting with 'gbp_' or Supabase Session JWT",
              },
            },
          },
          security: [{ BearerAuth: [] }],
          paths: {
            "/user": {
              get: {
                summary: "Get authenticated user",
                description: "Returns profile of the user authenticated via Personal Access Token.",
                responses: {
                  "200": { description: "Authenticated user details" },
                  "401": { description: "Unauthorized" },
                  "429": { description: "Rate limit exceeded" },
                },
              },
            },
            "/user/repos": {
              get: {
                summary: "List repositories for authenticated user",
                responses: { "200": { description: "Array of repositories" } },
              },
              post: {
                summary: "Create a repository",
                responses: { "201": { description: "Repository created" } },
              },
            },
            "/users/{username}": {
              get: {
                summary: "Get public user profile",
                parameters: [{ name: "username", in: "path", required: true }],
                responses: {
                  "200": { description: "User profile" },
                  "404": { description: "Not found" },
                },
              },
            },
            "/repos/{owner}/{repo}": {
              get: {
                summary: "Get repository details",
                parameters: [
                  { name: "owner", in: "path", required: true },
                  { name: "repo", in: "path", required: true },
                ],
                responses: {
                  "200": { description: "Repository details" },
                  "404": { description: "Not found" },
                },
              },
              patch: {
                summary: "Update repository details",
                parameters: [
                  { name: "owner", in: "path", required: true },
                  { name: "repo", in: "path", required: true },
                ],
                responses: { "200": { description: "Updated repository" } },
              },
              delete: {
                summary: "Delete repository",
                parameters: [
                  { name: "owner", in: "path", required: true },
                  { name: "repo", in: "path", required: true },
                ],
                responses: { "204": { description: "Repository deleted" } },
              },
            },
            "/repos/{owner}/{repo}/commits": {
              get: {
                summary: "List commits",
                parameters: [
                  { name: "owner", in: "path", required: true },
                  { name: "repo", in: "path", required: true },
                ],
                responses: { "200": { description: "Array of commits" } },
              },
            },
            "/repos/{owner}/{repo}/branches": {
              get: {
                summary: "List branches",
                parameters: [
                  { name: "owner", in: "path", required: true },
                  { name: "repo", in: "path", required: true },
                ],
                responses: { "200": { description: "Array of branches" } },
              },
            },
            "/repos/{owner}/{repo}/contents/{path}": {
              get: {
                summary: "Get file contents or directory listing",
                parameters: [
                  { name: "owner", in: "path", required: true },
                  { name: "repo", in: "path", required: true },
                  { name: "path", in: "path", required: true },
                ],
                responses: { "200": { description: "File content or directory items" } },
              },
              put: {
                summary: "Create or update file",
                parameters: [
                  { name: "owner", in: "path", required: true },
                  { name: "repo", in: "path", required: true },
                  { name: "path", in: "path", required: true },
                ],
                responses: { "200": { description: "File updated and commit created" } },
              },
              delete: {
                summary: "Delete a file",
                parameters: [
                  { name: "owner", in: "path", required: true },
                  { name: "repo", in: "path", required: true },
                  { name: "path", in: "path", required: true },
                ],
                responses: { "200": { description: "File deleted and commit created" } },
              },
            },
            "/repos/{owner}/{repo}/pulls": {
              get: {
                summary: "List pull requests",
                parameters: [
                  { name: "owner", in: "path", required: true },
                  { name: "repo", in: "path", required: true },
                ],
                responses: { "200": { description: "Array of pull requests" } },
              },
              post: {
                summary: "Create a pull request",
                parameters: [
                  { name: "owner", in: "path", required: true },
                  { name: "repo", in: "path", required: true },
                ],
                responses: { "201": { description: "Pull request created" } },
              },
            },
            "/repos/{owner}/{repo}/issues": {
              get: {
                summary: "List issues",
                parameters: [
                  { name: "owner", in: "path", required: true },
                  { name: "repo", in: "path", required: true },
                ],
                responses: { "200": { description: "Array of issues" } },
              },
              post: {
                summary: "Create an issue",
                parameters: [
                  { name: "owner", in: "path", required: true },
                  { name: "repo", in: "path", required: true },
                ],
                responses: { "201": { description: "Issue created" } },
              },
            },
          },
        };

        return new Response(JSON.stringify(spec, null, 2), {
          status: 200,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
          },
        });
      },
    },
  },
});
