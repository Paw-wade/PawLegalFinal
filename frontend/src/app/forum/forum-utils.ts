export const FORUM_THEMES = [
  { value: 'titre-sejour-etudiant', label: 'Titre de séjour étudiant' },
  { value: 'titre-sejour-salarie', label: 'Titre de séjour salarié' },
  { value: 'regroupement-familial', label: 'Regroupement familial' },
  { value: 'demande-visa', label: 'Demande de visa' },
  { value: 'autres', label: 'Autres' },
] as const;

export type ForumThemeValue = (typeof FORUM_THEMES)[number]['value'];

export function getThemeLabel(theme: string | undefined): string {
  return FORUM_THEMES.find((t) => t.value === theme)?.label ?? 'Autres';
}
