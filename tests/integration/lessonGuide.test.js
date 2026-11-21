import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import request from 'supertest'
import { MongoMemoryServer } from 'mongodb-memory-server'

import { connectDB, disconnectDB } from '../../src/config/db.js'
import { createApp } from '../../src/app.js'
import Grade from '../../src/models/grade.model.js'
import Subject from '../../src/models/subject.model.js'
import Topic from '../../src/models/topic.model.js'
import TeachingMethod from '../../src/models/teachingMethod.model.js'
import LessonGuide from '../../src/models/lessonGuide.model.js'
import AIUsageLog from '../../src/models/aiUsageLog.model.js'
import { importCatalog } from '../../src/services/catalogImport.service.js'
import { seedDefaultMethods } from '../../src/services/methodologySeed.service.js'
import { setAIProvider } from '../../src/services/ai/index.js'
import { registerTeacher, bearer } from '../helpers/factories.js'
import { fakeProvider, validAIGuide } from '../helpers/aiFixtures.js'

const read = async (p) => JSON.parse(await readFile(new URL(p, import.meta.url), 'utf8'))
const catalogFile = await read('../../data/catalog/sample.catalog.json')
const methodsFile = await read('../../data/methodologies/mineduc-defaults.json')

describe('Integración: guías de clase con IA (proveedor simulado)', () => {
    let mongo
    let teacher
    const app = createApp()

    before(async () => {
        mongo = await MongoMemoryServer.create()
        await connectDB(mongo.getUri('edtech-guides-test'))
        await Promise.all([Grade, Subject, Topic, TeachingMethod, LessonGuide, AIUsageLog].map((m) => m.syncIndexes()))
        await importCatalog(structuredClone(catalogFile))
        await seedDefaultMethods(structuredClone(methodsFile))
        teacher = await registerTeacher(app)
    })

    after(async () => {
        setAIProvider(null)
        await disconnectDB()
        await mongo?.stop()
    })

    it('genera, guarda, edita y regenera un borrador con datos reales del catálogo', async () => {
        const grade = await Grade.findOne({ number: 1 })
        const subject = await Subject.findOne({ code: 'prueba-matematicas' })
        const topic = await Topic.findOne({ code: 'tema-ejemplo-1' })
        const method = await TeachingMethod.findOne({ defaultKey: 'rincones-de-aprendizaje' })

        const provider = fakeProvider([validAIGuide({ competenciesUsed: ['P1'] })])
        setAIProvider(provider)

        const res = await request(app).post('/api/lesson-guides/generate').set(bearer(teacher.token)).send({
            gradeId: grade._id.toString(), subjectId: subject._id.toString(), topicId: topic._id.toString(),
            teachingMethodId: method._id.toString(), durationMinutes: 45
        })
        assert.equal(res.status, 201, JSON.stringify(res.body))
        const id = res.body.data.guide.id

        // El tema del catálogo de prueba se marca como tal en la guía
        assert.match(res.body.data.guide.curriculumGaps.join(' '), /PRUEBA/)
        assert.match(provider.calls[0].user, /\[PRUEBA\] Competencia de ejemplo/)

        const stored = await LessonGuide.findById(id)
        assert.equal(stored.generations[0].methodology.sourceReference.section, '1.4.3 Rincones de aprendizaje')
        assert.equal(stored.generations[0].curriculum.dataStatus, 'sample')
        assert.equal(await AIUsageLog.countDocuments({ teacherId: teacher.teacher.id, status: 'success' }), 1)

        const edit = await request(app).patch(`/api/lesson-guides/${id}`).set(bearer(teacher.token)).send({ title: 'Editada' })
        assert.equal(edit.body.data.guide.editedByTeacher, true)

        setAIProvider(fakeProvider([validAIGuide({ title: 'Regenerada' })]))
        const regen = await request(app).post('/api/lesson-guides/generate').set(bearer(teacher.token)).send({ guideId: id })
        assert.equal(regen.status, 200)
        assert.equal(regen.body.data.guide.title, 'Regenerada')
        assert.equal((await LessonGuide.findById(id)).generations.length, 2)
    })
})
