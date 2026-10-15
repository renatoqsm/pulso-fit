#!/usr/bin/env python3
"""Fetch the reviewed official USDA snapshot, without replacing existing files."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument('--directory', required=True)
args = parser.parse_args()
manifest = json.loads((Path(__file__).resolve().parents[1] / 'data/usda/manifest.json').read_text())
output = Path(args.directory).resolve()
output.mkdir(parents=True, exist_ok=True)
def sha(data):
    return hashlib.sha256(data).hexdigest()
for name, expected in manifest['files'].items():
    path = output / name
    if path.exists() and sha(path.read_bytes()) != expected:
        raise SystemExit('Existing CSV differs from the reviewed snapshot; preserved: ' + str(path))
if all((output / name).exists() for name in manifest['files']):
    print('Official USDA CSV snapshot already present; checksums match.')
    raise SystemExit(0)
with tempfile.TemporaryDirectory(prefix='pulso-usda-') as temporary:
    archive = Path(temporary) / 'source.zip'
    subprocess.run(['curl','--fail','--location','--silent','--show-error','--max-time','60','--output',str(archive),manifest['downloadUrl']], check=True)
    if sha(archive.read_bytes()) != manifest['archiveSha256']:
        raise SystemExit('Downloaded archive differs from pinned snapshot; review required.')
    with zipfile.ZipFile(archive) as source:
        if source.testzip() is not None:
            raise SystemExit('Corrupt USDA archive.')
        for name, expected in manifest['files'].items():
            matches = [entry for entry in source.namelist() if entry.endswith('/' + name)]
            if len(matches) != 1:
                raise SystemExit('Unexpected archive structure.')
            data = source.read(matches[0])
            if sha(data) != expected:
                raise SystemExit('CSV checksum mismatch.')
            target = output / name
            if not target.exists():
                with target.open('xb') as stream:
                    stream.write(data)
print('Official USDA CSV snapshot downloaded and verified against pinned checksums.')
