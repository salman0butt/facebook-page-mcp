# Code Review / Compatibility Audit

Reviewed: 2026-08-13

## Target compatibility

- Meta Graph API: v26.0
- MCP TypeScript SDK: v2 split packages (`@modelcontextprotocol/server`, `@modelcontextprotocol/node`)
- MCP protocol line supported by SDK v2: 2026-07-28
- OpenAI/ChatGPT MCP file inputs: `_meta["openai/fileParams"]`
- Node.js: 20+

## Bugs/issues corrected

1. Added Host + Origin validation for the bare `node:http` MCP handler.
2. Changed local default bind from `0.0.0.0` to `127.0.0.1`.
3. Public bind now requires `MCP_ALLOWED_HOSTS`.
4. Removed the remote tool's arbitrary `imagePath` filesystem read.
5. Added ChatGPT-native file input schema for attached/generated images.
6. Fixed `DRY_RUN` so Page-info reads actually verify credentials while writes remain blocked.
7. Fixed optional blank `FB_APP_SECRET=` startup validation.
8. Added optional Meta `appsecret_proof` support.
9. Added Graph API request timeout handling.
10. Added richer Meta Graph error details.
11. Preserved Page post ID / photo ID returned by Meta.
12. Added Base64 validation and supported image MIME checks.
13. Added structured MCP output and output schemas.
14. Added Node adapter rejection/error handling.
15. Removed route-secret logging.
16. Prevented `appsecret_proof` from appearing in tool-returned endpoint strings.
17. Kept current Meta Page Photo `caption` parameter (older `message`/`name` are deprecated).
18. Added a real production TypeScript build (`dist/`).
19. Avoided automatic retry of non-idempotent publish calls to reduce duplicate-post risk.

## Static verification performed in this environment

- TypeScript syntax transpilation: PASS for all `src/*.ts` files.
- `package.json` parse: PASS.
- `tsconfig.json` parse: PASS.
- Graph API default version check: PASS (`v26.0`).
- MCP SDK v2 package check: PASS.
- No `imagePath` / `readFile` exposure: PASS.
- OpenAI `openai/fileParams` file schema fields present: PASS.
- Host/Origin validation present: PASS.
- `structuredContent` + output schemas present: PASS.
- `appsecret_proof` support present and not returned in endpoint output: PASS.
- `DRY_RUN` Page-info behavior: PASS by source inspection.
- Route secret not logged at startup: PASS.

## Environment limitation

A full dependency-backed `npm install && npm run typecheck` could not be completed in the review sandbox because package installation timed out. This is an environment/network limitation, not a passing type-check claim. Run these locally after extracting:

```bash
npm install
npm run typecheck
npm start
```

Then keep `DRY_RUN=true` and call `facebook_get_page_info` followed by dry-run text/photo tool calls before enabling real writes.

## Known design limitations (intentional)

- Route-secret protection is an MVP mechanism; use OAuth 2.1 for a shared/production ChatGPT integration.
- One photo per photo tool call; no carousel/video/reel tools in this project.
- No automatic publish retry because the operation is non-idempotent and a retry can duplicate a post.
- The server uses Meta Pages Graph API for organic posting; Meta's separately hosted MCP products are a different integration surface.
