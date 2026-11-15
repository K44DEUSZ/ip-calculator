# ip-calculator

[Wersja polska](README.md)

This library calculates IPv4 and IPv6 subnet parameters: the network address, mask, range and address count. It also formats IPv6 addresses and maps IPv4 to IPv6. Calculations use `bigint` to preserve the full address value.

The current changes remain at version 1.0.0 and are not a new release. The public 1.0.0 archive is not overwritten; the additions below describe the current repository source. To try them before publication, run `npm ci`, `npm run build`, `npm pack`, and install the resulting file locally. The changelog stays in the repository and is excluded from the package.

## Usage

Download the package for your chosen version from [Releases](https://github.com/K44DEUSZ/ip-calculator/releases), then install it in your project:

```sh
npm install ./k44deusz-ip-calculator-1.0.0.tgz
```

```ts
import { calculateSubnet, formatAddress } from "@k44deusz/ip-calculator";

const subnet = calculateSubnet("192.168.1.42", "24", 4);
formatAddress(subnet.network, 4); // "192.168.1.0"
subnet.hosts; // 254n
```

## Details

`parseAddress` turns text into an integer, `formatAddress` does the reverse, and `parsePrefix` accepts CIDR or an IPv4 mask. `calculateSubnet` returns network parameters and bit strings. Use `mapIpv4ToIpv6` and `extractMappedIpv4` for address mapping.

IPv4 `/31` and `/32` do not return a conventional broadcast address; `/31` exposes both endpoints. IPv6 does not get an IPv4-style host count or broadcast.

`classifyAddress` identifies selected familiar ranges, including private and documentation addresses. It is not a security filter or a complete routability check. Zone identifiers and URL brackets are not accepted. Errors use `IpError` with a stable `code` that your interface can translate.

## API

The version is always the number `4` or `6`; it is not inferred from the input.

| Export                                                   | Input and result                                                                                                                                                                                             |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `parseAddress(text, version)`                            | An address without CIDR; returns `bigint`. Trims surrounding whitespace and rejects leading zeros in IPv4 octets. Supports embedded IPv4 in IPv6. Maximum trimmed length: 64 characters.                     |
| `formatAddress(value, version, expanded = false)`        | A `bigint` in `0..2^32-1` or `0..2^128-1`. Returns IPv4 or compressed IPv6. `expanded=true` emits eight four-digit IPv6 groups. Mapped IPv4 uses `::ffff:a.b.c.d` by default.                                |
| `parsePrefix(text, version)`                             | A string in `0..32` or `0..128`, optionally prefixed with `/`; IPv4 also accepts contiguous dotted-decimal masks. Returns `number`.                                                                          |
| `calculateSubnet(addressText, prefixText, version)`      | Inputs for both parsers; returns the fields below. Pass CIDR in `prefixText`, not appended to the address.                                                                                                   |
| `mapIpv4ToIpv6(value)`                                   | An IPv4 `bigint`; returns mapped IPv6 in `::ffff:0:0/96`.                                                                                                                                                    |
| `extractMappedIpv4(value)`                               | An IPv6 `bigint`; returns an IPv4 `bigint` or `null` for an unmapped address.                                                                                                                                |
| `classifyAddress(value, version)`                        | Returns `unspecified`, `loopback`, `multicast`, `link_local`, `unique_local`, `private`, `documentation`, `ipv4_mapped`, `limited_broadcast` or `other`. These are selected ranges, not a complete registry. |
| `IpVersion`, `IpErrorCode`, `AddressCategory`, `IpError` | TypeScript types and an error class extending `RangeError`.                                                                                                                                                  |

`calculateSubnet` returns:

- Numbers: `version`, `prefix`, `width`, `hostBits`.
- `bigint` fields: `address`, `count`, `mask`, `wildcard`, `network`, `last`, `firstHost`, `lastHost`.
- `broadcast` and `hosts`: `bigint` or `null`, following the IPv4/IPv6 rules above.
- Strings `addressBits`, `maskBits`, `networkBits`, padded to 32 or 128 bits.

IPv6 `firstHost` and `lastHost` describe range boundaries, not guaranteed host eligibility. `/0` spans the entire address space; its address count is not a count of globally routable hosts.

`IpError.code` is `invalid_version`, `address_too_long`, `invalid_ipv4`, `invalid_ipv6`, `invalid_mask`, `invalid_prefix` or `address_out_of_range`. `version` is set for errors associated with a valid version. Non-string parser inputs and numerical inputs other than `bigint` raise `TypeError`. A well-formed noncontiguous mask gives `invalid_mask`; a malformed mask octet gives `invalid_ipv4`.

## Node.js and browsers

This ESM package needs no network, DOM or framework. In Node.js, use `.mjs` or `"type": "module"`. In browsers, use a bundler or import `dist/index.js` as a module. There is no separate CommonJS export. Convert `bigint` values explicitly to strings before JSON serialization.

```js
import { parseAddress, mapIpv4ToIpv6, formatAddress, IpError } from "@k44deusz/ip-calculator";

try {
  const mapped = mapIpv4ToIpv6(parseAddress("192.0.2.1", 4));
  console.log(formatAddress(mapped, 6)); // "::ffff:192.0.2.1"
} catch (error) {
  if (!(error instanceof IpError)) throw error;
  console.error(error.code);
}
```

## Development

Use Node.js 24 for development. The source is TypeScript; releases contain ESM JavaScript and type declarations.

```sh
npm ci
npm run check
npm test
npm run check:package
```

A push to `main` runs checks and tests. Releases are published separately through GitHub Actions, using the version saved in `package.json`. Automation does not change that version or overwrite an existing release. A published release updates the dependency used by the website after its checks pass.

Publication, configuration and recovery are documented in the [release guide](docs/RELEASING.md).

## License

MIT. Copyright 2026 Bartosz Golat.
