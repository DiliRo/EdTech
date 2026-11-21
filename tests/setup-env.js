// Se carga antes que cualquier test (node --import). Fija un entorno aislado:
// las pruebas nunca usan tu .env ni tu base de datos real.
process.env.NODE_ENV = 'test'
process.env.MONGODB_URI = 'mongodb://127.0.0.1:1/edtech-test-no-usada'
process.env.CORS_ORIGIN = 'http://localhost:5173'
process.env.JWT_SECRET = 'secreto-de-pruebas-con-mas-de-32-caracteres!'
process.env.JWT_EXPIRES_IN = '1h'
process.env.BCRYPT_SALT_ROUNDS = '4' // rápido en pruebas; en producción se usa 12
process.env.LOGIN_MAX_ATTEMPTS = '5'
process.env.LOGIN_WINDOW_MINUTES = '15'
process.env.REGISTER_MAX_PER_HOUR = '1000'
