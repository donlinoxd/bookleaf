import { CallNumberType } from '../types';

const TIMEOUT_MS = 6000;

export interface IsbnData {
  title?: string;
  subtitle?: string;
  author?: string;
  publisher?: string;
  year?: number;
  description?: string;
  genre?: string;
  cover_uri?: string;
  series_title?: string;
  language?: string;
  call_number?: string;
  call_number_type?: CallNumberType;
}

function parseYear(dateStr: string | undefined): number | undefined {
  if (!dateStr) return undefined;
  const match = dateStr.match(/\d{4}/);
  return match ? parseInt(match[0]) : undefined;
}

function cleanCoverUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  return url.replace('http://', 'https://').replace('&edge=curl', '');
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}

async function lookupOpenLibrary(isbn: string): Promise<IsbnData | null> {
  try {
    const res = await fetchWithTimeout(
      `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&jscmd=data&format=json`
    );
    if (!res.ok) return null;
    const json = await res.json();
    const data = json[`ISBN:${isbn}`];
    if (!data || !data.title) return null;

    const language = data.languages?.[0]?.key
      ? (data.languages[0].key as string).replace('/languages/', '')
      : undefined;

    // Prefer Dewey, fall back to LC
    let call_number: string | undefined;
    let call_number_type: CallNumberType | undefined;
    const dewey = data.classifications?.dewey_decimal_class?.[0];
    const lc = data.classifications?.lc_classifications?.[0];
    if (dewey) { call_number = dewey; call_number_type = 'DEWEY'; }
    else if (lc) { call_number = lc; call_number_type = 'LC'; }

    return {
      title: data.title ?? undefined,
      subtitle: data.subtitle ?? undefined,
      author: data.authors?.[0]?.name ?? undefined,
      publisher: data.publishers?.[0]?.name ?? undefined,
      year: parseYear(data.publish_date),
      description: typeof data.notes === 'string' ? data.notes : undefined,
      genre: data.subjects?.[0]?.name ?? undefined,
      cover_uri: cleanCoverUrl(data.cover?.large ?? data.cover?.medium ?? data.cover?.small),
      series_title: Array.isArray(data.series) ? data.series[0] : undefined,
      language,
      call_number,
      call_number_type,
    };
  } catch {
    return null;
  }
}

async function lookupGoogleBooks(isbn: string): Promise<IsbnData | null> {
  try {
    const res = await fetchWithTimeout(
      `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`
    );
    if (!res.ok) return null;
    const json = await res.json();
    const v = json.items?.[0]?.volumeInfo;
    if (!v || !v.title) return null;

    return {
      title: v.title ?? undefined,
      subtitle: v.subtitle ?? undefined,
      author: v.authors?.[0] ?? undefined,
      publisher: v.publisher ?? undefined,
      year: parseYear(v.publishedDate),
      description: v.description ?? undefined,
      genre: v.categories?.[0] ?? undefined,
      cover_uri: cleanCoverUrl(
        v.imageLinks?.extraLarge ??
        v.imageLinks?.large ??
        v.imageLinks?.medium ??
        v.imageLinks?.thumbnail
      ),
      language: v.language ?? undefined,
    };
  } catch {
    return null;
  }
}

function merge(ol: IsbnData | null, gb: IsbnData | null): IsbnData | null {
  if (!ol && !gb) return null;
  if (!ol) return gb;
  if (!gb) return ol;
  return {
    title:            ol.title            ?? gb.title,
    subtitle:         ol.subtitle         ?? gb.subtitle,
    author:           ol.author           ?? gb.author,
    publisher:        ol.publisher        ?? gb.publisher,
    year:             ol.year             ?? gb.year,
    description:      ol.description      ?? gb.description,
    genre:            ol.genre            ?? gb.genre,
    cover_uri:        ol.cover_uri        ?? gb.cover_uri,
    series_title:     ol.series_title     ?? gb.series_title,
    language:         ol.language         ?? gb.language,
    call_number:      ol.call_number      ?? gb.call_number,
    call_number_type: ol.call_number_type ?? gb.call_number_type,
  };
}

export const IsbnLookupService = {
  async lookup(isbn: string): Promise<IsbnData | null> {
    const [ol, gb] = await Promise.all([
      lookupOpenLibrary(isbn),
      lookupGoogleBooks(isbn),
    ]);
    return merge(ol, gb);
  },
};
