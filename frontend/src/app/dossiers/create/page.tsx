'use client';

import { useState, useEffect, useRef } from 'react';
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
      className={`flex min-h-[96px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
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
    label: 'Je veux être accompagné',
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
  const [selectedCategory, setSelectedCategory] = useState<string>('accompagnement');
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

  const categoryEntries = Object.entries(clientCategories);
  const activeCategory =
    clientCategories[selectedCategory as keyof typeof clientCategories] ?? clientCategories.accompagnement;
  const backHref = session ? '/client/dossiers' : '/';

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="text-lg font-bold text-primary hover:text-primary/80 transition-colors">
            Ada Papers
          </Link>
          <nav className="hidden items-center gap-4 text-sm md:flex">
            {session ? (
              <>
                <Link href="/client" className="text-muted-foreground hover:text-primary transition-colors">
                  Dashboard
                </Link>
                <Link href="/client/dossiers" className="text-muted-foreground hover:text-primary transition-colors">
                  Mes dossiers
                </Link>
              </>
            ) : (
              <Link href="/" className="text-muted-foreground hover:text-primary transition-colors">
                Accueil
              </Link>
            )}
          </nav>
          {session ? (
            <Link href="/client" className="text-sm text-muted-foreground hover:text-primary transition-colors">
              {session.user?.name || 'Mon compte'}
            </Link>
          ) : (
            <div className="flex items-center gap-3 text-sm">
              <Link href="/auth/signin" className="text-muted-foreground hover:text-primary transition-colors">
                Connexion
              </Link>
              <Link href="/auth/signup" className="font-medium text-primary hover:underline">
                Inscription
              </Link>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-4 sm:py-6">
        <div className="mb-4 flex flex-col gap-3 sm:mb-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <Link
              href={backHref}
              className="mb-2 inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary/80"
            >
              <span aria-hidden>←</span>
              Retour
            </Link>
            <h1 className="text-2xl font-bold text-foreground sm:text-3xl">Nouvelle demande</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {session
                ? 'Choisissez le type de demande puis complétez le formulaire.'
                : 'Création possible sans compte : type de demande puis formulaire.'}
            </p>
          </div>
        </div>

        {error ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        ) : null}

        {success ? (
          <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-3 py-2.5">
            <p className="text-sm text-green-600">{success}</p>
          </div>
        ) : null}

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="grid lg:grid-cols-[minmax(300px,360px)_1fr] lg:divide-x lg:divide-gray-100">
            <aside className="border-b border-gray-100 p-4 sm:p-5 lg:sticky lg:top-[57px] lg:self-start lg:max-h-[calc(100dvh-5rem)] lg:overflow-y-auto lg:border-b-0">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Type de demande
              </p>
              <div
                className="mb-4 grid grid-cols-3 gap-1 rounded-lg border border-gray-100 bg-gray-50/80 p-1"
                role="tablist"
                aria-label="Rubriques de demande"
              >
                {categoryEntries.map(([key, category]) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={selectedCategory === key}
                    onClick={() => handleCategorySelect(key)}
                    className={`min-w-0 rounded-md px-1.5 py-2 text-center text-[10px] font-semibold leading-tight break-words transition-colors sm:px-2 sm:text-[11px] ${
                      selectedCategory === key
                        ? 'bg-white text-primary shadow-sm ring-1 ring-gray-200'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {category.label}
                  </button>
                ))}
              </div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Option</p>
              <div className="max-h-64 space-y-1 overflow-y-auto pr-0.5">
                {activeCategory.options.map((option) => (
                  <label
                    key={option.value}
                    className={`flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2 text-sm transition-colors ${
                      selectedOption === option.value
                        ? 'border-primary/40 bg-primary/5 text-foreground'
                        : 'border-transparent hover:border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="option"
                      value={option.value}
                      checked={selectedOption === option.value}
                      onChange={(e) => handleOptionSelect(e.target.value)}
                      className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer text-primary"
                    />
                    <span className="leading-snug">{option.label}</span>
                  </label>
                ))}
              </div>
            </aside>

            <section className="p-4 sm:p-5">
              <form onSubmit={handleSubmit} className="space-y-5">
                {selectedOption ? (
                  <>
                    <div>
                      <h2 className="text-base font-semibold text-foreground">Détails de la demande</h2>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Les champs utiles à votre situation peuvent rester vides.
                      </p>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <Label htmlFor="titre" className="mb-1 block text-sm font-medium">
                          Titre de votre demande
                        </Label>
                        <Input
                          id="titre"
                          value={formData.titre}
                          onChange={(e) => setFormData({ ...formData, titre: e.target.value })}
                          className="h-9 text-sm"
                          placeholder="Ex. Demande de titre de séjour étudiant"
                        />
                      </div>

                      <div>
                        <Label htmlFor="description" className="mb-1 block text-sm font-medium">
                          Description
                        </Label>
                        <Textarea
                          id="description"
                          value={formData.description}
                          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                          className="min-h-[88px] text-sm"
                          placeholder="Décrivez votre situation et vos besoins..."
                        />
                      </div>

                      {getSpecificFields(selectedOption).length > 0 ? (
                        <div className="grid gap-3 sm:grid-cols-2">
                          {getSpecificFields(selectedOption).map((field) => (
                            <div
                              key={field.name}
                              className={field.type === 'textarea' ? 'sm:col-span-2' : undefined}
                            >
                              <Label htmlFor={field.name} className="mb-1 block text-sm font-medium">
                                {field.label}
                              </Label>
                              {field.type === 'textarea' ? (
                                <Textarea
                                  id={field.name}
                                  value={formData[field.name] || ''}
                                  onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })}
                                  className="min-h-[80px] text-sm"
                                  placeholder={field.placeholder}
                                />
                              ) : field.type === 'select' ? (
                                <select
                                  id={field.name}
                                  value={formData[field.name] || ''}
                                  onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })}
                                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                >
                                  <option value="">Sélectionnez...</option>
                                  {field.options?.map((opt) => (
                                    <option key={opt} value={opt}>
                                      {opt}
                                    </option>
                                  ))}
                                </select>
                              ) : field.type === 'date' ? (
                                <Input
                                  id={field.name}
                                  type="date"
                                  value={formData[field.name] || ''}
                                  onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })}
                                  className="h-9 text-sm"
                                />
                              ) : (
                                <Input
                                  id={field.name}
                                  type={field.type}
                                  value={formData[field.name] || ''}
                                  onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })}
                                  className="h-9 text-sm"
                                  placeholder={field.placeholder}
                                />
                              )}
                            </div>
                          ))}
                        </div>
                      ) : null}

                      <div>
                        <Label htmlFor="dateEcheance" className="mb-1 block text-sm font-medium">
                          Date d'échéance (si applicable)
                        </Label>
                        <Input
                          id="dateEcheance"
                          type="date"
                          value={formData.dateEcheance || ''}
                          onChange={(e) => setFormData({ ...formData, dateEcheance: e.target.value })}
                          className="h-9 text-sm"
                        />
                      </div>
                    </div>

                    {!session ? (
                      <div className="border-t border-gray-100 pt-4">
                        <h3 className="mb-3 text-sm font-semibold text-foreground">Vos coordonnées</h3>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <Label htmlFor="nom" className="mb-1 block text-sm font-medium">
                              Nom
                            </Label>
                            <Input
                              id="nom"
                              value={formData.nom}
                              onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                              className="h-9 text-sm"
                            />
                          </div>
                          <div>
                            <Label htmlFor="prenom" className="mb-1 block text-sm font-medium">
                              Prénom
                            </Label>
                            <Input
                              id="prenom"
                              value={formData.prenom}
                              onChange={(e) => setFormData({ ...formData, prenom: e.target.value })}
                              className="h-9 text-sm"
                            />
                          </div>
                          <div>
                            <Label htmlFor="email" className="mb-1 block text-sm font-medium">
                              Email
                            </Label>
                            <Input
                              id="email"
                              type="email"
                              value={formData.email}
                              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                              className="h-9 text-sm"
                            />
                          </div>
                          <div>
                            <Label htmlFor="telephone" className="mb-1 block text-sm font-medium">
                              Téléphone
                            </Label>
                            <Input
                              id="telephone"
                              type="tel"
                              value={formData.telephone}
                              onChange={(e) => setFormData({ ...formData, telephone: e.target.value })}
                              className="h-9 text-sm"
                            />
                          </div>
                        </div>
                      </div>
                    ) : null}

                    <div className="sticky bottom-0 -mx-4 flex flex-col-reverse gap-2 border-t border-gray-100 bg-white/95 px-4 py-3 backdrop-blur-sm sm:static sm:mx-0 sm:flex-row sm:justify-end sm:border-0 sm:bg-transparent sm:px-0 sm:pt-2 sm:backdrop-blur-none">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => router.back()}
                        disabled={isSubmitting}
                        className="h-9 px-4"
                      >
                        Annuler
                      </Button>
                      <Button type="submit" disabled={isSubmitting} className="h-9 px-5">
                        {isSubmitting ? (
                          <span className="flex items-center gap-2">
                            <span className="h-4 w-4 animate-spin rounded-full border-b-2 border-white" />
                            Création...
                          </span>
                        ) : (
                          'Créer la demande'
                        )}
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Sélectionnez une option à gauche pour afficher le formulaire.
                  </p>
                )}
              </form>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
