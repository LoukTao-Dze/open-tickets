# App

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 21.2.9.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Route authentication

All application pages except `/login` use `authGuard`. The guard calls
`GET /api/auth/session` with credentials on every navigation. The backend checks
the HttpOnly session cookie against Redis; missing, expired or unavailable
sessions redirect to `/login`.

Token login sends `{ token }` to `POST /api/auth/login/token`, verifies that the
browser accepted the server's cookie by reading the session endpoint, then
navigates to `/workspace`. JavaScript does not write or read authentication
cookies or store JWTs. The old `byPass` token is no longer accepted.

See the [backend setup](../backend/README.md#token-login-development-mock) for
Redis, `JWT_SECRET`, and the command to generate a signed mock JWT. Google
sign-in remains unavailable. Configure CORS and cookie settings for your
deployment. Production uses relative `/api` URLs: nginx proxies them to the
Compose backend, and Vercel rewrites them to the configured backend deployment.
This keeps session cookies first-party; update the Vercel rewrite destination
if the backend deployment changes.

This guard controls navigation only. Protected backend business endpoints must
authenticate and authorize requests independently.

### User profile and Google sign-in

The login profile model supports both `token` and `google` through
`auth_provider`. The token mock has no provider identity or email:
`provider_user_id` and `email` are `null`, and `email_verified` is `false`.

When Google sign-in is implemented, map the verified Google claims as follows:

| Profile field | Google claim |
| --- | --- |
| `auth_provider` | Set to `google` |
| `provider_user_id` | `sub` (Google account ID, not the email address) |
| `email` | `email`, or `null` when absent |
| `email_verified` | `email_verified`, or `false` when absent |
| `fullname.first` | `given_name`, or an empty string when absent |
| `fullname.last` | `family_name`, or an empty string when absent |
| `image` | `picture`, or an empty string when absent |

`user_id`, `username`, `fullname.nickname`, `created_at`, `role`, and
`memberships` remain application-owned fields; do not infer permissions from
Google claims. Profile fields alone do not authenticate a user: the backend
must verify Google credentials before trusting them. This model change does
not implement OAuth; the Google button still shows the unavailable dialog.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
