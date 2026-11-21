import request from 'supertest'

let counter = 0

/** Datos válidos de registro con un correo único en cada llamada. */
export const teacherData = (overrides = {}) => {
    counter += 1
    return {
        firstName: 'Ana',
        lastName: "Q'uq",
        email: `docente${counter}.${Date.now()}@escuela.edu.gt`,
        password: 'Clave2026',
        ...overrides
    }
}

export const registerTeacher = async (app, overrides = {}) => {
    const data = teacherData(overrides)
    const res = await request(app).post('/api/auth/register').send(data)
    return { data, res, token: res.body?.data?.token, teacher: res.body?.data?.teacher }
}

export const bearer = (token) => ({ Authorization: `Bearer ${token}` })
