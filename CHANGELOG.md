# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [1.1.0] - 2026-10-12

### Added

- `check-when: always` runs the checks on every pull request, even one that does
  not touch a locale file, and lists existing issues open in the comment. They
  still fail the check only with `fail-on-existing: true`. The default,
  `locale-changes`, keeps the current behavior.
- An extra key that looks like a base key the locale is missing gets a hint:
  "Did you mean `states.add_state`?". It covers keys in other letter case and
  one part of the path spelled a little differently. A space at the edge of a
  key or of one of its parts is named in the hint, since it cannot be seen.

### Fixed

- `ignore-values` keeps a line whole when it contains commas, so
  `Visa, Mastercard, Amex` can be ignored as one value. Each part of the line is
  still ignored on its own.
- Italian is treated as related to Spanish and Portuguese, so sentences that are
  written the same way in these languages are not reported as copied.
- The untranslated check counts the words of one plural branch:
  `ticket | tickets` is one word, not two.
- File names such as `comments.xlsx` are not reported as untranslated.
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

[1.1.0]: https://github.com/Mohamed-Almarag/locale-guard/releases/tag/v1.1.0
[1.0.3]: https://github.com/Mohamed-Almarag/locale-guard/releases/tag/v1.0.3
[1.0.2]: https://github.com/Mohamed-Almarag/locale-guard/releases/tag/v1.0.2
[1.0.1]: https://github.com/Mohamed-Almarag/locale-guard/releases/tag/v1.0.1
[1.0.0]: https://github.com/Mohamed-Almarag/locale-guard/releases/tag/v1.0.0
