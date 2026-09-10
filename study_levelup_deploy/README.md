# Study Level — Mobile-First RPG Study Tracker

A complete Flask + SQLite daily study tracker with a minimalist RPG aesthetic.

## Features

- Math, Physics, Chemistry daily tracking.
- Streak requirement: **60 minutes in every subject**.
- XP:
  - First 60 minutes per subject: **1 XP/minute**.
  - Minutes after 60 in that subject: **3 XP/minute**.
- Leveling: every 500 XP advances the player level.
- RPG rank titles from Novice through Grandmaster.
- Full-screen focus timer with play/pause/reset/save/minimize.
- Animated timer ring and digit transitions.
- Four built-in wallpaper themes plus a custom background URL.
- Monthly calendar with completed-day indicators.
- End-of-Day Thought journal stored by date.
- SQLite persistence across browser reloads and server restarts.
- Responsive touch-first UI; desktop layout expands naturally.

## 1. Run locally

Python 3.10+ is recommended.

### Windows

```powershell
cd study_levelup
py -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Open:

`http://127.0.0.1:8501`

### macOS / Linux

```bash
cd study_levelup
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

Then open:

`http://127.0.0.1:8501`

The SQLite database `study_tracker.db` is created automatically beside `app.py`.

## 2. Open it on your phone over Wi-Fi

Make sure the phone and computer are on the same Wi-Fi.

1. Start the app with `python app.py`.
2. Find your computer's LAN IPv4 address:
   - Windows: `ipconfig`
   - macOS/Linux: `ifconfig` or `ip addr`
3. On your phone, visit:
   `http://YOUR-COMPUTER-IP:8501`
   Example: `http://192.168.1.25:8501`

If Windows Firewall asks whether Python can communicate on the network, allow it for your private network.

For a quick test, the Flask development server is intentionally bound to `0.0.0.0`.

## 3. Production hosting

For a real public deployment, don't use Flask's debug development server.

A simple Linux deployment can use Gunicorn:

```bash
pip install gunicorn
gunicorn -w 2 -b 0.0.0.0:8501 app:app
```

Put it behind HTTPS using a reverse proxy such as Nginx or a managed platform.

### Important persistence note

SQLite is ideal for a personal/single-user tracker. Back up `study_tracker.db` if the study history matters. If you deploy multiple application instances, use a hosted database such as PostgreSQL instead.

## 4. Custom wallpaper

Open **⚙ Settings → Custom background image URL**. Enter a public image URL and press **Apply World**.

The URL is saved in SQLite. Built-in image presets use remote Unsplash images, so those particular photographic backgrounds require internet access. The Minimal Dark preset works without them.

## 5. Game rules

The backend calculates XP when a completed timer session is saved. It uses the subject's accumulated minutes for the calendar day at the beginning of that session.

For example, if Math has 55 minutes and a 10-minute session is saved:

- 5 minutes × 1 XP = 5 XP
- 5 minutes × 3 XP = 15 XP
- Total = **20 XP**

The streak counts consecutive completed days, where every one of Math, Physics, and Chemistry has at least 60 logged minutes.

## 6. Project structure

```text
study_levelup/
├── app.py
├── requirements.txt
├── README.md
├── templates/
│   └── index.html
└── static/
    ├── style.css
    └── app.js
```

No build step or Node.js installation is required.
