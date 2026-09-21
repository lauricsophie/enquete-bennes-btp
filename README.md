# Enquête flash — Location de bennes et transport de déchets BTP en Guyane

Plateforme de questionnaire ad hoc pour la CERC Guyane. Site statique (HTML/CSS/JS vanilla), sans framework, sans build, déployable gratuitement sur GitHub Pages. Les réponses sont envoyées à un script Google Apps Script qui les écrit dans une Google Sheet.

## Fichiers du site

```
index.html      Structure de la page, bandeau CERC Guyane, zone de rendu
style.css       Design system complet (charte CERC Guyane / BTP / déchets)
app.js          Moteur du formulaire : logique conditionnelle, validation,
                localStorage, appel API, matrices responsive
questions.json  Contenu du questionnaire (26 questions, branchements)
```

## Tester en local

Aucune installation nécessaire, mais `fetch("questions.json")` nécessite un serveur local (le double-clic sur `index.html` ouvre en `file://` et bloque le fetch dans certains navigateurs) :

```bash
npx serve .
# ou
python -m http.server 8000
```

Puis ouvrir `http://localhost:8000` (ou le port indiqué).

## Déployer sur GitHub Pages (gratuit)

1. Settings > Pages > Source : "Deploy from a branch" > branche `main` > dossier `/ (root)` > Save.
2. Le site est en ligne en 1-2 minutes à l'adresse `https://lauricsophie.github.io/enquete-bennes-btp/`.

## Connecter le backend (Google Apps Script + Google Sheets)

1. Créer une Google Sheet vierge.
2. Extensions > Apps Script, coller le script `Code.gs` fourni séparément.
3. Exécuter la fonction `setupSheet()` une fois (crée les onglets "Reponses" et "Dictionnaire des variables").
4. Déployer > Nouveau déploiement > Application Web > Exécuter en tant que "Moi" > Accès "Tout le monde".
5. Copier l'URL `.../exec` obtenue.
6. Dans `app.js`, remplacer la valeur de la constante `API_URL` (ligne 2) par cette URL.
7. Committer le fichier `app.js` mis à jour — GitHub Pages republie automatiquement.

## Modifier le questionnaire

Toute modification de question, d'option ou de branchement se fait exclusivement dans `questions.json` — jamais dans `app.js` ou `index.html`.

## Test de non-régression avant mise en production

- Répondre "Non" à la question 1 → doit aller directement à l'écran de fin.
- Répondre "Oui" à la question 1, puis "Non" à "Disposez-vous d'un parc de véhicules ?" → les questions sur l'âge et le kilométrage des véhicules doivent être sautées.
- Vérifier l'absence de scroll horizontal sur les questions matricielles à 360px de largeur d'écran.
- Fermer l'onglet en cours de réponse, le rouvrir : la bannière "Reprendre où j'en étais" doit apparaître.
- Soumettre une réponse complète et vérifier son apparition dans l'onglet "Reponses" de la Google Sheet.
