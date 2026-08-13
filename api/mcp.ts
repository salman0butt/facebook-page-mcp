import { timingSafeEqual } from 'node:crypto';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { config } from '../src/config.js';
import { createFacebookMcpServer } from '../src/mcp.js';

const mcpHandler = createMcpHandler(createFacebookMcpServer);

function secretsMatch(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);

  return (
    actualBytes.length === expectedBytes.length &&
    timingSafeEqual(actualBytes, expectedBytes)
  );
}

function isAuthorized(request: Request): boolean {
  const url = new URL(request.url);
  const pathSecret = url.searchParams.get('secret');
  const authorization = request.headers.get('authorization');
  const bearerSecret = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length).trim()
    : undefined;

  const suppliedSecret = bearerSecret || pathSecret || '';
  return secretsMatch(suppliedSecret, config.routeSecret);
}

function notFound(): Response {
  // Intentionally return 404 instead of revealing whether the MCP endpoint exists.
  return Response.json({ error: 'Not found' }, { status: 404 });
}

async function handle(request: Request): Promise<Response> {
  if (!isAuthorized(request)) return notFound();

  return mcpHandler.fetch(request);
}

export default {
  fetch: handle
};
