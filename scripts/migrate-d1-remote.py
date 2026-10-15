#!/usr/bin/env python3
"""Apply complete SQLite statements individually; preserve checksums and checkpoints."""
import argparse
import hashlib
import json
from pathlib import Path
import sqlite3
from d1_api import D1API

parser=argparse.ArgumentParser()
parser.add_argument('--account-id',required=True)
parser.add_argument('--database-id',required=True)
parser.add_argument('--through')
args=parser.parse_args()
api=D1API(args.account_id,args.database_id)
api.query('CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT UNIQUE,applied_at TEXT DEFAULT CURRENT_TIMESTAMP)')
api.query('CREATE TABLE IF NOT EXISTS PulsoMigration (name TEXT PRIMARY KEY,checksum TEXT NOT NULL,appliedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)')
checkpoint=Path('.local/d1-migration-progress.json')
state=json.loads(checkpoint.read_text()) if checkpoint.exists() else {'database':args.database_id,'files':{}}
if state['database']!=args.database_id:raise SystemExit('Checkpoint belongs to another database.')
for file in sorted(Path('prisma/d1-migrations').glob('*.sql')):
    if args.through and file.name>args.through:break
    raw=file.read_bytes()
    digest=hashlib.sha256(raw).hexdigest()
    existing=api.query('SELECT checksum FROM PulsoMigration WHERE name=?',[file.name])[0]['results']
    if existing:
        if existing[0]['checksum']!=digest:raise SystemExit('Applied migration changed: '+file.name)
        print('Already applied: '+file.name,flush=True);continue
    previous=state['files'].get(file.name,{'checksum':digest,'next':0})
    if previous['checksum']!=digest:raise SystemExit('In-progress migration changed: '+file.name)
    statements=[];buffer=''
    for char in raw.decode('utf-8'):
        buffer+=char
        if char==';' and sqlite3.complete_statement(buffer):
            statements.append(buffer.strip());buffer=''
    if buffer.strip():raise SystemExit('Incomplete migration source: '+file.name)
    for index in range(previous['next'],len(statements)):
        api.query(statements[index])
        previous['next']=index+1;state['files'][file.name]=previous
        checkpoint.parent.mkdir(parents=True,exist_ok=True)
        checkpoint.write_text(json.dumps(state,indent=2)+'\n')
    api.query('INSERT INTO PulsoMigration(name,checksum) VALUES (?,?)',[file.name,digest])
    api.query('INSERT INTO d1_migrations(name) SELECT ? WHERE NOT EXISTS(SELECT 1 FROM d1_migrations WHERE name=?)',[file.name,file.name])
    print('Applied: '+file.name+' ('+str(len(statements))+' statements)',flush=True)
