---
name: fsd
description: Feature-Sliced Design rules for this project's web app (Next.js App Router, web/app and web/src). Use when creating or moving code in web/, deciding which layer, slice or segment a piece of code belongs to, or reviewing imports in web/src.
---

# Feature-Sliced Design in `web/`

The web app follows Feature-Sliced Design (FSD). Next.js owns the names `app/` and `pages/`, so two
FSD layers carry an underscore here.

## Layers, top to bottom

| Layer    | Folder              | Holds                                                                    | Slices |
| -------- | ------------------- | ------------------------------------------------------------------------ | ------ |
| routing  | `web/app/`          | Next routes only: each `page.tsx` re-exports a page; `layout.tsx` frames | —      |
| app      | `web/src/_app/`     | Providers (TanStack Query, …), global setup                              | no     |
| pages    | `web/src/_pages/`   | One slice per page: composes widgets and features                        | yes    |
| widgets  | `web/src/widgets/`  | Self-contained blocks of a page (header, footer, look gallery)           | yes    |
| features | `web/src/features/` | User actions that bring value (try on a look, upload a photo)            | yes    |
| entities | `web/src/entities/` | Business things and their data (greeting, look, product, user)           | yes    |
| shared   | `web/src/shared/`   | Code with no business meaning: api client, config, ui kit, lib           | no     |

## Import rules

- **Only downward:** a module imports only from layers below its own:
  `_app → _pages → widgets → features → entities → shared`. `web/app/` (routing) may import from
  any layer, but holds no logic: a route re-exports a page (`export { HomePage as default } from
'@/_pages/home'`), a layout composes providers and widgets.
- **No imports between slices of the same layer** (`features/a` must not import `features/b`). Lift
  shared logic to a lower layer, or compose both slices in the layer above. The one exception:
  entities may reference each other through an explicit cross-import API, `entities/a/@x/b.ts`,
  imported as `@/entities/a/@x/b` only by entity `b`.
- **Through the public API only:** other layers import a slice from its `index.ts`
  (`@/entities/greeting`), never from inside it (`@/entities/greeting/api/get-greeting`). `shared`
  segments have their own `index.ts` (`@/shared/api`).
- **Inside a slice, relative imports** (`./ui/home-page`); between layers, the `@/` alias.

## Segments inside a slice

- `ui/`: React components and their SCSS modules (`footer.tsx` + `footer.module.scss`).
- `api/`: requests for this slice's data.
- `model/`: state (Zustand stores), types and business logic.
- `lib/`: helpers used only by this slice.
- `config/`: constants of this slice.

Name segments by purpose, not by kind of file: no `components/`, `hooks/`, `types/` folders.

## Project conventions that shape where code goes

- Data from the api is fetched on the server through `apiFetch` (`@/shared/api`) with a zod schema,
  in an entity's `api/` segment, marked `import 'server-only'` (see `entities/greeting`). A direct
  `fetch` to the api would put all visitors into one rate limit (CLAUDE.md, "Conventions").
- A widget that renders api data per request calls `connection()` and sits inside `<Suspense>` in
  the page, so `next build` needs no api (see `widgets/greeting`, `_pages/home`).
- Server-only modules (env, Redis, api client) live in `shared` and import `server-only`.
- Text the user sees is Russian.

## Where does it go?

1. Is it a route file Next requires? → `web/app/`, re-exporting.
2. Does it have no business meaning (formatting a date, an http client, a button)? → `shared`.
3. Is it a business thing or its data (a look, a product)? → `entities/<thing>`.
4. Is it something the user does (try on, add to cart, upload)? → `features/<action>`.
5. Is it a block of a page made of entities and features? → `widgets/<block>`.
6. Is it a whole page? → `_pages/<page>`, and a route in `web/app/` re-exports it.

When unsure between two layers, pick the lower one: it is easier to lift code later than to untangle
an upward import.
