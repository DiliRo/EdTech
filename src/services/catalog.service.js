import Grade from '../models/grade.model.js'
import Subject from '../models/subject.model.js'
import Topic from '../models/topic.model.js'
import { AppError } from '../utils/AppError.js'

// Solo consultas: los docentes no modifican el catálogo oficial.

export const listGrades = async ({ level } = {}) => {
    const filter = level ? { level } : {}
    return Grade.find(filter).sort({ level: 1, number: 1 })
}

export const listSubjects = async ({ grade } = {}) => {
    const filter = grade ? { grades: grade } : {}
    return Subject.find(filter)
        .populate('grades', 'number name level')
        .sort({ name: 1 })
}

export const TOPICS_DEFAULT_LIMIT = 50
export const TOPICS_MAX_LIMIT = 100

export const listTopics = async ({ subject, grade, page = 1, limit = TOPICS_DEFAULT_LIMIT } = {}) => {
    const filter = {}
    if (subject) filter.subject = subject
    if (grade) filter.grade = grade

    const [topics, total] = await Promise.all([
        Topic.find(filter)
            .populate('grade', 'number name level')
            .populate('subject', 'code name')
            .sort({ grade: 1, subject: 1, name: 1 })
            .skip((page - 1) * limit)
            .limit(limit),
        Topic.countDocuments(filter)
    ])

    return {
        topics,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    }
}

export const getTopicById = async (id) => {
    const topic = await Topic.findById(id)
        .populate('grade', 'number name level')
        .populate('subject', 'code name description')
    if (!topic) throw new AppError(404, 'Tema no encontrado')
    return topic
}

/** true si alguno de los registros es dato de prueba (para avisar en la interfaz). */
export const containsSampleData = (items) => items.some((item) => item?.isSample === true)
