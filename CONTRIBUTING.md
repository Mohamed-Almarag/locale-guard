# Contributing to Locale Guard

Thanks for helping. Bug reports, false positives and small fixes are the most
useful contributions.

## Before you start

- **Bug or false positive:** open an issue with the bug report form. Include the
  key, its value in the base locale and in the other locale, and your workflow.
- **New check, format or input:** open an issue first and describe the problem
  it solves. Wait for a reply before you write code, so your time is not wasted
  on something that does not fit.
- **Small fixes** (a typo, a clearer message, a missing test): open a pull
  request directly.
- **Security issue:** do not open a public issue. See
  [SECURITY.md](SECURITY.md).

## Set up

You need Node.js 24.

```bash
git clone https://github.com/<your-username>/locale-guard.git
cd locale-guard
git checkout dev
npm install
```

`npm install` also installs the Git hooks. Every commit runs Prettier, ESLint,
the type check and the tests.

Before you open a pull request, run the same checks as CI:

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
```

Do not use `npm run all` or `npm run bundle`. They rebuild `dist/`.

## How the code is organized

```
src/
  core/        # no GitHub code: loaders, formats, checks, baseline, config
    checks/    # one file per check
    formats/   # vue-i18n, ICU and plain message parsing
  reporters/   # comment and job summary text
  github/      # pull request, files, comment, annotations
  main.ts      # connects everything and sets the exit status
tests/
  fixtures/    # small Vue and Next projects
```

Two rules keep the code easy to test:

- `src/core` never imports `@actions/*` or calls GitHub.
- A check is a function that takes the loaded locales and returns `Issue[]`. It
  does not read files or call the network.

## Making a change

1. Branch from `dev`.
2. Every change to a check or a format needs tests: one case that passes and one
   that reports the issue. Put them next to the existing tests in `tests/`.
3. A false positive fix needs a test with the exact message that was wrongly
   reported.
4. Run the checks from [Set up](#set-up).
5. Do not change `dist/`. It is rebuilt only when a release is made from `main`,
   so a `dist/` change in a pull request would be overwritten.
6. Do not edit `CHANGELOG.md`. The maintainer adds the entries when releasing.

Commit messages follow this style: `fix: ...`, `feat: ...`, `docs: ...`,
`test: ...`, `refactor: ...`, `chore: ...`.

## Pull requests

- Open the pull request against `dev`, not `main`.
- Keep it to one change. Small pull requests get reviewed faster.
- Leave "Allow edits by maintainers" on.
- Workflows on a first pull request wait for the maintainer to approve them.

## Not planned

These are out of scope for now, so a pull request for them will be closed:

- Translating messages automatically with AI.
- Committing fixes to the pull request.
- `.po` and XLIFF files.
- More than one configuration in a monorepo.

## License

By contributing, you agree that your contribution is licensed under the
[MIT License](LICENSE).
