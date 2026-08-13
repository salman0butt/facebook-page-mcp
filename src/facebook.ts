import { createHmac } from 'node:crypto';
import { config } from './config.js';

const FACEBOOK_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/bmp',
  'image/tiff'
]);

export type PageInfoResult = {
  id: string;
  name?: string;
  link?: string;
  graphApiVersion: string;
  dryRunWrites: boolean;
};

export type PublishResult = {
  dryRun: boolean;
  kind: 'text' | 'photo';
  pageId: string;
  graphApiVersion: string;
  endpoint: string;
  postId?: string;
  photoId?: string;
};

type GraphErrorBody = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    error_user_title?: string;
    error_user_msg?: string;
    is_transient?: boolean;
    fbtrace_id?: string;
  };
};

type GraphPublishBody = GraphErrorBody & {
  id?: string;
  post_id?: string;
};

type GraphPageBody = GraphErrorBody & {
  id?: string;
  name?: string;
  link?: string;
};

function appSecretProof(): string | undefined {
  if (!config.appSecret) return undefined;
  return createHmac('sha256', config.appSecret).update(config.pageAccessToken).digest('hex');
}

function publicGraphEndpoint(edge?: string): string {
  const suffix = edge ? `/${edge}` : '';
  return `https://graph.facebook.com/${config.graphApiVersion}/${config.pageId}${suffix}`;
}

function graphUrl(edge?: string): URL {
  const url = new URL(publicGraphEndpoint(edge));

  const proof = appSecretProof();
  if (proof) url.searchParams.set('appsecret_proof', proof);
  return url;
}

function graphHeaders(contentType?: string): HeadersInit {
  return {
    Authorization: `Bearer ${config.pageAccessToken}`,
    ...(contentType ? { 'Content-Type': contentType } : {})
  };
}

function graphErrorMessage(response: Response, body: GraphErrorBody): string {
  const error = body.error;
  return [
    error?.error_user_title,
    error?.error_user_msg,
    error?.message ?? `Facebook Graph API returned HTTP ${response.status}`,
    error?.type ? `type=${error.type}` : undefined,
    error?.code !== undefined ? `code=${error.code}` : undefined,
    error?.error_subcode !== undefined ? `subcode=${error.error_subcode}` : undefined,
    error?.is_transient !== undefined ? `transient=${error.is_transient}` : undefined,
    error?.fbtrace_id ? `fbtrace_id=${error.fbtrace_id}` : undefined
  ]
    .filter(Boolean)
    .join(' | ');
}

async function graphFetch(url: URL, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(config.requestTimeoutMs)
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new Error(`Facebook Graph API request timed out after ${config.requestTimeoutMs}ms.`);
    }
    throw error;
  }
}

async function parsePublishResponse(response: Response): Promise<GraphPublishBody> {
  const body = (await response.json().catch(() => ({}))) as GraphPublishBody;
  if (!response.ok || body.error) throw new Error(graphErrorMessage(response, body));
  return body;
}

function ensureSupportedMimeType(mimeType: string): void {
  const normalized = mimeType.toLowerCase();
  if (!FACEBOOK_IMAGE_MIME_TYPES.has(normalized)) {
    throw new Error(
      `Unsupported image MIME type "${mimeType}". Use JPEG, PNG, GIF, BMP, or TIFF.`
    );
  }
}

function decodeBase64Image(input: string): { bytes: Uint8Array; dataUrlMimeType?: string } {
  let encoded = input.trim();
  let dataUrlMimeType: string | undefined;

  const dataUrl = encoded.match(/^data:([^;,]+);base64,(.*)$/s);
  if (dataUrl) {
    dataUrlMimeType = dataUrl[1]?.toLowerCase();
    encoded = dataUrl[2] ?? '';
  }

  const compact = encoded.replace(/\s+/g, '');
  if (!compact || compact.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(compact)) {
    throw new Error('imageBase64 is not valid Base64 image data.');
  }

  const buffer = Buffer.from(compact, 'base64');
  if (buffer.length === 0) throw new Error('Decoded image is empty.');

  const canonicalInput = compact.replace(/=+$/, '');
  const canonicalDecoded = buffer.toString('base64').replace(/=+$/, '');
  if (canonicalInput !== canonicalDecoded) {
    throw new Error('imageBase64 could not be decoded losslessly.');
  }

  return { bytes: new Uint8Array(buffer), dataUrlMimeType };
}

export async function publishTextPost(message: string): Promise<PublishResult> {
  const endpoint = graphUrl('feed');

  if (config.dryRun) {
    return {
      dryRun: true,
      kind: 'text',
      pageId: config.pageId,
      graphApiVersion: config.graphApiVersion,
      endpoint: publicGraphEndpoint('feed')
    };
  }

  const body = new URLSearchParams({ message });
  const response = await graphFetch(endpoint, {
    method: 'POST',
    headers: graphHeaders('application/x-www-form-urlencoded'),
    body
  });
  const result = await parsePublishResponse(response);

  if (!result.id) throw new Error('Facebook Graph API did not return the created post id.');

  return {
    dryRun: false,
    kind: 'text',
    pageId: config.pageId,
    graphApiVersion: config.graphApiVersion,
    endpoint: publicGraphEndpoint('feed'),
    postId: result.id
  };
}

export async function publishPhotoFromUrl(
  caption: string,
  imageUrl: string,
  mimeType?: string
): Promise<PublishResult> {
  if (mimeType) ensureSupportedMimeType(mimeType);

  const endpoint = graphUrl('photos');
  if (config.dryRun) {
    return {
      dryRun: true,
      kind: 'photo',
      pageId: config.pageId,
      graphApiVersion: config.graphApiVersion,
      endpoint: publicGraphEndpoint('photos')
    };
  }

  const body = new URLSearchParams({ url: imageUrl, caption, published: 'true' });
  const response = await graphFetch(endpoint, {
    method: 'POST',
    headers: graphHeaders('application/x-www-form-urlencoded'),
    body
  });
  const result = await parsePublishResponse(response);

  if (!result.id && !result.post_id) {
    throw new Error('Facebook Graph API did not return a photo or post id.');
  }

  return {
    dryRun: false,
    kind: 'photo',
    pageId: config.pageId,
    graphApiVersion: config.graphApiVersion,
    endpoint: publicGraphEndpoint('photos'),
    photoId: result.id,
    postId: result.post_id
  };
}

export async function publishPhotoFromBase64(
  caption: string,
  imageBase64: string,
  filename = 'image.jpg',
  mimeType = 'image/jpeg'
): Promise<PublishResult> {
  const { bytes, dataUrlMimeType } = decodeBase64Image(imageBase64);
  const resolvedMimeType = dataUrlMimeType ?? mimeType.toLowerCase();
  ensureSupportedMimeType(resolvedMimeType);

  const endpoint = graphUrl('photos');
  if (config.dryRun) {
    return {
      dryRun: true,
      kind: 'photo',
      pageId: config.pageId,
      graphApiVersion: config.graphApiVersion,
      endpoint: publicGraphEndpoint('photos')
    };
  }

  const form = new FormData();
  form.set('caption', caption);
  form.set('published', 'true');
  const imageBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
  form.set('source', new Blob([imageBuffer], { type: resolvedMimeType }), filename);

  const response = await graphFetch(endpoint, {
    method: 'POST',
    headers: graphHeaders(),
    body: form
  });
  const result = await parsePublishResponse(response);

  if (!result.id && !result.post_id) {
    throw new Error('Facebook Graph API did not return a photo or post id.');
  }

  return {
    dryRun: false,
    kind: 'photo',
    pageId: config.pageId,
    graphApiVersion: config.graphApiVersion,
    endpoint: publicGraphEndpoint('photos'),
    photoId: result.id,
    postId: result.post_id
  };
}

export async function getPageInfo(): Promise<PageInfoResult> {
  const url = graphUrl();
  url.searchParams.set('fields', 'id,name,link');

  const response = await graphFetch(url, {
    method: 'GET',
    headers: graphHeaders()
  });
  const body = (await response.json().catch(() => ({}))) as GraphPageBody;

  if (!response.ok || body.error) throw new Error(graphErrorMessage(response, body));
  if (!body.id) throw new Error('Facebook Graph API response did not contain the Page id.');

  return {
    id: body.id,
    name: body.name,
    link: body.link,
    graphApiVersion: config.graphApiVersion,
    dryRunWrites: config.dryRun
  };
}
