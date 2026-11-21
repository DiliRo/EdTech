import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { createProvider } from '../../src/services/ai/index.js'
import { createAnthropicProvider } from '../../src/services/ai/providers/anthropic.provider.js'
import { createOpenAICompatibleProvider } from '../../src/services/ai/providers/openaiCompatible.provider.js'
import { createMockProvider } from '../../src/services/ai/providers/mock.provider.js'
import { AIProviderError, toHttp } from '../../src/services/ai/errors.js'
import { loadAIConfig, validateAIConfig } from '../../src/config/ai.js'
import { validateGuideContent, extractJson } from '../../src/validators/lessonGuideContent.js'
import { fakeFetchResponse } from '../helpers/aiFixtures.js'

const baseConfig = loadAIConfig({
    AI_PROVIDER: 'anthropic',
    AI_API_KEY: 'clave-secreta',
    AI_MODEL: 'modelo-x',
    AI_BASE_URL: 'https://proveedor.example/v1/',
    AI_TIMEOUT_MS: '1000',
    AI_MAX_OUTPUT_TOKENS: '1500'
})

const recordingFetch = (response) => {
    const calls = []
    const fn = async (url, options) => {
        calls.push({ url, options, body: JSON.parse(options.body) })
        return typeof response === 'function' ? response(url, options) : response
    }
    fn.calls = calls
    return fn
}

describe('Configuración de IA', () => {
    it('usa mock por defecto y valores por defecto razonables', () => {
        const config = loadAIConfig({})
        assert.equal(config.provider, 'mock')
        assert.equal(config.timeoutMs, 30000)
        assert.equal(config.maxAttempts, 2)
        assert.deepEqual(validateAIConfig(config), [])
    })

    it('ignora valores fuera de rango', () => {
        const config = loadAIConfig({ AI_TIMEOUT_MS: '999999', AI_MAX_ATTEMPTS: '10', AI_PROVIDER: 'desconocido' })
        assert.equal(config.timeoutMs, 30000)
        assert.equal(config.maxAttempts, 2)
        assert.equal(config.provider, 'mock')
    })

    it('un proveedor real sin clave o modelo no se crea y no expone la clave', () => {
        assert.deepEqual(validateAIConfig({ ...baseConfig, apiKey: '', model: '' }), ['AI_API_KEY', 'AI_MODEL'])
        assert.deepEqual(validateAIConfig({ ...baseConfig, provider: 'openai-compatible', baseUrl: '' }), ['AI_BASE_URL'])
        assert.throws(() => createProvider({ ...baseConfig, apiKey: '' }), (err) => err.code === 'not_configured' && !err.message.includes('clave-secreta'))
    })

    it('crea el proveedor indicado', () => {
        assert.equal(createProvider(baseConfig).name, 'anthropic')
        assert.equal(createProvider({ ...baseConfig, provider: 'openai-compatible' }).name, 'openai-compatible')
        assert.equal(createProvider({ ...baseConfig, provider: 'mock' }).name, 'mock')
    })
})

describe('Proveedor Anthropic', () => {
    it('envía la petición de Messages API con límites y devuelve texto y consumo', async () => {
        const fetch = recordingFetch(fakeFetchResponse(200, {
            model: 'modelo-x',
            stop_reason: 'end_turn',
            content: [{ type: 'text', text: '{"ok":true}' }],
            usage: { input_tokens: 120, output_tokens: 80 }
        }))
        const provider = createAnthropicProvider(baseConfig, { fetchImpl: fetch })
        const result = await provider.generate({ system: 'SISTEMA', user: 'USUARIO' })

        assert.deepEqual(result, { text: '{"ok":true}', usage: { inputTokens: 120, outputTokens: 80 }, model: 'modelo-x' })
        const [call] = fetch.calls
        assert.equal(call.url, 'https://api.anthropic.com/v1/messages')
        assert.equal(call.options.headers['x-api-key'], 'clave-secreta')
        assert.equal(call.options.headers['anthropic-version'], '2023-06-01')
        assert.equal(call.body.model, 'modelo-x')
        assert.equal(call.body.max_tokens, 1500)
        assert.equal(call.body.system, 'SISTEMA')
        assert.deepEqual(call.body.messages, [{ role: 'user', content: 'USUARIO' }])
        assert.ok(call.options.signal, 'usa tiempo de espera')
    })

    for (const [status, code] of [[401, 'auth'], [403, 'auth'], [429, 'rate_limited'], [529, 'rate_limited'], [500, 'unavailable']]) {
        it(`HTTP ${status} → ${code}`, async () => {
            const provider = createAnthropicProvider(baseConfig, { fetchImpl: recordingFetch(fakeFetchResponse(status, {})) })
            await assert.rejects(provider.generate({ system: 's', user: 'u' }), (err) => err instanceof AIProviderError && err.code === code)
        })
    }

    it('respuesta cortada por max_tokens o rechazo se informan', async () => {
        const cut = createAnthropicProvider(baseConfig, { fetchImpl: recordingFetch(fakeFetchResponse(200, { stop_reason: 'max_tokens', content: [{ type: 'text', text: '{' }] })) })
        await assert.rejects(cut.generate({}), (err) => err.code === 'output_too_long')
        const refused = createAnthropicProvider(baseConfig, { fetchImpl: recordingFetch(fakeFetchResponse(200, { stop_reason: 'refusal', content: [] })) })
        await assert.rejects(refused.generate({}), (err) => err.code === 'refused')
    })

    it('cuerpo vacío o no JSON → invalid_response', async () => {
        const empty = createAnthropicProvider(baseConfig, { fetchImpl: recordingFetch(fakeFetchResponse(200, { content: [] })) })
        await assert.rejects(empty.generate({}), (err) => err.code === 'invalid_response')
        const broken = createAnthropicProvider(baseConfig, { fetchImpl: recordingFetch(fakeFetchResponse(200, new SyntaxError('x'))) })
        await assert.rejects(broken.generate({}), (err) => err.code === 'invalid_response')
    })

    it('un proveedor que no responde a tiempo → timeout', async () => {
        const slowFetch = (url, { signal }) => new Promise((resolve, reject) => {
            signal.addEventListener('abort', () => reject(signal.reason))
        })
        const provider = createAnthropicProvider({ ...baseConfig, timeoutMs: 50 }, { fetchImpl: slowFetch })
        await assert.rejects(provider.generate({}), (err) => err.code === 'timeout')
    })

    it('un error de red → unavailable', async () => {
        const provider = createAnthropicProvider(baseConfig, { fetchImpl: async () => { throw new TypeError('fetch failed') } })
        await assert.rejects(provider.generate({}), (err) => err.code === 'unavailable')
    })
})

describe('Proveedor compatible con OpenAI', () => {
    it('usa chat/completions con modo JSON y Bearer', async () => {
        const fetch = recordingFetch(fakeFetchResponse(200, {
            model: 'modelo-x',
            choices: [{ finish_reason: 'stop', message: { content: '{"ok":true}' } }],
            usage: { prompt_tokens: 50, completion_tokens: 30 }
        }))
        const provider = createOpenAICompatibleProvider({ ...baseConfig, baseUrl: 'https://proveedor.example/v1' }, { fetchImpl: fetch })
        const result = await provider.generate({ system: 'S', user: 'U' })

        assert.deepEqual(result.usage, { inputTokens: 50, outputTokens: 30 })
        const [call] = fetch.calls
        assert.equal(call.url, 'https://proveedor.example/v1/chat/completions')
        assert.equal(call.options.headers.authorization, 'Bearer clave-secreta')
        assert.deepEqual(call.body.response_format, { type: 'json_object' })
        assert.deepEqual(call.body.messages, [{ role: 'system', content: 'S' }, { role: 'user', content: 'U' }])
    })

    it('finish_reason length → output_too_long', async () => {
        const provider = createOpenAICompatibleProvider(baseConfig, {
            fetchImpl: recordingFetch(fakeFetchResponse(200, { choices: [{ finish_reason: 'length', message: { content: '{' } }] }))
        })
        await assert.rejects(provider.generate({}), (err) => err.code === 'output_too_long')
    })
})

describe('Proveedor simulado (mock)', () => {
    it('devuelve una guía de EJEMPLO que pasa la validación', async () => {
        const context = { durationMinutes: 40, topic: { name: 'Fracciones', competencies: [{ code: '2' }] } }
        const { text } = await createMockProvider().generate({ context })
        const content = extractJson(text)
        const result = validateGuideContent(content, { source: 'ai', durationMinutes: 40, allowedCompetencyCodes: ['2'] })
        assert.deepEqual(result.errors, [])
        assert.match(content.title, /\[EJEMPLO\]/)
    })
})

describe('Mensajes de error al docente', () => {
    it('no exponen detalles técnicos del proveedor', () => {
        for (const code of ['timeout', 'rate_limited', 'invalid_response', 'auth', 'not_configured', 'unavailable', 'refused']) {
            const { status, message } = toHttp(new AIProviderError(code, 'HTTP 401 clave-secreta https://api'))
            assert.ok(status >= 400)
            assert.ok(!message.includes('clave') && !message.includes('http'), code)
        }
        assert.equal(toHttp(new AIProviderError('timeout')).status, 504)
        assert.equal(toHttp(new AIProviderError('invalid_response')).status, 502)
    })
})
