'use client';

import { useEffect, useState } from 'react';
import { appointmentsAPI, creneauxAPI, userAPI } from '@/lib/api';
import { DateInput as DateInputComponent } from '@/components/ui/DateInput';

function Button({ children, variant = 'default', className = '', ...props }: any) {
  const baseClasses = 'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors';
  const variantClasses = {
    default: 'bg-orange-500 text-white hover:bg-orange-600 shadow-md font-semibold',
    outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
  };
  return (
    <button className={`${baseClasses} ${variantClasses[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}

function Input({ className = '', type, value, onChange, ...props }: any) {
  if (type === 'date') {
    return (
      <DateInputComponent
        value={value || ''}
        onChange={(newValue) => {
          if (onChange) {
            const syntheticEvent = {
              target: { value: newValue },
              currentTarget: { value: newValue },
            } as React.ChangeEvent<HTMLInputElement>;
            onChange(syntheticEvent);
          }
        }}
        className={`flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 ${className}`}
        {...props}
      />
    );
  }

  return (
    <input
      type={type}
      className={`flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 ${className}`}
      {...props}
    />
  );
}

function Textarea({ className = '', ...props }: any) {
  return (
    <textarea
      className={`flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 ${className}`}
      {...props}
    />
  );
}

function Label({ htmlFor, children, className = '' }: any) {
  return (
    <label
      htmlFor={htmlFor}
      className={`text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 ${className}`}
    >
      {children}
    </label>
  );
}

const RDV_MOTIFS_OPTIONS = [
  { value: 'premiere_demande_titre', label: 'Je fais une première demande de titre de séjour' },
  { value: 'renouvellement_titre', label: 'Je demande le renouvellement de mon titre de séjour' },
  { value: 'changement_statut', label: 'Je demande un changement de statut' },
  { value: 'regroupement_familial', label: 'Je demande un regroupement familial' },
  { value: 'nationalite_francaise', label: 'Je demande la nationalité française' },
  { value: 'demande_visa', label: 'Je demande un visa' },
  { value: 'demande_carte_resident', label: 'Je demande une carte de résident' },
  { value: 'pas_reponse_titre', label: 'Je n’ai pas eu de réponse à ma demande de titre de séjour' },
  { value: 'pas_reponse_visa', label: 'Je n’ai pas eu de réponse à ma demande de visa' },
  { value: 'conteste_refus_titre', label: 'Je conteste un refus de titre de séjour' },
  { value: 'conteste_oqtf', label: 'J’ai reçu une OQTF (obligation de quitter le territoire)' },
  { value: 'constitution_societe_senegal', label: 'Constitution de société - Sénégal' },
  { value: 'constitution_societe_france', label: 'Constitution de société - France' },
  { value: 'autre', label: 'Autre' },
];

const DEFAULT_RDV_HEURES = [
  '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
  '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00',
];

const getTodayDate = () => new Date().toISOString().split('T')[0];

export type AdminBookingSeed = {
  forUserId?: string;
  nom?: string;
  prenom?: string;
  email?: string;
  telephone?: string;
  description?: string;
};

export function buildAdminBookingFromDossier(dossier: any): AdminBookingSeed {
  const dossierKey = String(dossier?._id || dossier?.id || '');
  const ref = dossier?.numero || dossier?.numeroDossier || '';
  const titre = dossier?.titre || '';
  const descParts = [ref && `Réf. ${ref}`, titre && `« ${titre} »`].filter(Boolean);
  const description =
    descParts.length > 0
      ? `RDV concernant le dossier ${descParts.join(' - ')}`
      : `RDV concernant le dossier ${dossierKey}`;

  if (dossier?.user && typeof dossier.user === 'object') {
    const user = dossier.user;
    return {
      forUserId: String(user._id || user.id || ''),
      nom: user.lastName || '',
      prenom: user.firstName || '',
      email: user.email || '',
      telephone: (user.phone || '').trim() || '-',
      description,
    };
  }

  return {
    forUserId: '',
    nom: dossier?.clientNom || '',
    prenom: dossier?.clientPrenom || '',
    email: dossier?.clientEmail || '',
    telephone: (dossier?.clientTelephone || '').trim() || '-',
    description,
  };
}

type AdminBookingModalProps = {
  open: boolean;
  onClose: () => void;
  onSuccess?: (message?: string) => void;
  linkedDossierId?: string | null;
  linkedDossierBooking?: AdminBookingSeed | null;
};

export function AdminBookingModal({
  open,
  onClose,
  onSuccess,
  linkedDossierId = null,
  linkedDossierBooking = null,
}: AdminBookingModalProps) {
  const [clientUsers, setClientUsers] = useState<any[]>([]);
  const [loadingClientUsers, setLoadingClientUsers] = useState(false);
  const [adminBookingSlots, setAdminBookingSlots] = useState<string[]>(DEFAULT_RDV_HEURES);
  const [loadingAdminSlots, setLoadingAdminSlots] = useState(false);
  const [adminBookingSubmitting, setAdminBookingSubmitting] = useState(false);
  const [adminBookingError, setAdminBookingError] = useState<string | null>(null);
  const [adminBookingInformClient, setAdminBookingInformClient] = useState(true);
  const [adminBookingInformTeam, setAdminBookingInformTeam] = useState(true);
  const [appointmentLinkedDossierId, setAppointmentLinkedDossierId] = useState<string | null>(null);
  const [adminBookingForm, setAdminBookingForm] = useState({
    forUserId: '',
    nom: '',
    prenom: '',
    email: '',
    telephone: '',
    date: '',
    heure: '',
    motif: 'premiere_demande_titre',
    description: '',
  });

  const compactDossierBooking = !!appointmentLinkedDossierId;

  useEffect(() => {
    if (!open) return;

    setAdminBookingError(null);
    setAdminBookingInformClient(true);
    setAdminBookingInformTeam(true);
    setAppointmentLinkedDossierId(linkedDossierId || null);

    const today = getTodayDate();
    if (linkedDossierBooking) {
      setAdminBookingForm({
        forUserId: linkedDossierBooking.forUserId || '',
        nom: linkedDossierBooking.nom || '',
        prenom: linkedDossierBooking.prenom || '',
        email: linkedDossierBooking.email || '',
        telephone: linkedDossierBooking.telephone || '',
        date: today,
        heure: '',
        motif: 'premiere_demande_titre',
        description: linkedDossierBooking.description || '',
      });
      setClientUsers([]);
      setLoadingClientUsers(false);
      return;
    }

    setAdminBookingForm({
      forUserId: '',
      nom: '',
      prenom: '',
      email: '',
      telephone: '',
      date: today,
      heure: '',
      motif: 'premiere_demande_titre',
      description: '',
    });

    let cancelled = false;
    setLoadingClientUsers(true);
    (async () => {
      try {
        const res = await userAPI.getAllUsers();
        if (cancelled) return;
        const possibleUsers =
          (res.data && Array.isArray(res.data.users) && res.data.users) ||
          (res.data && Array.isArray(res.data.data) && res.data.data) ||
          (Array.isArray(res.data) && res.data) ||
          [];
        setClientUsers(possibleUsers.filter((u: any) => u.role === 'client' || !u.role));
      } catch {
        if (!cancelled) setClientUsers([]);
      } finally {
        if (!cancelled) setLoadingClientUsers(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, linkedDossierId, linkedDossierBooking]);

  useEffect(() => {
    if (!open || !adminBookingForm.forUserId) return;

    const selected = clientUsers.find((x) => String(x._id || x.id) === adminBookingForm.forUserId);
    if (!selected) return;

    const nextNom = selected.lastName || selected.nom || '';
    const nextPrenom = selected.firstName || selected.prenom || '';
    const nextEmail = selected.email || selected.clientEmail || '';
    const nextTel = selected.phone || selected.telephone || '';

    setAdminBookingForm((current) => ({
      ...current,
      nom: current.nom?.trim() ? current.nom : nextNom,
      prenom: current.prenom?.trim() ? current.prenom : nextPrenom,
      email: current.email?.trim() ? current.email : nextEmail,
      telephone: current.telephone?.trim() ? current.telephone : nextTel,
    }));
  }, [open, adminBookingForm.forUserId, clientUsers]);

  useEffect(() => {
    if (!open || !adminBookingForm.date) return;

    let cancelled = false;
    (async () => {
      setLoadingAdminSlots(true);
      const dateStr = adminBookingForm.date;
      try {
        const response = await creneauxAPI.getAvailableSlots(dateStr);
        if (cancelled) return;
        if (response.data.success) {
          let heures: string[] = response.data.heuresDisponibles || [];
          const maintenant = new Date();
          const dateAujourdhui = maintenant.toISOString().split('T')[0];
          if (dateStr === dateAujourdhui) {
            const hh = maintenant.getHours();
            const mm = maintenant.getMinutes();
            const cur = `${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`;
            heures = heures.filter((h: string) => h > cur);
          }
          setAdminBookingSlots(heures.length > 0 ? heures : []);
        } else {
          setAdminBookingSlots(DEFAULT_RDV_HEURES);
        }
      } catch {
        if (cancelled) return;
        let heures = [...DEFAULT_RDV_HEURES];
        const maintenant = new Date();
        const dateAujourdhui = maintenant.toISOString().split('T')[0];
        if (dateStr === dateAujourdhui) {
          const hh = maintenant.getHours();
          const mm = maintenant.getMinutes();
          const cur = `${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`;
          heures = heures.filter((h) => h > cur);
        }
        setAdminBookingSlots(heures);
      } finally {
        if (!cancelled) setLoadingAdminSlots(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, adminBookingForm.date]);

  const handleClose = () => {
    if (adminBookingSubmitting) return;
    onClose();
  };

  const handleAdminBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminBookingError(null);
    if (!adminBookingForm.nom.trim() || !adminBookingForm.email.trim() || !adminBookingForm.date || !adminBookingForm.heure) {
      setAdminBookingError('Le nom, l’email, la date et l’heure sont obligatoires.');
      return;
    }

    setAdminBookingSubmitting(true);
    try {
      const res = await appointmentsAPI.createAppointment({
        nom: adminBookingForm.nom.trim(),
        prenom: adminBookingForm.prenom.trim(),
        email: adminBookingForm.email.trim(),
        telephone: (adminBookingForm.telephone || '').trim() || '-',
        date: adminBookingForm.date,
        heure: adminBookingForm.heure,
        motif: adminBookingForm.motif,
        description: adminBookingForm.description.trim() || undefined,
        ...(adminBookingForm.forUserId ? { forUserId: adminBookingForm.forUserId } : {}),
        ...(appointmentLinkedDossierId ? { dossierId: appointmentLinkedDossierId } : {}),
        informClient: adminBookingInformClient,
        informTeam: adminBookingInformTeam,
      });
      if (res.data.success) {
        onSuccess?.(res.data.message || 'Rendez-vous enregistré.');
        onClose();
      } else {
        setAdminBookingError(res.data.message || 'Erreur lors de la création.');
      }
    } catch (err: any) {
      setAdminBookingError(
        err.response?.data?.message || err.message || 'Erreur lors de la création du rendez-vous.'
      );
    } finally {
      setAdminBookingSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={() => !adminBookingSubmitting && handleClose()}
    >
      <div
        className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-5 sm:p-6 relative"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 mb-4">
          <div>
            <h3 className="text-lg font-bold">Nouveau rendez-vous</h3>
            <p className="text-xs text-muted-foreground mt-1">
              {compactDossierBooking
                ? 'Le client est déjà identifié via le dossier. Indiquez la date, l’heure et le motif. Le rendez-vous est enregistré en attente de validation.'
                : 'Le rendez-vous est enregistré comme une demande (statut en attente). Choisissez un client inscrit pour lier le RDV à son espace, ou saisissez les coordonnées manuellement.'}
            </p>
          </div>
          <button
            type="button"
            className="text-gray-400 hover:text-gray-700 text-xl leading-none p-1"
            disabled={adminBookingSubmitting}
            onClick={handleClose}
            aria-label="Fermer"
          >
            ×
          </button>
        </div>

        {adminBookingError && (
          <div className="mb-3 p-2 rounded-md bg-red-50 border border-red-200 text-sm text-red-700">
            {adminBookingError}
          </div>
        )}

        {appointmentLinkedDossierId && (
          <div className="mb-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs sm:text-sm text-foreground leading-snug">
            <span className="font-semibold">Lien dossier :</span> ce rendez-vous sera rattaché au dossier après validation.
            <button
              type="button"
              className="block mt-1.5 underline text-primary font-medium"
              disabled={adminBookingSubmitting}
              onClick={() => setAppointmentLinkedDossierId(null)}
            >
              Ne pas lier ce rendez-vous au dossier
            </button>
          </div>
        )}

        <form onSubmit={handleAdminBookingSubmit} className="space-y-3">
          {compactDossierBooking ? (
            <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Client</p>
              <p className="font-medium text-foreground">
                {[adminBookingForm.prenom, adminBookingForm.nom].filter(Boolean).join(' ') || '-'}
              </p>
              <p className="text-xs text-muted-foreground mt-1 break-all">{adminBookingForm.email || '-'}</p>
              {adminBookingForm.telephone && adminBookingForm.telephone !== '-' && (
                <p className="text-xs text-muted-foreground mt-0.5">{adminBookingForm.telephone}</p>
              )}
              {adminBookingForm.forUserId ? (
                <p className="text-[11px] text-muted-foreground mt-1.5">Compte client lié (espace connecté).</p>
              ) : (
                <p className="text-[11px] text-muted-foreground mt-1.5">Dossier sans compte - coordonnées issues de la fiche.</p>
              )}
            </div>
          ) : (
            <>
              <div>
                <Label htmlFor="admin-rdv-client">Client inscrit (optionnel)</Label>
                <select
                  id="admin-rdv-client"
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  disabled={loadingClientUsers || adminBookingSubmitting}
                  value={adminBookingForm.forUserId}
                  onChange={(e) => {
                    const id = e.target.value;
                    if (!id) {
                      setAdminBookingForm((current) => ({
                        ...current,
                        forUserId: '',
                        nom: '',
                        prenom: '',
                        email: '',
                        telephone: '',
                      }));
                      return;
                    }
                    const user = clientUsers.find((x) => String(x._id || x.id) === id);
                    if (!user) return;
                    setAdminBookingForm((current) => ({
                      ...current,
                      forUserId: id,
                      nom: user.lastName || user.nom || user.last_name || '',
                      prenom: user.firstName || user.prenom || user.first_name || '',
                      email: user.email || user.clientEmail || user.mail || '',
                      telephone: user.phone || user.telephone || user.tel || '',
                    }));
                  }}
                >
                  <option value="">- Saisie manuelle (sans compte) -</option>
                  {clientUsers.map((user) => (
                    <option key={String(user._id || user.id)} value={String(user._id || user.id)}>
                      {`${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email} · {user.email}
                    </option>
                  ))}
                </select>
                {loadingClientUsers && (
                  <p className="text-[11px] text-muted-foreground mt-1">Chargement des clients…</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="admin-rdv-nom">Nom *</Label>
                  <Input
                    id="admin-rdv-nom"
                    value={adminBookingForm.nom}
                    onChange={(e) => setAdminBookingForm({ ...adminBookingForm, nom: e.target.value })}
                    disabled={adminBookingSubmitting}
                    required
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="admin-rdv-prenom">Prénom</Label>
                  <Input
                    id="admin-rdv-prenom"
                    value={adminBookingForm.prenom}
                    onChange={(e) => setAdminBookingForm({ ...adminBookingForm, prenom: e.target.value })}
                    disabled={adminBookingSubmitting}
                    className="mt-1"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="admin-rdv-email">Email *</Label>
                <Input
                  id="admin-rdv-email"
                  type="email"
                  value={adminBookingForm.email}
                  onChange={(e) => setAdminBookingForm({ ...adminBookingForm, email: e.target.value })}
                  disabled={adminBookingSubmitting}
                  required
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="admin-rdv-tel">Téléphone</Label>
                <Input
                  id="admin-rdv-tel"
                  type="tel"
                  value={adminBookingForm.telephone}
                  onChange={(e) => setAdminBookingForm({ ...adminBookingForm, telephone: e.target.value })}
                  disabled={adminBookingSubmitting}
                  className="mt-1"
                  placeholder="Facultatif (- si vide)"
                />
              </div>
            </>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="admin-rdv-date">Date *</Label>
              <Input
                id="admin-rdv-date"
                type="date"
                value={adminBookingForm.date}
                min={getTodayDate()}
                onChange={(e) => setAdminBookingForm({ ...adminBookingForm, date: e.target.value, heure: '' })}
                disabled={adminBookingSubmitting}
                required
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="admin-rdv-heure">Heure *</Label>
              <select
                id="admin-rdv-heure"
                className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={adminBookingForm.heure}
                onChange={(e) => setAdminBookingForm({ ...adminBookingForm, heure: e.target.value })}
                required
                disabled={adminBookingSubmitting || loadingAdminSlots || !adminBookingForm.date}
              >
                <option value="">
                  {loadingAdminSlots ? 'Chargement…' : adminBookingSlots.length === 0 ? 'Aucun créneau' : 'Choisir'}
                </option>
                {adminBookingSlots.map((hour) => (
                  <option key={hour} value={hour}>
                    {hour}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <Label htmlFor="admin-rdv-motif">Motif *</Label>
            <select
              id="admin-rdv-motif"
              className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={adminBookingForm.motif}
              onChange={(e) => setAdminBookingForm({ ...adminBookingForm, motif: e.target.value })}
              required
              disabled={adminBookingSubmitting}
            >
              {RDV_MOTIFS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="admin-rdv-desc">Précisions (optionnel)</Label>
            <Textarea
              id="admin-rdv-desc"
              rows={3}
              value={adminBookingForm.description}
              onChange={(e) => setAdminBookingForm({ ...adminBookingForm, description: e.target.value.slice(0, 500) })}
              disabled={adminBookingSubmitting}
              className="mt-1 text-sm"
              maxLength={500}
            />
          </div>

          <fieldset className="rounded-lg border border-border px-3 py-2.5 space-y-2">
            <legend className="text-xs font-semibold text-foreground px-1">Notifications</legend>
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 rounded border-input"
                checked={adminBookingInformTeam}
                onChange={(e) => setAdminBookingInformTeam(e.target.checked)}
                disabled={adminBookingSubmitting}
              />
              <span>
                <span className="font-medium">Informer l'équipe</span>
                <span className="block text-xs text-muted-foreground">
                  Notifications dans l'application et e-mails aux administrateurs.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 rounded border-input"
                checked={adminBookingInformClient}
                onChange={(e) => setAdminBookingInformClient(e.target.checked)}
                disabled={adminBookingSubmitting}
              />
              <span>
                <span className="font-medium">Informer le client</span>
                <span className="block text-xs text-muted-foreground">
                  {adminBookingForm.forUserId
                    ? 'E-mail « Rendez-vous enregistré », notification in-app, push navigateur (si configuré), et SMS pour un numéro français (+33) issu du profil.'
                    : 'E-mail accusé réception pour la demande ; notification par SMS réservée aux numéros français (+33) saisis lorsque création par un administrateur.'}
                </span>
              </span>
            </label>
          </fieldset>

          <div className="flex flex-col-reverse sm:flex-row gap-2 justify-end pt-2 border-t">
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              disabled={adminBookingSubmitting}
              onClick={handleClose}
            >
              Annuler
            </Button>
            <Button type="submit" className="w-full sm:w-auto" disabled={adminBookingSubmitting}>
              {adminBookingSubmitting ? 'Enregistrement…' : 'Enregistrer le rendez-vous'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
