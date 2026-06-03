import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { MaterialType, UserRole, UserType } from '../types';
import { ResourceService } from './ResourceService';
import { UserService } from './UserService';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ImportError = { row: number; message: string };

export type BookImportRow = {
  title: string;
  author: string;
  isbn: string | null;
  publisher: string | null;
  year: number | null;
  genre: string | null;
  description: string | null;
  material_type: MaterialType;
  copies: number;
  is_loanable: boolean;
  accession_number: string | null;
  barcode: string | null;
  shelf_location: string | null;
  subtitle: string | null;
  edition: string | null;
  volume: string | null;
  issue_number: string | null;
  series_title: string | null;
  language: string | null;
  issn: string | null;
  doi: string | null;
  url: string | null;
  duration: string | null;
  call_number: string | null;
  call_number_type: 'DEWEY' | 'LC' | 'OTHER' | null;
  subject_headings: string[] | null;
  content_type: string | null;
  media_type: string | null;
  carrier_type: string | null;
  loan_period_days: number | null;
};

export type MemberImportRow = {
  name: string;
  id_number: string;
  pin: string;
  role: UserRole;
  user_type: UserType | null;
  department: string | null;
};

export type ParseResult<T> = {
  valid: T[];
  errors: ImportError[];
  total: number;
};

export type ImportResult = { success: number; failed: number };

// ─── Constants ────────────────────────────────────────────────────────────────

const VALID_MATERIAL_TYPES = new Set<string>([
  'BOOK', 'SERIAL', 'ARTICLE', 'AUDIOVISUAL', 'MAP', 'MANUSCRIPT', 'DIGITAL', 'THESIS', 'OTHER',
]);
const VALID_ROLES = new Set<string>(['admin', 'librarian', 'member']);
const VALID_USER_TYPES = new Set<string>(['student', 'faculty', 'alumni', 'external']);
const VALID_CALL_NUMBER_TYPES = new Set<string>(['DEWEY', 'LC', 'OTHER']);

const BOOK_HEADERS = [
  'title', 'author', 'isbn', 'publisher', 'year', 'genre', 'description',
  'material_type', 'copies', 'is_loanable',
  'accession_number', 'barcode', 'shelf_location',
  'subtitle', 'edition', 'volume', 'issue_number', 'series_title', 'language', 'issn',
  'doi', 'url', 'duration',
  'call_number', 'call_number_type', 'subject_headings',
  'content_type', 'media_type', 'carrier_type', 'loan_period_days',
];

const MEMBER_HEADERS = ['name', 'id_number', 'pin', 'role', 'user_type', 'department'];

// ─── CSV Parser ───────────────────────────────────────────────────────────────

function parseLine(line: string): string[] {
  const fields: string[] = [];
  let cur = '';
  let inQ = false;
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i += 2; }
      else if (ch === '"') { inQ = false; i++; }
      else { cur += ch; i++; }
    } else {
      if (ch === '"') { inQ = true; i++; }
      else if (ch === ',') { fields.push(cur.trim()); cur = ''; i++; }
      else { cur += ch; i++; }
    }
  }
  fields.push(cur.trim());
  return fields;
}

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  let headers: string[] = [];
  const rows: Record<string, string>[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (headers.length === 0) {
      headers = parseLine(line).map((h) => h.toLowerCase().replace(/\s+/g, '_'));
    } else {
      const values = parseLine(line);
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = values[i] ?? ''; });
      rows.push(row);
    }
  }
  return { headers, rows };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const str = (v: string) => v.trim() || null;
const bool = (v: string, def = true) => {
  const s = v.trim().toLowerCase();
  if (!s) return def;
  return s === 'true' || s === '1' || s === 'yes';
};
const int = (v: string) => { const n = parseInt(v.trim()); return isNaN(n) ? null : n; };

// ─── Templates ────────────────────────────────────────────────────────────────

function bookTemplateCsv(): string {
  const note = '# Required: title, author. material_type defaults to BOOK. copies defaults to 1. ' +
    'accession_number/barcode/shelf_location apply to single-copy only — fill per copy via Edit Copy for multi-copy resources. ' +
    'subject_headings separated by | (pipe).';
  const headers = BOOK_HEADERS.join(',');
  const sample = [
    'Introduction to Library Science', // title
    'John Smith',                       // author
    '9780123456789',                    // isbn
    'Oxford University Press',          // publisher
    '2023',                             // year
    'Library Science',                  // genre
    'A comprehensive introduction.',    // description
    'BOOK',                             // material_type
    '1',                                // copies
    'true',                             // is_loanable
    'ACC-2024-001',                     // accession_number
    'BAR-001',                          // barcode
    'A3-Shelf1',                        // shelf_location
    '',                                 // subtitle
    '2nd ed.',                          // edition
    '',                                 // volume
    '',                                 // issue_number
    '',                                 // series_title
    'English',                          // language
    '',                                 // issn
    '',                                 // doi
    '',                                 // url
    '',                                 // duration
    '020.1',                            // call_number
    'DEWEY',                            // call_number_type
    'Library Science|Information',      // subject_headings
    '',                                 // content_type
    '',                                 // media_type
    '',                                 // carrier_type
    '',                                 // loan_period_days
  ].map((v) => v.includes(',') ? `"${v}"` : v).join(',');
  return `${note}\n${headers}\n${sample}\n`;
}

function memberTemplateCsv(): string {
  const note = '# Required: name, id_number, pin, role. role must be: member, librarian, or admin. ' +
    'user_type must be: student, faculty, alumni, or external. pin must be at least 4 digits.';
  const headers = MEMBER_HEADERS.join(',');
  const sample = 'Jane Doe,2024-001,1234,member,student,College of Engineering';
  return `${note}\n${headers}\n${sample}\n`;
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validateBookRow(row: Record<string, string>, rowIndex: number): BookImportRow | ImportError {
  const title = row['title']?.trim();
  const author = row['author']?.trim();
  if (!title) return { row: rowIndex, message: 'Missing required field: title' };
  if (!author) return { row: rowIndex, message: 'Missing required field: author' };

  const mtRaw = row['material_type']?.trim().toUpperCase() || 'BOOK';
  if (!VALID_MATERIAL_TYPES.has(mtRaw)) {
    return { row: rowIndex, message: `Invalid material_type "${mtRaw}". Must be one of: ${[...VALID_MATERIAL_TYPES].join(', ')}` };
  }

  const copies = Math.max(1, Math.min(100, int(row['copies'] ?? '') ?? 1));

  const cntRaw = row['call_number_type']?.trim().toUpperCase() || '';
  if (cntRaw && !VALID_CALL_NUMBER_TYPES.has(cntRaw)) {
    return { row: rowIndex, message: `Invalid call_number_type "${cntRaw}". Must be DEWEY, LC, or OTHER` };
  }

  const subjectRaw = row['subject_headings']?.trim();
  const subject_headings = subjectRaw
    ? subjectRaw.split('|').map((s) => s.trim()).filter(Boolean)
    : null;

  return {
    title,
    author,
    isbn: str(row['isbn'] ?? ''),
    publisher: str(row['publisher'] ?? ''),
    year: int(row['year'] ?? ''),
    genre: str(row['genre'] ?? ''),
    description: str(row['description'] ?? ''),
    material_type: mtRaw as MaterialType,
    copies,
    is_loanable: bool(row['is_loanable'] ?? '', true),
    accession_number: copies === 1 ? str(row['accession_number'] ?? '') : null,
    barcode: copies === 1 ? str(row['barcode'] ?? '') : null,
    shelf_location: copies === 1 ? str(row['shelf_location'] ?? '') : null,
    subtitle: str(row['subtitle'] ?? ''),
    edition: str(row['edition'] ?? ''),
    volume: str(row['volume'] ?? ''),
    issue_number: str(row['issue_number'] ?? ''),
    series_title: str(row['series_title'] ?? ''),
    language: str(row['language'] ?? ''),
    issn: str(row['issn'] ?? ''),
    doi: str(row['doi'] ?? ''),
    url: str(row['url'] ?? ''),
    duration: str(row['duration'] ?? ''),
    call_number: str(row['call_number'] ?? ''),
    call_number_type: cntRaw ? (cntRaw as 'DEWEY' | 'LC' | 'OTHER') : null,
    subject_headings,
    content_type: str(row['content_type'] ?? ''),
    media_type: str(row['media_type'] ?? ''),
    carrier_type: str(row['carrier_type'] ?? ''),
    loan_period_days: int(row['loan_period_days'] ?? ''),
  };
}

function validateMemberRow(row: Record<string, string>, rowIndex: number): MemberImportRow | ImportError {
  const name = row['name']?.trim();
  const id_number = row['id_number']?.trim();
  const pin = row['pin']?.trim();
  const role = row['role']?.trim().toLowerCase();

  if (!name) return { row: rowIndex, message: 'Missing required field: name' };
  if (!id_number) return { row: rowIndex, message: 'Missing required field: id_number' };
  if (!pin || pin.length < 4) return { row: rowIndex, message: `PIN must be at least 4 digits (row ${rowIndex})` };
  if (!role) return { row: rowIndex, message: 'Missing required field: role' };
  if (!VALID_ROLES.has(role)) {
    return { row: rowIndex, message: `Invalid role "${role}". Must be: member, librarian, or admin` };
  }

  const utRaw = row['user_type']?.trim().toLowerCase() || '';
  if (utRaw && !VALID_USER_TYPES.has(utRaw)) {
    return { row: rowIndex, message: `Invalid user_type "${utRaw}". Must be: student, faculty, alumni, or external` };
  }

  return {
    name,
    id_number,
    pin,
    role: role as UserRole,
    user_type: utRaw ? (utRaw as UserType) : null,
    department: str(row['department'] ?? ''),
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const ImportService = {
  parseBooks(csvText: string): ParseResult<BookImportRow> {
    const { rows } = parseCSV(csvText);
    const valid: BookImportRow[] = [];
    const errors: ImportError[] = [];
    rows.forEach((row, i) => {
      const result = validateBookRow(row, i + 2); // +2: 1-based + skip header
      if ('title' in result) valid.push(result);
      else errors.push(result);
    });
    return { valid, errors, total: rows.length };
  },

  parseMembers(csvText: string): ParseResult<MemberImportRow> {
    const { rows } = parseCSV(csvText);
    const valid: MemberImportRow[] = [];
    const errors: ImportError[] = [];
    rows.forEach((row, i) => {
      const result = validateMemberRow(row, i + 2);
      if ('name' in result) valid.push(result);
      else errors.push(result);
    });
    return { valid, errors, total: rows.length };
  },

  async importBooks(rows: BookImportRow[], institutionId: number): Promise<ImportResult> {
    let success = 0;
    let failed = 0;
    for (const row of rows) {
      try {
        const copyDetails = row.copies === 1
          ? [{ accession_number: row.accession_number, barcode: row.barcode, shelf_location: row.shelf_location }]
          : undefined;
        await ResourceService.create({
          institution_id: institutionId,
          material_type: row.material_type,
          title: row.title,
          author: row.author,
          isbn: row.isbn,
          publisher: row.publisher,
          year: row.year,
          genre: row.genre,
          description: row.description,
          cover_uri: null,
          subtitle: row.subtitle,
          edition: row.edition,
          volume: row.volume,
          issue_number: row.issue_number,
          series_title: row.series_title,
          language: row.language,
          issn: row.issn,
          doi: row.doi,
          url: row.url,
          duration: row.duration,
          call_number: row.call_number,
          call_number_type: row.call_number_type,
          content_type: row.content_type,
          media_type: row.media_type,
          carrier_type: row.carrier_type,
          subject_headings: row.subject_headings,
          author_authority_id: null,
          is_loanable: row.is_loanable,
          loan_period_days: row.loan_period_days,
          total_copies: row.copies,
        }, copyDetails);
        success++;
      } catch {
        failed++;
      }
    }
    return { success, failed };
  },

  async importMembers(rows: MemberImportRow[], institutionId: number): Promise<ImportResult> {
    let success = 0;
    let failed = 0;
    for (const row of rows) {
      try {
        await UserService.create({
          institution_id: institutionId,
          name: row.name,
          id_number: row.id_number,
          pin: row.pin,
          role: row.role,
          user_type: row.user_type ?? undefined,
          department: row.department ?? undefined,
        });
        success++;
      } catch {
        failed++;
      }
    }
    return { success, failed };
  },

  async pickCsvFile(): Promise<string | null> {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['text/csv', 'text/plain', 'text/comma-separated-values', '*/*'],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.[0]) return null;
    const uri = result.assets[0].uri;
    return await FileSystem.readAsStringAsync(uri);
  },

  async downloadTemplate(type: 'books' | 'members'): Promise<void> {
    const csv = type === 'books' ? bookTemplateCsv() : memberTemplateCsv();
    const filename = type === 'books' ? 'bookleaf_books_template.csv' : 'bookleaf_members_template.csv';
    const path = `${FileSystem.documentDirectory}${filename}`;
    await FileSystem.writeAsStringAsync(path, csv, { encoding: FileSystem.EncodingType.UTF8 });
    await Sharing.shareAsync(path, { mimeType: 'text/csv', dialogTitle: `Save ${filename}` });
  },
};
