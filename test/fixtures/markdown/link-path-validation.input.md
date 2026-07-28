# Links

## Real Heading

Good: [t](./link-target.md), [t2](./link-target.md#locale-policy), [self](#real-heading).

Bad file: [x](./nope.md)

Bad fragment: [x](./link-target.md#no-such-heading)

Bad self-anchor: [x](#nonexistent)

Dangling absolute: [x](/no/such/path/x.json)

Empty: [x]()

External is not checked: [x](https://example.com/a.md#frag) and [m](mailto:a@b.c)

In code: `[x](./nope.md)` is skipped.

```md
[x](./alsonope.md)
```
