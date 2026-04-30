require('dotenv').config();

// Valida variáveis obrigatórias
const required = ['APIFY_TOKEN', 'REDIS_URL', 'TELEGRAM_TOKEN'];
const faltando = required.filter(k => !process.env[k]);

if (faltando.length > 0) {
  console.error(`❌ Variáveis faltando: ${faltando.join(', ')}`);
  process.exit(1);
}

console.log('🚀 Buscador API iniciando...');

// Inicia API
require('./server');

// Inicia scheduler de alertas
const { iniciarScheduler } = require('./scheduler');
iniciarScheduler();

console.log('✅ Tudo pronto!');
