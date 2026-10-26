# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [1.3.2] - 2026-10-26

### Security

- Updated `undici`, the HTTP client the Action uses to call the GitHub API, to
  6.29.1 for its security fixes. The checks and their results are the same as in
  1.3.1.

### Changed

- The Action bundles one copy of `undici` instead of two, so `dist/index.js` is
  about 30% smaller.
- Updated the build to rollup 4.65.0 and `@rollup/plugin-typescript` 12.3.1.

## [1.3.1] - 2026-10-26

### Changed

- The README and the npm page say that Locale Guard is listed in the official
  docs of i18next and vue-i18n.
- The npm page ends with the same closing lines as the README.
- Updated `@typescript-eslint/eslint-plugin` to 8.72.0, a development tool only.

## [1.3.0] - 2026-10-21

### Added

- `locale-guard-cli`, a CLI on npm that runs the same checks on your machine and
  in git hooks. By default it reports only the issues added since the last
  commit. `--staged` checks a commit before it is made, `--base` compares with a
  branch, `--all` lists every issue, and `--output` writes the report as
  Markdown, the same as the pull request comment. It reads `.localeguard.yml`,
  and the settings that choose what to check can be given as options too.
- `ignore-tags` reads ICU tags such as `<b>` as plain text, for projects that
  format messages with intl-messageformat's `ignoreTag` option.
- `keys-as-text` reads an empty base value as its key, for projects whose keys
  are the base text.

### Changed

- Updated `@intlify/message-compiler` to 11.4.16, and the build to rollup
  4.64.10.

### Fixed

- A comment section longer than the comment limit was left out whole, so a pull
  request that added a locale to a project with 350 keys or more got a comment
  with no issue in it. The section now shows the rows that fit, and errors come
  first.
- When the job summary reaches its size limit, its last line tells you to run
  the CLI to list every issue.

## [1.2.0] - 2026-10-17

### Added

- Rails locale files. A file wrapped in its locale key (`en:` at the top of
  `en.yml`) is read without that key, and every file of a language (`en.yml`,
  `devise.en.yml`) is merged into one tree. A missing key is placed in the file
  that mirrors the base file, such as `devise.ar.yml`, and the copy-paste block
  puts the locale key back on top.
- Rails plurals in those files (`count.one`, `count.other`) are checked for the
  forms each language needs. A form that covers a single number, such as Arabic
  `two`, may write the number in words instead of `%{count}`.
- `base-file` names the base locale's file when its name has no locale code,
  such as `lang/main.json` next to `lang/main-ar.json`. A pull request that
  changes only that file is checked too.

### Changed

- The message for values shared by two locales no longer says that one file was
  probably copied into the other. It says the text differs from the base, and
  that either one file was copied from the other or both still hold an older
  base text.
- Updated `@intlify/message-compiler` to 11.4.14 and `zod` to 4.6.7.

### Fixed

- A very large report stopped the run with "Maximum call stack size exceeded".
  Mastodon, with about 125,000 issues, now runs to the end.
- A placeholder name written in another script, such as `{الاسم}` or
  `{{نماذج}}`, is reported as unexpected. Before, only the missing name was
  reported.
- Date and number formats such as `%b %d, %Y`, and printf placeholders such as
  `%s`, are not read as words in the untranslated check. A value like `Team: %s`
  that stays in English is no longer reported, because one word is left.
- A file such as `themes.json` next to `en.json` is not read as a locale.
- A language that Intl has no plural rules for is not checked for plural forms.
  Before, it was checked with the rules of the machine's own language.

## [1.1.0] - 2026-10-13

### Added

- `check-when: always` runs the checks on every pull request, even one that does
  not touch a locale file, and lists existing issues open in the comment. They
  still fail the check only with `fail-on-existing: true`. The default,
  `locale-changes`, keeps the current behavior.
- An extra key that looks like a base key the locale is missing gets a hint:
  "Did you mean `states.add_state`?". It covers keys in other letter case and
  one part of the path spelled a little differently.

### Fixed

- `ignore-values` keeps a line whole when it contains commas, so
  `Visa, Mastercard, Amex` can be ignored as one value. Each part of the line is
  still ignored on its own.
- Italian is treated as related to Spanish and Portuguese, so sentences that are
  written the same way in these languages are not reported as copied.
- The untranslated check counts the words of one plural branch:
  `ticket | tickets` is one word, not two.
- File names such as `comments.xlsx` are not reported as untranslated.
- A key with a space at its start or end, or with a character that takes no
  space on screen, is named as such wherever it is shown: `deals.attitude `
  (with a space at the end). Before, it looked like `deals.attitude`.
- Backslashes in values now show in the comment table. Before, `\"` showed as
  `"`.

## [1.0.3] - 2026-10-10

### Fixed

- A missing key links to its parent object in the locale file only when that
  parent exists. A flat key, or a key in a group the locale does not have yet,
  links to the key in the base file instead of to the top of the locale file.
- Plural forms of one key are listed in their natural order (`zero`, `one`,
  `two`, `few`, `many`, `other`) in the comment and in the copy-paste block.

## [1.0.2] - 2026-10-10

### Fixed

- The copy-paste block keeps flat keys flat. A file that writes
  `"cart.title": "Cart"`, as react-intl expects, now gets `"cart.title": ""`
  instead of a nested `cart` object.
- A missing key whose namespace file does not exist yet links to the key in the
  base file, instead of to a file that is not there.

## [1.0.1] - 2026-10-10

### Fixed

- `invalid-syntax` messages now start with the key, like every other check, so
  the annotations list shows which message is broken.

## [1.0.0] - 2026-10-10

First release.

### Checks

- `missing-keys`: keys of the base locale that another locale lacks.
- `extra-keys`: keys that are not in the base locale.
- `empty-values`: values that are empty or only whitespace.
- `placeholder-mismatch`: placeholders, ICU arguments and rich text tags that
  differ from the base message.
- `invalid-syntax`: messages the i18n library cannot compile.
- `broken-linked-messages`: vue-i18n links (`@:common.save`) to keys that do not
  exist.
- `untranslated`: text identical to the base, text without a letter of the
  language's script, and values copied between two locales.
- `plural-forms`: ICU plurals and i18next plural keys that miss forms the
  language needs, based on `Intl.PluralRules`.
- `parse-error`: locale files that are not valid JSON or YAML.

### Pull requests

- One comment per pull request, updated on every run, with a copy-paste block of
  the missing keys for each file.
- Annotations on the exact line in the "Files changed" tab.
- Full report in the job summary.
- New issues are separated from issues that already exist on the base branch,
  and only new issues fail the check by default.
- Pull requests from forks, whose token is read-only, get the job summary and
  annotations instead of a comment.
- Pull requests that change no locale file finish in seconds.

### Formats and settings

- vue-i18n (including Nuxt), ICU (next-intl, react-intl) and plain JSON
  (including i18next), in JSON or YAML files, one file per locale or one folder
  of namespace files per locale.
- Settings as action inputs or in `.localeguard.yml`.
- `fail-on`, `fail-on-existing`, `ignore-keys`, `ignore-locales`,
  `ignore-values` and `disable-checks`.

[1.3.2]: https://github.com/Mohamed-Almarag/locale-guard/releases/tag/v1.3.2
[1.3.1]: https://github.com/Mohamed-Almarag/locale-guard/releases/tag/v1.3.1
[1.3.0]: https://github.com/Mohamed-Almarag/locale-guard/releases/tag/v1.3.0
[1.2.0]: https://github.com/Mohamed-Almarag/locale-guard/releases/tag/v1.2.0
[1.1.0]: https://github.com/Mohamed-Almarag/locale-guard/releases/tag/v1.1.0
[1.0.3]: https://github.com/Mohamed-Almarag/locale-guard/releases/tag/v1.0.3
[1.0.2]: https://github.com/Mohamed-Almarag/locale-guard/releases/tag/v1.0.2
[1.0.1]: https://github.com/Mohamed-Almarag/locale-guard/releases/tag/v1.0.1
[1.0.0]: https://github.com/Mohamed-Almarag/locale-guard/releases/tag/v1.0.0
