import { FineDetailRow, FineDebtorRow, FineMonthlyRow, FinesSummary } from '../services/FinesReportService';

function fmt(n: number): string {
  return n.toFixed(2);
}

function fmtDate(s: string | null): string {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function buildFinesReportHtml(params: {
  institutionName: string;
  summary: FinesSummary;
  monthly: FineMonthlyRow[];
  debtors: FineDebtorRow[];
  details: FineDetailRow[];
}): string {
  const { institutionName, summary, monthly, debtors, details } = params;

  const generatedAt = new Date().toLocaleDateString('en-PH', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const maxCollected = monthly.reduce((m, r) => Math.max(m, r.collected), 1);

  const monthlyRows = monthly.map((r) => {
    const pct = Math.round((r.collected / maxCollected) * 100);
    return `<tr>
      <td>${r.label}</td>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div style="flex:1;background:#eee;border-radius:3px;height:10px;overflow:hidden">
            <div style="width:${pct}%;background:#16A34A;height:10px;border-radius:3px"></div>
          </div>
          <span style="font-weight:700;color:#16A34A;white-space:nowrap">₱ ${fmt(r.collected)}</span>
        </div>
      </td>
    </tr>`;
  }).join('');

  const debtorRows = debtors.map((r, i) =>
    `<tr>
      <td style="color:#888;text-align:center">${i + 1}</td>
      <td><strong>${r.user_name}</strong><br/><span style="color:#888;font-size:8.5pt">${r.user_id_number}</span></td>
      <td style="text-align:right;color:#DC2626;font-weight:700">₱ ${fmt(r.pending)}</td>
      <td style="text-align:right;color:#666">₱ ${fmt(r.total_fines)}</td>
    </tr>`
  ).join('');

  const detailRows = details.map((r, i) => {
    const paidStyle = r.paid ? 'color:#16A34A' : 'color:#DC2626';
    return `<tr style="${i % 2 === 1 ? 'background:#fafafa' : ''}">
      <td style="color:#888;text-align:center">${r.fine_id}</td>
      <td><strong>${r.member_name}</strong><br/><span style="color:#888;font-size:8.5pt">${r.member_id_number}</span></td>
      <td>${r.book_title}</td>
      <td style="text-align:center">${fmtDate(r.due_date)}</td>
      <td style="text-align:right;font-weight:700">₱ ${fmt(r.amount)}</td>
      <td style="text-align:center;font-weight:700;${paidStyle}">${r.paid ? `Paid<br/><span style="font-size:8pt;font-weight:400">${fmtDate(r.paid_at)}</span>` : 'Pending'}</td>
    </tr>`;
  }).join('');

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
  .stat .val { font-size: 16pt; font-weight: 800; color: #2A5C33; }
  .stat.ok .val { color: #16A34A; }
  .stat.warn .val { color: #D97706; }
  .stat.danger .val { color: #DC2626; }
  .stat .lbl { font-size: 8pt; color: #666; text-transform: uppercase; letter-spacing: 0.4px; margin-top: 1px; }
  table { width: 100%; border-collapse: collapse; font-size: 9pt; }
  th { background: #2A5C33; color: #fff; text-align: left; padding: 6px 8px; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.4px; }
  td { padding: 6px 8px; border-bottom: 1px solid #eee; vertical-align: middle; font-size: 9pt; }
  tr:last-child td { border-bottom: none; }
  .footer { margin-top: 36px; padding-top: 10px; border-top: 1px solid #ddd; font-size: 8pt; color: #888; }
</style>
</head>
<body>

<div class="header">
  <h1>${institutionName}</h1>
  <h2>Fines Report</h2>
  <div class="meta">Generated: ${generatedAt}</div>
</div>

<div class="section">
  <div class="section-title">Summary</div>
  <div class="summary-grid">
    <div class="stat"><div class="val">₱ ${fmt(summary.total_fines)}</div><div class="lbl">Total Fines Issued</div></div>
    <div class="stat ok"><div class="val">₱ ${fmt(summary.total_collected)}</div><div class="lbl">Collected</div></div>
    <div class="stat danger"><div class="val">₱ ${fmt(summary.total_pending)}</div><div class="lbl">Pending</div></div>
    <div class="stat warn"><div class="val">${summary.unpaid_count}</div><div class="lbl">Unpaid Records</div></div>
  </div>
</div>

${monthly.length > 0 ? `
<div class="section">
  <div class="section-title">Monthly Collection (Last 6 Months)</div>
  <table>
    <thead><tr><th style="width:120px">Month</th><th>Collected</th></tr></thead>
    <tbody>${monthlyRows}</tbody>
  </table>
</div>` : ''}

${debtors.length > 0 ? `
<div class="section">
  <div class="section-title">Top Debtors (Pending Fines)</div>
  <table>
    <thead><tr><th style="width:28px;text-align:center">#</th><th>Member</th><th style="text-align:right">Pending</th><th style="text-align:right">Total Fined</th></tr></thead>
    <tbody>${debtorRows}</tbody>
  </table>
</div>` : ''}

<div class="section">
  <div class="section-title">Fine Records (Recent ${details.length})</div>
  ${details.length === 0
    ? '<p style="color:#888;font-size:9pt">No fine records on record.</p>'
    : `<table>
        <thead>
          <tr>
            <th style="width:32px;text-align:center">#</th>
            <th>Member</th>
            <th>Book</th>
            <th style="text-align:center;width:80px">Due Date</th>
            <th style="text-align:right;width:70px">Amount</th>
            <th style="text-align:center;width:70px">Status</th>
          </tr>
        </thead>
        <tbody>${detailRows}</tbody>
      </table>`}
</div>

<div class="footer">
  This Fines Report was generated by the library management system. All amounts are in Philippine Peso (₱).
</div>

</body>
</html>`;
}
