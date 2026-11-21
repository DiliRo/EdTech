import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'

import { createApp } from '../../src/app.js'

const app = createApp()

describe('GET /api/health', () => {
    it('responde 503 en JSON cuando la base de datos no está conectada', async () => {
        const res = await request(app).get('/api/health')

        assert.equal(res.status, 503)
        assert.match(res.headers['content-type'], /application\/json/)
        assert.equal(res.body.success, false)
        assert.equal(res.body.data.server, 'ok')
        assert.equal(res.body.data.database, 'disconnected')
        assert.equal(typeof res.body.data.uptimeSeconds, 'number')
        assert.ok(!Number.isNaN(Date.parse(res.body.data.timestamp)))
    })

    it('no expone la URI ni datos de conexión', async () => {
        const res = await request(app).get('/api/health')
        const body = JSON.stringify(res.body)

        assert.ok(!body.includes('mongodb://'))
        assert.ok(!body.includes('127.0.0.1'))
    })
})

describe('Rutas inexistentes', () => {
    it('devuelve 404 en JSON', async () => {
        const res = await request(app).get('/api/no-existe')

        assert.equal(res.status, 404)
        assert.match(res.headers['content-type'], /application\/json/)
        assert.deepEqual(res.body, { success: false, message: 'Ruta no encontrada' })
    })

    it('devuelve 404 también fuera de /api', async () => {
        const res = await request(app).post('/cualquier-cosa')
        assert.equal(res.status, 404)
        assert.equal(res.body.success, false)
    })
})

describe('Procesamiento de JSON', () => {
    it('responde 400 genérico si el JSON está mal formado', async () => {
        const res = await request(app)
            .post('/api/health')
            .set('Content-Type', 'application/json')
            .send('{"incompleto": ')

        assert.equal(res.status, 400)
        assert.equal(res.body.success, false)
        assert.equal(res.body.message, 'El cuerpo de la petición no es JSON válido')
        assert.equal(res.body.stack, undefined)
    })

    it('responde 413 si el cuerpo supera el límite', async () => {
        const res = await request(app)
            .post('/api/health')
            .set('Content-Type', 'application/json')
            .send(JSON.stringify({ texto: 'a'.repeat(200 * 1024) }))

        assert.equal(res.status, 413)
        assert.equal(res.body.success, false)
    })
})

describe('Seguridad básica de cabeceras', () => {
    it('permite CORS para el origen configurado', async () => {
        const res = await request(app).get('/api/health').set('Origin', 'http://localhost:5173')
        assert.equal(res.headers['access-control-allow-origin'], 'http://localhost:5173')
    })

    it('no envía CORS a orígenes no permitidos', async () => {
        const res = await request(app).get('/api/health').set('Origin', 'http://sitio-malicioso.com')
        assert.equal(res.headers['access-control-allow-origin'], undefined)
    })

    it('no revela que usa Express', async () => {
        const res = await request(app).get('/api/health')
        assert.equal(res.headers['x-powered-by'], undefined)
    })
})
