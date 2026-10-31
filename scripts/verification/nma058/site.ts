// Local deterministic site: real browser navigation, ordinary form, persistent cookie/storage and expiry.
const sessions = new Map<string, { valid: boolean; name: string }>();
const server = Bun.serve({ hostname: "0.0.0.0", port: 49958, async fetch(request) {
  const url = new URL(request.url);
  if(url.pathname === "/revoke" && request.method === "POST") { for(const session of sessions.values()) session.valid=false; return Response.json({ revoked:true }); }
  const token = /fixture_session=([^;]+)/.exec(request.headers.get("Cookie")??"")?.[1];
  const session = token ? sessions.get(token) : undefined;
  if(url.pathname === "/login" && request.method === "POST") {
    const data=await request.formData();const id=crypto.randomUUID();sessions.set(id,{valid:true,name:String(data.get("name"))});
    return new Response(null,{status:303,headers:{Location:"/account", "Set-Cookie":`fixture_session=${id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400`}});
  }
  if(url.pathname === "/account" && !session?.valid) return Response.redirect(new URL("/login",url),302);
  const marker=session?.valid ? `Verified account ${session.name}` : "Signed out";
  const html=`<!doctype html><html><head><title>Ngertiin browser proof</title><style>body{margin:40px;font:24px sans-serif;background:#f4f3ef}#marker{width:240px;height:120px;background:rgb(17,173,129)}input,button,a{display:block;font:22px sans-serif;margin:20px 0;padding:12px}#tab{background:rgb(235,121,37);width:190px;height:90px}</style></head><body><h1>${url.pathname === "/second" ? "Second managed tab" : "Browser proof"}</h1><div id="marker"></div><a href="/account">${marker}</a>${url.pathname === "/login" ? '<form method="post" action="/login"><label>Name <input name="name" placeholder="Proof name" /></label><button>Sign in to local fixture</button></form>' : '<a href="/second" target="_blank">Open second tab</a><input id="note" placeholder="Persistent note" /><button onclick="localStorage.setItem(\'note\',document.getElementById(\'note\').value);document.getElementById(\'saved\').textContent=\'Saved note: \'+localStorage.getItem(\'note\')">Save note</button><a id="saved" href="#"></a><div id="tab"></div><script>document.getElementById("note").value=localStorage.getItem("note")||"";document.getElementById("saved").textContent="Saved note: "+(localStorage.getItem("note")||"")</script>'}</body></html>`;
  return new Response(html,{headers:{"Content-Type":"text/html"}});
}});
console.log(JSON.stringify({port:server.port}));
