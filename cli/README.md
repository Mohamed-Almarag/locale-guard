# locale-guard-cli

Checks your translation files for missing keys, broken placeholders, plural
forms and untranslated text, on your machine and in git hooks. It runs the same
checks as the [Locale Guard](https://github.com/Mohamed-Almarag/locale-guard)
GitHub Action, so you see on your machine what the pull request will report.

It works with **vue-i18n** (and Nuxt), **ICU** messages (next-intl, react-intl),
**plain JSON** (i18next, react-i18next) and **Rails** locale files, in JSON or
YAML.

<img src="https://raw.githubusercontent.com/Mohamed-Almarag/locale-guard/main/docs/images/demo-cli.gif" alt="locale-guard-cli in a terminal: it lists nine issues in the changed files, saves the same report as locale-guard-report.md, and stops a commit from a Husky pre-commit hook" width="800">

```bash
npx locale-guard-cli --files "locales/{locale}.json" --format vue-i18n
```

## Contents

- [Install and update](#install-and-update)
- [Quick start](#quick-start)
- [What it compares](#what-it-compares)
- [Checks](#checks)
- [Formats](#formats)
- [Locale files](#locale-files)
- [Settings file](#settings-file)
- [Options](#options)
- [Markdown report](#markdown-report)
- [Git hooks](#git-hooks)
- [Exit codes and colors](#exit-codes-and-colors)
- [FAQ](#faq)
- [Limits](#limits)
- [Links](#links)

## Install and update

Run it without installing:

```bash
npx locale-guard-cli
```

Or add it to the project, so everyone on the team runs the same version:

```bash
npm install --save-dev locale-guard-cli
```

When it is in the project, `npx locale-guard-cli` runs that version. To update
it:

```bash
npm install --save-dev locale-guard-cli@latest
```

Without installing, `npx locale-guard-cli@latest` runs the latest version.

It needs Node.js 22.13 or later, and has no dependencies.

## Quick start

Add `.localeguard.yml` next to `package.json`:

```yaml
files: locales/{locale}.json
format: vue-i18n
```

`files` says where your locale files are, with `{locale}` where the language
code goes. `format` names the library that reads your messages. Then run:

```bash
npx locale-guard-cli
```

By default it compares your files with the last commit, so it reports only what
you changed. Issues that were already there are counted, not listed. Each issue
comes with its file, line and check. This is a real run on
[a Nuxt demo](https://github.com/Mohamed-Almarag/locale-guard-demo-nuxt/pull/1)
with `format: '@nuxtjs/i18n'`:

```text
i18n/locales/ar.json
  24:5  error    Missing key checkout.coupon.invalid  missing-keys
  28:5  error    checkout.terms links to @:checkout.polcy, which does not exist in ar  broken-linked-messages
  30:5  error    checkout.pay: missing {amount}, unexpected {amout}  placeholder-mismatch

i18n/locales/de.json
  21:5  error    checkout.dates: missing {end}, unexpected {ende}  placeholder-mismatch
  23:5  error    Missing key checkout.coupon.invalid  missing-keys
  30:5  warning  Key checkout.paypal does not exist in en  extra-keys

i18n/locales/fr.json
  21:5  warning  checkout.title: same text as en  untranslated
  22:5  error    checkout.guests: Invalid vue-i18n message: Unterminated closing brace (column 39)  invalid-syntax
  24:5  warning  Empty value for checkout.total  empty-values

✖ 9 new issues (6 errors, 3 warnings) since the last commit
  2 existing issues are not shown. --all lists every issue.
```

## What it compares

| Command                            | What it checks                                   | When to use it                  |
| ---------------------------------- | ------------------------------------------------ | ------------------------------- |
| `npx locale-guard-cli`             | The files on disk, compared with the last commit | While you work                  |
| `npx locale-guard-cli --staged`    | The staged files, compared with the last commit  | In a pre-commit hook            |
| `npx locale-guard-cli --base main` | The files on disk, compared with `main`          | Before a push or a pull request |
| `npx locale-guard-cli --all`       | Every issue, without comparing                   | A full report                   |

An issue counts as existing when the same check finds the same problem on the
same key in the same locale, so moving a key or editing lines above it does not
make it new. Existing issues are counted, not listed, and only new issues fail
the run, unless `--fail-on-existing` is set.

`--all` cannot be used with `--base`.

## Checks

| Check                    | Severity | What it finds                                                                                                                                    |
| ------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `missing-keys`           | error    | A key in the base locale that another locale does not have                                                                                       |
| `placeholder-mismatch`   | error    | Placeholders, ICU arguments or rich text tags that differ from the base message: `{amout}` instead of `{amount}`, a missing `<b>`                |
| `invalid-syntax`         | error    | A message the library cannot compile, such as an unclosed brace                                                                                  |
| `broken-linked-messages` | error    | A vue-i18n link like `@:common.save` to a key that does not exist                                                                                |
| `parse-error`            | error    | A file that is not valid JSON or YAML                                                                                                            |
| `plural-forms`           | warning  | A plural that misses forms the language needs (Arabic uses six). A missing `other` form is an error                                              |
| `extra-keys`             | warning  | A key that is not in the base locale, usually removed or misspelled                                                                              |
| `empty-values`           | warning  | A value that is empty or only spaces                                                                                                             |
| `untranslated`           | warning  | Text identical to the base, text with no letter of the language's script (English left in an Arabic file), and values copied between two locales |

Plural forms come from `Intl.PluralRules`, so every language works without
tables: English needs `one` and `other`, Arabic needs `zero`, `one`, `two`,
`few`, `many` and `other`, and Japanese needs only `other`. In Rails YAML files,
a key whose children are only plural forms (`count.one`, `count.other`) is
checked the same way, which matches the rules of
[rails-i18n](https://github.com/svenfuchs/rails-i18n).

## Formats

Set `format` to the name of your translation library:

| Library                                           | `format`        | Message syntax                                                 |
| ------------------------------------------------- | --------------- | -------------------------------------------------------------- |
| vue-i18n                                          | `vue-i18n`      | `{name}`, `{0}`, `@:linked.key`, plurals with `\|`             |
| @nuxtjs/i18n                                      | `@nuxtjs/i18n`  | Same as vue-i18n                                               |
| next-intl, use-intl                               | `next-intl`     | ICU: `{count, plural, ...}`, `{x, select, ...}`, `<b>tags</b>` |
| react-intl, FormatJS                              | `react-intl`    | ICU                                                            |
| i18next, react-i18next, next-i18next, i18next-vue | `react-i18next` | `{{name}}`, plurals as `key_one`, `key_other`                  |
| Rails I18n                                        | `json`          | `%{name}`, plurals as `key.one`, `key.other`                   |
| Anything else                                     | `json`          | `{name}` and `{{name}}`                                        |

The names that share a syntax do the same thing, so `icu`, `next-intl` and
`react-intl` are interchangeable. Every accepted name:

```text
vue-i18n, @nuxtjs/i18n
icu, next-intl, use-intl, react-intl, formatjs
json, i18next, react-i18next, next-i18next, i18next-vue
```

A framework name like `nuxt` or `react` is not accepted, because each framework
can use libraries with different syntax; the error message lists the libraries
to choose from.

## Locale files

`files` takes one or more patterns, one per line:

| Layout                                          | `files`                      |
| ----------------------------------------------- | ---------------------------- |
| One file per language                           | `locales/{locale}.json`      |
| One folder per language, one file per namespace | `locales/{locale}/*.json`    |
| Nested namespaces                               | `locales/{locale}/**/*.json` |
| YAML                                            | `locales/{locale}.yml`       |

Keys can be nested (`{ "cart": { "title": "Cart" } }`) or flat
(`{ "cart.title": "Cart" }`). The copy-paste block follows whichever way the
base file writes each key.

### Rails

Rails wraps each file in its locale key (`en:` at the top of `en.yml`) and
merges every file of a language into one tree. Give both patterns:

```yaml
files: |
  config/locales/{locale}.yml
  config/locales/*.{locale}.yml
format: json
```

Locale Guard reads the locale key as the wrapper, so
`en: { cart: { title: … } }` is the key `cart.title`. A key missing from
`devise.ar.yml` is placed in that file, and the copy-paste block puts the locale
key back on top.

### A base file without a locale code

Some projects name the base file without its locale, such as `lang/main.json`
next to `lang/main-ar.json` and `lang/main-fr.json`. No `{locale}` pattern
matches it, so name it with `base-file`:

```yaml
files: lang/main-{locale}.json
base-file: lang/main.json
```

## Settings file

The settings live in `.localeguard.yml` next to `package.json`. The same file is
read by the GitHub Action, so the pull request checks what you checked on your
machine.

```yaml
files: messages/{locale}/*.json
format: next-intl
base-locale: en
fail-on: error
ignore-locales:
  - he
ignore-values:
  - Google
  - Visa, Mastercard, Amex
  - XL
disable-checks:
  - extra-keys
```

| Setting            | Default | What it does                                                                                                                                                                                     |
| ------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `files`            |         | **Required**. Where the locale files are, with `{locale}` in place of the language code. Several patterns can be given, one per line.                                                            |
| `format`           | `json`  | The library that reads your messages. See [Formats](#formats).                                                                                                                                   |
| `base-locale`      | `en`    | The locale every other locale is compared with.                                                                                                                                                  |
| `base-file`        |         | The base locale's file when its name has no locale code. See [A base file without a locale code](#a-base-file-without-a-locale-code).                                                            |
| `fail-on`          | `error` | When the run fails: `error`, `warning` or `never`.                                                                                                                                               |
| `fail-on-existing` | `false` | Also fail on issues that already existed.                                                                                                                                                        |
| `ignore-keys`      |         | Key patterns to skip, such as `legacy.*`. Namespaces are part of the key: `billing.*` skips `locales/{locale}/billing.json`.                                                                     |
| `ignore-locales`   |         | Locales to skip, such as a language that is still being translated.                                                                                                                              |
| `ignore-values`    |         | Values that may stay untranslated, such as brand names: `Google`, `OK`. One per line, and a line can contain commas. Matched against the whole value, ignoring case.                             |
| `disable-checks`   |         | Checks to turn off, by the names in [Checks](#checks).                                                                                                                                           |
| `ignore-tags`      | `false` | ICU only: read tags such as `<b>` or `<a href="...">` as plain text, for projects that format messages with intl-messageformat's `ignoreTag` option. Tags are then not compared between locales. |
| `keys-as-text`     | `false` | For projects whose keys are the base text, such as `"Save": ""` in `en.json`: an empty base value is read as its key, so the other locales are compared with it.                                 |

A wrong setting stops the run with a message that names it, such as
`Invalid "fail-on": expected one of error, warning, never (got "errors")`.

## Options

### Compare

| Option         | What it does                                                          |
| -------------- | --------------------------------------------------------------------- |
| `--base <ref>` | Compare with a branch, tag or commit, such as `main`. Default: `HEAD` |
| `--all`        | Check every issue, without comparing                                  |
| `--staged`     | Check the staged files, as the commit will hold them                  |

### Output

| Option            | What it does                                                                                                                                          |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--output <file>` | Also write the report as Markdown, the same as the pull request comment. No file is written without it, so name one, such as `locale-guard-report.md` |

### Settings

Each setting of the [settings file](#settings-file) is an option too, and the
options win over the file.

| Option                    | What it does                                                                      |
| ------------------------- | --------------------------------------------------------------------------------- |
| `--config <file>`         | Settings file. Default: `.localeguard.yml`                                        |
| `--files <pattern>`       | Locale files, such as `"locales/{locale}.json"`                                   |
| `--format <library>`      | The library that reads your messages. See [Formats](#formats)                     |
| `--base-locale <code>`    | The locale the others are compared with. Default: `en`                            |
| `--base-file <file>`      | The base file when its name has no locale code, such as `lang/main.json`          |
| `--fail-on <level>`       | `error`, `warning` or `never`. Default: `error`                                   |
| `--fail-on-existing`      | Fail on issues that already existed too                                           |
| `--ignore-keys <glob>`    | Keys to skip, such as `"legacy.*"`                                                |
| `--ignore-locales <code>` | Locales to skip                                                                   |
| `--ignore-values <value>` | Values that may stay untranslated, such as brand names                            |
| `--disable-checks <id>`   | Checks to turn off, by the names in [Checks](#checks)                             |
| `--ignore-tags`           | ICU only: read tags such as `<b>` as plain text                                   |
| `--keys-as-text`          | For projects whose keys are the base text: an empty base value is read as its key |

Options that take a list can be repeated. Flags take a `--no-` form, such as
`--no-ignore-tags`.

### Other

| Option            | What it does     |
| ----------------- | ---------------- |
| `-h`, `--help`    | Show the help    |
| `-v`, `--version` | Show the version |

## Markdown report

`--output` writes the report to a file as Markdown, the same as the pull request
comment: each locale with its issues, the base text to translate, and a block of
the missing keys ready to paste into each file.

```bash
npx locale-guard-cli --output locale-guard-report.md
```

To list every issue in the project in one file:

```bash
npx locale-guard-cli --all --output locale-guard-report.md
```

To keep the report out of the repository, add it to `.gitignore`:

```gitignore
locale-guard-report.md
```

## Git hooks

Check each commit with `--staged`, so the hook reads the files as the commit
will hold them, not as they are on disk. Before a push, compare with the branch
the pull request goes to.

With [Husky](https://typicode.github.io/husky/), add two files:

```bash
# .husky/pre-commit
npx locale-guard-cli --staged
```

```bash
# .husky/pre-push
npx locale-guard-cli --base origin/main
```

With [Lefthook](https://lefthook.dev/), in `lefthook.yml`:

```yaml
pre-commit:
  jobs:
    - name: translations
      glob: 'locales/*.json'
      run: npx locale-guard-cli --staged

pre-push:
  jobs:
    - name: translations
      run: npx locale-guard-cli --base origin/main
```

`glob` runs the pre-commit check only when a locale file is staged. Use the same
pattern as `files`, with `*` in place of `{locale}`.

## Exit codes and colors

| Code | Meaning                               |
| ---- | ------------------------------------- |
| 0    | The run passed                        |
| 1    | Issues failed the run                 |
| 2    | A setting or the command is not valid |

Colors turn off when the output is not a terminal, or when `NO_COLOR` is set.

## FAQ

**Does it send my files anywhere?** No. It reads the files and git on your
machine, and does not connect to the internet.

**Why are some issues counted but not listed?** They were already there in the
last commit, or in the branch given to `--base`. Only what you changed is
listed. `--all` lists every issue.

**Does it work outside a git repository?** Yes. It checks every issue and says
so on the first line. `--staged` needs git, so it stops with a message there.

**Why is `--format nuxt` not accepted?** A framework can use libraries with
different message syntax, so name the library. The error message lists the ones
to choose from, such as `@nuxtjs/i18n` for Nuxt.

**How is it different from the GitHub Action?** Both run the same checks with
the same settings file. The
[Action](https://github.com/Mohamed-Almarag/locale-guard) runs on every pull
request, writes one comment with each issue and a block of the missing keys
ready to paste, and marks each issue on its line in the "Files changed" tab. The
CLI runs on your machine and in git hooks, before the code is pushed.

## Limits

- vue-i18n plurals (`one | many`) are not checked for missing forms, because
  their number of branches depends on custom rules.
- Plural forms nested under a key in JSON
  (`{ "items": { "one": …, "other": … } }`) are read as ordinary keys, because
  each library that writes them has its own plural rules. They are checked as
  plurals only in Rails YAML files.
- Locale Guard does not know which keys your code uses, so it does not report
  unused keys or keys that the code uses but no file defines.

## Links

- Source code and the GitHub Action:
  [github.com/Mohamed-Almarag/locale-guard](https://github.com/Mohamed-Almarag/locale-guard)
- The Action on
  [GitHub Marketplace](https://github.com/marketplace/actions/locale-guard)
- [Changelog](https://github.com/Mohamed-Almarag/locale-guard/blob/main/CHANGELOG.md)
- [Report a bug or a false positive](https://github.com/Mohamed-Almarag/locale-guard/issues)
- [Contributing](https://github.com/Mohamed-Almarag/locale-guard/blob/main/CONTRIBUTING.md)
  and
  [security issues](https://github.com/Mohamed-Almarag/locale-guard/blob/main/SECURITY.md)

## License

[MIT](https://github.com/Mohamed-Almarag/locale-guard/blob/main/LICENSE)
