import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import request from 'supertest'

import { errorHandler } from '../../src/middlewares/errorHandler.js'
import { notFound } from '../../src/middlewares/notFound.js'
import { AppError } from '../../src/utils/AppError.js'

// App mínima con rutas que fallan a propósito para probar el middleware aislado.
const buildApp = () => {
    const app = express()
    app.get('/sync-error', () => {
        throw new Error('password=secreta mongodb://admin:clave@host/db')
    })
    app.get('/async-error', async () => {
        throw new Error('fallo interno con datos sensibles')
    })
    app.get('/app-error', () => {
        throw new AppError(422, 'Datos no procesables', [{ field: 'code', message: 'Inválido' }])
    })
    app.use(notFound)
    app.use(errorHandler)
    return app
}

describe('errorHandler', () => {
    const app = buildApp()

    it('oculta el mensaje y el stack de errores inesperados', async () => {
        const res = await request(app).get('/sync-error')
        const body = JSON.stringify(res.body)

        assert.equal(res.status, 500)
        assert.deepEqual(res.body, { success: false, message: 'Error interno del servidor' })
        assert.ok(!body.includes('secreta'))
        assert.ok(!body.includes('mongodb://'))
    })

    it('captura errores de funciones async (Express 5)', async () => {
        const res = await request(app).get('/async-error')
        assert.equal(res.status, 500)
        assert.equal(res.body.message, 'Error interno del servidor')
    })

    it('respeta el estado y mensaje de un AppError', async () => {
        const res = await request(app).get('/app-error')

        assert.equal(res.status, 422)
        assert.deepEqual(res.body, {
            success: false,
            message: 'Datos no procesables',
            errors: [{ field: 'code', message: 'Inválido' }]
        })
    })
})
