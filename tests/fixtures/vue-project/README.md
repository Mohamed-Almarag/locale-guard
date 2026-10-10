# vue-project fixture

vue-i18n messages. Base locale: `en`. Each issue below is intentional.

## ar.json

| Key | Issue | Check |
|---|---|---|
| `auction.bid.tooLow` | missing | missing-keys |
| `auction.oldKey` | not in base | extra-keys |
| `common.cancel` | empty value | empty-values |
| `inbox.greeting` | missing `{name}` | placeholder-mismatch |
| `auction.saveBid` | links to `@:common.sav`, which does not exist (placeholder-mismatch does not compare links) | broken-linked-messages |
| `common.ok` | `OK`, no Arabic letters; silence with ignore-values | untranslated |
| `cart.items` | one plural branch, base has three; not reported, since plural-forms does not check vue-i18n | none |

## fr.json

| Key | Issue | Check |
|---|---|---|
| `auction.bid.placed` | `{amout}` instead of `{amount}` | placeholder-mismatch |
| `auction.bid.tooLow` | identical to base, not translated | untranslated |

Everything else in `fr.json` is correct and must not be reported.
