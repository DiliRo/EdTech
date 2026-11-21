import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'

import { env, isTest } from './config/env.js'
import apiRoutes from './routes/index.js'
import { notFound } from './middlewares/notFound.js'
import { errorHandler } from './middlewares/errorHandler.js'

/**
 * Crea la aplicación Express sin abrir el puerto ni conectar a la base de datos,
 * para poder probarla con supertest.
 */
export const createApp = () => {
    const app = express()

    app.disable('x-powered-by')
    app.use(helmet())
    app.use(cors({ origin: env.corsOrigin }))
    app.use(express.json({ limit: '100kb' }))
    app.use(express.urlencoded({ extended: false, limit: '100kb' }))
    if (!isTest()) app.use(morgan('dev'))

    app.use('/api', apiRoutes)

    app.use(notFound)
    app.use(errorHandler)

    return app
}
