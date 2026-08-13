const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'client', 'public');
const sourcePath = path.join(publicDir, 'readxiv-logo-icon.svg');
app.setPath('userData', path.join(root, '.perf', 'logo-render-user-data'));

app.whenReady().then(async () => {
  const source = fs.readFileSync(sourcePath, 'utf8');
  const size = 512;
  const window = new BrowserWindow({
    show: false,
    width: size,
    height: size,
    transparent: true,
    frame: false,
    webPreferences: {
      offscreen: true,
    },
  });
  const encoded = Buffer.from(source).toString('base64');
  const html = [
    '<!doctype html>',
    '<style>',
    'html,body{width:100%;height:100%;margin:0;background:transparent;overflow:hidden}',
    'img{display:block;width:100%;height:100%}',
    '</style>',
    `<img src="data:image/svg+xml;base64,${encoded}">`,
  ].join('');
  await window.loadURL(`data:text/html;base64,${Buffer.from(html).toString('base64')}`);
  const image = await window.webContents.capturePage();
  fs.writeFileSync(path.join(publicDir, 'readxiv-logo-icon.png'), image.toPNG());
  fs.writeFileSync(
    path.join(publicDir, 'readxiv-logo-r-monogram.png'),
    image.resize({ width: 256, height: 256, quality: 'best' }).toPNG()
  );
  const serverPublicDir = path.join(root, 'server', 'client', 'public');
  fs.mkdirSync(serverPublicDir, { recursive: true });
  fs.writeFileSync(path.join(serverPublicDir, 'readxiv-logo-icon.png'), image.toPNG());
  fs.writeFileSync(
    path.join(serverPublicDir, 'readxiv-logo-r-monogram.png'),
    image.resize({ width: 256, height: 256, quality: 'best' }).toPNG()
  );
  window.destroy();

  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
