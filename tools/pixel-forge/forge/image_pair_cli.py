"""Small CLI/MCP facade; no provider imports or credentials on the native path."""
import argparse
import json
from . import image_pair
from .bounded_io import read_bounded


def action(action,root,*,spec=None,key=None,ticket=None,image_path=None,receipt=None,
           native_image_tool=False,stage=None,feedback=None,edit_mask=None,
           max_changed_pixels=None,backend=None,review_record=None,max_reference_images=None):
    if action=='capabilities':
        result=image_pair.capabilities()
        if backend is not None:
            result['provider_adapter']=backend.capability()
            if result['provider_adapter'].get('provider')=='openai-images-api':
                result['api_adapter']=result['provider_adapter']
        return result
    if action=='begin':return image_pair.begin(root,spec)
    if action=='status':return image_pair.status(root,key)
    if action=='dispatch':return image_pair.dispatch(root,key,capabilities={'native_image_tool':native_image_tool,
        **({'max_reference_images':max_reference_images} if max_reference_images is not None else {})})
    if action=='accept':return image_pair.accept(root,key,ticket,image_path,receipt)
    if action=='revise':return image_pair.revise(root,key,stage,feedback,edit_mask=edit_mask,max_changed_pixels=max_changed_pixels)
    if action=='normalize':return image_pair.normalize_sheet(root,key)
    if action=='review-mockup':return image_pair.review_mockup(root,key,review_record)
    if action=='run':return image_pair.run_provider(root,key,backend)
    raise ValueError('unknown image-pair action')


def main(argv=None):
    ap=argparse.ArgumentParser(prog='forge image-pair')
    ap.add_argument('action',choices=['capabilities','begin','status','dispatch','accept','revise','normalize','run','review-mockup'])
    ap.add_argument('--root',required=True);ap.add_argument('--key');ap.add_argument('--spec')
    ap.add_argument('--ticket');ap.add_argument('--image-path');ap.add_argument('--receipt')
    ap.add_argument('--review-record')
    ap.add_argument('--native-image-tool',action='store_true');ap.add_argument('--stage',choices=['mockup','sheet'])
    ap.add_argument('--max-reference-images',type=int,help='explicit caller image limit for dispatch; no inferred default')
    ap.add_argument('--feedback');ap.add_argument('--edit-mask');ap.add_argument('--max-changed-pixels',type=int)
    # `run`: one pending request through the OpenAI Images API, keyed from the environment.
    ap.add_argument('--model',help='exact image model id (run only; no default)')
    ap.add_argument('--revision',default='env-openai-1',help='your model/config revision label for provenance')
    ap.add_argument('--api-key-env',default='OPENAI_API_KEY',help='environment variable holding the key (never printed)')
    ap.add_argument('--base-url',default=None,help=argparse.SUPPRESS)
    args=vars(ap.parse_args(argv))
    model,revision,key_env,base_url=(args.pop(k) for k in ('model','revision','api_key_env','base_url'))
    if args['action']=='run':
        from . import openai_http
        from .image_provider import OpenAIImagesBackend
        if not model:ap.error('run needs --model (an exact image model id)')
        client=openai_http.from_environment(key_env=key_env,base_url=base_url or openai_http.DEFAULT_BASE_URL)
        if client is None:ap.error(f'run needs an API key in ${key_env}; nothing was sent')
        args['backend']=OpenAIImagesBackend(client,model=model,revision=revision,enabled=True)
    for field in ('spec','receipt','review_record'):
        if args[field]:args[field]=json.loads(read_bounded(args[field],512*1024))
    if args['action']=='run':
        from .image_provider import ImageProviderError
        try:result=action(**args)
        except ImageProviderError as error:
            print(json.dumps(error.result(),indent=2));return 1
        print(json.dumps(result,indent=2));return 0
    print(json.dumps(action(**args),indent=2));return 0
