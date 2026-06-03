import {
  CirculationOverview,
  MonthlyTrendRow,
  TopBorrowerRow,
  MostBorrowedRow,
} from '../services/CirculationReportService';
import { BorrowingRecord } from '../types';

function th(...cells: string[]): string {
  return `<tr>${cells.map((c) => `<th>${c}</th>`).join('')}</tr>`;
}
function td(...cells: string[]): string {
  return `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;
}

export function buildCirculationReportHtml(params: {
  institutionName: string;
  overview: CirculationOverview;
  monthly: MonthlyTrendRow[];
  topBorrowers: TopBorrowerRow[];
  mostBorrowed: MostBorrowedRow[];
  overdue: BorrowingRecord[];
}): string {
  const { institutionName, overview, monthly, topBorrowers, mostBorrowed, overdue } = params;

  const generatedAt = new Date().toLocaleDateString('en-PH', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const monthlyRows = monthly
    .map((r) => td(r.label, String(r.borrows), String(r.returns), String(r.borrows - r.returns)))
    .join('');

  const borrowerRows = topBorrowers
    .map((r, i) => td(String(i + 1), r.user_name, r.user_id_number, String(r.total_borrows), String(r.active_borrows)))
    .join('');

  const mostBorrowedRows = mostBorrowed
    .map((r, i) => td(String(i + 1), r.title, r.author, String(r.borrow_count)))
    .join('');

  const overdueRows = overdue
    .map((r) => {
      const daysOverdue = Math.ceil((Date.now() - new Date(r.due_date).getTime()) / 86400000);
      return td(
        r.member_name ?? '',
        r.member_id_number ?? '',
        r.book_title ?? '',
        new Date(r.due_date).toLocaleDateString('en-PH'),
        `${daysOverdue} day${daysOverdue !== 1 ? 's' : ''}`,
      );
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11pt; color: #1a1a1a; padding: 40px 48px; line-height: 1.5; }
  .header { border-bottom: 2px solid #2A5C33; padding-bottom: 14px; margin-bottom: 24px; }
  .header h1 { font-size: 18pt; font-weight: 800; color: #2A5C33; }
  .header h2 { font-size: 13pt; font-weight: 600; color: #1a1a1a; margin-top: 4px; }
  .meta { font-size: 9pt; color: #666; margin-top: 6px; }
  .section { margin-bottom: 28px; }
  .section-title { font-size: 11pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; color: #2A5C33; border-bottom: 1px solid #c8e6c9; padding-bottom: 5px; margin-bottom: 12px; }
  .stats-grid { display: flex; gap: 12px; flex-wrap: wrap; }
  .stat-box { border: 1px solid #dde; border-radius: 6px; padding: 10px 16px; min-width: 110px; flex: 1; }
  .stat-box .value { font-size: 20pt; font-weight: 800; color: #2A5C33; }
  .stat-box.warn .value { color: #D97706; }
  .stat-box.danger .value { color: #DC2626; }
  .stat-box .label { font-size: 8pt; color: #666; text-transform: uppercase; letter-spacing: 0.4px; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; font-size: 10pt; }
  th { background: #2A5C33; color: #fff; text-align: left; padding: 7px 10px; font-size: 9pt; text-transform: uppercase; letter-spacing: 0.4px; }
  td { padding: 7px 10px; border-bottom: 1px solid #eee; }
  tr:last-child td { border-bottom: none; }
  tr:nth-child(even) td { background: #f9fafb; }
  .overdue-note { background: #FEF3C7; border-left: 3px solid #D97706; padding: 8px 12px; font-size: 10pt; border-radius: 0 4px 4px 0; margin-bottom: 12px; }
  .footer { margin-top: 40px; padding-top: 12px; border-top: 1px solid #ddd; font-size: 9pt; color: #888; }
</style>
</head>
<body>

<div class="header">
  <h1>${institutionName}</h1>
  <h2>Library Circulation Report</h2>
  <div class="meta">Generated: ${generatedAt}</div>
</div>

<div class="section">
  <div class="section-title">Circulation Overview</div>
  <div class="stats-grid">
    <div class="stat-box"><div class="value">${overview.total_borrows}</div><div class="label">Total Borrows</div></div>
    <div class="stat-box warn"><div class="value">${overview.currently_borrowed}</div><div class="label">Currently Out</div></div>
    <div class="stat-box danger"><div class="value">${overview.overdue}</div><div class="label">Overdue</div></div>
    <div class="stat-box"><div class="value">${overview.returned}</div><div class="label">Returned</div></div>
    <div class="stat-box"><div class="value">${overview.active_borrowers}</div><div class="label">Active Borrowers</div></div>
  </div>
</div>

<div class="section">
  <div class="section-title">Monthly Trends (Last 12 Months)</div>
  ${monthly.length === 0 ? '<p style="color:#888;font-size:10pt;">No transaction data available.</p>' : `
  <table>
    <thead>${th('Month', 'Borrowed', 'Returned', 'Net Out')}</thead>
    <tbody>${monthlyRows}</tbody>
  </table>`}
</div>

<div class="section">
  <div class="section-title">Most Borrowed Books (Top 10)</div>
  ${mostBorrowed.length === 0 ? '<p style="color:#888;font-size:10pt;">No data available.</p>' : `
  <table>
    <thead>${th('#', 'Title', 'Author', 'Times Borrowed')}</thead>
    <tbody>${mostBorrowedRows}</tbody>
  </table>`}
</div>

<div class="section">
  <div class="section-title">Top Borrowers (Top 10)</div>
  ${topBorrowers.length === 0 ? '<p style="color:#888;font-size:10pt;">No data available.</p>' : `
  <table>
    <thead>${th('#', 'Name', 'ID Number', 'Total Borrows', 'Currently Borrowed')}</thead>
    <tbody>${borrowerRows}</tbody>
  </table>`}
</div>

${overdue.length > 0 ? `
<div class="section">
  <div class="section-title">Overdue Materials (${overdue.length})</div>
  <div class="overdue-note">These items are past their due date and have not been returned.</div>
  <table>
    <thead>${th('Member', 'ID Number', 'Book Title', 'Due Date', 'Days Overdue')}</thead>
    <tbody>${overdueRows}</tbody>
  </table>
</div>` : ''}

<div class="footer">
  This report was generated by the library management system.
</div>

</body>
</html>`;
}
