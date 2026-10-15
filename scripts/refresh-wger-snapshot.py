import argparse,json,re,subprocess
from urllib.parse import urlparse
from pathlib import Path
parser=argparse.ArgumentParser(description='Atualiza o snapshot de dados licenciados do repositório oficial wger.')
parser.add_argument('--source',required=True,help='Checkout local do repositório oficial wger')
parser.add_argument('--revision',required=True,help='Commit completo de 40 caracteres hexadecimais')
args=parser.parse_args()
if not re.fullmatch('[0-9a-f]{40}',args.revision):raise SystemExit('Revision inválida.')
origin=subprocess.check_output(['git','-C',args.source,'remote','get-url','origin'],text=True).strip()
url=urlparse(origin)
if url.hostname!='github.com' or url.path.rstrip('/').removesuffix('.git')!='/wger-project/wger':raise SystemExit('A fonte deve ser o repositório oficial wger-project/wger.')
paths={'licenses.json':'core/fixtures/licenses.json','exercise-base-data.json':'exercises/fixtures/exercise-base-data.json','translations.json':'exercises/fixtures/translations.json','categories.json':'exercises/fixtures/categories.json','muscles.json':'exercises/fixtures/muscles.json','equipment.json':'exercises/fixtures/equipment.json'}
load=lambda file: json.loads(subprocess.check_output(['git','-C',args.source,'show',args.revision+':wger/'+paths[file]],text=True))
licenses={r['pk']:r['fields'] for r in load('licenses.json')}
allowed={1,2,3,4}
base={r['pk']:r['fields'] for r in load('exercise-base-data.json') if r['model']=='exercises.exercise'}
translations=[r for r in load('translations.json') if r['model']=='exercises.translation']
cats={r['pk']:r['fields']['name'] for r in load('categories.json')}
muscles={str(r['pk']):r['fields'] for r in load('muscles.json')}
equipment={str(r['pk']):r['fields'] for r in load('equipment.json')}
revision=args.revision
result=[];seen=set();skipped=[]
for row in translations:
 t=row['fields'];b=base.get(t.get('exercise'))
 if t.get('language')!=7 or t.get('exercise') in seen:continue
 if not b or b.get('license') not in allowed or t.get('license') not in allowed:skipped.append(row['pk']);continue
 seen.add(t['exercise'])
 used=[r for r in translations if r['fields'].get('exercise')==t['exercise'] and r['fields'].get('language') in (2,7) and r['fields'].get('license') in allowed]
 def credit(v,identifier):return {'id':identifier,'author':v.get('license_author',''),'authorUrl':v.get('license_author_url',''),'license':licenses[v['license']]['short_name'],'licenseUrl':licenses[v['license']]['url'],'sourceUrl':v.get('license_object_url',''),'name':v.get('name'),'language':v.get('language'),'title':v.get('license_title',''),'derivativeSourceUrl':v.get('license_derivative_source_url','')}
 item={'externalId':b['uuid'],'name':t['name'],'aliases':list(dict.fromkeys(r['fields']['name'] for r in used if r['fields']['name']!=t['name'])),'description':t.get('description_source',''),'sourceCategory':cats.get(b['category']),'primaryMuscles':[str(i) for i in b['muscles']],'secondaryMuscles':[str(i) for i in b['muscles_secondary']],'equipment':[str(i) for i in b['equipment']],'provenance':{'source':'wger','revision':revision,'sourceUrl':f"https://wger.de/en/exercise/{t['exercise']}/view",'base':credit(b,t['exercise']),'translations':[credit(r['fields'],r['pk']) for r in used],'selectedTranslation':row['pk'],'changes':'Texto-fonte exibido sem renderização de HTML; categorias técnicas não inferidas. Sem mídias.'}}
 result.append(item)
dataset={'revision':revision,'source':'https://github.com/wger-project/wger','skipped':skipped,'notes':['Snapshot oficial, somente português (language 7).','Sem imagens ou vídeos; licenças de mídia não avaliadas.','Parte das entradas não informa autoria; esse campo permanece ausente, com fonte e licença preservadas.','Descrição técnica preservada da fonte; nível e tipo de movimento ausentes.'],'muscles':muscles,'equipment':equipment,'exercises':result}
(Path(__file__).resolve().parents[1]/'data/wger/catalog.json').write_text(json.dumps(dataset,ensure_ascii=False,indent=2)+'\n')
print('Exercícios reais:',len(result),'excluídos:',len(skipped),'revision:',revision)
