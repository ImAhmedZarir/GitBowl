/**
 * High-performance SEO & Schema.org JSON-LD Structured Data for GitBowl
 * Domain: http://gitbowl.zone.id/
 * Contact: mail.gitbowl@gmail.com
 */

export const GITBOWL_KEYWORDS = [
  // Primary Brand & Category
  "GitBowl",
  "GitBowl Cloud",
  "GitBowl code hosting",
  "GitBowl git server",
  "gitbowl.zone.id",
  "Git repository hosting",
  "Git cloud platform",
  "source code hosting",
  "version control platform",
  "developer code hub",
  "open source code sharing",
  "lightweight git hosting",
  "fast git hosting",
  "modern GitHub alternative",
  "free private git repositories",
  "unlimited public repositories",

  // Core Git Operations & Protocol
  "smart-http git protocol",
  "git clone http",
  "git push main",
  "git pull origin",
  "git commit history",
  "git branch management",
  "git diff viewer",
  "git log graph",
  "git tree navigation",
  "git tag management",
  "git personal access token",
  "git PAT credentials",
  "git remote add origin",
  "git status online",
  "git merge pull request",
  "git rebase online",
  "git cherry-pick",
  "git checkout branch",
  "git fetch remote",

  // GitHub Alternative & Migration
  "GitHub alternative",
  "GitLab alternative",
  "Bitbucket alternative",
  "Gitea alternative",
  "Forgejo alternative",
  "Sourcehut alternative",
  "import repository from GitHub",
  "GitHub repo importer",
  "migrate GitHub to GitBowl",
  "1-click GitHub import",
  "sync GitHub repositories",
  "import private GitHub repo",
  "GitHub OAuth login",
  "GitHub developer integration",

  // Web Code Editor & Developer Experience
  "online code editor",
  "web-based IDE",
  "in-browser git editor",
  "Monaco code editor",
  "syntax highlighting online",
  "markdown README previewer",
  "code search engine",
  "live code editing",
  "zip file repository upload",
  "drag and drop code upload",
  "binary file viewer",
  "commit changes online",
  "fork repository online",
  "star repositories",

  // Authentication & Security
  "Google developer login",
  "Firebase Google authentication",
  "GitHub OAuth single sign-on",
  "Row Level Security git",
  "secure code storage",
  "encrypted source code cloud",
  "enterprise code security",
  "two-factor authentication git",
  "developer access tokens",
  "GDPR compliant code hosting",

  // Programming Languages & Frameworks
  "JavaScript repository hosting",
  "TypeScript code hosting",
  "Python git repository",
  "Go golang git repository",
  "Rust cargo repository",
  "Java Spring git hosting",
  "C++ source code repository",
  "PHP Laravel git hosting",
  "Ruby on Rails git hosting",
  "React component repository",
  "Next.js project repository",
  "Vue.js code repository",
  "Svelte repository hosting",
  "HTML CSS web projects",
  "Tailwind CSS code repository",
  "Docker container code repository",
  "Kubernetes manifests hosting",

  // Developer Community & Use Cases
  "software development collaboration",
  "indie hacker code hosting",
  "startup git repository",
  "student developer portfolio",
  "open source contributor hub",
  "code snippet storage",
  "engineering team git platform",
  "issue tracker bug tracking",
  "developer issue discussions",
  "project management for developers",
  "fast git clone latency",
  "Bangladeshi developer platform",
  "zone.id code platform",
  "developer cloud hosting",
].join(", ");

export const SCHEMA_ORGANIZATION = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": "http://gitbowl.zone.id/#organization",
  name: "GitBowl",
  url: "http://gitbowl.zone.id/",
  logo: {
    "@type": "ImageObject",
    url: "http://gitbowl.zone.id/gitbowl-app-icon-512.png",
    width: 512,
    height: 512,
  },
  email: "mail.gitbowl@gmail.com",
  sameAs: ["https://github.com", "https://twitter.com/gitbowl"],
  contactPoint: [
    {
      "@type": "ContactPoint",
      telephone: "+1-000-000-0000",
      contactType: "technical support",
      email: "mail.gitbowl@gmail.com",
      availableLanguage: ["English", "Bengali"],
      areaServed: "Worldwide",
    },
  ],
  description:
    "GitBowl is a high-performance Git code hosting platform featuring Smart-HTTP protocol, private and public repositories, web code editing, and seamless GitHub import.",
};

export const SCHEMA_WEBAPPLICATION = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "@id": "http://gitbowl.zone.id/#webapp",
  name: "GitBowl",
  alternateName: ["GitBowl Cloud", "GitBowl Version Control", "Git Bowl"],
  url: "http://gitbowl.zone.id/",
  applicationCategory: "DeveloperApplication",
  operatingSystem: "All, Linux, macOS, Windows, Android, iOS",
  softwareVersion: "2.4.0",
  description:
    "High-performance Git repository hosting platform. Host, share, edit, and collaborate on code with Smart-HTTP protocol, private repos, in-browser editor, and 1-click GitHub migration.",
  browserRequirements: "Requires modern web browser supporting JavaScript and HTML5",
  screenshot: "http://gitbowl.zone.id/og-image.png",
  image: "http://gitbowl.zone.id/og-image.png",
  author: {
    "@type": "Organization",
    name: "GitBowl",
    email: "mail.gitbowl@gmail.com",
    url: "http://gitbowl.zone.id/",
  },
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
    category: "Free",
    availability: "https://schema.org/InStock",
  },
  featureList: [
    "Git Smart-HTTP Protocol (git clone, git push, git pull)",
    "Instant 1-Click GitHub Repository Importer",
    "Unlimited Free Public & Private Code Repositories",
    "Built-in Web Code Editor with Syntax Highlighting",
    "Git Personal Access Tokens (PAT) Authentication",
    "Google and GitHub One-Click Developer Authentication",
    "Interactive Commit Graph and Branch Explorer",
    "Issues and Community Bug Tracking",
    "Full Markdown and Code Highlighting",
    "Fast Worldwide Edge Latency with SSL Encryption",
  ],
};

export const SCHEMA_WEBSITE = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": "http://gitbowl.zone.id/#website",
  url: "http://gitbowl.zone.id/",
  name: "GitBowl",
  publisher: {
    "@id": "http://gitbowl.zone.id/#organization",
  },
  potentialAction: {
    "@type": "SearchAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: "http://gitbowl.zone.id/explore?q={search_term_string}",
    },
    "query-input": "required name=search_term_string",
  },
};

export const SCHEMA_FAQ = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is GitBowl?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "GitBowl is a modern, lightweight Git repository hosting platform. It allows software developers to create public and private repositories, push and clone code via standard Git Smart-HTTP protocol, edit code directly in the web browser, and import projects seamlessly from GitHub.",
      },
    },
    {
      "@type": "Question",
      name: "How do I push code to GitBowl using the Git CLI?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Developers can push to GitBowl using standard git commands: run 'git remote add origin http://gitbowl.zone.id/api/public/git/{username}/{repo}.git' and then 'git push -u origin main'. Authenticate with your username and Personal Access Token (PAT) created in your GitBowl profile settings.",
      },
    },
    {
      "@type": "Question",
      name: "Is GitBowl free for public and private repositories?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes, GitBowl provides free hosting for both private and public code repositories with unlimited commits, branches, issues, and file uploads.",
      },
    },
    {
      "@type": "Question",
      name: "Can I import repositories directly from GitHub to GitBowl?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes! GitBowl features built-in 1-click GitHub repository import. Simply sign in with GitHub or enter any public repository URL, and GitBowl will automatically stream and import all files, directory trees, and initial commit history into your new GitBowl repository.",
      },
    },
    {
      "@type": "Question",
      name: "What security measures does GitBowl use to protect source code?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "GitBowl uses PostgreSQL Row Level Security (RLS) to enforce strict tenant isolation. All data in transit is encrypted using TLS 1.3. Developer personal access tokens are stored using irreversible cryptographic hashes.",
      },
    },
    {
      "@type": "Question",
      name: "How can I contact GitBowl support or developers?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "You can reach the official GitBowl technical and customer support team by emailing mail.gitbowl@gmail.com.",
      },
    },
  ],
};
