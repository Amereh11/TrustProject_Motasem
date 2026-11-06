#!/usr/bin/env python3
"""Make anonymous summary and question-level CSVs from local psiTurk questiondata.csv.

MDMT Capacity Trust (2019): reliability + capability, 4 items each, rated 0--7.
'Does not fit' responses are missing; means ignore missing ratings.

Timed-out phases remain valid records with fewer than five final answers.
Run: python3 analysis/export_jasp.py questiondata.csv
"""
import csv
import hashlib
import json
import statistics
import sys
from pathlib import Path

MDMT_RELIABLE = ['reliable', 'predictable', 'count_on', 'consistent']
MDMT_CAPABLE = ['capable', 'skilled', 'competent', 'meticulous']
MDMT = MDMT_RELIABLE + MDMT_CAPABLE
WORKLOAD = ['mental_demand', 'effort', 'time_pressure']
SUMMARY_FIELDS = (
    ['participant_code','study_version','condition','server_assignment_number','sound_confirmed','age','gender','psiturk_experience','robot_experience',
     'apology_noticed','open_feedback','questions_answered','correct_initial_count',
     'correct_final_count','followed_robot_count','followed_wrong_advice_count',
     'switched_to_robot_count','switched_to_wrong_advice_count','math_time_seconds',
     'total_time_seconds']
    + [f'phase_{n}_questions_answered' for n in (1,2,3)]
    + [f'phase_{n}_time_expired' for n in (1,2,3)]
    + [f'phase_{n}_robot_mistakes' for n in (1,2,3)]
    + [f'phase_{n}_apologies_seen' for n in (1,2,3)]
    + [f'mdmt_{n}_{item}' for n in (1,2,3) for item in MDMT]
    + [f'mdmt_{n}_{score}' for n in (1,2,3) for score in ('reliable_mean','capable_mean','capacity_mean')]
    + [f'workload_{n}_{item}' for n in (1,2,3) for item in WORKLOAD]
    + ['capacity_change_1_to_2','capacity_change_2_to_3','capacity_change_1_to_3']
)
TRIAL_FIELDS = [
    'participant_code','study_version','condition','server_assignment_number','phase','question','a','b','correct',
    'initial','robot','final','initial_ms','final_ms','robot_wrong',
    'initial_correct','final_correct','followed_robot','switched_to_robot',
    'feedback_seen','robot_apologized','timed_out'
]
AUDIT_FIELDS = [
    'participant_code','study_version','condition','server_assignment_number','consent','video_confirmed','sound_confirmed','completed',
    'final_answers','trust_blocks','workload_blocks','included_in_jasp','last_checkpoint'
]


def read_questions(path):
    records={}
    with path.open(newline='',encoding='utf-8-sig') as f:
        for row in csv.reader(f):
            if len(row)<3:continue
            pid,name,val=row[:3]
            if pid.strip().lower() in ('uniqueid','unique user id','id','participant_id') and name.strip().lower() in ('question','question name','field','question_name'):
                continue
            if pid.strip() and name.strip():records.setdefault(pid.strip(),{})[name.strip()]=val
    return records


def decoded(value):
    try:
        answer=json.loads(value)
        return answer if isinstance(answer,dict) else {}
    except (TypeError,ValueError):return {}


def code(pid):return hashlib.sha256(pid.encode('utf-8')).hexdigest()[:12]


def seconds(value):
    try:return round(float(value)/1000,3)
    except (ValueError,TypeError):return ''


def mean(values):
    nums=[float(v) for v in values if isinstance(v,(int,float)) and 0<=v<=7]
    return round(statistics.mean(nums),3) if nums else ''


def delta(a,b):return round(b-a,3) if isinstance(a,(int,float)) and isinstance(b,(int,float)) else ''


def analyze(pid,data):
    questions=[decoded(data.get(f'q{n}')) for n in range(1,16)]
    trusts=[decoded(data.get(f'mdmt_{n}')) for n in range(1,4)]
    workloads=[decoded(data.get(f'workload_{n}')) for n in range(1,4)]
    finals=sum('final' in q for q in questions)
    trust_count=sum(all(key in t for key in MDMT) for t in trusts)
    workload_count=sum(all(key in t for key in WORKLOAD) for t in workloads)
    age=data.get('age','')
    try:age_ok=18<=int(age)<=110
    except (TypeError,ValueError):age_ok=False
    valid_schedule=all(
        not q or (q.get('robot')!=q.get('correct') if n in (6,11) else q.get('robot')==q.get('correct'))
        for n,q in enumerate(questions,1)
    )
    valid_math=all(not q or q.get('a',0)*q.get('b',0)==q.get('correct') for q in questions)
    included=(data.get('study_version')=='6.2.0' and data.get('consent')=='1' and data.get('video_confirmed')=='1' and data.get('sound_confirmed')=='1' and data.get('completed')=='1'
        and data.get('condition') in ('0','1') and age_ok and valid_schedule and valid_math
        and trust_count==3 and workload_count==3
        and data.get('apology_noticed') in ('yes','no','unsure'))
    participant_code=code(pid)
    audit={'participant_code':participant_code,'study_version':data.get('study_version',''),
        'condition':data.get('condition',''),'server_assignment_number':data.get('server_assignment_number',''),
        'consent':data.get('consent',''),'video_confirmed':data.get('video_confirmed',''),
        'sound_confirmed':data.get('sound_confirmed',''),
        'completed':data.get('completed',''),'final_answers':finals,
        'trust_blocks':trust_count,'workload_blocks':workload_count,
        'included_in_jasp':int(included),'last_checkpoint':data.get('last_checkpoint','')}
    if not included:return audit,None,[]
    summary={k:data.get(k,'') for k in ('study_version','condition','server_assignment_number','sound_confirmed','age','gender','psiturk_experience','robot_experience',
                                        'apology_noticed','open_feedback')}
    summary.update(participant_code=participant_code,questions_answered=finals,
        math_time_seconds=seconds(data.get('math_time_ms')),
        total_time_seconds=seconds(data.get('total_elapsed_ms')))
    for k in ('correct_initial_count','correct_final_count','followed_robot_count',
              'followed_wrong_advice_count','switched_to_robot_count','switched_to_wrong_advice_count'):
        summary[k]=0
    for round_n in (1,2,3):
        subset=questions[(round_n-1)*5:round_n*5]
        summary[f'phase_{round_n}_questions_answered']=sum('final' in q for q in subset)
        summary[f'phase_{round_n}_time_expired']=int(data.get(f'phase_{round_n}_time_expired','0')=='1')
        summary[f'phase_{round_n}_robot_mistakes']=sum(q.get('robot')!=q.get('correct') for q in subset if q.get('robot') is not None)
        summary[f'phase_{round_n}_apologies_seen']=sum(bool(q.get('robot_apologized')) for q in subset)
        t=trusts[round_n-1]
        for key in MDMT:summary[f'mdmt_{round_n}_{key}']=t[key] if isinstance(t.get(key),(int,float)) else ''
        summary[f'mdmt_{round_n}_reliable_mean']=mean([t.get(k) for k in MDMT_RELIABLE])
        summary[f'mdmt_{round_n}_capable_mean']=mean([t.get(k) for k in MDMT_CAPABLE])
        summary[f'mdmt_{round_n}_capacity_mean']=mean([t.get(k) for k in MDMT])
        for k in WORKLOAD:summary[f'workload_{round_n}_{k}']=workloads[round_n-1][k]
    for n,m in [(1,2),(2,3),(1,3)]:
        summary[f'capacity_change_{n}_to_{m}']=delta(summary[f'mdmt_{n}_capacity_mean'],summary[f'mdmt_{m}_capacity_mean'])
    trials=[]
    for n,q in enumerate(questions,1):
        if not q:continue
        wrong=q.get('robot')!=q.get('correct')
        initial_correct='initial' in q and q['initial']==q['correct']
        final_correct='final' in q and q['final']==q['correct']
        followed='final' in q and q['final']==q.get('robot')
        switched=followed and q.get('initial')!=q.get('robot')
        summary['correct_initial_count']+=int(initial_correct)
        summary['correct_final_count']+=int(final_correct)
        summary['followed_robot_count']+=int(followed)
        summary['followed_wrong_advice_count']+=int(wrong and followed)
        summary['switched_to_robot_count']+=int(switched)
        summary['switched_to_wrong_advice_count']+=int(wrong and switched)
        trial={'participant_code':participant_code,'study_version':data.get('study_version',''),'condition':data['condition'],
            'server_assignment_number':data.get('server_assignment_number',''),
            'phase':(n-1)//5+1,'question':n,'robot_wrong':int(wrong),
            'initial_correct':int(initial_correct) if 'initial' in q else '',
            'final_correct':int(final_correct) if 'final' in q else '',
            'followed_robot':int(followed) if 'final' in q else '',
            'switched_to_robot':int(switched) if 'final' in q else '',
            'feedback_seen':int(q.get('feedback_seen',False)),
            'robot_apologized':int(q.get('robot_apologized',False)),
            'timed_out':int(q.get('timed_out',False))}
        trial.update({k:q.get(k,'') for k in ('a','b','correct','initial','robot','final','initial_ms','final_ms')})
        trials.append(trial)
    return audit,summary,trials


def write_csv(path,columns,rows):
    with path.open('w',encoding='utf-8',newline='') as f:
        writer=csv.DictWriter(f,fieldnames=columns)
        writer.writeheader();writer.writerows(rows)


def export(source,folder):
    audits,summaries,trials=[],[],[]
    for pid,data in sorted(read_questions(source).items()):
        audit,summary,rows=analyze(pid,data)
        audits.append(audit)
        if summary is not None:summaries.append(summary);trials.extend(rows)
    folder.mkdir(parents=True,exist_ok=True)
    write_csv(folder/'jasp_ready.csv',SUMMARY_FIELDS,summaries)
    write_csv(folder/'trials_ready.csv',TRIAL_FIELDS,trials)
    write_csv(folder/'study_audit.csv',AUDIT_FIELDS,audits)
    counts={c:sum(row['condition']==c for row in summaries) for c in ('0','1')}
    print(f'Included {len(summaries)} complete study records. Other sessions: {len(audits)-len(summaries)}.')
    print(f'Apology + correction (0): {counts["0"]}; correction only (1): {counts["1"]}.')
    print('Created: jasp_ready.csv, trials_ready.csv, study_audit.csv (anonymous codes).')
    return counts


if __name__=='__main__':
    if len(sys.argv)!=2:raise SystemExit('Usage: python3 analysis/export_jasp.py questiondata.csv')
    source=Path(sys.argv[1])
    if not source.is_file():raise SystemExit('Could not find exported questiondata.csv.')
    export(source,Path('.'))
