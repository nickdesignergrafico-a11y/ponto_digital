const admin = require('firebase-admin');

// O GitHub Actions vai injetar a chave de segurança de forma oculta aqui
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

async function rodarDisparo() {
  const db = admin.firestore(); // Ajuste se usar Realtime Database
  const hoje = new Date().toLocaleDateString('pt-BR');

  console.log(`Iniciando checagem de ponto do dia: ${hoje}`);

  try {
    // Busca funcionários que esqueceram de bater o ponto de saída
    const snapshot = await db.collection('funcionarios').where('bateuPontoSaida', '==', false).get();

    if (snapshot.empty) {
      console.log('Todos os funcionários já registraram a saída hoje.');
      return;
    }

    for (const doc of snapshot.docs) {
      const funcionario = doc.data();

      if (funcionario.fcmToken) {
        const message = {
          notification: {
            title: '⏰ Esqueceu o Ponto?',
            body: `Olá, ${funcionario.nome}! Já passou do horário e não vimos seu registro de saída.`
          },
          token: funcionario.fcmToken // Endereço do navegador do usuário
        };

        // Envia usando o padrão seguro HTTP v1
        const response = await admin.messaging().send(message);
        console.log(`Notificação enviada com sucesso para: ${funcionario.nome}`);
      }
    }
  } catch (error) {
    console.error('Erro ao processar notificações:', error);
    process.exit(1);
  }
}

rodarDisparo();
