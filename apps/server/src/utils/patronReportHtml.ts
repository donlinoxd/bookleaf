import {
  PatronOverview,
  PatronByTypeRow,
  PatronByDepartmentRow,
  PatronRegistrationRow,
  AttendanceMonthRow,
} from '../services/PatronReportService';

const USER_TYPE_LABEL: Record<string, string> = {
  student: 'Student',
  faculty: 'Faculty / Staff',
  alumni: 'Alumni',
  external: 'External',
};

export function buildPatronReportHtml(params: {
  institutionName: string;
  overview: PatronOverview;
  byType: PatronByTypeRow[];
  byDepartment: PatronByDepartmentRow[];
  registrations: PatronRegistrationRow[];
  attendance: AttendanceMonthRow[];
}): string {
  const { institutionName, overview, byType, byDepartment, registrations, attendance } = params;

  const generatedAt = new Date().toLocaleDateString('en-PH', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const maxReg = registrations.reduce((m, r) => Math.max(m, r.count), 1);
  const maxVisit = attendance.reduce((m, r) => Math.max(m, r.unique_visitors), 1);

  const typeRows = byType.map((r) =>
    `<tr>
      <td>${USER_TYPE_LABEL[r.user_type] ?? r.user_type}</td>
      <td style="text-align:center;font-weight:700">${r.count}</td>
      <td style="text-align:center;color:#16A34A;font-weight:700">${r.active}</td>
      <td style="text-align:center;color:#94A3B8">${r.count - r.active}</td>
    </tr>`
  ).join('');

  const deptRows = byDepartment.map((r, i) =>
    `<tr style="${i % 2 === 1 ? 'background:#fafafa' : ''}">
      <td><strong>${r.department}</strong></td>
      <td style="text-align:center;font-weight:700">${r.count}</td>
      <td style="text-align:center;color:#16A34A;font-weight:700">${r.active_borrowers}</td>
    </tr>`
  ).join('');

  const regRows = registrations.map((r) => {
    const pct = Math.round((r.count / maxReg) * 100);
    return `<tr>
      <td>${r.label}</td>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div style="flex:1;background:#eee;border-radius:3px;height:10px;overflow:hidden">
            <div style="width:${pct}%;background:#2A5C33;height:10px;border-radius:3px"></div>
          </div>
          <span style="font-weight:700;color:#2A5C33;white-space:nowrap">${r.count}</span>
        </div>
      </td>
    </tr>`;
  }).join('');

  const attRows = attendance.map((r) => {
    const pct = Math.round((r.unique_visitors / maxVisit) * 100);
    return `<tr>
      <td>${r.label}</td>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div style="flex:1;background:#eee;border-radius:3px;height:10px;overflow:hidden">
            <div style="width:${pct}%;background:#0F766E;height:10px;border-radius:3px"></div>
          </div>
          <span style="font-weight:700;color:#0F766E;white-space:nowrap">${r.unique_visitors}</span>
        </div>
      </td>
      <td style="text-align:right;color:#888">${r.total_visits} visits</td>
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
  .summary-grid { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 14px; }
  .stat { border: 1px solid #dde; border-radius: 6px; padding: 9px 14px; min-width: 100px; }
  .stat .val { font-size: 16pt; font-weight: 800; color: #2A5C33; }
  .stat.warn .val { color: #D97706; }
  .stat.danger .val { color: #DC2626; }
  .stat.muted .val { color: #64748B; }
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
  <h2>Patron / User Report</h2>
  <div class="meta">Generated: ${generatedAt} &nbsp;·&nbsp; For CHED Program Evaluation and Accreditation Use</div>
</div>

<div class="section">
  <div class="section-title">Overview</div>
  <div class="summary-grid">
    <div class="stat"><div class="val">${overview.total_members}</div><div class="lbl">Total Members</div></div>
    <div class="stat"><div class="val">${overview.active_members}</div><div class="lbl">Active</div></div>
    <div class="stat warn"><div class="val">${overview.inactive_members}</div><div class="lbl">Inactive</div></div>
    <div class="stat"><div class="val">${overview.active_borrowers}</div><div class="lbl">Currently Borrowing</div></div>
    <div class="stat muted"><div class="val">${overview.never_borrowed}</div><div class="lbl">Never Borrowed</div></div>
    <div class="stat muted"><div class="val">${overview.total_staff}</div><div class="lbl">Library Staff</div></div>
  </div>
</div>

${byType.length > 0 ? `
<div class="section">
  <div class="section-title">Members by Patron Type</div>
  <table>
    <thead><tr><th>Patron Type</th><th style="text-align:center">Total</th><th style="text-align:center">Active</th><th style="text-align:center">Inactive</th></tr></thead>
    <tbody>${typeRows}</tbody>
  </table>
</div>` : ''}

${byDepartment.length > 0 ? `
<div class="section">
  <div class="section-title">Members by Department / Program</div>
  <table>
    <thead><tr><th>Department</th><th style="text-align:center">Members</th><th style="text-align:center">Currently Borrowing</th></tr></thead>
    <tbody>${deptRows}</tbody>
  </table>
</div>` : ''}

${registrations.length > 0 ? `
<div class="section">
  <div class="section-title">New Registrations — Last 6 Months</div>
  <table>
    <thead><tr><th style="width:120px">Month</th><th>New Members</th></tr></thead>
    <tbody>${regRows}</tbody>
  </table>
</div>` : ''}

${attendance.length > 0 ? `
<div class="section">
  <div class="section-title">Library Attendance — Last 6 Months</div>
  <table>
    <thead><tr><th style="width:120px">Month</th><th>Unique Visitors</th><th style="text-align:right;width:90px">Total Visits</th></tr></thead>
    <tbody>${attRows}</tbody>
  </table>
</div>` : ''}

<div class="footer">
  This Patron Report was generated by the library management system. Patron type and department data reflect member profiles at time of generation.
</div>

</body>
</html>`;
}
