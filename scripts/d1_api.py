import json
import os
import re
import ssl
import urllib.error
import urllib.request

class D1API:
    def __init__(self,account,database):
        if not re.fullmatch('[a-f0-9]{32}',account) or not re.fullmatch('[a-f0-9-]{36}',database):
            raise SystemExit('Invalid public account/database identifiers.')
        token=os.environ.get('CLOUDFLARE_API_TOKEN')
        if not token:
            raise SystemExit('CLOUDFLARE_API_TOKEN unavailable; use the secure environment binding.')
        self.url='https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database/'+database
        self.headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'}
        self.context=ssl.create_default_context()
        info=self.request()
        if info.get('result',{}).get('name')!='pulso-fit':
            raise SystemExit('Refusing a database from another project.')
    def request(self,sql=None,params=None):
        body=None if sql is None else json.dumps({'sql':sql,'params':params or []}).encode('utf-8')
        req=urllib.request.Request(self.url+('/query' if sql is not None else ''),data=body,headers=self.headers,method='GET' if sql is None else 'POST')
        try:
            with urllib.request.urlopen(req,context=self.context,timeout=60) as response: result=json.load(response)
        except urllib.error.HTTPError as error:
            try:
                payload=json.loads(error.read())
                codes=[{'code':e.get('code'),'message':e.get('message','')[:300]} for e in payload.get('errors',[])]
            except Exception:
                codes=[]
            raise SystemExit('D1 API HTTP '+str(error.code)+' '+str(codes)+'; progress preserved.') from None
        except Exception as error:
            raise SystemExit('D1 network failure: '+type(error).__name__) from None
        if not result.get('success'):
            errors=[{'code':e.get('code'),'message':e.get('message','')[:300]} for e in result.get('errors',[])]
            raise SystemExit('D1 statement rejected: '+str(errors))
        return result
    def query(self,sql,params=None):
        # D1 REST's statement splitter mistakes CASE ... END for the end of this trigger.
        # Serialize the same abort predicate with WHERE; source checksums stay unchanged.
        if sql.startswith('CREATE TRIGGER assert_store_revision '):
            old="SELECT CASE WHEN NEW.revision<>(SELECT revision FROM \"__StoreClock\" WHERE id=1) THEN RAISE(ABORT,'PULSO_WRITE_CONFLICT') END;"
            new="SELECT RAISE(ABORT,'PULSO_WRITE_CONFLICT') WHERE NEW.revision<>(SELECT revision FROM \"__StoreClock\" WHERE id=1);"
            if old not in sql:
                raise SystemExit('Unrecognized legacy trigger; refusing implicit rewrite.')
            sql=sql.replace(old,new)
        return self.request(sql,params).get('result',[])
