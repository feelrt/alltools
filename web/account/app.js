async function api(path, { method = "GET", body, headers } = {}) {
  const init = { method, credentials: "same-origin", headers: headers || {} };
  if (body !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const resp = await fetch(path, init);
  const text = await resp.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch (_) { data = { raw: text }; }
  if (!resp.ok) {
    const msg = data.detail || data.message || JSON.stringify(data) || ("HTTP " + resp.status);
    throw new Error(msg);
  }
  return data;
}

function qs(name){return new URLSearchParams(location.search).get(name)}

function setStatus(el, msg, type){
  el.textContent = msg || "";
  el.className = "status " + (type || "");
}

async function requireMe(){
  try { return await api("/api/v1/auth/me"); } catch(e){ return null; }
}
