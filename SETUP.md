# Setup Instructions

## Database Setup

We're using `sql.js` (pure JavaScript SQLite) which doesn't require native compilation - it works on all platforms!

### Option 1: Install Visual Studio Build Tools (Recommended)

1. Download Visual Studio Build Tools: https://visualstudio.microsoft.com/downloads/
2. Run the installer and select "Desktop development with C++" workload
3. Restart your terminal
4. Run `npm install` in the `server/` directory

### Option 2: Use Prebuilt Binaries

If you can't install build tools, try:
```bash
cd server
npm install better-sqlite3 --build-from-source=false
```

### Option 3: Skip Database for Now

The frontend will work without the database. You can develop UI components first and add database functionality later.

## Verification

After installation, verify everything works:

1. **Start the server:**
   ```bash
   cd server
   npm run dev
   ```
   You should see: `🚀 Papyrus server running on http://localhost:7474`

2. **Start the client:**
   ```bash
   cd client
   npm run dev
   ```
   You should see: `Local: http://localhost:5173`

3. **Test the API:**
   Open http://localhost:7474/health in your browser
   Should return: `{"status":"ok","timestamp":"..."}`

## Troubleshooting

- **"Could not find Visual Studio"**: Install Visual Studio Build Tools (see Option 1)
- **Port already in use**: Change ports in `server/index.js` and `client/vite.config.js`
- **Database errors**: Make sure `better-sqlite3` compiled successfully
