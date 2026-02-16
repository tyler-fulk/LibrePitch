import MP3Tag from 'mp3tag.js';

export interface Metadata {
  title: string;
  artist: string;
  album: string;
  year: string;
}

export async function extractMetadata(file: File): Promise<Metadata | null> {
  if (!file.name.toLowerCase().endsWith('.mp3')) {
    return fallbackMetadata(file);
  }

  try {
    const buffer = await file.arrayBuffer();
    const mp3tag = new MP3Tag(buffer);
    mp3tag.read();

    if (mp3tag.error) {
      return fallbackMetadata(file);
    }

    const tags = mp3tag.tags;

    const title = tags.title || '';
    const artist = tags.artist || '';
    const album = tags.album || '';
    const year = tags.year || '';

    if (!title && !artist && !album) {
      return fallbackMetadata(file);
    }

    return { title, artist, album, year };
  } catch {
    return fallbackMetadata(file);
  }
}

/**
 * Parse filename when ID3 tags are missing. Tries common patterns so album-art
 * search can use artist/title/album for nearest-match lookup.
 */
function fallbackMetadata(file: File): Metadata {
  const name = file.name.replace(/\.[^.]+$/, '').trim();

  // "Artist - Title (Album)" or "Artist - Title [Album]"
  const withParenthetical = name.match(/^(.+?)\s*[-–]\s*(.+?)\s*[(\[]([^)\]]+)[)\]]\s*$/);
  if (withParenthetical) {
    return {
      artist: withParenthetical[1].trim(),
      title: withParenthetical[2].trim(),
      album: withParenthetical[3].trim(),
      year: '',
    };
  }

  // "Artist - Album - Title" (three parts)
  const dashSplit = name.split(/\s*[-–]\s*/);
  if (dashSplit.length >= 3) {
    return {
      artist: dashSplit[0].trim(),
      album: dashSplit[1].trim(),
      title: dashSplit.slice(2).join(' - ').trim(),
      year: '',
    };
  }

  // "Artist - Title"
  if (dashSplit.length >= 2) {
    return {
      artist: dashSplit[0].trim(),
      title: dashSplit.slice(1).join(' - ').trim(),
      album: '',
      year: '',
    };
  }

  return {
    title: name,
    artist: '',
    album: '',
    year: '',
  };
}
