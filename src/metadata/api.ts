import type { Metadata } from './extract';

const USER_AGENT = 'LibrePitch/1.0 (https://librepitch.com; browser-tool)';
const MB_BASE = 'https://musicbrainz.org/ws/2';

function rateLimit(): Promise<void> {
  return new Promise((r) => setTimeout(r, 300));
}

function escapeQuery(value: string): string {
  return value.replace(/["\\]/g, '').trim();
}

interface MusicBrainzArtistCredit {
  artist?: { name?: string };
  name?: string;
}

interface MusicBrainzRelease {
  title?: string;
  date?: string;
}

interface MusicBrainzRecordingLookup {
  id: string;
  title?: string;
  'artist-credit'?: MusicBrainzArtistCredit[];
  releases?: MusicBrainzRelease[];
}

interface MusicBrainzRecordingSearchResult {
  recordings?: { id: string }[];
}

/**
 * Try to fill or improve metadata from MusicBrainz (e.g. when the original
 * file had no tags or only a filename). Uses recording search then a lookup
 * with artist-credits and releases.
 */
export async function fetchMetadataFromAPI(meta: Metadata | null): Promise<Metadata | null> {
  const title = meta?.title?.trim();
  const artist = meta?.artist?.trim();

  const query =
    title && artist
      ? `recording:"${escapeQuery(title)}" AND artist:"${escapeQuery(artist)}"`
      : title
        ? `recording:"${escapeQuery(title)}"`
        : null;

  if (!query) return meta ?? null;

  await rateLimit();
  const searchUrl = `${MB_BASE}/recording/?query=${encodeURIComponent(query)}&fmt=json&limit=1`;
  let recordingId: string | null = null;

  try {
    const searchResp = await fetch(searchUrl, {
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
    });
    if (!searchResp.ok) return meta ?? null;
    const searchData: MusicBrainzRecordingSearchResult = await searchResp.json();
    if (!searchData.recordings?.length) return meta ?? null;
    recordingId = searchData.recordings[0].id;
  } catch {
    return meta ?? null;
  }

  if (!recordingId) return meta ?? null;

  await rateLimit();
  const lookupUrl = `${MB_BASE}/recording/${recordingId}?inc=artist-credits+releases&fmt=json`;
  try {
    const lookupResp = await fetch(lookupUrl, {
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
    });
    if (!lookupResp.ok) return meta ?? null;
    const rec: MusicBrainzRecordingLookup = await lookupResp.json();

    const resolvedTitle = rec.title?.trim() || title || '';
    const artistCredit = rec['artist-credit']?.[0];
    const resolvedArtist =
      (artistCredit?.artist?.name ?? artistCredit?.name ?? '').trim() || artist || '';
    const firstRelease = rec.releases?.[0];
    const resolvedAlbum = firstRelease?.title?.trim() || meta?.album?.trim() || '';
    const resolvedYear =
      (firstRelease?.date?.slice(0, 4) ?? '').trim() || meta?.year?.trim() || '';

    return {
      title: resolvedTitle,
      artist: resolvedArtist,
      album: resolvedAlbum,
      year: resolvedYear,
    };
  } catch {
    return meta ?? null;
  }
}
