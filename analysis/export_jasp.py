#!/usr/bin/env python3
"""Export clean study CSVs from psiTurk's questiondata.csv; Python standard library only.

Run: python3 analysis/export_jasp.py questiondata.csv
Output: jasp_ready.csv, trials_ready.csv, study_audit.csv (in current directory).
Incomplete records are audit-only; no identifying psiTurk IDs are exported.
"""
import csv
import hashlib
import json
import sys
from pathlib import Path

SUMMARY_FIELDS = [
    'participant_code', 'condition', 'age_range', 'gender', 'study_experience',
    'robot_experience', 'apology_noticed', 'trust_1', 'reliability_1', 'trust_mean_1',
    'trust_2', 'reliability_2', 'trust_mean_2', 'trust_3', 'reliability_3',
    'trust_mean_3', 'trust_change_1_to_2', 'trust_change_2_to_3', 'trust_change_1_to_3',
    'mistakes_phase_1', 'mistakes_phase_2', 'mistakes_phase_3', 'correct_initial_count',
    'correct_final_count', 'followed_robot_count', 'followed_wrong_advice_count',
    'switched_to_robot_count', 'switched_to_wrong_advice_count',
    'math_time_seconds', 'total_time_seconds'
]
TRIAL_FIELDS = [
    'participant_code', 'condition', 'phase', 'question', 'a', 'b', 'correct', 'initial',
    'robot', 'final', 'initial_ms', 'final_ms', 'robot_wrong', 'initial_correct',
    'final_correct', 'followed_robot', 'switched_to_robot', 'feedback_seen'
]
AUDIT_FIELDS = [
    'participant_code', 'condition', 'consent', 'video_confirmed', 'completed',
    'final_answers', 'feedback_confirmed', 'trust_blocks', 'included_in_jasp',
    'last_checkpoint'
]


def read_questions(path):
    records = {}
    with path.open(newline='', encoding='utf-8-sig') as file:
        for line in csv.reader(file):
            if len(line) < 3:
                continue
            participant_id, name, value = line[:3]
            if participant_id.strip().lower() in ('uniqueid', 'unique user id', 'id', 'participant_id') and name.strip().lower() in ('question', 'question name', 'field', 'question_name'):
                continue
            if participant_id.strip() and name.strip():
                records.setdefault(participant_id.strip(), {})[name.strip()] = value
    return records


def decode(value):
    try:
        result = json.loads(value)
        return result if isinstance(result, dict) else {}
    except (ValueError, TypeError):
        return {}


def code(participant_id):
    return hashlib.sha256(participant_id.encode('utf-8')).hexdigest()[:12]


def seconds(value):
    try:
        return round(float(value) / 1000, 3)
    except (ValueError, TypeError):
        return ''


def analyze(pid, data):
    questions = [decode(data.get('q' + str(n))) for n in range(1, 16)]
    trust_blocks = [decode(data.get('trust_' + str(n))) for n in range(1, 4)]
    finals = sum('final' in q for q in questions)
    feedbacks = sum(q.get('feedback_seen') is True for q in questions)
    trust_count = sum('trust' in t and 'reliability' in t for t in trust_blocks)
    complete_questions = all(all(k in q for k in ('initial','robot','correct','final','a','b','feedback_seen')) for q in questions)
    schedule_ok = all(q.get('robot') != q.get('correct') if n in (8,13)
                      else q.get('robot') == q.get('correct')
                      for n,q in enumerate(questions, start=1))
    math_ok = all(q.get('a', 0) * q.get('b', 0) == q.get('correct') for q in questions)
    included = (complete_questions and schedule_ok and math_ok and data.get('consent') == '1' and data.get('video_confirmed') == '1'
        and data.get('completed') == '1' and data.get('condition') in ('0', '1')
        and finals == 15 and feedbacks == 15 and trust_count == 3
        and data.get('apology_noticed') in ('yes', 'no', 'unsure'))
    participant_code = code(pid)
    audit = {
        'participant_code': participant_code, 'condition': data.get('condition', ''),
        'consent': data.get('consent', ''),
        'video_confirmed': data.get('video_confirmed', ''),
        'completed': data.get('completed', ''), 'final_answers': finals,
        'feedback_confirmed': feedbacks, 'trust_blocks': trust_count,
        'included_in_jasp': int(included),
        'last_checkpoint': data.get('last_checkpoint', '')
    }
    if not included:
        return audit, None, []
    summary = {name: data.get(name, '') for name in (
        'condition', 'age_range', 'gender', 'study_experience',
        'robot_experience', 'apology_noticed')}
    summary['participant_code'] = participant_code
    for n, t in enumerate(trust_blocks, start=1):
        summary[f'trust_{n}'] = t['trust']
        summary[f'reliability_{n}'] = t['reliability']
        summary[f'trust_mean_{n}'] = round((float(t['trust']) + float(t['reliability'])) / 2, 3)
    summary['trust_change_1_to_2'] = round(summary['trust_mean_2'] - summary['trust_mean_1'], 3)
    summary['trust_change_2_to_3'] = round(summary['trust_mean_3'] - summary['trust_mean_2'], 3)
    summary['trust_change_1_to_3'] = round(summary['trust_mean_3'] - summary['trust_mean_1'], 3)
    for block in (1, 2, 3):
        subset = questions[(block-1)*5:block*5]
        summary[f'mistakes_phase_{block}'] = sum(q['robot'] != q['correct'] for q in subset)
    summary['math_time_seconds'] = seconds(data.get('math_time_ms'))
    summary['total_time_seconds'] = seconds(data.get('total_elapsed_ms'))
    summary.update({k: 0 for k in (
        'correct_initial_count', 'correct_final_count', 'followed_robot_count',
        'followed_wrong_advice_count', 'switched_to_robot_count',
        'switched_to_wrong_advice_count')})
    trials = []
    for n, q in enumerate(questions, start=1):
        is_wrong = q['robot'] != q['correct']
        first_correct = q['initial'] == q['correct']
        final_correct = q['final'] == q['correct']
        followed = q['final'] == q['robot']
        switched = q['initial'] != q['robot'] and followed
        summary['correct_initial_count'] += int(first_correct)
        summary['correct_final_count'] += int(final_correct)
        summary['followed_robot_count'] += int(followed)
        summary['followed_wrong_advice_count'] += int(is_wrong and followed)
        summary['switched_to_robot_count'] += int(switched)
        summary['switched_to_wrong_advice_count'] += int(is_wrong and switched)
        trial = {'participant_code': participant_code, 'condition': data['condition'],
                 'question': n, 'phase': (n-1)//5+1, 'robot_wrong': int(is_wrong),
                 'initial_correct': int(first_correct), 'final_correct': int(final_correct),
                 'followed_robot': int(followed), 'switched_to_robot': int(switched),
                 'feedback_seen': int(q['feedback_seen'])}
        trial.update({key: q.get(key, '') for key in (
            'a', 'b', 'correct', 'initial', 'robot', 'final', 'initial_ms', 'final_ms')})
        trials.append(trial)
    return audit, summary, trials


def write_csv(path, fields, rows):
    with path.open('w', encoding='utf-8', newline='') as file:
        writer = csv.DictWriter(file, fields)
        writer.writeheader()
        writer.writerows(rows)


def export(source, output_folder):
    audits, summaries, trials = [], [], []
    for pid, data in sorted(read_questions(source).items()):
        audit, summary, question_rows = analyze(pid, data)
        audits.append(audit)
        if summary:
            summaries.append(summary)
            trials.extend(question_rows)
    output_folder.mkdir(parents=True, exist_ok=True)
    write_csv(output_folder / 'jasp_ready.csv', SUMMARY_FIELDS, summaries)
    write_csv(output_folder / 'trials_ready.csv', TRIAL_FIELDS, trials)
    write_csv(output_folder / 'study_audit.csv', AUDIT_FIELDS, audits)
    counts = {c: sum(row['condition'] == c for row in summaries) for c in ('0', '1')}
    print(f'Included {len(summaries)} complete participants; {len(audits) - len(summaries)} incomplete/not consented.')
    print(f'Condition 0 (correction only): {counts["0"]}; condition 1 (apology): {counts["1"]}.')
    print('Created jasp_ready.csv, trials_ready.csv, and study_audit.csv.')
    return counts


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('Usage: python3 analysis/export_jasp.py questiondata.csv')
    input_file = Path(sys.argv[1])
    if not input_file.is_file():
        raise SystemExit('Cannot find questiondata.csv. Export it from the psiTurk console first.')
    export(input_file, Path('.'))
