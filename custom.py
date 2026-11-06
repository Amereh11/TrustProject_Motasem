"""Private local study launcher: automatically alternate assignment, starting with apology.

Every GET /study allocates one new session in an atomic SQLite transaction.
The assignment persists across restarts and is shared across browser windows.
Participants never see a condition selection screen.
"""
from pathlib import Path
import secrets
import sqlite3
import hashlib
from urllib.parse import urlencode
from flask import Blueprint, redirect, jsonify

custom_code = Blueprint('custom_code', __name__)
DATABASE = Path(__file__).resolve().parent / 'participants.db'


def allocate_condition():
    """Issue a fresh, traceable condition for EACH /study request, transactionally.

    Only the condition and allocation number are recorded in the diagnostics log;
    the log deliberately does not contain participant IDs or responses.
    """
    with sqlite3.connect(str(DATABASE), timeout=15, isolation_level=None) as db:
        db.execute('PRAGMA busy_timeout = 15000')
        db.execute('BEGIN IMMEDIATE')
        db.execute('CREATE TABLE IF NOT EXISTS pepper_sequence '
                   '(id INTEGER PRIMARY KEY CHECK (id=1), next_condition INTEGER NOT NULL)')
        db.execute('INSERT OR IGNORE INTO pepper_sequence (id, next_condition) VALUES (1, 0)')
        db.execute('CREATE TABLE IF NOT EXISTS pepper_assignment_log '
                   '(number INTEGER PRIMARY KEY AUTOINCREMENT, condition INTEGER NOT NULL, '
                   'created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)')
        condition = int(db.execute('SELECT next_condition FROM pepper_sequence WHERE id=1').fetchone()[0])
        db.execute('INSERT INTO pepper_assignment_log(condition) VALUES (?)', (condition,))
        number = int(db.execute('SELECT last_insert_rowid()').fetchone()[0])
        db.execute('UPDATE pepper_sequence SET next_condition=? WHERE id=1', (1 - condition,))
        db.commit()
    return condition, number


def allocation_status():
    """Local-only diagnostic metadata; never consumes an assignment."""
    if not DATABASE.exists():
        return {'next_condition': 0, 'recent_assignments': [], 'assigned_since_update': 0}
    with sqlite3.connect(str(DATABASE), timeout=5) as db:
        tables = {t[0] for t in db.execute('SELECT name FROM sqlite_master WHERE type="table"')}
        if 'pepper_sequence' not in tables:
            return {'next_condition': 0, 'recent_assignments': [], 'assigned_since_update': 0}
        next_cond = db.execute('SELECT next_condition FROM pepper_sequence WHERE id=1').fetchone()
        next_cond = int(next_cond[0]) if next_cond else 0
        if 'pepper_assignment_log' not in tables:
            return {'next_condition': next_cond, 'recent_assignments': [], 'assigned_since_update': 0}
        recent = db.execute('SELECT number, condition FROM pepper_assignment_log ORDER BY number DESC LIMIT 8').fetchall()
        count = db.execute('SELECT COUNT(*) FROM pepper_assignment_log').fetchone()[0]
    return {'next_condition': next_cond,
            'recent_assignments': [{'number': row[0], 'condition': row[1]} for row in reversed(recent)],
            'assigned_since_update': count}


@custom_code.route('/study')
def begin_study():
    # 0 = apology and correction, 1 = correction only.
    version, number = allocate_condition()
    params = {
        'assignmentId': 'debugA' + secrets.token_hex(12),
        'hitId': 'debugH' + secrets.token_hex(12),
        'workerId': f'debugP{version}' + secrets.token_hex(12),
        'mode': 'debug',
        'pepperSequence': number,
    }
    response = redirect('/exp?' + urlencode(params), code=302)
    response.headers['Cache-Control'] = 'no-store'
    return response


@custom_code.route('/pepper-health')
def pepper_health():
    """Local, non-recording identity check. Must not allocate a participant."""
    script = Path(__file__).resolve().parent / 'static/js/trust_experiment.js'
    resp = jsonify({
        'study': 'Pepper Math Tutor Trust Study',
        'version': '6.2.0',
        'project_folder': str(Path(__file__).resolve().parent),
        'js_sha256': hashlib.sha256(script.read_bytes()).hexdigest(),
        'conditions': 'alternating: apology + correction / correction only',
        'mistake_questions': [6, 11],
        'assignment_diagnostics': allocation_status(),
        'sound_check': 'Required before instructions'
    })
    resp.headers['Cache-Control'] = 'no-store'
    return resp
