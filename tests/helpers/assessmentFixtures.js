import request from 'supertest'

import Topic from '../../src/models/topic.model.js'
import TeachingMethod from '../../src/models/teachingMethod.model.js'
import Assessment from '../../src/models/assessment.model.js'
import AssessmentResult from '../../src/models/assessmentResult.model.js'
import { setupClassroomScenario, classroomData } from './classroomFixtures.js'
import { installFakeModel } from './fakeModel.js'
import { bearer } from './factories.js'

const sampleSource = { type: 'sample', importedAt: new Date('2026-01-01') }

/**
 * Escenario completo en memoria:
 *  - Docente A con el aula "A" (A01, A02, A03) y el aula "A2" (Z01)
 *  - Docente B con el aula "B" (B01)
 *  - Materias: mate (grados 1 y 2, asignada al aula A) y lectura (grado 1, no asignada)
 *  - Un tema de mate de 1.er grado y una metodología predeterminada
 */
export const setupAssessmentScenario = async (app) => {
    const base = await setupClassroomScenario(app)
    const topics = installFakeModel(Topic)
    const methods = installFakeModel(TeachingMethod)
    const assessments = installFakeModel(Assessment)
    const results = installFakeModel(AssessmentResult, { unique: [['assessmentId', 'studentId']] })

    const [topic] = await topics.seed({
        code: 'tema-1', name: '[PRUEBA] Tema', grade: base.grade1._id, subject: base.mathG1G2._id, isSample: true, source: sampleSource
    })
    const [topicGrade2] = await topics.seed({
        code: 'tema-2', name: '[PRUEBA] Tema 2', grade: base.grade2._id, subject: base.mathG1G2._id, isSample: true, source: sampleSource
    })
    const [defaultMethod] = await methods.seed({
        name: 'Mundo letrado', description: 'x', isDefault: true, defaultKey: 'mundo-letrado',
        sourceReference: { title: 'Fuente', url: 'https://example.org' }
    })

    const as = (teacher) => bearer(teacher.token)
    const newClassroom = async (teacher, name, overrides = {}) =>
        (await request(app).post('/api/classrooms').set(as(teacher)).send(classroomData(base.grade1, { name, ...overrides }))).body.data.classroom
    const newStudent = async (teacher, classroomId, studentCode) =>
        (await request(app).post(`/api/classrooms/${classroomId}/students`).set(as(teacher)).send({ studentCode })).body.data.student

    const classroomA = await newClassroom(base.teacherA, 'A', { subjectIds: [base.mathG1G2._id.toString()] })
    const classroomA2 = await newClassroom(base.teacherA, 'A2')
    const classroomB = await newClassroom(base.teacherB, 'B')

    const students = {
        A01: await newStudent(base.teacherA, classroomA.id, 'A01'),
        A02: await newStudent(base.teacherA, classroomA.id, 'A02'),
        A03: await newStudent(base.teacherA, classroomA.id, 'A03'),
        Z01: await newStudent(base.teacherA, classroomA2.id, 'Z01'),
        B01: await newStudent(base.teacherB, classroomB.id, 'B01')
    }

    return {
        ...base,
        stores: { ...base.stores, topics, methods, assessments, results },
        topic,
        topicGrade2,
        defaultMethod,
        classroomA,
        classroomA2,
        classroomB,
        students
    }
}

export const assessmentData = (s, overrides = {}) => ({
    title: 'Prueba corta de sumas',
    classroomId: s.classroomA.id,
    subjectId: s.mathG1G2._id.toString(),
    assessmentDate: '2026-03-10',
    maxScore: 20,
    assessmentType: 'formativa',
    ...overrides
})
