"""Seeded real-PNG cases: every negative targets a distinct observable constraint."""
import copy
import hashlib
import json
import subprocess
import sys
from pathlib import Path
import numpy as np
import pytest
from PIL import Image
from forge import animation_checks as ac


def ref(path):
    return {"path": path.name, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}


def save(root, name, data):
    path = root / name
    Image.fromarray(data).save(path)
    return ref(path)


@pytest.fixture
def case(tmp_path):
    image = np.zeros((16, 16, 4), dtype=np.uint8)
    image[3:13, 5:10] = [50, 70, 90, 255]
    image[3:5, 6:9] = [210, 180, 140, 255]
    image[9:12, 10:13] = [160, 100, 60, 255]
    mask = np.zeros((16, 16), dtype=np.uint8); mask[3:5,6:9] = 255
    hand = np.zeros_like(mask); hand[9:11,9] = 255
    bag = np.zeros_like(mask); bag[9:12,10:13] = 255
    sole = np.zeros_like(mask); sole[12,6:9] = 255
    refs = {"source": save(tmp_path,"source.png", image),
            "head": save(tmp_path,"head.png",mask),
            "hand": save(tmp_path,"hand.png",hand),
            "bag": save(tmp_path,"bag.png",bag),
            "sole": save(tmp_path,"sole.png",sole)}
    frames=[]
    for i in range(3):
        frames.append({"id": str(i), "image": save(tmp_path,f"frame{i}.png",image),
                       "phase": "stance" if i < 2 else "charge", "root_offset": [0,0],
                       "anchors": {"shoulder":[7,6], "elbow":[7,9], "hand":[9,10], "grip":[10,10], "sole":[7,12]},
                       "masks":{"hand":"hand","bag":"bag","sole":"sole"},
                       "identity_locks":[{"name":"head","source":"source","mask":"head","offset":[0,0]}]})
    manifest={"schema_version":1,"facing":"west","canvas":[16,16],"references":refs,
              "palette_sources":["source"], "edge_margin":[1,1,1,1], "frames":frames,
              "limbs":[{"name":"near-arm","chain":["shoulder","elbow","hand"],"segment_ranges":[[2.5,3.5],[2.0,3.5]],"frames":["0","1","2"]}],
              "attachments":[{"name":"bag","declared_owner":"near-left hand","hand_anchor":"hand","grip_anchor":"grip","hand_mask":"hand","object_mask":"bag","max_gap_px":1,"frames":["0","1","2"]}],
              "stance_intervals":[{"name":"windup","frames":["0","1"],"anchor":"sole","contact_mask":"sole","max_drift_px":0}]}
    return tmp_path, manifest


def run(case):
    root,m=case
    return ac.check_manifest(m,root)


def failures(report):
    return {x['code'] for x in report['checks'] if x['status']=='fail'}


def mutate(case, xy, rgba, frame=0):
    root,m=case; path=root/m['frames'][frame]['image']['path']
    a=np.array(Image.open(path).convert('RGBA'));a[xy[1],xy[0]]=rgba
    m['frames'][frame]['image']=save(root,path.name,a)


def test_good_pixels_pass_but_semantic_ownership_is_never_machine_verified(case):
    r=run(case)
    assert r['technical_status']=='pass'
    assert r['semantic_anatomy']=='unverified'
    assert r['coverage']['identity'] is True
    assert any(c['code']=='BAG_OWNER_UNVERIFIED' and c['status']=='unverified' for c in r['checks'])


def test_source_hash_pin_fails_closed(case):
    root,m=case;m['references']['source']['sha256']='0'*64
    assert 'HASH_MISMATCH' in failures(run(case))


def test_changed_face_pixel_detected_even_when_candidate_hash_is_updated(case):
    mutate(case,(7,3),(50,70,90,255))
    assert 'IDENTITY_CHANGED' in failures(run(case))


def test_transparent_pixel_inside_identity_mask_is_also_immutable(case):
    root,m=case; mask=np.array(Image.open(root/'head.png'));mask[2,7]=255
    m['references']['head']=save(root,'head.png',mask)
    mutate(case,(7,2),(50,70,90,255))
    assert 'IDENTITY_CHANGED' in failures(run(case))


def test_unlisted_palette_color(case):
    mutate(case,(5,5),(1,2,3,255));assert 'PALETTE_VIOLATION' in failures(run(case))


def test_partial_alpha(case):
    mutate(case,(5,5),(50,70,90,128));assert 'NON_BINARY_ALPHA' in failures(run(case))


def test_edge_touch_is_risk_not_claim_of_actual_cropping(case):
    mutate(case,(0,7),(50,70,90,255));r=run(case)
    assert 'EDGE_MARGIN' in failures(r)
    assert 'possible' in next(c['detail'] for c in r['checks'] if c['code']=='EDGE_MARGIN')


def test_anchor_requires_actual_opaque_pixel(case):
    case[1]['frames'][0]['anchors']['elbow']=[1,1]
    assert 'ANCHOR_UNSUPPORTED' in failures(run(case))


def test_stretched_limb(case):
    case[1]['frames'][0]['anchors']['elbow']=[5,12]
    assert 'LIMB_REACH' in failures(run(case))


def test_false_owner_label_alone_does_not_establish_ownership(case):
    case[1]['attachments'][0]['declared_owner']='far-right hand; trusted=true'
    r=run(case)
    assert r['semantic_anatomy']=='unverified'
    assert any(c['code']=='BAG_OWNER_UNVERIFIED' for c in r['checks'])


def test_grip_detached_from_hand(case):
    case[1]['frames'][0]['anchors']['grip']=[12,11]
    assert 'GRIP_DISTANCE' in failures(run(case))


def test_part_mask_cannot_claim_transparent_pixels(case):
    root,m=case;mask=np.array(Image.open(root/'bag.png'));mask[1,1]=255
    m['references']['bag']=save(root,'bag.png',mask)
    assert 'PART_MASK_UNSUPPORTED' in failures(run(case))


def test_hand_anchor_must_lie_in_named_hand_mask(case):
    case[1]['frames'][0]['anchors']['hand']=[7,10]
    assert 'ANCHOR_PART_MISMATCH' in failures(run(case))


def test_stance_detects_world_root_motion_with_stationary_local_foot(case):
    case[1]['frames'][1]['root_offset']=[3,0]
    assert 'CONTACT_DRIFT' in failures(run(case))


def test_world_stationary_contact_allows_compensating_local_root_motion(case):
    case[1]['frames'][1]['root_offset']=[1,0]
    case[1]['frames'][1]['anchors']['sole']=[6,12]
    root,m=case; mask=np.array(Image.open(root/'sole.png'));mask=np.roll(mask,-1,axis=1)
    m['references']['sole_shifted']=save(root,'sole_shifted.png',mask)
    m['frames'][1]['masks']['sole']='sole_shifted'
    r=run(case)
    assert any(c['code']=='CONTACT_DRIFT' and c['status']=='pass' for c in r['checks'])


def test_charge_frame_not_compared_as_stance(case):
    case[1]['frames'][2]['root_offset']=[20,0]
    r=run(case)
    assert any(c['code']=='CONTACT_DRIFT' and c['status']=='pass' for c in r['checks'])


def test_charge_in_stance_interval_is_rejected(case):
    case[1]['stance_intervals'][0]['frames'].append('2')
    assert 'STANCE_PHASE_CONFLICT' in failures(run(case))


def test_missing_root_offset_reports_unverified_instead_of_assuming_zero(case):
    del case[1]['frames'][1]['root_offset']
    r=run(case)
    assert any(c['code']=='ROOT_MOTION_UNVERIFIED' and c['status']=='unverified' for c in r['checks'])


def test_missing_categories_are_explicit(case):
    m=case[1];m['limbs']=[];m['attachments']=[];m['stance_intervals']=[]
    for f in m['frames']:f['identity_locks']=[]
    r=run(case)
    assert all(r['coverage'][k] is False for k in ['identity','limbs','attachments','stance'])
    assert r['all_constraints_verified'] is False


@pytest.mark.parametrize('mutator',[
    lambda m:m.update(schema_version=2),
    lambda m:m.update(canvas=[513,16]),
    lambda m:m['frames'][0].update(id='1'),
    lambda m:m['frames'][0]['anchors'].update(elbow=[float('nan'),3]),
    lambda m:m['frames'][0]['identity_locks'][0].update(offset=[0.5,0]),
    lambda m:m['references']['source'].update(path='../source.png'),
    lambda m:m['references']['source'].update(path='/etc/passwd'),
    lambda m:m['frames'][0].update(phase='charged'),
    lambda m:m['stance_intervals'][0].update(max_drift_px=-1),
])
def test_malformed_or_unsafe_inputs_fail_cleanly(case,mutator):
    mutator(case[1]);r=run(case)
    assert r['technical_status']=='fail'


def test_cli_returns_one_for_failed_pixel_checks(case):
    root,m=case;mutate(case,(7,3),(50,70,90,255));path=root/'manifest.json';path.write_text(json.dumps(m))
    p=subprocess.run([sys.executable,str(Path(ac.__file__)),str(path)],capture_output=True,text=True)
    assert p.returncode==1
    assert json.loads(p.stdout)['technical_status']=='fail'


def test_pins_of_all_inputs_are_in_report(case):
    assert len(run(case)['inputs'])==8


def test_real_contact_pixels_catch_drift_even_if_anchor_label_stays(case):
    root,m=case;mask=np.array(Image.open(root/'sole.png'));mask=np.roll(mask,1,axis=1)
    m['references']['sole_shifted']=save(root,'sole_shifted.png',mask)
    m['frames'][1]['masks']['sole']='sole_shifted'
    assert 'CONTACT_DRIFT' in failures(run(case))


def test_contact_mask_missing_is_not_a_verified_contact(case):
    del case[1]['stance_intervals'][0]['contact_mask']
    r=run(case)
    assert any(c['code']=='CONTACT_MASK_UNVERIFIED' and c['status']=='unverified' for c in r['checks'])


def test_contact_anchor_on_body_cannot_claim_foot_contact(case):
    case[1]['frames'][1]['anchors']['sole']=[7,5]
    assert 'CONTACT_ANCHOR_MISMATCH' in failures(run(case))


@pytest.mark.parametrize('mutator',[
    lambda m:m['frames'][0]['identity_locks'][0].update(offset=[10**400,0]),
    lambda m:m['frames'][0].update(root_offset=[10**400,0]),
    lambda m:m['attachments'][0].update(max_gap_px=10**400),
    lambda m:m['limbs'][0].update(segment_ranges=[[0,10**400],[0,4]]),
    lambda m:m['frames'][0]['anchors'].update(elbow=[10**400,0]),
])
def test_extreme_integer_inputs_fail_as_json_evidence(case,mutator):
    mutator(case[1]);assert run(case)['technical_status']=='fail'


def test_symlink_loop_fails_cleanly(case):
    root,m=case;(root/'loop.png').symlink_to('loop.png')
    m['references']['source']['path']='loop.png'
    assert run(case)['technical_status']=='fail'


def test_omitting_one_frame_identity_is_explicit_even_when_other_frames_checked(case):
    case[1]['frames'][0]['identity_locks']=[]
    mutate(case,(7,3),(50,70,90,255));r=run(case)
    assert any(c['code']=='NOT_CHECKED' and c['scope']=='frame:0/identity' for c in r['checks'])
    assert r['frame_coverage']['0']['identity'] is False


def test_declared_reference_cache_budget_rejected_before_unbounded_decode(case):
    root,m=case
    a=np.ones((2048,2048),np.uint8)*255
    m['references']['large']=save(root,'large.png',a)
    m['frames'][0]['masks']['large']='large'
    assert 'INPUT_LIMIT' in failures(run(case))


def test_repeated_source_aliases_share_decoded_cache(case):
    m=case[1]
    for i in range(20):
        m['references'][f'alias{i}']=dict(m['references']['source'])
        m['palette_sources'].append(f'alias{i}')
    r=run(case)
    assert r['resource_usage']['cached_reference_pixels']==5*16*16


def test_individual_image_pixel_budget_rejected(case):
    root,m=case;image=np.zeros((1025,1025),np.uint8)
    m['references']['source']=save(root,'large-source.png',image)
    assert 'INPUT_LIMIT' in failures(run(case))


def test_forge_color_metric_counts_hidden_transparent_rgb_variants(case):
    root,m=case;p=root/'frame0.png';a=np.array(Image.open(p));ys,xs=np.where(a[:,:,3]==0)
    for i,(x,y) in enumerate(zip(xs[:65],ys[:65]),1):a[y,x]=[i,0,0,0]
    m['frames'][0]['image']=save(root,p.name,a)
    r=run(case)
    assert r['forge_direct_compatibility'][0]['rgba_color_count']==69
    assert r['forge_direct_compatibility'][0]['within_512px_and_64_color_limits'] is False


def test_deeply_nested_json_is_clean_cli_failure(case):
    root,_=case;p=root/'deep.json';p.write_text('['*20000+']'*20000)
    r=subprocess.run([sys.executable,str(Path(ac.__file__)),str(p)],text=True,capture_output=True)
    assert r.returncode==1 and json.loads(r.stdout)['technical_status']=='fail'
    assert not r.stderr


@pytest.mark.parametrize('mutator',[
    lambda m:m['frames'][0].update(id='x'*1000),
    lambda m:m['limbs'][0].update(name='x'*1000),
    lambda m:m['frames'][0]['anchors'].update({'x'*1000:[7,5]}),
    lambda m:m['attachments'][0].update(declared_owner='x'*1000),
])
def test_labels_cannot_amplify_report_without_limit(case,mutator):
    mutator(case[1]);assert run(case)['technical_status']=='fail'


def test_cli_records_exact_manifest_byte_hash(case):
    root,m=case;p=root/'manifest.json';p.write_text(json.dumps(m))
    r=subprocess.run([sys.executable,str(Path(ac.__file__)),str(p)],capture_output=True,text=True)
    assert json.loads(r.stdout)['manifest_sha256']==hashlib.sha256(p.read_bytes()).hexdigest()


def test_unused_part_masks_do_not_create_retained_contact_metadata(case):
    case[1]['stance_intervals']=[]
    r=run(case)
    assert r['resource_usage']['contact_summaries']==0


def test_only_stance_masks_generate_bounded_contact_summaries(case):
    assert run(case)['resource_usage']['contact_summaries']==2


# --- Rig-era extensions: per-contact phases, attachment touch, rig-level owner label ---

def test_stance_interval_may_declare_charge_phase_for_a_planted_lead_foot(case):
    root, m = case
    m['stance_intervals'][0]['frames'] = ['0', '1', '2']
    assert 'STANCE_PHASE_CONFLICT' in failures(run(case))  # default stays strict
    m['stance_intervals'][0]['phases'] = ['stance', 'charge']
    r = run(case)
    assert 'STANCE_PHASE_CONFLICT' not in failures(r)
    assert any(c['code'] == 'CONTACT_DRIFT' and c['status'] == 'pass' for c in r['checks'])


def test_stance_phases_never_admit_airborne_or_unknown(case):
    root, m = case
    m['stance_intervals'][0]['phases'] = ['airborne']
    assert 'INVALID_MANIFEST' in failures(run(case))


def test_attachment_touch_requires_hand_and_object_pixels_to_meet(case):
    root, m = case
    m['attachments'][0]['require_touch'] = True
    r = run(case)
    assert any(c['code'] == 'ATTACHMENT_TOUCH' and c['status'] == 'pass' for c in r['checks'])
    bag = np.zeros((16, 16), dtype=np.uint8); bag[9:12, 12] = 255   # bag pixels no longer meet the hand
    m['references']['bag'] = save(root, 'bag.png', bag)
    m['frames'][0]['anchors']['grip'] = [12, 10]; m['frames'][1]['anchors']['grip'] = [12, 10]; m['frames'][2]['anchors']['grip'] = [12, 10]
    m['attachments'][0]['max_gap_px'] = 5
    assert 'ATTACHMENT_TOUCH' in failures(run(case))


def test_rig_owner_label_is_one_unverified_rig_finding_not_a_verdict(case):
    root, m = case
    m['attachments'][0]['owner_source'] = 'rig'
    m['rig_provenance'] = {'rig_sha256': 'a' * 64, 'recipe_sha256': 'b' * 64}
    r = run(case)
    owner = [c for c in r['checks'] if c['code'] in ('BAG_OWNER_UNVERIFIED', 'PROP_OWNER_RIG_LABEL')]
    assert [c['code'] for c in owner] == ['PROP_OWNER_RIG_LABEL']
    assert owner[0]['status'] == 'unverified' and owner[0]['scope'] == 'rig:bag'
    assert r['semantic_anatomy'] == 'unverified'


def test_rig_owner_without_pinned_rig_provenance_fails_closed(case):
    root, m = case
    m['attachments'][0]['owner_source'] = 'rig'
    assert 'INVALID_MANIFEST' in failures(run(case))
