import { describe, it, beforeEach, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { Types } from 'mongoose'

import { createApp } from '../../src/app.js'
import Grade from '../../src/models/grade.model.js'
import Subject from '../../src/models/subject.model.js'
import Topic from '../../src/models/topic.model.js'
import { installFakeTeacherStore } from '../helpers/fakeTeacherStore.js'
import { registerTeacher, bearer } from '../helpers/factories.js'
import { queryChain, callArgs } from '../helpers/queryChain.js'

const app = createApp()
const id = () => new Types.ObjectId()
const source = { type: 'sample', importedAt: new Date('2026-01-01') }

const grade = new Grade({ _id: id(), number: 1, name: 'Primer grado', level: 'primaria' })
const subject = new Subject({ _id: id(), code: 'prueba-mate', name: '[PRUEBA] Mate', grades: [grade._id], isSample: true, source })
const officialSubject = new Subject({ _id: id(), code: 'oficial', name: 'Oficial', grades: [grade._id], isSample: false, source: { ...source, type: 'cnb' } })
const topic = new Topic({
    _id: id(),
    code: 'tema-1',
    name: '[PRUEBA] Tema',
    grade: grade._id,
    subject: subject._id,
    competencies: [{ code: 'P1', description: '[PRUEBA] c' }],
    achievementIndicators: [{ code: 'P1.1', competencyCode: 'P1', description: '[PRUEBA] i' }],
    isSample: true,
    source
})

describe('API del catálogo (solo lectura)', () => {
    let token

    beforeEach(() => installFakeTeacherStore())
    afterEach(() => mock.restoreAll())

    describe('autenticación', () => {
        for (const path of ['/api/grades', '/api/subjects', '/api/topics', `/api/topics/${topic._id}`]) {
            it(`GET ${path} exige sesión`, async () => {
                const res = await request(app).get(path)
                assert.equal(res.status, 401)
            })
        }
    })

    describe('no permite modificar el catálogo', () => {
        const attempts = [
            ['post', '/api/grades'],
            ['post', '/api/subjects'],
            ['post', '/api/topics'],
            ['put', `/api/topics/${topic._id}`],
            ['patch', `/api/topics/${topic._id}`],
            ['delete', `/api/topics/${topic._id}`],
            ['delete', '/api/subjects']
        ]
        for (const [method, path] of attempts) {
            it(`${method.toUpperCase()} ${path} → 404`, async () => {
                await registerAgain()
                const res = await request(app)[method](path).set(bearer(token)).send({ name: 'x' })
                assert.equal(res.status, 404)
            })
        }
    })

    describe('GET /api/grades', () => {
        it('lista los grados ordenados', async () => {
            const chain = queryChain([grade])
            mock.method(Grade, 'find', () => chain)
            await registerAgain()

            const res = await request(app).get('/api/grades').set(bearer(token))
            assert.equal(res.status, 200)
            assert.equal(res.body.data.grades[0].number, 1)
            assert.equal(res.body.data.grades[0].id, grade._id.toString())
            assert.equal(res.body.data.grades[0]._id, undefined)
            assert.deepEqual(callArgs(chain, 'sort'), [{ level: 1, number: 1 }])
        })

        it('filtra por nivel', async () => {
            const find = mock.method(Grade, 'find', () => queryChain([]))
            await registerAgain()
            await request(app).get('/api/grades?level=primaria').set(bearer(token))
            assert.deepEqual(find.mock.calls[0].arguments[0], { level: 'primaria' })
        })

        it('rechaza un nivel no soportado y parámetros desconocidos', async () => {
            await registerAgain()
            assert.equal((await request(app).get('/api/grades?level=basico').set(bearer(token))).status, 400)
            assert.equal((await request(app).get('/api/grades?orden=1').set(bearer(token))).status, 400)
        })
    })

    describe('GET /api/subjects', () => {
        it('filtra materias por grado y avisa si hay datos de prueba', async () => {
            const find = mock.method(Subject, 'find', () => queryChain([subject, officialSubject]))
            await registerAgain()

            const res = await request(app).get(`/api/subjects?grade=${grade._id}`).set(bearer(token))
            assert.equal(res.status, 200)
            assert.equal(find.mock.calls[0].arguments[0].grades, grade._id.toString())
            assert.equal(res.body.data.subjects.length, 2)
            assert.equal(res.body.data.subjects[0].isSample, true)
            assert.equal(res.body.meta.containsSampleData, true)
        })

        it('meta.containsSampleData es false si todo es oficial', async () => {
            mock.method(Subject, 'find', () => queryChain([officialSubject]))
            await registerAgain()
            const res = await request(app).get('/api/subjects').set(bearer(token))
            assert.equal(res.body.meta.containsSampleData, false)
        })

        it('sin filtro consulta todas las materias', async () => {
            const find = mock.method(Subject, 'find', () => queryChain([]))
            await registerAgain()
            await request(app).get('/api/subjects').set(bearer(token))
            assert.deepEqual(find.mock.calls[0].arguments[0], {})
        })

        it('rechaza un id de grado inválido o un operador de consulta', async () => {
            await registerAgain()
            assert.equal((await request(app).get('/api/subjects?grade=abc').set(bearer(token))).status, 400)
            assert.equal((await request(app).get('/api/subjects?grade[$ne]=x').set(bearer(token))).status, 400)
        })
    })

    describe('GET /api/topics', () => {
        it('filtra por materia y grado con paginación por defecto', async () => {
            const chain = queryChain([topic])
            const find = mock.method(Topic, 'find', () => chain)
            mock.method(Topic, 'countDocuments', async () => 1)
            await registerAgain()

            const res = await request(app)
                .get(`/api/topics?subject=${subject._id}&grade=${grade._id}`)
                .set(bearer(token))

            assert.equal(res.status, 200)
            assert.deepEqual(find.mock.calls[0].arguments[0], {
                subject: subject._id.toString(),
                grade: grade._id.toString()
            })
            assert.deepEqual(callArgs(chain, 'skip'), [0])
            assert.deepEqual(callArgs(chain, 'limit'), [50])
            assert.deepEqual(res.body.meta, { page: 1, limit: 50, total: 1, totalPages: 1, containsSampleData: true })
            assert.equal(res.body.data.topics[0].competencies[0].code, 'P1')
        })

        it('aplica page y limit', async () => {
            const chain = queryChain([])
            mock.method(Topic, 'find', () => chain)
            mock.method(Topic, 'countDocuments', async () => 45)
            await registerAgain()

            const res = await request(app).get('/api/topics?page=3&limit=10').set(bearer(token))
            assert.deepEqual(callArgs(chain, 'skip'), [20])
            assert.deepEqual(callArgs(chain, 'limit'), [10])
            assert.equal(res.body.meta.totalPages, 5)
        })

        for (const qs of ['limit=0', 'limit=101', 'page=0', 'page=abc', 'subject=123', 'grade=x', 'buscar=a']) {
            it(`rechaza ?${qs}`, async () => {
                await registerAgain()
                const res = await request(app).get(`/api/topics?${qs}`).set(bearer(token))
                assert.equal(res.status, 400)
            })
        }
    })

    describe('GET /api/topics/:id', () => {
        it('devuelve el tema', async () => {
            const findById = mock.method(Topic, 'findById', () => queryChain(topic))
            await registerAgain()

            const res = await request(app).get(`/api/topics/${topic._id}`).set(bearer(token))
            assert.equal(res.status, 200)
            assert.equal(findById.mock.calls[0].arguments[0], topic._id.toString())
            assert.equal(res.body.data.topic.code, 'tema-1')
            assert.equal(res.body.data.topic.isSample, true)
            assert.equal(res.body.meta.containsSampleData, true)
        })

        it('responde 404 si no existe', async () => {
            mock.method(Topic, 'findById', () => queryChain(null))
            await registerAgain()
            const res = await request(app).get(`/api/topics/${id()}`).set(bearer(token))
            assert.equal(res.status, 404)
            assert.equal(res.body.message, 'Tema no encontrado')
        })

        it('responde 400 si el id es inválido', async () => {
            await registerAgain()
            const res = await request(app).get('/api/topics/no-es-id').set(bearer(token))
            assert.equal(res.status, 400)
        })
    })

    // El almacén falso de docentes se reinicia en cada prueba: se vuelve a crear la sesión.
    async function registerAgain() {
        ;({ token } = await registerTeacher(app))
    }
})
