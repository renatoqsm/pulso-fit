#!/usr/bin/env python3
"""Apply versioned PT-BR translations without changing identities or source credits."""
import argparse, hashlib, json, re
from pathlib import Path

REVISION = 'pt-BR.1'
MODEL = {
    'name': 'Argos Translate English-Portuguese 1.0 (OPUS)',
    'sourceUrl': 'https://github.com/uav4geo/LibreTranslate-Models/blob/3d5ca0a2c3c302287339b2944329f767ac1673f4/en_pt.argosmodel',
    'sha256': '88ef6663dea47575fd956399253ff7e8f9000c5e1c1d1240b4c56e13584adf28',
}

def localize(dataset, names, content):
    for key, entry in content.items():
        if hashlib.sha256(entry['source'].encode()).hexdigest() != key:
            raise ValueError('Invalid translation source hash.')
        for pattern in [r'\d+', r'https?://[^\s<>]+']:
            if sorted(re.findall(pattern, entry['source'])) != sorted(re.findall(pattern, entry['text'])):
                raise ValueError('Translation changed source numbers or URLs: ' + key)
    for item in dataset['exercises']:
        provenance = item['provenance']
        previous = provenance.get('localization')
        if previous:
            if previous['revision'] != REVISION:
                raise ValueError('Restore the original snapshot before changing translation revisions.')
            continue
        original = {}
        methods = {}
        for field, language in [('name', 'displayLanguage'), ('description', 'displayLanguage'), ('instructions', 'instructionsLanguage')]:
            source = item[field]
            if provenance.get(language) != 'en' or not source.strip():
                continue
            if field == 'name':
                translated = names[source]
                methods[field] = 'terminology-adaptation'
            else:
                entry = content[hashlib.sha256(source.encode()).hexdigest()]
                if entry['source'] != source:
                    raise ValueError('Translation source mismatch.')
                translated = entry['text']
                methods[field] = entry['method']
            if not translated.strip():
                raise ValueError('Empty translation: ' + item['externalId'])
            original[field] = source
            item[field] = translated
        if not original:
            continue
        if 'name' in original:
            item['aliases'] = list(dict.fromkeys([original['name'], *item['aliases']]))
            item['aliases'] = [alias for alias in item['aliases'] if alias != item['name']]
            provenance['displayLanguage'] = 'pt-BR'
        if 'instructions' in original:
            provenance['instructionsLanguage'] = 'pt-BR'
        provenance['localization'] = {
            'locale': 'pt-BR', 'revision': REVISION,
            'originalLanguage': 'en', 'original': original,
            'methods': methods, 'engine': MODEL,
            'technicalReview': 'not-professionally-reviewed',
            'notice': 'Nomes adaptados à terminologia brasileira. Textos traduzidos automaticamente com glossário e correções linguísticas; sem revisão técnica profissional. Original preservado.',
        }
        provenance['changes'] += ' Tradução/adaptação PT-BR pelo Pulso Fit; original e licença preservados.'
    base_revision = dataset['revision'].split('+pt-BR.')[0]
    dataset['revision'] = base_revision + '+' + REVISION
    dataset['notes'][0] = 'Catálogo em português: traduções PT da fonte preservadas; nomes restantes adaptados ao Brasil e textos traduzidos, com original e atribuições preservados.'
    return dataset

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--snapshot', default='data/wger/catalog.json')
    parser.add_argument('--translations', default='data/wger/pt-BR')
    args = parser.parse_args()
    path = Path(args.snapshot)
    directory = Path(args.translations)
    result = localize(json.loads(path.read_text()), json.loads((directory/'names.json').read_text()), json.loads((directory/'content.json').read_text()))
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
    temporary.replace(path)
    print(json.dumps({'records': len(result['exercises']), 'localized': sum('localization' in item['provenance'] for item in result['exercises']), 'revision': result['revision']}))
