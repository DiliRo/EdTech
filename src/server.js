import { env, validateEnv } from './config/env.js'
import { connectDB, disconnectDB } from './config/db.js'
import { createApp } from './app.js'

const start = async () => {
    try {
        validateEnv()
    } catch (err) {
        console.error(`Servidor | ${err.message}. Revisa tu archivo .env (usa .env.example como guía).`)
        process.exit(1)
    }

    try {
        await connectDB(env.mongodbUri)
    } catch (err) {
        console.error(`Servidor | no se pudo conectar a MongoDB: ${err.message}`)
        process.exit(1)
    }

    const app = createApp()
    const server = app.listen(env.port, () => {
        console.log(`Servidor | escuchando en http://localhost:${env.port}`)
    })

    server.on('error', (err) => {
        console.error(`Servidor | error al abrir el puerto ${env.port}: ${err.message}`)
        process.exit(1)
    })

    const shutdown = (signal) => {
        console.log(`Servidor | ${signal} recibido, cerrando...`)
        server.close(async () => {
            await disconnectDB()
            process.exit(0)
        })
        // Si algo queda colgado, forzar la salida.
        setTimeout(() => process.exit(1), 10000).unref()
    }

    process.on('SIGINT', () => shutdown('SIGINT'))
    process.on('SIGTERM', () => shutdown('SIGTERM'))
}

start()
