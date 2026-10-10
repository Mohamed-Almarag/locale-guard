# next-project fixture

next-intl (ICU) messages. Base locale: `en`. Each issue below is intentional.

## ar.json

| Key | Issue | Check |
|---|---|---|
| `Checkout.coupon.invalid` | missing | missing-keys |
| `Terms.agree` | missing `<link>` tag | placeholder-mismatch |
| `Profile.welcome` | select argument `{gendr}` instead of `{gender}` | placeholder-mismatch |
| `Checkout.total` | no Arabic letters, not translated | untranslated |
| `Cart.items` | only `one` and `other`; Arabic needs zero, one, two, few, many, other | plural-forms |
