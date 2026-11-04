// Shared by Hub pages and the DEMO gateway. No third-party tracker or identifiers in JS.
(() => {
  if (location.hostname !== "osh.ai.kr" && location.hostname !== "127.0.0.1" && location.hostname !== "localhost") return;
  let busy = false;
  let last = 0;
  async function heartbeat() {
    if (document.visibilityState !== "visible" || busy || Date.now() - last < 30000) return;
    busy = true;
    last = Date.now();
    try {
      await fetch("/api/activity", { method: "POST", credentials: "same-origin", cache: "no-store" });
    } catch { /* Analytics failure must not interrupt the page. */ }
    finally { busy = false; }
  }
  void heartbeat();
  setInterval(heartbeat, 60000);
  document.addEventListener("visibilitychange", heartbeat);
})();
