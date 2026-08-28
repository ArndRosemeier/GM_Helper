# GM Cockpit

Tablet-first PWA for a live-table GM. Just-in-time cards, local source ingest, optional OpenRouter, and a player-safe battleground when the iPad is laid flat.

```bash
npm install
npm run dev
```

Install to the iPad home screen from Safari. Add an OpenRouter key in Settings if you want AI NPC lift, portraits, or map sketches. The core works offline.

Linux: `./ship.sh "message"` / `./deploy-sync.sh` — set `FTP_PASSWORD` in the env (never commit it).
Windows: `deploy-sync.ps1` / `deploy-sync.bat` still exist for the same incremental FTP deploy.
## Deploy from GitHub

Add a repository secret named `FTP_PASSWORD`, then push to `main` (or run the **Deploy to futuremagic.de** workflow manually). CI builds with `npm run build:domainfactory` and incrementally syncs `dist/` to the live site.
