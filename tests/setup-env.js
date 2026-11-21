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
// IA: nunca se llama a un proveedor real en pruebas
process.env.AI_PROVIDER = 'mock'
process.env.AI_API_KEY = ''
process.env.AI_MAX_ATTEMPTS = '2'
process.env.AI_DAILY_LIMIT_PER_TEACHER = '6'
process.env.AI_RATE_LIMIT_PER_MINUTE = '60'
process.env.AI_TIMEOUT_MS = '1000'
