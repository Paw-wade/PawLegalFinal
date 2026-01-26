'use client';

import { useEffect, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { userAPI } from '@/lib/api';
import { UserPermissionsModal } from '@/components/admin/UserPermissionsModal';
import jsPDF from 'jspdf';
import { DateInput as DateInputComponent } from '@/components/ui/DateInput';

function Button({ children, variant = 'default', size = 'default', className = '', ...props }: any) {
  const baseClasses = 'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none';
  const variantClasses = {
    default: 'bg-primary text-white hover:bg-primary/90',
    outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
    destructive: 'bg-red-500 text-white hover:bg-red-600',
  };
  const sizeClasses = {
    default: 'h-10 py-2 px-4',
    sm: 'h-9 px-3',
    lg: 'h-11 px-8',
    icon: 'h-10 w-10',
  };
  return <button className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`} {...props}>{children}</button>;
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
      className={`flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
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

// Fonction pour télécharger la fiche utilisateur en PDF
const downloadUserProfile = (user: any) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let yPosition = 20;
  const margin = 20;
  const lineHeight = 7;
  const sectionSpacing = 10;

  // Fonction helper pour ajouter du texte avec gestion de la pagination
  const addText = (text: string, x: number, y: number, options: any = {}): number => {
    let currentY = y;
    if (currentY > pageHeight - 30) {
      doc.addPage();
      currentY = margin;
    }
    doc.text(text, x, currentY, options);
    return currentY;
  };

  // En-tête
  doc.setFontSize(18);
  doc.setTextColor(255, 102, 0); // Orange
  yPosition = addText('PAW LEGAL', margin, yPosition);
  doc.setFontSize(16);
  doc.setTextColor(0, 0, 0);
  yPosition += lineHeight;
  yPosition = addText('FICHE UTILISATEUR', margin, yPosition);
  
  // Ligne de séparation
  yPosition += 5;
  doc.setDrawColor(255, 102, 0);
  doc.setLineWidth(0.5);
  doc.line(margin, yPosition, pageWidth - margin, yPosition);
  yPosition += sectionSpacing;

  // Informations personnelles
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  yPosition = addText('INFORMATIONS PERSONNELLES', margin, yPosition);
  yPosition += 3;
  
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  yPosition = addText(`Nom complet: ${user.firstName || ''} ${user.lastName || ''}`, margin, yPosition);
  yPosition += lineHeight;
  yPosition = addText(`Email: ${user.email || '-'}`, margin, yPosition);
  yPosition += lineHeight;
  yPosition = addText(`Téléphone: ${user.phone || '-'}`, margin, yPosition);
  yPosition += lineHeight;
  yPosition = addText(`Rôle: ${user.role || 'client'}`, margin, yPosition);
  yPosition += lineHeight;
  yPosition = addText(`Date de naissance: ${user.dateNaissance ? new Date(user.dateNaissance).toLocaleDateString('fr-FR') : '-'}`, margin, yPosition);
  yPosition += lineHeight;
  yPosition = addText(`Lieu de naissance: ${user.lieuNaissance || '-'}`, margin, yPosition);
  yPosition += lineHeight;
  yPosition = addText(`Nationalité: ${user.nationalite || '-'}`, margin, yPosition);
  yPosition += lineHeight;
  yPosition = addText(`Sexe: ${user.sexe || '-'}`, margin, yPosition);
  yPosition += sectionSpacing;

  // Informations sur le titre de séjour
  if (user.numeroTitre || user.typeTitre || user.dateDelivrance || user.dateExpiration) {
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    yPosition = addText('TITRE DE SÉJOUR', margin, yPosition);
    yPosition += 3;
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    yPosition = addText(`Numéro étranger: ${user.numeroEtranger || '-'}`, margin, yPosition);
    yPosition += lineHeight;
    yPosition = addText(`Numéro titre: ${user.numeroTitre || '-'}`, margin, yPosition);
    yPosition += lineHeight;
    yPosition = addText(`Type titre: ${user.typeTitre || '-'}`, margin, yPosition);
    yPosition += lineHeight;
    yPosition = addText(`Date délivrance: ${user.dateDelivrance ? new Date(user.dateDelivrance).toLocaleDateString('fr-FR') : '-'}`, margin, yPosition);
    yPosition += lineHeight;
    yPosition = addText(`Date expiration: ${user.dateExpiration ? new Date(user.dateExpiration).toLocaleDateString('fr-FR') : '-'}`, margin, yPosition);
    yPosition += sectionSpacing;
  }

  // Adresse
  if (user.adressePostale || user.ville || user.codePostal || user.pays) {
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    yPosition = addText('ADRESSE', margin, yPosition);
    yPosition += 3;
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    yPosition = addText(`Adresse postale: ${user.adressePostale || '-'}`, margin, yPosition);
    yPosition += lineHeight;
    yPosition = addText(`Ville: ${user.ville || '-'}`, margin, yPosition);
    yPosition += lineHeight;
    yPosition = addText(`Code postal: ${user.codePostal || '-'}`, margin, yPosition);
    yPosition += lineHeight;
    yPosition = addText(`Pays: ${user.pays || 'France'}`, margin, yPosition);
    yPosition += sectionSpacing;
  }

  // Informations du compte
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  yPosition = addText('INFORMATIONS DU COMPTE', margin, yPosition);
  yPosition += 3;
  
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  yPosition = addText(`Profil complet: ${user.profilComplete ? 'Oui' : 'Non'}`, margin, yPosition);
  yPosition += lineHeight;
  yPosition = addText(`Compte actif: ${user.isActive !== false ? 'Oui' : 'Non'}`, margin, yPosition);
  yPosition += lineHeight;
  yPosition = addText(`Date d'inscription: ${user.createdAt ? new Date(user.createdAt).toLocaleDateString('fr-FR') : '-'}`, margin, yPosition);
  yPosition += lineHeight;
  yPosition = addText(`Dernière mise à jour: ${user.updatedAt ? new Date(user.updatedAt).toLocaleDateString('fr-FR') : '-'}`, margin, yPosition);

  // Pied de page
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);
    doc.text(
      `Page ${i} sur ${totalPages} - Généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`,
      pageWidth / 2,
      pageHeight - 10,
      { align: 'center' }
    );
  }

  // Télécharger le PDF
  const fileName = `Fiche_Utilisateur_${user.firstName}_${user.lastName}_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
};

function Modal({ isOpen, onClose, userId, onUpdate }: { isOpen: boolean; onClose: () => void; userId: string | null; onUpdate: () => void }) {
  const { data: session } = useSession();
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<any>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && userId) {
      loadUser();
    } else {
      setUser(null);
      setFormData({});
      setIsEditing(false);
      setError(null);
      setSuccess(null);
    }
  }, [isOpen, userId]);

  const loadUser = async () => {
    if (!userId) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await userAPI.getUserById(userId);
      if (response.data.success) {
        const userData = response.data.user;
        setUser(userData);
        setFormData({
          firstName: userData.firstName || '',
          lastName: userData.lastName || '',
          email: userData.email || '',
          phone: userData.phone || '',
          role: userData.role || 'client',
          dateNaissance: userData.dateNaissance ? new Date(userData.dateNaissance).toISOString().split('T')[0] : '',
          lieuNaissance: userData.lieuNaissance || '',
          nationalite: userData.nationalite || '',
          sexe: userData.sexe || '',
          numeroEtranger: userData.numeroEtranger || '',
          numeroTitre: userData.numeroTitre || '',
          typeTitre: userData.typeTitre || '',
          dateDelivrance: userData.dateDelivrance ? new Date(userData.dateDelivrance).toISOString().split('T')[0] : '',
          dateExpiration: userData.dateExpiration ? new Date(userData.dateExpiration).toISOString().split('T')[0] : '',
          adressePostale: userData.adressePostale || '',
          ville: userData.ville || '',
          codePostal: userData.codePostal || '',
          pays: userData.pays || 'France',
          profilComplete: userData.profilComplete || false,
          isActive: userData.isActive !== undefined ? userData.isActive : true,
        });
      }
    } catch (err: any) {
      console.error('Erreur lors du chargement de l\'utilisateur:', err);
      setError(err.response?.data?.message || 'Erreur lors du chargement de l\'utilisateur');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const updateData: any = {};
      Object.keys(formData).forEach(key => {
        if (formData[key] !== user[key]) {
          if (key === 'dateNaissance' || key === 'dateDelivrance' || key === 'dateExpiration') {
            updateData[key] = formData[key] ? new Date(formData[key]) : null;
          } else {
            updateData[key] = formData[key];
          }
        }
      });

      const response = await userAPI.updateUser(userId, updateData);
      if (response.data.success) {
        setSuccess('Utilisateur mis à jour avec succès');
        setUser(response.data.user);
        setIsEditing(false);
        onUpdate();
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (err: any) {
      console.error('Erreur lors de la mise à jour:', err);
      setError(err.response?.data?.message || 'Erreur lors de la mise à jour de l\'utilisateur');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto m-4" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold">Profil Utilisateur</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-2xl leading-none">×</button>
        </div>

        <div className="p-6">
          {isLoading && !user ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Chargement...</p>
            </div>
          ) : error && !user ? (
            <div className="p-4 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}
              {success && (
                <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md">
                  <p className="text-sm text-green-600">{success}</p>
                </div>
              )}

              {!isEditing ? (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xl font-semibold">{user?.firstName} {user?.lastName}</h3>
                      <p className="text-muted-foreground">{user?.email}</p>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <Button 
                        variant="outline"
                        onClick={() => {
                          if (!user) return;
                          downloadUserProfile(user);
                        }}
                        className="bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100"
                      >
                        📥 Télécharger la fiche
                      </Button>
                      <Button onClick={() => setIsEditing(true)}>Modifier</Button>
                      <Button 
                        variant="destructive" 
                        onClick={async () => {
                          if (!userId) return;
                          if (!confirm(`Êtes-vous sûr de vouloir supprimer l'utilisateur ${user?.firstName} ${user?.lastName} ? Cette action est irréversible.`)) {
                            return;
                          }
                          setIsLoading(true);
                          setError(null);
                          try {
                            await userAPI.deleteUser(userId);
                            setSuccess('Utilisateur supprimé avec succès');
                            onUpdate();
                            setTimeout(() => {
                              onClose();
                            }, 2000);
                          } catch (err: any) {
                            console.error('Erreur lors de la suppression:', err);
                            setError(err.response?.data?.message || 'Erreur lors de la suppression de l\'utilisateur');
                          } finally {
                            setIsLoading(false);
                          }
                        }}
                        disabled={isLoading || (user?.role === 'superadmin' && (session?.user as any)?.role !== 'superadmin') || (userId === (session?.user as any)?.id)}
                      >
                        {isLoading ? 'Suppression...' : 'Supprimer'}
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <Label className="text-muted-foreground">Téléphone</Label>
                      <p className="mt-1">{user?.phone || '-'}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Rôle</Label>
                      <p className="mt-1">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          user?.role === 'admin' || user?.role === 'superadmin'
                            ? 'bg-primary/10 text-primary'
                            : 'bg-blue-500/10 text-blue-500'
                        }`}>
                          {user?.role || 'client'}
                        </span>
                      </p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Profil complet</Label>
                      <p className="mt-1">
                        {user?.profilComplete ? (
                          <span className="text-green-600 font-medium">✓ Oui</span>
                        ) : (
                          <span className="text-orange-600 font-medium">⚠ Non</span>
                        )}
                      </p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Compte actif</Label>
                      <p className="mt-1">
                        {user?.isActive !== false ? (
                          <span className="text-green-600 font-medium">✓ Actif</span>
                        ) : (
                          <span className="text-red-600 font-medium">✗ Inactif</span>
                        )}
                      </p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Date de naissance</Label>
                      <p className="mt-1">{user?.dateNaissance ? new Date(user?.dateNaissance).toLocaleDateString('fr-FR') : '-'}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Lieu de naissance</Label>
                      <p className="mt-1">{user?.lieuNaissance || '-'}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Nationalité</Label>
                      <p className="mt-1">{user?.nationalite || '-'}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Sexe</Label>
                      <p className="mt-1">{user?.sexe || '-'}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Numéro étranger</Label>
                      <p className="mt-1">{user?.numeroEtranger || '-'}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Numéro titre</Label>
                      <p className="mt-1">{user?.numeroTitre || '-'}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Type titre</Label>
                      <p className="mt-1">{user?.typeTitre || '-'}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Date délivrance</Label>
                      <p className="mt-1">{user?.dateDelivrance ? new Date(user?.dateDelivrance).toLocaleDateString('fr-FR') : '-'}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Date expiration</Label>
                      <p className="mt-1">{user?.dateExpiration ? new Date(user?.dateExpiration).toLocaleDateString('fr-FR') : '-'}</p>
                    </div>
                    <div className="col-span-2">
                      <Label className="text-muted-foreground">Adresse postale</Label>
                      <p className="mt-1">{user?.adressePostale || '-'}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Ville</Label>
                      <p className="mt-1">{user?.ville || '-'}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Code postal</Label>
                      <p className="mt-1">{user?.codePostal || '-'}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Pays</Label>
                      <p className="mt-1">{user?.pays || '-'}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Date d'inscription</Label>
                      <p className="mt-1">{user?.createdAt ? new Date(user?.createdAt).toLocaleDateString('fr-FR') : '-'}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Dernière mise à jour</Label>
                      <p className="mt-1">{user?.updatedAt ? new Date(user?.updatedAt).toLocaleDateString('fr-FR') : '-'}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="firstName">Prénom</Label>
                      <Input
                        id="firstName"
                        value={formData.firstName || ''}
                        onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="lastName">Nom</Label>
                      <Input
                        id="lastName"
                        value={formData.lastName || ''}
                        onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={formData.email || ''}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="phone">Téléphone</Label>
                      <Input
                        id="phone"
                        type="tel"
                        value={formData.phone || ''}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="role">Rôle</Label>
                      <select
                        id="role"
                        value={formData.role || 'client'}
                        onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
                      >
                        <option value="client">Client</option>
                        <option value="admin">Admin</option>
                        <option value="superadmin">Super Admin</option>
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="dateNaissance">Date de naissance</Label>
                      <Input
                        id="dateNaissance"
                        type="date"
                        value={formData.dateNaissance || ''}
                        onChange={(e) => setFormData({ ...formData, dateNaissance: e.target.value })}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="lieuNaissance">Lieu de naissance</Label>
                      <Input
                        id="lieuNaissance"
                        value={formData.lieuNaissance || ''}
                        onChange={(e) => setFormData({ ...formData, lieuNaissance: e.target.value })}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="nationalite">Nationalité</Label>
                      <Input
                        id="nationalite"
                        value={formData.nationalite || ''}
                        onChange={(e) => setFormData({ ...formData, nationalite: e.target.value })}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="sexe">Sexe</Label>
                      <select
                        id="sexe"
                        value={formData.sexe || ''}
                        onChange={(e) => setFormData({ ...formData, sexe: e.target.value })}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
                      >
                        <option value="">Sélectionner</option>
                        <option value="M">M</option>
                        <option value="F">F</option>
                        <option value="Autre">Autre</option>
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="numeroEtranger">Numéro étranger</Label>
                      <Input
                        id="numeroEtranger"
                        value={formData.numeroEtranger || ''}
                        onChange={(e) => setFormData({ ...formData, numeroEtranger: e.target.value })}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="numeroTitre">Numéro titre</Label>
                      <Input
                        id="numeroTitre"
                        value={formData.numeroTitre || ''}
                        onChange={(e) => setFormData({ ...formData, numeroTitre: e.target.value })}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="typeTitre">Type titre</Label>
                      <Input
                        id="typeTitre"
                        value={formData.typeTitre || ''}
                        onChange={(e) => setFormData({ ...formData, typeTitre: e.target.value })}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="dateDelivrance">Date délivrance</Label>
                      <Input
                        id="dateDelivrance"
                        type="date"
                        value={formData.dateDelivrance || ''}
                        onChange={(e) => setFormData({ ...formData, dateDelivrance: e.target.value })}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="dateExpiration">Date expiration</Label>
                      <Input
                        id="dateExpiration"
                        type="date"
                        value={formData.dateExpiration || ''}
                        onChange={(e) => setFormData({ ...formData, dateExpiration: e.target.value })}
                        className="mt-1"
                      />
                    </div>
                    <div className="col-span-2">
                      <Label htmlFor="adressePostale">Adresse postale</Label>
                      <Input
                        id="adressePostale"
                        value={formData.adressePostale || ''}
                        onChange={(e) => setFormData({ ...formData, adressePostale: e.target.value })}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="ville">Ville</Label>
                      <Input
                        id="ville"
                        value={formData.ville || ''}
                        onChange={(e) => setFormData({ ...formData, ville: e.target.value })}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="codePostal">Code postal</Label>
                      <Input
                        id="codePostal"
                        value={formData.codePostal || ''}
                        onChange={(e) => setFormData({ ...formData, codePostal: e.target.value })}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="pays">Pays</Label>
                      <Input
                        id="pays"
                        value={formData.pays || ''}
                        onChange={(e) => setFormData({ ...formData, pays: e.target.value })}
                        className="mt-1"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="profilComplete"
                        checked={formData.profilComplete || false}
                        onChange={(e) => setFormData({ ...formData, profilComplete: e.target.checked })}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      <Label htmlFor="profilComplete" className="cursor-pointer">Profil complet</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="isActive"
                        checked={formData.isActive !== false}
                        onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      <Label htmlFor="isActive" className="cursor-pointer">Compte actif</Label>
                    </div>
                  </div>

                  <div className="flex gap-3 justify-end pt-4 border-t">
                    <Button type="button" variant="outline" onClick={() => setIsEditing(false)} disabled={isLoading}>
                      Annuler
                    </Button>
                    <Button type="submit" disabled={isLoading}>
                      {isLoading ? 'Enregistrement...' : 'Enregistrer les modifications'}
                    </Button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AdminUtilisateursPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [utilisateurs, setUtilisateurs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'client' | 'admin' | 'superadmin'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [profilFilter, setProfilFilter] = useState<'all' | 'complete' | 'incomplete'>('all');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  // Fonction pour obtenir la date du jour au format YYYY-MM-DD
  const getTodayDate = () => new Date().toISOString().split('T')[0];

  const [newUserData, setNewUserData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    phone: '',
    role: 'client' as 'client' | 'admin' | 'superadmin'
  });

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    } else if (session && (session.user as any)?.role !== 'admin' && (session.user as any)?.role !== 'superadmin') {
      router.push('/client');
    }
  }, [session, status, router]);

  useEffect(() => {
    if (status === 'authenticated' && ((session?.user as any)?.role === 'admin' || (session?.user as any)?.role === 'superadmin')) {
      loadUsers();
    }
  }, [session, status]);

  const loadUsers = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await userAPI.getAllUsers();
      if (response.data.success) {
        setUtilisateurs(response.data.users || []);
      } else {
        setError('Erreur lors du chargement des utilisateurs');
      }
    } catch (err: any) {
      console.error('Erreur lors du chargement des utilisateurs:', err);
      setError(err.response?.data?.message || 'Erreur lors du chargement des utilisateurs');
    } finally {
      setIsLoading(false);
    }
  };

  // Filtrer les utilisateurs selon le terme de recherche et les filtres
  const filteredUsers = utilisateurs.filter((user) => {
    // Filtre de recherche
    const fullName = `${user.firstName || ''} ${user.lastName || ''}`.toLowerCase();
    const email = (user.email || '').toLowerCase();
    const search = (searchTerm || '').toLowerCase();
    const matchesSearch = !search || fullName.includes(search) || email.includes(search);
    
    // Filtre par rôle
    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    
    // Filtre par statut (actif/inactif)
    const matchesStatus = statusFilter === 'all' || 
      (statusFilter === 'active' && user.isActive !== false) ||
      (statusFilter === 'inactive' && user.isActive === false);
    
    // Filtre par profil complet
    const matchesProfil = profilFilter === 'all' ||
      (profilFilter === 'complete' && user.profilComplete === true) ||
      (profilFilter === 'incomplete' && user.profilComplete !== true);
    
    return matchesSearch && matchesRole && matchesStatus && matchesProfil;
  });

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await userAPI.createUser(newUserData);
      if (response.data.success) {
        setSuccess('Utilisateur créé avec succès !');
        setNewUserData({
          firstName: '',
          lastName: '',
          email: '',
          password: '',
          phone: '',
          role: 'client'
        });
        setShowCreateForm(false);
        loadUsers(); // Recharger la liste
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (err: any) {
      console.error('Erreur lors de la création de l\'utilisateur:', err);
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
        setError('Erreur lors de la création de l\'utilisateur. Vérifiez que tous les champs sont remplis correctement.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!session || ((session.user as any)?.role !== 'admin' && (session.user as any)?.role !== 'superadmin')) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="w-full px-4 py-16">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Gestion des Utilisateurs</h1>
          <p className="text-muted-foreground">Gérez tous les utilisateurs de la plateforme</p>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-8">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}
          {success && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md">
              <p className="text-sm text-green-600">{success}</p>
            </div>
          )}

          {(session?.user as any)?.role === 'superadmin' && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">Créer un nouvel utilisateur</h2>
                <Button onClick={() => {
                  setEditingUserId(null);
                  setShowPermissionsModal(true);
                }}>
                  + Créer un utilisateur
                </Button>
              </div>
              
              {false && showCreateForm && (
                <form onSubmit={handleCreateUser} className="bg-gray-50 rounded-lg p-6 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="newFirstName">Prénom *</Label>
                      <Input
                        id="newFirstName"
                        value={newUserData.firstName}
                        onChange={(e) => setNewUserData({ ...newUserData, firstName: e.target.value })}
                        required
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="newLastName">Nom *</Label>
                      <Input
                        id="newLastName"
                        value={newUserData.lastName}
                        onChange={(e) => setNewUserData({ ...newUserData, lastName: e.target.value })}
                        required
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="newEmail">Email *</Label>
                      <Input
                        id="newEmail"
                        type="email"
                        value={newUserData.email}
                        onChange={(e) => setNewUserData({ ...newUserData, email: e.target.value })}
                        required
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="newPhone">Téléphone</Label>
                      <Input
                        id="newPhone"
                        type="tel"
                        value={newUserData.phone}
                        onChange={(e) => setNewUserData({ ...newUserData, phone: e.target.value })}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="newPassword">Mot de passe *</Label>
                      <Input
                        id="newPassword"
                        type="password"
                        value={newUserData.password}
                        onChange={(e) => setNewUserData({ ...newUserData, password: e.target.value })}
                        required
                        minLength={8}
                        className="mt-1"
                        placeholder="Minimum 8 caractères"
                      />
                    </div>
                    <div>
                      <Label htmlFor="newRole">Rôle *</Label>
                      <select
                        id="newRole"
                        value={newUserData.role}
                        onChange={(e) => setNewUserData({ ...newUserData, role: e.target.value as 'client' | 'admin' | 'superadmin' })}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
                        required
                      >
                        <option value="client">Client</option>
                        <option value="admin">Admin</option>
                        <option value="superadmin">Superadmin</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-4">
                    <Button type="button" variant="outline" onClick={() => {
                      setShowCreateForm(false);
                      setNewUserData({
                        firstName: '',
                        lastName: '',
                        email: '',
                        password: '',
                        phone: '',
                        role: 'client'
                      });
                    }}>
                      Annuler
                    </Button>
                    <Button type="submit" disabled={isLoading}>
                      {isLoading ? 'Création...' : 'Créer l\'utilisateur'}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          )}

          <div className="mb-6 space-y-4">
            {/* Barre de recherche */}
            <div className="flex items-center justify-between gap-4">
              <input
                type="text"
                placeholder="Rechercher par nom ou email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="flex h-10 w-full max-w-md rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              <Button onClick={loadUsers} variant="outline">
                🔄 Actualiser
              </Button>
            </div>

            {/* Filtres organisés par catégories */}
            <div className="space-y-4">
              {/* Filtre par Rôle */}
              <div className="border-b border-gray-200 pb-3">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  👥 Type d'utilisateur
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setRoleFilter('all')}
                    className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                      roleFilter === 'all'
                        ? 'bg-primary text-white border-primary shadow-sm'
                        : 'bg-white border-gray-300 hover:border-primary hover:bg-primary/5'
                    }`}
                  >
                    Tous les rôles
                    <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${
                      roleFilter === 'all' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {utilisateurs.length}
                    </span>
                  </button>
                  <button
                    onClick={() => setRoleFilter('client')}
                    className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all flex items-center gap-2 ${
                      roleFilter === 'client'
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                        : 'bg-white border-gray-300 hover:border-blue-500 hover:bg-blue-50'
                    }`}
                  >
                    <span>👤</span>
                    <span>Clients</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      roleFilter === 'client' ? 'bg-white/20 text-white' : 'bg-blue-50 text-blue-700'
                    }`}>
                      {utilisateurs.filter(u => u.role === 'client').length}
                    </span>
                  </button>
                  <button
                    onClick={() => setRoleFilter('admin')}
                    className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all flex items-center gap-2 ${
                      roleFilter === 'admin'
                        ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                        : 'bg-white border-gray-300 hover:border-purple-500 hover:bg-purple-50'
                    }`}
                  >
                    <span>👨‍💼</span>
                    <span>Administrateurs</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      roleFilter === 'admin' ? 'bg-white/20 text-white' : 'bg-purple-50 text-purple-700'
                    }`}>
                      {utilisateurs.filter(u => u.role === 'admin').length}
                    </span>
                  </button>
                  <button
                    onClick={() => setRoleFilter('superadmin')}
                    className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all flex items-center gap-2 ${
                      roleFilter === 'superadmin'
                        ? 'bg-red-600 text-white border-red-600 shadow-sm'
                        : 'bg-white border-gray-300 hover:border-red-500 hover:bg-red-50'
                    }`}
                  >
                    <span>🔴</span>
                    <span>Super Administrateurs</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      roleFilter === 'superadmin' ? 'bg-white/20 text-white' : 'bg-red-50 text-red-700'
                    }`}>
                      {utilisateurs.filter(u => u.role === 'superadmin').length}
                    </span>
                  </button>
                </div>
              </div>

              {/* Filtre par Statut du compte */}
              <div className="border-b border-gray-200 pb-3">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  ⚡ Statut du compte
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setStatusFilter('all')}
                    className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                      statusFilter === 'all'
                        ? 'bg-primary text-white border-primary shadow-sm'
                        : 'bg-white border-gray-300 hover:border-primary hover:bg-primary/5'
                    }`}
                  >
                    Tous les statuts
                    <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${
                      statusFilter === 'all' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {utilisateurs.filter(u => roleFilter === 'all' || u.role === roleFilter).length}
                    </span>
                  </button>
                  <button
                    onClick={() => setStatusFilter('active')}
                    className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all flex items-center gap-2 ${
                      statusFilter === 'active'
                        ? 'bg-green-600 text-white border-green-600 shadow-sm'
                        : 'bg-white border-gray-300 hover:border-green-500 hover:bg-green-50'
                    }`}
                  >
                    <span>✅</span>
                    <span>Comptes actifs</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      statusFilter === 'active' ? 'bg-white/20 text-white' : 'bg-green-50 text-green-700'
                    }`}>
                      {utilisateurs.filter(u => {
                        const matchesRole = roleFilter === 'all' || u.role === roleFilter;
                        return matchesRole && u.isActive !== false;
                      }).length}
                    </span>
                  </button>
                  <button
                    onClick={() => setStatusFilter('inactive')}
                    className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all flex items-center gap-2 ${
                      statusFilter === 'inactive'
                        ? 'bg-gray-600 text-white border-gray-600 shadow-sm'
                        : 'bg-white border-gray-300 hover:border-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    <span>⏸️</span>
                    <span>Comptes inactifs</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      statusFilter === 'inactive' ? 'bg-white/20 text-white' : 'bg-gray-50 text-gray-700'
                    }`}>
                      {utilisateurs.filter(u => {
                        const matchesRole = roleFilter === 'all' || u.role === roleFilter;
                        return matchesRole && u.isActive === false;
                      }).length}
                    </span>
                  </button>
                </div>
              </div>

              {/* Filtre par Profil */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  📋 Complétude du profil
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setProfilFilter('all')}
                    className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                      profilFilter === 'all'
                        ? 'bg-primary text-white border-primary shadow-sm'
                        : 'bg-white border-gray-300 hover:border-primary hover:bg-primary/5'
                    }`}
                  >
                    Tous les profils
                    <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${
                      profilFilter === 'all' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {utilisateurs.filter(u => {
                        const matchesRole = roleFilter === 'all' || u.role === roleFilter;
                        const matchesStatus = statusFilter === 'all' || 
                          (statusFilter === 'active' && u.isActive !== false) ||
                          (statusFilter === 'inactive' && u.isActive === false);
                        return matchesRole && matchesStatus;
                      }).length}
                    </span>
                  </button>
                  <button
                    onClick={() => setProfilFilter('complete')}
                    className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all flex items-center gap-2 ${
                      profilFilter === 'complete'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                        : 'bg-white border-gray-300 hover:border-emerald-500 hover:bg-emerald-50'
                    }`}
                  >
                    <span>✓</span>
                    <span>Profils complets</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      profilFilter === 'complete' ? 'bg-white/20 text-white' : 'bg-emerald-50 text-emerald-700'
                    }`}>
                      {utilisateurs.filter(u => {
                        const matchesRole = roleFilter === 'all' || u.role === roleFilter;
                        const matchesStatus = statusFilter === 'all' || 
                          (statusFilter === 'active' && u.isActive !== false) ||
                          (statusFilter === 'inactive' && u.isActive === false);
                        return matchesRole && matchesStatus && u.profilComplete === true;
                      }).length}
                    </span>
                  </button>
                  <button
                    onClick={() => setProfilFilter('incomplete')}
                    className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all flex items-center gap-2 ${
                      profilFilter === 'incomplete'
                        ? 'bg-orange-600 text-white border-orange-600 shadow-sm'
                        : 'bg-white border-gray-300 hover:border-orange-500 hover:bg-orange-50'
                    }`}
                  >
                    <span>⚠️</span>
                    <span>Profils incomplets</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      profilFilter === 'incomplete' ? 'bg-white/20 text-white' : 'bg-orange-50 text-orange-700'
                    }`}>
                      {utilisateurs.filter(u => {
                        const matchesRole = roleFilter === 'all' || u.role === roleFilter;
                        const matchesStatus = statusFilter === 'all' || 
                          (statusFilter === 'active' && u.isActive !== false) ||
                          (statusFilter === 'inactive' && u.isActive === false);
                        return matchesRole && matchesStatus && u.profilComplete !== true;
                      }).length}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Chargement des utilisateurs...</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              {searchTerm ? 'Aucun utilisateur ne correspond à votre recherche' : 'Aucun utilisateur trouvé'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-4 font-semibold">Nom complet</th>
                    <th className="text-left p-4 font-semibold">Email</th>
                    <th className="text-left p-4 font-semibold">Téléphone</th>
                    <th className="text-left p-4 font-semibold">Rôle</th>
                    <th className="text-left p-4 font-semibold">Profil complet</th>
                    <th className="text-left p-4 font-semibold">Date d'inscription</th>
                    <th className="text-left p-4 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <tr key={user._id || user.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="p-4">
                        {user.firstName} {user.lastName}
                      </td>
                      <td className="p-4">{user.email}</td>
                      <td className="p-4">{user.phone || '-'}</td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          user.role === 'admin' || user.role === 'superadmin'
                            ? 'bg-primary/10 text-primary'
                            : 'bg-blue-500/10 text-blue-500'
                        }`}>
                          {user.role || 'client'}
                        </span>
                      </td>
                      <td className="p-4">
                        {user.profilComplete ? (
                          <span className="text-green-600 font-medium">✓ Complet</span>
                        ) : (
                          <span className="text-orange-600 font-medium">⚠ Incomplet</span>
                        )}
                      </td>
                      <td className="p-4 text-sm text-muted-foreground">
                        {user.createdAt ? new Date(user.createdAt).toLocaleDateString('fr-FR') : '-'}
                      </td>
                      <td className="p-4">
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedUserId(user._id || user.id);
                              setIsModalOpen(true);
                            }}
                          >
                            Voir / Modifier
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditingUserId(user._id || user.id);
                              setShowPermissionsModal(true);
                            }}
                            className="bg-orange-50 border-orange-300 text-orange-700 hover:bg-orange-100"
                          >
                            Permissions
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedUserId(null);
        }}
        userId={selectedUserId}
        onUpdate={loadUsers}
      />

      <UserPermissionsModal
        isOpen={showPermissionsModal}
        onClose={() => {
          setShowPermissionsModal(false);
          setEditingUserId(null);
        }}
        userId={editingUserId}
        onSuccess={() => {
          loadUsers();
          setShowPermissionsModal(false);
          setEditingUserId(null);
        }}
      />
    </div>
  );
}

