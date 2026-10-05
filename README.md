# GitBowl: Cloud Git Hosting & Collaborative Coding

A high-performance Git provider built with TanStack Start, React 19, Tailwind CSS, Supabase, and Monaco Editor.

**Live app**: https://gitbowl.lovable.app

## Security Notice: Key Rotation & Hygiene

1. **Service Account Key Revocation**:
   Any previously committed Google service account key (with private_key_id starting with `9f9c0d...`) has been permanently deleted from the repository. The key must be revoked in the Google Cloud Console (IAM & Admin -> Service Accounts -> Keys).
2. **Environment Variables**:
   Credentials must **never** be checked into the source tree. Store them exclusively via environment variables:
   - `GDRIVE_CLIENT_EMAIL`: Service account email address
   - `GDRIVE_PRIVATE_KEY`: Service account private key (with `\n` linebreaks preserved)
   - `GDRIVE_ROOT_FOLDER_ID`: Shared Drive or Root Folder ID
   - `ADMIN_EMAILS`: Comma-separated list of whitelisted admin emails (e.g. `ahmedzarir07@gmail.com`)
   - `GITHUB_WEBHOOK_SECRET`: Secret token used for GitHub webhook HMAC-SHA256 signature verification

## Development

```sh
git clone <this-repository-url>
cd gitbowl
npm install
npm run dev
```

## Running Acceptance Tests

```sh
npm test
```
