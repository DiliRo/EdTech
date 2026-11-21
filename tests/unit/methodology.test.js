import { describe, it, beforeEach, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import request from 'supertest'
import { Types } from 'mongoose'

import { createApp } from '../../src/app.js'
import TeachingMethod from '../../src/models/teachingMethod.model.js'
import Grade from '../../src/models/grade.model.js'
import Subject from '../../src/models/subject.model.js'
import { seedDefaultMethods, validateDefaultsFile, MethodologySeedError } from '../../src/services/methodologySeed.service.js'
import { installFakeTeacherStore } from '../helpers/fakeTeacherStore.js'
import { installFakeModel } from '../helpers/fakeModel.js'
import { registerTeacher, bearer } from '../helpers/factories.js'

const app = createApp()
const defaultsFile = JSON.parse(await readFile(new URL('../../data/methodologies/mineduc-defaults.json', import.meta.url), 'utf8'))
const clone = (v) => structuredClone(v)
const DEFAULT_NAMES = ['Aprendizaje cooperativo', 'Diálogo de saberes', 'Mundo letrado', 'Rincones de aprendizaje']

const validMethod = (overrides = {}) => ({
    name: 'Lectura en voz alta por turnos',
    description: 'Estrategia propia para practicar fluidez lectora.',
    objectives: ['Mejorar la fluidez lectora'],
    steps: [{ title: 'Modelar', description: 'El docente lee un párrafo en voz alta.' }, { description: 'Cada estudiante lee un párrafo.' }],
    suggestedActivities: [{ title: 'Lectura en parejas' }],
    materials: ['Libro de lectura'],
    estimatedDuration: { minMinutes: 20, maxMinutes: 35 },
    learningPreferences: ['auditiva', 'lectoescritura'],
    ...overrides
})

describe('Carga de metodologías predeterminadas', () => {
    let store
    beforeEach(() => { store = installFakeModel(TeachingMethod) })
    afterEach(() => mock.restoreAll())

    it('el archivo del MINEDUC incluido es válido', async () => {
        assert.deepEqual(await validateDefaultsFile(clone(defaultsFile)), [])
    })

    it('carga las 4 estrategias como predeterminadas, generales y con su fuente', async () => {
        const summary = await seedDefaultMethods(clone(defaultsFile))
        assert.deepEqual(summary, { dryRun: false, received: 4, created: 4, updated: 0 })

        const rows = [...store.rows.values()]
        assert.deepEqual(rows.map((r) => r.name).sort(), DEFAULT_NAMES)
        for (const row of rows) {
            assert.equal(row.isDefault, true)
            assert.equal(row.createdBy, null)
            assert.deepEqual(row.compatibleSubjects, [])
            assert.deepEqual(row.compatibleGrades, [])
            assert.match(row.sourceReference.url, /^https:\/\/digecur\.mineduc\.gob\.gt\//)
            assert.equal(row.sourceReference.year, 2010)
            assert.ok(row.sourceReference.pages)
            assert.ok(row.sourceReference.notes)
            assert.ok(row.learningPreferences.length >= 2)
        }
    })

    it('es repetible: la segunda carga actualiza sin duplicar', async () => {
        await seedDefaultMethods(clone(defaultsFile))
        const data = clone(defaultsFile)
        data.methods[0].description = 'Descripción revisada.'
        const summary = await seedDefaultMethods(data)

        assert.deepEqual(summary, { dryRun: false, received: 4, created: 0, updated: 4 })
        assert.equal(store.rows.size, 4)
        assert.ok([...store.rows.values()].some((r) => r.description === 'Descripción revisada.'))
    })

    it('dryRun valida sin escribir', async () => {
        const summary = await seedDefaultMethods(clone(defaultsFile), { dryRun: true })
        assert.equal(summary.dryRun, true)
        assert.equal(store.rows.size, 0)
    })

    it('rechaza estrategias sin fuente, con una sola preferencia, claves repetidas o campos extra', async () => {
        const data = clone(defaultsFile)
        delete data.methods[0].sourceReference
        data.methods[1].learningPreferences = ['visual']
        data.methods[2].defaultKey = data.methods[3].defaultKey
        data.methods[3].createdBy = 'x'

        await assert.rejects(seedDefaultMethods(data), (err) => {
            assert.ok(err instanceof MethodologySeedError)
            const paths = err.errors.map((e) => e.path)
            assert.ok(paths.includes('methods[0].sourceReference'))
            assert.ok(paths.includes('methods[1].learningPreferences'))
            assert.ok(paths.includes('methods[3].defaultKey'))
            assert.ok(paths.includes('methods[3].createdBy'))
            return true
        })
        assert.equal(store.rows.size, 0)
    })
})

describe('Modelo TeachingMethod', () => {
    const teacherId = new Types.ObjectId()

    it('una metodología no puede tener una sola preferencia de aprendizaje', async () => {
        const method = new TeachingMethod({ ...validMethod({ learningPreferences: ['visual'] }), createdBy: teacherId })
        await assert.rejects(method.validate(), /al menos dos preferencias/)
    })

    it('acepta no indicar preferencias', async () => {
        await new TeachingMethod({ ...validMethod({ learningPreferences: [] }), createdBy: teacherId }).validate()
    })

    it('las personalizadas necesitan autor y no tienen clave predeterminada', async () => {
        await assert.rejects(new TeachingMethod(validMethod()).validate(), /autor/)
        await assert.rejects(
            new TeachingMethod({ ...validMethod(), createdBy: teacherId, defaultKey: 'x' }).validate(),
            /Solo las predeterminadas/
        )
    })

    it('las predeterminadas necesitan fuente y no tienen autor', async () => {
        await assert.rejects(
            new TeachingMethod({ ...validMethod(), isDefault: true, defaultKey: 'x' }).validate(),
            /citar su fuente/
        )
    })

    it('la duración mínima no puede superar la máxima', async () => {
        const method = new TeachingMethod({ ...validMethod({ estimatedDuration: { minMinutes: 60, maxMinutes: 30 } }), createdBy: teacherId })
        await assert.rejects(method.validate(), /duración mínima/)
    })

    it('isDefault y createdBy no se pueden cambiar después de crear', () => {
        assert.equal(TeachingMethod.schema.path('isDefault').options.immutable, true)
        assert.equal(TeachingMethod.schema.path('createdBy').options.immutable, true)
    })

    it('la clave es única solo entre predeterminadas', () => {
        const [fields, options] = TeachingMethod.schema.indexes().find(([, o]) => o.unique)
        assert.deepEqual(fields, { defaultKey: 1 })
        assert.deepEqual(options.partialFilterExpression, { isDefault: true })
    })
})

describe('API de metodologías', () => {
    let methods
    let teacherA
    let teacherB
    let subjectMath
    let subjectReading
    let grade1

    const api = (teacher) => ({
        list: (qs = '') => request(app).get(`/api/methodologies${qs}`).set(bearer(teacher.token)),
        get: (id) => request(app).get(`/api/methodologies/${id}`).set(bearer(teacher.token)),
        create: (body) => request(app).post('/api/methodologies').set(bearer(teacher.token)).send(body),
        patch: (id, body) => request(app).patch(`/api/methodologies/${id}`).set(bearer(teacher.token)).send(body),
        remove: (id) => request(app).delete(`/api/methodologies/${id}`).set(bearer(teacher.token))
    })
    const createOk = async (teacher, overrides) => {
        const res = await api(teacher).create(validMethod(overrides))
        assert.equal(res.status, 201, JSON.stringify(res.body))
        return res.body.data.methodology
    }
    const names = (res) => res.body.data.methodologies.map((m) => m.name)
    const defaultId = (name) => [...methods.rows.values()].find((r) => r.name === name)._id.toString()

    beforeEach(async () => {
        installFakeTeacherStore()
        methods = installFakeModel(TeachingMethod)
        const grades = installFakeModel(Grade)
        const subjects = installFakeModel(Subject)
        ;[grade1] = await grades.seed({ number: 1, name: 'Primer grado', level: 'primaria' })
        const source = { type: 'sample', importedAt: new Date() }
        ;[subjectMath, subjectReading] = await subjects.seed(
            { code: 'prueba-mate', name: '[PRUEBA] Mate', grades: [grade1._id], isSample: true, source },
            { code: 'prueba-lectura', name: '[PRUEBA] Lectura', grades: [grade1._id], isSample: true, source }
        )
        await seedDefaultMethods(clone(defaultsFile))
        teacherA = await registerTeacher(app)
        teacherB = await registerTeacher(app)
    })
    afterEach(() => mock.restoreAll())

    it('todas las rutas exigen sesión', async () => {
        const id = new Types.ObjectId()
        for (const [method, path] of [['get', '/api/methodologies'], ['get', `/api/methodologies/${id}`], ['post', '/api/methodologies'], ['patch', `/api/methodologies/${id}`], ['delete', `/api/methodologies/${id}`]]) {
            assert.equal((await request(app)[method](path).send({})).status, 401, `${method} ${path}`)
        }
    })

    describe('GET /api/methodologies', () => {
        it('muestra las predeterminadas y las propias, no las de otros docentes', async () => {
            await createOk(teacherA, { name: 'De A' })
            await createOk(teacherB, { name: 'De B' })

            const res = await api(teacherA).list()
            assert.equal(res.status, 200)
            assert.deepEqual(names(res), [...DEFAULT_NAMES, 'De A'])
            assert.equal(res.body.meta.learningPreferences.length, 6)
        })

        it('filtra por alcance: predeterminadas o propias', async () => {
            await createOk(teacherA, { name: 'De A' })
            assert.deepEqual(names(await api(teacherA).list('?scope=default')), DEFAULT_NAMES)
            assert.deepEqual(names(await api(teacherA).list('?scope=mine')), ['De A'])
        })

        it('filtra por materia: incluye las generales y las compatibles con esa materia', async () => {
            await createOk(teacherA, { name: 'Solo mate', compatibleSubjects: [subjectMath._id.toString()] })
            await createOk(teacherA, { name: 'Solo lectura', compatibleSubjects: [subjectReading._id.toString()] })

            const res = await api(teacherA).list(`?subject=${subjectMath._id}`)
            assert.deepEqual(names(res), [...DEFAULT_NAMES, 'Solo mate'])
        })

        it('filtra por grado', async () => {
            const otherGrade = new Types.ObjectId().toString()
            await createOk(teacherA, { name: 'Primero', compatibleGrades: [grade1._id.toString()] })
            const res = await api(teacherA).list(`?grade=${otherGrade}&scope=mine`)
            assert.deepEqual(names(res), [])
            const ok = await api(teacherA).list(`?grade=${grade1._id}&scope=mine`)
            assert.deepEqual(names(ok), ['Primero'])
        })

        it('filtra por duración: metodologías cuya duración mínima cabe en el tiempo indicado', async () => {
            await createOk(teacherA, { name: 'Corta', estimatedDuration: { minMinutes: 15, maxMinutes: 20 } })
            await createOk(teacherA, { name: 'Larga', estimatedDuration: { minMinutes: 60, maxMinutes: 90 } })
            await createOk(teacherA, { name: 'Sin duración', estimatedDuration: null })

            assert.deepEqual(names(await api(teacherA).list('?maxDuration=30')), ['Corta'])
            assert.deepEqual(names(await api(teacherA).list('?maxDuration=60&scope=mine')), ['Corta', 'Larga'])
        })

        it('filtra por preferencias: basta con que coincida una (no hay exclusividad)', async () => {
            const res = await api(teacherA).list('?learningPreferences=kinestesica')
            assert.deepEqual(names(res), ['Rincones de aprendizaje'])

            const multi = await api(teacherA).list('?learningPreferences=lectoescritura,kinestesica')
            assert.deepEqual(names(multi), ['Mundo letrado', 'Rincones de aprendizaje'])
        })

        for (const qs of ['?scope=otros', '?subject=abc', '?grade=1', '?maxDuration=0', '?maxDuration=abc', '?learningPreferences=telepatica', '?learningPreferences=', '?orden=1']) {
            it(`rechaza ${qs}`, async () => {
                assert.equal((await api(teacherA).list(qs)).status, 400)
            })
        }
    })

    describe('GET /api/methodologies/:id', () => {
        it('devuelve una predeterminada completa con pasos, actividades y fuente', async () => {
            const res = await api(teacherA).get(defaultId('Rincones de aprendizaje'))
            assert.equal(res.status, 200)
            const m = res.body.data.methodology
            assert.equal(m.isDefault, true)
            assert.equal(m.steps.length, 4)
            assert.ok(m.steps.every((s) => s.description))
            assert.ok(m.suggestedActivities.length > 0)
            assert.ok(m.objectives.length > 0)
            assert.equal(m.sourceReference.section, '1.4.3 Rincones de aprendizaje')
            assert.equal(m.sourceReference.pages, '18')
        })

        it('devuelve las propias y da 404 para las de otro docente', async () => {
            const mine = await createOk(teacherA)
            assert.equal((await api(teacherA).get(mine.id)).status, 200)

            const foreign = await api(teacherB).get(mine.id)
            const missing = await api(teacherB).get(new Types.ObjectId().toString())
            assert.equal(foreign.status, 404)
            assert.deepEqual(foreign.body, missing.body)
        })

        it('responde 400 con un id inválido', async () => {
            assert.equal((await api(teacherA).get('abc')).status, 400)
        })
    })

    describe('POST /api/methodologies', () => {
        it('crea una metodología propia', async () => {
            const m = await createOk(teacherA, { compatibleSubjects: [subjectMath._id.toString()], sourceReference: { title: 'Mi experiencia', url: 'https://ejemplo.org/x' } })
            assert.equal(m.isDefault, false)
            assert.equal(m.createdBy, teacherA.teacher.id)
            assert.equal(m.isActive, true)
            assert.deepEqual(m.steps[1], { description: 'Cada estudiante lee un párrafo.' })
            assert.deepEqual(m.estimatedDuration, { minMinutes: 20, maxMinutes: 35 })
            assert.equal(m.sourceReference.title, 'Mi experiencia')
        })

        it('no acepta isDefault, createdBy, defaultKey ni isActive', async () => {
            const res = await api(teacherA).create({
                ...validMethod(),
                isDefault: true,
                createdBy: teacherB.teacher.id,
                defaultKey: 'mia',
                isActive: false
            })
            assert.equal(res.status, 400)
            const fields = res.body.errors.map((e) => e.field).sort()
            assert.deepEqual(fields, ['createdBy', 'defaultKey', 'isActive', 'isDefault'])
        })

        it('rechaza asignar una metodología a un solo estilo de aprendizaje', async () => {
            const res = await api(teacherA).create(validMethod({ learningPreferences: ['visual'] }))
            assert.equal(res.status, 400)
            assert.match(res.body.errors[0].message, /no es exclusiva de un estilo/)
        })

        for (const [label, override, field] of [
            ['sin nombre', { name: '' }, 'name'],
            ['sin descripción', { description: undefined }, 'description'],
            ['preferencia desconocida', { learningPreferences: ['visual', 'telepatica'] }, 'learningPreferences[1]'],
            ['preferencias repetidas', { learningPreferences: ['visual', 'visual'] }, 'learningPreferences'],
            ['paso sin descripción', { steps: [{ title: 'x' }] }, 'steps[0].description'],
            ['actividad sin título', { suggestedActivities: [{ description: 'x' }] }, 'suggestedActivities[0].title'],
            ['duración invertida', { estimatedDuration: { minMinutes: 50, maxMinutes: 10 } }, 'estimatedDuration'],
            ['duración fuera de rango', { estimatedDuration: { minMinutes: 1, maxMinutes: 10 } }, 'estimatedDuration.minMinutes'],
            ['materia con id inválido', { compatibleSubjects: ['abc'] }, 'compatibleSubjects[0]'],
            ['URL de fuente inválida', { sourceReference: { url: 'javascript:alert(1)' } }, 'sourceReference.url']
        ]) {
            it(`responde 400 con ${label}`, async () => {
                const res = await api(teacherA).create(validMethod(override))
                assert.equal(res.status, 400)
                assert.ok(res.body.errors.some((e) => e.field === field), JSON.stringify(res.body.errors))
            })
        }

        it('responde 400 si una materia o grado no existe', async () => {
            const res = await api(teacherA).create(validMethod({
                compatibleSubjects: [new Types.ObjectId().toString()],
                compatibleGrades: [new Types.ObjectId().toString()]
            }))
            assert.equal(res.status, 400)
            assert.deepEqual(res.body.errors.map((e) => e.field), ['compatibleSubjects[0]', 'compatibleGrades[0]'])
        })
    })

    describe('PATCH y DELETE', () => {
        it('el autor edita su metodología', async () => {
            const m = await createOk(teacherA)
            const res = await api(teacherA).patch(m.id, {
                name: 'Renombrada',
                learningPreferences: ['auditiva', 'colaborativa', 'visual'],
                estimatedDuration: null
            })
            assert.equal(res.status, 200)
            assert.equal(res.body.data.methodology.name, 'Renombrada')
            assert.equal(res.body.data.methodology.estimatedDuration, null)
            assert.equal(res.body.data.methodology.id, m.id)
        })

        it('las predeterminadas no se pueden editar ni archivar (403)', async () => {
            const id = defaultId('Mundo letrado')
            const before = clone(methods.get(id).description)

            const edit = await api(teacherA).patch(id, { description: 'Cambiada' })
            const del = await api(teacherA).remove(id)

            assert.equal(edit.status, 403)
            assert.equal(del.status, 403)
            assert.match(edit.body.message, /predeterminadas no se pueden modificar/)
            assert.equal(methods.get(id).description, before)
            assert.equal(methods.get(id).isActive, true)
        })

        it('otro docente recibe 404 al editar o archivar una metodología ajena', async () => {
            const m = await createOk(teacherA, { name: 'De A' })
            assert.equal((await api(teacherB).patch(m.id, { name: 'Robada' })).status, 404)
            assert.equal((await api(teacherB).remove(m.id)).status, 404)
            assert.equal(methods.get(m.id).name, 'De A')
            assert.equal(methods.get(m.id).isActive, true)
        })

        it('no permite cambiar campos de control', async () => {
            const m = await createOk(teacherA)
            const res = await api(teacherA).patch(m.id, { isDefault: true, createdBy: teacherB.teacher.id })
            assert.equal(res.status, 400)
            assert.equal(methods.get(m.id).isDefault, false)
        })

        it('DELETE archiva: deja de listarse pero el autor aún la consulta y puede restaurarla', async () => {
            const m = await createOk(teacherA, { name: 'Temporal' })
            const del = await api(teacherA).remove(m.id)

            assert.equal(del.status, 200)
            assert.equal(del.body.data.methodology.isActive, false)
            assert.ok(methods.get(m.id), 'el documento sigue existiendo')
            assert.ok(!names(await api(teacherA).list()).includes('Temporal'))
            assert.equal((await api(teacherA).get(m.id)).status, 200)

            const restore = await api(teacherA).patch(m.id, { isActive: true })
            assert.equal(restore.body.data.methodology.isActive, true)
            assert.ok(names(await api(teacherA).list()).includes('Temporal'))
        })

        it('responde 400 si el PATCH está vacío', async () => {
            const m = await createOk(teacherA)
            assert.equal((await api(teacherA).patch(m.id, {})).status, 400)
        })
    })
})
