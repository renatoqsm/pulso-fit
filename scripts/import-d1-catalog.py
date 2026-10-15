#!/usr/bin/env python3
"""Bootstrap public catalogs through the authorized D1 API, with resumable progress."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import ssl
import urllib.request
import urllib.error

parser=argparse.ArgumentParser()
parser.add_argument('--file',required=True)
parser.add_argument('--bootstrap',action='store_true')
parser.add_argument('--account-id',required=True)
parser.add_argument('--database-id',required=True)
args=parser.parse_args()
if not args.bootstrap:
    raise SystemExit('Use --bootstrap before public launch or in a controlled maintenance window.')
import re
account=args.account_id
database={'database_id':args.database_id}
if not re.fullmatch('[a-f0-9]{32}',account) or not re.fullmatch('[a-f0-9-]{36}',args.database_id):
    raise SystemExit('Invalid public account/database identifiers.')
token=os.environ.get('CLOUDFLARE_API_TOKEN')
if not token:
    raise SystemExit('CLOUDFLARE_API_TOKEN is unavailable; use the secure environment binding.')
source=Path(args.file).read_bytes()
statements=json.loads(source)
fingerprint=hashlib.sha256(source).hexdigest()
state_path=Path('.local/d1-catalog-progress.json')
state={'hash':fingerprint,'database':database['database_id'],'next':0,'rows_written':0}
if state_path.exists():
    state=json.loads(state_path.read_text())
    if state['hash']!=fingerprint or state['database']!=database['database_id']:
        raise SystemExit('Checkpoint belongs to a different snapshot/database; preserved.')
endpoint='https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database/'+database['database_id']+'/query'
context=ssl.create_default_context()
verify=urllib.request.Request(endpoint.rsplit('/query',1)[0],headers={'Authorization':'Bearer '+token})
try:
    with urllib.request.urlopen(verify,context=context,timeout=30) as response:
        target=json.load(response)
except Exception as error:
    raise SystemExit('Unable to verify the D1 target: '+type(error).__name__) from None
if not target.get('success') or target.get('result',{}).get('name')!='pulso-fit':
    raise SystemExit('Target is not the dedicated pulso-fit database; no writes submitted.')
for index in range(state['next'],len(statements)):
    sql=statements[index]
    allowed=sql.startswith('UPDATE "__StoreClock" ') or any(sql.startswith('INSERT INTO "'+table+'" ') for table in ['Muscle','Equipment','Exercise','ExerciseMuscle','ExerciseEquipment','Food'])
    if not allowed or len(sql.encode('utf-8'))>95000:
        raise SystemExit('Unexpected/oversized statement; no request sent.')
    if state['rows_written']>70000:
        raise SystemExit('Stopped to preserve the daily free write budget. Resume after quota resets.')
    request=urllib.request.Request(endpoint,data=json.dumps({'sql':sql}).encode('utf-8'),headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'},method='POST')
    try:
        with urllib.request.urlopen(request,context=context,timeout=60) as response:
            result=json.load(response)
    except urllib.error.HTTPError as error:
        raise SystemExit('D1 API rejected the request: HTTP '+str(error.code)+'. Checkpoint preserved.') from None
    except Exception as error:
        raise SystemExit('D1 network request failed: '+type(error).__name__+'. Checkpoint preserved.') from None
    if not result.get('success'):
        codes=[e.get('code') for e in result.get('errors',[])]
        raise SystemExit('D1 rejected the statement; error codes '+str(codes)+'. Checkpoint preserved.')
    state['next']=index+1
    state['rows_written']+=sum(r.get('meta',{}).get('rows_written',0) for r in result.get('result',[]))
    state_path.parent.mkdir(parents=True,exist_ok=True)
    state_path.write_text(json.dumps(state,indent=2)+'\n')
    if (index+1)%25==0 or index+1==len(statements):
        print(json.dumps({'completed':index+1,'total':len(statements),'rows_written':state['rows_written']}),flush=True)
print('Public catalogs imported. No users or private records were submitted.')
