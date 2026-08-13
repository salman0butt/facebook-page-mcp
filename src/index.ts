import { createServer as createHttpServer } from 'node:http';
import { createMcpHandler } from '@modelcontextprotocol/server';
import {
  hostHeaderValidation,
  localhostHostValidation,
  localhostOriginValidation,
  originValidation,
  toNodeHandler
} from '@modelcontextprotocol/node';
import { config } from './config.js';
import { createFacebookMcpServer } from './mcp.js';

const mcpHandler = createMcpHandler(createFacebookMcpServer);
const nodeMcpHandler = toNodeHandler(mcpHandler, {
  onerror: (error) => console.error('MCP adapter error:', error)
});
const mcpPath = `/mcp/${encodeURIComponent(config.routeSecret)}`;

const validateHost = config.isLocalhostBinding
  ? localhostHostValidation()
  : hostHeaderValidation(config.allowedHosts);
const validateOrigin = config.isLocalhostBinding
  ? localhostOriginValidation()
  : originValidation(config.allowedOrigins);

const server = createHttpServer((req, res) => {
  let pathname: string;
  try {
    pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
  } catch {
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Bad request URL' }));
    return;
  }

  if (pathname === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        ok: true,
        dryRun: config.dryRun,
        graphApiVersion: config.graphApiVersion
      })
    );
    return;
  }

  if (pathname !== mcpPath) {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  // MCP SDK v2's bare Node handler does not validate Host or Origin itself.
  // These guards protect localhost from DNS rebinding and constrain public binds.
  if (!validateHost(req, res) || !validateOrigin(req, res)) return;

  void nodeMcpHandler(req, res).catch((error) => {
    console.error('Unhandled MCP request error:', error);
    if (!res.headersSent) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    } else if (!res.writableEnded) {
      res.end();
    }
  });
});

server.on('clientError', (error, socket) => {
  console.error('HTTP client error:', error.message);
  if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});

server.listen(config.port, config.host, () => {
  console.error(`Facebook Page MCP listening on http://${config.host}:${config.port}/mcp/<redacted>`);
  console.error(`Health: http://${config.host}:${config.port}/health`);
  console.error(`Facebook Graph API: ${config.graphApiVersion}`);
  console.error(`DRY_RUN=${config.dryRun}`);
});

let shuttingDown = false;
async function shutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  try {
    await mcpHandler.close();
  } finally {
    server.close(() => process.exit(0));
  }
}

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
