# ENGENEverse Study AI setup

The page and backend scaffold are in place. The assistant is **not live yet**: this project folder did not contain Supabase project settings, an authenticated session, an Edge Function deployment, or an AI provider secret. The UI reports that state instead of returning pretend answers.

The existing page also references `supabase-config.js` and `studyverse-cloud.js`, but those files were not present in the inspected folder. This Study AI implementation uses its own `study-ai-config.js` and does not depend on those legacy references.

## Files

- `index.html` adds the Study AI entry and view while retaining the existing app.
- `study-ai.js` and `study-ai.css` implement the four modes and connect to the function.
- `study-ai-config.js` contains only public Supabase browser settings.
- `supabase/functions/study-ai/index.ts` authenticates requests, validates inputs, rate limits users, and calls the OpenAI Responses API.
- `supabase/migrations/20261014120000_study_ai_rate_limit.sql` adds the per-user request quota RPC.
- `supabase/config.toml` configures this function to validate JWTs in its handler.

## Configure and deploy

1. Create or select the Supabase project that will own this feature. In **Authentication → Sign In / Providers**, enable anonymous sign-ins if students should use the guest button. Guest access creates a Supabase auth user; it is not anonymous to the project administrator.
2. Put the Supabase project URL and public anon/publishable key in `study-ai-config.js`. Keep this file free of provider secrets. The public key is designed to be visible in browser code; the Edge Function still checks a user session and request quota.
3. Install/use the Supabase CLI, sign in, and link the CLI to the project. From this project folder run:

   ```powershell
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   supabase db push
   ```

4. Create an OpenAI API key in your provider account. Add secrets to the **Supabase project**, never to this repository or HTML:

   ```powershell
   supabase secrets set OPENAI_API_KEY=YOUR_SECRET
   supabase secrets set OPENAI_MODEL=YOUR_RESPONSES_API_MODEL
   supabase secrets set STUDY_AI_ALLOWED_ORIGINS=https://YOUR_SITE.example,https://www.YOUR_SITE.example
   ```

   `OPENAI_MODEL` must be a model available to your account that supports the Responses API and Structured Outputs. Include each exact origin used to serve the page (scheme, host, and port); for local development, add the local HTTP origin such as `http://localhost:5500`. A `file://` page has no usable website origin for this allowlist.

5. Deploy the function:

   ```powershell
   supabase functions deploy study-ai
   ```

6. Serve the project over HTTP at one of the allowed origins, open **My Study AI**, and press **Continue as a guest**. Then make a small Tutor request. The connection badge changes to “Service responded” only after a real successful backend response.

## Behaviour and privacy

- Tutor context and recent conversation turns are sent only when the student submits a request. The page keeps the conversation in memory and clears it when the page is refreshed or the student chooses **Clear this conversation**.
- Planner requests include only the first 30 pending app tasks (name, subject, priority, deadline, and estimated duration). Completed tasks are excluded. Manual goals are available when the list is empty.
- A proposed plan never writes tasks automatically. Each proposed task has its own confirmation and uses the existing `addTask()` function.
- Help Me Start invokes the existing study timer; if a timer is already active or paused, it asks before opening the current timer.
- Requests are limited to 12 per authenticated user per minute by the SQL RPC. The function also caps body size, message lengths, task count, and model output size. The configured origin list must be exact.
- Provider retention and account billing follow the provider and Supabase project settings. The request sets OpenAI `store: false`; do not send sensitive personal information.

## What is still needed

Credentials, migration application, guest-auth enablement, deployment, allowed production origins, and a real provider request all require your Supabase/OpenAI project. None of those could be performed from the files available in this workspace. The model API integration is replaceable by changing the provider call in the Edge Function while retaining the frontend contract.

This is a single-page app without an existing Supabase auth layer in the inspected folder. The new guest flow is scoped to Study AI and does not change existing task storage or the existing timer. If the deployed app already uses another Supabase project/auth session outside this folder, set the same project in `study-ai-config.js` or adapt the client to share that existing session before deployment.
