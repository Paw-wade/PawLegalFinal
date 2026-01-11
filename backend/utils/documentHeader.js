/**
 * Utilitaire pour générer l'en-tête uniforme des documents PDF
 * Compatible avec PDFKit
 */

const PDFDocument = require('pdfkit');

/**
 * Configuration de la plateforme (coordonnées)
 */
const PLATFORM_CONFIG = {
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
function formatDate(date = new Date()) {
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
 * Ajoute l'en-tête standard à un document PDFKit
 * @param {PDFDocument} doc - Instance PDFDocument de PDFKit
 * @param {Object} options - Options d'en-tête
 * @param {number} options.margin - Marge du document (défaut: 50)
 * @param {string} options.logoPath - Chemin vers le logo (optionnel)
 */
function addDocumentHeader(doc, options = {}) {
  const margin = options.margin || 50;
  const pageWidth = doc.page.width;
  const headerHeight = 120; // Hauteur approximative de l'en-tête
  let yPosition = margin;

  // Couleurs
  const primaryColor = '#f97316'; // Orange Paw Legal
  const textColor = '#1f2937'; // Gris foncé
  const lightGray = '#9ca3af'; // Gris clair

  // ===== LOGO (en haut à gauche) =====
  // Note: Pour ajouter une image de logo, utiliser:
  // if (options.logoPath) {
  //   doc.image(options.logoPath, margin, yPosition, { width: 60, height: 60 });
  //   yPosition += 65;
  // }
  // Pour l'instant, on utilise du texte stylisé
  doc.fontSize(24)
     .fillColor(primaryColor)
     .font('Helvetica-Bold')
     .text('PAW', margin, yPosition, { width: 100 });
  
  doc.fontSize(24)
     .fillColor(primaryColor)
     .font('Helvetica-Bold')
     .text('LEGAL', margin, yPosition + 20, { width: 100 });

  // ===== NOM DE LA PLATEFORME (à droite du logo) =====
  const nameX = margin + 120;
  doc.fontSize(20)
     .fillColor(textColor)
     .font('Helvetica-Bold')
     .text(PLATFORM_CONFIG.name, nameX, yPosition, { width: pageWidth - nameX - margin });

  // ===== SOUS-TITRE =====
  doc.fontSize(11)
     .fillColor(lightGray)
     .font('Helvetica-Oblique')
     .text(PLATFORM_CONFIG.subtitle, nameX, yPosition + 25, { width: pageWidth - nameX - margin });

  yPosition += 50;

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

  doc.fontSize(9)
     .fillColor(textColor)
     .font('Helvetica')
     .text(contactInfo.join(' | '), margin, yPosition, {
       width: pageWidth - (2 * margin),
       align: 'left'
     });

  yPosition += 20;

  // ===== DATE DE GÉNÉRATION (alignée à droite) =====
  const dateText = `Document généré le : ${formatDate()}`;
  doc.fontSize(9)
     .fillColor(lightGray)
     .font('Helvetica')
     .text(dateText, margin, yPosition, {
       width: pageWidth - (2 * margin),
       align: 'right'
     });

  yPosition += 15;

  // ===== LIGNE DE SÉPARATION =====
  doc.strokeColor(lightGray)
     .lineWidth(0.5)
     .moveTo(margin, yPosition)
     .lineTo(pageWidth - margin, yPosition)
     .stroke();

  // Retourner la position Y après l'en-tête pour continuer le contenu
  return yPosition + 20;
}

/**
 * Crée un document PDF avec l'en-tête standard
 * @param {Object} options - Options du document
 * @returns {PDFDocument} Instance PDFDocument configurée
 */
function createDocumentWithHeader(options = {}) {
  const doc = new PDFDocument({
    margin: options.margin || 50,
    size: options.size || 'A4'
  });

  // Ajouter l'en-tête sur la première page
  addDocumentHeader(doc, options);

  // Ajouter l'en-tête sur chaque nouvelle page
  doc.on('pageAdded', () => {
    addDocumentHeader(doc, options);
  });

  return doc;
}

module.exports = {
  addDocumentHeader,
  createDocumentWithHeader,
  formatDate,
  PLATFORM_CONFIG
};




