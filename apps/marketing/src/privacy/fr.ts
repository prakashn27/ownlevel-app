import { legal } from "../legal";
import type { PrivacyDoc } from "./types";

const mail = `<a href="mailto:${legal.privacyEmail}">${legal.privacyEmail}</a>`;
const officer = legal.privacyOfficer === "Privacy Officer" ? "responsable de la protection des renseignements personnels" : legal.privacyOfficer;

export const fr: PrivacyDoc = {
  title: "Politique de confidentialité",
  description: "Comment Ownlevel recueille, utilise, communique et protège les renseignements personnels, et les droits dont vous disposez.",
  updated: "Date d'entrée en vigueur",
  toc: "Table des matières",
  summaryTitle: "Sommaire",
  summary: [
    "Nous agissons à titre de <strong>sous-traitant / fournisseur de services</strong> pour les agences qui utilisent Ownlevel : elles décident de l'usage des données de leurs clients et contacts, et nous les traitons selon leurs instructions.",
    "Nous agissons à titre de <strong>responsable du traitement</strong> uniquement pour notre site Web, les titulaires de comptes de nos clients, la facturation, la sécurité et l'exploitation du produit.",
    "Nous <strong>ne vendons pas</strong> les renseignements personnels et ne les communiquons pas à des fins de publicité comportementale intercontextuelle.",
    "Ce site Web <strong>n'utilise pas</strong> de témoins publicitaires ni d'analyse.",
    "Écrivez-nous à " + mail + " pour exercer vos droits.",
  ],
  sections: [
    {
      id: "qui-sommes-nous",
      title: "1. Qui nous sommes et portée de la présente politique",
      html: `
<p>La présente politique de confidentialité explique comment <strong>${legal.entity}</strong> (« <strong>Ownlevel</strong> », « <strong>nous</strong> »), située au ${legal.address}, traite les renseignements personnels lorsque vous :</p>
<ul>
  <li>visitez notre site Web de présentation (le « <strong>Site</strong> ») ;</li>
  <li>créez un compte ou utilisez la plateforme Ownlevel, ses applications, API et intégrations d'IA/MCP (le « <strong>Service</strong> ») ;</li>
  <li>communiquez avec nous (soutien, ventes, courriel, événements).</li>
</ul>
<p>Ownlevel est une plateforme en marque blanche. Nos clients sont des agences (les « <strong>Agences</strong> ») qui utilisent le Service pour servir leurs propres clients (les « <strong>Clients</strong> ») ainsi que les personnes qui interagissent avec ces Clients (les « <strong>Contacts</strong> » : prospects, clients, patients, visiteurs, etc.). La section 2 précise qui est responsable de quelles données.</p>
<p>La présente politique ne s'applique pas (a) aux sites Web, portails, courriels ou messages des Agences, qui sont régis par la politique de l'Agence, ni (b) aux instances d'Ownlevel exploitées par un tiers sur sa propre infrastructure (voir la section 15).</p>
<p>Si vous n'êtes pas d'accord avec la présente politique, veuillez ne pas utiliser le Site ni le Service.</p>`,
    },
    {
      id: "roles",
      title: "2. Notre rôle : responsable ou sous-traitant",
      html: `
<p><strong>Lorsque nous sommes responsable du traitement</strong> (ou l'organisation responsable des renseignements personnels). Nous déterminons les finalités et les moyens du traitement pour : le Site ; les comptes des utilisateurs des Agences, l'authentification et la facturation ; notre propre marketing et nos ventes ; la sécurité, la prévention de la fraude et la détection des abus ; les statistiques d'utilisation du Service ; la conformité légale ; et les demandes de soutien qui nous sont adressées.</p>
<p><strong>Lorsque nous sommes sous-traitant</strong> (ou « fournisseur de services » / mandataire). Lorsqu'une Agence ou un Client saisit des données de Contacts dans le Service (fiches de contacts, conversations, rendez-vous, formulaires, contenu d'appels ou de messages, fichiers, etc.), l'Agence est responsable de ces données et nous ne les traitons que pour fournir le Service, selon ses instructions documentées et conformément à notre entente client et à nos conditions de traitement des données. Nous n'utilisons pas les données des Contacts à nos propres fins, sauf pour exploiter, sécuriser et soutenir le Service et pour respecter la loi.</p>
<p><strong>Si vous êtes un Contact</strong> d'une Agence ou d'un Client (par exemple, vous avez pris un rendez-vous ou envoyé un message) et souhaitez accéder à vos données, les corriger ou les supprimer, veuillez d'abord vous adresser à cette entreprise : elle contrôle vos données et décide de la suite à donner. Si vous nous écrivez, nous transmettrons votre demande à l'Agence concernée lorsque nous pouvons l'identifier, et nous ne répondrons pas au fond de la demande sans instruction de l'Agence ou obligation légale.</p>
<p>Les Agences sont responsables de disposer d'un fondement légitime, de donner les avis requis et d'obtenir les consentements nécessaires (notamment pour les appels, les SMS et le marketing par courriel, l'enregistrement et le traitement par IA) avant de charger des données de Contacts dans le Service ou d'envoyer des messages par son entremise.</p>`,
    },
    {
      id: "renseignements-recueillis",
      title: "3. Renseignements que nous recueillons",
      html: `
<h3>3.1 Renseignements que vous nous fournissez</h3>
<ul>
  <li><strong>Données de compte :</strong> nom, courriel professionnel, mot de passe (conservé uniquement sous forme de hachage salé), rôle, nom de l'agence, noms d'hôte ou domaines personnalisés, éléments de marque.</li>
  <li><strong>Données de facturation :</strong> nom et adresse de facturation, forfait, factures et état des paiements. Les données de carte sont traitées par notre processeur de paiement et ne sont pas conservées par nous.</li>
  <li><strong>Communications :</strong> messages envoyés au soutien ou aux ventes et leur contenu.</li>
  <li><strong>Contenu que vous placez dans le Service</strong> (Données client) : il peut s'agir des données de Contacts décrites à la section 2. Nous ne décidons pas de ce que vous y saisissez ; ne soumettez pas de données que vous n'avez pas le droit de soumettre.</li>
</ul>
<h3>3.2 Renseignements recueillis automatiquement</h3>
<ul>
  <li><strong>Données techniques et de sécurité :</strong> adresse IP, type d'appareil et de navigateur, système d'exploitation, journaux de requêtes (URL, horodatage, statut), événements d'authentification, identifiants de session, signaux de limitation de débit et d'abus.</li>
  <li><strong>Données d'utilisation du Service :</strong> fonctions utilisées, appels API/MCP, diagnostics d'erreurs et de performance. Nous les utilisons pour exploiter, sécuriser et améliorer le Service.</li>
</ul>
<h3>3.3 Renseignements provenant de services connectés</h3>
<p>Si vous ou votre Agence connectez des services tiers (par exemple un calendrier, un fournisseur de courriel ou de messagerie, ou un assistant d'IA par OAuth/MCP), nous recevons les données que ces services partagent selon les autorisations (portées) que vous approuvez, et nous conservons les jetons nécessaires au maintien de la connexion. Vous pouvez révoquer une connexion en tout temps dans le Service ou auprès du tiers.</p>
<h3>3.4 Renseignements sensibles</h3>
<p>Nous ne demandons pas de renseignements personnels sensibles pour nos propres besoins. Les Agences des secteurs de la santé, du droit, de l'assurance ou des finances peuvent conserver des renseignements sensibles sur leurs Contacts dans le Service. Si vous êtes assujetti à des règles particulières (par exemple HIPAA ou des lois semblables sur les renseignements de santé), vous devez avoir conclu les ententes appropriées avec nous <em>avant</em> d'y saisir ces données. À défaut, n'utilisez pas le Service pour des renseignements de santé protégés.</p>`,
    },
    {
      id: "temoins",
      title: "4. Témoins (cookies) et technologies semblables",
      html: `
<p><strong>Le Site</strong> n'installe aucun témoin publicitaire, d'analyse ou de suivi et n'utilise pas de pixels publicitaires de tiers. Notre hébergeur peut traiter des données techniques de requête (comme l'adresse IP) pour diffuser et protéger le Site.</p>
<p><strong>Le Service</strong> (l'application Web) n'utilise que des témoins et un stockage local strictement nécessaires pour vous garder connecté, protéger contre la falsification de requêtes intersites et mémoriser des préférences essentielles (comme la langue). Ils ne requièrent pas de consentement et ne peuvent être désactivés sans nuire au fonctionnement du Service.</p>
<p>Si nous ajoutons un jour des témoins non essentiels ou des outils d'analyse, nous mettrons à jour la présente politique et, lorsque la loi l'exige, nous demanderons d'abord votre consentement. Nous respectons le signal Global Privacy Control (GPC) et les signaux de retrait semblables lorsque la loi l'exige.</p>`,
    },
    {
      id: "utilisation",
      title: "5. Utilisation des renseignements et fondements juridiques",
      html: `
<p>Lorsque le RGPD ou le RGPD du Royaume-Uni s'applique, nous nous appuyons sur les fondements ci-dessous (au Canada, nous nous appuyons sur votre consentement, exprès ou implicite, ou sur un autre fondement permis par la loi) :</p>
<table>
  <thead><tr><th>Finalité</th><th>Fondement juridique</th></tr></thead>
  <tbody>
    <tr><td>Fournir, maintenir et soutenir le Service ; créer et gérer les comptes ; traiter les paiements</td><td>Exécution d'un contrat ; intérêts légitimes</td></tr>
    <tr><td>Authentifier les utilisateurs, sécuriser le Service, prévenir la fraude, les abus et le pourriel, faire respecter nos conditions</td><td>Intérêts légitimes (sécurité du Service) ; obligation légale</td></tr>
    <tr><td>Statistiques d'utilisation, débogage, planification de la capacité et amélioration du Service (au moyen de données dépersonnalisées ou agrégées lorsque c'est possible)</td><td>Intérêts légitimes</td></tr>
    <tr><td>Envoyer des avis liés au service (sécurité, facturation, modifications des conditions)</td><td>Exécution d'un contrat ; obligation légale</td></tr>
    <tr><td>Envoyer des courriels promotionnels sur Ownlevel à des contacts d'affaires</td><td>Consentement, ou intérêts légitimes lorsque la loi le permet ; vous pouvez vous désabonner en tout temps</td></tr>
    <tr><td>Respecter la loi, répondre à des demandes légales, établir ou défendre des droits</td><td>Obligation légale ; intérêts légitimes</td></tr>
  </tbody>
</table>
<p>Nous ne prenons pas de décisions à l'égard de personnes fondées exclusivement sur un traitement automatisé qui produisent des effets juridiques ou significatifs semblables. Nous ne vendons pas de renseignements personnels et n'utilisons pas les Données client pour établir des profils publicitaires.</p>`,
    },
    {
      id: "ia",
      title: "6. Fonctions d'intelligence artificielle",
      html: `
<p>Le Service comprend des fonctions d'IA (comme des agents IA, la rédaction et le résumé, et la possibilité de connecter des assistants d'IA par MCP). Lorsque vous les utilisez, le contenu pertinent (par exemple un fil de messages ou une fiche de contact) est transmis à un fournisseur de modèles d'IA afin de produire un résultat pour vous.</p>
<ul>
  <li>Nous ne transmettons que les données nécessaires à la fonction demandée.</li>
  <li>Nous n'utilisons pas les Données client pour entraîner nos modèles d'IA ni des modèles d'IA généraux de tiers, et nous ne permettons pas à nos fournisseurs d'IA de le faire.</li>
  <li>Le contenu généré par l'IA peut être inexact. Les actions sortantes des agents IA sont conçues pour exiger une approbation humaine, et les Agences demeurent responsables de vérifier le contenu avant de s'y fier ou de l'envoyer.</li>
  <li>Lorsqu'une Agence connecte un assistant d'IA externe (par exemple Claude ou ChatGPT) par OAuth/MCP, les données partagées avec cet assistant sont régies par les conditions et la politique de confidentialité de son fournisseur, et non par les nôtres.</li>
  <li>Les Agences sont responsables d'informer leurs Contacts de l'utilisation de l'IA et d'obtenir tout consentement ou de faire toute divulgation requis.</li>
</ul>`,
    },
    {
      id: "communication",
      title: "7. Communication des renseignements personnels",
      html: `
<p>Nous ne vendons pas de renseignements personnels et ne les « partageons » pas à des fins de publicité comportementale intercontextuelle. Nous ne les communiquons que dans les cas suivants :</p>
<ul>
  <li><strong>Agences et Clients.</strong> Les données de Contacts appartiennent à l'Agence concernée et sont accessibles à ses utilisateurs autorisés selon les rôles et permissions qu'elle configure.</li>
  <li><strong>Fournisseurs de services (sous-traitants ultérieurs).</strong> Des fournisseurs qui nous aident à exploiter le Service, en vertu de contrats écrits qui limitent leur usage des données à nos instructions et exigent une sécurité appropriée. Ils appartiennent aux catégories suivantes :
    <ul>
      <li>hébergement infonuagique, réseau, CDN, sécurité et calcul en périphérie (<strong>Cloudflare</strong>) ;</li>
      <li>hébergement de base de données gérée et stockage ;</li>
      <li>envoi de courriels transactionnels (<strong>Resend</strong>) ;</li>
      <li>transporteurs et API de SMS, de voix et de messagerie, lorsqu'une Agence active la messagerie ;</li>
      <li>fournisseurs de modèles d'IA (section 6) ;</li>
      <li>traitement des paiements et facturation ;</li>
      <li>intégrations de calendrier et de courriel que vous connectez ;</li>
      <li>outils de surveillance des erreurs, de soutien et de communication.</li>
    </ul>
    Une liste à jour indiquant le lieu de traitement de chaque sous-traitant ultérieur est disponible sur demande à ${mail}. Nous donnons aux clients un préavis des nouveaux sous-traitants ultérieurs qui traitent des Données client, ainsi que la possibilité de s'y opposer, selon les modalités de notre entente client.</li>
  <li><strong>Obligations légales et sécurité.</strong> Lorsque nous croyons de bonne foi que la communication est exigée par la loi, une assignation, une ordonnance judiciaire ou une demande gouvernementale valide, ou qu'elle est nécessaire pour protéger des droits, la sécurité ou des biens, ou pour détecter et prévenir la fraude ou les abus. Lorsque la loi le permet, nous aviserons d'abord le client touché et contesterons les demandes qui nous semblent trop larges.</li>
  <li><strong>Transactions commerciales.</strong> En cas de fusion, d'acquisition, de financement, de réorganisation ou de vente d'actifs, des renseignements personnels peuvent être transférés au successeur, qui doit continuer de respecter la présente politique ou vous aviser des changements et de vos choix.</li>
  <li><strong>Sur votre directive ou avec votre consentement.</strong> Par exemple, lorsque vous activez une intégration.</li>
  <li><strong>Données dépersonnalisées ou agrégées</strong> qui ne permettent pas raisonnablement de vous identifier, et que nous ne tenterons pas de réidentifier.</li>
</ul>`,
    },
    {
      id: "transferts",
      title: "8. Transferts internationaux",
      html: `
<p>Nous et nos sous-traitants ultérieurs pouvons traiter et conserver des renseignements personnels dans des pays autres que celui où vous résidez, y compris le Canada, les États-Unis et l'Union européenne. Ces pays peuvent avoir des lois sur la protection des données différentes des vôtres, et vos renseignements peuvent être accessibles aux tribunaux et aux autorités de ces pays.</p>
<p>Lorsque la loi l'exige, nous recourons à des garanties appropriées : les clauses contractuelles types de la Commission européenne (et l'addenda sur les transferts internationaux du Royaume-Uni), les décisions d'adéquation et, pour le Québec, une évaluation des facteurs relatifs à la vie privée et des ententes écrites avant toute communication de renseignements personnels à l'extérieur du Québec. Vous pouvez demander une copie des garanties applicables à ${mail}.</p>`,
    },
    {
      id: "conservation",
      title: "9. Conservation",
      html: `
<p>Nous ne conservons les renseignements personnels que le temps nécessaire aux fins décrites dans la présente politique, puis nous les détruisons ou les dépersonnalisons.</p>
<ul>
  <li><strong>Données de compte et de facturation :</strong> tant que le compte est actif, puis selon les besoins pour respecter les obligations comptables, fiscales et légales (généralement jusqu'à sept ans pour les documents financiers).</li>
  <li><strong>Données client (y compris les données de Contacts) :</strong> jusqu'à ce que l'Agence les supprime ou que l'entente prenne fin. Après la résiliation, nous les supprimons ou les restituons dans un délai raisonnable (généralement 30 jours), sous réserve des obligations légales de conservation. Les données supprimées peuvent subsister dans des sauvegardes chiffrées pendant une période limitée (généralement jusqu'à 35 jours) jusqu'à leur écrasement.</li>
  <li><strong>Journaux de sécurité et de requêtes :</strong> généralement jusqu'à 12 mois, plus longtemps au besoin pour enquêter sur un incident ou si la loi l'exige.</li>
  <li><strong>Communications de marketing et de soutien :</strong> jusqu'à ce que vous vous désabonniez ou demandiez leur suppression, ou pendant une période raisonnable après notre dernière interaction.</li>
</ul>
<p>Les Agences établissent leurs propres pratiques de conservation des données de Contacts et en sont responsables.</p>`,
    },
    {
      id: "securite",
      title: "10. Sécurité et incidents",
      html: `
<p>Nous appliquons des mesures techniques et organisationnelles proportionnées à la sensibilité des données, notamment :</p>
<ul>
  <li>le chiffrement des données en transit (TLS) ;</li>
  <li>un cloisonnement strict des locataires : la sécurité au niveau des lignes de la base de données garantit que chaque Agence et chaque Client n'accède qu'à ses propres données ;</li>
  <li>un contrôle d'accès fondé sur les rôles, l'accès au moindre privilège pour notre personnel et des jetons OAuth à portée limitée et de courte durée pour les applications et assistants d'IA ;</li>
  <li>des mots de passe hachés, des contrôles de session et une limitation de débit ;</li>
  <li>des sauvegardes, des procédures de reprise et la journalisation des accès.</li>
</ul>
<p>Aucun système n'est parfaitement sûr et nous ne pouvons garantir une sécurité absolue. Vous êtes responsable de la confidentialité de vos identifiants et de la configuration des permissions de vos utilisateurs.</p>
<p>Si nous constatons une atteinte aux mesures de sécurité touchant des renseignements personnels, nous l'évaluerons et aviserons sans délai les clients touchés et, lorsque la loi l'exige, les organismes de réglementation et les personnes concernées. Pour les renseignements personnels traités pour le compte d'une Agence, nous aviserons l'Agence afin qu'elle s'acquitte de ses propres obligations. Nous tenons un registre des incidents de confidentialité, comme l'exige la loi québécoise.</p>`,
    },
    {
      id: "droits",
      title: "11. Vos droits en matière de vie privée",
      html: `
<p>Selon l'endroit où vous résidez, vous pouvez disposer de tout ou partie des droits ci-dessous. Nous n'exigeons aucuns frais et ne vous traitons pas de façon discriminatoire parce que vous les exercez, sauf dans la mesure permise par la loi pour les demandes manifestement non fondées ou excessives.</p>
<ul>
  <li><strong>Accès</strong> aux renseignements personnels que nous détenons à votre sujet et à l'information sur leur utilisation et leur communication ;</li>
  <li><strong>Rectification</strong> des renseignements inexacts ou incomplets ;</li>
  <li><strong>Suppression</strong> de vos renseignements (sous réserve des exceptions légales) ;</li>
  <li><strong>Portabilité</strong> dans un format technologique structuré et couramment utilisé ;</li>
  <li><strong>Limitation ou opposition</strong> à certains traitements, y compris la prospection ;</li>
  <li><strong>Retrait du consentement</strong> en tout temps, sans effet sur les traitements antérieurs ;</li>
  <li><strong>Refus de la vente, du partage et de la publicité ciblée</strong> (nous ne faisons rien de cela) ;</li>
  <li><strong>Ne pas faire l'objet de décisions fondées exclusivement sur un traitement automatisé</strong> ayant des effets significatifs, et demander une révision par une personne ;</li>
  <li><strong>Déposer une plainte</strong> auprès d'une autorité de contrôle (section 14).</li>
</ul>
<h3>Comment exercer vos droits</h3>
<p>Écrivez à ${mail} à partir de l'adresse associée à votre compte ou fournissez suffisamment d'information pour que nous puissions vérifier votre identité (nous pouvons demander des renseignements additionnels et ne communiquerons aucune donnée avant d'avoir vérifié la demande). Les mandataires doivent fournir une preuve de leur autorisation. Nous répondons dans le délai prévu par la loi : généralement 30 jours (Canada, UE/Royaume-Uni; prolongeable lorsque c'est permis) et 45 jours (États américains; prolongeable une fois). En cas de refus, nous en expliquerons les motifs et indiquerons comment porter plainte ou en appeler. Les résidents des États-Unis peuvent en appeler d'un refus en répondant au courriel de notre décision.</p>
<p>Si votre demande concerne des données que nous détenons à titre de sous-traitant, nous vous dirigerons vers l'Agence responsable (section 2).</p>`,
    },
    {
      id: "quebec",
      title: "12. Renseignements additionnels pour les résidents du Québec",
      html: `
<ul>
  <li>La personne responsable de la protection des renseignements personnels chez nous est le/la <strong>${officer}</strong>, joignable à ${mail}.</li>
  <li>Nous ne recueillons que les renseignements personnels nécessaires aux fins décrites dans la présente politique et nous demandons votre consentement en termes simples et clairs, distinctement de toute autre information, lorsque la loi l'exige. Le consentement est demandé de façon expresse pour les renseignements sensibles.</li>
  <li>Nous n'utilisons pas de technologie permettant de vous identifier, de vous localiser ou d'établir votre profil sans vous en informer au préalable et sans vous offrir les moyens d'activer ces fonctions.</li>
  <li>Lorsqu'une décision à votre égard est fondée exclusivement sur un traitement automatisé, nous vous en informerons, et vous pourrez demander quels renseignements ont été utilisés et les principaux facteurs, ainsi qu'une révision par une personne.</li>
  <li>Vous pouvez nous demander de cesser de diffuser vos renseignements personnels ou de désindexer tout hyperlien rattaché à votre nom qui y donne accès, lorsque les conditions de la loi sont réunies.</li>
  <li>Nous réalisons une évaluation des facteurs relatifs à la vie privée avant de communiquer des renseignements personnels à l'extérieur du Québec.</li>
  <li>La présente politique est disponible en français et en anglais. En cas d'incohérence, la version la plus favorable à la protection des renseignements personnels prévaut dans la mesure permise par la loi.</li>
</ul>`,
    },
    {
      id: "etats-unis",
      title: "13. Renseignements additionnels pour les résidents des États-Unis (CCPA/CPRA et autres lois d'État)",
      html: `
<p>Au cours des 12 derniers mois, nous avons recueilli les catégories de renseignements personnels suivantes (au sens du droit californien) : identifiants (nom, courriel, adresse IP) ; dossiers clients (données de facturation) ; renseignements commerciaux (forfait, utilisation) ; activité sur Internet ou le réseau (journaux, données d'utilisation) ; renseignements professionnels (rôle, agence) ; et déductions tirées de l'utilisation, uniquement pour exploiter le Service. Nous les recueillons auprès de vous, par votre utilisation du Service et par les services connectés. Nous les communiquons à des fins commerciales aux catégories de fournisseurs de services décrites à la section 7.</p>
<ul>
  <li>Nous <strong>ne vendons pas</strong> de renseignements personnels et ne les <strong>partageons pas</strong> (à des fins de publicité comportementale intercontextuelle), y compris ceux de personnes de moins de 16 ans, et nous n'utilisons ni ne communiquons de renseignements personnels sensibles à des fins qui exigeraient un droit de limitation.</li>
  <li>Nous agissons à titre de « fournisseur de services » ou de « sous-traitant » pour les Données client, que nous traitons uniquement aux fins commerciales prévues à l'entente avec l'Agence.</li>
  <li>Les résidents de la Californie peuvent aussi demander quelles catégories de renseignements ont été communiquées à des tiers à des fins de prospection directe (nous n'en communiquons aucune).</li>
</ul>
<p>Le Service est destiné aux entreprises ; les règles californiennes sur les données des employés et des contacts d'affaires s'appliquent dans la mesure des renseignements pertinents que nous détenons.</p>`,
    },
    {
      id: "plaintes",
      title: "14. Nous joindre, plaintes et organismes de réglementation",
      html: `
<p>Questions, demandes ou préoccupations : ${mail}, ou par la poste à ${legal.entity}, a/s ${officer}, ${legal.address}.</p>
<p>Nous aimerions avoir la chance de régler votre préoccupation en premier, mais vous pouvez aussi communiquer en tout temps avec l'organisme de réglementation :</p>
<ul>
  <li>Québec : <a href="https://www.cai.gouv.qc.ca" rel="noopener">Commission d'accès à l'information du Québec</a></li>
  <li>Canada : <a href="https://www.priv.gc.ca" rel="noopener">Commissariat à la protection de la vie privée du Canada</a> (et commissaires provinciaux de l'Alberta et de la Colombie-Britannique)</li>
  <li>UE/EEE : votre autorité locale de protection des données</li>
  <li>Royaume-Uni : <a href="https://ico.org.uk" rel="noopener">Information Commissioner's Office</a></li>
  <li>États-Unis : le procureur général de votre État</li>
</ul>`,
    },
    {
      id: "auto-heberge",
      title: "15. Instances auto-hébergées",
      html: `
<p>Le logiciel d'Ownlevel peut être auto-hébergé par quiconque en vertu de sa licence libre. Si vous utilisez une instance exploitée par une autre personne, c'est cet exploitant, et non nous, qui contrôle vos données et qui est responsable de ses pratiques de confidentialité. Nous ne recevons aucune donnée des instances auto-hébergées, sauf si l'exploitant choisit de nous en transmettre.</p>`,
    },
    {
      id: "messagerie",
      title: "16. Obligations de conformité des clients en matière de messagerie",
      html: `
<p>Les Agences et Clients qui utilisent le Service pour envoyer des SMS, des courriels, passer des appels ou envoyer d'autres messages, ou pour enregistrer ou transcrire des communications, doivent respecter toutes les lois applicables, notamment la LCAP (CASL), la TCPA, la CAN-SPAM, le RGPD/les règles ePrivacy et les lois locales sur le consentement à l'enregistrement. Cela comprend l'obtention et la preuve du consentement, le respect des désabonnements et l'identification de l'expéditeur. Nous fournissons des outils, mais pas de conseils juridiques, et les Agences sont seules responsables de leur utilisation du Service et du contenu de leurs communications.</p>`,
    },
    {
      id: "enfants",
      title: "17. Enfants",
      html: `
<p>Le Site et le Service s'adressent aux entreprises et non aux enfants. Nous ne recueillons pas sciemment de renseignements personnels de personnes de moins de 16 ans pour nos propres besoins. Si vous croyez qu'un enfant nous a fourni des renseignements personnels, écrivez à ${mail} et nous les supprimerons. Les Agences sont responsables de la légalité de tout traitement de données d'enfants effectué par l'entremise du Service.</p>`,
    },
    {
      id: "tiers",
      title: "18. Liens et services de tiers",
      html: `
<p>Le Site et le Service peuvent contenir des liens vers des sites et services de tiers que nous ne contrôlons pas. Leurs pratiques de confidentialité leur sont propres ; consultez-les avant de fournir des renseignements.</p>`,
    },
    {
      id: "modifications",
      title: "19. Modifications de la présente politique",
      html: `
<p>Nous pouvons mettre à jour la présente politique en fonction de l'évolution du Service, de la loi ou de nos pratiques. Nous publierons la nouvelle version ici avec une nouvelle date d'entrée en vigueur et, pour les changements importants, nous aviserons les titulaires de compte par courriel ou dans le Service avant leur prise d'effet, et obtiendrons votre consentement lorsque la loi l'exige. La poursuite de l'utilisation après la date d'entrée en vigueur vaut acceptation de la mise à jour, dans la mesure permise par la loi. Rien dans la présente politique ne limite les droits que vous confère la loi applicable ; en cas de conflit, la loi et notre entente signée avec l'Agence l'emportent sur la présente politique.</p>`,
    },
  ],
};
