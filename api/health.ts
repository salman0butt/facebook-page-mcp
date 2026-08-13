import { config } from '../src/config.js';

export default {
  fetch(): Response {
    return Response.json({
      ok: true,
      runtime: 'vercel-function',
      dryRun: config.dryRun,
      graphApiVersion: config.graphApiVersion
    });
  }
};
