const { db, admin } = require('../lib/firebase');
const { sendMessage, forwardMessage } = require('../lib/telegram');

const ADMIN_USERNAME = (process.env.ADMIN_TELEGRAM_USERNAME || '').toLowerCase().replace(/^@/, '');

const CONFIRM_MESSAGE =
  '✅ ክፍያዎ ተረጋግጧል! የእርስዎ ወር ዛሬ ጀምሯል። ከ30 ቀናት በኋላ ለቀጣዩ ክፍያ እናስታውስዎታለን። አመሰግናለን 🕌';

const RECEIVED_MESSAGE =
  '🧾 ደረሰኝዎ ደርሶናል! በቅርቡ እናረጋግጣለን እና መልስ እንሰጥዎታለን። አመሰግናለን።';

const START_MESSAGE =
  'ሰላም! 👋 ለቀጥታ ክፍለ ትምህርት ክፍያ ለማድረግ ከፈለጉ፣ የክፍያ ደረሰኝዎን (ፎቶ) እዚህ ይላኩልን። እናረጋግጠዋለን እና መልስ እንሰጥዎታለን።';

const FALLBACK_MESSAGE =
  'የክፍያ ደረሰኝዎን እንደ ፎቶ እዚህ ይላኩልን። ጥያቄ ካለዎት፣ የአካዳሚውን አስተዳዳሪ በቀጥታ ያነጋግሩ።';

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(200).send('ok');
    return;
  }

  try {
    const update = req.body;
    const message = update && update.message;
    if (!message) {
      res.status(200).send('ok');
      return;
    }

    const chatId = message.chat.id;
    const fromUsername = (message.from && message.from.username || '').toLowerCase();
    const fromName = [message.from && message.from.first_name, message.from && message.from.last_name].filter(Boolean).join(' ') || 'Unknown';
    const isAdminChat = ADMIN_USERNAME && fromUsername === ADMIN_USERNAME;
    const text = message.text || '';

    // Remember the admin's chat id the first time we see them message the bot,
    // so we know where to forward receipt photos for review.
    if (isAdminChat) {
      await db().collection('botConfig').doc('main').set({ adminChatId: chatId }, { merge: true });
    }

    if (text.startsWith('/start')) {
      await sendMessage(chatId, isAdminChat ? 'አድሚን ሁነታ ገብተዋል። አዳዲስ ደረሰኞች ሲመጡ እዚህ ያገኛሉ።' : START_MESSAGE);
      res.status(200).send('ok');
      return;
    }

    if (isAdminChat && text.startsWith('/confirm')) {
      const targetChatId = text.replace('/confirm', '').trim();
      if (!targetChatId) {
        await sendMessage(chatId, 'አጠቃቀም: /confirm <chat id>');
        res.status(200).send('ok');
        return;
      }
      const ref = db().collection('telegramPayments').doc(targetChatId);
      const snap = await ref.get();
      if (!snap.exists) {
        await sendMessage(chatId, `❌ Chat ID ${targetChatId} አልተገኘም።`);
        res.status(200).send('ok');
        return;
      }
      await ref.set({
        status: 'confirmed',
        confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
        remindedAt: null
      }, { merge: true });
      await sendMessage(Number(targetChatId), CONFIRM_MESSAGE);
      await sendMessage(chatId, `✅ ለ ${snap.data().name || targetChatId} ተረጋግጧል።`);
      res.status(200).send('ok');
      return;
    }

    if (!isAdminChat && message.photo && message.photo.length) {
      const chatIdStr = String(chatId);
      const ref = db().collection('telegramPayments').doc(chatIdStr);
      const existing = await ref.get();
      await ref.set({
        chatId,
        name: fromName,
        username: message.from.username || '',
        status: 'pending_review',
        lastReceiptMessageId: message.message_id,
        createdAt: existing.exists ? existing.data().createdAt : admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      const configSnap = await db().collection('botConfig').doc('main').get();
      const adminChatId = configSnap.exists ? configSnap.data().adminChatId : null;
      if (adminChatId) {
        await forwardMessage(adminChatId, chatId, message.message_id);
        await sendMessage(adminChatId,
          `🧾 አዲስ ደረሰኝ ከ ${fromName}${message.from.username ? ' (@' + message.from.username + ')' : ''}\nChat ID: ${chatIdStr}\n\nለማረጋገጥ: /confirm ${chatIdStr}`);
      }
      await sendMessage(chatId, RECEIVED_MESSAGE);
      res.status(200).send('ok');
      return;
    }

    if (!isAdminChat) {
      await sendMessage(chatId, FALLBACK_MESSAGE);
    }
    res.status(200).send('ok');
  } catch (err) {
    console.error('Webhook error:', err);
    // Always 200 so Telegram doesn't retry-storm us on an internal error.
    res.status(200).send('ok');
  }
};
