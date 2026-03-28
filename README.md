# L'Incognito

**L'Incognito** est une application web locale pour jouer avec vos amis. Les joueurs peuvent créer ou rejoindre une salle, discuter en temps réel, répondre à des questions et deviner les correspondances anonymes. Connaissez-vous vraiment vos amis ?

## Fonctionnalités

- Création et jointure de salle via un code de 4 lettres
- Hôte de salle unique avec démarrage du jeu
- Jusqu'à 10 joueurs par partie
- Attribution de pseudonymes anonymes au démarrage
- Chat partagé pendant le lobby et l’historique accessible pendant la phase de déduction
- Questions automatiques issues d'une banque de questions
- Temps de réponse de 60 secondes par question
- Phase de déduction finale pour associer pseudonymes et vrais prénoms
- Calcul du score final et révélation progressive des résultats

## Installation

```bash
npm install
```

## Lancer le projet

```bash
npm start
```

Puis ouvrez :

```bash
http://localhost:3000
```

## Structure du projet

- `server.js` : serveur Express + Socket.io, gestion des salles, du jeu et des événements en temps réel
- `public/index.html` : interface utilisateur principale
- `public/client.js` : logique front-end, gestion des événements socket et rendu dynamique
- `public/style.css` : styles visuels de l'application

## Jeux et logique

1. Le créateur de la salle devient hôte.
2. Les joueurs rejoignent la salle et peuvent discuter.
3. L'hôte démarre la partie lorsqu'il y a au moins deux joueurs.
4. Le jeu commence avec des questions à répondre en chat.
5. Après chaque question (ou après 60 secondes), la partie passe à la suivante.
6. À la fin, une phase de déduction permet d'associer pseudonymes anonymes aux vrais prénoms.
7. Le score final est calculé et affiché.

## Notes

- Le serveur nettoie correctement les connexions lorsqu'un joueur quitte.
- Les validations principales sont effectuées côté serveur pour empêcher les triches simples.

## Licence

Projet open source — @AlexCTZ.

