# Facebook Page MCP (TypeScript)

A remote Model Context Protocol (MCP) server that lets an MCP client publish **organic Facebook Page posts** through the official Meta Graph API.

It currently exposes three tools:

- `facebook_get_page_info` — verifies the configured Page token and returns Page information.
- `facebook_publish_text_post` — publishes a text-only Facebook Page post.
- `facebook_publish_photo_post` — publishes one Facebook Page photo with an optional caption.

The server is written in TypeScript and targets the MCP TypeScript SDK v2 architecture. It uses Facebook Graph API `v26.0` by default.

## Important safety defaults

The server starts with `DRY_RUN=true` in the example configuration. That means publishing tools return the endpoint they would use without creating a real Facebook post. The read-only `facebook_get_page_info` tool still performs a real Graph API request so you can verify your credentials safely.

The MCP endpoint is protected by a long route secret for a personal MVP. For a shared or production ChatGPT integration, use OAuth 2.1 rather than relying on a secret URL alone.

## Requirements

- Node.js 20 or newer
- A Meta app with Facebook Login / Pages access configured
- A Facebook Page you manage
- A Page access token that can publish to the Page
- A remote HTTPS URL if you want to connect this MCP server to ChatGPT

## Facebook permissions

Your Meta access flow generally needs Page permissions appropriate for reading Page details and publishing Page content, including:

- `pages_show_list`
- `pages_read_engagement`
- `pages_manage_posts`

Meta may require App Review / Advanced Access before users outside app roles can grant these permissions. The exact requirements depend on your app mode, account, Page, and Meta product configuration.

## 1. Install

```bash
npm install
```

## 2. Configure

Copy the example environment file:

```bash
cp .env.example .env
```

Then edit `.env`:

```env
FB_PAGE_ID=123456789012345
FB_PAGE_ACCESS_TOKEN=EAAB...
FB_GRAPH_API_VERSION=v26.0

# Optional: enable if your Meta app requires appsecret_proof.
FB_APP_SECRET=
FB_REQUEST_TIMEOUT_MS=20000

HOST=127.0.0.1
PORT=3000

# Required only when binding to a non-localhost interface.
MCP_ALLOWED_HOSTS=
MCP_ALLOWED_ORIGINS=

MCP_ROUTE_SECRET=replace-with-a-long-random-secret-value
DRY_RUN=true
```

Generate a strong route secret:

```bash
openssl rand -hex 32
```

Never commit your real `.env` file. It is excluded by `.gitignore`.

## 3. Run locally

Development mode:

```bash
npm run start:dev
```

Or build and run the compiled server:

```bash
npm run build
npm start
```

The endpoints are:

```text
GET  http://127.0.0.1:3000/health
MCP  http://127.0.0.1:3000/mcp/<MCP_ROUTE_SECRET>
```

The server never prints your route secret to the console.

## 4. Verify the Page connection

Call the MCP tool:

```text
facebook_get_page_info
```

Unlike the publishing tools, this performs a real read even while `DRY_RUN=true`. A successful response proves the configured Page ID/token can read the Page.

Example structured output:

```json
{
  "id": "123456789012345",
  "name": "My Facebook Page",
  "link": "https://www.facebook.com/...",
  "graphApiVersion": "v26.0",
  "dryRunWrites": true
}
```

## 5. Test a text post safely

Keep:

```env
DRY_RUN=true
```

Then call:

```text
facebook_publish_text_post
```

Input:

```json
{
  "message": "Test post from my MCP server"
}
```

You should receive `dryRun: true` and no Facebook post is created.

When you are intentionally ready to publish:

```env
DRY_RUN=false
```

Restart the process and call the same tool again.

## 6. Publish a photo

`facebook_publish_photo_post` accepts **exactly one** of three image sources.

### A. ChatGPT / MCP file input

This is the preferred option when a user attaches or generates an image in ChatGPT.

The tool declares OpenAI's MCP file-input metadata:

```json
{
  "openai/fileParams": ["image"]
}
```

The input object supports the current ChatGPT file contract:

```json
{
  "caption": "Happy Independence Day Pakistan 🇵🇰",
  "image": {
    "download_url": "https://...",
    "file_id": "...",
    "mime_type": "image/png",
    "file_name": "14-august.png"
  }
}
```

ChatGPT supplies that object when it passes a compatible attached/generated file to the MCP tool. The server sends the HTTPS `download_url` to Facebook's `/photos` endpoint.

### B. Public HTTPS image URL

```json
{
  "caption": "New arrival ✨",
  "imageUrl": "https://example.com/chandelier.jpg"
}
```

### C. Base64 image

```json
{
  "caption": "New arrival ✨",
  "imageBase64": "iVBORw0KGgoAAA...",
  "filename": "chandelier.png",
  "mimeType": "image/png"
}
```

A `data:image/...;base64,...` prefix is also accepted.

The server accepts JPEG, PNG, GIF, BMP, and TIFF MIME types for uploaded Base64 files.

## Tool outputs

The tools return both text content and MCP `structuredContent`, with explicit output schemas. Publishing output includes:

```json
{
  "dryRun": false,
  "kind": "photo",
  "pageId": "123456789012345",
  "graphApiVersion": "v26.0",
  "endpoint": "https://graph.facebook.com/v26.0/123456789012345/photos",
  "postId": "...",
  "photoId": "..."
}
```

Meta does not always return every identifier for every response shape, so `postId` and `photoId` are optional.

## `appsecret_proof`

If your Meta app requires App Secret Proof, put the app secret in:

```env
FB_APP_SECRET=your-meta-app-secret
```

The server computes `appsecret_proof` using HMAC-SHA256 over the Page access token and attaches it to Graph API requests. It never exposes that proof in MCP tool output.

Keep the app secret server-side only.

## HTTP / DNS-rebinding protection

The MCP SDK's bare Node handler does not automatically validate incoming `Host` and `Origin` headers.

For local development the default is:

```env
HOST=127.0.0.1
```

and the server uses localhost Host/Origin validation.

If you intentionally bind publicly, for example:

```env
HOST=0.0.0.0
MCP_ALLOWED_HOSTS=mcp.example.com
MCP_ALLOWED_ORIGINS=chatgpt.com
```

`MCP_ALLOWED_HOSTS` becomes mandatory. Values are comma-separated hostnames without schemes or ports.

If `MCP_ALLOWED_ORIGINS` is omitted on a public bind, the server reuses `MCP_ALLOWED_HOSTS`.

In production, terminate HTTPS at a reverse proxy or managed hosting platform and forward traffic to the MCP process.

## Docker

Build and start:

```bash
docker compose up --build
```

The Compose file binds the Node server to `0.0.0.0` **inside the container** so Docker can publish port `3000`, while the MCP Host/Origin allowlists still restrict accepted requests.

For a real deployment set the public hostname explicitly, for example:

```env
MCP_ALLOWED_HOSTS=mcp.example.com
MCP_ALLOWED_ORIGINS=chatgpt.com
```

## MCP Inspector

You can test the remote HTTP endpoint with MCP Inspector or another MCP client before connecting it to ChatGPT.

Run the server first, then point your client at:

```text
http://127.0.0.1:3000/mcp/<MCP_ROUTE_SECRET>
```

Keep `DRY_RUN=true` while validating the schema and tool calls.

## ChatGPT deployment architecture

ChatGPT requires a reachable remote MCP endpoint for this type of integration. A typical deployment is:

```text
ChatGPT
  ↓ HTTPS
Remote MCP server
  ↓
Facebook Graph API
  ↓
Facebook Page
```

Do not expose a `localhost` endpoint directly to ChatGPT. Deploy behind HTTPS on a service such as Cloud Run, Fly.io, Render, Railway, AWS, Azure, or your own server.

For production write actions, add OAuth 2.1 authentication/authorization rather than treating the route secret as the long-term security boundary.

## Build checks

```bash
npm run typecheck
npm run build
```

## Project structure

```text
facebook-page-mcp/
├── src/
│   ├── config.ts       # Environment parsing and server security settings
│   ├── facebook.ts     # Facebook Graph API client
│   ├── mcp.ts          # MCP tool schemas and handlers
│   └── index.ts        # Remote HTTP transport
├── .env.example
├── .gitignore
├── Dockerfile
├── docker-compose.yml
├── package.json
├── tsconfig.json
└── README.md
```

## Notes about retries

Publishing calls are not automatically retried. A timeout can occur after Facebook has already accepted a post, so blind automatic retries could create duplicate posts. If a publish request fails ambiguously, verify the Page before manually retrying.

## Security checklist

Before a real deployment:

- Keep `FB_PAGE_ACCESS_TOKEN`, `FB_APP_SECRET`, and `MCP_ROUTE_SECRET` outside source control.
- Use HTTPS.
- Restrict Host and Origin values.
- Prefer OAuth 2.1 for shared/production ChatGPT access.
- Keep `DRY_RUN=true` until the Page connection has been verified.
- Rotate Page tokens when appropriate.
- Do not log Graph API authorization headers or secrets.
- Treat posting tools as non-idempotent public write actions.
