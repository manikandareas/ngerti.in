(() => {
  const original = window.fetch.bind(window);
  window.fetch = async (url, options) => {
    let body;
    try { body = JSON.parse(options?.body || "null"); } catch {}
    if (String(url).endsWith("/commands") && ["session.reset", "session.compress"].includes(body?.type)) {
      const entries = JSON.parse(sessionStorage.getItem("review-requests") || "[]");
      const mode = sessionStorage.getItem("review-fault");
      entries.push({body, mode});
      sessionStorage.setItem("review-requests", JSON.stringify(entries));
      if (mode === "401") {
        sessionStorage.removeItem("review-fault");
        return new Response(JSON.stringify({detail: "Synthetic expired authentication"}), {status: 401, headers: {"Content-Type": "application/json"}});
      }
      const response = await original(url, options);
      const result = await response.clone().json();
      sessionStorage.setItem("review-last-response", JSON.stringify({status: response.status, result}));
      if (mode === "lost-ack" && response.ok) {
        sessionStorage.removeItem("review-fault");
        throw new TypeError("Synthetic response loss after durable acceptance");
      }
      return response;
    }
    return original(url, options);
  };
  return "fault wrapper installed";
})()
