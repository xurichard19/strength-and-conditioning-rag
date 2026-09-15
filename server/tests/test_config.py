import unittest
from unittest.mock import patch

from pydantic import ValidationError

from app.config import Settings


class SupabaseURLTests(unittest.TestCase):
    def settings(self, url):
        with patch.dict('os.environ', {}, clear=True):
            return Settings(_env_file=None, supabase_url=url,
                SUPABASE_PUBLISHABLE_KEY='sb_publishable_test',
                chroma_tenant='test', chroma_database='test', chroma_api_key='test',
                openai_api_key='test', cohere_api_key='test', tavily_api_key='test')

    def test_https_project_url_is_accepted(self):
        self.assertEqual(self.settings('https://project.supabase.co/').supabase_url,
            'https://project.supabase.co')

    def test_unsafe_supabase_urls_fail_during_configuration(self):
        for url in ('http://project.supabase.co', 'http://localhost:54321',
                    'project.supabase.co', 'https://', 'https://user:password@host',
                    'https://host?key=value', 'https://host#fragment'):
            with self.subTest(url=url), self.assertRaises(ValidationError):
                self.settings(url)
