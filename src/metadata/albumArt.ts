import type { Metadata } from './extract';

const USER_AGENT = 'LibrePitch/1.0 (https://librepitch.com; browser-tool)';
const COVER_ART_BASE = 'https://coverartarchive.org/release';
const MB_BASE = 'https://musicbrainz.org/ws/2';

/** MusicBrainz asks for max 1 request per second; small delay between MB calls. */
function rateLimit(): Promise<void> {
  return new Promise((r) => setTimeout(r, 250));
}

interface MusicBrainzRelease {
  id: string;
  score?: number;
  title: string;
}

interface MusicBrainzRecording {
  id: string;
  score?: number;
  title: string;
}

interface MusicBrainzReleaseSearchResult {
  releases: MusicBrainzRelease[];
}

interface MusicBrainzRecordingSearchResult {
  recordings: MusicBrainzRecording[];
}

const artCache = new Map<string, string | null>();

/**
 * Fetch album art URL from third-party catalog using metadata (and optionally
 * parsed title/artist). Tries MusicBrainz + Cover Art Archive: first by release
 * (artist+album or artist+title), then by recording (artist+title) and
 * browsing releases containing that recording.
 */
export async function fetchAlbumArt(meta: Metadata): Promise<string | null> {
  const searchKey = buildSearchKey(meta);
  if (artCache.has(searchKey)) {
    return artCache.get(searchKey)!;
  }

  const url = await findCoverArtUrl(meta);
  artCache.set(searchKey, url);
  return url;
}

function buildSearchKey(meta: Metadata): string {
  const a = (meta.artist || '').trim().toLowerCase();
  const t = (meta.title || '').trim().toLowerCase();
  const al = (meta.album || '').trim().toLowerCase();
  return `${a}|${t}|${al}`;
}

async function findCoverArtUrl(meta: Metadata): Promise<string | null> {
  // Strategy 1: Release search (artist + album, or artist + title as release name)
  const byRelease = await tryReleaseSearch(meta);
  if (byRelease) return byRelease;

  // Strategy 2: Recording search (artist + title) then get a release that contains it
  const byRecording = await tryRecordingSearchThenCover(meta);
  if (byRecording) return byRecording;

  return null;
}

/** Try to find cover art by searching MusicBrainz releases. */
async function tryReleaseSearch(meta: Metadata): Promise<string | null> {
  const candidates = await searchMusicBrainzReleases(meta);
  for (const release of candidates) {
    const url = await checkCoverArtExists(release.id);
    if (url) return url;
  }
  return null;
}

/** Search for releases: prefer artist+album, fallback to artist+title as release. */
async function searchMusicBrainzReleases(meta: Metadata): Promise<MusicBrainzRelease[]> {
  const queries: string[] = [];

  if (meta.artist) {
    const artistPart = `artist:"${escapeQuery(meta.artist)}"`;
    if (meta.album) {
      queries.push(`${artistPart} AND release:"${escapeQuery(meta.album)}"`);
    }
    if (meta.title) {
      queries.push(`${artistPart} AND release:"${escapeQuery(meta.title)}"`);
    }
  }

  const seen = new Set<string>();
  const results: MusicBrainzRelease[] = [];

  for (const q of queries) {
    await rateLimit();
    const url = `${MB_BASE}/release/?query=${encodeURIComponent(q)}&fmt=json&limit=5`;
    try {
      const resp = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT } });
      if (!resp.ok) continue;
      const data: MusicBrainzReleaseSearchResult = await resp.json();
      if (!data.releases) continue;
      for (const r of data.releases) {
        if (!seen.has(r.id)) {
          seen.add(r.id);
          results.push(r);
        }
      }
    } catch {
      // ignore and try next
    }
  }

  // Sort by score descending if present
  results.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return results;
}

/** Find a release via recording search (artist + title), then get cover art. */
async function tryRecordingSearchThenCover(meta: Metadata): Promise<string | null> {
  if (!meta.artist?.trim() || !meta.title?.trim()) return null;

  const recordingId = await searchMusicBrainzRecording(meta.artist, meta.title);
  if (!recordingId) return null;

  const releaseIds = await browseReleasesByRecording(recordingId);
  for (const rid of releaseIds) {
    const url = await checkCoverArtExists(rid);
    if (url) return url;
  }
  return null;
}

/** Search recordings by artist and title; return first (best) recording MBID. */
async function searchMusicBrainzRecording(artist: string, title: string): Promise<string | null> {
  const q = `recording:"${escapeQuery(title)}" AND artist:"${escapeQuery(artist)}"`;
  await rateLimit();
  const url = `${MB_BASE}/recording/?query=${encodeURIComponent(q)}&fmt=json&limit=5`;
  try {
    const resp = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT } });
    if (!resp.ok) return null;
    const data: MusicBrainzRecordingSearchResult = await resp.json();
    if (!data.recordings?.length) return null;
    return data.recordings[0].id;
  } catch {
    return null;
  }
}

/** Browse releases that contain the given recording MBID. */
async function browseReleasesByRecording(recordingMbid: string): Promise<string[]> {
  await rateLimit();
  const url = `${MB_BASE}/release/?recording=${encodeURIComponent(recordingMbid)}&fmt=json&limit=10`;
  try {
    const resp = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT } });
    if (!resp.ok) return [];
    const data: MusicBrainzReleaseSearchResult = await resp.json();
    if (!data.releases) return [];
    return data.releases.map((r) => r.id);
  } catch {
    return [];
  }
}

/** Return cover art URL if the release has front art, else null. */
async function checkCoverArtExists(releaseMbid: string): Promise<string | null> {
  const url = `${COVER_ART_BASE}/${releaseMbid}/front-250`;
  try {
    const resp = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    if (resp.ok) return url;
    return null;
  } catch {
    return null;
  }
}

function escapeQuery(value: string): string {
  return value.replace(/["\\]/g, '').trim();
}
