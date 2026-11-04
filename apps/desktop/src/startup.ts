export const startupPage = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width">
<title>Ngertiin Dev</title>
<style>
  body {
    background: #171717;
    color: #eee;
    font: 15px system-ui;
    display: grid;
    place-content: center;
    min-height: 90vh;
    margin: 0;
  }
  main { max-width: 440px; padding: 32px; }
  h1 { font-size: 24px; }
  p { color: #aaa; line-height: 1.6; }
  button {
    padding: 10px 18px;
    border: 1px solid #555;
    border-radius: 8px;
    background: #292929;
    color: white;
    cursor: pointer;
  }
</style>
<main>
  <h1>Ngertiin Dev</h1>
  <p id="status">Preparing your workspace…</p>
  <button id="retry" hidden>Try again</button>
</main>
<script src="/_desktop/wait.js"></script>
</html>`;

export const startupScript = `
async function poll() {
  try {
    const status = await (await fetch('/_desktop/status')).json();
    document.getElementById('status').textContent = status.message;
    document.getElementById('retry').hidden = status.state !== 'failed';
    if (status.state === 'ready') {
      location.reload();
      return;
    }
  } catch {
    // Keep polling while the local gateway reconnects.
  }
  setTimeout(poll, 1000);
}
document.getElementById('retry').onclick = async () => {
  await fetch('/_desktop/retry', { method: 'POST' });
};
poll();
`;
