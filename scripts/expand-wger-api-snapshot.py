#!/usr/bin/env python3
"""Normalize a captured official wger API catalog, keeping licensed PT legacy entries."""
import argparse, hashlib, html, json, re
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse

class PlainText(HTMLParser):
    def __init__(self):super().__init__(convert_charrefs=True);self.parts=[];self.hidden=0
    def handle_starttag(self,tag,attrs):
        if tag in ('script','style'):self.hidden+=1
        if tag in ('p','div','br','li','h1','h2','h3','ol','ul') and not self.hidden:self.parts.append('\n')
    def handle_endtag(self,tag):
        if tag in ('script','style'):self.hidden=max(0,self.hidden-1)
        if tag in ('p','div','li','ol','ul') and not self.hidden:self.parts.append('\n')
    def handle_data(self,text):
        if not self.hidden:self.parts.append(text)
def plain(value):
    parser=PlainText();parser.feed(value or '')
    return re.sub(r'\n{3,}','\n\n',''.join(parser.parts)).strip()

def build(directory, previous):
    raw=(directory/'wger-full.json').read_bytes();source=json.loads(raw)
    source_hash=hashlib.sha256(raw).hexdigest();revision='wger-api-sha256-'+source_hash
    licenses={row['id']:row for row in json.loads((directory/'wger-license.json').read_text())['results']}
    languages={row['id']:row for row in json.loads((directory/'wger-language.json').read_text())['results']}
    allowed={i for i,license in licenses.items() if license['url'].replace('http://','https://').startswith(('https://creativecommons.org/licenses/by-sa/','https://creativecommons.org/licenses/by/','https://creativecommons.org/publicdomain/zero/'))}
    def credit(record,identifier,license_id):
        lic=licenses[license_id]
        return {'id':identifier,'author':record.get('license_author',''),'authorUrl':record.get('license_author_url',''),'license':lic['short_name'],'licenseUrl':lic['url'],'sourceUrl':record.get('license_object_url',''),'name':record.get('name'),'language':record.get('language'),'title':record.get('license_title',''),'derivativeSourceUrl':record.get('license_derivative_source_url','')}
    def lang(identifier):
        return languages.get(identifier,{}).get('short_name',str(identifier))
    old={item['externalId']:item for item in previous['exercises']};result=[];skipped=[];excluded_media=0
    for base in source['results']:
        if base['license']['id'] not in allowed:
            skipped.append({'id':base['id'],'reason':'base-license'});continue
        translations=[t for t in base['translations'] if t.get('license') in allowed and t.get('name','').strip()]
        selected=next((t for t in translations if t['language']==7),None) or next((t for t in translations if t['language']==2),None)
        if selected is None:
            skipped.append({'id':base['id'],'reason':'no-licensed-pt-or-en'});continue
        legacy=old.get(base['uuid']) if selected['language']!=7 else None
        if legacy and legacy.get('provenance',{}).get('displayLanguage','pt')!='pt':legacy=None
        instruction=selected if plain(selected.get('description')) else next((t for t in translations if t['language']==2 and plain(t.get('description'))),selected)
        names=[t['name'].strip() for t in translations if t['language'] in (2,7)]
        names.extend(alias.get('alias','') if isinstance(alias,dict) else str(alias) for t in translations if t['language'] in (2,7) for alias in t.get('aliases',[]))
        name=legacy['name'] if legacy else selected['name'].strip()
        aliases=list(dict.fromkeys(n for n in names+(legacy.get('aliases',[]) if legacy else []) if n and n!=name))
        media=[]
        for kind,records in [('image',base['images']),('video',base['videos'])]:
            for record in records:
                url=record.get('image' if kind=='image' else 'video','');parsed=urlparse(url)
                if record.get('license') not in allowed or parsed.scheme!='https' or parsed.hostname!='wger.de':excluded_media+=1;continue
                media.append({'type':kind,'url':url,'isMain':record.get('is_main',False),'credit':credit(record,record['id'],record['license']),'aiGenerated':record.get('is_ai_generated'),'width':record.get('width'),'height':record.get('height'),'duration':record.get('duration'),'sizeBytes':record.get('size'),'codec':record.get('codec')})
        provenance={'source':'wger','revision':revision,'retrievedAt':source['retrievedAt'],'sourceUrl':f"https://wger.de/en/exercise/{base['id']}/view",'base':credit(base,base['id'],base['license']['id']),'translations':[credit(t,t['id'],t['license']) for t in translations],'selectedTranslation':selected['id'],'displayLanguage': 'pt' if legacy else lang(selected['language']),'instructionsLanguage':'pt' if legacy else lang(instruction['language']),'instructionTranslation':instruction['id'],'variationGroup':base.get('variation_group'),'media':media,'changes':'Seleção PT com fallback EN; HTML convertido em texto. Créditos e URLs de mídias licenciadas preservados, sem redistribuir arquivos. Nenhuma classificação técnica inferida.'}
        if legacy:provenance['legacyPortuguese']=legacy['provenance']
        result.append({'externalId':base['uuid'],'name':name,'aliases':aliases,'description':legacy['description'] if legacy else plain(selected.get('description')),'instructions':legacy['description'] if legacy else plain(instruction.get('description')),'sourceCategory':base['category']['name'],'primaryMuscles':[str(m['id']) for m in base['muscles']],'secondaryMuscles':[str(m['id']) for m in base['muscles_secondary']],'equipment':[str(e['id']) for e in base['equipment']],'provenance':provenance})
    known={item['externalId'] for item in result}
    for identity,item in old.items():
        if identity not in known:
            item=dict(item);item['instructions']=item.get('instructions',item['description']);item['provenance']={**item['provenance'],'legacySnapshot':True,'displayLanguage':item['provenance'].get('displayLanguage','pt'),'instructionsLanguage':item['provenance'].get('instructionsLanguage','pt'),'media':item['provenance'].get('media',[])};result.append(item)
    muscles={str(i['id']):{'name':i['name'],'name_en':i.get('name_en',''),'is_front':i.get('is_front',False)} for i in json.loads((directory/'wger-muscle.json').read_text())['results']}
    equipment={str(i['id']):{'name':i['name']} for i in json.loads((directory/'wger-equipment.json').read_text())['results']}
    muscles={**previous['muscles'],**muscles};equipment={**previous['equipment'],**equipment}
    for item in result:
        if not set(item['primaryMuscles']+item['secondaryMuscles'])<=muscles.keys() or not set(item['equipment'])<=equipment.keys():raise ValueError('Unknown taxonomy ID')
    return {'revision':revision,'source':source['source'],'retrievedAt':source['retrievedAt'],'sourceHash':source_hash,'skipped':skipped,'notes':['API oficial completa: PT quando disponível; demais nomes/instruções mantidos no idioma da fonte, sem tradução inventada.','Entradas PT anteriores preservadas, inclusive ausentes na resposta atual.','Somente CC0/CC-BY/CC-BY-SA conhecidos; créditos por tradução e mídia preservados.','URLs de imagens/vídeos são referências à fonte; arquivos não foram copiados.','Nível técnico e tipo de movimento ausentes não foram inferidos.','Mídias excluídas por licença/URL: '+str(excluded_media)],'muscles':muscles,'equipment':equipment,'exercises':result}
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--directory',required=True);parser.add_argument('--previous',default='data/wger/catalog.json');parser.add_argument('--output',default='data/wger/catalog.json');args=parser.parse_args()
    previous=json.loads(Path(args.previous).read_text());data=build(Path(args.directory),previous)
    Path(args.output).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'exercises':len(data['exercises']),'pt':sum(e['provenance'].get('displayLanguage')=='pt' for e in data['exercises']),'withInstructions':sum(bool(e['instructions']) for e in data['exercises']),'images':sum(m['type']=='image' for e in data['exercises'] for m in e['provenance'].get('media',[])),'videos':sum(m['type']=='video' for e in data['exercises'] for m in e['provenance'].get('media',[])),'skipped':len(data['skipped']),'revision':data['revision']}))
