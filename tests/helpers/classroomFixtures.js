import Grade from '../../src/models/grade.model.js'
import Subject from '../../src/models/subject.model.js'
import Classroom from '../../src/models/classroom.model.js'
import Student from '../../src/models/student.model.js'
import { installFakeTeacherStore } from './fakeTeacherStore.js'
import { installFakeModel } from './fakeModel.js'
import { registerTeacher } from './factories.js'

const sampleSource = { type: 'sample', importedAt: new Date('2026-01-01') }

/**
 * Prepara un escenario con BD en memoria: dos docentes, grados 1 y 2 y materias de prueba.
 * Restaurar con mock.restoreAll() en afterEach.
 */
export const setupClassroomScenario = async (app) => {
    installFakeTeacherStore()
    const grades = installFakeModel(Grade, { unique: [['level', 'number']] })
    const subjects = installFakeModel(Subject, { unique: [['code']] })
    const classrooms = installFakeModel(Classroom)
    const students = installFakeModel(Student, { unique: [['classroomId', 'studentCode']] })

    const [grade1, grade2] = await grades.seed(
        { number: 1, name: 'Primer grado', level: 'primaria' },
        { number: 2, name: 'Segundo grado', level: 'primaria' }
    )
    const [mathG1G2, readingG1] = await subjects.seed(
        { code: 'prueba-mate', name: '[PRUEBA] Mate', grades: [grade1._id, grade2._id], isSample: true, source: sampleSource },
        { code: 'prueba-lectura', name: '[PRUEBA] Lectura', grades: [grade1._id], isSample: true, source: sampleSource }
    )

    const teacherA = await registerTeacher(app)
    const teacherB = await registerTeacher(app)

    return {
        stores: { grades, subjects, classrooms, students },
        grade1,
        grade2,
        mathG1G2,
        readingG1,
        teacherA,
        teacherB
    }
}

export const classroomData = (grade, overrides = {}) => ({
    name: 'Primero A matutina',
    gradeId: grade._id.toString(),
    section: 'A',
    schoolYear: 2026,
    ...overrides
})
