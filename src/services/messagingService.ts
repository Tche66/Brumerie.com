// src/services/messagingService.ts
import {
  collection, doc, addDoc, updateDoc, getDoc, getDocs,
  query, where, orderBy, onSnapshot, serverTimestamp,
  arrayUnion, increment, writeBatch, limit,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { PLAN_LIMITS } from '@/types';
import { Conversation, Message } from '@/types';
import { createNotification } from './notificationService';
import { showLocalPushNotification } from './pushService';

const convsCol = collection(db, 'conversations');

// ── Trouver ou créer une conversation ──────────────────────
export async function checkChatLimit(userId: string): Promise<{ allowed: boolean; reason?: string }> {
  try {
    const userSnap = await getDoc(doc(db, 'users', userId));
    if (!userSnap.exists()) return { allowed: true };
    const user = userSnap.data();
    const tier = user.isPremium ? 'premium' : user.isVerified ? 'verified' : 'simple';
    const dailyLimit = PLAN_LIMITS[tier].dailyChats;
    if (dailyLimit >= 999) return { allowed: true };

    // Reset si nouveau jour
    const today = new Date().toDateString();
    if (user.lastChatReset !== today) {
      await updateDoc(doc(db, 'users', userId), { dailyChatCount: 0, lastChatReset: today });
      return { allowed: true };
    }
    const count = user.dailyChatCount || 0;
    if (count >= dailyLimit) {
      return { allowed: false, reason: `Limite de ${dailyLimit} chats/jour atteinte. Passe au plan Vérifié pour chatter sans limite.` };
    }
    // Incrémenter
    await updateDoc(doc(db, 'users', userId), { dailyChatCount: count + 1 });
    return { allowed: true };
  } catch { return { allowed: true }; }
}

export async function getOrCreateConversation(
  buyerId: string,
  sellerId: string,
  product: { id: string; title: string; price: number; image: string; neighborhood: string },
  buyerName: string,
  sellerName: string,
  buyerPhoto?: string,
  sellerPhoto?: string,
): Promise<string> {
  // Chercher conversation existante pour ce produit entre ces deux users
  const q = query(
    convsCol,
    where('productId', '==', product.id),
    where('participants', 'array-contains', buyerId),
    limit(1),
  );
  const snap = await getDocs(q);

  if (!snap.empty) {
    // Conversation existante → retourner son ID
    return snap.docs[0].id;
  }

  // Créer nouvelle conversation
  const newConv: Omit<Conversation, 'id'> = {
    participants: [buyerId, sellerId],
    participantNames: { [buyerId]: buyerName, [sellerId]: sellerName },
    participantPhotos: { [buyerId]: buyerPhoto || '', [sellerId]: sellerPhoto || '' },
    productId: product.id,
    productTitle: product.title,
    productImage: product.image,
    productPrice: product.price,
    lastMessage: '',
    lastMessageAt: serverTimestamp(),
    lastSenderId: '',
    unreadCount: { [buyerId]: 0, [sellerId]: 0 },
    createdAt: serverTimestamp(),
  };

  const ref = await addDoc(convsCol, newConv);

  // Message système d'ouverture
  await addDoc(collection(db, 'conversations', ref.id, 'messages'), {
    conversationId: ref.id,
    senderId: 'system',
    senderName: 'Brumerie',
    text: `Conversation ouverte pour "${product.title}" — Restez courtois et méfiez-vous des arnaques 🛡️`,
    type: 'system',
    readBy: [buyerId, sellerId],
    createdAt: serverTimestamp(),
  });

  return ref.id;
}

// ── Envoyer un message texte ───────────────────────────────
export async function sendMessage(
  convId: string,
  senderId: string,
  senderName: string,
  text: string,
  senderPhoto?: string,
): Promise<void> {
  const batch = writeBatch(db);
  const convRef = doc(db, 'conversations', convId);
  const msgRef = doc(collection(db, 'conversations', convId, 'messages'));

  // Récupérer les participants pour incrémenter unread de l'autre
  const convSnap = await getDoc(convRef);
  if (!convSnap.exists()) return;
  const conv = convSnap.data() as Conversation;
  const otherId = conv.participants.find(p => p !== senderId) || '';

  // Ajouter le message
  batch.set(msgRef, {
    conversationId: convId,
    senderId,
    senderName,
    senderPhoto: senderPhoto || '',
    text: text.trim(),
    type: 'text',
    readBy: [senderId],
    createdAt: serverTimestamp(),
  });

  // Mettre à jour la conversation
  batch.update(convRef, {
    lastMessage: text.trim(),
    lastMessageAt: serverTimestamp(),
    lastSenderId: senderId,
    [`unreadCount.${otherId}`]: increment(1),
    [`unreadCount.${senderId}`]: 0,
  });

  await batch.commit();

  // Déclencher notification pour le destinataire
  if (otherId) {
    await createNotification(
      otherId,
      text.length > 0 && conv.lastMessage ? 'reply' : 'message',
      senderName,
      text.trim().substring(0, 80),
      { conversationId: convId, senderId },
    );
    // Push PWA locale si app en arrière-plan
    await showLocalPushNotification(senderName, text.trim(), {
      conversationId: convId,
      type: 'message',
    });
  }
}

// ── Envoyer une fiche produit ──────────────────────────────
export async function sendProductCard(
  convId: string,
  senderId: string,
  senderName: string,
  product: { id: string; title: string; price: number; image: string; neighborhood: string },
  senderPhoto?: string,
): Promise<void> {
  const batch = writeBatch(db);
  const convRef = doc(db, 'conversations', convId);
  const msgRef = doc(collection(db, 'conversations', convId, 'messages'));

  const convSnap = await getDoc(convRef);
  if (!convSnap.exists()) return;
  const conv = convSnap.data() as Conversation;
  const otherId = conv.participants.find(p => p !== senderId) || '';

  batch.set(msgRef, {
    conversationId: convId,
    senderId,
    senderName,
    senderPhoto: senderPhoto || '',
    text: `📦 Fiche produit : ${product.title}`,
    type: 'product_card',
    productRef: product,
    readBy: [senderId],
    createdAt: serverTimestamp(),
  });

  batch.update(convRef, {
    lastMessage: `📦 ${product.title}`,
    lastMessageAt: serverTimestamp(),
    lastSenderId: senderId,
    [`unreadCount.${otherId}`]: increment(1),
    [`unreadCount.${senderId}`]: 0,
  });

  await batch.commit();
}

// ── Marquer messages comme lus ─────────────────────────────
export async function markConversationAsRead(convId: string, userId: string): Promise<void> {
  try {
    const convRef = doc(db, 'conversations', convId);
    await updateDoc(convRef, { [`unreadCount.${userId}`]: 0 });

    // Marquer les messages non lus
    const msgsSnap = await getDocs(
      query(collection(db, 'conversations', convId, 'messages'), orderBy('createdAt', 'asc'))
    );
    const batch = writeBatch(db);
    msgsSnap.docs.forEach(d => {
      const data = d.data();
      if (!data.readBy?.includes(userId)) {
        batch.update(d.ref, { readBy: arrayUnion(userId) });
      }
    });
    await batch.commit();
  } catch (e) { console.error('[Messaging] markAsRead:', e); }
}

// ── Signaler un message ────────────────────────────────────
export async function reportMessage(convId: string, messageId: string): Promise<void> {
  const ref = doc(db, 'conversations', convId, 'messages', messageId);
  await updateDoc(ref, { reported: true });
}

// ── Listener temps réel — messages ────────────────────────
export function subscribeToMessages(
  convId: string,
  callback: (messages: Message[]) => void,
): () => void {
  const q = query(
    collection(db, 'conversations', convId, 'messages'),
    orderBy('createdAt', 'asc'),
  );
  return onSnapshot(q, snap => {
    const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Message));
    callback(msgs);
  });
}

// ── Listener temps réel — liste conversations ──────────────
export function subscribeToConversations(
  userId: string,
  callback: (convs: Conversation[]) => void,
): () => void {
  const q = query(
    convsCol,
    where('participants', 'array-contains', userId),
    orderBy('lastMessageAt', 'desc'),
  );
  return onSnapshot(q, snap => {
    const convs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Conversation));
    callback(convs);
  });
}

// ── Total non-lus pour badge BottomNav ─────────────────────
export function subscribeTotalUnread(
  userId: string,
  callback: (total: number) => void,
): () => void {
  const q = query(convsCol, where('participants', 'array-contains', userId));
  return onSnapshot(q, snap => {
    let total = 0;
    snap.docs.forEach(d => {
      const data = d.data();
      total += data.unreadCount?.[userId] || 0;
    });
    callback(total);
  });
}

// ── Acheteur envoie une offre de prix ──────────────────────
export async function sendOfferCard(
  convId: string,
  senderId: string,
  senderName: string,
  product: { id: string; title: string; price: number; image: string; sellerId: string; neighborhood?: string; sellerName?: string; sellerPhoto?: string },
  offerPrice: number,
  senderPhoto?: string,
): Promise<void> {
  const batch = writeBatch(db);
  const convRef = doc(db, 'conversations', convId);
  const msgRef = doc(collection(db, 'conversations', convId, 'messages'));

  const convSnap = await getDoc(convRef);
  if (!convSnap.exists()) return;
  const conv = convSnap.data() as Conversation;
  const otherId = conv.participants.find(p => p !== senderId) || '';

  batch.set(msgRef, {
    conversationId: convId,
    senderId,
    senderName,
    senderPhoto: senderPhoto || '',
    text: `💰 Offre : ${offerPrice.toLocaleString('fr-FR')} FCFA pour "${product.title}"`,
    type: 'offer_card',
    productRef: product,
    offerPrice,
    offerStatus: 'pending',
    readBy: [senderId],
    createdAt: serverTimestamp(),
  });

  batch.update(convRef, {
    lastMessage: `💰 Offre : ${offerPrice.toLocaleString('fr-FR')} FCFA`,
    lastMessageAt: serverTimestamp(),
    lastSenderId: senderId,
    [`unreadCount.${otherId}`]: increment(1),
    [`unreadCount.${senderId}`]: 0,
  });

  await batch.commit();
}

// ── Vendeur répond à une offre (accepter / refuser) ────────
export async function respondToOffer(
  convId: string,
  msgId: string,
  sellerId: string,
  sellerName: string,
  decision: 'accepted' | 'refused',
  sellerPhoto?: string,
): Promise<void> {
  const batch = writeBatch(db);
  const convRef = doc(db, 'conversations', convId);
  const msgRef = doc(db, 'conversations', convId, 'messages', msgId);

  const convSnap = await getDoc(convRef);
  if (!convSnap.exists()) return;
  const conv = convSnap.data() as Conversation;
  const otherId = conv.participants.find(p => p !== sellerId) || '';

  // Mettre à jour le statut de l'offre dans le message
  batch.update(msgRef, { offerStatus: decision });

  // Envoyer un message système de réponse
  const sysRef = doc(collection(db, 'conversations', convId, 'messages'));
  const sysText = decision === 'accepted'
    ? `✅ ${sellerName} a accepté ton offre ! Clique sur "Acheter à ce prix" pour finaliser la commande.`
    : `❌ ${sellerName} a refusé l'offre. Tu peux continuer au prix normal ou faire une nouvelle proposition.`;

  batch.set(sysRef, {
    conversationId: convId,
    senderId: 'system',
    senderName: 'Brumerie',
    text: sysText,
    type: 'system',
    readBy: [],
    createdAt: serverTimestamp(),
  });

  batch.update(convRef, {
    lastMessage: sysText,
    lastMessageAt: serverTimestamp(),
    lastSenderId: 'system',
    [`unreadCount.${otherId}`]: increment(1),
  });

  await batch.commit();
}

// ── Vendeur envoie un catalogue personnalisé avec prix custom ──
export async function sendSellerOfferCard(
  convId: string,
  senderId: string,
  senderName: string,
  product: { id: string; title: string; price: number; image: string; sellerId: string; neighborhood?: string; sellerName?: string; sellerPhoto?: string },
  customPrice: number,
  senderPhoto?: string,
): Promise<void> {
  const batch = writeBatch(db);
  const convRef = doc(db, 'conversations', convId);
  const msgRef = doc(collection(db, 'conversations', convId, 'messages'));

  const convSnap = await getDoc(convRef);
  if (!convSnap.exists()) return;
  const conv = convSnap.data() as Conversation;
  const otherId = conv.participants.find(p => p !== senderId) || '';

  batch.set(msgRef, {
    conversationId: convId,
    senderId,
    senderName,
    senderPhoto: senderPhoto || '',
    text: `🏷️ ${senderName} te propose "${product.title}" à ${customPrice.toLocaleString('fr-FR')} FCFA`,
    type: 'seller_offer_card',
    productRef: product,
    sellerCustomPrice: customPrice,
    readBy: [senderId],
    createdAt: serverTimestamp(),
  });

  batch.update(convRef, {
    lastMessage: `🏷️ Prix spécial : ${customPrice.toLocaleString('fr-FR')} FCFA`,
    lastMessageAt: serverTimestamp(),
    lastSenderId: senderId,
    [`unreadCount.${otherId}`]: increment(1),
    [`unreadCount.${senderId}`]: 0,
  });

  await batch.commit();
}

// ── S'abonner aux offres en attente pour un vendeur ─────────
export function subscribeSellerPendingOffers(
  sellerId: string,
  callback: (offers: Array<{ msgId: string; convId: string; buyerName: string; productTitle: string; offerPrice: number; productRef: any; createdAt: any }>) => void,
): () => void {
  // Écouter les conversations du vendeur
  const q = query(convsCol, where('participants', 'array-contains', sellerId));
  
  let allOffers: Array<any> = [];
  const unsubsByConv: Record<string, () => void> = {};

  const unsub = onSnapshot(q, (snap) => {
    // Pour chaque conversation, écouter les messages d'offre en temps réel
    snap.docs.forEach((convDoc) => {
      if (unsubsByConv[convDoc.id]) return; // déjà abonné

      const msgsQ = query(
        collection(db, 'conversations', convDoc.id, 'messages'),
        where('type', '==', 'offer_card'),
      );

      unsubsByConv[convDoc.id] = onSnapshot(msgsQ, (msgsSnap) => {
        // Retirer les offres de cette conv et les remplacer
        allOffers = allOffers.filter(o => o.convId !== convDoc.id);

        msgsSnap.docs.forEach(m => {
          const data = m.data();
          // Seulement les offres en attente envoyées par l'acheteur (pas le vendeur)
          if (data.offerStatus === 'pending' && data.senderId !== sellerId) {
            allOffers.push({
              msgId: m.id,
              convId: convDoc.id,
              buyerName: data.senderName,
              productTitle: data.productRef?.title || '',
              offerPrice: data.offerPrice,
              productRef: data.productRef,
              createdAt: data.createdAt,
            });
          }
        });

        // Trier par date décroissante
        allOffers.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        callback([...allOffers]);
      });
    });
  });

  // Retourner une fonction qui désabonne tout
  return () => {
    unsub();
    Object.values(unsubsByConv).forEach(u => u());
  };
}
