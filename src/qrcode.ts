import * as vscode from 'vscode';
import * as QRCode from 'qrcode';

export async function showQRPanel(context: vscode.ExtensionContext, url: string) {
	const panel = vscode.window.createWebviewPanel(
		'copilotPortalQR',
		'Copilot Portal — Connect Phone',
		vscode.ViewColumn.Beside,
		{ enableScripts: false },
	);

	const qrDataUrl = await QRCode.toDataURL(url, { width: 300, margin: 2 });

	panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Copilot Portal — Connect Phone</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 32px;
      box-sizing: border-box;
      background: var(--vscode-editor-background, #1e1e1e);
      color: var(--vscode-editor-foreground, #ccc);
    }
    h2 { margin: 0 0 4px; font-size: 20px; }
    p { margin: 0 0 24px; opacity: 0.6; font-size: 14px; }
    img { border: 8px solid white; border-radius: 8px; display: block; }
    .url {
      margin-top: 20px;
      background: var(--vscode-input-background, #2d2d2d);
      padding: 10px 16px;
      border-radius: 6px;
      font-family: monospace;
      font-size: 12px;
      word-break: break-all;
      max-width: 340px;
      text-align: center;
      opacity: 0.8;
    }
    .note { margin-top: 12px; font-size: 12px; opacity: 0.5; text-align: center; }
  </style>
</head>
<body>
  <h2>Copilot Portal</h2>
  <p>Scan with your phone camera to connect</p>
  <img src="${qrDataUrl}" width="300" height="300" alt="QR Code" />
  <div class="url">${url}</div>
  <p class="note">Token is included in the URL. Keep it private.</p>
</body>
</html>`;
}
