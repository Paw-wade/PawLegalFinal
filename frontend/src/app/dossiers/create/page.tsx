'use client';

import { useState, useEffect, useRef, Fragment } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { dossiersAPI, userAPI } from '@/lib/api';
import { DateInput as DateInputComponent } from '@/components/ui/DateInput';

function Button({ children, variant = 'default', className = '', disabled, ...props }: any) {
  const baseClasses = 'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
  const variantClasses = {
    default: 'bg-orange-500 text-white hover:bg-orange-600 shadow-md font-semibold',
    outline: 'border border-input bg-background hover:bg-accent',
    ghost: 'hover:bg-accent',
  };
  return <button className={`${baseClasses} ${variantClasses[variant]} ${className}`} disabled={disabled} {...props}>{children}</button>;
}

function Input({ className = '', type, value, onChange, ...props }: any) {
  // Pour les champs de date, utiliser le composant DateInput qui garantit le format jour/mois/année
  if (type === 'date') {
    return (
      <DateInputComponent
        value={value || ''}
        onChange={(newValue) => {
          if (onChange) {
            const syntheticEvent = {
              target: { value: newValue },
              currentTarget: { value: newValue }
            } as React.ChangeEvent<HTMLInputElement>;
            onChange(syntheticEvent);
          }
        }}
        className={`flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
        {...props}
      />
    );
  }
  
  return (
    <input
      type={type}
      className={`flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}

function Label({ htmlFor, children, className = '' }: any) {
  return (
    <label htmlFor={htmlFor} className={`text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 ${className}`}>
      {children}
    </label>
  );
}

function Textarea({ className = '', ...props }: any) {
  return (
    <textarea
      className={`flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}

// Mapping des catégories simplifiées vers les catégories techniques
const categoryMapping: { [key: string]: { categorie: string; type: string } } = {
  'premiere_demande_titre': { categorie: 'sejour_titres', type: 'premier_titre_etudiant' },
  'renouvellement_titre': { categorie: 'sejour_titres', type: 'renouvellement_titre' },
  'changement_statut': { categorie: 'sejour_titres', type: 'changement_statut' },
  'regroupement_familial': { categorie: 'regroupement_familial', type: 'preparation_dossier_regroupement' },
  'nationalite_francaise': { categorie: 'nationalite_francaise', type: 'acquisition_nationalite' },
  'demande_visa': { categorie: 'sejour_titres', type: 'premier_titre_visiteur' },
  'demande_carte_resident': { categorie: 'sejour_titres', type: 'carte_resident' },
  'pas_reponse_titre': { categorie: 'contentieux_administratif', type: 'recours_absence_reponse' },
  'pas_reponse_visa': { categorie: 'contentieux_administratif', type: 'recours_absence_reponse' },
  'conteste_refus_titre': { categorie: 'contentieux_administratif', type: 'recours_refus_sejour' },
  'conteste_oqtf': { categorie: 'eloignement_urgence', type: 'contestation_oqtf' },
  'conteste_refus_asile_cnda': { categorie: 'asile', type: 'recours_cnda' },
  'conteste_refus_visa': { categorie: 'contentieux_administratif', type: 'recours_refus_sejour' },
  'autre_demande': { categorie: 'autre', type: 'autre' },
  'constitution_societe_senegal': { categorie: 'constitution_societe', type: 'constitution_societe_senegal' },
  'constitution_societe_france': { categorie: 'constitution_societe', type: 'constitution_societe_france' },
};

const clientCategories = {
  accompagnement: {
    label: 'J\'ai besoin d\'un accompagnement',
    options: [
      { value: 'premiere_demande_titre', label: 'Je fais une première demande de titre de séjour' },
      { value: 'renouvellement_titre', label: 'Je demande le renouvellement de mon titre de séjour' },
      { value: 'changement_statut', label: 'Je demande un changement de statut' },
      { value: 'regroupement_familial', label: 'Je demande un regroupement familial' },
      { value: 'nationalite_francaise', label: 'Je demande la nationalité française' },
      { value: 'demande_visa', label: 'Je demande un visa' },
      { value: 'demande_carte_resident', label: 'Je demande une carte de résident' },
      { value: 'autre_demande', label: 'Autre Demande' },
    ]
  },
  recours: {
    label: 'Je veux faire un recours',
    options: [
      { value: 'pas_reponse_titre', label: 'Je n\'ai pas eu de réponse à ma demande de titre de séjour' },
      { value: 'pas_reponse_visa', label: 'Je n\'ai pas eu de réponse à ma demande de visa' },
      { value: 'conteste_refus_titre', label: 'Je conteste un refus de titre de séjour' },
      { value: 'conteste_oqtf', label: 'J\'ai reçu une OQTF (obligation de quitter le territoire)' },
      { value: 'conteste_refus_asile_cnda', label: 'Je conteste un refus d\'asile auprès de la CNDA' },
      { value: 'conteste_refus_visa', label: 'Je conteste un refus de visa' },
    ]
  },
  constitution_societe: {
    label: 'Constitution de société',
    options: [
      { value: 'constitution_societe_senegal', label: 'Entreprise / société au Sénégal' },
      { value: 'constitution_societe_france', label: 'Entreprise / société en France' },
    ]
  }
};

export default function CreateDossierPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedOption, setSelectedOption] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  // Fonction pour obtenir la date du jour au format YYYY-MM-DD
  const getTodayDate = () => new Date().toISOString().split('T')[0];

  const [formData, setFormData] = useState<{
    titre: string;
    description: string;
    nom: string;
    prenom: string;
    email: string;
    telephone: string;
    dateEcheance: string;
    notes: string;
    [key: string]: any;
  }>({
    titre: '',
    description: '',
    // Pour les visiteurs non connectés
    nom: '',
    prenom: '',
    email: '',
    telephone: '',
    // Champs dynamiques selon le type de demande
    dateEcheance: getTodayDate(),
    notes: '',
  });

  // Charger le profil utilisateur pour pré-remplir les champs
  useEffect(() => {
    const loadUserProfile = async () => {
      // Si l'utilisateur est connecté, charger son profil
      if (session && (session.user as any)?.id) {
        setIsLoadingProfile(true);
        try {
          const token = localStorage.getItem('token') || sessionStorage.getItem('token');
          if (!token && (session.user as any)?.accessToken) {
            localStorage.setItem('token', (session.user as any).accessToken);
          }

          const response = await userAPI.getProfile();
          if (response.data.success) {
            const profile = response.data.user || response.data.data;
            setUserProfile(profile);
            
            // Formater la date pour les champs de type date
            const formatDateForInput = (date: string | Date | null | undefined) => {
              if (!date) return '';
              try {
                const d = new Date(date);
                return d.toISOString().split('T')[0];
              } catch {
                return '';
              }
            };

            // Pré-remplir les champs avec les informations du profil
            setFormData(prev => ({
              ...prev,
              // Informations de base
              nom: profile.lastName || prev.nom,
              prenom: profile.firstName || prev.prenom,
              email: profile.email || prev.email,
              telephone: profile.phone || prev.telephone,
              // Informations spécifiques selon le type de demande
              // Pays d'origine (utilisé dans plusieurs types de demandes)
              pays_origine: profile.nationalite || profile.pays || prev.pays_origine || '',
              // Date d'arrivée en France (si disponible dans le profil)
              date_arrivee_france: prev.date_arrivee_france || '',
              // Numéro de titre actuel (pour renouvellement)
              numero_titre_actuel: profile.numeroTitre || prev.numero_titre_actuel || '',
              // Date d'expiration du titre (pour renouvellement)
              date_expiration: formatDateForInput(profile.dateExpiration) || prev.date_expiration || '',
              // Type de titre (pour renouvellement)
              type_titre: profile.typeTitre || prev.type_titre || '',
              // Date de délivrance (pour renouvellement)
              date_delivrance: formatDateForInput(profile.dateDelivrance) || prev.date_delivrance || '',
            }));
          }
        } catch (err: any) {
          console.error('Erreur lors du chargement du profil:', err);
          // Ne pas bloquer si le profil ne peut pas être chargé
        } finally {
          setIsLoadingProfile(false);
        }
      } else if (session?.user) {
        // Utiliser les informations de la session si disponibles
        const userName = session.user.name || '';
        const nameParts = userName.split(' ');
        setFormData(prev => ({
          ...prev,
          prenom: nameParts[0] || prev.prenom,
          nom: nameParts.slice(1).join(' ') || prev.nom,
          email: session.user.email || prev.email,
        }));
      }
    };

    loadUserProfile();
  }, [session]);

  // Définition des champs spécifiques pour chaque type de demande
  const getSpecificFields = (optionValue: string) => {
    const fields: { [key: string]: Array<{ name: string; label: string; type: string; placeholder?: string; required?: boolean; options?: string[] }> } = {
      'premiere_demande_titre': [
        { name: 'etablissement', label: 'Établissement d\'enseignement', type: 'text', placeholder: 'Nom de l\'établissement', required: false },
        { name: 'niveau_etudes', label: 'Niveau d\'études', type: 'select', options: ['Licence', 'Master', 'Doctorat', 'Autre'], required: false },
        { name: 'date_debut_etudes', label: 'Date de début des études', type: 'date', required: false },
        { name: 'date_fin_etudes', label: 'Date de fin prévue des études', type: 'date', required: false },
        { name: 'pays_origine', label: 'Pays d\'origine', type: 'text', placeholder: 'Pays d\'origine', required: false },
      ],
      'renouvellement_titre': [
        { name: 'numero_titre_actuel', label: 'Numéro du titre de séjour actuel', type: 'text', placeholder: 'Ex: 123456789', required: false },
        { name: 'date_expiration', label: 'Date d\'expiration du titre actuel', type: 'date', required: false },
        { name: 'motif_renouvellement', label: 'Motif du renouvellement', type: 'select', options: ['Poursuite d\'études', 'Changement de statut', 'Autre'], required: false },
        { name: 'situation_actuelle', label: 'Situation actuelle', type: 'textarea', placeholder: 'Décrivez votre situation actuelle', required: false },
      ],
      'changement_statut': [
        { name: 'statut_actuel', label: 'Statut actuel', type: 'select', options: ['Étudiant', 'Visiteur', 'Salarié', 'Autre'], required: false },
        { name: 'nouveau_statut', label: 'Nouveau statut souhaité', type: 'select', options: ['Salarié', 'Entrepreneur', 'Visiteur', 'Autre'], required: false },
        { name: 'motif_changement', label: 'Motif du changement', type: 'textarea', placeholder: 'Expliquez les raisons du changement', required: false },
        { name: 'contrat_travail', label: 'Avez-vous un contrat de travail ?', type: 'select', options: ['Oui', 'Non', 'En cours'], required: false },
      ],
      'regroupement_familial': [
        { name: 'nombre_enfants', label: 'Nombre d\'enfants', type: 'number', placeholder: '0', required: false },
        { name: 'situation_familiale', label: 'Situation familiale', type: 'select', options: ['Marié(e)', 'Pacsé(e)', 'Concubinage', 'Célibataire'], required: false },
        { name: 'pays_origine', label: 'Pays d\'origine', type: 'text', placeholder: 'Pays d\'origine', required: false },
        { name: 'date_arrivee_france', label: 'Date d\'arrivée en France', type: 'date', required: false },
        { name: 'revenus', label: 'Revenus mensuels (€)', type: 'number', placeholder: 'Montant en euros', required: false },
      ],
      'nationalite_francaise': [
        { name: 'pays_origine', label: 'Pays d\'origine', type: 'text', placeholder: 'Pays d\'origine', required: false },
        { name: 'date_arrivee_france', label: 'Date d\'arrivée en France', type: 'date', required: false },
        { name: 'duree_sejour', label: 'Durée de séjour en France (années)', type: 'number', placeholder: 'Nombre d\'années', required: false },
        { name: 'situation_professionnelle', label: 'Situation professionnelle', type: 'select', options: ['Salarié', 'Indépendant', 'Étudiant', 'Sans emploi', 'Retraité'], required: false },
        { name: 'niveau_francais', label: 'Niveau de français', type: 'select', options: ['Débutant', 'Intermédiaire', 'Avancé', 'Natif'], required: false },
      ],
      'demande_visa': [
        { name: 'type_visa', label: 'Type de visa souhaité', type: 'select', options: ['Court séjour (Schengen)', 'Long séjour', 'Visiteur', 'Étudiant', 'Travailleur'], required: false },
        { name: 'duree_sejour', label: 'Durée du séjour souhaitée', type: 'select', options: ['1-3 mois', '3-6 mois', '6-12 mois', 'Plus de 12 mois'], required: false },
        { name: 'motif_voyage', label: 'Motif du voyage', type: 'textarea', placeholder: 'Décrivez le motif de votre voyage', required: false },
        { name: 'pays_origine', label: 'Pays d\'origine', type: 'text', placeholder: 'Pays d\'origine', required: false },
      ],
      'demande_carte_resident': [
        { name: 'duree_sejour_france', label: 'Durée de séjour en France (années)', type: 'number', placeholder: 'Nombre d\'années', required: false },
        { name: 'situation_professionnelle', label: 'Situation professionnelle', type: 'select', options: ['Salarié', 'Indépendant', 'Étudiant', 'Sans emploi', 'Retraité'], required: false },
        { name: 'revenus', label: 'Revenus mensuels (€)', type: 'number', placeholder: 'Montant en euros', required: false },
        { name: 'niveau_francais', label: 'Niveau de français', type: 'select', options: ['Débutant', 'Intermédiaire', 'Avancé', 'Natif'], required: false },
      ],
      'pas_reponse_titre': [
        { name: 'date_depot_demande', label: 'Date de dépôt de la demande', type: 'date', required: false },
        { name: 'numero_dossier', label: 'Numéro de dossier (si disponible)', type: 'text', placeholder: 'Numéro de dossier', required: false },
        { name: 'prefecture', label: 'Préfecture concernée', type: 'text', placeholder: 'Nom de la préfecture', required: false },
        { name: 'delai_attente', label: 'Délai d\'attente (mois)', type: 'number', placeholder: 'Nombre de mois', required: false },
      ],
      'pas_reponse_visa': [
        { name: 'date_depot_demande', label: 'Date de dépôt de la demande', type: 'date', required: false },
        { name: 'consulat', label: 'Consulat concerné', type: 'text', placeholder: 'Nom du consulat', required: false },
        { name: 'type_visa', label: 'Type de visa demandé', type: 'select', options: ['Court séjour', 'Long séjour', 'Visiteur', 'Étudiant'], required: false },
        { name: 'delai_attente', label: 'Délai d\'attente (mois)', type: 'number', placeholder: 'Nombre de mois', required: false },
      ],
      'conteste_refus_titre': [
        { name: 'date_refus', label: 'Date du refus', type: 'date', required: false },
        { name: 'numero_dossier', label: 'Numéro de dossier', type: 'text', placeholder: 'Numéro de dossier', required: false },
        { name: 'prefecture', label: 'Préfecture concernée', type: 'text', placeholder: 'Nom de la préfecture', required: false },
        { name: 'motif_refus', label: 'Motif du refus (si connu)', type: 'textarea', placeholder: 'Indiquez les motifs de refus mentionnés', required: false },
        { name: 'date_echeance_recours', label: 'Date d\'échéance pour le recours', type: 'date', required: false },
      ],
      'conteste_oqtf': [
        { name: 'date_oqtf', label: 'Date de réception de l\'OQTF', type: 'date', required: false },
        { name: 'date_echeance_depart', label: 'Date d\'échéance pour quitter le territoire', type: 'date', required: false },
        { name: 'prefecture', label: 'Préfecture concernée', type: 'text', placeholder: 'Nom de la préfecture', required: false },
        { name: 'motif_oqtf', label: 'Motif de l\'OQTF (si connu)', type: 'textarea', placeholder: 'Indiquez les motifs mentionnés', required: false },
        { name: 'situation_familiale', label: 'Situation familiale en France', type: 'select', options: ['Marié(e) avec Français(e)', 'Enfants français', 'Aucun lien familial', 'Autre'], required: false },
      ],
      'conteste_refus_asile_cnda': [
        { name: 'date_refus', label: 'Date du refus d\'asile', type: 'date', required: false },
        { name: 'date_depot_cnda', label: 'Date de dépôt du recours CNDA', type: 'date', required: false },
        { name: 'numero_dossier', label: 'Numéro de dossier OFPRA/CNDA', type: 'text', placeholder: 'Numéro de dossier', required: false },
        { name: 'pays_origine', label: 'Pays d\'origine', type: 'text', placeholder: 'Pays d\'origine', required: false },
        { name: 'motif_demande_asile', label: 'Motif de la demande d\'asile', type: 'textarea', placeholder: 'Décrivez les raisons de votre demande d\'asile', required: false },
      ],
      'conteste_refus_visa': [
        { name: 'date_refus', label: 'Date du refus', type: 'date', required: false },
        { name: 'consulat', label: 'Consulat concerné', type: 'text', placeholder: 'Nom du consulat', required: false },
        { name: 'type_visa', label: 'Type de visa refusé', type: 'select', options: ['Court séjour', 'Long séjour', 'Visiteur', 'Étudiant'], required: false },
        { name: 'motif_refus', label: 'Motif du refus (si connu)', type: 'textarea', placeholder: 'Indiquez les motifs de refus mentionnés', required: false },
      ],
      'autre_demande': [
        { name: 'nature_demande', label: 'Nature de votre demande', type: 'textarea', placeholder: 'Décrivez en détail votre demande', required: false },
        { name: 'urgence', label: 'Niveau d\'urgence', type: 'select', options: ['Normale', 'Haute', 'Urgente'], required: false },
        { name: 'date_echeance', label: 'Date d\'échéance (si applicable)', type: 'date', required: false },
      ],
      'constitution_societe_senegal': [
        { name: 'denomination_prevue', label: 'Dénomination sociale ou nom commercial envisagé', type: 'text', placeholder: 'Ex. Ma Société SARL', required: false },
        { name: 'forme_juridique_sn', label: 'Forme juridique envisagée (Sénégal)', type: 'select', options: ['SARL', 'SA', 'SAS / SUARL', 'GIE', 'Entreprise individuelle', 'Autre / à définir'], required: false },
        { name: 'siege_prevu_sn', label: 'Siège ou ville d’implantation prévue', type: 'text', placeholder: 'Région, ville', required: false },
        { name: 'activite_principale', label: 'Activité principale', type: 'textarea', placeholder: 'Secteur, objet social, clientèle visée…', required: false },
        { name: 'nombre_associes_sn', label: 'Nombre d’associés / fondateurs', type: 'text', placeholder: 'Ex. 2 associés', required: false },
        { name: 'capital_prevu_sn', label: 'Capital social ou apports envisagés', type: 'text', placeholder: 'Montant ou fourchette (FCFA)', required: false },
      ],
      'constitution_societe_france': [
        { name: 'denomination_prevue', label: 'Dénomination sociale envisagée', type: 'text', placeholder: 'Ex. MA SOCIÉTÉ SAS', required: false },
        { name: 'forme_juridique_fr', label: 'Forme juridique envisagée (France)', type: 'select', options: ['SAS', 'SASU', 'SARL', 'EURL', 'SA', 'SCI', 'Micro-entreprise', 'Autre / à définir'], required: false },
        { name: 'departement_siege', label: 'Département ou ville du siège social', type: 'text', placeholder: 'Ex. Paris (75)', required: false },
        { name: 'activite_principale', label: 'Activité principale', type: 'textarea', placeholder: 'Secteur, code APE/NAF si connu, clientèle…', required: false },
        { name: 'nombre_associes_fr', label: 'Nombre d’associés / associés uniques', type: 'text', placeholder: 'Ex. associé unique', required: false },
        { name: 'capital_prevu_fr', label: 'Capital social envisagé (€)', type: 'text', placeholder: 'Montant ou fourchette', required: false },
      ],
    };

    return fields[optionValue] || [];
  };

  const urlRubriqueSyncedRef = useRef(false);
  useEffect(() => {
    if (urlRubriqueSyncedRef.current || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const rub = params.get('rubrique');
    const opt = params.get('option');
    if (rub !== 'constitution_societe' && opt !== 'constitution_societe_senegal' && opt !== 'constitution_societe_france') {
      return;
    }
    urlRubriqueSyncedRef.current = true;
    setSelectedCategory('constitution_societe');
    if (opt === 'constitution_societe_senegal' || opt === 'constitution_societe_france') {
      setSelectedOption(opt);
      const label =
        clientCategories.constitution_societe.options.find((o) => o.value === opt)?.label || '';
      const specificFields = getSpecificFields(opt);
      setFormData((prev) => {
        const next: any = {
          ...prev,
          titre: label || prev.titre,
          description: prev.description,
          nom: prev.nom,
          prenom: prev.prenom,
          email: prev.email,
          telephone: prev.telephone,
          dateEcheance: prev.dateEcheance,
          notes: prev.notes,
        };
        specificFields.forEach((field) => {
          next[field.name] = prev[field.name] && prev[field.name] !== '' ? prev[field.name] : '';
        });
        return next;
      });
    }
  }, []);

  const handleCategorySelect = (categoryKey: string) => {
    setSelectedCategory(categoryKey);
    setSelectedOption(''); // Réinitialiser l'option sélectionnée
    // Réinitialiser les champs dynamiques
    setFormData(prev => ({
      ...prev,
      titre: prev.titre,
      description: prev.description,
      nom: prev.nom,
      prenom: prev.prenom,
      email: prev.email,
      telephone: prev.telephone,
    }));
  };

  const handleOptionSelect = (optionValue: string) => {
    setSelectedOption(optionValue);
    
    // Générer automatiquement un titre basé sur l'option sélectionnée
    const optionLabel = Object.values(clientCategories)
      .flatMap(cat => cat.options)
      .find(opt => opt.value === optionValue)?.label || '';
    
    // Si le titre n'est pas déjà rempli, générer un titre automatique
    const autoTitre = formData.titre && formData.titre.trim() 
      ? formData.titre 
      : optionLabel || '';
    
    // Réinitialiser les champs dynamiques spécifiques mais préserver les valeurs du profil
    const specificFields = getSpecificFields(optionValue);
    const resetData: any = {
      titre: autoTitre,
      description: formData.description,
      nom: formData.nom,
      prenom: formData.prenom,
      email: formData.email,
      telephone: formData.telephone,
      dateEcheance: formData.dateEcheance,
      notes: formData.notes,
    };
    
    // Pour chaque champ spécifique, utiliser la valeur du profil si disponible, sinon vide
    specificFields.forEach(field => {
      // Si le champ existe déjà dans formData (pré-rempli depuis le profil), le conserver
      if (formData[field.name] && formData[field.name] !== '') {
        resetData[field.name] = formData[field.name];
      } else {
        resetData[field.name] = '';
      }
    });
    
    setFormData(resetData);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedCategory || !selectedOption) {
      setError('Veuillez sélectionner une catégorie et une option');
      return;
    }

    // Tous les champs sont optionnels - pas de validation obligatoire
    const titreTrimmed = formData.titre ? formData.titre.trim() : '';

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const mapping = categoryMapping[selectedOption];
      if (!mapping) {
        setError('Erreur: catégorie non reconnue');
        setIsSubmitting(false);
        return;
      }

      // Construire la description enrichie avec les champs spécifiques
      let descriptionEnrichie = formData.description || '';
      const specificFields = getSpecificFields(selectedOption);
      const champsSpecifiques: string[] = [];
      
      specificFields.forEach(field => {
        if (formData[field.name] !== undefined && formData[field.name] !== '' && formData[field.name] !== null) {
          champsSpecifiques.push(`${field.label}: ${formData[field.name]}`);
        }
      });

      if (champsSpecifiques.length > 0) {
        descriptionEnrichie = descriptionEnrichie 
          ? `${descriptionEnrichie}\n\n--- Informations spécifiques ---\n${champsSpecifiques.join('\n')}`
          : `--- Informations spécifiques ---\n${champsSpecifiques.join('\n')}`;
      }

      const dossierData: any = {
        titre: titreTrimmed, // Utiliser le titre trimé pour éviter les espaces
        description: descriptionEnrichie,
        categorie: mapping.categorie,
        type: mapping.type,
        statut: 'recu',
        priorite: formData.urgence ? formData.urgence.toLowerCase() : 'normale',
        dateEcheance: formData.dateEcheance || null,
        notes: formData.notes || '',
      };

      // Si l'utilisateur est connecté, utiliser son ID
      if (session && (session.user as any)?.id) {
        dossierData.userId = (session.user as any).id;
      } else {
        // Sinon, utiliser les informations du visiteur (tous les champs sont optionnels)
        dossierData.clientNom = formData.nom || '';
        dossierData.clientPrenom = formData.prenom || '';
        dossierData.clientEmail = formData.email || '';
        dossierData.clientTelephone = formData.telephone || '';
      }

      const response = await dossiersAPI.createDossier(dossierData);
      
      if (response.data.success) {
        setSuccess('Votre demande de dossier a été créée avec succès !');
        // Réinitialiser le formulaire
        const resetData: any = {
          titre: '',
          description: '',
          nom: '',
          prenom: '',
          email: '',
          telephone: '',
          dateEcheance: '',
          notes: '',
        };
        // Réinitialiser les champs dynamiques
        const specificFields = getSpecificFields(selectedOption);
        specificFields.forEach(field => {
          resetData[field.name] = '';
        });
        setFormData(resetData);
        setSelectedCategory('');
        setSelectedOption('');
        
        // Rediriger après 2 secondes
        setTimeout(() => {
          if (session) {
            router.push('/client/dossiers');
          } else {
            router.push('/');
          }
        }, 2000);
      }
    } catch (err: any) {
      console.error('Erreur lors de la création du dossier:', err);
      setError(err.response?.data?.message || 'Erreur lors de la création du dossier. Veuillez réessayer.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/10">
      <header className="border-b bg-white/95 backdrop-blur-sm sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="text-2xl font-bold text-primary hover:text-primary/80 transition-colors">Ada Papers</Link>
            <nav className="hidden md:flex items-center gap-6">
              {session ? (
                <>
                  <Link href="/client" className="hover:text-primary transition-colors">Dashboard</Link>
                  <Link href="/client/dossiers" className="hover:text-primary transition-colors">Mes dossiers</Link>
                </>
              ) : (
                <Link href="/" className="hover:text-primary transition-colors">Accueil</Link>
              )}
            </nav>
            {session ? (
              <Link href="/client" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                {session.user?.name || 'Mon compte'}
              </Link>
            ) : (
              <div className="flex gap-2">
                <Link href="/auth/signin" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                  Connexion
                </Link>
                <Link href="/auth/signup" className="text-sm text-primary hover:underline font-medium">
                  Inscription
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12 max-w-7xl">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <div className="inline-block mb-4 px-4 py-2 bg-primary/10 rounded-full border border-primary/20">
            <span className="text-sm font-medium text-primary">Nouvelle demande</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
            Créer une demande de dossier
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            {session 
              ? 'Remplissez le formulaire ci-dessous pour créer votre dossier'
              : 'Vous pouvez créer une demande de dossier même sans être inscrit. Remplissez le formulaire ci-dessous.'}
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-md">
            <p className="text-sm text-green-600">{success}</p>
          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Colonne gauche : Sélection des rubriques */}
          <div className="bg-white rounded-2xl shadow-xl p-8 space-y-8 border border-border/50">
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                  <span className="text-primary text-xl">📋</span>
                </div>
                <Label className="text-xl font-bold text-foreground">Sélectionnez votre besoin</Label>
              </div>
              <div className="space-y-4">
                {Object.entries(clientCategories).map(([key, category]) => (
                  <Fragment key={key}>
                    <button
                      type="button"
                      onClick={() => handleCategorySelect(key)}
                      className={`w-full p-6 rounded-xl border-2 transition-all duration-300 text-left group ${
                        selectedCategory === key
                          ? 'border-primary bg-primary/10 shadow-lg scale-[1.02]'
                          : 'border-border hover:border-primary/50 hover:bg-primary/5 hover:shadow-md'
                      }`}
                    >
                      <h3
                        className={`font-semibold text-lg mb-2 transition-colors ${
                          selectedCategory === key
                            ? 'text-primary'
                            : 'text-foreground group-hover:text-primary'
                        }`}
                      >
                        {category.label}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {category.options.length} option{category.options.length > 1 ? 's' : ''} disponible
                        {category.options.length > 1 ? 's' : ''}
                      </p>
                    </button>

                    {/* Afficher le bloc options juste après la catégorie cliquée */}
                    {selectedCategory === key && (
                      <div className="border-t pt-6">
                        <div className="flex items-center gap-3 mb-6">
                          <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                            <span className="text-primary text-xl">✓</span>
                          </div>
                          <Label className="text-xl font-bold text-foreground">
                            {category.label}
                          </Label>
                        </div>
                        <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
                          {category.options.map((option) => (
                            <label
                              key={option.value}
                              className={`flex items-start p-4 rounded-xl border-2 cursor-pointer transition-all duration-300 group ${
                                selectedOption === option.value
                                  ? 'border-primary bg-primary/10 shadow-md'
                                  : 'border-border hover:border-primary/50 hover:bg-primary/5'
                              }`}
                            >
                              <input
                                type="radio"
                                name="option"
                                value={option.value}
                                checked={selectedOption === option.value}
                                onChange={(e) => handleOptionSelect(e.target.value)}
                                className="mr-3 h-5 w-5 text-primary mt-0.5 flex-shrink-0 cursor-pointer"
                              />
                              <span
                                className={`text-sm leading-relaxed ${
                                  selectedOption === option.value
                                    ? 'text-foreground font-medium'
                                    : 'text-foreground'
                                }`}
                              >
                                {option.label}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </Fragment>
                ))}
              </div>
            </div>
          </div>

          {/* Colonne droite : Formulaire */}
          <div className="bg-white rounded-2xl shadow-xl p-8 border border-border/50">
            <form onSubmit={handleSubmit} className="space-y-8">
              {selectedOption ? (
                <>
                  <div>
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                        <span className="text-primary text-xl">📝</span>
                      </div>
                      <h3 className="text-xl font-bold text-foreground">Informations sur votre demande</h3>
                    </div>
                    
                    <div className="space-y-5">
                      <div>
                        <Label htmlFor="titre" className="text-base font-semibold mb-2 block">
                          Titre de votre demande
                        </Label>
                        <Input
                          id="titre"
                          value={formData.titre}
                          onChange={(e) => setFormData({ ...formData, titre: e.target.value })}
                          className="mt-1 h-12 text-base"
                          placeholder="Ex: Demande de titre de séjour étudiant"
                        />
                      </div>

                      <div>
                        <Label htmlFor="description" className="text-base font-semibold mb-2 block">
                          Description détaillée
                        </Label>
                        <Textarea
                          id="description"
                          value={formData.description}
                          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                          className="mt-1 min-h-[140px] text-base"
                          placeholder="Décrivez votre situation et vos besoins..."
                        />
                      </div>

                      {/* Champs spécifiques selon le type de demande */}
                      {getSpecificFields(selectedOption).map((field) => (
                        <div key={field.name}>
                          <Label htmlFor={field.name} className="text-base font-semibold mb-2 block">
                            {field.label}
                          </Label>
                          {field.type === 'textarea' ? (
                            <Textarea
                              id={field.name}
                              value={formData[field.name] || ''}
                              onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })}
                              className="mt-1 min-h-[100px] text-base"
                              placeholder={field.placeholder}
                            />
                          ) : field.type === 'select' ? (
                            <select
                              id={field.name}
                              value={formData[field.name] || ''}
                              onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })}
                              className="flex h-12 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            >
                              <option value="">Sélectionnez...</option>
                              {field.options?.map((opt) => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          ) : field.type === 'date' ? (
                            <Input
                              id={field.name}
                              type="date"
                              value={formData[field.name] || ''}
                              onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })}
                              className="mt-1 h-12 text-base"
                            />
                          ) : (
                            <Input
                              id={field.name}
                              type={field.type}
                              value={formData[field.name] || ''}
                              onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })}
                              className="mt-1 h-12 text-base"
                              placeholder={field.placeholder}
                            />
                          )}
                        </div>
                      ))}

                      {/* Date d'échéance générale */}
                      <div>
                        <Label htmlFor="dateEcheance" className="text-base font-semibold mb-2 block">
                          Date d'échéance (si applicable)
                        </Label>
                        <Input
                          id="dateEcheance"
                          type="date"
                          value={formData.dateEcheance || ''}
                          onChange={(e) => setFormData({ ...formData, dateEcheance: e.target.value })}
                          className="mt-1 h-12 text-base"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Informations du visiteur (si non connecté) */}
                  {!session && (
                    <div className="border-t pt-8">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                          <span className="text-primary text-xl">👤</span>
                        </div>
                        <h3 className="text-xl font-bold text-foreground">Vos coordonnées</h3>
                      </div>
                      <div className="grid md:grid-cols-2 gap-5">
                        <div>
                          <Label htmlFor="nom" className="text-base font-semibold mb-2 block">
                            Nom
                          </Label>
                          <Input
                            id="nom"
                            value={formData.nom}
                            onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                            className="mt-1 h-12 text-base"
                          />
                        </div>
                        <div>
                          <Label htmlFor="prenom" className="text-base font-semibold mb-2 block">
                            Prénom
                          </Label>
                          <Input
                            id="prenom"
                            value={formData.prenom}
                            onChange={(e) => setFormData({ ...formData, prenom: e.target.value })}
                            className="mt-1 h-12 text-base"
                          />
                        </div>
                        <div>
                          <Label htmlFor="email" className="text-base font-semibold mb-2 block">
                            Email
                          </Label>
                          <Input
                            id="email"
                            type="email"
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            className="mt-1 h-12 text-base"
                          />
                        </div>
                        <div>
                          <Label htmlFor="telephone" className="text-base font-semibold mb-2 block">
                            Téléphone
                          </Label>
                          <Input
                            id="telephone"
                            type="tel"
                            value={formData.telephone}
                            onChange={(e) => setFormData({ ...formData, telephone: e.target.value })}
                            className="mt-1 h-12 text-base"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end gap-4 pt-6 border-t">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => router.back()}
                      disabled={isSubmitting}
                      className="px-6 h-11"
                    >
                      Annuler
                    </Button>
                    <Button 
                      type="submit" 
                      disabled={isSubmitting}
                      className="px-8 h-11 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg hover:shadow-xl transition-all"
                    >
                      {isSubmitting ? (
                        <span className="flex items-center gap-2">
                          <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span>
                          Création en cours...
                        </span>
                      ) : (
                        'Créer la demande'
                      )}
                    </Button>
                  </div>
                </>
              ) : (
                <div className="text-center py-16">
                  <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                    <span className="text-4xl">📋</span>
                  </div>
                  <p className="text-lg text-muted-foreground font-medium">
                    Sélectionnez une catégorie et une option à gauche pour commencer
                  </p>
                </div>
              )}
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}


