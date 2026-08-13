import { config } from '../src/config.js';

export function GET(): Response {
  return Response.json({
    ok: true,
    runtime: 'vercel-function',
    dryRun: config.dryRun,
    graphApiVersion: config.graphApiVersion
  });
}

export default {
  fetch(): Response {
    return GET();
  }
};
