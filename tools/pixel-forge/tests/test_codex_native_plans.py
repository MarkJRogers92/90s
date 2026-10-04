"""Exact personal-plan compatibility; all peers/accounts/images are synthetic."""
from pathlib import Path

import pytest

from forge.image_provider import ImageProviderError
from test_codex_native import backend, capture, png, request


@pytest.fixture(autouse=True)
def synthetic_unmanaged_host(monkeypatch):
    import forge.codex_native as native
    monkeypatch.setattr(native, '_SYSTEM_CONFIGS', ())


_MISSING = object()


def plan_backend(tmp_path, plan, *, auth_type='chatgpt'):
    result = backend(tmp_path)
    executable = Path(result.executable)
    script = executable.read_text()
    old = ", 'planType':'enterprise' if MODE=='managed_account' else 'pro'"
    assert script.count(old) == 1
    script = script.replace(old, '' if plan is _MISSING else ", 'planType':" + repr(plan))
    old_auth = "'type':'apiKey' if MODE=='api' else 'chatgpt'"
    assert script.count(old_auth) == 1
    script = script.replace(old_auth, "'type':" + repr(auth_type))
    executable.write_text(script)
    return result


@pytest.mark.parametrize('plan', ['plus', 'pro', 'prolite'])
def test_exact_approved_personal_plans_reach_one_native_fixture(tmp_path, plan):
    result = plan_backend(tmp_path, plan).generate(request())
    assert result['image_bytes'] == png()
    assert result['provider'] == 'codex-native-chatgpt'
    assert sum(m.get('method') == 'turn/start' for m in capture(tmp_path)) == 1


@pytest.mark.parametrize('plan', [
    'free', 'go', 'promax', 'team', 'self_serve_business_prolite',
    'self_serve_business_usage_based', 'business', 'ent26',
    'enterprise_cbp_automation', 'enterprise_cbp_usage_based', 'enterprise',
    'edu', 'edu_plus', 'edu_pro', 'unknown', 'future_personal_plan',
    'ProLite', 'PROLITE', ' prolite', 'prolite ', 'prolite-extra',
    '', None, 123, True, {}, ['prolite'], _MISSING,
])
def test_unapproved_managed_unknown_and_nonexact_plans_fail_before_inference(tmp_path, plan):
    with pytest.raises(ImageProviderError) as raised:
        plan_backend(tmp_path, plan).generate(request())
    assert raised.value.code == 'UNSUPPORTED_NATIVE_ACCOUNT'
    assert raised.value.completion == 'not_started'
    assert not any(m.get('method') in ('thread/start', 'turn/start') for m in capture(tmp_path))


@pytest.mark.parametrize('auth_type', ['apiKey', 'amazonBedrock', 'unknown', None])
def test_prolite_does_not_allow_other_authentication_types(tmp_path, auth_type):
    with pytest.raises(ImageProviderError) as raised:
        plan_backend(tmp_path, 'prolite', auth_type=auth_type).generate(request())
    assert raised.value.code == 'CHATGPT_LOGIN_REQUIRED'
    assert raised.value.completion == 'not_started'
    assert not any(m.get('method') in ('thread/start', 'turn/start') for m in capture(tmp_path))


def test_prolite_keeps_managed_configuration_preflight_before_worker_start(tmp_path, monkeypatch):
    import forge.codex_native as native
    result = plan_backend(tmp_path, 'prolite')
    policy = tmp_path / 'requirements.toml'
    policy.write_text('# synthetic managed-configuration presence\n')
    monkeypatch.setattr(native, '_SYSTEM_CONFIGS', (policy,))
    with pytest.raises(ImageProviderError) as raised:
        result.generate(request())
    assert raised.value.code == 'NATIVE_PROFILE_UNSAFE'
    assert raised.value.completion == 'not_started'
    assert not capture(tmp_path)
