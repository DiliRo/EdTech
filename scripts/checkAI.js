#!/usr/bin/env node
/**
 * Comprueba la conexión con el proveedor de IA configurado en .env haciendo UNA llamada
 * mínima. Nunca imprime la clave.
 *
 *   npm run ai:check
 */
import { aiConfig, validateAIConfig } from '../src/config/ai.js'
import { createProvider } from '../src/services/ai/index.js'
import { AIProviderError } from '../src/services/ai/errors.js'
import { extractJson } from '../src/validators/lessonGuideContent.js'

const HINTS = {
    auth: 'La clave fue rechazada. Revisa AI_API_KEY (sin espacios ni comillas) o genera una nueva en Google AI Studio.',
    rate_limited: 'El proveedor limitó las peticiones (cuota gratuita agotada o demasiadas seguidas). Espera e intenta de nuevo.',
    timeout: 'No hubo respuesta a tiempo. Revisa tu conexión o sube AI_TIMEOUT_MS.',
    unavailable: 'No se pudo contactar al proveedor o devolvió un error. Revisa AI_BASE_URL, AI_MODEL y tu conexión.',
    output_too_long: 'Se acabaron los tokens de salida. Sube AI_MAX_OUTPUT_TOKENS o usa AI_REASONING_EFFORT=low.',
    invalid_response: 'El proveedor respondió, pero sin texto válido. Prueba otro AI_MODEL.',
    refused: 'El modelo se negó a responder la prueba.'
}

const main = async () => {
    console.log(`Proveedor: ${aiConfig.provider}`)
    console.log(`Modelo:    ${aiConfig.model || '(sin definir)'}`)
    if (aiConfig.baseUrl) console.log(`URL base:  ${aiConfig.baseUrl}`)
    console.log(`Clave:     ${aiConfig.apiKey ? `configurada (${aiConfig.apiKey.length} caracteres)` : 'NO configurada'}`)

    if (aiConfig.provider === 'mock') {
        console.log('\nAI_PROVIDER=mock: no se llama a ningún servicio. Configura AI_PROVIDER=gemini en .env para usar Gemini.')
        return
    }

    const missing = validateAIConfig(aiConfig)
    if (missing.length) {
        console.error(`\n✖ Faltan variables en .env: ${missing.join(', ')}`)
        process.exitCode = 1
        return
    }

    const started = Date.now()
    try {
        const provider = createProvider(aiConfig)
        const { text, usage, model } = await provider.generate({
            system: 'Responde solo con un objeto JSON válido.',
            user: 'Devuelve exactamente {"ok": true, "mensaje": "conexión correcta"}'
        })
        const json = extractJson(text)
        console.log(`\n✔ Respuesta en ${Date.now() - started} ms del modelo ${model}`)
        console.log(`  JSON válido: ${json ? 'sí' : 'no'} → ${text.slice(0, 200)}`)
        console.log(`  Tokens: entrada ${usage.inputTokens ?? '?'}, salida ${usage.outputTokens ?? '?'}`)
        if (!json) process.exitCode = 1
    } catch (err) {
        const code = err instanceof AIProviderError ? err.code : 'unavailable'
        console.error(`\n✖ Error (${code}) en ${Date.now() - started} ms: ${HINTS[code] ?? err.message}`)
        process.exitCode = 1
    }
}

main()
