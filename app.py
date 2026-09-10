from flask import Flask, jsonify, render_template, request
import sqlite3
from datetime import date, datetime, timedelta
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent
DB_PATH = APP_DIR / "study_tracker.db"

app = Flask(__name__)

SUBJECTS = ("math", "physics", "chemistry")
SUBJECT_LABELS = {"math": "Math", "physics": "Physics", "chemistry": "Chemistry"}
RANKS = [
    (0, "Novice"),
    (500, "Apprentice"),
    (1500, "Adept"),
    (3000, "Scholar"),
    (5000, "Sage"),
    (8000, "Archmage"),
    (12000, "Grandmaster"),
]


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db():
    conn = get_db()
    conn.executescript("""
    CREATE TABLE IF NOT EXISTS study_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subject TEXT NOT NULL CHECK(subject IN ('math','physics','chemistry')),
        started_at TEXT NOT NULL,
        ended_at TEXT NOT NULL,
        seconds INTEGER NOT NULL DEFAULT 0,
        minutes INTEGER NOT NULL DEFAULT 0,
        xp INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS daily_thoughts (
        day TEXT PRIMARY KEY,
        thought TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );
    """)
    defaults = {
        "wallpaper": "gradient",
        "custom_url": "",
        "theme_accent": "lavender",
    }
    for key, value in defaults.items():
        conn.execute(
            "INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)",
            (key, value),
        )
    conn.commit()
    conn.close()


def xp_for_minutes(total_before: int, minutes_added: int) -> int:
    """Award 1 XP/min until a subject reaches 60 minutes, then 3 XP/min."""
    first = max(0, min(minutes_added, 60 - total_before))
    boosted = max(0, minutes_added - first)
    return first + boosted * 3


def daily_subject_minutes(conn, day_str):
    rows = conn.execute(
        """
        SELECT subject, COALESCE(SUM(minutes), 0) AS minutes
        FROM study_sessions
        WHERE date(started_at) = ?
        GROUP BY subject
        """,
        (day_str,),
    ).fetchall()
    totals = {s: 0 for s in SUBJECTS}
    for row in rows:
        totals[row["subject"]] = int(row["minutes"])
    return totals


def total_xp(conn):
    row = conn.execute("SELECT COALESCE(SUM(xp), 0) AS xp FROM study_sessions").fetchone()
    return int(row["xp"])


def level_info(xp):
    # 500 XP per level. Level 1 starts at 0 XP.
    level = xp // 500 + 1
    current = xp % 500
    pct = round(current / 500 * 100, 1)
    rank = RANKS[0][1]
    for threshold, name in RANKS:
        if xp >= threshold:
            rank = name
    return {
        "level": level,
        "rank": rank,
        "current_xp": current,
        "next_level_xp": 500,
        "progress_pct": pct,
        "total_xp": xp,
    }


def completed_day(conn, day_str):
    totals = daily_subject_minutes(conn, day_str)
    return all(totals[s] >= 60 for s in SUBJECTS)


def streak_count(conn, anchor=None):
    anchor = anchor or date.today()
    # A streak is the number of consecutive completed calendar days ending today.
    # If today is not complete yet, count backwards from yesterday.
    cursor = anchor
    if not completed_day(conn, cursor.isoformat()):
        cursor -= timedelta(days=1)
    count = 0
    while completed_day(conn, cursor.isoformat()):
        count += 1
        cursor -= timedelta(days=1)
    return count


def settings_dict(conn):
    rows = conn.execute("SELECT key, value FROM settings").fetchall()
    return {r["key"]: r["value"] for r in rows}


@app.route("/")
def index():
    return render_template("index.html")


@app.get("/api/state")
def state():
    conn = get_db()
    today = date.today().isoformat()
    totals = daily_subject_minutes(conn, today)
    xp = total_xp(conn)
    thoughts = conn.execute(
        "SELECT day, thought FROM daily_thoughts WHERE day >= date('now','-62 day') ORDER BY day"
    ).fetchall()
    settings = settings_dict(conn)
    payload = {
        "today": today,
        "subjects": totals,
        "streak": streak_count(conn),
        "today_complete": all(totals[s] >= 60 for s in SUBJECTS),
        "level": level_info(xp),
        "thoughts": {r["day"]: r["thought"] for r in thoughts},
        "settings": settings,
    }
    conn.close()
    return jsonify(payload)


@app.post("/api/session")
def save_session():
    data = request.get_json(silent=True) or {}
    subject = data.get("subject")
    seconds = int(data.get("seconds", 0))
    if subject not in SUBJECTS:
        return jsonify({"error": "Invalid subject"}), 400
    if seconds < 1 or seconds > 24 * 60 * 60:
        return jsonify({"error": "Invalid duration"}), 400

    # Store whole minutes for game progress, but retain seconds for an accurate log.
    minutes = seconds // 60
    if minutes < 1:
        return jsonify({"saved": False, "reason": "Session was under one minute."})

    now = datetime.now()
    started = now - timedelta(seconds=seconds)
    conn = get_db()

    before = daily_subject_minutes(conn, started.date().isoformat())[subject]
    earned = xp_for_minutes(before, minutes)

    conn.execute(
        """
        INSERT INTO study_sessions
        (subject, started_at, ended_at, seconds, minutes, xp, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            subject,
            started.isoformat(timespec="seconds"),
            now.isoformat(timespec="seconds"),
            seconds,
            minutes,
            earned,
            now.isoformat(timespec="seconds"),
        ),
    )
    conn.commit()

    xp = total_xp(conn)
    response = {
        "saved": True,
        "minutes": minutes,
        "xp_earned": earned,
        "state": {
            "today": date.today().isoformat(),
            "subjects": daily_subject_minutes(conn, date.today().isoformat()),
            "streak": streak_count(conn),
            "today_complete": all(
                daily_subject_minutes(conn, date.today().isoformat())[s] >= 60
                for s in SUBJECTS
            ),
            "level": level_info(xp),
            "thoughts": {
                r["day"]: r["thought"]
                for r in conn.execute("SELECT day, thought FROM daily_thoughts").fetchall()
            },
            "settings": settings_dict(conn),
        },
    }
    conn.close()
    return jsonify(response)


@app.get("/api/calendar")
def calendar():
    year = int(request.args.get("year", date.today().year))
    month = int(request.args.get("month", date.today().month))
    first = date(year, month, 1)
    if month == 12:
        last = date(year + 1, 1, 1) - timedelta(days=1)
    else:
        last = date(year, month + 1, 1) - timedelta(days=1)

    conn = get_db()
    rows = conn.execute(
        """
        SELECT date(started_at) AS day, subject, SUM(minutes) AS minutes
        FROM study_sessions
        WHERE date(started_at) BETWEEN ? AND ?
        GROUP BY date(started_at), subject
        """,
        (first.isoformat(), last.isoformat()),
    ).fetchall()

    by_day = {}
    for r in rows:
        by_day.setdefault(r["day"], {s: 0 for s in SUBJECTS})
        by_day[r["day"]][r["subject"]] = int(r["minutes"])

    thoughts = {
        r["day"]: r["thought"]
        for r in conn.execute(
            "SELECT day, thought FROM daily_thoughts WHERE day BETWEEN ? AND ?",
            (first.isoformat(), last.isoformat()),
        ).fetchall()
    }
    conn.close()

    days = []
    for n in range(last.day):
        d = first + timedelta(days=n)
        totals = by_day.get(d.isoformat(), {s: 0 for s in SUBJECTS})
        days.append({
            "day": d.isoformat(),
            "number": d.day,
            "complete": all(totals[s] >= 60 for s in SUBJECTS),
            "minutes": totals,
            "has_thought": bool(thoughts.get(d.isoformat(), "").strip()),
        })

    return jsonify({
        "year": year,
        "month": month,
        "first_weekday": first.weekday(),
        "days": days,
        "thoughts": thoughts,
    })


@app.put("/api/thought")
def save_thought():
    data = request.get_json(silent=True) or {}
    day = data.get("day")
    thought = (data.get("thought") or "").strip()
    try:
        date.fromisoformat(day)
    except Exception:
        return jsonify({"error": "Invalid date"}), 400

    conn = get_db()
    conn.execute(
        """
        INSERT INTO daily_thoughts(day, thought, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(day) DO UPDATE SET thought=excluded.thought, updated_at=excluded.updated_at
        """,
        (day, thought, datetime.now().isoformat(timespec="seconds")),
    )
    conn.commit()
    conn.close()
    return jsonify({"saved": True, "day": day, "thought": thought})


@app.put("/api/settings")
def save_settings():
    data = request.get_json(silent=True) or {}
    allowed = {"wallpaper", "custom_url", "theme_accent"}
    conn = get_db()
    for key in allowed:
        if key in data:
            value = str(data[key])[:1000]
            conn.execute(
                "INSERT INTO settings(key,value) VALUES (?,?) "
                "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                (key, value),
            )
    conn.commit()
    result = settings_dict(conn)
    conn.close()
    return jsonify(result)


init_db()

if __name__ == "__main__":
    # 0.0.0.0 makes the development server reachable by another device on your LAN.
    app.run(host="0.0.0.0", port=8501, debug=True)
