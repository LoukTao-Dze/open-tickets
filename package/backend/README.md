<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

### Token login (development mock)

`POST /api/auth/login/token` accepts `{ "token": "<signed JWT>" }`.
The controller validates input and rate-limits each client IP to 10 attempts per
minute using Redis. The service verifies **HS256**, issuer `open-ticket`, audience
`open-ticket-login`, expiry, and non-empty `sub` / `username` claims.
The mock user always has the `guest` role; submitted role claims are not trusted.
There is deliberately no public endpoint that issues mock tokens.

Configure these values in `package/backend/.env` (do not commit secrets):

```dotenv
REDIS_URL=redis://127.0.0.1:6379
JWT_SECRET=<generate a random secret of at least 32 bytes>
# Only for local HTTP development; omit or set true for HTTPS.
AUTH_COOKIE_SECURE=false
AUTH_COOKIE_SAME_SITE=lax
CORS_ORIGINS=http://localhost:9998,http://localhost:4200
```

Generate a signing secret with
`node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`,
then save it as `JWT_SECRET`. Keep the existing Supabase configuration as well.
Existing environment files must also include these new keys; updating
`.env.example` does not update `.env`. Missing `REDIS_URL` or `JWT_SECRET` stops
startup deliberately. After changing `.env`, restart the backend. Run the
backend from its package directory or use `npm run start:backend` from the
repository root so Nest loads `package/backend/.env`.

From the repository root, start Redis for a locally running backend:

```bash
docker compose up -d redis
```

Or run the full stack with `docker compose up -d --build`; Compose overrides
`REDIS_URL` to `redis://redis:6379` for the backend. Redis data is stored in the
`redis-data` volume, and its host port is bound to loopback only. Use a protected
Redis deployment and `rediss://` with authentication outside local development.

Create a one-hour JWT with a mock identity from the `package/backend` directory:

```bash
node --env-file=.env -e '
const { JwtService } = require("@nestjs/jwt");
if (!process.env.JWT_SECRET || Buffer.byteLength(process.env.JWT_SECRET) < 32) {
  throw new Error("JWT_SECRET must contain at least 32 bytes");
}
console.log(new JwtService().sign(
  { sub: "mock-user", username: "mock-user" },
  { secret: process.env.JWT_SECRET, algorithm: "HS256",
    issuer: "open-ticket", audience: "open-ticket-login", expiresIn: "1h" }
));
'
```

Paste that JWT into the login page's **Access token** field. A successful response
is `{ user: { user_id, username, auth_provider: "token", role: "guest" }, expires_at }`.
The backend generates a new cryptographically random session ID and sends it in
the `open_ticket_session` cookie (`HttpOnly`, `Secure` by default, `SameSite=Lax`,
`Path=/api`). Only a SHA-256 hash of that session ID is used in the Redis key:
`auth:session:<hash>`. Its JSON value contains the mock profile and expiry, not
the JWT. TTL is the shorter of the JWT's remaining lifetime and 24 hours.

`GET /api/auth/session` validates the cookie against Redis and returns the same
profile. Missing/expired sessions return `401`; Redis failures return `503`
without issuing a session cookie. Authentication responses use `Cache-Control:
no-store`. Changing `JWT_SECRET` rejects old JWTs but does not revoke already
created sessions; those expire via Redis TTL.

### Logout from Postman

Send `POST http://localhost:3000/api/auth/logout` with no body and the current
session cookie (not the login JWT):

```http
Cookie: open_ticket_session=<session ID from the login response cookie>
```

Postman's cookie jar can send this automatically after login on the same host.
For local HTTP, configure `AUTH_COOKIE_SECURE=false`; HTTPS should keep it true.
Do not include an `Origin` header unless it is listed in `CORS_ORIGINS`.

The endpoint deletes only `auth:session:<SHA-256 of session ID>` and expires the
cookie using the same path and security settings as login. Success returns
`204 No Content`, including when the session was already removed. Missing or
malformed cookies return `401`; Redis failures return `503` without clearing
the cookie. No arbitrary key deletion or Redis flush is exposed.
Other sessions and login rate-limit keys remain untouched. Logout revokes this
session only; an unexpired login JWT can still create a new session.

For cross-site HTTPS frontend/backend deployments, configure
`AUTH_COOKIE_SECURE=true`, `AUTH_COOKIE_SAME_SITE=none`, and explicit
`CORS_ORIGINS`. Browsers may block third-party cookies; a same-origin API proxy
is recommended. Behind a reverse proxy the limiter uses Express's default
socket IP; configure trusted proxies deliberately before relying on per-user
IP limits. Do not blindly trust client-supplied forwarding headers.

This implements login and session verification only. Existing business endpoints
still need server-side authentication and resource-level authorization before
production use. Google OAuth, refresh and real user lookup are not implemented.

```bash
$ yarn install
```

## Compile and run the project

```bash
# development
$ yarn run start

# watch mode
$ yarn run start:dev

# production mode
$ yarn run start:prod
```

## Run tests

```bash
# unit tests
$ yarn run test

# e2e tests
$ yarn run test:e2e

# test coverage
$ yarn run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ yarn install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
