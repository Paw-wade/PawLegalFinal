# Calculateur – Délais titres de séjour : calculs et messages

Ce document décrit la logique du calculateur pour les titres de séjour

---
créé un formulaire contenant deux champs:
## Type de titre de séjour:
- talent carte bleue européenne
- salarié détaché ICT 
- salarié détaché mobile ICT 
- stagiaire mobile ICT 
- travailleur saisonnier 
- étudiant / étudiant mobilité
- recherche d'emploi ou création d'entreprise
- jeune au pair
- stagiaire
- talent-chercheur
- talent-chercheur-programme de mobilité.
- Autres titres de séjours

## Date de fin de validité du titre (ou du visa).
format jour/mois/année avec les slash automatiquement. icne calendrier pou un choix plus rapide.


Une fois que ce formulaire est rempli, tu dois afficher une timeline, étape par étape, avec des informations bien expliquées en fonction de ce qui suit pour toutes les étapes et pour tous les recours possibles en fonction des dates que tu as. N'oublie pas les codes couleurs.

## 1. Période d'introduction de la demande (première demande de titre de séjour et renouvellement)

**Calcul** (article R.431-5 CESEDA) :
- **Date de référence** : date de fin de validité du titre (ou du visa).
- **Début de période** = 4 mois avant = `dateFinValidite - 120 jours`.
- **Fin de période** = 2 mois avant = `dateFinValidite - 60 jours`.
- La fenêtre légale est donc **entre 4 mois et 2 mois avant** la date de fin de validité.

**Messages d’explication** (selon la situation) :
- **Pas encore ouvert** : *"Le renouvellement [ou la première demande] pourra être effectué entre quatre mois et deux mois avant la date de fin de validité, soit du [dateDebut] au [dateFin]."* + *"Le renouvellement sera possible à partir du [dateDebut]."*
- **Dans la période** : *"Le renouvellement [ou la première demande] peut être effectué entre quatre mois et deux mois avant la date de fin de validité…"* + délai restant avant d’entrer dans la zone des 2 mois.
- **Délai dépassé** : *"Le renouvellement [ou la première demande] aurait dû être introduit entre quatre mois et deux mois avant…"* + avertissement droit de régularisation 180 €.

Référence affichée : **article R.431-5 du CESEDA**.

---

## 2. Date de naissance de la décision implicite de rejet


Selon les articles R.432-1 et R.432-2 du CESEDA :

le silence de l’administration vaut décision implicite de rejet

cette décision naît à l’expiration d’un délai qui dépend du "Type de titre de séjour" selection dans le formulaire.

La date de naissance de la décision implicite = date de dépôt de la demande complète + délai applicable

Le point de départ est la date d’introduction d’une demande complète qui est la date de notification de la confirmation de dépôt de la demande.

le tableau suivant contient les délais à partir desquels nait la decision implicite de rejet

| Type de titre de séjour                      | Article CESEDA | Délai de naissance de la DIR |
| -------------------------------------------- | -------------- | ---------------------------- |
| Talent carte bleue européenne                | R.421-23       | **90 jours**                 |
| Salarié détaché ICT                          | R.421-43       | **90 jours**                 |
| Salarié détaché mobile ICT                   | R.421-47       | **90 jours**                 |
| Stagiaire mobile ICT                         | R.421-54       | **90 jours**                 |
| Travailleur saisonnier                       | R.421-60       | **90 jours**                 |
| Étudiant / étudiant mobilité                 | R.422-5        | **90 jours**                 |
| Recherche d’emploi ou création d’entreprise  | R.422-12       | **90 jours**                 |
| Jeune au pair                                | R.426-14       | **90 jours**                 |
| Stagiaire                                    | R.426-17       | **90 jours**  
| Talent-chercheur / talent-chercheur mobilité | R.421-26       | **60 jours**   
  Talent-chercheur-programme de mobilité       | R.421-26       | **60 jours**                    |
| Autres titres de séjour                      | R.432-2        | **4 mois**                   |



**Calcul** :
#La **décision implicite de rejet** naît du silence gardé pendant 4 mois après le dépôt de la demande pour la catégorie "Autres titres de séjour" 
- Formule : **date de naissance du refus implicite = date de notification de la confirmation du dépôt + 4 mois**  
  `dateRejetImplicite = dateNotificationConfirmationDepot + 4 mois`.


#La **décision implicite de rejet** naît du silence gardé pendant 90 jours après le dépôt de la demande pour les catégories suivantes : 
- talent carte bleue européenne
- salarié détaché ICT 
- salarié détaché mobile ICT 
- stagiaire mobile ICT 
- travailleur saisonnier 
- étudiant / étudiant mobilité
- recherche d'emploi ou création d'entreprise
- jeune au pair
- stagiaire 

Formule : **date de naissance du refus implicite = date de notification de la confirmation du dépôt + 90 jours (3 mois)**  
  `dateRejetImplicite = dateNotificationConfirmationDepot + 90 jours (3 mois).

#La **décision implicite de rejet** naît du silence gardé pendant 60 jours après le dépôt de la demande pour la catégories 
- talent-chercheur
- talent-chercheur-programme de mobilité.

Formule : **date de naissance du refus implicite = date de notification de la confirmation du dépôt + 60 jours (2 mois)**  
  `dateRejetImplicite = dateNotificationConfirmationDepot + 60 jours (2 mois).


**Messages d’explication** :

Aux termes de l'article R* 432-1 du code de l'entrée et du séjour des étrangers en France et du droit d'asile : « Le silence gardé par l'autorité administrative sur les demandes de titres de séjour vaut décision implicite de rejet. » Selon l'article R. 432-2 du même code : « La décision implicite de rejet mentionnée à l'article R.* 432-1 naît au terme d'un délai de quatre mois. nb: les titres concernés par ce delai sont ceux qui sont dasn le champ "Autres titre de séjours"
 
***Par dérogation au premier alinéa, ce délai est de quatre-vingt-dix jours lorsque l'étranger sollicite la délivrance d'un titre de séjour: ( les references legales sont mentionnées entre parenthèses):

- talent carte bleue européenne (R.421-23)
- salarié détaché ICT (R.421-43)
- salarié détaché mobile ICT (R.421-47)
- stagiaire mobile ICT (R.421-54)
- travailleur saisonnier (R.421-60)
- étudiant / étudiant mobilité (R.422-5)
- recherche d'emploi ou création d'entreprise (R.422-12)
- jeune au pair (R.426-14)
- stagiaire (R.426-17)
 
**Par dérogation au premier alinéa ce délai est de soixante jours lorsque l'étranger sollicite la délivrance du titre de séjour mentionné à l'article R. 421-26 (portant la mention " talent-chercheur " ou " talent-chercheur-programme de mobilité " prévue à l‘article L. 421-14)

la décision implicite de rejet est un mécanisme important pour éviter qu’une administration ne laisse un demandeur sans réponse indéfiniment. C’est fréquent dans les demandes de titre de séjour.
Principe de la décision implicite de rejet : Lorsqu’une personne dépose une demande auprès de l’administration (par exemple une demande de titre de séjour auprès de la préfecture), celle-ci dispose d’un délai pour répondre ( mois en principe pour la plupart des titres de sejour).
Si l’administration ne répond pas dans ce délai, le silence vaut décision implicite de rejet.
Dans le domaine des titres de séjour, le délai est en général de 4 mois après le dépôt d’un dossier complet.
Cependant, il n’y a pas de lettre de refus, mais juridiquement on considère qu’une décision de refus existe. 
Cela ne signifie pas forcément que la demande est réellement rejetée
La décision implicite est une fiction juridique.
Elle ne veut pas dire que la préfecture a examiné le dossier et décidé de refuser.
Elle signifie seulement que le délai légal de réponse est dépassé.
Dans la pratique, plusieurs situations peuvent expliquer ce silence :
•	le dossier est toujours en cours d’instruction
•	l’administration est en retard
•	il manque des documents
•	le service est saturé
Il est donc possible que la préfecture réponde plus tard et accorde finalement le titre de séjour.
Pourquoi ce mécanisme existe ?
Sans cette règle, une personne pourrait rester bloquée pendant longtemps sans réponse.
La décision implicite sert donc à ouvrir les voies de recours à l’intéressé afin d’éviter l’attente indéfinie. Autrement dit, c’est un outil de protection pour le demandeur.
Ainsi, le silence de l’administration n’est pas une situation neutre : il produit une décision juridique qui permet au demandeur d’agir.


---

## 3. Période pour faire un référé mesures utiles

Pour la premiere demande et le renouvellement :
•	Le référé mesure utile doit être déposé avant la naissance d’une décisioncision implicete de rejet.
•	Pour s’assurer la recevabilité du recours, le référé mesures utiles doit etre déposé de préférence au plus tard 15 jours avant la naissance de la décision implicite de rejet.
•	Après la naissance de la décision implicite (4 mois après dépôt), il n’est plus possible de déposer un référé mesure utile.
•	Dans ce cas il faut faire référé suspension. Mais il est recommandé de faire une demande communications des motifs avant.


---

## 4. Période pour faire une demande de communication des motifs

**Calcul** 

Dans les **30 jours** après la naissance de la décision implicite (4 mois après dépôt).

- À partir de cette date : **date limite de réponse (administration) = dateDemandeMotifs + 1 mois**.


**Messages d’explication** :
Principe : l’article L232-4 du Code des relations entre le public et l'administration énonce , « […] à la demande de l'intéressé, formulée dans les délais du recours contentieux, les motifs de toute décision implicite de rejet devront lui être communiqués dans le mois suivant cette demande. [Que] dans ce cas, le délai du recours contentieux contre ladite décision est prorogé jusqu'à l'expiration de deux mois suivant le jour où les motifs lui auront été communiqués ».

Nb : comprends que le délai du recours contentieux est aux termes de l'article R. 421-2 du code de justice administrative, « sauf disposition législative ou réglementaire contraire et dans les cas de la naissance d’une décision implicite de rejet de deux mois à compter de la date à laquelle est née cette décision implicite de rejet ».

generalement l'administration ne répond pas. Mais si elle ecommunique les motifs de la décision implicite de rejet, le delais du recours sera de deux mois à compter de la date de notification des motifs demandés

Nb : avant l’introduction d’un référé suspension en cas de decision implicite de rejet, il est fortement conseillé d’introduire une demande de communication des motifs car l’absense de réponse par l’administration dans un délai de 30 jours suivant la demande peut avoir pour conséquence l’illégalité de la décision implicite de rejet et conduire à sa suspension.



---

## 5. Période pour faire un référé suspension 


Principe:Le référé suspension se fait sur le fondement de l’article L.521-1 code de justice administrative. Il vise à demander la suspension de la décision implicite de rejet lorsque l'urgence le justifie et qu'il est fait état d'un moyen propre à créer, en l'état de l'instruction, un doute sérieux quant à la légalité de la décision. 
 

Délai : Le référé suspension n’est possible en cas de naissance d’une decision implicite de rejet à partir de la date de naissance de cette décision jusqu’à l’écoulement d’un délai de deux mois. 

**Calcul** :
- **Si la demande de communication des motifs n'a pas été faite, le référé suspension est possible à partir de la naissance de la décision implicite de rejet, j'usqu'à l'expiration d'un délai de deux mois.
- **Si demande de communication des motifs a été faite : il faut distinguer deux situations selon que l'administration à repondu dans un délai de 30 jours ou pas.

  - si l'administration a communiqué les motifs dans le délai de 30 jours, la délai du référé suspension est de deux mois à compter de la notification des motifs = **date de notification des motifs + 2 mois** ;  
  - si l'administration n'a pas communiqué les motifs dans le délai de 30 jours, la délai du référé suspension est de deux mois à compter de l'ecoulement du délai de 30 jours depuis la date de la demande de communication des motifs.
  
 NB: pour la recevabilité du référé suspension, il est obligatoire d'introduire un recours en annulation qui est un recours au fond. les délais du recours au fond se calculent de la meme facon que ceux de du référé suspension.


Maintenant:
#  si la date du jour est comprise dans la  Période d'introduction de la demande (première demande de titre de séjour et renouvellement) donc entre 4 mois et 2 mois avant la date de fin de validité du titre ou du visa.
-précise dans une infirmation en vert que la période de roenouvellement est ouverte depuis + date..
- précise le nombre de jours restant avant la sortie de cette période


# si la date du jour est comprise dans avant la Période d'introduction de la demande (première demande de titre de séjour et renouvellement) donc avant les 4 mois précédent la date de fin de validité du titre ou du visa.
- precise dans une infirmation en bleu que la période de roenouvellement n'est pas encore ouverte. 
- precise la période d'ouverture.

#  si la date du jour est comprise après la Période d'introduction de la demande (première demande de titre de séjour et renouvellement) donc après les 2 mois précédents la date de fin de validité du titre ou du visa.
  -  precise que l'étranger devra payer un visa de régularisation de 180 euros qui doit être acquitté, sauf cas de force majeure ou présentation d'un visa en cours de validité.
  - précise que l'administration n'a plus l'obligation de respecter les délai car l'étranger n'a pas été diligent.

ouvre des case à cocher:

- Je n'ai pas reçu de réponse à ma demande 
- J'ai reçu un refus de titre de séjour
- J'ai un refus d'enregistrement de ma demande
- J'ai reçu une OQTF (Obligation de quitter le territoire)

 si le champ "Je n'ai pas reçu de réponse à ma demande" est selectionné ouvre autre champ "Date d'introduction de la demande complète (première demande de titre de séjour et renouvellement)". rappel: la date d’introduction d’une demande complète est la date de notification de la confirmation de dépôt de la demande. 
 donne une imformation claire et expliquée avec les couleurs vert si on est dans les delais, rouge si délai dépassé et bleu si la demande n'est pas encore ouverte pour:
 - le référé mesures utiles
 - la demande de communication des motifs
 - le référé suspenion et le recours en annulation qui est le recours au fond.

 invite toujours l'étranger à se faire accompagner par la plateforme.


 si le champ "J'ai reçu un refus de titre de séjour" ou "J'ai un refus d'enregistrement de ma demande" est selectionné ouvre autre champ "Date de notification du refus". 

 donne une imformation claire et expliquée avec les couleurs vert si on est dans les delais, rouge si délai dépassé et bleu si la demande n'est pas encore ouverte pour:

 - le référé suspenion et le recours en annulation qui est le recours au fond le ponit de départ es la "Date de notification du refus"
 - precise qu'il n'est pas possible de faire ni - le référé mesures utiles nila demande de communication des motifs- le référé mesures utiles.
 invite toujours l'étranger à se faire accompagner par la plateforme.

 si le champ "J'ai reçu une OQTF (Obligation de quitter le territoire)" est selectionné, invite directement l'étranger à se faire accompagner par la plateforme. precise que l'accompagnement par un avocat peut etre necessaire.
 

