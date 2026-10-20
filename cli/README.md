# locale-guard-cli

Checks your translation files for missing keys, broken placeholders, plural
forms and untranslated text, on your machine and in git hooks. It runs the same
checks as the [Locale Guard](https://github.com/Mohamed-Almarag/locale-guard)
GitHub Action, so you see on your machine what the pull request will report.

It works with **vue-i18n** (and Nuxt), **ICU** messages (next-intl, react-intl),
**plain JSON** (i18next, react-i18next) and **Rails** locale files, in JSON or
YAML.

<img src="https://raw.githubusercontent.com/Mohamed-Almarag/locale-guard/main/docs/images/demo-cli.gif" alt="locale-guard-cli in a terminal: it lists nine issues in the changed files, saves the same report as locale-guard-report.md, and stops a commit from a Husky pre-commit hook" width="800">

## Usage

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

To install it in the project instead of running it through `npx`:

```bash
npm install --save-dev locale-guard-cli
```

It needs Node.js 22.13 or later, and has no dependencies.

## What it checks

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

To keep the report out of the repository, add it to `.gitignore`:

```gitignore
locale-guard-report.md
```

### Settings

These are the same as the settings file, and they win over it.

| Option                    | What it does                                                                      |
| ------------------------- | --------------------------------------------------------------------------------- |
| `--config <file>`         | Settings file. Default: `.localeguard.yml`                                        |
| `--files <pattern>`       | Locale files, such as `"locales/{locale}.json"`                                   |
| `--format <library>`      | `vue-i18n`, `next-intl`, `react-intl`, `react-i18next`, `json` and others         |
| `--base-locale <code>`    | The locale the others are compared with. Default: `en`                            |
| `--base-file <file>`      | The base file when its name has no locale code, such as `lang/main.json`          |
| `--fail-on <level>`       | `error`, `warning` or `never`. Default: `error`                                   |
| `--fail-on-existing`      | Fail on issues that already existed too                                           |
| `--ignore-keys <glob>`    | Keys to skip, such as `"legacy.*"`                                                |
| `--ignore-locales <code>` | Locales to skip                                                                   |
| `--ignore-values <value>` | Values that may stay untranslated, such as brand names                            |
| `--disable-checks <id>`   | Checks to turn off, by the names in [What it checks](#what-it-checks)             |
| `--ignore-tags`           | ICU only: read tags such as `<b>` as plain text                                   |
| `--keys-as-text`          | For projects whose keys are the base text: an empty base value is read as its key |

Options that take a list can be repeated. Flags take a `--no-` form, such as
`--no-ignore-tags`. `-h` shows the help and `-v` the version.

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

## Exit codes

| Code | Meaning                               |
| ---- | ------------------------------------- |
| 0    | The run passed                        |
| 1    | Issues failed the run                 |
| 2    | A setting or the command is not valid |

Colors turn off when the output is not a terminal, or when `NO_COLOR` is set.

## On pull requests

The [Locale Guard](https://github.com/Mohamed-Almarag/locale-guard) GitHub
Action runs the same checks on every pull request. It writes one comment with
each issue and a block of the missing keys ready to paste, and marks each issue
on its line in the "Files changed" tab. Its README describes the formats, the
locale file layouts and every setting in full.

## License

[MIT](https://github.com/Mohamed-Almarag/locale-guard/blob/main/LICENSE)
