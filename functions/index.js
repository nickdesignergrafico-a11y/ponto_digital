"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onAttendanceCreated = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const v2_1 = require("firebase-functions/v2");
const app_1 = require("firebase-admin/app");
const firestore_2 = require("firebase-admin/firestore");
const messaging_1 = require("firebase-admin/messaging");
// Configuração de opções globais (região us-central1 ou conforme seu projeto)
(0, v2_1.setGlobalOptions)({ region: "us-central1" });
// Inicializa o Firebase Admin SDK
(0, app_1.initializeApp)();
// Referência ao banco de dados Firestore 'pontodigital'
const DATABASE_ID = "pontodigital";
const db = (0, firestore_2.getFirestore)(DATABASE_ID);
/**
 * Cloud Function v2: Disparada quando um novo ponto é registrado na coleção 'attendance' do banco 'pontodigital'.
 * Envia notificação push usando a API HTTP v1 do Firebase Cloud Messaging (getMessaging().send()).
 */
exports.onAttendanceCreated = (0, firestore_1.onDocumentCreated)({
    document: "attendance/{attendanceId}",
    database: DATABASE_ID,
}, async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
        console.log("Nenhum dado associado ao evento de registro de ponto.");
        return;
    }
    const attendanceId = event.params.attendanceId;
    const data = snapshot.data();
    // Extrai informações do registro de ponto
    const userName = data.userName || data.employeeName || "Colaborador";
    const type = data.type || "Marcação de Ponto";
    const postoName = data.postoName || data.locationName || "Posto Principal";
    const timeStr = data.time || (data.timestamp ? new Date(data.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : "Agora");
    console.log(`[Ponto Digital] Novo registro de ponto detectado: ID ${attendanceId}`);
    console.log(`👤 Usuário: ${userName} | Tipo: ${type} | Horário: ${timeStr} | Posto: ${postoName}`);
    try {
        // 1. Busca os administradores no Firestore para obter seus FCM Tokens
        const adminsSnapshot = await db
            .collection("users")
            .where("role", "==", "admin")
            .get();
        if (adminsSnapshot.empty) {
            console.log("⚠️ Nenhum administrador encontrado na coleção 'users'.");
            return;
        }
        const tokens = [];
        adminsSnapshot.forEach((doc) => {
            const userData = doc.data();
            // Verifica token único no campo 'fcmToken'
            if (userData.fcmToken && typeof userData.fcmToken === "string") {
                tokens.push(userData.fcmToken.trim());
            }
            // Verifica lista de tokens no campo 'fcmTokens'
            if (Array.isArray(userData.fcmTokens)) {
                userData.fcmTokens.forEach((t) => {
                    if (t && typeof t === "string") {
                        tokens.push(t.trim());
                    }
                });
            }
        });
        // Remove duplicados e tokens em branco
        const uniqueTokens = Array.from(new Set(tokens.filter((t) => t.length > 0)));
        if (uniqueTokens.length === 0) {
            console.log("ℹ️ Nenhum token FCM (fcmToken/fcmTokens) cadastrado para os administradores.");
            return;
        }
        console.log(`📱 Enviando notificação Push (HTTP v1) para ${uniqueTokens.length} token(s) de administrador...`);
        const messaging = (0, messaging_1.getMessaging)();
        let successCount = 0;
        let failureCount = 0;
        // 2. Dispara a notificação Push individualmente para cada token via API HTTP v1 (messaging().send())
        const sendPromises = uniqueTokens.map(async (fcmToken) => {
            const message = {
                token: fcmToken,
                notification: {
                    title: "📌 Novo Registro de Ponto!",
                    body: `${userName} registrou ${type} às ${timeStr} (${postoName}).`,
                },
                data: {
                    attendanceId: String(attendanceId),
                    userName: String(userName),
                    type: String(type),
                    postoName: String(postoName),
                    url: "/#/admin/reports",
                },
                webpush: {
                    notification: {
                        title: "📌 Novo Registro de Ponto!",
                        body: `${userName} registrou ${type} às ${timeStr} (${postoName}).`,
                        icon: "/pwa-icon.png",
                        badge: "/pwa-icon.png",
                        tag: `attendance-${attendanceId}`,
                    },
                    fcmOptions: {
                        link: "/#/admin/reports",
                    },
                },
                android: {
                    priority: "high",
                    notification: {
                        title: "📌 Novo Registro de Ponto!",
                        body: `${userName} registrou ${type} às ${timeStr} (${postoName}).`,
                        icon: "stock_ticker_update",
                        color: "#0f172a",
                        clickAction: "FLUTTER_NOTIFICATION_CLICK",
                    },
                },
            };
            try {
                const response = await messaging.send(message); // API FCM HTTP v1 do firebase-admin
                console.log(`✅ Notificação enviada para token (${fcmToken.slice(0, 12)}...): ${response}`);
                successCount++;
            }
            catch (err) {
                console.error(`[Erro] Falha ao enviar para token (${fcmToken.slice(0, 12)}...):`, err?.message || err);
                failureCount++;
                // Se o token for inválido ou expirado, pode ser removido opcionalmente
                if (err?.code === "messaging/invalid-registration-token" ||
                    err?.code === "messaging/registration-token-not-registered") {
                    console.log(`🧹 Token expirado detectado: ${fcmToken.slice(0, 12)}...`);
                }
            }
        });
        await Promise.all(sendPromises);
        console.log(`🎉 Resumo dos envios: ${successCount} sucesso(s), ${failureCount} falha(s).`);
    }
    catch (error) {
        console.error("[Erro Geral] No processamento da Cloud Function onAttendanceCreated:", error);
    }
});