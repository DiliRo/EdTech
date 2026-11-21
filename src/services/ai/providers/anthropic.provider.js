import { AIProviderError, AI_ERROR_CODES, errorFromStatus, fetchWithTimeout } from '../errors.js'

const ENDPOINT = 'https://api.anthropic.com/v1/messages'

/**
 * Proveedor Anthropic (Messages API). Interfaz común de todos los proveedores:
 *   generate({ system, user }) → { text, usage: { inputTokens, outputTokens }, model }
 */
export const createAnthropicProvider = (config, { fetchImpl = globalThis.fetch } = {}) => ({
    name: 'anthropic',
    model: config.model,

    async generate({ system, user }) {
        const response = await fetchWithTimeout(
            fetchImpl,
            ENDPOINT,
            {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'x-api-key': config.apiKey,
                    'anthropic-version': config.anthropicVersion
                },
                body: JSON.stringify({
                    model: config.model,
                    max_tokens: config.maxOutputTokens,
                    temperature: config.temperature,
                    system,
                    messages: [{ role: 'user', content: user }]
                })
            },
            config.timeoutMs
        )

        if (!response.ok) throw errorFromStatus(response.status)

        let body
        try {
            body = await response.json()
        } catch {
            throw new AIProviderError(AI_ERROR_CODES.INVALID_RESPONSE, 'Respuesta no es JSON')
        }

        if (body?.stop_reason === 'refusal') throw new AIProviderError(AI_ERROR_CODES.REFUSED)
        if (body?.stop_reason === 'max_tokens') {
            throw new AIProviderError(AI_ERROR_CODES.OUTPUT_TOO_LONG, 'Se alcanzó el máximo de tokens')
        }

        const text = (body?.content ?? []).filter((b) => b?.type === 'text').map((b) => b.text).join('')
        if (!text) throw new AIProviderError(AI_ERROR_CODES.INVALID_RESPONSE, 'Respuesta vacía')

        return {
            text,
            usage: { inputTokens: body?.usage?.input_tokens ?? null, outputTokens: body?.usage?.output_tokens ?? null },
            model: body?.model ?? config.model
        }
    }
})
