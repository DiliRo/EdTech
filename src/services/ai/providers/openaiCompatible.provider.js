import { AIProviderError, AI_ERROR_CODES, errorFromStatus, fetchWithTimeout } from '../errors.js'

/**
 * Proveedor para cualquier API compatible con Chat Completions (`POST {baseUrl}/chat/completions`).
 * Pide salida en modo JSON.
 */
export const createOpenAICompatibleProvider = (config, { fetchImpl = globalThis.fetch } = {}) => ({
    name: 'openai-compatible',
    model: config.model,

    async generate({ system, user }) {
        const response = await fetchWithTimeout(
            fetchImpl,
            `${config.baseUrl}/chat/completions`,
            {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    authorization: `Bearer ${config.apiKey}`
                },
                body: JSON.stringify({
                    model: config.model,
                    max_tokens: config.maxOutputTokens,
                    temperature: config.temperature,
                    response_format: { type: 'json_object' },
                    ...(config.reasoningEffort ? { reasoning_effort: config.reasoningEffort } : {}),
                    messages: [
                        { role: 'system', content: system },
                        { role: 'user', content: user }
                    ]
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

        const choice = body?.choices?.[0]
        if (choice?.finish_reason === 'length') {
            throw new AIProviderError(AI_ERROR_CODES.OUTPUT_TOO_LONG, 'Se alcanzó el máximo de tokens')
        }
        const text = choice?.message?.content
        if (!text) throw new AIProviderError(AI_ERROR_CODES.INVALID_RESPONSE, 'Respuesta vacía')

        return {
            text,
            usage: { inputTokens: body?.usage?.prompt_tokens ?? null, outputTokens: body?.usage?.completion_tokens ?? null },
            model: body?.model ?? config.model
        }
    }
})
