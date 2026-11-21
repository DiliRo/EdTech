import { matchedData } from 'express-validator'
import {
    listClassrooms,
    createClassroom,
    getClassroom,
    updateClassroom,
    archiveClassroom
} from '../services/classroom.service.js'
import { listStudents, createStudent } from '../services/student.service.js'

// `matchedData` entrega solo los campos validados (y ya convertidos, p. ej. schoolYear como número).
const validBody = (req) => matchedData(req, { locations: ['body'] })
const validQuery = (req) => matchedData(req, { locations: ['query'] })

export const getClassrooms = async (req, res) => {
    const classrooms = await listClassrooms(req.user.id, validQuery(req))
    res.status(200).json({ success: true, message: 'Aulas', data: { classrooms } })
}

export const postClassroom = async (req, res) => {
    const classroom = await createClassroom(req.user.id, validBody(req))
    res.status(201).json({ success: true, message: 'Aula creada', data: { classroom } })
}

export const getClassroomById = async (req, res) => {
    const classroom = await getClassroom(req.user.id, req.params.id)
    res.status(200).json({ success: true, message: 'Aula', data: { classroom } })
}

export const patchClassroom = async (req, res) => {
    const classroom = await updateClassroom(req.user.id, req.params.id, validBody(req))
    res.status(200).json({ success: true, message: 'Aula actualizada', data: { classroom } })
}

export const deleteClassroom = async (req, res) => {
    const classroom = await archiveClassroom(req.user.id, req.params.id)
    res.status(200).json({ success: true, message: 'Aula archivada', data: { classroom } })
}

export const getClassroomStudents = async (req, res) => {
    const students = await listStudents(req.user.id, req.params.id, validQuery(req))
    res.status(200).json({ success: true, message: 'Estudiantes', data: { students } })
}

export const postClassroomStudent = async (req, res) => {
    const student = await createStudent(req.user.id, req.params.id, validBody(req))
    res.status(201).json({ success: true, message: 'Estudiante registrado', data: { student } })
}
