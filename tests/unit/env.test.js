import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { validateEnv } from '../../src/config/env.js'

describe('validateEnv', () => {
    it('falla si falta MONGODB_URI y nombra la variable', () => {
        assert.throws(() => validateEnv({}), /MONGODB_URI/)
    })

    it('falla si MONGODB_URI está vacía', () => {
        assert.throws(() => validateEnv({ MONGODB_URI: '   ' }), /MONGODB_URI/)
    })

    it('no incluye valores en el mensaje de error', () => {
        try {
            validateEnv({ OTRA: 'secreto' })
            assert.fail('debió lanzar')
        } catch (err) {
            assert.ok(!err.message.includes('secreto'))
        }
    })

    it('acepta una configuración válida', () => {
        assert.doesNotThrow(() => validateEnv({ MONGODB_URI: 'mongodb://localhost:27017/edtech' }))
    })
})
