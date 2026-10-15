#!/usr/bin/env python3
"""Authorized operator reset of current plans for the sole active author; preserves session history."""
import argparse,json,uuid,sqlite3,os
from datetime import datetime,timezone
from pathlib import Path
from d1_api import D1API

def lit(value):
    if value is None:return 'NULL'
    if isinstance(value,(int,float)):return str(value)
    return "'"+str(value).replace("'","''")+"'"
def insert(table,row):
    return 'INSERT INTO "'+table+'" ('+','.join('"'+key+'"' for key in row)+') VALUES ('+','.join(lit(value) for value in row.values())+');'
def identity():return str(uuid.uuid4())
def conforms(exercise,sets):
    rows=[s for s in sets if s['exerciseId']==exercise['id']]
    return len(rows)==2 and all(s['kind']=='WORKING' and s['repsMin']==6 and s['repsMax']==10 and s['durationSeconds'] is None for s in rows)
def working_rows(exercise_id,old):
    preferred=[s for s in sorted(old,key=lambda row:row['position']) if s['kind']=='WORKING']
    result=[]
    for position in range(2):
        row=dict(preferred[min(position,len(preferred)-1)]) if preferred else {'targetKg':None,'restSeconds':60,'cadence':None,'rpe':None,'rir':None,'unilateral':0,'technique':None}
        row.update(id=identity(),exerciseId=exercise_id,position=position,repsMin=6,repsMax=10,durationSeconds=None,kind='WORKING')
        if row.get('technique')=='Reconhecimento':row['technique']=None
        result.append(row)
    return result

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--account-id',required=True);parser.add_argument('--database-id',required=True);parser.add_argument('--apply',action='store_true');args=parser.parse_args()
    api=D1API(args.account_id,args.database_id)
    read=lambda sql:api.query(sql)[0]['results']
    revision=read('SELECT revision FROM __StoreClock WHERE id=1')[0]['revision']
    plans=read('SELECT p.* FROM WorkoutProgram p LEFT JOIN WorkoutProgramRemoval r ON r.programId=p.id WHERE r.programId IS NULL')
    owners={p['authorId'] for p in plans}
    if len(owners)!=1:raise SystemExit('Cannot uniquely identify the requester; specify the account before changing any plans.')
    owner=next(iter(owners));versions=read('SELECT v.* FROM WorkoutVersion v JOIN WorkoutProgram p ON p.id=v.programId WHERE p.authorId='+lit(owner))
    selected=[]
    for plan in plans:
        for published in [False,True]:
            rows=[v for v in versions if v['programId']==plan['id'] and bool(v['publishedAt'])==published]
            if rows:selected.append(max(rows,key=lambda v:v['number']))
    ids=','.join(lit(v['id']) for v in selected) or 'NULL'
    days=read('SELECT * FROM WorkoutDay WHERE versionId IN ('+ids+')')
    day_ids=','.join(lit(d['id']) for d in days) or 'NULL'
    exercises=read('SELECT * FROM WorkoutPrescriptionExercise WHERE dayId IN ('+day_ids+')')
    exercise_ids=','.join(lit(e['id']) for e in exercises) or 'NULL'
    sets=read('SELECT * FROM WorkoutPrescriptionSet WHERE exerciseId IN ('+exercise_ids+')')
    assignments=read('SELECT * FROM WorkoutAssignment WHERE versionId IN ('+ids+')')
    if read('SELECT revision FROM __StoreClock WHERE id=1')[0]['revision']!=revision:raise SystemExit('Concurrent changes detected; no writes performed. Retry with a fresh snapshot.')
    now=datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z');guard=identity()
    statements=[insert('__CommitGuard',{'id':guard,'revision':revision})];changed=0;published_new=[];new_exercises=[]
    for plan in plans:
        current=[v for v in selected if v['programId']==plan['id']];maximum=max(v['number'] for v in versions if v['programId']==plan['id']);cloned=False;renumbered=set()
        for version in sorted(current,key=lambda v:not bool(v['publishedAt'])):
            own_days=[d for d in days if d['versionId']==version['id']];own_exercises=[e for e in exercises if any(d['id']==e['dayId'] for d in own_days)]
            if all(conforms(e,sets) for e in own_exercises):continue
            if version['publishedAt']:
                maximum+=1;copy=dict(version,id=identity(),number=maximum,publishedAt=None,createdAt=now,draftRevision=0);statements.append(insert('WorkoutVersion',copy));cloned=True;published_new.append(copy['id'])
                for day in own_days:
                    new_day=dict(day,id=identity(),versionId=copy['id']);statements.append(insert('WorkoutDay',new_day))
                    for exercise in [e for e in own_exercises if e['dayId']==day['id']]:
                        new_exercise=dict(exercise,id=identity(),dayId=new_day['id']);statements.append(insert('WorkoutPrescriptionExercise',new_exercise));new_exercises.append(new_exercise['id']);changed+=1
                        for row in working_rows(new_exercise['id'],[s for s in sets if s['exerciseId']==exercise['id']]):statements.append(insert('WorkoutPrescriptionSet',row))
                for assignment in [a for a in assignments if a['versionId']==version['id']]:statements.append(insert('WorkoutAssignment',dict(assignment,id=identity(),versionId=copy['id'])))
                statements.append('UPDATE WorkoutVersion SET publishedAt='+lit(now)+' WHERE id='+lit(copy['id'])+';')
                statements.append(insert('AuditLog',{'id':identity(),'actorId':owner,'action':'WORKOUT_WORKING_SETS_RESET','resourceId':copy['id']}))
            else:
                for exercise in own_exercises:
                    if conforms(exercise,sets):continue
                    statements.append('DELETE FROM WorkoutPrescriptionSet WHERE exerciseId='+lit(exercise['id'])+';');changed+=1;new_exercises.append(exercise['id'])
                    for row in working_rows(exercise['id'],[s for s in sets if s['exerciseId']==exercise['id']]):statements.append(insert('WorkoutPrescriptionSet',row))
                number=maximum+1 if cloned else version['number'];maximum=max(maximum,number);renumbered.add(version['id'])
                statements.append('UPDATE WorkoutVersion SET draftRevision=draftRevision+1,number='+str(number)+' WHERE id='+lit(version['id'])+';')
                statements.append(insert('AuditLog',{'id':identity(),'actorId':owner,'action':'WORKOUT_WORKING_SETS_RESET','resourceId':version['id']}))
        # Even an already-normalized pending draft must remain newer than a cloned published plan.
        for draft in [v for v in current if not v['publishedAt']]:
            if cloned and draft['id'] not in renumbered and draft['number']<maximum:
                maximum+=1;statements.append('UPDATE WorkoutVersion SET number='+str(maximum)+',draftRevision=draftRevision+1 WHERE id='+lit(draft['id'])+';')
    statements.append('DELETE FROM __CommitGuard WHERE id='+lit(guard)+';')
    if not changed:print(json.dumps({'changed_exercises':0,'status':'already configured'}));return
    # Validate the exact SQL against an isolated SQLite database before remote writes.
    db=sqlite3.connect(':memory:');db.execute('PRAGMA foreign_keys=ON')
    for migration in sorted(Path('prisma/d1-migrations').glob('*.sql')):db.executescript(migration.read_text())
    user_ids={owner}|{a['studentId'] for a in assignments}
    for user_id in user_ids:db.execute('INSERT INTO User(id,email,passwordHash,role) VALUES (?,?,?,?)',(user_id,user_id+'@fixture.test','local-validation-only','STUDENT'))
    for row in plans:db.execute(insert('WorkoutProgram',row))
    for row in selected:db.execute(insert('WorkoutVersion',dict(row,publishedAt=None)))
    for table,rows in [('WorkoutDay',days),('WorkoutPrescriptionExercise',exercises)]:
        if table=='WorkoutPrescriptionExercise':
            for exercise_id in {e['exerciseId'] for e in exercises}:
                db.execute('INSERT INTO Exercise(id,source,ownerId,name,searchText,provenance) VALUES (?,?,?,?,?,?)',(exercise_id,'CUSTOM',owner,'Fixture','fixture','{}'))
        for row in rows:db.execute(insert(table,row))
    for row in sets:db.execute(insert('WorkoutPrescriptionSet',row))
    for row in assignments:db.execute(insert('WorkoutAssignment',row))
    for row in selected:
        if row['publishedAt']:db.execute('UPDATE WorkoutVersion SET publishedAt=? WHERE id=?',(row['publishedAt'],row['id']))
    db.execute('UPDATE __StoreClock SET revision=? WHERE id=1',(revision,));db.commit()
    db.executescript('BEGIN;\n'+'\n'.join(statements)+'\nCOMMIT;')
    for exercise_id in new_exercises:
        actual=db.execute('SELECT kind,repsMin,repsMax FROM WorkoutPrescriptionSet WHERE exerciseId=? ORDER BY position',(exercise_id,)).fetchall();assert actual==[('WORKING',6,10),('WORKING',6,10)]
    for original in [v for v in selected if v['publishedAt']]:
        original_set_ids=[s['id'] for s in sets if any(e['id']==s['exerciseId'] and any(d['id']==e['dayId'] and d['versionId']==original['id'] for d in days) for e in exercises)]
        for set_id in original_set_ids:assert db.execute('SELECT count(*) FROM WorkoutPrescriptionSet WHERE id=?',(set_id,)).fetchone()[0]==1
    assert not db.execute('PRAGMA foreign_key_check').fetchall();db.close()
    print(json.dumps({'apply':args.apply,'plans':len(plans),'changed_exercises':changed,'published_plans_updated':len(published_new),'local_validation':'passed'}),flush=True)
    if not args.apply:return
    backup=Path('.local/workout-sets-backup-'+now.replace(':','-')+'.json');backup.parent.mkdir(exist_ok=True)
    backup.write_text(json.dumps({'plans':plans,'versions':selected,'days':days,'exercises':exercises,'sets':sets,'assignments':assignments},ensure_ascii=False));os.chmod(backup,0o600)
    api.query('\n'.join(statements));print('Applied atomically. Historical prescriptions, sessions and logs preserved.')
if __name__=='__main__':main()
