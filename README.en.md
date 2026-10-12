# ip-utils

[Wersja polska](README.md)

This library calculates IPv4 and IPv6 subnet parameters: the network address, mask, range and address count. It also formats IPv6 addresses and maps IPv4 to IPv6. Calculations use `bigint` to preserve the full address value.

## Usage

Download the package for your chosen version from [Releases](https://github.com/K44DEUSZ/ip-utils/releases), then install it in your project:

```sh
npm install ./k44deusz-ip-utils-1.0.0.tgz
```

```ts
import { calculateSubnet, formatAddress } from "@k44deusz/ip-utils";

const subnet = calculateSubnet("192.168.1.42", "24", 4);
formatAddress(subnet.network, 4); // "192.168.1.0"
subnet.hosts; // 254n
```

## Details

`parseAddress` turns text into an integer, `formatAddress` does the reverse, and `parsePrefix` accepts CIDR or an IPv4 mask. `calculateSubnet` returns network parameters and bit strings. Use `mapIpv4ToIpv6` and `extractMappedIpv4` for address mapping.

IPv4 `/31` and `/32` do not return a conventional broadcast address; `/31` exposes both endpoints. IPv6 does not get an IPv4-style host count or broadcast.

`classifyAddress` identifies selected familiar ranges, including private and documentation addresses. It is not a security filter or a complete routability check. Zone identifiers and URL brackets are not accepted. Errors use `IpError` with a stable `code` that your interface can translate.

## Development

Use Node.js 24 for development. The source is TypeScript; releases contain ESM JavaScript and type declarations.

```sh
npm ci
npm run check
npm test
```

A successful check of changes on `main` publishes a release. If the version already exists, automation increments its patch number and commits the change. Packages are available on GitHub; an npm-registry account is not required.

## License

MIT. Copyright 2026 Bartosz Golat.
