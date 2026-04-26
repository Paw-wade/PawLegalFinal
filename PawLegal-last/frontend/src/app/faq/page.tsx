'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';

function Button({ children, variant = 'default', className = '', ...props }: any) {
  const baseClasses = 'inline-flex items-center justify-center rounded-md font-medium transition-colors';
  const variantClasses = {
    default: 'bg-orange-500 text-white hover:bg-orange-600 shadow-md font-semibold',
    outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
  };
  return <button className={`${baseClasses} ${variantClasses[variant]} ${className}`} {...props}>{children}</button>;
}

interface FAQItem {
  question: string;
  answer: string;
}

interface FAQSection {
  title: string;
  items: FAQItem[];
}

export default function FAQPage() {
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const [openItems, setOpenItems] = useState<Set<string>>(new Set());

  const toggleSection = (sectionId: string) => {
    const newOpenSections = new Set(openSections);
    if (newOpenSections.has(sectionId)) {
      newOpenSections.delete(sectionId);
    } else {
      newOpenSections.add(sectionId);
    }
    setOpenSections(newOpenSections);
  };

  const toggleItem = (itemId: string) => {
    const newOpenItems = new Set(openItems);
    if (newOpenItems.has(itemId)) {
      newOpenItems.delete(itemId);
    } else {
      newOpenItems.add(itemId);
    }
    setOpenItems(newOpenItems);
  };

  const faqSections: FAQSection[] = [
    {
      title: 'Première demande de titre de séjour',
      items: [
        {
          question: 'Quel étranger doit être titulaire d\'un document de séjour ?',
          answer: 'Tout étranger âgé de plus de dix-huit ans qui souhaite séjourner en France pour une durée supérieure à trois mois doit être titulaire de l\'un des documents de séjour listés par la loi, sous réserve des engagements internationaux de la France.'
        },
        {
          question: 'Quels sont les principaux types de documents de séjour ?',
          answer: 'Les principaux documents de séjour sont : • Un visa de long séjour (VLS) • Une carte de séjour temporaire (CST) • Une carte de séjour pluriannuelle (CSP) • Une carte de résident (CR) • Une carte de résident portant la mention "résident de longue durée-UE" • Une carte de séjour portant la mention "retraité" • Une autorisation provisoire de séjour (APS)'
        },
        {
          question: 'Quelles sont les durées de validité maximales pour les cartes standard ?',
          answer: '• Le visa de long séjour et la carte de séjour temporaire ont une durée de validité maximale d\'un an • La carte de résident est valable dix ans • La carte de séjour pluriannuelle a une durée de validité de quatre ans par défaut, sauf exceptions (par exemple, elle est égale à la durée du contrat de travail pour le "talent-carte bleue européenne", dans la limite de quatre ans si le contrat est d\'au moins deux ans)'
        },
        {
          question: 'Que doit faire l\'étranger à l\'expiration de son document de séjour ?',
          answer: 'À l\'expiration de la durée de validité de son document de séjour, l\'étranger doit quitter la France, à moins qu\'il n\'en obtienne le renouvellement ou qu\'un autre document ne lui soit délivré.'
        },
        {
          question: 'La production d\'un visa de long séjour (VLS) est-elle toujours requise pour une première carte de séjour ?',
          answer: 'En principe, la délivrance d\'une première carte de séjour est subordonnée à la production par l\'étranger du visa de long séjour mentionné aux 1° ou 2° de l\'article L. 411-1.'
        },
        {
          question: 'Existe-t-il des exceptions à l\'obligation de produire un VLS pour une première demande ?',
          answer: 'Oui, plusieurs catégories d\'étrangers sont exemptées de la production du VLS pour la première délivrance de certaines cartes de séjour, notamment : • La carte de séjour temporaire "stagiaire mobile ICT" • Certaines cartes de séjour temporaires portant la mention "vie privée et familiale" • Certaines cartes "salarié", "travailleur temporaire", "entrepreneur/profession libérale", "étudiant" ou "visiteur" délivrées sous conditions spécifiques • L\'autorité administrative peut également accorder, sans exiger le VLS, la CST "étudiant", la CST "stagiaire" ou la CSP "étudiant-programme de mobilité"'
        },
        {
          question: 'Qu\'est-ce que le Contrat d\'Engagement au Respect des Principes de la République (CERPR) ?',
          answer: 'L\'étranger qui sollicite un document de séjour s\'engage, par la souscription d\'un CERPR, à respecter plusieurs principes fondamentaux de la République, tels que : la liberté personnelle, la liberté d\'expression et de conscience, l\'égalité entre les femmes et les hommes, la dignité de la personne humaine, la devise et les symboles de la République, et à ne pas se prévaloir de ses croyances pour s\'affranchir des règles communes.'
        },
        {
          question: 'Le Contrat d\'Intégration Républicaine (CIR) est-il obligatoire pour une première admission au séjour ?',
          answer: 'L\'étranger admis pour la première fois au séjour ou qui entre régulièrement entre 16 et 18 ans et souhaite se maintenir durablement en France, doit s\'engager dans un parcours personnalisé d\'intégration républicaine et conclure un CIR avec l\'État. Le CIR engage l\'étranger à suivre des formations et dispositifs d\'accompagnement prescrits (formation civique, formation linguistique, conseil en orientation professionnelle).'
        },
        {
          question: 'Qui est dispensé de signer le Contrat d\'Intégration Républicaine (CIR) ?',
          answer: 'Plusieurs catégories d\'étrangers sont dispensées de la signature du CIR, incluant notamment : • Les titulaires de cartes de séjour temporaire portant la mention "travailleur temporaire", "étudiant", ou "visiteur" • Les titulaires de la plupart des cartes de séjour pluriannuelles portant la mention "passeport talent" • Les titulaires de la carte de résident • Ceux ayant suivi une scolarité dans un établissement d\'enseignement secondaire français pendant au moins trois années scolaires ou des études supérieures en France d\'une durée au moins égale à une année universitaire'
        },
        {
          question: 'Quels sont les frais principaux liés à la délivrance ou au renouvellement des titres de séjour ?',
          answer: '• La délivrance et le renouvellement d\'un titre de séjour (sauf APS) donnent lieu à la perception d\'une taxe de 200 euros • Ce montant est ramené à 50 euros pour certaines catégories (travailleurs saisonniers, étudiants, regroupement familial, etc.) • Un droit de timbre de 25 euros est également soumis à la délivrance, au renouvellement, au duplicata ou au changement de carte de séjour • En cas de renouvellement demandé après l\'expiration du délai requis, un droit de visa de régularisation de 180 euros doit être acquitté, sauf cas de force majeure ou présentation d\'un visa en cours de validité'
        }
      ]
    },
    {
      title: 'Titres de séjour pour étudiants étrangers',
      items: [
        {
          question: 'Quel est le principal titre de séjour délivré aux étudiants étrangers ?',
          answer: 'L\'étranger qui établit qu\'il suit un enseignement ou des études en France peut se voir délivrer une carte de séjour temporaire (CST) portant la mention "étudiant".'
        },
        {
          question: 'Quelle est la durée de validité de la carte de séjour temporaire "étudiant" ?',
          answer: 'Cette carte a une durée de validité maximale d\'un an.'
        },
        {
          question: 'Existe-t-il une carte de séjour pluriannuelle pour les étudiants ?',
          answer: 'Oui. Pour les étudiants relevant des articles L. 422-1, L. 422-2 et L. 422-5, la carte de séjour pluriannuelle (CSP) est délivrée pour une durée égale à celle restant à courir du cycle d\'études dans lequel l\'étudiant est inscrit.'
        },
        {
          question: 'Qu\'est-ce que la carte de séjour pluriannuelle "étudiant-programme de mobilité" ?',
          answer: 'Cette carte est délivrée à l\'étudiant étranger qui relève d\'un programme de l\'Union européenne, d\'un programme multilatéral comportant des mesures de mobilité dans un ou plusieurs États membres de l\'Union européenne, ou d\'une convention entre au moins deux établissements d\'enseignement supérieur situés dans au moins deux États membres de l\'Union européenne. Cette carte a une durée équivalente à celle du programme ou de la convention, qui ne peut pas être inférieure à deux ans.'
        },
        {
          question: 'Quelles sont les conditions de base pour obtenir la carte "étudiant" (L. 422-1) ?',
          answer: 'L\'étudiant doit justifier qu\'il suit un enseignement ou des études en France et qu\'il dispose de moyens d\'existence suffisants.'
        },
        {
          question: 'Est-ce que l\'étranger doit obligatoirement présenter un visa de long séjour (VLS) pour obtenir sa première carte "étudiant" ?',
          answer: 'En principe, un VLS est requis. Cependant, l\'autorité administrative peut accorder la CST "étudiant" (L. 422-1) ou la CSP "étudiant-programme de mobilité" (L. 422-6) sans exiger la production du VLS. Des dispenses du VLS sont également prévues pour certains cas spécifiques.'
        },
        {
          question: 'Les étudiants doivent-ils signer le Contrat d\'Intégration Républicaine (CIR) ?',
          answer: 'Non. L\'étranger titulaire d\'une carte de séjour temporaire portant la mention "étudiant" (L. 422-1 ou L. 422-2) ou "étudiant-programme de mobilité" (L. 422-5) est dispensé de la signature du CIR.'
        },
        {
          question: 'Un étudiant peut-il exercer une activité professionnelle en France ?',
          answer: 'Oui. La carte "étudiant" (L. 422-1) et la carte "étudiant-programme de mobilité" (L. 422-5) autorisent l\'exercice, à titre accessoire, d\'une activité professionnelle salariée dans la limite de 60 % de la durée de travail annuelle (soit 964 heures par an).'
        },
        {
          question: 'La carte de séjour peut-elle être retirée si l\'étudiant travaille trop ?',
          answer: 'Oui, la carte de séjour temporaire ou pluriannuelle portant la mention "étudiant" ou "étudiant-programme de mobilité" peut être retirée si l\'étudiant étranger ne respecte pas la limite de 60 % de la durée de travail annuelle.'
        },
        {
          question: 'Quelles conditions doivent être remplies pour obtenir le renouvellement d\'une carte étudiante ?',
          answer: 'Le renouvellement est subordonné à la preuve par l\'étranger qu\'il continue de remplir les conditions requises pour la délivrance de cette carte. Pour les cartes pluriannuelles "étudiant", le renouvellement est soumis au caractère réel et sérieux des études, même si un redoublement par cycle d\'études ne remet pas en cause, par lui-même, ce caractère sérieux.'
        },
        {
          question: 'Qu\'arrive-t-il si la carte est refusée ou retirée ?',
          answer: 'Un refus de délivrance ou de renouvellement peut être prononcé si la présence de l\'étranger en France constitue une menace pour l\'ordre public. Un retrait peut également être décidé si l\'étranger cesse de remplir les conditions exigées (par exemple, études non sérieuses ou fin des études).'
        },
        {
          question: 'Sous quelles conditions un étudiant diplômé peut-il obtenir une carte pour chercher un emploi ou créer une entreprise ?',
          answer: 'L\'étranger doit remplir plusieurs conditions et demander une carte de séjour temporaire portant la mention "recherche d\'emploi ou création d\'entreprise" d\'une durée d\'un an. Il doit : • Être titulaire d\'une assurance maladie • Avoir été titulaire d\'une carte "étudiant" ET avoir obtenu un diplôme au moins équivalent au grade de master • Soit vouloir compléter sa formation par une première expérience professionnelle, soit justifier d\'un projet de création d\'entreprise lié à sa formation/recherche'
        },
        {
          question: 'Cette carte "recherche d\'emploi ou création d\'entreprise" est-elle renouvelable ?',
          answer: 'Non, la carte de séjour temporaire portant la mention "recherche d\'emploi ou création d\'entreprise" n\'est pas renouvelable.'
        },
        {
          question: 'Quels sont les droits attachés à cette carte d\'un an ?',
          answer: 'Elle autorise l\'étranger à chercher et à exercer un emploi en relation avec sa formation ou ses recherches, assorti d\'une rémunération supérieure à un seuil fixé par décret.'
        },
        {
          question: 'Que se passe-t-il après l\'année de "recherche d\'emploi ou création d\'entreprise" ?',
          answer: '• S\'il trouve un emploi : S\'il obtient un emploi ou une promesse d\'embauche satisfaisant aux conditions de rémunération et de relation avec sa formation, il se voit délivrer une carte de séjour de travail ("salarié", "travailleur temporaire" ou "passeport talent") sans que la situation de l\'emploi lui soit opposable • S\'il crée une entreprise : S\'il justifie de la création et du caractère viable d\'une entreprise correspondant à son projet, il reçoit la carte "entrepreneur/profession libérale" ou "talent"'
        },
        {
          question: 'Un ancien étudiant ayant quitté la France peut-il revenir avec cette carte ?',
          answer: 'Oui. L\'étranger qui a obtenu un diplôme au moins équivalent au grade de master et qui a quitté le territoire national après ses études peut se voir délivrer cette carte "recherche d\'emploi ou création d\'entreprise" d\'une durée d\'un an, dans un délai maximal de quatre ans à compter de l\'obtention du diplôme en France.'
        }
      ]
    },
    {
      title: 'Renouvellement de titre de séjour - Guide pratique',
      items: [
        {
          question: 'Quand dois-je déposer ma demande de renouvellement ?',
          answer: 'Vous devez déposer votre dossier entre 4 et 2 mois avant l\'expiration de votre titre actuel.'
        },
        {
          question: 'Où dois-je déposer ma demande ?',
          answer: 'Cela dépend de votre type de titre : • ANEF (en ligne) : majorité des titres (étudiant, salarié, vie privée et familiale, VLS-TS, etc.) • Guichet en préfecture : uniquement pour les titres non dématérialisés • Par courrier : si la préfecture le prévoit dans sa procédure locale'
        },
        {
          question: 'Le dépôt en ligne est-il obligatoire ?',
          answer: 'Oui, si votre catégorie figure dans la liste des titres dématérialisés (annexe 9 CESEDA). Dans ce cas, la préfecture ne peut pas exiger une présence au guichet.'
        },
        {
          question: 'Que faire si l\'ANEF ne fonctionne pas ?',
          answer: 'Vous devez : • Faire des captures d\'écran du problème • Contacter le support ANEF • Alerter la préfecture par mail ou recommandé • Demander un mode de dépôt alternatif Le juge peut imposer l\'enregistrement de la demande.'
        },
        {
          question: 'Quels documents sont généralement nécessaires ?',
          answer: '• Passeport • Titre de séjour actuel • Justificatif de domicile • Photos d\'identité • Justificatif de couverture maladie • Timbres fiscaux (si nécessaires)'
        },
        {
          question: 'Quels documents spécifiques selon les situations ?',
          answer: '• Étudiant : certificat de scolarité + relevés d\'assiduité, ressources minimum • Salarié : contrat de travail + fiches de paie • Vie privée et familiale : preuves de vie commune / stabilité • Recherche d\'emploi / création d\'entreprise : diplôme + attestation de réussite + justificatifs du projet • Passeport talent : ressources, diplômes, contrat ou projet'
        },
        {
          question: 'Les documents étrangers doivent-ils être traduits ?',
          answer: 'Oui, par un traducteur assermenté en France, sauf exceptions.'
        },
        {
          question: 'Suis-je autorisé(e) à rester en France pendant l\'instruction ?',
          answer: 'Oui, si vous disposez d\'un : • Récépissé • Ou attestation de prolongation ANEF L\'attestation de dépôt ANEF ne suffit pas.'
        },
        {
          question: 'Puis-je travailler pendant l\'instruction ?',
          answer: 'Oui, si votre précédent titre autorisait le travail et si votre récépissé / attestation porte la mention travail autorisé.'
        },
        {
          question: 'Puis-je voyager pendant l\'instruction ?',
          answer: 'Seulement avec : • Un récépissé, ou • Une autorisation provisoire de séjour (APS) avec droit au retour L\'attestation de dépôt ANEF ne permet pas de voyager.'
        },
        {
          question: 'Quel est le délai pour que la préfecture réponde ?',
          answer: '• 4 mois : délai général • 90 jours : pour certains titres (Passeport talent, Carte bleue européenne, etc.) • 60 jours : carte de résident longue durée UE'
        },
        {
          question: 'Que se passe-t-il si la préfecture ne répond pas ?',
          answer: 'Le silence vaut décision implicite de refus à la fin du délai.'
        },
        {
          question: 'Que se passe-t-il si la préfecture délivre un récépissé après le délai ?',
          answer: 'Le refus implicite existe quand même (CE, avis 2024).'
        },
        {
          question: 'Que faire si je n\'arrive pas à obtenir un rendez-vous en préfecture ?',
          answer: 'Vous pouvez : • Écrire un courrier recommandé • Saisir le défenseur des droits • Saisir le tribunal administratif en référé pour obliger l\'administration à vous recevoir'
        },
        {
          question: 'L\'administration refuse d\'enregistrer ma demande, que faire ?',
          answer: 'Vous pouvez demander : • Un accusé de réception écrit • Un recours gracieux • Un référé mesures utiles'
        },
        {
          question: 'Mon récépissé expire, mais je n\'ai pas de nouvelle ?',
          answer: 'La préfecture doit en délivrer un nouveau ou une prolongation ANEF.'
        },
        {
          question: 'Puis-je travailler avec un récépissé ?',
          answer: 'Oui si la mention est indiquée. Sinon, non.'
        },
        {
          question: 'Puis-je continuer mes études si mon titre expire ?',
          answer: 'Oui, si vous avez : • Un récépissé, ou • Une attestation de prolongation ANEF'
        },
        {
          question: 'Les absences ou redoublements posent-ils problème ?',
          answer: 'Pour les étudiants, oui : la préfecture vérifie l\'assiduité et la progression réelle.'
        },
        {
          question: 'Puis-je voyager pendant le renouvellement ?',
          answer: 'Oui, mais uniquement avec des documents qui autorisent le retour : • Récépissé • APS mention "retour autorisé"'
        },
        {
          question: 'Puis-je rentrer en France depuis mon pays d\'origine ?',
          answer: 'Seulement si vous avez un document provisoire avec autorisation de retour.'
        },
        {
          question: 'Et si j\'ai seulement l\'attestation de dépôt ANEF ?',
          answer: 'Vous ne pouvez pas voyager, sous risque : • D\'être bloqué à la frontière • De perdre votre demande en cours'
        },
        {
          question: 'Comment contester un refus implicite ?',
          answer: 'Vous avez 2 mois pour : • Demander la communication des motifs du refus • Déposer un recours gracieux • Effectuer un recours hiérarchique • Saisir le tribunal administratif'
        },
        {
          question: 'Puis-je rester en France pendant le recours ?',
          answer: 'Pas automatiquement. Mais le tribunal peut être saisi d\'un référé suspension si : • La décision porte gravement atteinte à votre situation • Le recours a des chances sérieuses de succès'
        },
        {
          question: 'Que faire si la préfecture ne répond jamais ?',
          answer: 'Au bout du délai légal, la décision implicite de refus existe. Vous pouvez alors agir en justice.'
        },
        {
          question: 'Comment changer de statut (étudiant → salarié, etc.) ?',
          answer: 'Vous devez présenter : • Preuves de réussite / assiduité (si étudiant) • Contrat ou promesse d\'embauche • Justificatifs de ressources'
        },
        {
          question: 'Que faire en cas de perte ou vol du titre de séjour ?',
          answer: 'Vous devez : • Déclarer la perte/vol • Demander un duplicata auprès de la préfecture • Présenter un justificatif pour voyager'
        },
        {
          question: 'Que faire en cas de changement d\'adresse ?',
          answer: 'Vous devez le signaler dans les 3 mois.'
        },
        {
          question: 'Quelle est la condition générale pour le renouvellement d\'une carte temporaire ou pluriannuelle ?',
          answer: 'Le renouvellement est subordonné à la preuve par l\'étranger qu\'il continue de remplir les conditions requises pour la délivrance de la carte dont il est titulaire. Exceptions : Les cartes "salarié détaché ICT" et "recherche d\'emploi ou création d\'entreprise" ne sont pas renouvelables.'
        },
        {
          question: 'Comment passe-t-on d\'une carte temporaire d\'un an à une carte pluriannuelle ?',
          answer: 'Au terme d\'une première année de séjour régulier (sous VLS ou CST), l\'étranger bénéficie d\'une carte de séjour pluriannuelle s\'il en fait la demande, à condition de : • Justifier de son assiduité et du sérieux de sa participation aux formations prescrites dans le cadre du CIR • Continuer de remplir les conditions de délivrance de la carte de séjour temporaire qu\'il détenait précédemment'
        },
        {
          question: 'Quelles sont les règles de renouvellement pour la carte de résident (CR) ?',
          answer: 'Sous réserve de l\'absence de menace grave pour l\'ordre public et de l\'établissement de la résidence habituelle en France, la carte de résident est renouvelable de plein droit.'
        },
        {
          question: 'Comment la "résidence habituelle" est-elle prouvée lors d\'une demande de renouvellement ?',
          answer: 'L\'étranger est considéré comme résidant en France de manière habituelle s\'il remplit deux conditions : • Il y a transféré le centre de ses intérêts privés et familiaux • Il y séjourne pendant au moins six mois au cours de l\'année civile, durant les trois dernières années précédant le dépôt de la demande (ou pendant la durée totale de validité du titre si celle-ci est inférieure à trois ans)'
        },
        {
          question: 'Que se passe-t-il si un étranger perd son emploi ?',
          answer: 'Si un étranger titulaire d\'une carte liée à une activité (telle que "salarié" ou certains "talent") se trouve involontairement privé d\'emploi, il n\'est pas considéré comme ayant cessé de remplir la condition d\'activité pour le renouvellement de sa carte. Sa carte peut être renouvelée pour une durée équivalente à celle des droits qu\'il a acquis à l\'allocation d\'assurance chômage.'
        },
        {
          question: 'Quels sont les motifs généraux de refus de délivrance ou de renouvellement d\'un titre de séjour ?',
          answer: 'Le refus peut être motivé par le fait que la présence de l\'étranger en France constitue une menace pour l\'ordre public (CST/CSP/APS), ou une menace grave pour l\'ordre public (CR/CR-UE). D\'autres motifs de refus ou de retrait incluent : • Vivre en France en état de polygamie • Le refus de souscrire au Contrat d\'engagement au respect des principes de la République (CERPR) ou le non-respect de ses obligations • Avoir cessé de remplir l\'une des conditions exigées pour la délivrance de la carte • Le non-respect de l\'obligation de quitter le territoire français dans les délais • Avoir commis certains faits exposant à des condamnations pénales spécifiques'
        },
        {
          question: 'Quelles sont les conséquences d\'un manquement au Contrat d\'Engagement au Respect des Principes de la République (CERPR) ?',
          answer: 'Le document de séjour de l\'étranger qui n\'a pas respecté le CERPR peut ne pas être renouvelé ou peut être retiré. La décision de refus ou de retrait tient compte de la gravité ou de la réitération des manquements, ainsi que de la durée du séjour en France.'
        }
      ]
    },
    {
      title: 'Renouvellement de titre de séjour salarié',
      items: [
        {
          question: 'Quand renouveler mon titre de séjour salarié ?',
          answer: 'Le renouvellement doit être demandé entre 2 et 4 mois avant l\'expiration du titre. Pour les titres pluriannuels, le renouvellement peut être demandé jusqu\'à 60 jours avant l\'expiration.'
        },
        {
          question: 'Quels sont les documents nécessaires ?',
          answer: 'Vous devez fournir : • Contrat de travail ou promesse d\'embauche • Fiches de paie des 3 derniers mois • Attestation employeur • Justificatif de domicile • Passeport • Formulaire de demande Des documents supplémentaires peuvent être demandés selon votre situation.'
        },
        {
          question: 'Quel est le montant minimum de salaire requis ?',
          answer: 'Le salaire doit être au moins égal au SMIC (environ 1 766,92€ brut mensuel en 2024). Pour certains métiers en tension, des exceptions peuvent s\'appliquer.'
        },
        {
          question: 'Que faire si je change d\'employeur ?',
          answer: 'Vous devez informer la préfecture de tout changement d\'employeur dans les 2 mois. Une nouvelle autorisation de travail peut être nécessaire selon votre situation.'
        },
        {
          question: 'Puis-je obtenir une carte de résident après plusieurs renouvellements ?',
          answer: 'Après 5 ans de résidence régulière en France avec un titre de séjour salarié, vous pouvez demander une carte de résident de 10 ans, sous réserve de remplir certaines conditions (emploi stable, ressources suffisantes, etc.).'
        }
      ]
    },
    {
      title: 'Changement de statut',
      items: [
        {
          question: 'Qu\'est-ce qu\'un changement de statut ?',
          answer: 'Le changement de statut permet de passer d\'un type de titre de séjour à un autre (par exemple, d\'étudiant à salarié, ou de visiteur à travailleur). La demande doit être faite avant l\'expiration du titre actuel.'
        },
        {
          question: 'Quand puis-je demander un changement de statut ?',
          answer: 'La demande peut être faite à tout moment avant l\'expiration de votre titre actuel, mais il est recommandé de la faire au moins 2 mois avant l\'expiration pour éviter toute interruption de séjour.'
        },
        {
          question: 'Quels sont les changements de statut possibles ?',
          answer: 'Les principaux changements incluent : • Étudiant → salarié • Visiteur → salarié • Étudiant → entrepreneur • Salarié → vie privée et familiale Chaque changement nécessite de remplir les conditions spécifiques du nouveau statut.'
        },
        {
          question: 'Que faire si ma demande de changement de statut est refusée ?',
          answer: 'En cas de refus, vous pouvez introduire un recours gracieux dans les 2 mois, ou un recours contentieux dans les 30 jours. Un recours suspensif peut être demandé pour éviter l\'expulsion.'
        },
        {
          question: 'Puis-je travailler pendant l\'instruction de ma demande ?',
          answer: 'Cela dépend de votre titre actuel. Si vous avez un titre étudiant, vous pouvez continuer à travailler dans la limite autorisée. Si vous passez d\'un statut visiteur à salarié, vous ne pouvez pas travailler avant l\'obtention du nouveau titre.'
        }
      ]
    },
    {
      title: 'Regroupement familial',
      items: [
        {
          question: 'Qu\'est-ce que le regroupement familial ?',
          answer: 'Le regroupement familial permet à un étranger résidant régulièrement en France de faire venir son conjoint et ses enfants mineurs. Le demandeur doit justifier de ressources suffisantes et d\'un logement décent.'
        },
        {
          question: 'Quelles sont les conditions pour bénéficier du regroupement familial ?',
          answer: 'Vous devez : • Résider régulièrement en France depuis au moins 18 mois • Disposer de ressources stables et suffisantes (au moins 1,2 SMIC pour une personne seule, plus pour chaque membre de la famille) • Avoir un logement décent et conforme aux normes d\'habitabilité'
        },
        {
          question: 'Quel est le délai d\'instruction d\'une demande de regroupement familial ?',
          answer: 'Le délai d\'instruction est généralement de 6 mois à compter du dépôt d\'un dossier complet. Ce délai peut être prolongé en cas de vérifications supplémentaires.'
        },
        {
          question: 'Puis-je faire venir mes parents dans le cadre du regroupement familial ?',
          answer: 'Non, le regroupement familial concerne uniquement le conjoint et les enfants mineurs. Pour faire venir vos parents, vous devez utiliser la procédure de visa de long séjour pour motif familial, qui a des conditions différentes.'
        },
        {
          question: 'Que faire si ma demande est refusée ?',
          answer: 'En cas de refus, vous disposez de 2 mois pour introduire un recours gracieux, ou de 30 jours pour un recours contentieux devant le tribunal administratif. Un recours suspensif peut être demandé.'
        }
      ]
    },
    {
      title: 'Titres de séjour \'Talent\' et \'Talent famille\'',
      items: [
        {
          question: 'Qu\'est-ce qu\'un titre de séjour \'Talent\' ?',
          answer: 'Le titre de séjour \'Talent\' est un titre pluriannuel (jusqu\'à 4 ans) destiné aux personnes hautement qualifiées, investisseurs, artistes, chercheurs, entrepreneurs, sportifs de haut niveau, etc. Il permet une installation durable en France.'
        },
        {
          question: 'Quelles sont les catégories de \'Talent\' ?',
          answer: 'Les principales catégories incluent : • Passeport talent (chercheur, artiste, investisseur, entrepreneur, etc.) • Talent famille (conjoint et enfants du titulaire d\'un passeport talent) • Certaines professions spécifiques reconnues'
        },
        {
          question: 'Quels sont les avantages du titre \'Talent\' ?',
          answer: 'Le titre \'Talent\' offre plusieurs avantages : • Durée de validité jusqu\'à 4 ans • Accès facilité à l\'emploi • Possibilité de faire venir la famille (talent famille) • Accès accéléré à la carte de résident après 3 ans au lieu de 5 ans'
        },
        {
          question: 'Comment obtenir un titre \'Talent famille\' ?',
          answer: 'Le conjoint et les enfants mineurs du titulaire d\'un passeport talent peuvent obtenir un titre \'Talent famille\'. La demande se fait en même temps que celle du titulaire principal ou après, en justifiant du lien familial.'
        },
        {
          question: 'Puis-je renouveler mon titre \'Talent\' ?',
          answer: 'Oui, le titre \'Talent\' est renouvelable. Le renouvellement doit être demandé entre 60 et 120 jours avant l\'expiration. Après 3 ans de résidence avec un titre Talent, vous pouvez demander une carte de résident de 10 ans.'
        }
      ]
    },
    {
      title: 'OQTF (Obligation de Quitter le Territoire Français)',
      items: [
        {
          question: 'Qu\'est-ce qu\'une OQTF ?',
          answer: 'L\'OQTF est une décision administrative qui ordonne à un étranger de quitter le territoire français dans un délai déterminé. Elle peut être prise en cas de séjour irrégulier, de non-respect des conditions du titre de séjour, ou après un refus de renouvellement.'
        },
        {
          question: 'Quels sont les délais pour quitter le territoire ?',
          answer: 'Les délais varient selon les cas : • 48 heures (urgence absolue) • 15 jours (séjour irrégulier) • 30 jours (cas général) Le délai commence à courir à compter de la notification de l\'OQTF.'
        },
        {
          question: 'Puis-je contester une OQTF ?',
          answer: 'Oui, vous pouvez contester une OQTF devant le tribunal administratif dans un délai de 30 jours (ou 48 heures pour les OQTF avec délai de 48h). Un recours suspensif peut être demandé pour éviter l\'expulsion pendant l\'instruction.'
        },
        {
          question: 'Que se passe-t-il si je ne quitte pas le territoire dans les délais ?',
          answer: 'Si vous ne quittez pas le territoire dans les délais impartis, vous risquez : • Une mesure d\'éloignement forcé • Une interdiction de retour sur le territoire • Des sanctions pénales Il est essentiel de contester rapidement l\'OQTF si vous estimez qu\'elle est injustifiée.'
        },
        {
          question: 'Puis-je régulariser ma situation après une OQTF ?',
          answer: 'Dans certains cas, oui. Si vous pouvez justifier d\'une situation nouvelle (mariage avec un Français, naissance d\'un enfant français, etc.), vous pouvez demander l\'annulation de l\'OQTF et la régularisation de votre situation.'
        }
      ]
    },
    {
      title: 'IRTF (Interdiction de Retour sur le Territoire Français)',
      items: [
        {
          question: 'Qu\'est-ce qu\'une IRTF ?',
          answer: 'L\'IRTF est une mesure qui interdit à un étranger de revenir en France pendant une période déterminée (généralement 3 ans, pouvant aller jusqu\'à 10 ans dans les cas graves). Elle est souvent prononcée en même temps qu\'une OQTF.'
        },
        {
          question: 'Dans quels cas une IRTF est-elle prononcée ?',
          answer: 'Une IRTF peut être prononcée en cas de : • Séjour irrégulier prolongé • Non-respect d\'une OQTF • Condamnation pénale • Menace à l\'ordre public La durée dépend de la gravité des faits.'
        },
        {
          question: 'Puis-je contester une IRTF ?',
          answer: 'Oui, vous pouvez contester une IRTF devant le tribunal administratif dans un délai de 30 jours. Un recours suspensif peut être demandé, mais il est plus difficile à obtenir que pour une OQTF.'
        },
        {
          question: 'Puis-je revenir en France avant la fin de l\'IRTF ?',
          answer: 'Dans certains cas exceptionnels, vous pouvez demander la levée de l\'IRTF (par exemple, pour des raisons familiales impérieuses, médicales, ou professionnelles). La demande doit être justifiée et adressée à la préfecture.'
        },
        {
          question: 'Que faire si je suis soumis à une IRTF et que j\'ai besoin de revenir en France ?',
          answer: 'Vous devez d\'abord demander la levée de l\'IRTF auprès de la préfecture compétente, en justifiant votre demande. Si la levée est refusée, vous pouvez contester cette décision devant le tribunal administratif.'
        }
      ]
    },
    {
      title: 'Refus Implicite et Délais de Recours',
      items: [
        {
          question: 'Qu\'est-ce qu\'une décision implicite de rejet et quel est son délai de survenance ?',
          answer: 'Une décision implicite de rejet intervient lorsque l\'autorité administrative garde le silence pendant plus de quatre mois sur une demande de titre de séjour. Ceci est régi par les dispositions des articles R*432-1 et R*432-2 du code de l\'entrée et du séjour des étrangers et du droit d\'asile.'
        },
        {
          question: 'Pourquoi une décision de refus de carte de séjour doit-elle être motivée ?',
          answer: 'Les décisions administratives individuelles défavorables qui restreignent l\'exercice des libertés publiques ou qui, de manière générale, constituent une mesure de police doivent être motivées. La décision refusant la délivrance ou le renouvellement d\'une carte de séjour est considérée comme une mesure de police et fait donc partie des décisions qui doivent être motivées. La motivation doit être écrite et comporter l\'énoncé des considérations de droit et de fait qui constituent le fondement de la décision.'
        },
        {
          question: 'Comment un demandeur peut-il obtenir les motifs d\'une décision implicite de rejet ?',
          answer: 'Bien qu\'une décision implicite de rejet ne soit pas illégale du seul fait qu\'elle ne soit pas assortie d\'une motivation (si la décision explicite aurait dû l\'être), l\'intéressé peut demander la communication de ces motifs. Cette demande de communication des motifs doit être formulée dans les délais du recours contentieux. Si cette demande est faite, les motifs doivent être communiqués par l\'administration dans le mois suivant cette demande.'
        },
        {
          question: 'Quel est l\'impact de la demande de communication des motifs sur le délai de recours contentieux ?',
          answer: 'Si l\'intéressé demande les motifs dans les délais, le délai du recours contentieux contre la décision implicite est prorogé (étendu). Cette prorogation dure jusqu\'à l\'expiration de deux mois suivant le jour où les motifs lui auront été communiqués.'
        },
        {
          question: 'Quelles sont les obligations de l\'administration concernant l\'accusé de réception et l\'information sur les recours ?',
          answer: 'Toute demande adressée à une autorité administrative doit faire l\'objet d\'un accusé de réception délivré dans les conditions définies par décret en Conseil d\'État. De plus, l\'administration a l\'obligation d\'informer l\'intéressé sur les voies et délais de recours.'
        },
        {
          question: 'Quand les délais de recours ne sont-ils pas opposables à l\'auteur de la demande ?',
          answer: 'Les délais de recours ne sont pas opposables à l\'auteur d\'une demande dans les cas suivants : 1. Lorsque l\'accusé de réception ne lui a pas été transmis ou ne comporte pas les indications exigées par la réglementation. 2. Lorsque l\'administration n\'a pas respecté son obligation d\'informer l\'intéressé sur les voies et délais de recours, ou s\'il n\'y a pas de preuve qu\'une telle information a été fournie. Dans ces situations, le non-respect des obligations administratives empêche que les délais de recours fixés par le code de justice administrative soient opposés au destinataire de la décision implicite.'
        },
        {
          question: 'Quel est le délai maximal pour exercer un recours contentieux en cas de non-opposabilité des délais ?',
          answer: 'Si le destinataire de la décision implicite est considéré comme toujours dans les délais du recours contentieux (parce que les délais ne lui sont pas opposables), il peut exercer un recours juridictionnel et demander la communication des motifs au préalable. Toutefois, ce délai d\'exercice ne saurait, en règle générale, excéder un an. Ce délai est compté à partir de la date à laquelle une décision expresse lui a été notifiée, ou de la date à laquelle il est établi qu\'il en a eu connaissance. Cette limite s\'applique sauf si le requérant se prévaut de circonstances particulières ou si des recours administratifs pour lesquels les textes prévoient des délais particuliers sont exercés.'
        }
      ]
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary/10">
      <Header variant="home" />

      {/* Hero Section */}
      <section className="relative py-16 bg-gradient-to-br from-primary/10 via-primary/5 to-background overflow-hidden">
        <div className="absolute inset-0 bg-grid-pattern opacity-5"></div>
        <div className="container mx-auto px-4 relative z-10">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-block mb-4 px-4 py-2 bg-primary/10 rounded-full border border-primary/20">
              <span className="text-sm font-medium text-primary">Foire aux questions - Droit des étrangers</span>
            </div>
            <h1 className="text-5xl font-bold mb-6 text-foreground leading-tight">
              Foire aux questions
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Droit des étrangers en France - Règles et procédures
            </p>
            <p className="text-lg text-muted-foreground mt-4 max-w-3xl mx-auto">
              Trouvez des réponses claires et complètes à vos questions sur les titres de séjour, les renouvellements, les changements de statut et les procédures administratives.
            </p>
          </div>
        </div>
      </section>

      <main className="container mx-auto px-4 py-16">
        <div className="max-w-5xl mx-auto">
          {faqSections.map((section, sectionIndex) => {
            const sectionId = `section-${sectionIndex}`;
            const isSectionOpen = openSections.has(sectionId);

            return (
              <div key={sectionIndex} className="mb-8">
                <button
                  onClick={() => toggleSection(sectionId)}
                  className="w-full flex items-center justify-between p-6 bg-white rounded-xl shadow-lg hover:shadow-xl transition-all border-2 border-primary/20 hover:border-primary mb-4"
                >
                  <h2 className="text-2xl font-bold text-foreground text-left">{section.title}</h2>
                  <span className="text-2xl text-primary ml-4 transform transition-transform">
                    {isSectionOpen ? '−' : '+'}
                  </span>
                </button>

                {isSectionOpen && (
                  <div className="space-y-4 pl-4">
                    {section.items.map((item, itemIndex) => {
                      const itemId = `${sectionId}-item-${itemIndex}`;
                      const isItemOpen = openItems.has(itemId);

                      return (
                        <div key={itemIndex} className="bg-white rounded-lg border border-border shadow-md">
                          <button
                            onClick={() => toggleItem(itemId)}
                            className="w-full flex items-start justify-between p-5 text-left hover:bg-muted/50 transition-colors rounded-lg"
                          >
                            <span className="font-semibold text-foreground pr-4 flex-1">{item.question}</span>
                            <span className={`text-primary text-xl flex-shrink-0 transform transition-transform ${isItemOpen ? 'rotate-180' : ''}`}>
                              ▼
                            </span>
                          </button>
                          {isItemOpen && (
                            <div className="px-5 pb-5 text-muted-foreground leading-relaxed whitespace-pre-line">
                              {item.answer}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* CTA Section */}
        <div className="max-w-4xl mx-auto mt-16 bg-gradient-to-br from-primary/10 to-primary/5 rounded-2xl p-12 border border-primary/20 text-center">
          <h2 className="text-3xl font-bold mb-4 text-foreground">
            Besoin d'aide supplémentaire ?
          </h2>
          <p className="text-lg text-muted-foreground mb-8">
            Nos experts sont à votre disposition pour répondre à toutes vos questions
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/contact">
              <Button size="lg" className="shadow-lg">
                Nous contacter
              </Button>
            </Link>
            <Link href="/auth/signup">
              <Button size="lg" variant="outline" className="shadow-lg">
                Créer un compte
              </Button>
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
