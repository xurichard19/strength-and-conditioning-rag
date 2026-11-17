"""Exercise billing deployment serialization without cloud calls or real credentials."""

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import textwrap
import unittest
from unittest.mock import patch

from app.config import AISettings, BillingSettings, Settings


ROOT = Path(__file__).resolve().parents[2]
IDS = ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222')
LISTS = ('REVENUECAT_APP_IDS', 'BILLING_SANDBOX_USER_IDS')


def step(workflow, name):
    return workflow.split(f'      - name: {name}\n', 1)[1].split('\n      - ', 1)[0]


def action_environment(value):
    """Decode actions-utils v1.0.1's delimiters/escapes; quotes are ordinary characters.

    External contract: github.com/google-github-actions/actions-utils/blob/v1.0.1/src/kv.ts.
    Kept independent of the workflow's JSON encoder and offline for backend CI.
    """
    entries = []; current = []; escaped = False
    for character in value:
        if escaped:
            current.append(character); escaped = False
        elif character == '\\':
            escaped = True
        elif character in ',\n\r\u2028\u2029':
            entries.append(''.join(current)); current = []
        else:
            current.append(character)
    if escaped:
        raise ValueError('unterminated action escape')
    entries.append(''.join(current))
    return {key.strip(): value.strip() for entry in entries
        for key, _, value in [entry.partition('=')] if key.strip()}


class BillingDeploymentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.backend = (ROOT / '.github/workflows/deploy-backend-cloud-run.yml').read_text()
        cls.planning = (ROOT / '.github/workflows/deploy-planning-cloud-run.yml').read_text()
        validation = step(cls.backend, 'validate optional billing configuration')
        run = textwrap.dedent(validation.split('        run: |\n', 1)[1])
        cls.script = run.split("python - <<'PY'\n", 1)[1].rsplit('\nPY', 1)[0]

    def prepare(self, values, *, success=True):
        environment = {key: os.environ[key] for key in ('SystemRoot', 'SYSTEMROOT') if key in os.environ}
        environment.update(BILLING_ENABLED='true', REVENUECAT_API_KEY='test-key',
            REVENUECAT_WEBHOOK_AUTHORIZATION='Bearer test', REVENUECAT_APP_IDS='["app_one"]',
            BILLING_SANDBOX_USER_IDS='[]')
        environment.update(values)
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'output'
            result = subprocess.run([sys.executable, '-c', self.script], cwd=directory,
                env=environment | {'GITHUB_OUTPUT': str(output)}, capture_output=True, text=True, timeout=10)
            self.assertEqual(result.returncode == 0, success, result.stdout + result.stderr)
            outputs = dict(line.split('=', 1) for line in output.read_text().splitlines()) if output.exists() else {}
        return outputs

    def deployed_lists(self, workflow, name, replacements):
        lines = [line.strip() for line in step(workflow, name).splitlines()
            if any(line.strip().startswith(f'{key}=') for key in LISTS)]
        self.assertTrue(lines, name)
        value = '\n'.join(lines)
        for expression, replacement in replacements.items():
            value = value.replace('${{ ' + expression + ' }}', replacement)
        self.assertNotIn('${{', value, 'deployment must use the prepared outputs')
        return action_environment(value)

    def test_lists_round_trip_into_api_worker_and_dispatcher_settings(self):
        cases = [(False, [], []), (False, ['app_one', 'app_two'], list(IDS)),
            (True, ['app_one'], []), (True, ['app_one'], [IDS[0]]),
            (True, ['app_one', 'app_two'], list(IDS)),
            (True, ['app,one', 'app\\two"=value\n\u2028'], list(IDS))]
        for enabled, app_ids, user_ids in cases:
            with self.subTest(enabled=enabled, app_ids=app_ids, user_ids=user_ids):
                values = {'BILLING_ENABLED': str(enabled).lower(), 'REVENUECAT_APP_IDS': json.dumps(app_ids),
                    'BILLING_SANDBOX_USER_IDS': json.dumps(user_ids)}
                prepared = self.prepare(values)
                self.assertEqual(set(prepared), set(LISTS))
                expected_apps, expected_users = (app_ids, user_ids) if enabled else ([], [])
                replacements = {f'steps.billing.outputs.{key}': value for key, value in prepared.items()}
                replacements['inputs.billing_sandbox_user_ids'] = prepared['BILLING_SANDBOX_USER_IDS']
                for workflow, name, model in ((self.backend, 'deploy backend to cloud run', Settings),
                        (self.planning, 'deploy private planning worker', AISettings),
                        (self.planning, 'deploy private dispatcher', BillingSettings)):
                    deployed = self.deployed_lists(workflow, name, replacements)
                    environment = {'ENVIRONMENT': 'production', 'BILLING_ENABLED': str(enabled).lower(),
                        'SUPABASE_URL': 'https://test.supabase.co', 'SUPABASE_PUBLISHABLE_KEY': 'test',
                        'SUPABASE_SECRET_KEY': 'test', 'REVENUECAT_API_KEY': 'test',
                        'REVENUECAT_WEBHOOK_AUTHORIZATION': 'test', **dict.fromkeys(
                            ('CHROMA_TENANT', 'CHROMA_DATABASE', 'CHROMA_API_KEY', 'OPENAI_API_KEY',
                             'COHERE_API_KEY', 'TAVILY_API_KEY'), 'test'), **deployed}
                    with patch.dict(os.environ, environment, clear=True):
                        configured = model(_env_file=None)
                    self.assertEqual(configured.billing_enabled, enabled)
                    self.assertEqual(list(map(str, configured.billing_sandbox_user_ids)), expected_users)
                    if model is Settings:
                        self.assertEqual(configured.revenuecat_app_ids, expected_apps)

    def test_disabled_billing_ignores_unused_credentials_and_invalid_lists(self):
        prepared = self.prepare({'BILLING_ENABLED': 'false', 'REVENUECAT_API_KEY': '',
            'REVENUECAT_WEBHOOK_AUTHORIZATION': '', 'REVENUECAT_APP_IDS': 'invalid',
            'BILLING_SANDBOX_USER_IDS': 'invalid'})
        self.assertEqual(prepared, dict.fromkeys(LISTS, '[]'))

    def test_action_parser_contract_preserves_quotes_and_splits_unescaped_commas(self):
        self.assertEqual(action_environment("IDS='[]'"), {'IDS': "'[]'"})
        self.assertEqual(action_environment('IDS=["a","b"]'), {'IDS': '["a"', '"b"]': ''})

    def test_invalid_enabled_configuration_produces_no_deployment_outputs(self):
        cases = [('BILLING_ENABLED', 'yes'), ('REVENUECAT_API_KEY', ''),
            ('REVENUECAT_WEBHOOK_AUTHORIZATION', ' '), ('REVENUECAT_APP_IDS', '[]'),
            ('REVENUECAT_APP_IDS', '{}'), ('REVENUECAT_APP_IDS', '[null]'),
            ('REVENUECAT_APP_IDS', '[" "]'), ('BILLING_SANDBOX_USER_IDS', '["not-a-uuid"]'),
            ('BILLING_SANDBOX_USER_IDS', 'invalid')]
        for name, value in cases:
            with self.subTest(name=name, value=value):
                self.assertEqual(self.prepare({name: value}, success=False), {})

    def test_prepared_sandbox_list_is_forwarded_to_reusable_workflow(self):
        self.assertIn('        id: billing\n', step(self.backend, 'validate optional billing configuration'))
        self.assertIn('      billing_sandbox_user_ids: ${{ steps.billing.outputs.BILLING_SANDBOX_USER_IDS }}', self.backend)
        self.assertIn('      billing_sandbox_user_ids: ${{ needs.deploy.outputs.billing_sandbox_user_ids }}', self.backend)
        argument = self.planning.split('      billing_sandbox_user_ids:\n', 1)[1].split('\n\n', 1)[0]
        self.assertIn('        required: true', argument)
        self.assertIn('        type: string', argument)
