/**
 * High-performance SEO & Schema.org JSON-LD Structured Data for GitBowl
 * Domain: https://gitbowl.zone.id/
 * Contact: mail.gitbowl@gmail.com
 */

export const GITBOWL_KEYWORDS = [
  // Primary Brand & Category
  "GitBowl",
  "GitBowl Cloud",
  "GitBowl code hosting",
  "GitBowl git server",
  "gitbowl.zone.id",
  "https://gitbowl.zone.id/",
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
  "git clone https",
  "git clone gitbowl",
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
  "developer cloud hosting",
].join(", ");

export const SCHEMA_ORGANIZATION = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": "https://gitbowl.zone.id/#organization",
  name: "GitBowl",
  url: "https://gitbowl.zone.id/",
  logo: {
    "@type": "ImageObject",
    url: "https://gitbowl.zone.id/gitbowl-app-icon-512.png",
    width: 512,
    height: 512,
  },
  email: "mail.gitbowl@gmail.com",
  sameAs: ["https://github.com", "https://twitter.com/gitbowl", "https://gitbowl.zone.id/"],
  slogan: "Your code, in a bowl.",
  founder: {
    "@type": "Person",
    name: "Ahmed Zarir",
  },
  contactPoint: [
    {
      "@type": "ContactPoint",
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
  "@id": "https://gitbowl.zone.id/#webapp",
  name: "GitBowl",
  alternateName: ["GitBowl Cloud", "GitBowl Version Control", "Git Bowl", "GitBowl Code Platform"],
  url: "https://gitbowl.zone.id/",
  applicationCategory: "DeveloperApplication",
  operatingSystem: "All, Linux, macOS, Windows, Android, iOS",
  softwareVersion: "2.5.0",
  description:
    "High-performance Git repository hosting platform. Host, share, edit, and collaborate on code with Smart-HTTP protocol, private repos, in-browser editor, and 1-click GitHub migration.",
  browserRequirements: "Requires modern web browser supporting JavaScript and HTML5",
  screenshot: "https://gitbowl.zone.id/og-image.png",
  image: "https://gitbowl.zone.id/og-image.png",
  author: {
    "@type": "Organization",
    name: "GitBowl",
    email: "mail.gitbowl@gmail.com",
    url: "https://gitbowl.zone.id/",
  },
  aggregateRating: {
    "@type": "AggregateRating",
    ratingValue: "4.9",
    ratingCount: "284",
    reviewCount: "284",
    bestRating: "5",
    worstRating: "1",
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
    "Instant 1-Click GitHub Repository Importer & Cloner",
    "Unlimited Free Public & Private Code Repositories",
    "Built-in Web Code Editor with Syntax Highlighting",
    "Git Personal Access Tokens (PAT) Authentication",
    "Google and GitHub One-Click Developer Authentication",
    "Interactive Commit Graph and Branch Explorer",
    "Issues and Community Bug Tracking",
    "Full Markdown and Code Highlighting",
    "Fast Worldwide Edge Latency with SSL Encryption",
    "Direct Zip File Code Upload and Extraction",
  ],
};

export const SCHEMA_WEBSITE = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": "https://gitbowl.zone.id/#website",
  url: "https://gitbowl.zone.id/",
  name: "GitBowl",
  publisher: {
    "@id": "https://gitbowl.zone.id/#organization",
  },
  potentialAction: {
    "@type": "SearchAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: "https://gitbowl.zone.id/explore?q={search_term_string}",
    },
    "query-input": "required name=search_term_string",
  },
};

export const SCHEMA_BREADCRUMBS = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    {
      "@type": "ListItem",
      position: 1,
      name: "Home",
      item: "https://gitbowl.zone.id/",
    },
    {
      "@type": "ListItem",
      position: 2,
      name: "Explore Repositories",
      item: "https://gitbowl.zone.id/explore",
    },
    {
      "@type": "ListItem",
      position: 3,
      name: "Documentation & Guides",
      item: "https://gitbowl.zone.id/docs",
    },
  ],
};

export const SCHEMA_FAQ = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is GitBowl and how does it compare to GitHub?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "GitBowl is a modern, ultra-fast Git code hosting platform designed for speed, simplicity, and zero bloat. It provides unlimited public and private repositories, standard Git Smart-HTTP operations (git clone, push, pull), an in-browser code editor, and instant 1-click GitHub repository import without complicated setups.",
      },
    },
    {
      "@type": "Question",
      name: "How do I clone a GitBowl repository to my local computer?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Run standard git clone in your terminal: 'git clone https://gitbowl.zone.id/{owner}/{repository}.git'. When prompted for credentials, enter your GitBowl username and your Personal Access Token (PAT) generated in your Profile Settings.",
      },
    },
    {
      "@type": "Question",
      name: "How do I push code to GitBowl using the Git CLI?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "In your project folder, add GitBowl as a remote: 'git remote add origin https://gitbowl.zone.id/{username}/{repo}.git' and push your branch: 'git push -u origin main'. Authenticate using your Personal Access Token as the password.",
      },
    },
    {
      "@type": "Question",
      name: "Is GitBowl free for public and private repositories?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes, GitBowl provides completely free hosting for both private and public code repositories with unlimited commits, branches, issues, and file uploads.",
      },
    },
    {
      "@type": "Question",
      name: "Can I import repositories directly from GitHub to GitBowl?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes! GitBowl features built-in 1-click GitHub repository import. Simply sign in with GitHub or enter any public repository URL, and GitBowl will automatically stream and import all files, directory trees, and initial commit history into your new GitBowl repository with adaptive chunking.",
      },
    },
    {
      "@type": "Question",
      name: "How do I create a Personal Access Token (PAT) for Git authentication?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Log in to GitBowl, navigate to Settings > Access Tokens, enter a token name, select your desired expiration, and click 'Generate Token'. Use this token as your password for command-line Git operations like clone, fetch, and push.",
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
