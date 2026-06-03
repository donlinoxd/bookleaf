import {
  CollectionOverview,
  MaterialTypeRow,
  YearBucketRow,
  ConditionRow,
} from '../services/CollectionReportService';

const MATERIAL_LABEL: Record<string, string> = {
  BOOK: 'Book',
  THESIS: 'Thesis / Dissertation',
  SERIAL: 'Serial / Journal',
  ARTICLE: 'Article',
  AUDIOVISUAL: 'Audiovisual',
  MAP: 'Map',
  MANUSCRIPT: 'Manuscript',
  DIGITAL: 'Digital Resource',
  OTHER: 'Other',
};

const CONDITION_LABEL: Record<string, string> = {
  good: 'Good',
  damaged: 'Damaged',
  lost: 'Lost',
};

function tableRow(...cells: string[]): string {
  return `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;
}

function headerRow(...cells: string[]): string {
  return `<tr>${cells.map((c) => `<th>${c}</th>`).join('')}</tr>`;
}

export function buildCollectionReportHtml(params: {
  institutionName: string;
  overview: CollectionOverview;
  byMaterialType: MaterialTypeRow[];
  byYear: YearBucketRow[];
  condition: ConditionRow[];
}): string {
  const { institutionName, overview, byMaterialType, byYear, condition } = params;
  const generatedAt = new Date().toLocaleDateString('en-PH', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const materialRows = byMaterialType
    .map((r) => tableRow(MATERIAL_LABEL[r.material_type] ?? r.material_type, String(r.titles), String(r.copies)))
    .join('');

  const yearRows = byYear
    .map((r) => tableRow(r.bucket, String(r.titles), String(r.copies)))
    .join('');

  const conditionRows = condition
    .map((r) => tableRow(CONDITION_LABEL[r.condition] ?? r.condition, String(r.copies)))
    .join('');

  const ratioNote = overview.registered_members === 0
    ? 'No registered members on record.'
    : `${overview.copies_per_member} copies per registered member (${overview.registered_members} members).`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    font-size: 11pt;
    color: #1a1a1a;
    padding: 40px 48px;
    line-height: 1.5;
  }
  .header { border-bottom: 2px solid #2A5C33; padding-bottom: 14px; margin-bottom: 24px; }
  .header h1 { font-size: 18pt; font-weight: 800; color: #2A5C33; }
  .header h2 { font-size: 13pt; font-weight: 600; color: #1a1a1a; margin-top: 4px; }
  .meta { font-size: 9pt; color: #666; margin-top: 6px; }
  .section { margin-bottom: 28px; }
  .section-title {
    font-size: 11pt; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.6px; color: #2A5C33;
    border-bottom: 1px solid #c8e6c9; padding-bottom: 5px; margin-bottom: 12px;
  }
  .stats-grid { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 10px; }
  .stat-box {
    border: 1px solid #dde; border-radius: 6px;
    padding: 10px 16px; min-width: 130px; flex: 1;
  }
  .stat-box .value { font-size: 20pt; font-weight: 800; color: #2A5C33; }
  .stat-box .label { font-size: 8pt; color: #666; text-transform: uppercase; letter-spacing: 0.4px; margin-top: 2px; }
  .ratio-note {
    background: #f0fdf4; border-left: 3px solid #2A5C33;
    padding: 8px 12px; font-size: 10pt; color: #1a1a1a; border-radius: 0 4px 4px 0;
  }
  table { width: 100%; border-collapse: collapse; font-size: 10pt; }
  th {
    background: #2A5C33; color: #fff;
    text-align: left; padding: 7px 10px;
    font-size: 9pt; text-transform: uppercase; letter-spacing: 0.4px;
  }
  td { padding: 7px 10px; border-bottom: 1px solid #eee; }
  tr:last-child td { border-bottom: none; }
  tr:nth-child(even) td { background: #f9fafb; }
  .footer {
    margin-top: 40px; padding-top: 12px;
    border-top: 1px solid #ddd; font-size: 9pt; color: #888;
  }
</style>
</head>
<body>

<div class="header">
  <h1>${institutionName}</h1>
  <h2>Library Collection Report</h2>
  <div class="meta">Generated: ${generatedAt}</div>
</div>

<div class="section">
  <div class="section-title">Collection Overview</div>
  <div class="stats-grid">
    <div class="stat-box"><div class="value">${overview.total_titles}</div><div class="label">Total Titles</div></div>
    <div class="stat-box"><div class="value">${overview.total_copies}</div><div class="label">Total Copies</div></div>
    <div class="stat-box"><div class="value">${overview.available_copies}</div><div class="label">Available</div></div>
    <div class="stat-box"><div class="value">${overview.borrowed_copies}</div><div class="label">Borrowed</div></div>
    <div class="stat-box"><div class="value">${overview.damaged_copies}</div><div class="label">Damaged</div></div>
    <div class="stat-box"><div class="value">${overview.lost_copies}</div><div class="label">Lost</div></div>
  </div>
  <div class="ratio-note">
    <strong>Collection-to-Student Ratio:</strong> ${ratioNote}
  </div>
</div>

<div class="section">
  <div class="section-title">Collection by Material Type</div>
  <table>
    <thead>${headerRow('Material Type', 'Titles', 'Copies')}</thead>
    <tbody>${materialRows}</tbody>
  </table>
</div>

<div class="section">
  <div class="section-title">Collection by Publication Year</div>
  <table>
    <thead>${headerRow('Period', 'Titles', 'Copies')}</thead>
    <tbody>${yearRows}</tbody>
  </table>
</div>

<div class="section">
  <div class="section-title">Copy Condition Summary</div>
  <table>
    <thead>${headerRow('Condition', 'Copies')}</thead>
    <tbody>${conditionRows}</tbody>
  </table>
</div>

<div class="footer">
  This report was generated by the library management system.
  Registered member count is used as the student proxy for the collection-to-student ratio.
</div>

</body>
</html>`;
}
