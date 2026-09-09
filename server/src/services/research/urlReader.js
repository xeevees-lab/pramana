import { JSDOM } from 'jsdom';
import sanitizeHtml from 'sanitize-html';

/**
 * Validates whether a target URL is safe to fetch (SSRF prevention).
 * Disallows private, loopback, link-local, and cloud metadata addresses.
 *
 * @param {string} rawUrl
 * @returns {{ safe: boolean, error?: string, urlObj?: URL }}
 */
export function validateUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { safe: false, error: 'URL must be a non-empty string' };
  }

  let parsed;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { safe: false, error: 'Invalid URL format' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { safe: false, error: 'Only HTTP and HTTPS protocols are supported' };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block localhost & loopback
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '127.0.0.1' ||
    hostname.startsWith('127.') ||
    hostname === '0.0.0.0' ||
    hostname === '::1' ||
    hostname === '[::1]'
  ) {
    return { safe: false, error: 'Access to loopback addresses is blocked for security' };
  }

  // Block cloud metadata & link-local
  if (hostname === '169.254.169.254' || hostname.startsWith('169.254.')) {
    return { safe: false, error: 'Access to metadata services is blocked' };
  }

  // Block RFC 1918 private IPv4 addresses
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    return { safe: false, error: 'Access to private internal network addresses is blocked' };
  }
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    return { safe: false, error: 'Access to private internal network addresses is blocked' };
  }
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    return { safe: false, error: 'Access to private internal network addresses is blocked' };
  }

  // Block internal domain suffixes
  if (
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.lan') ||
    hostname.endsWith('.home') ||
    hostname.endsWith('.corp')
  ) {
    return { safe: false, error: 'Access to internal domains is blocked' };
  }

  return { safe: true, urlObj: parsed };
}

/**
 * Fetch and extract text content from a public web page safely.
 *
 * @param {string} rawUrl
 * @returns {Promise<{ success: boolean, title?: string, description?: string, text?: string, url: string, error?: string }>}
 */
export async function readPublicUrl(rawUrl) {
  const validation = validateUrl(rawUrl);
  if (!validation.safe) {
    return {
      success: false,
      url: rawUrl,
      error: validation.error,
    };
  }

  const cleanUrl = validation.urlObj.toString();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);

    const res = await fetch(cleanUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 PramanaNewsBot/1.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    clearTimeout(timeout);

    if (!res.ok) {
      return {
        success: false,
        url: cleanUrl,
        error: `Remote server responded with HTTP status ${res.status}`,
      };
    }

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain') && !contentType.includes('application/xml')) {
      return {
        success: false,
        url: cleanUrl,
        error: 'Unsupported content type. Only web articles and documents are supported.',
      };
    }

    const html = await res.text();

    // Size check (max 1.5MB)
    if (html.length > 1500000) {
      return {
        success: false,
        url: cleanUrl,
        error: 'Article payload exceeds maximum allowed size (1.5MB)',
      };
    }

    const dom = new JSDOM(html, { url: cleanUrl });
    const document = dom.window.document;

    // Extract title
    const title = (
      document.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
      document.querySelector('title')?.textContent ||
      ''
    ).trim();

    // Extract description
    const description = (
      document.querySelector('meta[property="og:description"]')?.getAttribute('content') ||
      document.querySelector('meta[name="description"]')?.getAttribute('content') ||
      ''
    ).trim();

    // Extract body paragraphs (filter out navigation, scripts, ads)
    const elementsToRemove = document.querySelectorAll('script, style, nav, footer, header, noscript, aside, form');
    elementsToRemove.forEach(el => el.remove());

    const paragraphs = [];
    const pNodes = document.querySelectorAll('article p, main p, .post-content p, .article-body p, p');
    for (const p of pNodes) {
      const text = p.textContent.trim();
      if (text.length > 25 && !text.includes('cookie') && !text.includes('subscribe')) {
        paragraphs.push(text);
      }
    }

    const cleanBody = sanitizeHtml(paragraphs.join('\n\n'), {
      allowedTags: [],
      allowedAttributes: {},
    }).trim();

    if (!cleanBody && !description && !title) {
      return {
        success: false,
        url: cleanUrl,
        error: "We couldn't access enough information from this URL to analyze it.",
      };
    }

    return {
      success: true,
      url: cleanUrl,
      title: title || 'Web Document',
      description,
      text: cleanBody.slice(0, 10000), // Cap readable text at 10,000 characters
    };
  } catch (err) {
    const isTimeout = err.name === 'AbortError';
    return {
      success: false,
      url: cleanUrl,
      error: isTimeout
        ? 'Request timed out while trying to reach the target URL.'
        : "We couldn't access enough information from this URL to analyze it.",
    };
  }
}

export const readUrlContent = readPublicUrl;

