import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { diagnoseConnection, getPageInfo } from './facebook.js';
import {
  publishPhotoFromBase64,
  publishPhotoFromUrl,
  publishTextPost
} from './facebook-publish.js';

const httpsUrl = z.url({ protocol: /^https$/ });

const openAIFileSchema = z.strictObject({
  download_url: httpsUrl,
  file_id: z.string().min(1),
  mime_type: z.string().min(1).optional(),
  file_name: z.string().min(1).optional()
});

const publishOutputSchema = z.object({
  dryRun: z.boolean(),
  kind: z.enum(['text', 'photo']),
  pageId: z.string(),
  graphApiVersion: z.string(),
  endpoint: z.string(),
  postId: z.string().optional(),
  photoId: z.string().optional()
});

const pageInfoOutputSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  link: z.string().optional(),
  graphApiVersion: z.string(),
  dryRunWrites: z.boolean()
});

const managedPageDiagnosticSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  tasks: z.array(z.string()).optional()
});

const diagnosticsOutputSchema = z.object({
  configuredPageId: z.string(),
  graphApiVersion: z.string(),
  dryRunWrites: z.boolean(),
  tokenIdentityId: z.string(),
  tokenIdentityName: z.string().optional(),
  tokenIdentityMatchesConfiguredPage: z.boolean(),
  configuredPageReadable: z.boolean(),
  configuredPageName: z.string().optional(),
  configuredPageReadError: z.string().optional(),
  configuredPageFoundInManagedPages: z.boolean().optional(),
  managedPages: z.array(managedPageDiagnosticSchema).optional(),
  managedPagesReadError: z.string().optional()
});

const photoInputSchema = z.strictObject({
  caption: z.string().default('').describe('Caption to publish with the image.'),
  image: openAIFileSchema
    .optional()
    .describe('Image file supplied by ChatGPT through the MCP file-input mechanism.'),
  imageUrl: httpsUrl.optional().describe('Publicly reachable HTTPS image URL.'),
  imageBase64: z
    .string()
    .min(1)
    .optional()
    .describe('Base64 image bytes. A data URL prefix is also accepted.'),
  filename: z.string().min(1).default('image.jpg'),
  mimeType: z
    .enum(['image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'image/tiff'])
    .default('image/jpeg')
});

function successResult(payload: Record<string, unknown>) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload
  };
}

function errorResult(error: unknown) {
  return {
    isError: true,
    content: [
      {
        type: 'text' as const,
        text: error instanceof Error ? error.message : 'Unknown error'
      }
    ]
  };
}

export function createFacebookMcpServer(): McpServer {
  const server = new McpServer({
    name: 'facebook-page-publisher-v2',
    version: '1.2.5'
  });

  server.registerTool(
    'facebook_diagnose_connection',
    {
      title: 'Diagnose Facebook Page connection',
      description:
        'Read-only diagnostic for the configured Facebook token and Page. The tokenIdentity fields are informational only: a token identity mismatch from /me is not by itself proof that a Page Access Token is invalid. The authoritative read check is configuredPageReadable for the configured Page ID. Never returns access-token values.',
      inputSchema: z.strictObject({}),
      outputSchema: diagnosticsOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      },
      _meta: {
        'openai/toolInvocation/invoking': 'Diagnosing Facebook connection…',
        'openai/toolInvocation/invoked': 'Facebook connection diagnosed'
      }
    },
    async () => {
      try {
        const result = await diagnoseConnection();
        return successResult({ ...result });
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    'facebook_get_page_info',
    {
      title: 'Get Facebook Page info',
      description:
        'Verify that the configured token can access the configured Facebook Page and return basic Page information. This read still runs when DRY_RUN=true; DRY_RUN protects write actions only.',
      inputSchema: z.strictObject({}),
      outputSchema: pageInfoOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      },
      _meta: {
        'openai/toolInvocation/invoking': 'Checking Facebook Page…',
        'openai/toolInvocation/invoked': 'Facebook Page checked'
      }
    },
    async () => {
      try {
        const result = await getPageInfo();
        return successResult({ ...result });
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    'facebook_publish_text_post',
    {
      title: 'Publish Facebook Page text post',
      description:
        'Create a new organic text post on the configured Facebook Page. Before writing, the MCP verifies access by reading the configured Page ID directly; it does not require /me to equal the Page ID. Use only when the user explicitly wants content published.',
      inputSchema: z.strictObject({
        message: z.string().min(1).describe('The exact text to publish on the Facebook Page.')
      }),
      outputSchema: publishOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      },
      _meta: {
        'openai/toolInvocation/invoking': 'Publishing Facebook post…',
        'openai/toolInvocation/invoked': 'Facebook post published'
      }
    },
    async ({ message }) => {
      try {
        const result = await publishTextPost(message);
        return successResult({ ...result });
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.registerTool(
    'facebook_publish_photo_post',
    {
      title: 'Publish Facebook Page photo post',
      description:
        'Create one organic Facebook Page photo post with an optional caption. Before writing, the MCP verifies access by reading the configured Page ID directly; it does not require /me to equal the Page ID. Prefer the ChatGPT image file input when the user attached or generated an image. Otherwise accept one HTTPS image URL or Base64 image.',
      inputSchema: photoInputSchema,
      outputSchema: publishOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      },
      _meta: {
        'openai/fileParams': ['image'],
        'openai/toolInvocation/invoking': 'Publishing Facebook photo…',
        'openai/toolInvocation/invoked': 'Facebook photo published'
      }
    },
    async ({ caption, image, imageUrl, imageBase64, filename, mimeType }) => {
      try {
        const sourceCount = [image, imageUrl, imageBase64].filter(Boolean).length;
        if (sourceCount !== 1) {
          return errorResult(
            new Error('Provide exactly one image source: image, imageUrl, or imageBase64.')
          );
        }

        if (image) {
          const result = await publishPhotoFromUrl(caption, image.download_url, image.mime_type);
          return successResult({ ...result });
        }

        if (imageUrl) {
          const result = await publishPhotoFromUrl(caption, imageUrl);
          return successResult({ ...result });
        }

        if (imageBase64) {
          const result = await publishPhotoFromBase64(caption, imageBase64, filename, mimeType);
          return successResult({ ...result });
        }

        return errorResult(new Error('No image source was provided.'));
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  return server;
}
