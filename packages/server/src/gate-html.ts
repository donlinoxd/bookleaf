export const GATE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Library Gate Check-in</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:system-ui,sans-serif;background:#F4F9F4;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
  .card{background:#fff;border-radius:20px;padding:32px 28px;width:100%;max-width:380px;box-shadow:0 4px 24px rgba(42,92,51,.1)}
  h1{color:#2A5C33;font-size:22px;font-weight:800;margin-bottom:4px}
  p{color:#7A9A7E;font-size:13px;margin-bottom:24px}
  label{display:block;font-size:12px;font-weight:700;color:#2A5C33;margin-bottom:6px;letter-spacing:.5px;text-transform:uppercase}
  input{width:100%;border:1.5px solid #D1E8D0;border-radius:12px;padding:13px 16px;font-size:15px;color:#1C2B1E;outline:none;margin-bottom:16px}
  input:focus{border-color:#2A5C33}
  button{width:100%;background:#5CB85C;color:#fff;border:none;border-radius:14px;padding:15px;font-size:16px;font-weight:700;cursor:pointer}
  button:active{background:#2A5C33}
  .msg{margin-top:20px;padding:14px 16px;border-radius:12px;font-size:14px;font-weight:600;text-align:center}
  .in{background:#DCFCE7;color:#16A34A}
  .out{background:#FEF3C7;color:#D97706}
  .err{background:#FEE2E2;color:#DC2626}
</style>
</head>
<body>
<div class="card">
  <h1>📚 Library Gate</h1>
  <p>Enter your library ID and PIN to check in or out.</p>
  <form id="f">
    <label>Library ID</label>
    <input id="id" type="text" autocomplete="off" placeholder="e.g. 2024-001" required/>
    <label>PIN</label>
    <input id="pin" type="password" placeholder="4-digit PIN" required/>
    <button type="submit">Check In / Out</button>
  </form>
  <div id="msg"></div>
</div>
<script>
document.getElementById('f').addEventListener('submit',async function(e){
  e.preventDefault();
  const btn=document.querySelector('button');
  btn.disabled=true;btn.textContent='Please wait…';
  const msgEl=document.getElementById('msg');
  msgEl.className='msg';msgEl.textContent='';
  try{
    const r=await fetch(location.pathname+'/login',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({idNumber:document.getElementById('id').value,pin:document.getElementById('pin').value})
    });
    const d=await r.json();
    if(!r.ok||d.error){msgEl.className='msg err';msgEl.textContent=d.error||'Login failed.';}
    else{
      const dir=d.direction==='in'?'✅ Checked IN':'👋 Checked OUT';
      msgEl.className='msg '+(d.direction==='in'?'in':'out');
      msgEl.textContent=dir+' — '+d.user_name;
      document.getElementById('id').value='';
      document.getElementById('pin').value='';
    }
  }catch{msgEl.className='msg err';msgEl.textContent='Cannot reach server.';}
  finally{btn.disabled=false;btn.textContent='Check In / Out';}
});
</script>
</body>
</html>`;
