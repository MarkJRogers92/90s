"""Native asset and portable-source regression tests; no runtime registration."""
from pathlib import Path
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import unittest
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / 'art/damaged-vending'
ASSET = ROOT / 'public/assets/neon/props/damaged-vending-flicker.png'

class DamagedVendingTests(unittest.TestCase):
    def require_asset(self):
        self.assertTrue(ASSET.is_file(), 'Finished native vending sheet must be present')
        self.assertTrue((ART/'build.py').is_file(), 'Portable source recipe must be present')

    def test_native_format_and_immutable_body(self):
        self.require_asset()
        image = Image.open(ASSET).convert('RGBA')
        self.assertEqual(image.size, (384,96))
        frames = [np.array(image.crop((96*i,0,96*(i+1),96))) for i in range(4)]
        allowed = np.array(Image.open(ART/'editable-light-mask.png').convert('L')) > 0
        palette = set(map(tuple,json.loads((ART/'shared-palette.json').read_text())))
        for i,a in enumerate(frames):
            self.assertTrue(np.isin(a[:,:,3],[0,255]).all())
            self.assertEqual(Image.fromarray(a[:,:,3]).getbbox(), (27,9,71,90))
            self.assertTrue(np.array_equal(a[:,:,3],frames[0][:,:,3]))
            self.assertTrue(np.array_equal(a[~allowed],frames[0][~allowed]))
            self.assertTrue(set(map(tuple,a[a[:,:,3]>0,:3])).issubset(palette))
            self.assertTrue(np.array_equal(a,np.array(Image.open(ART/f'frames/damaged-vending-{i}.png'))))
        joined=np.concatenate(frames)
        self.assertEqual(len(np.unique(joined[joined[:,:,3]>0,:3],axis=0)),46)
        self.assertEqual([int(np.any(a!=frames[0],axis=2).sum()) for a in frames],[0,57,10,0])
        self.assertTrue(np.array_equal(frames[0],frames[3]))

    def test_manifest_and_recorded_native_checks(self):
        self.require_asset()
        m=json.loads((ART/'atlas.json').read_text())
        self.assertEqual(m['meta']['image'],'../../public/assets/neon/props/damaged-vending-flicker.png')
        entries=list(m['frames'].values())
        self.assertEqual([e['duration'] for e in entries],[280,90,90,340])
        self.assertEqual([e['frame'] for e in entries],[{'x':96*i,'y':0,'w':96,'h':96} for i in range(4)])
        self.assertTrue(all(e['pivot']=={'x':0.5,'y':89/96} for e in entries))
        report=json.loads((ART/'native-checks.json').read_text())
        self.assertEqual(report['consistency']['errors'],[])
        self.assertTrue(all(x['outside_mask_pixels']==0 and x['accepted'] for x in report['exact_edit_checks']))

    def test_source_hash_and_portable_reproduction(self):
        self.require_asset()
        provenance=json.loads((ART/'provenance.json').read_text())
        source=ART/provenance['source_file']
        self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(),provenance['source_sha256'])
        with tempfile.TemporaryDirectory() as t:
            out=Path(t)/'rebuilt'
            env=dict(os.environ,PYTHONDONTWRITEBYTECODE='1')
            p=subprocess.run([sys.executable,str(ART/'build.py'),str(out)],cwd=t,env=env,capture_output=True,text=True)
            self.assertEqual(p.returncode,0,p.stderr)
            self.assertEqual((out/'DEAD-MALL-damaged-vending-96.png').read_bytes(),ASSET.read_bytes())
            for i in range(4):
                self.assertEqual((out/f'frames/damaged-vending-{i}.png').read_bytes(),(ART/f'frames/damaged-vending-{i}.png').read_bytes())
            rerun=subprocess.run([sys.executable,str(ART/'build.py'),str(out)],cwd=t,env=env,capture_output=True,text=True)
            self.assertNotEqual(rerun.returncode,0,'Existing output directories must not be overwritten')

if __name__=='__main__': unittest.main()
