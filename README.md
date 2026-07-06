# NBA Profile Analyzer

Application web statique (HTML/CSS/JS vanilla, aucun build) qui affiche 4
diagrammes de Kiviat (radar charts) pour analyser et comparer jusqu'à 3
joueurs NBA, en centiles, à partir des statistiques de
[Basketball-Reference](https://www.basketball-reference.com).

## Lancer le projet

Aucune installation n'est nécessaire. Il suffit de servir le dossier en HTTP
(un simple `file://` ne fonctionne pas pour les requêtes réseau) :

```bash
python3 -m http.server 8080
# puis ouvrir http://localhost:8080
```

## Architecture

```
index.html
css/
  style.css       variables de thème, layout, recherche, contrôles, tableau
  kiviat.css      grille 2x2 des 4 diagrammes
  responsive.css  breakpoints tablette / mobile
js/
  stats.js        définition des 4 profils (axes), moteur de centiles
  scraper.js      collecte BBRef via proxy CORS + parsing HTML
  kiviat.js       rendu Chart.js (radar) des 4 diagrammes
  compare.js      état multi-joueurs (jusqu'à 3, slots compactés)
  ui.js           rendu DOM (cartes joueurs, tableau, états, autocomplete)
  app.js          point d'entrée, orchestration
```

## Fonctionnement

- Chaque axe de chaque Kiviat est un **centile** (0-100), jamais une valeur
  brute — la valeur brute et la moyenne de référence n'apparaissent que dans
  les tooltips et le tableau détaillé.
- Les centiles sont calculés sur une population de référence commune
  (même saison, même filtre de minutage) pour que la comparaison entre
  joueurs soit équitable.
- Le mode "Par poste" restreint la population de référence au poste du
  Joueur 1 ; un avertissement s'affiche si les joueurs comparés ne jouent
  pas au même poste.
- Les données sont mises en cache dans `sessionStorage` (par joueur+saison,
  et par saison pour la population ligue) pour éviter de re-scraper BBRef à
  chaque interaction.

## Limitations connues (données non disponibles / approximées)

- **Draft Combine (envergure, longueur/largeur de main, saut vertical)** :
  Basketball-Reference ne publie pas ces mesures de façon fiable et
  scrapable par joueur. Ces axes s'affichent systématiquement en "N/D" —
  aucune valeur n'est inventée.
- **Catch & Shoot % / Pull-Up %** : ce sont des statistiques de tracking
  NBA.com/Synergy, absentes de Basketball-Reference. Ces axes sont donc
  toujours "N/D" sur BBRef (source alternative non implémentée).
- **DRB_HT (DREB% / Taille)** : les pages ligue de BBRef (classements
  saison) n'exposent pas la taille des joueurs, donc la population de
  référence pour cet axe utilise une taille moyenne approximative par poste
  (PG/SG/SF/PF/C) plutôt que la taille réelle de chaque joueur de la ligue.
  La taille du/des joueur(s) analysé(s), elle, est toujours la vraie valeur
  scrapée sur sa page BBRef. Le tooltip signale cette approximation.
- **Proxy CORS (corsproxy.io)** : Basketball-Reference bloque les requêtes
  cross-origin directes depuis un navigateur ; toutes les requêtes passent
  donc par un proxy CORS public gratuit, qui peut être temporairement
  indisponible ou limiter le débit. L'application affiche un message d'erreur
  explicite dans ce cas plutôt que d'échouer silencieusement.
- Le réseau sortant de l'environnement de build utilisé pour créer ce projet
  bloque les requêtes vers basketball-reference.com et corsproxy.io par
  politique — le pipeline de scraping n'a donc pas pu être vérifié contre le
  site réel depuis cet environnement. Il a été conçu à partir de la
  structure HTML documentée de BBRef (tables `per_game`, `advanced`,
  `shooting`, sections parfois encapsulées dans des commentaires HTML) et
  testé avec des données simulées (voir `js/app.js` + Chart.js). Un test en
  conditions réelles depuis un navigateur/poste avec accès internet complet
  est recommandé avant mise en production.

## Contraintes respectées

- Centiles uniquement sur les axes des Kiviat (valeurs brutes en tooltip/tableau).
- Ligne de référence à 50 toujours affichée sur chaque diagramme.
- Aucune donnée inventée : axe indisponible → "N/D", jamais interpolé.
- Stats inversées (TOV%) : centile inversé (bas TOV% = haut centile).
- Maximum 3 joueurs simultanés (le slot d'ajout se bloque au-delà).
- Layout responsive : grille 2×2 (desktop/tablette), colonne unique (mobile).
