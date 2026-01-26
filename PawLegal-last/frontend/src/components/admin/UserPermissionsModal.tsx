'use client';

import { useState, useEffect } from 'react';
import { permissionsAPI, userAPI } from '@/lib/api';

const DOMAINES = [
  { id: 'titres_sejour', label: 'Titres de séjour', icon: '📋' },
  { id: 'recours', label: 'Recours', icon: '⚖️' },
  { id: 'dossiers_clients', label: 'Dossiers clients', icon: '📁' },
  { id: 'paiements_facturation', label: 'Paiements / Facturation', icon: '💳' },
  { id: 'parametres_systeme', label: 'Paramètres du système', icon: '⚙️' },
  { id: 'outils_internes', label: 'Outils internes', icon: '🛠️' },
  { id: 'utilisateurs', label: 'Utilisateurs', icon: '👥' },
  { id: 'documents', label: 'Documents', icon: '📄' },
  { id: 'rendez_vous', label: 'Rendez-vous', icon: '📅' },
  { id: 'messages_contact', label: 'Messages de contact', icon: '📧' },
  { id: 'temoignages', label: 'Témoignages', icon: '⭐' },
  { id: 'logs', label: 'Logs', icon: '📊' }
];

const ROLES = [
  { id: 'client', label: 'Client', color: 'bg-blue-100 text-blue-800' },
  { id: 'admin', label: 'Admin', color: 'bg-green-100 text-green-800' },
  { id: 'superadmin', label: 'Super Admin', color: 'bg-purple-100 text-purple-800' },
  { id: 'avocat', label: 'Avocat', color: 'bg-orange-100 text-orange-800' },
  { id: 'juriste', label: 'Juriste', color: 'bg-indigo-100 text-indigo-800' },
  { id: 'assistant', label: 'Assistant', color: 'bg-yellow-100 text-yellow-800' },
  { id: 'comptable', label: 'Comptable', color: 'bg-pink-100 text-pink-800' },
  { id: 'secretaire', label: 'Secrétaire', color: 'bg-gray-100 text-gray-800' },
  { id: 'stagiaire', label: 'Stagiaire', color: 'bg-cyan-100 text-cyan-800' },
  { id: 'visiteur', label: 'Visiteur', color: 'bg-slate-100 text-slate-800' }
];

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
    isActive: true
  });

  // Rôles sélectionnés
  const [selectedRoles, setSelectedRoles] = useState<string[]>(['client']);

  // Permissions
  const [permissions, setPermissions] = useState<Permission[]>([]);

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
          isActive: user.isActive !== false
        });
      }

      if (permRes.data.success) {
        const perm = permRes.data.permission;
        setSelectedRoles(perm.roles || [userRes.data.user.role]);
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
      isActive: true
    });
    setSelectedRoles(['client']);
    setPermissions([]);
    setStep('info');
    setError(null);
  };

  const handleApplyPreset = (presetName: string) => {
    if (!presets || !presets[presetName]) return;
    
    const preset = presets[presetName];
    setSelectedRoles(preset.roles);
    setPermissions(preset.permissions);
  };

  const toggleRole = (roleId: string) => {
    setSelectedRoles(prev =>
      prev.includes(roleId)
        ? prev.filter(r => r !== roleId)
        : [...prev, roleId]
    );
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
        const updateData: any = {
          firstName: userInfo.firstName,
          lastName: userInfo.lastName,
          email: userInfo.email,
          phone: userInfo.phone,
          isActive: userInfo.isActive
        };
        
        if (userInfo.password) {
          updateData.password = userInfo.password;
        }

        await userAPI.updateUser(userId, updateData);
        await permissionsAPI.updatePermissions(userId, {
          roles: selectedRoles,
          permissions: permissions.filter(p => 
            p.consulter || p.modifier || p.nePasConsulter || p.nePasModifier || p.supprimer
          )
        });
      } else {
        // Création
        const userRes = await userAPI.createUser({
          ...userInfo,
          role: (selectedRoles[0] as 'client' | 'admin' | 'superadmin') || 'client'
        });

        if (userRes.data.success && userRes.data.user?._id) {
          await permissionsAPI.savePermissions({
            userId: userRes.data.user._id,
            roles: selectedRoles,
            permissions: permissions.filter(p => 
              p.consulter || p.modifier || p.nePasConsulter || p.nePasModifier || p.supprimer
            )
          });
        }
      }

      onSuccess();
      onClose();
      resetForm();
    } catch (err: any) {
      console.error('Erreur lors de la sauvegarde:', err);
      console.error('Détails de l\'erreur:', {
        status: err.response?.status,
        data: err.response?.data,
        errors: err.response?.data?.errors
      });
      
      // Afficher les détails de l'erreur
      if (err.response?.data?.errors && Array.isArray(err.response.data.errors)) {
        // Erreurs de validation express-validator
        const errorMessages = err.response.data.errors.map((e: any) => 
          `${e.param || e.field || 'Champ'}: ${e.msg || e.message || 'Erreur de validation'}`
        ).join(', ');
        setError(`Erreurs de validation: ${errorMessages}`);
      } else if (err.response?.data?.message) {
        setError(err.response.data.message);
      } else {
        setError(err.message || 'Erreur lors de la sauvegarde');
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="border-b p-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold">
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
        <div className="border-b p-4 bg-muted/30">
          <div className="flex items-center justify-center gap-4">
            {['info', 'roles', 'permissions', 'review'].map((s, idx) => (
              <div key={s} className="flex items-center gap-2">
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
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* Step 1: Informations utilisateur */}
          {step === 'info' && (
            <div className="space-y-4">
              <h3 className="text-xl font-bold mb-4">Informations de l'utilisateur</h3>
              <div className="grid grid-cols-2 gap-4">
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
              <div className="flex flex-wrap gap-2">
                {ROLES.map(role => (
                  <button
                    key={role.id}
                    onClick={() => toggleRole(role.id)}
                    className={`px-4 py-2 rounded-lg border-2 transition-colors ${
                      selectedRoles.includes(role.id)
                        ? `${role.color} border-current`
                        : 'bg-white border-border hover:border-primary'
                    }`}
                  >
                    {role.label}
                    {selectedRoles.includes(role.id) && ' ✓'}
                  </button>
                ))}
              </div>
              {selectedRoles.length === 0 && (
                <p className="text-sm text-red-600 mt-2">Veuillez sélectionner au moins un rôle</p>
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
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><strong>Nom:</strong> {userInfo.firstName} {userInfo.lastName}</div>
                  <div><strong>Email:</strong> {userInfo.email}</div>
                  <div><strong>Téléphone:</strong> {userInfo.phone || 'Non renseigné'}</div>
                  <div><strong>Statut:</strong> {userInfo.isActive ? 'Actif' : 'Inactif'}</div>
                </div>
              </div>

              {/* Rôles */}
              <div className="bg-muted/50 rounded-lg p-4">
                <h4 className="font-semibold mb-2">Rôles sélectionnés</h4>
                <div className="flex flex-wrap gap-2">
                  {selectedRoles.map(roleId => {
                    const role = ROLES.find(r => r.id === roleId);
                    return role ? (
                      <span key={roleId} className={`px-3 py-1 rounded-md text-sm ${role.color}`}>
                        {role.label}
                      </span>
                    ) : null;
                  })}
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
        <div className="border-t p-6 flex items-center justify-between">
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
}

