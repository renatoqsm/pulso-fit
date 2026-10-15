#!/usr/bin/env python3
"""Create an operator-authorized administrator without sending a password through chat/argv."""
import argparse
import hashlib
import json
import os
import re
import secrets
import uuid
from d1_api import D1API

def hash_password(password):
    salt=secrets.token_hex(32)
    derived=hashlib.pbkdf2_hmac('sha512',password.encode('utf-8'),salt.encode('utf-8'),210000,dklen=32).hex()
    return 'pbkdf2-sha512$210000$'+salt+'$'+derived

def literal(value):
    return "'"+str(value).replace("'","''")+"'"

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--account-id',required=True)
    parser.add_argument('--database-id',required=True)
    args=parser.parse_args()
    email=os.environ.get('ADMIN_EMAIL','').strip().lower()
    name=os.environ.get('ADMIN_NAME','').strip()
    password=os.environ.get('ADMIN_PASSWORD','')
    if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',email) or len(email)>254 or not 2<=len(name)<=100 or not 16<=len(password)<=128:
        raise SystemExit('Configure ADMIN_EMAIL, ADMIN_NAME and ADMIN_PASSWORD (16–128 characters) securely in the operator environment.')
    api=D1API(args.account_id,args.database_id)
    identifier=str(uuid.uuid4())
    permissions=json.dumps(['VERIFY_CREDENTIALS','MANAGE_USERS','MANAGE_CATALOG','MANAGE_ADMIN_PERMISSIONS'])
    # The D1 API executes this multi-statement request atomically; verified against the remote database.
    sql='INSERT INTO "User" (id,email,passwordHash,role,adminPermissions) VALUES ('+','.join(map(literal,[identifier,email,hash_password(password),'ADMIN',permissions]))+');'
    sql+='INSERT INTO Profile(userId,name) VALUES ('+literal(identifier)+','+literal(name)+');'
    sql+='INSERT INTO AuditLog(id,actorId,action,resourceId) VALUES ('+','.join(map(literal,[str(uuid.uuid4()),identifier,'ADMIN_CREATED_BY_OPERATOR',identifier]))+');'
    api.query(sql)
    print('Administrator created. Sign in and enable two-factor authentication in Conta before administrative operations.')

if __name__=='__main__':
    main()
