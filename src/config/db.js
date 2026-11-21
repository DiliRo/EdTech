import mongoose from 'mongoose'
import { isTest } from './env.js'

const log = (message) => {
    if (!isTest()) console.log(`MongoDB | ${message}`)
}

let listenersRegistered = false

const registerListeners = () => {
    if (listenersRegistered) return
    listenersRegistered = true
    mongoose.connection.on('connected', () => log('conectado'))
    mongoose.connection.on('reconnected', () => log('reconectado'))
    mongoose.connection.on('disconnected', () => log('desconectado'))
    // Solo el mensaje: el error completo podría incluir la URI con credenciales.
    mongoose.connection.on('error', (err) => log(`error de conexión: ${err.message}`))
}

export const connectDB = async (uri) => {
    registerListeners()
    await mongoose.connect(uri, {
        maxPoolSize: 20,
        serverSelectionTimeoutMS: 5000
    })
    return mongoose.connection
}

export const disconnectDB = async () => {
    await mongoose.disconnect()
}
