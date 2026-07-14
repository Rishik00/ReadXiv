# ReadXiv Capture extension

A minimal Manifest V3 Chrome extension that sends the active arXiv abstract or PDF URL to the local ReadXiv server.

## Load the prototype

1. Start ReadXiv with `npm run dev` (or otherwise run the server on port `7474`).
2. Open `chrome://extensions` and enable **Developer mode**.
3. Choose **Load unpacked** and select this `extension` directory.
4. Pin **ReadXiv Capture** if you want a permanent toolbar button.

Open an `arxiv.org/abs/...` or `arxiv.org/pdf/...` tab, then click the toolbar button or press **Alt+Shift+S**. Press Enter or choose **Add to library**. Chrome shows a notification when the paper is added, already exists, or cannot be added. After capture, choose **Visit paper** to open its ReadXiv reader.

Chrome may reserve or override a suggested shortcut. Set a different one at `chrome://extensions/shortcuts` if needed.

## Prototype constraints

- The server address is intentionally fixed at `http://localhost:7474`.
- Only arXiv abstract and PDF URLs are accepted, matching the current backend API.
- ReadXiv's frontend does not need to be open, but its local backend must be running.
