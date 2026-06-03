import { AccessionRow, ConditionByMaterialRow, LatestSessionSummary } from '../services/InventoryAuditService';

const MATERIAL_LABEL: Record<string, string> = {
  BOOK: 'Book', THESIS: 'Thesis / Dissertation', SERIAL: 'Serial / Journal',
  ARTICLE: 'Article', AUDIOVISUAL: 'Audiovisual', MAP: 'Map',
  MANUSCRIPT: 'Manuscript', DIGITAL: 'Digital Resource', OTHER: 'Other',
};

export function buildInventoryAuditHtml(params: {
  institutionName: string;
  accessionRegister: AccessionRow[];
  conditionByMaterial: ConditionByMaterialRow[];
  latestSession: LatestSessionSummary | null;
}): string {
  const { institutionName, accessionRegister, conditionByMaterial, latestSession } = params;

  const generatedAt = new Date().toLocaleDateString('en-PH', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const totalCopies = accessionRegister.reduce((s, r) => s + r.total_copies, 0);
  const totalGood = accessionRegister.reduce((s, r) => s + r.good_copies, 0);
  const totalDamaged = accessionRegister.reduce((s, r) => s + r.damaged_copies, 0);
  const totalLost = accessionRegister.reduce((s, r) => s + r.lost_copies, 0);

  const accessionRows = accessionRegister.map((r, i) => {
    const hasDamaged = r.damaged_copies > 0;
    const hasLost = r.lost_copies > 0;
    const rowStyle = hasLost ? 'background:#fff5f5' : hasDamaged ? 'background:#fffbeb' : '';
    return `<tr style="${rowStyle}">
      <td style="color:#888;text-align:center">${i + 1}</td>
      <td>${r.call_number ?? '—'}</td>
      <td><strong>${r.title}</strong><br/><span style="color:#666;font-size:9pt">${r.author}</span></td>
      <td>${r.publisher ?? '—'}</td>
      <td style="text-align:center">${r.year ?? '—'}</td>
      <td>${MATERIAL_LABEL[r.material_type] ?? r.material_type}</td>
      <td style="text-align:center;font-weight:700">${r.total_copies}</td>
      <td style="text-align:center;color:#16A34A;font-weight:700">${r.good_copies}</td>
      <td style="text-align:center;color:${hasDamaged ? '#D97706' : '#aaa'};font-weight:${hasDamaged ? '700' : '400'}">${r.damaged_copies}</td>
      <td style="text-align:center;color:${hasLost ? '#DC2626' : '#aaa'};font-weight:${hasLost ? '700' : '400'}">${r.lost_copies}</td>
    </tr>`;
  }).join('');

  const conditionRows = conditionByMaterial.map((r) =>
    `<tr>
      <td>${MATERIAL_LABEL[r.material_type] ?? r.material_type}</td>
      <td style="text-align:center;color:#16A34A;font-weight:700">${r.good}</td>
      <td style="text-align:center;color:#D97706;font-weight:700">${r.damaged}</td>
      <td style="text-align:center;color:#DC2626;font-weight:700">${r.lost}</td>
      <td style="text-align:center;font-weight:700">${r.total}</td>
    </tr>`
  ).join('');

  const sessionHtml = latestSession
    ? `<div class="session-card">
        <div class="session-meta">Last Physical Count: <strong>${new Date(latestSession.session.started_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}</strong></div>
        <div class="session-chips">
          <span class="chip">${latestSession.total_scanned} items scanned</span>
          <span class="chip">${latestSession.unique_isbns} unique ISBNs</span>
          ${latestSession.ghost_count > 0 ? `<span class="chip warn">${latestSession.ghost_count} ghost copies</span>` : ''}
          ${latestSession.phantom_count > 0 ? `<span class="chip warn">${latestSession.phantom_count} phantom returns</span>` : ''}
          ${latestSession.unknown_count > 0 ? `<span class="chip warn">${latestSession.unknown_count} unknown ISBNs</span>` : ''}
          ${latestSession.ghost_count === 0 && latestSession.phantom_count === 0 && latestSession.unknown_count === 0 ? '<span class="chip ok">No discrepancies</span>' : ''}
        </div>
      </div>`
    : '<p style="color:#888;font-size:10pt">No completed inventory scan on record.</p>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10pt; color: #1a1a1a; padding: 36px 44px; line-height: 1.5; }
  .header { border-bottom: 2px solid #2A5C33; padding-bottom: 12px; margin-bottom: 20px; }
  .header h1 { font-size: 17pt; font-weight: 800; color: #2A5C33; }
  .header h2 { font-size: 12pt; font-weight: 600; margin-top: 3px; }
  .meta { font-size: 9pt; color: #666; margin-top: 5px; }
  .section { margin-bottom: 26px; }
  .section-title { font-size: 10pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; color: #2A5C33; border-bottom: 1px solid #c8e6c9; padding-bottom: 4px; margin-bottom: 10px; }
  .summary-grid { display: flex; gap: 10px; margin-bottom: 14px; }
  .stat { border: 1px solid #dde; border-radius: 6px; padding: 9px 14px; flex: 1; }
  .stat .val { font-size: 18pt; font-weight: 800; color: #2A5C33; }
  .stat.warn .val { color: #D97706; }
  .stat.danger .val { color: #DC2626; }
  .stat .lbl { font-size: 8pt; color: #666; text-transform: uppercase; letter-spacing: 0.4px; margin-top: 1px; }
  .session-card { background: #f0fdf4; border-left: 3px solid #2A5C33; border-radius: 0 6px 6px 0; padding: 10px 14px; }
  .session-meta { font-size: 10pt; margin-bottom: 6px; }
  .session-chips { display: flex; gap: 8px; flex-wrap: wrap; }
  .chip { font-size: 9pt; font-weight: 600; background: #e2efe0; color: #2A5C33; border-radius: 4px; padding: 2px 8px; }
  .chip.warn { background: #FEF3C7; color: #D97706; }
  .chip.ok { background: #DCFCE7; color: #16A34A; }
  table { width: 100%; border-collapse: collapse; font-size: 9pt; }
  th { background: #2A5C33; color: #fff; text-align: left; padding: 6px 8px; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.4px; }
  td { padding: 6px 8px; border-bottom: 1px solid #eee; vertical-align: top; font-size: 9pt; }
  tr:last-child td { border-bottom: none; }
  .footer { margin-top: 36px; padding-top: 10px; border-top: 1px solid #ddd; font-size: 8pt; color: #888; }
</style>
</head>
<body>

<div class="header">
  <h1>${institutionName}</h1>
  <h2>Library Inventory &amp; Audit Report — Accession Register</h2>
  <div class="meta">Generated: ${generatedAt}</div>
</div>

<div class="section">
  <div class="section-title">Collection Summary</div>
  <div class="summary-grid">
    <div class="stat"><div class="val">${accessionRegister.length}</div><div class="lbl">Total Titles</div></div>
    <div class="stat"><div class="val">${totalCopies}</div><div class="lbl">Total Copies</div></div>
    <div class="stat"><div class="val">${totalGood}</div><div class="lbl">Good Condition</div></div>
    <div class="stat warn"><div class="val">${totalDamaged}</div><div class="lbl">Damaged</div></div>
    <div class="stat danger"><div class="val">${totalLost}</div><div class="lbl">Lost</div></div>
  </div>
</div>

<div class="section">
  <div class="section-title">Last Physical Inventory Count</div>
  ${sessionHtml}
</div>

<div class="section">
  <div class="section-title">Condition by Material Type</div>
  ${conditionByMaterial.length === 0
    ? '<p style="color:#888;font-size:9pt">No copy data on record.</p>'
    : `<table>
        <thead><tr><th>Material Type</th><th style="text-align:center">Good</th><th style="text-align:center">Damaged</th><th style="text-align:center">Lost</th><th style="text-align:center">Total</th></tr></thead>
        <tbody>${conditionRows}</tbody>
      </table>`}
</div>

<div class="section">
  <div class="section-title">Accession Register (${accessionRegister.length} titles)</div>
  ${accessionRegister.length === 0
    ? '<p style="color:#888;font-size:9pt">No resources on record.</p>'
    : `<table>
        <thead>
          <tr>
            <th style="text-align:center;width:28px">#</th>
            <th style="width:80px">Call No.</th>
            <th>Title / Author</th>
            <th style="width:90px">Publisher</th>
            <th style="text-align:center;width:40px">Year</th>
            <th style="width:80px">Type</th>
            <th style="text-align:center;width:40px">Copies</th>
            <th style="text-align:center;width:36px">Good</th>
            <th style="text-align:center;width:40px">Dmgd</th>
            <th style="text-align:center;width:36px">Lost</th>
          </tr>
        </thead>
        <tbody>${accessionRows}</tbody>
      </table>`}
</div>

<div class="footer">
  This Accession Register was generated by the library management system and reflects the current catalog as of the generation date.
  Row highlighting: yellow = has damaged copies &nbsp;·&nbsp; red = has lost copies.
</div>

</body>
</html>`;
}
