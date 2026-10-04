"""Small CLI/MCP facade; no provider imports or credentials on the native path."""
import argparse
import json
from . import image_pair
from .bounded_io import read_bounded


def action(action,root,*,spec=None,key=None,ticket=None,image_path=None,receipt=None,
           native_image_tool=False,stage=None,feedback=None,edit_mask=None,
           max_changed_pixels=None,backend=None):
    if action=='capabilities':
        result=image_pair.capabilities()
        if backend is not None:result['api_adapter']=backend.capability()
        return result
    if action=='begin':return image_pair.begin(root,spec)
    if action=='status':return image_pair.status(root,key)
    if action=='dispatch':return image_pair.dispatch(root,key,capabilities={'native_image_tool':native_image_tool})
    if action=='accept':return image_pair.accept(root,key,ticket,image_path,receipt)
    if action=='revise':return image_pair.revise(root,key,stage,feedback,edit_mask=edit_mask,max_changed_pixels=max_changed_pixels)
    if action=='normalize':return image_pair.normalize_sheet(root,key)
    if action=='run':return image_pair.run_provider(root,key,backend)
    raise ValueError('unknown image-pair action')


def main(argv=None):
    ap=argparse.ArgumentParser(prog='forge image-pair')
    ap.add_argument('action',choices=['capabilities','begin','status','dispatch','accept','revise','normalize'])
    ap.add_argument('--root',required=True);ap.add_argument('--key');ap.add_argument('--spec')
    ap.add_argument('--ticket');ap.add_argument('--image-path');ap.add_argument('--receipt')
    ap.add_argument('--native-image-tool',action='store_true');ap.add_argument('--stage',choices=['mockup','sheet'])
    ap.add_argument('--feedback');ap.add_argument('--edit-mask');ap.add_argument('--max-changed-pixels',type=int)
    args=vars(ap.parse_args(argv))
    for field in ('spec','receipt'):
        if args[field]:args[field]=json.loads(read_bounded(args[field],512*1024))
    print(json.dumps(action(**args),indent=2));return 0
