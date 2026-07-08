'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useSession } from 'next-auth/react';
import { permissionsAPI, userAPI } from '@/lib/api';

const DOMAINES = [
  { id: 'tableau_de_bord', label: 'Tableau de bord', icon: '📊' },
  { id: 'utilisateurs', label: 'Utilisateurs', icon: '👥' },
  { id: 'dossiers', label: 'Dossiers', icon: '📁' },
  { id: 'tarification', label: 'Dossiers tarification', icon: '💶' },
  { id: 'taches', label: 'Tâches', icon: '✅' },
  { id: 'rendez_vous', label: 'Rendez-vous', icon: '📅' },
  { id: 'creneaux', label: 'Créneaux', icon: '⏰' },
  { id: 'messages', label: 'Messages', icon: '💬' },
  { id: 'documents', label: 'Documents', icon: '📄' },
  { id: 'temoignages', label: 'Témoignages', icon: '⭐' },
  { id: 'notifications', label: 'Notifications', icon: '🔔' },
  { id: 'sms', label: 'SMS', icon: '📱' },
  { id: 'cms', label: 'CMS', icon: '✏️' },
  { id: 'logs', label: 'Logs', icon: '📋' },
  { id: 'corbeille', label: 'Corbeille', icon: '🗑️' }
];

const ROLES = [
  { id: 'client', label: 'Client', color: 'bg-slate-100 text-slate-800' },
  { id: 'superadmin', label: 'Super Admin', color: 'bg-purple-100 text-purple-800' },
  { id: 'admin', label: 'Admin', color: 'bg-green-100 text-green-800' },
  { id: 'assistant', label: 'Assistant', color: 'bg-indigo-100 text-indigo-800' },
  { id: 'comptable', label: 'Comptable', color: 'bg-amber-100 text-amber-800' },
  { id: 'secretaire', label: 'Secretaire', color: 'bg-cyan-100 text-cyan-800' },
  { id: 'juriste', label: 'Juriste', color: 'bg-emerald-100 text-emerald-800' },
  { id: 'stagiaire', label: 'Stagiaire', color: 'bg-lime-100 text-lime-800' },
  { id: 'visiteur', label: 'Visiteur', color: 'bg-zinc-100 text-zinc-800' },
  { id: 'partenaire', label: 'Partenaire', color: 'bg-blue-100 text-blue-800' },
];

// Catégories de compte (niveau supérieur). Les rôles « métier » (assistant,
// comptable, …) ne sont pas autonomes : ils sont présentés comme des sous-rôles
// de la catégorie « Administration ». Le rôle réellement stocké reste le
// sous-rôle (admin, assistant, …), l'interface /admin est partagée par tous.
const ACCOUNT_CATEGORIES = [
  { id: 'client', label: 'Client' },
  { id: 'administration', label: 'Administration' },
  { id: 'superadmin', label: 'Superadmin' },
  { id: 'partenaire', label: 'Partenaire' },
];

// Sous-rôles de la catégorie Administration (interface /admin identique).
const STAFF_SUBROLES = [
  { id: 'admin', label: 'Admin (complet)' },
  { id: 'assistant', label: 'Assistant' },
  { id: 'comptable', label: 'Comptable' },
  { id: 'secretaire', label: 'Secrétaire' },
  { id: 'juriste', label: 'Juriste' },
  { id: 'stagiaire', label: 'Stagiaire' },
  { id: 'visiteur', label: 'Visiteur' },
];

const STAFF_SUBROLE_IDS = STAFF_SUBROLES.map((s) => s.id);

// Détermine la catégorie de compte à partir d'un rôle stocké.
function getCategoryForRole(role?: string | null): string {
  const r = String(role || 'client').trim();
  if (r === 'superadmin') return 'superadmin';
  if (r === 'partenaire') return 'partenaire';
  if (STAFF_SUBROLE_IDS.includes(r)) return 'administration';
  return 'client';
}

interface Permission {
  domaine: string;
  consulter: boolean;
  modifier: boolean;
  nePasConsulter: boolean;
  nePasModifier: boolean;
  supprimer: boolean;
}

interface UserPermissionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId?: string | null;
  onSuccess: () => void;
}

export function UserPermissionsModal({ isOpen, onClose, userId, onSuccess }: UserPermissionsModalProps) {
  const { data: session } = useSession();
  const currentUserRole = (session?.user as any)?.role || 'client';
  const [isMounted, setIsMounted] = useState(false);
  const [step, setStep] = useState<'info' | 'roles' | 'permissions' | 'review'>('info');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [presets, setPresets] = useState<any>(null);

  // Informations utilisateur
  const [userInfo, setUserInfo] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    phone: '',
    isActive: true,
    partenaireInfo: {
      typeOrganisme: '' as 'consulat' | 'association' | 'avocat' | '',
      nomOrganisme: '',
      adresseOrganisme: '',
      contactPrincipal: ''
    }
  });

  // Rôles sélectionnés
  const [selectedRoles, setSelectedRoles] = useState<string[]>(['client']);

  // Permissions
  const [permissions, setPermissions] = useState<Permission[]>([]);
  
  // Filtrer les rôles disponibles selon le rôle de l'utilisateur connecté
  const getAvailableRoles = () => {
    if (currentUserRole === 'superadmin') {
      // Superadmin peut créer tous les rôles
      return ROLES;
    } else if (currentUserRole === 'admin') {
      // Admin peut créer/modifier tous les rôles métier et partenaire, sauf admin/superadmin.
      return ROLES.filter(role => role.id !== 'superadmin' && role.id !== 'admin');
    } else {
      // Autres rôles ne peuvent pas créer d'utilisateurs (ne devrait pas arriver)
      return ROLES.filter(role => role.id === 'client');
    }
  };
  
  const availableRoles = getAvailableRoles();

  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadPresets();
      if (userId) {
        loadUserData();
      } else {
        resetForm();
      }
    }
  }, [isOpen, userId]);

  const loadPresets = async () => {
    try {
      const response = await permissionsAPI.getPresets();
      if (response.data.success) {
        setPresets(response.data.presets);
      }
    } catch (err) {
      console.error('Erreur lors du chargement des modèles:', err);
    }
  };

  const loadUserData = async () => {
    if (!userId) return;
    setIsLoading(true);
    try {
      const [userRes, permRes] = await Promise.all([
        userAPI.getUserById(userId),
        permissionsAPI.getUserPermissions(userId)
      ]);

      if (userRes.data.success) {
        const user = userRes.data.user;
        setUserInfo({
          firstName: user.firstName || '',
          lastName: user.lastName || '',
          email: user.email || '',
          password: '',
          phone: user.phone || '',
          isActive: user.isActive !== false,
          partenaireInfo: user.partenaireInfo || {
            typeOrganisme: '',
            nomOrganisme: '',
            adresseOrganisme: '',
            contactPrincipal: ''
          }
        });
      }

      if (permRes.data.success) {
        const perm = permRes.data.permission;
        // Filtrer les rôles pour ne garder que ceux autorisés et disponibles pour l'utilisateur connecté
        const allowedRoleIds = availableRoles.map(r => r.id);
        const userRole = userRes.data.user.role;
        const rolesFromPerm = perm.roles || [];
        const allRoles = rolesFromPerm.length > 0 ? rolesFromPerm : [userRole];
        const filteredRoles = allRoles.filter((role: string) => allowedRoleIds.includes(role));
        setSelectedRoles(filteredRoles.length > 0 ? filteredRoles : ['client']);
        setPermissions(perm.permissions || []);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du chargement des données');
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setUserInfo({
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      phone: '',
      isActive: true,
      partenaireInfo: {
        typeOrganisme: '',
        nomOrganisme: '',
        adresseOrganisme: '',
        contactPrincipal: ''
      }
    });
    setSelectedRoles(['client']);
    setPermissions([]);
    setStep('info');
    setError(null);
  };

  const handleApplyPreset = (presetName: string) => {
    if (!presets || !presets[presetName]) return;
    
    const preset = presets[presetName];
    // Filtrer les rôles pour ne garder que ceux autorisés et disponibles pour l'utilisateur connecté
    const allowedRoleIds = availableRoles.map(r => r.id);
    const filteredRoles = (preset.roles || []).filter((role: string) => allowedRoleIds.includes(role));
    setSelectedRoles(filteredRoles.length > 0 ? filteredRoles : ['client']);
    setPermissions(preset.permissions);
  };

  // --- Modèle catégorie → sous-rôle -------------------------------------
  // Le rôle effectif est le premier (et unique) rôle sélectionné.
  const effectiveRole = selectedRoles[0] || 'client';
  const currentCategory = getCategoryForRole(effectiveRole);

  // Sous-rôles réellement proposables selon le rôle de l'utilisateur connecté.
  const availableSubRoles = STAFF_SUBROLES.filter((sr) =>
    availableRoles.some((r) => r.id === sr.id)
  );

  // Catégories proposables selon le rôle de l'utilisateur connecté.
  const availableCategories = ACCOUNT_CATEGORIES.filter((c) => {
    if (c.id === 'administration') return availableSubRoles.length > 0;
    return availableRoles.some((r) => r.id === c.id);
  });

  // Sélectionne un rôle unique et applique le preset de permissions associé.
  const selectSingleRole = (roleId: string) => {
    setSelectedRoles([roleId]);
    if (presets && presets[roleId] && Array.isArray(presets[roleId].permissions)) {
      setPermissions(presets[roleId].permissions);
    }
  };

  const handleCategoryChange = (categoryId: string) => {
    if (categoryId === 'administration') {
      // Sous-rôle par défaut : « Admin (complet) » si disponible, sinon le premier.
      const preferred = availableSubRoles.find((s) => s.id === 'admin') || availableSubRoles[0];
      if (preferred) selectSingleRole(preferred.id);
      return;
    }
    selectSingleRole(categoryId);
  };

  const updatePermission = (domaine: string, field: keyof Permission, value: boolean) => {
    setPermissions(prev => {
      const existing = prev.find(p => p.domaine === domaine);
      if (existing) {
        return prev.map(p =>
          p.domaine === domaine
            ? { ...p, [field]: value }
            : p
        );
      } else {
        return [...prev, {
          domaine,
          consulter: false,
          modifier: false,
          nePasConsulter: false,
          nePasModifier: false,
          supprimer: false,
          [field]: value
        }];
      }
    });
  };

  const getPermission = (domaine: string): Permission => {
    return permissions.find(p => p.domaine === domaine) || {
      domaine,
      consulter: false,
      modifier: false,
      nePasConsulter: false,
      nePasModifier: false,
      supprimer: false
    };
  };

  const handleSubmit = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Validation
      if (!userInfo.firstName || !userInfo.lastName || !userInfo.email) {
        setError('Veuillez remplir tous les champs obligatoires');
        setIsLoading(false);
        return;
      }

      if (!userId && !userInfo.password) {
        setError('Le mot de passe est requis pour la création');
        setIsLoading(false);
        return;
      }

      if (selectedRoles.length === 0) {
        setError('Veuillez sélectionner au moins un rôle');
        setIsLoading(false);
        return;
      }

      if (userId) {
        // Mise à jour
        const finalRole = selectedRoles.length > 0 ? selectedRoles[0] : 'client';
        const updateData: any = {
          firstName: userInfo.firstName,
          lastName: userInfo.lastName,
          email: userInfo.email,
          phone: userInfo.phone,
          isActive: userInfo.isActive,
          role: finalRole
        };
        
        if (userInfo.password) {
          updateData.password = userInfo.password;
        }

        // Ajouter les informations partenaire si le rôle est partenaire
        if (finalRole === 'partenaire') {
          updateData.partenaireInfo = {
            typeOrganisme: userInfo.partenaireInfo.typeOrganisme,
            nomOrganisme: userInfo.partenaireInfo.nomOrganisme || undefined,
            adresseOrganisme: userInfo.partenaireInfo.adresseOrganisme || undefined,
            contactPrincipal: userInfo.partenaireInfo.contactPrincipal || undefined
          };
        }

        await userAPI.updateUser(userId, updateData);
        
        // S'assurer que toutes les permissions pour tous les domaines sont envoyées
        const allPermissions = DOMAINES.map(domaine => {
          const existing = permissions.find(p => p.domaine === domaine.id);
          return existing || {
            domaine: domaine.id,
            consulter: false,
            modifier: false,
            nePasConsulter: false,
            nePasModifier: false,
            supprimer: false
          };
        });
        
        await permissionsAPI.updatePermissions(userId, {
          roles: selectedRoles,
          permissions: allPermissions
        });
      } else {
        // Création
        const finalRole = selectedRoles.length > 0 ? selectedRoles[0] : 'client';

        const createData: any = {
          firstName: userInfo.firstName,
          lastName: userInfo.lastName,
          email: userInfo.email,
          password: userInfo.password,
          phone: userInfo.phone || undefined,
          role: finalRole
        };
        
        // Ajouter les informations partenaire si le rôle est partenaire
        if (finalRole === 'partenaire' && userInfo.partenaireInfo.typeOrganisme) {
          createData.partenaireInfo = {
            typeOrganisme: userInfo.partenaireInfo.typeOrganisme,
            nomOrganisme: userInfo.partenaireInfo.nomOrganisme || undefined,
            adresseOrganisme: userInfo.partenaireInfo.adresseOrganisme || undefined,
            contactPrincipal: userInfo.partenaireInfo.contactPrincipal || undefined
          };
        }

        console.log('📤 Données de création envoyées:', {
          ...createData,
          password: createData.password ? '***' : 'MANQUANT'
        });

        const userRes = await userAPI.createUser(createData);

        if (userRes.data.success && userRes.data.user?._id) {
          let finalPermissions = permissions;

          // S'assurer que toutes les permissions pour tous les domaines sont envoyées
          const allPermissions = DOMAINES.map(domaine => {
            const existing = finalPermissions.find(p => p.domaine === domaine.id);
            return existing || {
              domaine: domaine.id,
              consulter: false,
              modifier: false,
              nePasConsulter: false,
              nePasModifier: false,
              supprimer: false
            };
          });
          
          await permissionsAPI.savePermissions({
            userId: userRes.data.user._id,
            roles: [finalRole],
            permissions: allPermissions
          });
        }
      }

      onSuccess();
      onClose();
      resetForm();
    } catch (err: any) {
      console.error('❌ Erreur lors de la sauvegarde:', err);
      console.error('Détails de l\'erreur:', {
        status: err.response?.status,
        statusText: err.response?.statusText,
        data: err.response?.data,
        errors: err.response?.data?.errors,
        error: err.response?.data?.error,
        message: err.message,
        stack: err.stack
      });
      
      // Afficher les détails de l'erreur
      if (err.response?.data?.errors && Array.isArray(err.response.data.errors)) {
        // Erreurs de validation express-validator
        const errorMessages = err.response.data.errors.map((e: any) => 
          `${e.param || e.field || e.domaine || e.role || 'Champ'}: ${e.msg || e.message || 'Erreur de validation'}`
        ).join(', ');
        console.error('Erreurs de validation détaillées:', err.response.data.errors);
        setError(`Erreurs de validation: ${errorMessages}`);
      } else if (err.response?.data?.error) {
        console.error('Message d\'erreur:', err.response.data.error);
        setError(err.response.data.error);
      } else if (err.response?.data?.message) {
        console.error('Message d\'erreur:', err.response.data.message);
        setError(err.response.data.message);
      } else {
        console.error('Erreur générique:', err.message);
        setError(err.message || 'Erreur lors de la sauvegarde');
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen || !isMounted) return null;

  const modalContent = (
    <div className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-black/50 p-3 backdrop-blur-sm sm:items-center sm:p-6">
      <div className="my-4 flex max-h-[calc(100dvh-2rem)] w-[min(96vw,1100px)] min-w-0 flex-col overflow-hidden rounded-xl bg-white shadow-2xl sm:my-0 sm:max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-4 sm:px-6 sm:py-5">
          <h2 className="text-xl font-bold sm:text-2xl">
            {userId ? 'Modifier utilisateur' : 'Créer un utilisateur'}
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-2xl"
          >
            ×
          </button>
        </div>

        {/* Steps */}
        <div className="border-b bg-muted/30 px-3 py-3 sm:px-4 sm:py-4">
          <div className="flex items-center justify-start gap-3 overflow-x-auto sm:justify-center sm:gap-4">
            {['info', 'roles', 'permissions', 'review'].map((s, idx) => (
              <div key={s} className="flex flex-shrink-0 items-center gap-2">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold ${
                    step === s
                      ? 'bg-primary text-white'
                      : idx < ['info', 'roles', 'permissions', 'review'].indexOf(step)
                      ? 'bg-green-500 text-white'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {idx + 1}
                </div>
                <span className={`text-sm font-medium ${
                  step === s ? 'text-primary' : 'text-muted-foreground'
                }`}>
                  {s === 'info' ? 'Informations' : s === 'roles' ? 'Rôles' : s === 'permissions' ? 'Permissions' : 'Aperçu'}
                </span>
                {idx < 3 && <span className="text-muted-foreground mx-2">→</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* Step 1: Informations utilisateur */}
          {step === 'info' && (
            <div className="space-y-4">
              <h3 className="text-xl font-bold mb-4">Informations de l'utilisateur</h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm font-semibold mb-2 block">Prénom *</label>
                  <input
                    type="text"
                    value={userInfo.firstName}
                    onChange={(e) => setUserInfo({ ...userInfo, firstName: e.target.value })}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold mb-2 block">Nom *</label>
                  <input
                    type="text"
                    value={userInfo.lastName}
                    onChange={(e) => setUserInfo({ ...userInfo, lastName: e.target.value })}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold mb-2 block">Email *</label>
                  <input
                    type="email"
                    value={userInfo.email}
                    onChange={(e) => setUserInfo({ ...userInfo, email: e.target.value })}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold mb-2 block">Téléphone</label>
                  <input
                    type="tel"
                    value={userInfo.phone}
                    onChange={(e) => setUserInfo({ ...userInfo, phone: e.target.value })}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
                {!userId && (
                  <div>
                    <label className="text-sm font-semibold mb-2 block">Mot de passe *</label>
                    <input
                      type="password"
                      value={userInfo.password}
                      onChange={(e) => setUserInfo({ ...userInfo, password: e.target.value })}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      required={!userId}
                      minLength={8}
                      placeholder="Minimum 8 caractères"
                    />
                  </div>
                )}
                <div>
                  <label className="text-sm font-semibold mb-2 block">Statut</label>
                  <select
                    value={userInfo.isActive ? 'active' : 'inactive'}
                    onChange={(e) => setUserInfo({ ...userInfo, isActive: e.target.value === 'active' })}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="active">Actif</option>
                    <option value="inactive">Inactif</option>
                  </select>
                </div>
              </div>
              
              {/* Champs spécifiques pour les partenaires */}
              {selectedRoles.includes('partenaire') && (
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <h4 className="text-lg font-semibold mb-4">Informations du partenaire</h4>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className="text-sm font-semibold mb-2 block">Type d'organisme *</label>
                      <select
                        value={userInfo.partenaireInfo.typeOrganisme}
                        onChange={(e) => setUserInfo({ 
                          ...userInfo, 
                          partenaireInfo: { 
                            ...userInfo.partenaireInfo, 
                            typeOrganisme: e.target.value as 'consulat' | 'association' | 'avocat' | ''
                          } 
                        })}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        required
                      >
                        <option value="">-- Sélectionner --</option>
                        <option value="consulat">Consulat</option>
                        <option value="association">Association</option>
                        <option value="avocat">Avocat</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm font-semibold mb-2 block">Nom de l'organisme *</label>
                      <input
                        type="text"
                        value={userInfo.partenaireInfo.nomOrganisme}
                        onChange={(e) => setUserInfo({ 
                          ...userInfo, 
                          partenaireInfo: { 
                            ...userInfo.partenaireInfo, 
                            nomOrganisme: e.target.value 
                          } 
                        })}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        required={selectedRoles.includes('partenaire')}
                        placeholder="Ex: Consulat de France à..."
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="text-sm font-semibold mb-2 block">Adresse de l'organisme</label>
                      <input
                        type="text"
                        value={userInfo.partenaireInfo.adresseOrganisme}
                        onChange={(e) => setUserInfo({ 
                          ...userInfo, 
                          partenaireInfo: { 
                            ...userInfo.partenaireInfo, 
                            adresseOrganisme: e.target.value 
                          } 
                        })}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        placeholder="Adresse complète"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="text-sm font-semibold mb-2 block">Contact principal</label>
                      <input
                        type="text"
                        value={userInfo.partenaireInfo.contactPrincipal}
                        onChange={(e) => setUserInfo({ 
                          ...userInfo, 
                          partenaireInfo: { 
                            ...userInfo.partenaireInfo, 
                            contactPrincipal: e.target.value 
                          } 
                        })}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        placeholder="Nom du contact principal"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Rôles */}
          {step === 'roles' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold">Rôles</h3>
                {presets && (
                  <div className="flex gap-2">
                    <span className="text-sm text-muted-foreground">Modèles rapides:</span>
                    {Object.keys(presets).map(presetName => (
                      <button
                        key={presetName}
                        onClick={() => handleApplyPreset(presetName)}
                        className="px-3 py-1 text-xs bg-muted hover:bg-accent rounded-md"
                      >
                        {presetName}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm font-semibold mb-2 block">
                    Catégorie de compte <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={currentCategory}
                    onChange={(e) => handleCategoryChange(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    {availableCategories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground mt-1">
                    Détermine l'espace de l'utilisateur (client, administration, partenaire).
                  </p>
                </div>

                {/* Sous-rôle : uniquement pour la catégorie Administration */}
                {currentCategory === 'administration' && (
                  <div>
                    <label className="text-sm font-semibold mb-2 block">
                      Sous-rôle (Administration) <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={effectiveRole}
                      onChange={(e) => selectSingleRole(e.target.value)}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      {availableSubRoles.map((sr) => (
                        <option key={sr.id} value={sr.id}>
                          {sr.label}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-muted-foreground mt-1">
                      Même interface d'administration ; seules les permissions par défaut changent.
                    </p>
                  </div>
                )}
              </div>

              {currentCategory === 'administration' && (
                <div className="mt-3 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                  Les sous-rôles (Assistant, Comptable, Secrétaire, Juriste, Stagiaire, Visiteur)
                  partagent l'interface d'administration. Le sous-rôle applique un modèle de
                  permissions par défaut, que vous pouvez ensuite ajuster à l'étape suivante.
                </div>
              )}

              {currentUserRole === 'admin' && (
                <p className="text-sm text-muted-foreground mt-2">
                  Note : en tant qu'admin, vous pouvez attribuer les sous-rôles métier
                  (assistant, comptable, secrétaire, juriste, stagiaire, visiteur), mais pas
                  « Admin (complet) » ni « Superadmin ».
                </p>
              )}

              {/* Choix rapide du type d’organisme quand le rôle Partenaire est sélectionné */}
              {selectedRoles.includes('partenaire') && (
                <div className="mt-4 pt-4 border-t border-gray-200 space-y-2">
                  <p className="text-sm font-semibold text-foreground">
                    Nature du partenaire <span className="text-red-500">*</span>
                  </p>
                  <p className="text-xs text-muted-foreground mb-1">
                    Précisez s’il s’agit d’un consulat, d’une association ou d’un avocat. Cette information sera enregistrée dans
                    le compte partenaire.
                  </p>
                  <select
                    value={userInfo.partenaireInfo.typeOrganisme}
                    onChange={(e) =>
                      setUserInfo({
                        ...userInfo,
                        partenaireInfo: {
                          ...userInfo.partenaireInfo,
                          typeOrganisme: e.target.value as 'consulat' | 'association' | 'avocat' | '',
                        },
                      })
                    }
                    className="flex h-10 w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm"
                    required
                  >
                    <option value="">-- Sélectionner --</option>
                    <option value="consulat">Consulat</option>
                    <option value="association">Association</option>
                    <option value="avocat">Avocat</option>
                  </select>
                  {!userInfo.partenaireInfo.typeOrganisme && (
                    <p className="text-xs text-red-600">
                      Ce champ est obligatoire pour les comptes partenaire.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 3: Permissions détaillées */}
          {step === 'permissions' && (
            <div className="space-y-4">
              <h3 className="text-xl font-bold mb-4">Permissions détaillées</h3>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3 font-semibold">Domaine</th>
                      <th className="text-center p-3 font-semibold">Consulter</th>
                      <th className="text-center p-3 font-semibold">Modifier</th>
                      <th className="text-center p-3 font-semibold">Ne pas consulter</th>
                      <th className="text-center p-3 font-semibold">Ne pas modifier</th>
                      <th className="text-center p-3 font-semibold">Supprimer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DOMAINES.map(domaine => {
                      const perm = getPermission(domaine.id);
                      return (
                        <tr key={domaine.id} className="border-b hover:bg-muted/50">
                          <td className="p-3">
                            <span className="mr-2">{domaine.icon}</span>
                            {domaine.label}
                          </td>
                          <td className="text-center p-3">
                            <input
                              type="checkbox"
                              checked={perm.consulter}
                              onChange={(e) => {
                                updatePermission(domaine.id, 'consulter', e.target.checked);
                                if (e.target.checked) {
                                  updatePermission(domaine.id, 'nePasConsulter', false);
                                }
                              }}
                              disabled={perm.nePasConsulter}
                            />
                          </td>
                          <td className="text-center p-3">
                            <input
                              type="checkbox"
                              checked={perm.modifier}
                              onChange={(e) => {
                                updatePermission(domaine.id, 'modifier', e.target.checked);
                                if (e.target.checked) {
                                  updatePermission(domaine.id, 'nePasModifier', false);
                                }
                              }}
                              disabled={perm.nePasModifier || !perm.consulter}
                            />
                          </td>
                          <td className="text-center p-3">
                            <input
                              type="checkbox"
                              checked={perm.nePasConsulter}
                              onChange={(e) => {
                                updatePermission(domaine.id, 'nePasConsulter', e.target.checked);
                                if (e.target.checked) {
                                  updatePermission(domaine.id, 'consulter', false);
                                  updatePermission(domaine.id, 'modifier', false);
                                }
                              }}
                            />
                          </td>
                          <td className="text-center p-3">
                            <input
                              type="checkbox"
                              checked={perm.nePasModifier}
                              onChange={(e) => {
                                updatePermission(domaine.id, 'nePasModifier', e.target.checked);
                                if (e.target.checked) {
                                  updatePermission(domaine.id, 'modifier', false);
                                }
                              }}
                              disabled={!perm.consulter}
                            />
                          </td>
                          <td className="text-center p-3">
                            <input
                              type="checkbox"
                              checked={perm.supprimer}
                              onChange={(e) => updatePermission(domaine.id, 'supprimer', e.target.checked)}
                              disabled={!perm.modifier || !perm.consulter}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Step 4: Aperçu */}
          {step === 'review' && (
            <div className="space-y-6">
              <h3 className="text-xl font-bold mb-4">Récapitulatif</h3>
              
              {/* Informations utilisateur */}
              <div className="bg-muted/50 rounded-lg p-4">
                <h4 className="font-semibold mb-2">Informations</h4>
                <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
                  <div><strong>Nom:</strong> {userInfo.firstName} {userInfo.lastName}</div>
                  <div><strong>Email:</strong> {userInfo.email}</div>
                  <div><strong>Téléphone:</strong> {userInfo.phone || 'Non renseigné'}</div>
                  <div><strong>Statut:</strong> {userInfo.isActive ? 'Actif' : 'Inactif'}</div>
                </div>
              </div>

              {/* Rôle */}
              <div className="bg-muted/50 rounded-lg p-4">
                <h4 className="font-semibold mb-2">Rôle</h4>
                <div className="flex flex-wrap items-center gap-2">
                  {(() => {
                    const category = ACCOUNT_CATEGORIES.find((c) => c.id === currentCategory);
                    const role = availableRoles.find((r) => r.id === effectiveRole) || ROLES.find((r) => r.id === effectiveRole);
                    return (
                      <>
                        <span className="px-3 py-1 rounded-md text-sm bg-slate-100 text-slate-800">
                          {category?.label || 'Client'}
                        </span>
                        {currentCategory === 'administration' && role && (
                          <>
                            <span className="text-muted-foreground">·</span>
                            <span className={`px-3 py-1 rounded-md text-sm ${role.color}`}>
                              {STAFF_SUBROLES.find((s) => s.id === effectiveRole)?.label || role.label}
                            </span>
                          </>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Permissions actives */}
              <div className="bg-muted/50 rounded-lg p-4">
                <h4 className="font-semibold mb-2">Permissions accordées</h4>
                <div className="space-y-2 text-sm">
                  {permissions.filter(p => 
                    p.consulter || p.modifier || p.supprimer
                  ).map(perm => {
                    const domaine = DOMAINES.find(d => d.id === perm.domaine);
                    const actions: string[] = [];
                    if (perm.consulter) actions.push('Consulter');
                    if (perm.modifier) actions.push('Modifier');
                    if (perm.supprimer) actions.push('Supprimer');
                    
                    return domaine ? (
                      <div key={perm.domaine} className="flex items-center justify-between">
                        <span>{domaine.icon} {domaine.label}</span>
                        <span className="text-muted-foreground">{actions.join(', ')}</span>
                      </div>
                    ) : null;
                  })}
                  {permissions.filter(p => p.consulter || p.modifier || p.supprimer).length === 0 && (
                    <p className="text-muted-foreground">Aucune permission spécifique accordée</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t px-4 py-4 sm:px-6 sm:py-5">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-input rounded-md hover:bg-accent"
          >
            Annuler
          </button>
          <div className="flex gap-2">
            {step !== 'info' && (
              <button
                onClick={() => {
                  const steps = ['info', 'roles', 'permissions', 'review'];
                  setStep(steps[steps.indexOf(step) - 1] as any);
                }}
                className="px-4 py-2 border border-input rounded-md hover:bg-accent"
              >
                Précédent
              </button>
            )}
            {step !== 'review' ? (
              <button
                onClick={() => {
                  if (step === 'info' && (!userInfo.firstName || !userInfo.lastName || !userInfo.email || (!userId && !userInfo.password))) {
                    setError('Veuillez remplir tous les champs obligatoires');
                    return;
                  }
                  if (step === 'roles' && selectedRoles.length === 0) {
                    setError('Veuillez sélectionner au moins un rôle');
                    return;
                  }
                  const steps = ['info', 'roles', 'permissions', 'review'];
                  setStep(steps[steps.indexOf(step) + 1] as any);
                  setError(null);
                }}
                className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90"
              >
                Suivant
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={isLoading}
                className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 disabled:opacity-50"
              >
                {isLoading ? 'Enregistrement...' : userId ? 'Mettre à jour' : 'Créer l\'utilisateur'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

