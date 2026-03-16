# Guide de déploiement — Railway (tout-en-un)

Une seule plateforme pour l'app et la base de données. Accès depuis la tablette ou tout appareil.

---

## Étape 1 : Créer un compte GitHub

1. Allez sur [github.com](https://github.com) et créez un compte (gratuit)
2. Installez Git : [git-scm.com](https://git-scm.com)

---

## Étape 2 : Mettre le projet sur GitHub

Dans le terminal, dossier du projet :

```bash
cd "Plateforme Vacances"
git init
git add .
git commit -m "Plateforme prête"
```

Sur GitHub : **New repository** → `plateforme-vacances` → **Create**.

Puis :

```bash
git remote add origin https://github.com/VOTRE-USERNAME/plateforme-vacances.git
git branch -M main
git push -u origin main
```

---

## Étape 3 : Déployer sur Railway (app + base de données)

1. Allez sur [railway.app](https://railway.app) et créez un compte (gratuit)
2. **New Project**
3. **+ New** → **Database** → **PostgreSQL** (ajoutez la base en premier)
4. **+ New** → **GitHub Repo** → connectez GitHub → choisissez `plateforme-vacances`
5. Cliquez sur le service **Web** → **Variables** :
   - `DATABASE_URL` → **Add Reference** → Postgres → `DATABASE_URL`
   - `DIRECT_URL` → **Add Reference** → Postgres → `DATABASE_URL`
6. **Settings** → **Generate Domain** (pour l'URL publique)
7. Le déploiement se lance. Tables et données créées automatiquement.

---

## Étape 4 : Accéder à la plateforme

Railway génère une URL (ex. : `https://plateforme-vacances-xxx.up.railway.app`)

- Ouvrez-la sur la tablette
- Optionnel : **Ajouter à l'écran d'accueil** (comme une app)

---

## Résumé

| Service | Rôle |
|---------|------|
| GitHub | Stocker le code |
| Railway | App + base de données (tout-en-un) |

2 comptes seulement. Gratuit.
