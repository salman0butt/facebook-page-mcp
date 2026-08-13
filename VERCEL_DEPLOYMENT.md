# Deploy Facebook Page MCP on Vercel

This project includes a Vercel Function entry point at `api/mcp.ts` and a health endpoint at `api/health.ts`.

The public MCP URL keeps the same route-secret shape used by the local server:

```text
https://YOUR-PROJECT.vercel.app/mcp/YOUR_MCP_ROUTE_SECRET
```

`vercel.json` rewrites that URL internally to the serverless Function at `/api/mcp`.

## Important: Vercel Hobby usage

Vercel Hobby is intended for personal, non-commercial projects. If this deployment is used for a business, client, paid service, or other commercial purpose, use a Vercel plan that permits commercial usage.

The project config uses a 60-second maximum duration for the MCP Function to stay within the documented Hobby-plan maximum.

## 1. Repository

Use this repository:

```text
https://github.com/salman0butt/facebook-page-mcp
```

The deployment-specific files are:

```text
api/mcp.ts
api/health.ts
vercel.json
```

Do not commit `.env` or real Facebook credentials.

## 2. Create/import the Vercel project

1. Sign in to Vercel with the GitHub account that can access the repository.
2. In the Vercel dashboard, choose **Add New → Project**.
3. Import `salman0butt/facebook-page-mcp`.
4. Keep the framework preset as **Other** if Vercel does not detect a framework.
5. Keep the repository root as `./`.
6. Do not set an Output Directory.
7. The repository's `vercel.json` already sets the build command to:

```text
npm run typecheck
```

8. Before clicking Deploy, add the environment variables below.

## 3. Required Vercel environment variables

Add these under **Project → Settings → Environment Variables**.

### Required

```env
FB_PAGE_ID=YOUR_NUMERIC_FACEBOOK_PAGE_ID
FB_PAGE_ACCESS_TOKEN=YOUR_PAGE_ACCESS_TOKEN
FB_GRAPH_API_VERSION=v26.0
FB_REQUEST_TIMEOUT_MS=20000
MCP_ROUTE_SECRET=YOUR_LONG_RANDOM_SECRET
DRY_RUN=true
```

Generate the MCP route secret locally with:

```bash
openssl rand -hex 32
```

Use the generated value exactly as `MCP_ROUTE_SECRET`.

### Optional

If your Meta app requires `appsecret_proof`, also add:

```env
FB_APP_SECRET=YOUR_META_APP_SECRET
```

### Not required on Vercel

The following variables are only for the standalone local/Docker HTTP server and can be omitted from Vercel:

```text
HOST
PORT
MCP_ALLOWED_HOSTS
MCP_ALLOWED_ORIGINS
```

Apply the required secrets to **Production**. If you want Preview deployments to work too, also select **Preview** when adding the variables.

Never put Facebook tokens or app secrets in `vercel.json` or GitHub.

## 4. First deployment

Click **Deploy**.

Vercel will install the dependencies and run:

```bash
npm run typecheck
```

The API files under `/api` are then deployed as Vercel Functions.

After deployment, Vercel gives you a production domain similar to:

```text
https://facebook-page-mcp.vercel.app
```

Your actual generated project name may be different.

## 5. Check the health endpoint

Open:

```text
https://YOUR-PROJECT.vercel.app/health
```

Expected response:

```json
{
  "ok": true,
  "runtime": "vercel-function",
  "dryRun": true,
  "graphApiVersion": "v26.0"
}
```

If this endpoint returns a Function error, first check that every required environment variable exists in Vercel.

Environment-variable changes only affect new deployments, so redeploy after changing them.

## 6. Your remote MCP URL

The MCP URL is:

```text
https://YOUR-PROJECT.vercel.app/mcp/YOUR_MCP_ROUTE_SECRET
```

Example:

```text
https://facebook-page-mcp.vercel.app/mcp/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
```

Do not publish or share this URL because the final path segment acts as the temporary authentication secret.

The Vercel Function also accepts the same secret as:

```http
Authorization: Bearer YOUR_MCP_ROUTE_SECRET
```

for clients that support custom Bearer authentication.

For a shared or production integration, replace the route secret with proper OAuth rather than treating the secret URL as the long-term security boundary.

## 7. Test without publishing anything

Keep:

```env
DRY_RUN=true
```

Connect an MCP client to the remote MCP URL and call:

```text
facebook_get_page_info
```

This is a real read-only Facebook Graph API request, so it verifies your Page ID and access token.

Then call:

```text
facebook_publish_text_post
```

with a test message. Because `DRY_RUN=true`, it should return a dry-run response without creating a Facebook post.

## 8. Enable real Facebook publishing

Only after the read and dry-run tests succeed:

1. Open **Vercel → Project → Settings → Environment Variables**.
2. Change:

```env
DRY_RUN=false
```

3. Redeploy the project.
4. Call the publishing tool again.

A change to a Vercel environment variable does not modify an already-created deployment; you must redeploy for the new value to be used.

## 9. Photo posting on Vercel

Preferred image inputs are:

1. ChatGPT/MCP file input (`image`)
2. Public HTTPS image URL (`imageUrl`)
3. Base64 (`imageBase64`) only for small images

Vercel Functions have a request/response payload limit of 4.5 MB. Base64 increases the size of binary data, so large images should not be sent as `imageBase64` through the MCP request.

When using ChatGPT's MCP file input, only the file metadata/download URL is sent in the MCP request, which avoids embedding the image bytes in the Vercel request body.

## 10. Automatic deployments from GitHub

Once the Vercel project is connected to the repository:

- pushes to the production branch trigger production deployments according to your Vercel Git settings;
- other branches can create Preview deployments;
- environment variables can be configured separately for Production and Preview.

Keep secrets in Vercel and source code in GitHub.

## 11. Optional Vercel CLI workflow

Install the CLI:

```bash
npm install -g vercel
```

From the repository:

```bash
vercel login
vercel link
vercel env ls production
vercel dev
vercel deploy
vercel deploy --prod
```

For local Vercel emulation, add the required environment variables to the linked Vercel project and use `vercel env pull` or `vercel env run` rather than committing a secrets file.

## 12. Troubleshooting

### Deployment fails during `npm run typecheck`

Run locally:

```bash
npm install
npm run typecheck
```

Fix the TypeScript error, push to GitHub, and let Vercel redeploy.

### `/health` returns 500

Check the Vercel Function logs and confirm:

```text
FB_PAGE_ID
FB_PAGE_ACCESS_TOKEN
MCP_ROUTE_SECRET
```

are present.

### MCP URL returns 404

Make sure the final route segment is exactly the value of `MCP_ROUTE_SECRET`.

A wrong or missing secret intentionally returns `404 Not found` so the endpoint does not reveal its authentication behavior.

### Facebook Page read fails

Check the Page ID, Page access token, token expiry, Page access, and the Meta permissions required by your app/page setup.

### Publishing tool says `dryRun: true`

Set `DRY_RUN=false` in Vercel and redeploy.

### Image/Base64 request returns 413

The MCP request exceeded Vercel's Function payload limit. Use ChatGPT file input or an HTTPS image URL instead of Base64.

## Deployment architecture

```text
ChatGPT / MCP client
        |
        | HTTPS Streamable HTTP
        v
Vercel rewrite: /mcp/<secret>
        |
        v
Vercel Function: /api/mcp
        |
        | Meta Graph API v26.0
        v
Facebook Page
```

The MCP transport is stateless, which fits Vercel Functions well and does not require a persistent Node server or Redis for this project's current tools.
