async function useTool(toolKey, toolUrl) {
  const me = await fetch('/api/v1/me');
  if (me.status === 401) {
    document.getElementById('login-modal').style.display = 'block';
    return;
  }
  const check = await fetch('/api/v1/tools/check', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({tool_key: toolKey})
  });
  const data = await check.json();
  if (!data.ok) {
    document.getElementById('points-modal').style.display = 'block';
    return;
  }
  window.location.href = toolUrl;
}