#!/usr/bin/env python3
"""Incremental public wger catalog sync; never exports or changes user records."""
import argparse,hashlib,json,uuid
from pathlib import Path
from datetime import datetime,timezone
from d1_api import D1API

def literal(value):
    if value is None:return 'NULL'
    if isinstance(value,bool):return '1' if value else '0'
    if isinstance(value,(int,float)):return str(value)
    return "'"+str(value).replace("'","''")+"'"
def compact(value):return json.dumps(value,ensure_ascii=False,separators=(',',':'))
def insert(table,rows,keys,updates):
    if not rows:return ''
    columns=list(rows[0]);quoted=lambda key:'"'+key+'"'
    sql='INSERT INTO "'+table+'" ('+','.join(map(quoted,columns))+') VALUES '+','.join('('+','.join(literal(row[key]) for key in columns)+')' for row in rows)
    sql+=' ON CONFLICT ('+','.join(map(quoted,keys))+') '+('DO UPDATE SET '+','.join(quoted(key)+'=excluded.'+quoted(key) for key in updates) if updates else 'DO NOTHING')+';'
    if table=='Exercise' and updates:sql=sql[:-1]+' WHERE Exercise.ownerId IS NULL;'
    if len(sql.encode())>95000:raise SystemExit('Catalog row exceeds safe statement size.')
    return sql

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--snapshot',default='data/wger/catalog.json');parser.add_argument('--account-id',required=True);parser.add_argument('--database-id',required=True);parser.add_argument('--dry-run',action='store_true');args=parser.parse_args()
    raw=Path(args.snapshot).read_bytes();snapshot=json.loads(raw);fingerprint=hashlib.sha256(raw).hexdigest()
    if len({row['externalId'] for row in snapshot['exercises']})!=len(snapshot['exercises']):raise SystemExit('Duplicate source identities.')
    api=D1API(args.account_id,args.database_id)
    rows=api.query("SELECT id,externalId,contentHash FROM Exercise WHERE source='WGER' AND ownerId IS NULL")[0]['results'];existing={row['externalId']:row for row in rows}
    if api.query("SELECT count(*) total FROM Exercise WHERE source='WGER' AND ownerId IS NOT NULL")[0]['results'][0]['total']:
        raise SystemExit('Unexpected privately owned WGER records; refusing catalog mutation.')
    pending=[];counts={'imported':0,'updated':0,'unchanged':0}
    for item in snapshot['exercises']:
        digest=hashlib.sha256(compact(item).encode()).hexdigest();prior=existing.get(item['externalId'])
        if prior and prior['contentHash']==digest:counts['unchanged']+=1;continue
        counts['updated' if prior else 'imported']+=1
        pending.append((item,digest,prior['id'] if prior else 'wger-'+item['externalId']))
    print(json.dumps({'dry_run':args.dry_run,'target':'pulso-fit','snapshot_records':len(snapshot['exercises']),'existing_public_wger':len(existing),**counts}),flush=True)
    if args.dry_run:return
    state_path=Path('.local/exercises-sync-'+fingerprint[:16]+'.json')
    now=datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')
    state={'fingerprint':fingerprint,'database':args.database_id,'jobId':str(uuid.uuid4()),'done':[],'rowsWritten':0,'counts':counts}
    if state_path.exists():
        state=json.loads(state_path.read_text())
        if state['fingerprint']!=fingerprint or state['database']!=args.database_id:raise SystemExit('Checkpoint mismatch; refusing to overwrite.')
    if not pending and (not state_path.exists() or state.get('complete')):return
    if state.get('complete'):
        state={'fingerprint':fingerprint,'database':args.database_id,'jobId':str(uuid.uuid4()),'done':[],'rowsWritten':0,'counts':counts}
    def persist():
        state_path.parent.mkdir(parents=True,exist_ok=True);temporary=state_path.with_suffix('.tmp');temporary.write_text(json.dumps(state,indent=2)+'\n');temporary.replace(state_path)
    def run(statements):
        if state['rowsWritten']>50000:raise SystemExit('Per-sync write budget reached; progress preserved for operator review.')
        result=api.query('\n'.join(statement for statement in statements if statement));state['rowsWritten']+=sum(entry.get('meta',{}).get('rows_written',0) for entry in result);persist()
    if not state_path.exists():persist()
    run([insert('ExerciseImportJob',[{'id':state['jobId'],'source':'WGER','revision':snapshot['revision'],'status':'RUNNING','notes':compact(snapshot['notes']),'startedAt':now}],['id'],[])])
    taxonomy=[]
    for identity,item in snapshot['muscles'].items():taxonomy.append(insert('Muscle',[{'id':identity,'name':item['name'],'alternateName':item.get('name_en','')}],['id'],['name','alternateName']))
    for identity,item in snapshot['equipment'].items():taxonomy.append(insert('Equipment',[{'id':identity,'name':item['name']}],['id'],['name']))
    run(taxonomy)
    for start in range(0,len(pending),10):
        chunk=pending[start:start+10];statements=[]
        for item,digest,identity in chunk:
            row={'id':identity,'source':'WGER','externalId':item['externalId'],'ownerId':None,'name':item['name'],'aliases':compact(item['aliases']),'description':item['description'],'instructions':item.get('instructions',item['description']),'searchText':'','sourceCategory':item['sourceCategory'],'provenance':compact(item['provenance']),'contentHash':digest,'sourceRevision':snapshot['revision'],'createdAt':now,'updatedAt':now}
            import unicodedata
            row['searchText']=''.join(c for c in unicodedata.normalize('NFD',' '.join([item['name'],*item['aliases']])) if unicodedata.category(c)!='Mn').lower().strip()
            columns=[key for key in row if key not in ('id','source','externalId','ownerId','createdAt')]
            statements.append(insert('Exercise',[row],['source','externalId'],columns))
            statements.extend(['DELETE FROM ExerciseMuscle WHERE exerciseId='+literal(identity)+';','DELETE FROM ExerciseEquipment WHERE exerciseId='+literal(identity)+';'])
            muscles=[{'exerciseId':identity,'muscleId':muscle,'role':role} for role,key in [('PRIMARY','primaryMuscles'),('SECONDARY','secondaryMuscles')] for muscle in dict.fromkeys(item[key])]
            equipment=[{'exerciseId':identity,'equipmentId':equipment} for equipment in dict.fromkeys(item['equipment'])]
            statements.append(insert('ExerciseMuscle',muscles,['exerciseId','muscleId','role'],[]));statements.append(insert('ExerciseEquipment',equipment,['exerciseId','equipmentId'],[]))
        run(statements);state['done'].extend(item['externalId'] for item,_,_ in chunk);persist();print(json.dumps({'processed':start+len(chunk),'pending_at_start':len(pending),'rows_written':state['rowsWritten']}),flush=True)
    run(['UPDATE ExerciseImportJob SET status=\'SUCCESS\',finishedAt='+literal(datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z'))+',imported='+str(state['counts']['imported'])+',updated='+str(state['counts']['updated'])+',unchanged='+str(state['counts']['unchanged'])+' WHERE id='+literal(state['jobId'])+';'])
    state['complete']=True;persist()
    print('Public exercise sync complete. User data, favorites, active status and prescription snapshots preserved.')
if __name__=='__main__':main()
