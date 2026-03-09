# Winery Tool

This is a Vite + React app.

## Supabase Setup (Required)

The app now uses Supabase as shared storage so uploaded data is available to all employees.

1. In Supabase SQL Editor, run `supabase/setup.sql`.
2. Create `.env` in the project root from `.env.example`.
3. Set:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Restart the dev server.
5. In Supabase Dashboard -> Authentication -> Users, create a user account:
   - Email: `archgardnerai@gmail.com`
   - Password: `JTWgardtech`

## App Login

- The app now requires sign in before access to Dashboard and Upload Data.
- Login form is prefilled with:
  - `archgardnerai@gmail.com`
  - `JTWgardtech`

## Running the app

```bash
npm install
npm run dev
```

## Building the app

```bash
npm run build
```