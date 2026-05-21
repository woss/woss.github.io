/**
 * Test setup — runs before all test files.
 * Sets process.env values so the server config module loads with test defaults.
 *
 * Individual test files can override these values for specific tests.
 * Changing env vars between tests requires re-importing the module.
 */
process.env.OPENAI_API_KEY = 'sk-test-key-12345';
process.env.OPENAI_BASE_URL = 'http://test.local/v1';
process.env.OPENAI_MODEL = 'test-model';
process.env.OPENAI_MAX_TOKENS = '4096';
process.env.GITHUB_TOKEN = '';
process.env.GITHUB_MCP_URL = '';
process.env.LLM_CACHE_ENABLED = 'false';
process.env.PUBLIC_MAX_MESSAGES = '50';
process.env.MCP_SERVERS = '';
