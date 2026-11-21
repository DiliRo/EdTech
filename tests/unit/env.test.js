import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { validateEnv } from '../../src/config/env.js'

const SECRET = 'a'.repeat(32)

describe('validateEnv', () => {
    it('falla si falta MONGODB_URI y nombra la variable', () => {
        assert.throws(() => validateEnv({ JWT_SECRET: SECRET }), /MONGODB_URI/)
    })

    it('falla si MONGODB_URI está vacía', () => {
        assert.throws(() => validateEnv({ MONGODB_URI: '   ', JWT_SECRET: SECRET }), /MONGODB_URI/)
    })

    it('falla si falta JWT_SECRET', () => {
        assert.throws(() => validateEnv({ MONGODB_URI: 'mongodb://localhost/edtech' }), /JWT_SECRET/)
    })

    it('falla si JWT_SECRET es demasiado corto, sin mostrar su valor', () => {
        try {
            validateEnv({ MONGODB_URI: 'mongodb://localhost/edtech', JWT_SECRET: 'corto-secreto' })
            assert.fail('debió lanzar')
        } catch (err) {
            assert.match(err.message, /al menos 32/)
            assert.ok(!err.message.includes('corto-secreto'))
        }
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
        assert.doesNotThrow(() => validateEnv({ MONGODB_URI: 'mongodb://localhost:27017/edtech', JWT_SECRET: SECRET }))
    })
})
