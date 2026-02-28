// src/utils/shareProduct.ts — Partage enrichi d'un article
import { Product } from '@/types';

// Génère le message WhatsApp pré-formaté
export function buildWhatsAppShareMessage(product: Product, url: string): string {
  const price = product.price.toLocaleString('fr-FR');
  const original = product.originalPrice && product.originalPrice > product.price
    ? ` ~~${product.originalPrice.toLocaleString('fr-FR')} FCFA~~` : '';
  const verified = product.sellerVerified ? '✅ Vendeur vérifié' : '';
  const condition = product.condition === 'new' ? '🟢 Neuf'
    : product.condition === 'like_new' ? '🔵 Comme neuf'
    : product.condition === 'second_hand' ? '🟡 Occasion' : '';

  const lines = [
    `🛍 *${product.title}*`,
    `💰 *${price} FCFA*${original}`,
    condition && `${condition}`,
    `📍 ${product.neighborhood}`,
    verified,
    ``,
    `👉 Voir l'article sur Brumerie :`,
    url,
  ].filter(Boolean);

  return lines.join('\n');
}

// Ouvre le partage natif (API Web Share) ou bascule sur WhatsApp
export async function shareProduct(product: Product): Promise<void> {
  const url = `${window.location.origin}?product=${product.id}`;
  const text = buildWhatsAppShareMessage(product, url);

  // API Web Share native (Android/iOS récents)
  if (navigator.share) {
    try {
      await navigator.share({
        title: `${product.title} — ${product.price.toLocaleString('fr-FR')} FCFA`,
        text,
        url,
      });
      return;
    } catch (e) {
      // Annulé par l'user ou non supporté → fallback WhatsApp
    }
  }

  // Fallback : ouvrir WhatsApp directement
  const waUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(waUrl, '_blank');
}

// Copier le lien dans le presse-papier
export async function copyProductLink(productId: string): Promise<boolean> {
  const url = `${window.location.origin}?product=${productId}`;
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}
