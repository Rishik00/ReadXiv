# readxiv

ReadXiv is a personal research companion for collecting and reading arXiv papers.

This repository now includes an npm CLI so you can use ReadXiv from any terminal after global install.

## Install

Scoped package install (replace with your actual npm scope):

```bash
npm install -g @your-scope/readxiv
```

Initialize local data and dependencies:

```bash
readxiv init
```

## Quick Start

```bash
# Start web app (client + server)
readxiv start:client

# Add papers
readxiv add:https://arxiv.org/abs/2301.07041
readxiv add:2301.07041

# Show database stats
readxiv show_db

# Export database to Excel
readxiv exportdb

# Remove paper
readxiv remove:2301.07041
```

## CLI Commands

### App and setup

- `readxiv init`  
  Creates `~/.papyrus/`, initializes `papyrus.db`, writes default config, installs `client` and `server` dependencies.

- `readxiv start:client`  
  Starts backend and frontend in development mode and opens browser to `http://localhost:5173`.

- `readxiv stop`  
  Stops a background ReadXiv server process started by CLI automation.

### Paper management

- `readxiv add:<arxiv_link_or_id>` or `readxiv add <arxiv_link_or_id>`  
  Adds a paper by arXiv URL or id.

- `readxiv remove:<arxiv_link_or_id>` or `readxiv remove <arxiv_link_or_id>`  
  Removes paper from DB and deletes matching local PDF/notes files.

### Database

- `readxiv show_db`  
  Prints database location, counts, status distribution, storage usage, and recent papers.

- `readxiv exportdb [output_path]`  
  Exports all papers to an `.xlsx` file. Default output is your Downloads folder.

### Projects (scaffold)

- `readxiv start_project:<project_name>` or `readxiv start_project <project_name>`  
  Creates a project scaffold under `~/.papyrus/projects/<project_name>/`.

### Config

- `readxiv config get [key]`
- `readxiv config set <key> <value>`

Supported keys:
- `serverPort`
- `clientPort`
- `autoStartServer`
- `defaultBrowser`
- `exportDir`

Todoist credentials are configured in the app (**Settings**), not via `readxiv config`; they are stored in `config.json` under `todoistApiToken` / `todoistProjectId`.

## Data Storage

ReadXiv stores data in `~/.papyrus/`:

- `papyrus.db` - SQLite database
- `pdfs/` - downloaded PDF files
- `notes/` - Markdown notes
- `canvas/` - canvas data
- `projects/` - project scaffolds
- `config.json` - CLI configuration

## Publish Checklist

1. Update package name/scope in `package.json` (for example `@your-scope/readxiv`).
2. Bump version: `npm version patch` (or `minor`/`major`).
3. Verify package contents: `npm pack --dry-run`.
4. Login to npm: `npm login`.
5. Publish scoped package: `npm publish --access public`.

## Todoist (optional)

Open **Settings** in ReadXiv (`Space c`), use the **Todoist** section: paste your [Todoist API token](https://app.todoist.com/app/settings/integrations), choose Inbox or a project (or create **ReadXiv Todoist**), then Save. Data is stored in `~/.papyrus/config.json` on that machine.

Optional: set `TODOIST_API_TOKEN` and `TODOIST_PROJECT_ID` on the **server process** to override the file. See **Help** in the app.

## Local Development

Install dependencies:

```bash
npm run install:all
```

Run web stack:

```bash
npm run dev
```

Run CLI locally without publishing:

```bash
npm run cli -- --help
```

Link globally for testing:

```bash
npm link
readxiv --help
```
