# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

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

[1.0.1]: https://github.com/Mohamed-Almarag/locale-guard/releases/tag/v1.0.1
[1.0.0]: https://github.com/Mohamed-Almarag/locale-guard/releases/tag/v1.0.0
