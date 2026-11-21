import { aiConfig, validateAIConfig } from '../../config/ai.js'
import { createAnthropicProvider } from './providers/anthropic.provider.js'
import { createOpenAICompatibleProvider } from './providers/openaiCompatible.provider.js'
import { createMockProvider } from './providers/mock.provider.js'
import { AIProviderError, AI_ERROR_CODES } from './errors.js'

/**
 * Punto único para obtener el proveedor de IA. El resto del código solo conoce la
 * interfaz `generate({ system, user, context })` y no depende de ningún proveedor.
 */
export const createProvider = (config = aiConfig, deps = {}) => {
    const missing = validateAIConfig(config)
    if (missing.length) {
        throw new AIProviderError(AI_ERROR_CODES.NOT_CONFIGURED, `Faltan variables: ${missing.join(', ')}`)
    }
    switch (config.provider) {
        case 'anthropic': return createAnthropicProvider(config, deps)
        case 'openai-compatible': return createOpenAICompatibleProvider(config, deps)
        default: return createMockProvider()
    }
}

let current = null

export const getAIProvider = () => {
    current ??= createProvider()
    return current
}

/** Permite inyectar un proveedor simulado en pruebas. `null` vuelve al configurado. */
export const setAIProvider = (provider) => {
    current = provider
}
