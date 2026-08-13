import 'dotenv/config';
import { z } from 'zod/v4';

const optionalNonEmptyString = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).optional()
);

const csvList = z
  .string()
  .optional()
  .transform((value) =>
    value
      ? value
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
      : []
  );

const schema = z.object({
  FB_PAGE_ID: z.string().regex(/^\d+$/, 'FB_PAGE_ID must be a numeric Facebook Page ID.'),
  FB_PAGE_ACCESS_TOKEN: z.string().min(1),
  FB_APP_SECRET: optionalNonEmptyString,
  FB_GRAPH_API_VERSION: z.string().regex(/^v\d+\.\d+$/).default('v26.0'),
  FB_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(20000),
  PORT: z.coerce.number().int().positive().max(65535).default(3000),
  HOST: z.string().default('127.0.0.1'),
  MCP_ROUTE_SECRET: z.string().min(24),
  MCP_ALLOWED_HOSTS: csvList,
  MCP_ALLOWED_ORIGINS: csvList,
  DRY_RUN: z.enum(['true', 'false']).default('true')
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const localhostBindings = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const isLocalhostBinding = localhostBindings.has(parsed.data.HOST);

if (!isLocalhostBinding && parsed.data.MCP_ALLOWED_HOSTS.length === 0) {
  console.error(
    'MCP_ALLOWED_HOSTS is required when HOST is not a localhost address. Example: MCP_ALLOWED_HOSTS=mcp.example.com'
  );
  process.exit(1);
}

const allowedOrigins =
  parsed.data.MCP_ALLOWED_ORIGINS.length > 0
    ? parsed.data.MCP_ALLOWED_ORIGINS
    : parsed.data.MCP_ALLOWED_HOSTS;

export const config = {
  pageId: parsed.data.FB_PAGE_ID,
  pageAccessToken: parsed.data.FB_PAGE_ACCESS_TOKEN,
  appSecret: parsed.data.FB_APP_SECRET,
  graphApiVersion: parsed.data.FB_GRAPH_API_VERSION,
  requestTimeoutMs: parsed.data.FB_REQUEST_TIMEOUT_MS,
  port: parsed.data.PORT,
  host: parsed.data.HOST,
  routeSecret: parsed.data.MCP_ROUTE_SECRET,
  allowedHosts: parsed.data.MCP_ALLOWED_HOSTS,
  allowedOrigins,
  isLocalhostBinding,
  dryRun: parsed.data.DRY_RUN === 'true'
};
