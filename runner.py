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

ROOT = Path(__file__).resolve().parent
VENV = ROOT / '.venv'
PSITURK = VENV / 'bin' / 'psiturk'
PYTHON = VENV / 'bin' / 'python'
SERVER_URL = 'http://127.0.0.1:22362/study'


def is_running():
    try:
        with socket.create_connection(('127.0.0.1', 22362), timeout=0.5):
            return True
    except OSError:
        return False


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
    parser.add_argument('action', choices=['start', 'stop', 'export', 'reset', 'link'])
    parser.add_argument('--confirm-reset', action='store_true', help='Required to delete ALL local study records')
    args = parser.parse_args()
    os.chdir(ROOT)
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
    if args.action == 'start':
        if is_running():
            print('Server is already listening at', SERVER_URL)
            return
        psi('server','on')
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
