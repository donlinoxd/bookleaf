import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

interface Params {
  name: string;
  idNumber: string;
  role: string;
  institutionName: string;
  qrDataUrl: string;
}

export async function printMemberCard({ name, idNumber, role, institutionName, qrDataUrl }: Params) {
  const roleColor: Record<string, string> = {
    admin: '#7C3AED',
    librarian: '#2563EB',
    member: '#16A34A',
  };
  const color = roleColor[role] ?? '#64748B';
  const initial = name.charAt(0).toUpperCase();

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; padding: 32px; background: #F8FAFC; }
    .card {
      width: 340px;
      border-radius: 14px;
      overflow: hidden;
      border: 1px solid #E2E8F0;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
      background: #FFFFFF;
    }
    .card-header {
      background: #1E293B;
      padding: 14px 18px;
    }
    .institution { color: #FFFFFF; font-size: 14px; font-weight: bold; }
    .library-label { color: #94A3B8; font-size: 10px; margin-top: 3px; letter-spacing: 1px; }
    .card-body {
      display: flex;
      flex-direction: row;
      align-items: center;
      padding: 18px;
      gap: 16px;
    }
    .info { flex: 1; }
    .avatar {
      width: 44px; height: 44px; border-radius: 22px;
      background: ${color}20;
      display: flex; align-items: center; justify-content: center;
      font-size: 20px; font-weight: bold; color: ${color};
      margin-bottom: 8px;
      line-height: 44px; text-align: center;
    }
    .name { font-size: 17px; font-weight: bold; color: #1E293B; margin-bottom: 4px; }
    .role-badge {
      display: inline-block;
      background: ${color}20; color: ${color};
      font-size: 10px; font-weight: bold;
      padding: 3px 8px; border-radius: 4px;
      letter-spacing: 0.5px;
      margin-bottom: 12px;
    }
    .id-label { font-size: 10px; color: #94A3B8; letter-spacing: 1px; margin-bottom: 3px; }
    .id-number { font-size: 15px; font-weight: bold; color: #1E293B; letter-spacing: 1px; font-family: monospace; }
    .qr img { width: 110px; height: 110px; display: block; }
    .cut-hint {
      margin-top: 12px;
      font-size: 10px; color: #94A3B8; text-align: center;
      border-top: 1px dashed #CBD5E1; padding-top: 8px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="card-header">
      <div class="institution">${escapeHtml(institutionName)}</div>
      <div class="library-label">LIBRARY CARD</div>
    </div>
    <div class="card-body">
      <div class="info">
        <div class="avatar">${escapeHtml(initial)}</div>
        <div class="name">${escapeHtml(name)}</div>
        <div class="role-badge">${escapeHtml(role.toUpperCase())}</div>
        <div class="id-label">ID NUMBER</div>
        <div class="id-number">${escapeHtml(idNumber)}</div>
      </div>
      <div class="qr">
        <img src="${qrDataUrl}" width="110" height="110" />
      </div>
    </div>
  </div>
  <div class="cut-hint">Cut along line and laminate for durability</div>
</body>
</html>`;

  const { uri } = await Print.printToFileAsync({ html, width: 420, height: 280 });
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Save Member Card PDF' });
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
