# Product Brief: Tech Finance News Aggregator

## Elevator Pitch

Application de veille automatisée qui scrappe les actualités financières tech depuis Zone Bourse (et autres sources à terme), les résume via IA, et centralise le tout dans Notion pour un suivi simplifié des tendances tech/finance.

---

## Problem Statement

Suivre manuellement les actualités financières liées à la tech est chronophage et dispersé. Les informations sont éparpillées sur plusieurs sites, les articles sont souvent longs, et il n'existe pas de vue consolidée personnalisée.

**Pain Points:**
- Temps perdu à naviguer entre sites financiers
- Articles longs à lire pour extraire l'essentiel
- Pas de centralisation des informations pertinentes
- Difficulté à filtrer le bruit pour ne garder que la tech

---

## Solution Overview

Un backend Node.js/TypeScript qui:
1. **Scrappe** les actualités de Zone Bourse (section Économie)
2. **Filtre** les articles tech via approche hybride (mots-clés + validation IA)
3. **Résume** le contenu via OpenAI GPT (format court + analyse détaillée)
4. **Pousse** les résultats vers une base Notion

---

## Target Users

| Type | Description |
|------|-------------|
| **Utilisateur principal** | Usage personnel - veille financière tech |
| **Profil** | Investisseur/passionné tech souhaitant suivre l'actualité financière |

---

## Core Features

### MVP (Phase 1)

| Feature | Description | Priorité |
|---------|-------------|----------|
| **Scraping Zone Bourse** | Extraction des articles de la section Économie | Must Have |
| **Filtrage hybride** | Mots-clés tech + validation IA | Must Have |
| **Résumé IA court** | 2-3 phrases par article via GPT | Must Have |
| **Push Notion** | Titre, date, résumé, lien source | Must Have |
| **Scheduling** | Exécution toutes les 2-4h (heures de marché) | Must Have |

### Phase 2 (Évolutions)

| Feature | Description | Priorité |
|---------|-------------|----------|
| **Analyse détaillée** | Points clés, impact marché, entreprises | Should Have |
| **Multi-sources** | Ajout d'autres sites financiers | Should Have |
| **Déduplication** | Éviter les doublons cross-sources | Should Have |
| **Dashboard stats** | Métriques de veille dans Notion | Nice to Have |

---

## Technical Requirements

### Stack

| Composant | Choix |
|-----------|-------|
| **Runtime** | Node.js avec TypeScript |
| **Scraping** | Puppeteer ou Playwright (rendu JS) |
| **LLM** | OpenAI GPT API |
| **Output** | Notion API |
| **Hébergement** | Cloud léger (Railway/Render/VPS) |
| **Scheduling** | Cron ou scheduler cloud |

### Architecture Simplifiée

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────┐     ┌─────────┐
│  Zone Bourse    │────▶│   Scraper    │────▶│  Filtre     │────▶│   GPT   │
│  (source)       │     │  (Puppeteer) │     │  (hybride)  │     │ (résumé)│
└─────────────────┘     └──────────────┘     └─────────────┘     └────┬────┘
                                                                      │
                                                                      ▼
                                                               ┌─────────────┐
                                                               │   Notion    │
                                                               │   (output)  │
                                                               └─────────────┘
```

---

## Filtrage Tech - Approche Hybride

### Étape 1: Mots-clés (rapide, gratuit)
```
Entreprises: Apple, Microsoft, Google, Amazon, Meta, NVIDIA, Tesla, AMD, Intel...
Thèmes: IA, intelligence artificielle, cloud, semi-conducteurs, cybersécurité...
Termes: tech, technologie, startup, fintech, big tech...
```

### Étape 2: Validation IA (précision)
Si un article passe le filtre mots-clés, demander à GPT:
> "Cet article concerne-t-il principalement l'actualité financière d'une entreprise tech ou du secteur technologique ? Répondre OUI ou NON."

---

## Output Notion

### Structure de la base

| Champ | Type | Description |
|-------|------|-------------|
| **Titre** | Title | Titre de l'article |
| **Date** | Date | Date de publication |
| **Résumé** | Text | 2-3 phrases essentielles |
| **Lien** | URL | Lien vers l'article original |
| **Source** | Select | Zone Bourse (extensible) |
| **Traité le** | Date | Timestamp du traitement |

---

## Constraints

| Contrainte | Valeur |
|------------|--------|
| **Budget APIs** | 10-50€/mois (modéré) |
| **Fréquence scraping** | Toutes les 2-4h (heures de marché) |
| **Hébergement** | Cloud léger, pas d'infra complexe |
| **Maintenance** | Minimale (usage personnel) |

---

## Success Criteria

| Critère | Mesure |
|---------|--------|
| **Couverture** | 90%+ des articles tech Zone Bourse capturés |
| **Précision filtrage** | <10% de faux positifs (articles non-tech) |
| **Qualité résumés** | Résumés fidèles et informatifs |
| **Fiabilité** | Exécution sans erreur 95%+ du temps |
| **Latence Notion** | Articles disponibles <15min après publication source |

---

## Risks & Mitigations

| Risque | Impact | Mitigation |
|--------|--------|------------|
| Zone Bourse bloque le scraping | Élevé | User-agent réaliste, rate limiting, rotation IP si nécessaire |
| Changement structure HTML | Moyen | Selectors résilients, alertes sur erreurs parsing |
| Coûts API GPT | Moyen | Cache des résumés, limiter tokens, batch processing |
| Rate limit Notion | Faible | Queue avec retry exponential backoff |

---

## Out of Scope (MVP)

- Interface utilisateur web
- Authentification / multi-utilisateur
- Alertes temps réel (push notifications)
- Analyse de sentiment avancée
- Stockage historique long terme (au-delà de Notion)

---

## Next Steps

1. **Architecture** - Définir l'architecture technique détaillée
2. **Tech Specs** - Spécifier les composants (scraper, filtrage, intégrations)
3. **Epics & Stories** - Découper en tâches implémentables
4. **Implementation** - Développement itératif

---

*Document créé le: 2026-01-07*
*Statut: Draft - En attente de validation*
