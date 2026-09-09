import { validateUrl } from './urlReader.js';

/**
 * Checks if a URL is a recognized public video platform URL.
 * @param {string} rawUrl
 * @returns {boolean}
 */
export function isVideoUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  try {
    const parsed = new URL(rawUrl.trim());
    const host = parsed.hostname.toLowerCase();
    return (
      host.includes('youtube.com') ||
      host.includes('youtu.be') ||
      host.includes('vimeo.com') ||
      host.includes('dailymotion.com')
    );
  } catch {
    return false;
  }
}

/**
 * Fetch legitimate public metadata for video URLs using standard oEmbed APIs.
 * Transparently signals the level of accessible information.
 *
 * @param {string} rawUrl
 * @returns {Promise<{ isVideo: boolean, success: boolean, title?: string, author?: string, provider?: string, url: string, note?: string, error?: string }>}
 */
export async function readVideoMetadata(rawUrl) {
  const validation = validateUrl(rawUrl);
  if (!validation.safe) {
    return {
      isVideo: false,
      success: false,
      url: rawUrl,
      error: validation.error,
    };
  }

  const urlStr = validation.urlObj.toString();
  const host = validation.urlObj.hostname.toLowerCase();

  let oEmbedEndpoint = null;
  if (host.includes('youtube.com') || host.includes('youtu.be')) {
    oEmbedEndpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(urlStr)}&format=json`;
  } else if (host.includes('vimeo.com')) {
    oEmbedEndpoint = `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(urlStr)}`;
  } else if (host.includes('dailymotion.com')) {
    oEmbedEndpoint = `https://www.dailymotion.com/services/oembed?url=${encodeURIComponent(urlStr)}`;
  } else {
    return {
      isVideo: false,
      success: false,
      url: urlStr,
      error: 'Not a recognized video platform URL.',
    };
  }

  try {
    const res = await fetch(oEmbedEndpoint, {
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': 'PramanaIntelligence/1.0' },
    });

    if (!res.ok) {
      return {
        isVideo: true,
        success: false,
        url: urlStr,
        error: "We couldn't access enough information from this video URL to analyze it.",
      };
    }

    const data = await res.json();
    return {
      isVideo: true,
      success: true,
      url: urlStr,
      title: data.title || 'Untitled Video',
      author: data.author_name || 'Unknown Channel',
      provider: data.provider_name || 'Video Platform',
      thumbnailUrl: data.thumbnail_url || null,
      note: "Only the video's available metadata could be analyzed.",
    };
  } catch (err) {
    return {
      isVideo: true,
      success: false,
      url: urlStr,
      error: "We couldn't access enough information from this video URL to analyze it.",
    };
  }
}
