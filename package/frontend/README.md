# App

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 21.2.9.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Route authentication

All application pages except `/login` use `authGuard`. The guard checks for a
non-empty `access_token` cookie on navigation and redirects to `/login` when
the cookie is missing, expired, or unreadable. Login saves the cookie before
navigating to `/workspace`.

This is a client-side navigation check, not token verification. Protected backend
endpoints must authenticate and authorize requests independently.

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
