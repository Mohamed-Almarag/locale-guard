# next-project fixture

next-intl (ICU) messages. Base locale: `en`. Each issue below is intentional.

## ar.json

| Key | Issue | Check |
|---|---|---|
| `Checkout.coupon.invalid` | missing | F2 missing-keys |
| `Terms.agree` | missing `<link>` tag | F5 placeholder-mismatch |
| `Profile.welcome` | select argument `{gendr}` instead of `{gender}` | F5 placeholder-mismatch |
| `Checkout.total` | identical to base, not translated | F7 untranslated |
| `Cart.items` | only `one` and `other`; Arabic needs zero, one, two, few, many, other | F8 plural-forms |
