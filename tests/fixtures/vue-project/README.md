# vue-project fixture

vue-i18n messages. Base locale: `en`. Each issue below is intentional.

## ar.json

| Key | Issue | Check |
|---|---|---|
| `auction.bid.tooLow` | missing | F2 missing-keys |
| `auction.oldKey` | not in base | F3 extra-keys |
| `common.cancel` | empty value | F4 empty-values |
| `inbox.greeting` | missing `{name}` | F5 placeholder-mismatch |
| `auction.saveBid` | links to `@:common.sav`, which does not exist | F6 broken-linked-messages |
| `common.ok` | identical to base (`OK`), should be ignorable | F7 untranslated |
| `cart.items` | one plural branch, base has three | F8 plural-forms |

## fr.json

| Key | Issue | Check |
|---|---|---|
| `auction.bid.placed` | `{amout}` instead of `{amount}` | F5 placeholder-mismatch |
| `auction.bid.tooLow` | identical to base, not translated | F7 untranslated |

Everything else in `fr.json` is correct and must not be reported.
