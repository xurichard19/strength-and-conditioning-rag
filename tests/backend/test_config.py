import unittest
from unittest.mock import patch

from pydantic import ValidationError

from app.config import DatabaseSettings, Settings


class SupabaseURLTests(unittest.TestCase):
    def settings(self, url, **options):
        with patch.dict('os.environ', {}, clear=True):
            return Settings(_env_file=None, supabase_url=url,
                SUPABASE_PUBLISHABLE_KEY='sb_publishable_test',
                chroma_tenant='test', chroma_database='test', chroma_api_key='test',
                openai_api_key='test', cohere_api_key='test', tavily_api_key='test', **options)

    def test_sentry_sample_rate_is_bounded(self):
        self.assertEqual(self.settings('https://project.supabase.co').sentry_traces_sample_rate, 0.1)
        for rate in (-0.1, 1.1, float('nan')):
            with self.subTest(rate=rate), self.assertRaises(ValidationError):
                self.settings('https://project.supabase.co', sentry_traces_sample_rate=rate)

    def test_https_project_url_is_accepted(self):
        self.assertEqual(self.settings('https://project.supabase.co/').supabase_url,
            'https://project.supabase.co')

    def test_local_http_supabase_is_accepted_in_development_and_test(self):
        for environment in ('development', 'local', 'test'):
            for host in ('localhost', '127.0.0.1', '[::1]', '10.0.0.2',
                         '172.16.0.2', '192.168.1.2', '[fd00::1]'):
                with self.subTest(environment=environment, host=host):
                    url = f'http://{host}:54321'
                    self.assertEqual(self.settings(url + '/', environment=environment).supabase_url, url)

    def test_local_http_is_rejected_outside_development_and_test(self):
        for environment in ('production', 'staging', 'prod', 'unknown'):
            for host in ('localhost', '127.0.0.1', '[::1]', '192.168.1.2'):
                with self.subTest(environment=environment, host=host), self.assertRaises(ValidationError):
                    self.settings(f'http://{host}:54321', environment=environment)

    def test_database_only_settings_preserve_local_environment_validation(self):
        with patch.dict('os.environ', {}, clear=True):
            values = dict(_env_file=None, supabase_url='http://127.0.0.1:54321/',
                SUPABASE_PUBLISHABLE_KEY='sb_publishable_test')
            self.assertEqual(DatabaseSettings(**values, environment='test').supabase_url,
                'http://127.0.0.1:54321')
            with self.assertRaises(ValidationError):
                DatabaseSettings(**values, environment='production')

    def test_database_only_settings_do_not_require_api_billing_credentials(self):
        with patch.dict('os.environ', {'BILLING_ENABLED': 'true'}, clear=True):
            configured = DatabaseSettings(_env_file=None, supabase_url='https://project.supabase.co',
                SUPABASE_PUBLISHABLE_KEY='sb_publishable_test', supabase_secret_key='db-secret')
            self.assertEqual(configured.supabase_secret_key.get_secret_value(), 'db-secret')

    def test_unsafe_supabase_urls_fail_during_configuration(self):
        for url in ('http://project.supabase.co', 'http://8.8.8.8:54321',
                    'http://localhost.example.com:54321', 'http://0.0.0.0:54321',
                    'http://169.254.169.254', 'http://172.32.0.1:54321',
                    'http://user:password@localhost:54321',
                    'http://localhost:54321?key=value', 'http://localhost:54321#fragment',
                    'project.supabase.co', 'https://', 'https://user:password@host',
                    'https://host?key=value', 'https://host#fragment'):
            with self.subTest(url=url), self.assertRaises(ValidationError):
                self.settings(url)
