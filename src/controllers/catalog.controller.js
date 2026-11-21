import { matchedData } from 'express-validator'
import {
    listGrades,
    listSubjects,
    listTopics,
    getTopicById,
    containsSampleData,
    TOPICS_DEFAULT_LIMIT
} from '../services/catalog.service.js'

// matchedData devuelve solo los parámetros validados y ya convertidos (p. ej. page como número).
const validQuery = (req) => matchedData(req, { locations: ['query'] })

export const getGrades = async (req, res) => {
    const grades = await listGrades(validQuery(req))
    res.status(200).json({
        success: true,
        message: 'Grados',
        data: { grades }
    })
}

export const getSubjects = async (req, res) => {
    const subjects = await listSubjects(validQuery(req))
    res.status(200).json({
        success: true,
        message: 'Materias',
        data: { subjects },
        meta: { containsSampleData: containsSampleData(subjects) }
    })
}

export const getTopics = async (req, res) => {
    const { subject, grade, page = 1, limit = TOPICS_DEFAULT_LIMIT } = validQuery(req)
    const { topics, pagination } = await listTopics({ subject, grade, page, limit })
    res.status(200).json({
        success: true,
        message: 'Temas',
        data: { topics },
        meta: { ...pagination, containsSampleData: containsSampleData(topics) }
    })
}

export const getTopic = async (req, res) => {
    const topic = await getTopicById(req.params.id)
    res.status(200).json({
        success: true,
        message: 'Tema',
        data: { topic },
        meta: { containsSampleData: topic.isSample === true }
    })
}
