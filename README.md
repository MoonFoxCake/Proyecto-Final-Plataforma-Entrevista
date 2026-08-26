# Nexo Perfil

Plataforma web de evaluación y reclutamiento universitario.

> Este repositorio contiene el **project skeleton**: estructura de carpetas, interfaces y
> clases con métodos definidos pero sin lógica de negocio implementada. Sirve como base
> para que el equipo empiece a desarrollar sobre una arquitectura ya acordada.

## Arquitectura

Arquitectura en capas con el patrón **Repository** para desacoplar la base de datos de la
lógica de negocio:

```
Routes → Controllers → Services → Repositories → Firestore
```

- **Routes**: definen endpoints y aplican middleware (auth, role, tenant, validation).
- **Controllers**: reciben el request, llaman al service correspondiente y devuelven el
  response. Sin lógica de negocio.
- **Services**: contienen toda la lógica de negocio. Reciben repositorios por inyección de
  dependencias en el constructor y no conocen Firestore ni ninguna base de datos concreta.
- **Repositories**: interfaz abstracta (contrato) + implementación concreta (Firestore para
  producción, in-memory para tests).

Un contenedor de inyección de dependencias (`backend/src/container`) arma el grafo de
objetos: instancia los repositorios (Firestore o in-memory según el entorno) y los inyecta
en los services.

## Stack

| Capa           | Tecnología                                              |
|----------------|-----------------------------------------------------------|
| Frontend       | React 18 + Vite + React Router v6 + Tailwind CSS          |
| Backend        | Node.js + Express + Firebase Admin SDK                    |
| Base de datos  | Cloud Firestore (NoSQL)                                   |
| Autenticación  | Firebase Auth con Custom Claims                           |
| Hosting        | Firebase Hosting (frontend) + Render (backend)             |
| Testing        | Jest + Supertest (backend), Vitest (frontend)              |
| Validación     | Zod                                                        |

## Prerequisites

- Node.js 18+
- npm 9+
- [Firebase CLI](https://firebase.google.com/docs/cli) (`npm install -g firebase-tools`)
- Una cuenta de Firebase con un proyecto creado (o el emulador local)

## Project Structure

```
nexo-perfil/
├── frontend/     # React + Vite SPA (Firebase Hosting)
├── backend/      # API Express (Render)
├── render.yaml
├── firebase.json
├── firestore.rules
└── firestore.indexes.json
```

Ver los README internos y comentarios de código para el detalle de cada capa.

## Installation

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

## Environment Setup

1. Copia los archivos de ejemplo:

   ```bash
   cp backend/.env.example backend/.env
   cp frontend/.env.example frontend/.env
   ```

2. Completa `backend/.env` con las credenciales de una service account de Firebase
   (Project Settings → Service Accounts → Generate new private key).

3. Completa `frontend/.env` con la configuración web de tu proyecto Firebase
   (Project Settings → General → Your apps).

4. Inicia sesión con la Firebase CLI y selecciona el proyecto:

   ```bash
   firebase login
   firebase use --add
   ```

## Running Locally

```bash
# Backend (http://localhost:3000)
cd backend
npm run dev

# Frontend (http://localhost:5173)
cd frontend
npm run dev
```

También puedes levantar los emuladores de Firebase (Auth, Firestore, Functions):

```bash
firebase emulators:start
```

## Running Tests

```bash
# Backend
cd backend
npm test

# Frontend
cd frontend
npm test
```

## Deployment

El backend (Express) corre en **Render** y el frontend en **Firebase Hosting**. Firebase
Auth y Firestore se quedan en el plan gratuito Spark — solo Cloud Functions requiere el
plan de pago Blaze, por eso el backend no se despliega ahí.

### Backend (Render)

1. En [Render](https://dashboard.render.com), "New +" → "Blueprint" → conectá este repo
   (usa [render.yaml](render.yaml)), o creá el servicio a mano: "New +" → "Web Service",
   root directory `backend`, build command `npm install`, start command `npm start`, plan
   `Free`.
2. Cargá las variables de entorno del servicio (mismos valores que `backend/.env`, sin las
   comillas que usa el archivo `.env`):
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_PRIVATE_KEY` (pegar tal cual, con los `\n` literales — no reemplazarlos por
     saltos de línea reales)
   - `FIREBASE_CLIENT_EMAIL`
   - `NODE_ENV=production`
   - `CORS_ORIGIN` (opcional): la URL de Firebase Hosting una vez que exista, p. ej.
     `https://nexo-prueba.web.app`. Sin esto, el backend acepta requests de cualquier
     origen (no hay riesgo real: la autenticación va por Bearer token, no por cookies).
3. Deploy. Render asigna una URL tipo `https://<nombre-del-servicio>.onrender.com`.
4. **Nota del free tier**: el servicio se duerme tras ~15 min sin tráfico; el primer
   request después de eso tarda 30–50s en responder mientras arranca.

### Frontend (Firebase Hosting)

1. Copiá la URL del backend de Render en
   [frontend/.env.production](frontend/.env.production):

   ```
   VITE_API_BASE_URL=https://<nombre-del-servicio>.onrender.com/api/v1
   ```

2. Build y deploy:

   ```bash
   cd frontend
   npm run build

   cd ..
   firebase login       # una sola vez
   firebase use nexo-prueba
   firebase deploy --only hosting,firestore
   ```

`firebase deploy` (sin `--only`) también funciona — ya no hay `functions` en
[firebase.json](firebase.json), así que no intenta desplegar Cloud Functions.

## Estado del proyecto

Este es un skeleton inicial: las interfaces, rutas, controllers y la estructura de
carpetas están definidas, pero la lógica de negocio y las queries a Firestore quedan
pendientes de implementación (marcadas con `// TODO`).
