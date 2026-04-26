/**
 * Utilitaire pour générer l'en-tête uniforme des documents PDF côté client
 * Compatible avec jsPDF
 */

import { jsPDF } from 'jspdf';

/**
 * Configuration de la plateforme (coordonnées)
 */
export const PLATFORM_CONFIG = {
  name: 'Paw Legal',
  legalName: 'Paw Legal',
  subtitle: 'Service d\'accompagnement juridique',
  address: {
    street: '', // À compléter avec l'adresse réelle
    city: '',
    postalCode: '',
    country: 'France'
  },
  email: 'contact@pawlegal.fr',
  website: 'https://www.pawlegal.fr',
  phone: '07 68 03 33 58'
};

/**
 * Formate la date au format JJ mois AAAA (ex: 06 octobre 2025)
 */
export function formatDate(date: Date = new Date()): string {
  const months = [
    'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'
  ];
  
  const day = String(date.getDate()).padStart(2, '0');
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  
  return `${day} ${month} ${year}`;
}

/**
 * Ajoute l'en-tête standard à un document jsPDF
 * @param {jsPDF} doc - Instance jsPDF
 * @param {Object} options - Options d'en-tête
 * @param {number} options.margin - Marge du document (défaut: 20)
 * @returns {number} Position Y après l'en-tête
 */
export function addDocumentHeader(doc: jsPDF, options: { margin?: number } = {}): number {
  const margin = options.margin || 20;
  const pageWidth = doc.internal.pageSize.getWidth();
  let yPosition = margin;

  // Couleurs
  const primaryColor = [249, 115, 22]; // Orange Paw Legal #f97316
  const textColor = [31, 41, 55]; // Gris foncé #1f2937
  const lightGray = [156, 163, 175]; // Gris clair #9ca3af

  // ===== LOGO (en haut à gauche) =====
  // Note: Pour ajouter une image de logo, utiliser:
  // doc.addImage(logoData, 'PNG', margin, yPosition, 60, 60);
  // Pour l'instant, on utilise du texte stylisé
  doc.setFontSize(24);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.setFont('helvetica', 'bold');
  doc.text('PAW', margin, yPosition);
  doc.text('LEGAL', margin, yPosition + 8);

  // ===== NOM DE LA PLATEFORME (à droite du logo) =====
  const nameX = margin + 50;
  doc.setFontSize(20);
  doc.setTextColor(textColor[0], textColor[1], textColor[2]);
  doc.setFont('helvetica', 'bold');
  doc.text(PLATFORM_CONFIG.name, nameX, yPosition);

  // ===== SOUS-TITRE =====
  doc.setFontSize(11);
  doc.setTextColor(lightGray[0], lightGray[1], lightGray[2]);
  doc.setFont('helvetica', 'italic');
  doc.text(PLATFORM_CONFIG.subtitle, nameX, yPosition + 7);

  yPosition += 25;

  // ===== COORDONNÉES DE LA PLATEFORME =====
  const contactInfo = [];
  if (PLATFORM_CONFIG.legalName) {
    contactInfo.push(PLATFORM_CONFIG.legalName);
  }
  if (PLATFORM_CONFIG.address.street) {
    contactInfo.push(PLATFORM_CONFIG.address.street);
  }
  if (PLATFORM_CONFIG.address.postalCode && PLATFORM_CONFIG.address.city) {
    contactInfo.push(`${PLATFORM_CONFIG.address.postalCode} ${PLATFORM_CONFIG.address.city}`);
  }
  if (PLATFORM_CONFIG.address.country) {
    contactInfo.push(PLATFORM_CONFIG.address.country);
  }
  if (PLATFORM_CONFIG.email) {
    contactInfo.push(`Email: ${PLATFORM_CONFIG.email}`);
  }
  if (PLATFORM_CONFIG.website) {
    contactInfo.push(`Site: ${PLATFORM_CONFIG.website}`);
  }
  if (PLATFORM_CONFIG.phone) {
    contactInfo.push(`Téléphone: ${PLATFORM_CONFIG.phone}`);
  }

  doc.setFontSize(9);
  doc.setTextColor(textColor[0], textColor[1], textColor[2]);
  doc.setFont('helvetica', 'normal');
  doc.text(contactInfo.join(' | '), margin, yPosition);

  yPosition += 10;

  // ===== DATE DE GÉNÉRATION (alignée à droite) =====
  const dateText = `Document généré le : ${formatDate()}`;
  doc.setFontSize(9);
  doc.setTextColor(lightGray[0], lightGray[1], lightGray[2]);
  doc.setFont('helvetica', 'normal');
  const dateWidth = doc.getTextWidth(dateText);
  doc.text(dateText, pageWidth - margin - dateWidth, yPosition);

  yPosition += 8;

  // ===== LIGNE DE SÉPARATION =====
  doc.setDrawColor(lightGray[0], lightGray[1], lightGray[2]);
  doc.setLineWidth(0.5);
  doc.line(margin, yPosition, pageWidth - margin, yPosition);

  // Retourner la position Y après l'en-tête pour continuer le contenu
  return yPosition + 10;
}

/**
 * Crée un document PDF avec l'en-tête standard
 * @param {Object} options - Options du document
 * @returns {jsPDF} Instance jsPDF configurée
 */
export function createDocumentWithHeader(options: { margin?: number; orientation?: 'portrait' | 'landscape'; unit?: 'mm' | 'pt' | 'px' | 'in'; format?: string | number[] } = {}): jsPDF {
  const doc = new jsPDF({
    orientation: options.orientation || 'portrait',
    unit: options.unit || 'mm',
    format: options.format || 'a4'
  });

  // Ajouter l'en-tête sur la première page
  addDocumentHeader(doc, options);

  // Note: Pour ajouter l'en-tête sur chaque page, il faudra gérer les événements de nouvelle page
  // jsPDF ne supporte pas directement les événements, il faudra le gérer manuellement lors de l'ajout de nouvelles pages

  return doc;
}




