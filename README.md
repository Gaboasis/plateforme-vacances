# Gestion Vacances - Les Amis Bout De Choux

Application web pour gérer les demandes de congés des éducatrices. Base de données PostgreSQL pour une sauvegarde durable des règles, demandes et mots de passe.

## Installation

### 1. Créer une base de données PostgreSQL

**Option gratuite : Neon.tech**
1. Allez sur [neon.tech](https://neon.tech) et créez un compte
2. Créez un projet et copiez l’URL de connexion (Connection string)

**Option gratuite : Supabase**
1. Allez sur [supabase.com](https://supabase.com) et créez un projet
2. Dans **Settings > Database**, copiez l’URL de connexion

### 2. Configurer le projet

```bash
# Installer les dépendances
npm install

# Créer le fichier .env à la racine
cp .env.example .env

# Éditer .env et coller votre DATABASE_URL :
# DATABASE_URL="postgresql://user:password@host:5432/database?sslmode=require"
```

### 3. Initialiser la base de données

```bash
# Créer les tables
npx prisma db push

# Charger les éducatrices et règles par défaut
npx prisma db seed
```

### 4. Lancer l’application

```bash
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000).

## Connexion

- **Mot de passe par défaut** : `garderie`
- **Éducatrices** : Rana, Rafika, Saliha, Hanady, Souhir, Hajar, Khira, Azza, Loubaba, Karima, Manal
- **Admin** : profil Admin

## Déploiement (Vercel)

1. Créez un projet sur [vercel.com](https://vercel.com)
2. Ajoutez la variable d’environnement `DATABASE_URL` dans les paramètres du projet
3. Déployez : `vercel` ou connectez votre dépôt Git

## Technologies

- Next.js 14, React 18, TypeScript
- Tailwind CSS
- Prisma + PostgreSQL
- bcryptjs (mots de passe)
- date-fns, Lucide React
