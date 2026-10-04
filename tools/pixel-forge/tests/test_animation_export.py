import hashlib,json,struct,subprocess,sys
from pathlib import Path
import pytest
from PIL import Image
from forge import animation_export as ae, aseprite

def pin(p):return {'path':p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
@pytest.fixture
def case(tmp_path):
 im=Image.new('RGBA',(8,8));im.paste((10,20,30,255),(2,2,6,6));im.save(tmp_path/'source.png')
 ma=Image.new('L',(8,8));ma.paste(255,(2,2,6,6));ma.save(tmp_path/'mask.png');fs=[]
 for i in range(2):
  p=tmp_path/f'f{i}.png';im.save(p);fs.append({'id':str(i),'image':pin(p),'phase':'charge','identity_locks':[{'name':'identity','source':'source','mask':'mask','offset':[0,0]}]})
 m={'schema_version':1,'facing':'west','canvas':[8,8],'references':{'source':pin(tmp_path/'source.png'),'mask':pin(tmp_path/'mask.png')},'palette_sources':['source'],'frames':fs}
 p=tmp_path/'manifest.json';p.write_text(json.dumps(m));return p,m

def bad(case):
 p=case[0].parent/'f0.png';im=Image.open(p);im.putpixel((2,2),(0,0,0,0));im.save(p);case[1]['frames'][0]['image']=pin(p);case[0].write_text(json.dumps(case[1]))

def test_review_export_invokes_checker_and_labels_every_artifact(case,tmp_path):
 out=tmp_path/'review';r=ae.export_animation(case[0],out,review=True)
 assert r['status']=='review_only' and r['approved'] is False and r['manual_review_required']
 assert r['checks']['technical_status']=='pass' and (out/'animation.REVIEW_ONLY.png').exists()
 assert (out/'frame-000.REVIEW_ONLY.png').read_bytes()==(tmp_path/'f0.png').read_bytes()
 assert not (out/'animation.png').exists()

def test_bad_pixels_export_only_as_explicit_review(case,tmp_path):
 bad(case);r=ae.export_animation(case[0],tmp_path/'review',review=True)
 assert r['checks']['technical_status']=='fail' and r['status']=='review_only_failed_checks' and r['approved'] is False

def test_final_blocks_bad_pixels_even_with_manual_record(case,tmp_path):
 bad(case)
 with pytest.raises(ae.ExportBlocked,match='technical'):ae.export_animation(case[0],tmp_path/'final',review_record={})
 assert not (tmp_path/'final').exists()

def test_final_requires_manual_record(case,tmp_path):
 with pytest.raises(ae.ExportBlocked,match='manual review'):ae.export_animation(case[0],tmp_path/'final')
 assert not (tmp_path/'final').exists()

def test_scoped_review_record_allows_final_without_proving_anatomy(case,tmp_path):
 draft=ae.export_animation(case[0],tmp_path/'review',review=True)
 record={'manifest_sha256':draft['manifest_sha256'],'reviewer':'Synthetic test reviewer','accepted_findings':draft['manual_review_required']}
 r=ae.export_animation(case[0],tmp_path/'final',review_record=record)
 assert r['status']=='exported_with_manual_review' and r['checks']['semantic_anatomy']=='unverified' and r['approved'] is False
 assert (tmp_path/'final/animation.png').exists()

def test_stale_review_record_blocked(case,tmp_path):
 with pytest.raises(ae.ExportBlocked,match='manifest'):ae.export_animation(case[0],tmp_path/'final',review_record={'manifest_sha256':'0'*64,'reviewer':'test','accepted_findings':[]})

def test_corrupt_source_blocks_even_review(case,tmp_path):
 (tmp_path/'f0.png').write_bytes(b'corrupt')
 with pytest.raises(ae.ExportBlocked,match='input'):ae.export_animation(case[0],tmp_path/'review',review=True)
 assert not (tmp_path/'review').exists()

def test_existing_output_preserved(case,tmp_path):
 out=tmp_path/'exists';out.mkdir();(out/'sentinel').write_text('keep')
 with pytest.raises(FileExistsError):ae.export_animation(case[0],out,review=True)
 assert (out/'sentinel').read_text()=='keep'

def test_actual_forge_cli_routes_export(case,tmp_path):
 p=subprocess.run([sys.executable,'-m','forge','animation-export',str(case[0]),'--out',str(tmp_path/'cli'),'--review'],text=True,capture_output=True)
 assert p.returncode==0,p.stderr
 assert json.loads(p.stdout)['status']=='review_only'

def doc(path,n):
 a=bytearray(128);struct.pack_into('<IHH',a,0,128,0xA5E0,n);path.write_bytes(a);return path

def test_legacy_multi_export_blocks_with_migration_hint(tmp_path):
 d=doc(tmp_path/'multi.aseprite',2);out=tmp_path/'old.png'
 with pytest.raises(aseprite.AsepriteError,match='animation-export'):aseprite.export_png(d,out)
 assert not out.exists()

def test_legacy_single_export_unchanged(tmp_path,monkeypatch):
 d=doc(tmp_path/'single.aseprite',1);out=tmp_path/'one.png'
 def run(args):Image.new('RGBA',(8,8)).save(out);return ''
 monkeypatch.setattr(aseprite,'_run',run)
 assert aseprite.export_png(d,out)==out

def test_legacy_gif_animation_also_requires_manifest(tmp_path):
 a=Image.new('RGBA',(8,8),'red');b=Image.new('RGBA',(8,8),'blue');p=tmp_path/'animated.gif'
 a.save(p,save_all=True,append_images=[b],duration=100)
 with pytest.raises(aseprite.AsepriteError,match='animation-export'):aseprite.export_png(p,tmp_path/'out.png')

def test_native_header_rejects_wrong_dimensions_before_renderer(case,tmp_path,monkeypatch):
 p=doc(tmp_path/'bad.aseprite',2)
 def unexpected(args):raise AssertionError('renderer must not run')
 monkeypatch.setattr(aseprite,'_run',unexpected)
 with pytest.raises(ae.ExportBlocked,match='native header'):
  ae.export_animation(case[0],tmp_path/'out',review=True,document=p)
 assert not (tmp_path/'out').exists()

def test_legacy_export_renders_snapshot_not_mutable_original(tmp_path,monkeypatch):
 d=doc(tmp_path/'single.aseprite',1);original=d.read_bytes();out=tmp_path/'one.png'
 def run(args):
  d.write_bytes(b'changed after preflight')
  rendered=Path(args[0])
  assert rendered != d and rendered.read_bytes()==original
  Image.new('RGBA',(8,8)).save(out)
  return ''
 monkeypatch.setattr(aseprite,'_run',run)
 assert aseprite.export_png(d,out)==out

def test_fifo_manifest_fails_promptly_without_waiting_for_writer(tmp_path):
 import os
 p=tmp_path/'manifest.json';os.mkfifo(p)
 try:
  r=subprocess.run([sys.executable,'-m','forge','animation-export',str(p),'--out',str(tmp_path/'out'),'--review'],capture_output=True,text=True,timeout=2)
 except subprocess.TimeoutExpired:
  pytest.fail('FIFO input blocked export process')
 assert r.returncode==1 and json.loads(r.stdout)['status']=='blocked'

def test_repeated_padded_pngs_cannot_bypass_aggregate_export_byte_budget(case,tmp_path,monkeypatch):
 monkeypatch.setattr(ae,'MAX_EXPORT_BYTES',4096,raising=False)
 p=tmp_path/'f0.png';p.write_bytes(p.read_bytes()+b'padding'*100)
 case[1]['frames'][0]['image']=pin(p)
 case[1]['frames']=[{**case[1]['frames'][0],'id':str(i)} for i in range(16)]
 case[0].write_text(json.dumps(case[1]))
 with pytest.raises(ae.ExportBlocked,match='byte budget'):ae.export_animation(case[0],tmp_path/'out',review=True)
 assert not (tmp_path/'out').exists()

def test_non_ascii_destination_fails_early_with_useful_message(case,tmp_path):
 with pytest.raises(ae.ExportBlocked,match='ASCII'):ae.export_animation(case[0],tmp_path/'révision',review=True)
 assert not (tmp_path/'révision').exists()

def test_native_document_tilde_is_expanded_before_preflight(case,tmp_path,monkeypatch):
 monkeypatch.setenv('HOME',str(tmp_path));doc(tmp_path/'native.aseprite',2)
 with pytest.raises(ae.ExportBlocked,match='native header'):
  ae.export_animation(case[0],tmp_path/'out',review=True,document='~/native.aseprite')

def test_main_help_advertises_automatic_animation_workflow():
 r=subprocess.run([sys.executable,'-m','forge','--help'],capture_output=True,text=True)
 assert r.returncode==0 and 'animation-export' in r.stdout
