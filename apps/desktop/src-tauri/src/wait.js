async function poll() {
  try {
    const status = await (await fetch("/_desktop/status")).json();
    document.getElementById("status").textContent = status.message;
    document.getElementById("retry").hidden = status.state !== "failed";
    if (status.state === "ready") { location.reload(); return; }
  } catch { /* Keep polling while the local gateway reconnects. */ }
  setTimeout(poll, 1000);
}
document.getElementById("retry").onclick = () => fetch("/_desktop/retry", { method: "POST" });
poll();
