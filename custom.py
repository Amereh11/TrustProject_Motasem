"""Local, researcher-controlled psiTurk session links (not public hosting)."""
import secrets
from urllib.parse import urlencode
from flask import Blueprint, redirect, Response

custom_code = Blueprint('custom_code', __name__)

LANDING = '''<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pepper — Researcher Launch</title><style>
body{background:#f2f5fa;color:#223249;font:17px/1.5 system-ui,sans-serif;margin:0;padding:30px 16px}
main{max-width:660px;margin:4vh auto;background:#fff;padding:25px;border-radius:14px;border:1px solid #d7e2f0}
h1{font-size:29px;margin:0 0 12px}.choices{display:flex;gap:12px;flex-wrap:wrap;margin:20px 0}
a{display:block;padding:15px 18px;background:#2458ae;border-radius:8px;color:#fff;font-weight:700;text-decoration:none}
small{display:block;font-weight:400}p{margin:9px 0}footer{color:#536579;font-size:14px}
</style></head><body><main><h1>Pepper Math Tutor Study</h1>
<p><strong>Researcher only.</strong> Choose the condition for the next participant. Each button starts a new recorded session.</p>
<div class="choices"><a href="/study/0">Condition 0<small>Correction only</small></a>
<a href="/study/1">Condition 1<small>Apology + correction</small></a></div>
<footer>Alternate 0 and 1 to keep group sizes balanced. The same 15 questions are used for everyone.
Use <strong>preview.html</strong> for a practice run that does not save data.
Make sure you see the final saved confirmation before starting the next student.</footer>
</main></body></html>'''

@custom_code.route('/study')
def study_home():
    return Response(LANDING, mimetype='text/html', headers={'Cache-Control': 'no-store'})

@custom_code.route('/study/<int:version>')
def begin_session(version):
    if version not in (0, 1):
        return ('Unknown study version', 404)
    # Fresh fake worker / HIT IDs are used only for non-MTurk, supervised local sessions.
    worker = f'debugP{version}' + secrets.token_hex(12)
    params = {'assignmentId': 'debugA' + secrets.token_hex(12),
              'hitId': 'debugH' + secrets.token_hex(12),
              'workerId': worker, 'mode': 'debug'}
    return redirect('/exp?' + urlencode(params), code=302)
