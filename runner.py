#!/usr/bin/env python3
"""Small cross-platform command wrapper for LOCAL psiTurk study management.

Mac or WSL: python3 runner.py start|stop|export|reset
NOTE: reset removes generated data, and requires --confirm-reset.
"""
import argparse
import os
from pathlib import Path
import secrets
import shutil
import socket
import subprocess
import sys
import venv
import hashlib
import json
import signal
import time
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
VENV = ROOT / '.venv'
PSITURK = VENV / 'bin' / 'psiturk'
PYTHON = VENV / 'bin' / 'python'
SERVER_URL = 'http://127.0.0.1:22362/study'
HEALTH_URL = 'http://127.0.0.1:22362/pepper-health'
VERSION = '6.2.0'


def is_running():
    try:
        with socket.create_connection(('127.0.0.1', 22362), timeout=0.5):
            return True
    except OSError:
        return False


def server_identity():
    """Verify this exact project path and JS, not just an occupied TCP port."""
    if not is_running():
        return None
    try:
        req = Request(HEALTH_URL, headers={'Cache-Control': 'no-cache'})
        with urlopen(req, timeout=1.5) as response:
            info = json.loads(response.read())
        expected = hashlib.sha256((ROOT/'static/js/trust_experiment.js').read_bytes()).hexdigest()
        same_root = Path(info.get('project_folder', '/')).resolve() == ROOT.resolve()
        info['verified'] = (same_root and info.get('version') == VERSION and
                            info.get('js_sha256') == expected)
        return info
    except Exception:
        return {'verified': False, 'version': 'unknown (older or different server)'}


def port_owners():
    """Find only the processes holding the specified local port; no broad process killing."""
    commands = [
        ['lsof','-nP','-t','-iTCP:22362','-sTCP:LISTEN'],
        ['fuser','22362/tcp'],
    ]
    for command in commands:
        try:
            result = subprocess.run(command, capture_output=True, text=True, timeout=4)
        except (FileNotFoundError, subprocess.TimeoutExpired):
            continue
        if result.returncode == 0:
            return sorted(set(int(word) for word in result.stdout.split() if word.isdigit()))
    try:
        import psutil
        return sorted(set(c.pid for c in psutil.net_connections(kind='tcp')
                          if c.laddr and c.laddr.port == 22362 and c.status == psutil.CONN_LISTEN and c.pid))
    except (ImportError, PermissionError, OSError):
        return []


def own_process(pid):
    """Don't stop a server owned by another computer user."""
    try:
        owner = subprocess.check_output(['ps','-p',str(pid),'-o','uid='], text=True).strip()
        return int(owner) == os.geteuid()
    except (subprocess.CalledProcessError, ValueError, OSError):
        return False


def replace_server():
    """User-invoked, port-specific takeover; never alters any database or config file."""
    if not is_running():
        print('No old server is running. Starting updated project.')
        return
    running = server_identity()
    if running and running.get('verified'):
        print('This updated folder is already serving the correct version.')
        return
    owners = port_owners()
    if not owners:
        raise SystemExit(
            'An old server is running, but its PID could not be identified safely.\n'
            'Open the OLD psiTurk terminal and enter: server off\n'
            'Then return here and run: python3 runner.py start')
    if not all(own_process(pid) for pid in owners):
        raise SystemExit('A process on port 22362 belongs to another user; stop it with that user before continuing.')
    print('Replacing the server currently listening on LOCAL port 22362 (PIDs: {})'.format(', '.join(map(str,owners))))
    print('Existing data files in the old folder are not deleted or moved.')
    for pid in owners:
        try: os.kill(pid, signal.SIGTERM)
        except ProcessLookupError: pass
    for _ in range(30):
        if not is_running():
            print('Old server stopped.')
            return
        time.sleep(0.2)
    # Explicit `replace` authorizes stopping the same PIDs even if SIGTERM stalls.
    stalled = set(port_owners()) & set(owners)
    for pid in stalled:
        if own_process(pid):
            try: os.kill(pid, signal.SIGKILL)
            except ProcessLookupError: pass
    for _ in range(20):
        if not is_running():
            print('Old server stopped.')
            return
        time.sleep(0.2)
    raise SystemExit('Port 22362 is still occupied; stop the old psiTurk server manually before starting the new one.')


def confirm_serving():
    for _ in range(45):
        status = server_identity()
        if status and status.get('verified'):
            print('VERIFIED: Version', VERSION, 'is serving from', ROOT)
            print('Check non-recording health page:', HEALTH_URL)
            print('Researcher note: open /study for EACH new participant, never refresh an old /exp tab.')
            return
        time.sleep(0.25)
    status = server_identity()
    raise SystemExit('Server launched but verification FAILED; /study may still be old.\n'
                     'Status: ' + str(status) + '\nRun python3 runner.py check to diagnose.')

def setup_environment():
    if sys.platform == 'win32':
        raise SystemExit('psiTurk does not support native Windows. Use Ubuntu in WSL, then run python3 runner.py start.')
    if not PSITURK.is_file():
        if not PYTHON.is_file():
            py39 = shutil.which('python3.9')
            if py39:
                print('Creating isolated Python 3.9 environment...')
                subprocess.run([py39, '-m', 'venv', str(VENV)], check=True)
            elif shutil.which('uv'):
                print('Creating isolated Python 3.9 environment with uv...')
                subprocess.run(['uv', 'venv', '--python', '3.9', str(VENV)], check=True)
            elif sys.version_info[:2] == (3, 9):
                venv.create(str(VENV), with_pip=True)
            else:
                raise SystemExit('Install Python 3.9 (or uv), then run the command again.')
        print('Installing psiTurk 3.3.1 in the local environment (first start only)...')
        if shutil.which('uv'):
            subprocess.run(['uv', 'pip', 'install', '--python', str(PYTHON), 'psiturk==3.3.1'], cwd=ROOT, check=True)
        else:
            subprocess.run([str(PYTHON), '-m', 'pip', 'install', 'psiturk==3.3.1'], cwd=ROOT, check=True)
        # psiTurk 3.3.1 imports urllib3's OpenSSL shim; pin a compatible pair.
        subprocess.run([str(PYTHON), '-m', 'pip', 'install', 'pyOpenSSL==22.0.0',
                        'cryptography==38.0.4'], cwd=ROOT, check=True)
    config = ROOT / 'config.txt'
    if not config.exists():
        template = (ROOT / 'config.example.txt').read_text(encoding='utf-8')
        key = secrets.token_hex(32)
        config.write_text(template.replace('REPLACE_WITH_RANDOM_LOCAL_KEY', key), encoding='utf-8')
        try:
            os.chmod(config, 0o600)
        except OSError:
            pass


def psi(*args):
    subprocess.run([str(PSITURK), *args], cwd=ROOT, check=True)


def main():
    parser = argparse.ArgumentParser(description='Local Pepper study server + export tools')
    parser.add_argument('action', choices=['start', 'replace', 'check', 'stop', 'export', 'reset', 'link'])
    parser.add_argument('--confirm-reset', action='store_true', help='Required to delete ALL local study records')
    args = parser.parse_args()
    os.chdir(ROOT)
    if args.action == 'check':
        info = server_identity()
        if info is None:
            print('No server listening at port 22362. Run: python3 runner.py start')
        elif info.get('verified'):
            print('OK: Version', VERSION, 'running from:', ROOT)
            print('Assignment diagnostics:', json.dumps(info.get('assignment_diagnostics', {})))
            print('NOTE: only a fresh /study visit creates the next participant; refreshing /exp does not alternate.')
        else:
            print('OLD / DIFFERENT SERVER detected on port 22362:', info)
            print('To use this updated folder instead run: python3 runner.py replace')
        return
    if args.action == 'link':
        print('LIVE, RECORDED (this computer only):', SERVER_URL)
        print('NO-DATA PRACTICE: open preview.html')
        return
    if args.action == 'reset':
        if not args.confirm_reset:
            raise SystemExit('WARNING: This permanently deletes local study records. Run: python3 runner.py reset --confirm-reset')
        if is_running():
            raise SystemExit('Stop the psiTurk server BEFORE deleting data: python3 runner.py stop')
        targets = ['participants.db','participants.db-shm','participants.db-wal',
                   'questiondata.csv','trialdata.csv','eventdata.csv',
                   'jasp_ready.csv','trials_ready.csv','study_audit.csv']
        deleted=[]
        for name in targets:
            file=ROOT/name
            if file.is_file():
                file.unlink();deleted.append(name)
        print('Deleted:', ', '.join(deleted) if deleted else 'Nothing to delete')
        return
    setup_environment()
    if args.action in ('start', 'replace'):
        if args.action == 'replace':
            replace_server()
        if is_running():
            info = server_identity()
            if info and info.get('verified'):
                print('Verified updated project is already listening at', SERVER_URL)
                return
            raise SystemExit('STOP: An OLD or DIFFERENT server is already using http://127.0.0.1:22362.\n'
                             'No changes were made. Use: python3 runner.py replace')
        psi('server','on')
        confirm_serving()
        print('Researcher / live recorded link:', SERVER_URL)
        print('This is LOCAL ONLY. It is not an internet-hosted web address.')
        print('For no-data practice: open preview.html')
    elif args.action == 'stop':
        psi('server','off')
        print('Server stop requested.')
    elif args.action == 'export':
        if not (ROOT/'participants.db').exists():
            raise SystemExit('No participant database exists yet. Complete a recorded study first.')
        psi('download_datafiles')
        source=ROOT/'questiondata.csv'
        if not source.exists():
            raise SystemExit('psiTurk did not create questiondata.csv. Check the psiTurk output.')
        subprocess.run([str(PYTHON), str(ROOT/'analysis'/'export_jasp.py'), str(source)],
                       cwd=ROOT, check=True)
        print('Raw exports and JASP CSVs are in the project folder. Keep them private.')


if __name__ == '__main__':
    main()
