#!/usr/bin/env node
// cli/bin/bowl.js
// Official GitBowl Command-Line Interface ("bowl")
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";
import readline from "node:readline";

const CONFIG_DIR = path.join(os.homedir(), ".gitbowl");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");
const DEFAULT_HOST = process.env.GITBOWL_HOST || "https://gitbowl.dev";

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
    }
  } catch {
    // ignore
  }
  return { host: DEFAULT_HOST, token: null };
}

function saveConfig(cfg) {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), "utf8");
}

async function apiRequest(endpoint, options = {}) {
  const cfg = loadConfig();
  const host = cfg.host || DEFAULT_HOST;
  const token = cfg.token || process.env.GITBOWL_TOKEN;

  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "User-Agent": "GitBowl-CLI/1.0",
    ...(options.headers || {}),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const url = `${host}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
  const res = await fetch(url, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || `API Error ${res.status}: ${res.statusText}`);
  }
  return data;
}

function printUsage() {
  console.log(`
GitBowl CLI ("bowl") — The command line interface for GitBowl

USAGE:
  bowl <command> <subcommand> [flags]

COMMANDS:
  auth login               Authenticate with your GitBowl account
  auth status              View your current authentication status
  auth logout              Log out from GitBowl

  repo create <name>       Create a new repository (--private)
  repo list                List your repositories
  repo clone <owner/repo>  Clone a repository locally

  pr create                Create a pull request (--title, --head, --base, --body)
  pr list                  List pull requests for a repository
  pr checkout <number>     Check out a pull request locally

  issue create             Create an issue (--title, --body)
  issue list               List issues for a repository

FLAGS:
  --host <url>             Override default GitBowl host
  --help, -h               Show help documentation
  --version, -v            Show version
`);
}

async function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (ans) => {
      rl.close();
      resolve(ans.trim());
    });
  });
}

function parseFlags(args) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      if (args[i + 1] && !args[i + 1].startsWith("--")) {
        flags[key] = args[++i];
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(a);
    }
  }
  return { flags, positional };
}

// -------------------------------------------------------------
// COMMAND HANDLERS
// -------------------------------------------------------------

async function handleAuth(subcommand, args) {
  const cfg = loadConfig();
  if (subcommand === "login") {
    console.log(
      "To authenticate with GitBowl, paste your Personal Access Token (starts with gbp_).",
    );
    console.log("You can generate one in Settings → Personal Access Tokens.\n");
    const token = await prompt("GitBowl Token: ");
    if (!token) return console.log("Aborted.");

    cfg.token = token;
    saveConfig(cfg);

    try {
      const user = await apiRequest("/api/v1/user");
      console.log(`✓ Logged in as @${user.login} (${user.name})`);
    } catch (e) {
      console.error(`✕ Authentication failed: ${e.message}`);
    }
    return;
  }

  if (subcommand === "status") {
    if (!cfg.token) {
      console.log("You are not logged in. Run 'bowl auth login' to authenticate.");
      return;
    }
    try {
      const user = await apiRequest("/api/v1/user");
      console.log(`✓ Authenticated as @${user.login} (${user.name})`);
      console.log(`  Host: ${cfg.host || DEFAULT_HOST}`);
    } catch (e) {
      console.log(`✕ Invalid or expired token: ${e.message}`);
    }
    return;
  }

  if (subcommand === "logout") {
    cfg.token = null;
    saveConfig(cfg);
    console.log("✓ Logged out successfully.");
    return;
  }

  console.log("Unknown auth command. See 'bowl --help'");
}

async function handleRepo(subcommand, args) {
  const { flags, positional } = parseFlags(args);

  if (subcommand === "create") {
    const name = positional[0] || (await prompt("Repository name: "));
    if (!name) return console.log("Repository name required.");

    const isPrivate = flags.private === true;
    console.log(`Creating repository ${name}...`);
    try {
      const repo = await apiRequest("/api/v1/user/repos", {
        method: "POST",
        body: { name, private: isPrivate, description: flags.description || "" },
      });
      console.log(`✓ Created repository: ${repo.html_url}`);
      console.log(`  Clone URL: ${repo.clone_url}`);
    } catch (e) {
      console.error(`✕ Error creating repository: ${e.message}`);
    }
    return;
  }

  if (subcommand === "list") {
    try {
      const repos = await apiRequest("/api/v1/user/repos");
      console.log(`\nYour Repositories (${repos.length}):\n`);
      for (const r of repos) {
        const vis = r.private ? "[private]" : "[public]";
        console.log(`  ${r.full_name.padEnd(35)} ${vis.padEnd(10)} ${r.html_url}`);
      }
      console.log("");
    } catch (e) {
      console.error(`✕ Error listing repositories: ${e.message}`);
    }
    return;
  }

  if (subcommand === "clone") {
    const target = positional[0];
    if (!target) return console.log("Usage: bowl repo clone <owner/repo>");
    const cfg = loadConfig();
    const host = cfg.host || DEFAULT_HOST;
    const cloneUrl = `${host}/${target}.git`;
    console.log(`Cloning into '${target}'...`);
    try {
      execSync(`git clone ${cloneUrl}`, { stdio: "inherit" });
    } catch (e) {
      console.error(`✕ Git clone failed: ${e.message}`);
    }
    return;
  }

  console.log("Unknown repo command. See 'bowl --help'");
}

async function handlePr(subcommand, args) {
  const { flags, positional } = parseFlags(args);

  // Guess repo from git remote or flag
  let repoPath = flags.repo;
  if (!repoPath) {
    try {
      const remote = execSync("git remote get-url origin", { encoding: "utf8" }).trim();
      const match = remote.match(/gitbowl\.dev[:/]([^/]+\/[^.]+)/);
      if (match) repoPath = match[1];
    } catch {
      // ignore
    }
  }

  if (!repoPath && subcommand !== "checkout") {
    repoPath = await prompt("Repository (owner/repo): ");
  }

  if (subcommand === "list") {
    try {
      const prs = await apiRequest(`/api/v1/repos/${repoPath}/pulls`);
      console.log(`\nPull Requests for ${repoPath} (${prs.length}):\n`);
      for (const p of prs) {
        console.log(`  #${p.number}  ${p.title}  (${p.head.ref} -> ${p.base.ref})`);
      }
      console.log("");
    } catch (e) {
      console.error(`✕ Error: ${e.message}`);
    }
    return;
  }

  if (subcommand === "create") {
    const title = flags.title || (await prompt("Title: "));
    const head = flags.head || (await prompt("Head branch: "));
    const base = flags.base || "main";
    const body = flags.body || "";

    try {
      const pr = await apiRequest(`/api/v1/repos/${repoPath}/pulls`, {
        method: "POST",
        body: { title, head, base, body },
      });
      console.log(`✓ Pull request #${pr.number} created: ${pr.html_url}`);
    } catch (e) {
      console.error(`✕ Error: ${e.message}`);
    }
    return;
  }

  if (subcommand === "checkout") {
    const prNumber = positional[0];
    if (!prNumber) return console.log("Usage: bowl pr checkout <number>");
    console.log(`Fetching and checking out PR #${prNumber}...`);
    try {
      execSync(`git fetch origin pull/${prNumber}/head:pr-${prNumber}`, { stdio: "inherit" });
      execSync(`git checkout pr-${prNumber}`, { stdio: "inherit" });
      console.log(`✓ Switched to branch pr-${prNumber}`);
    } catch (e) {
      console.error(`✕ Checkout failed: ${e.message}`);
    }
    return;
  }

  console.log("Unknown pr command. See 'bowl --help'");
}

async function handleIssue(subcommand, args) {
  const { flags } = parseFlags(args);
  let repoPath = flags.repo;
  if (!repoPath) {
    try {
      const remote = execSync("git remote get-url origin", { encoding: "utf8" }).trim();
      const match = remote.match(/gitbowl\.dev[:/]([^/]+\/[^.]+)/);
      if (match) repoPath = match[1];
    } catch {
      // ignore
    }
  }

  if (!repoPath) {
    repoPath = await prompt("Repository (owner/repo): ");
  }

  if (subcommand === "list") {
    try {
      const issues = await apiRequest(`/api/v1/repos/${repoPath}/issues`);
      console.log(`\nIssues for ${repoPath} (${issues.length}):\n`);
      for (const i of issues) {
        console.log(`  #${i.number}  ${i.title}  [${i.state}]`);
      }
      console.log("");
    } catch (e) {
      console.error(`✕ Error: ${e.message}`);
    }
    return;
  }

  if (subcommand === "create") {
    const title = flags.title || (await prompt("Issue title: "));
    const body = flags.body || "";
    try {
      const issue = await apiRequest(`/api/v1/repos/${repoPath}/issues`, {
        method: "POST",
        body: { title, body },
      });
      console.log(`✓ Issue #${issue.number} created: ${issue.html_url}`);
    } catch (e) {
      console.error(`✕ Error: ${e.message}`);
    }
    return;
  }

  console.log("Unknown issue command. See 'bowl --help'");
}

// -------------------------------------------------------------
// MAIN ENTRY
// -------------------------------------------------------------
const argv = process.argv.slice(2);
if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
  printUsage();
  process.exit(0);
}

if (argv.includes("--version") || argv.includes("-v")) {
  console.log("gitbowl-cli v1.0.0");
  process.exit(0);
}

const [cmd, subcmd, ...rest] = argv;

switch (cmd) {
  case "auth":
    await handleAuth(subcmd, rest);
    break;
  case "repo":
    await handleRepo(subcmd, rest);
    break;
  case "pr":
    await handlePr(subcmd, rest);
    break;
  case "issue":
    await handleIssue(subcmd, rest);
    break;
  default:
    console.error(`Unknown command: ${cmd}`);
    printUsage();
    process.exit(1);
}
