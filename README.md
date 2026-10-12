# ip-utils

Dependency-free IPv4/IPv6 parsing, formatting, subnet calculations and mapping.

Independent TypeScript source, ESM JavaScript releases and generated type declarations. No React, Next.js, runtime dependencies, UI or private application configuration.

## Installation

Download a versioned package from [Releases](https://github.com/K44DEUSZ/ip-utils/releases), then install it:

```sh
npm install ./k44deusz-ip-utils-1.0.0.tgz
```

Packages are distributed as GitHub release assets; no npm-registry publication is implied.

## Usage

```ts
import { calculateSubnet, formatAddress } from "@k44deusz/ip-utils";

const subnet = calculateSubnet("192.168.1.42", "24", 4);
formatAddress(subnet.network, 4); // "192.168.1.0"
subnet.hosts; // 254n
```

## Contract

The public API exports `parseAddress`, `formatAddress`, `parsePrefix`, `calculateSubnet`, `mapIpv4ToIpv6`, `extractMappedIpv4`, `classifyAddress`, and `IpError`. Values use `bigint`, so they are exact for both address families. Formatters validate the family and numeric range. IPv6 output compresses the longest zero run, preferring the first on ties, and uses dotted notation for IPv4-mapped addresses.

IPv4 /31 and /32 have no conventional broadcast in this API; /31 exposes both addresses as usable endpoints. IPv6 does not report an IPv4-style host count or broadcast. `classifyAddress` describes selected familiar ranges; it is not a complete IANA registry, routability check or security filter. Zone identifiers and URI brackets are not accepted.

`IpError.code` is stable and independent of human-language translations. Codes: `invalid_version`, `address_too_long`, `invalid_ipv4`, `invalid_ipv6`, `invalid_mask`, `invalid_prefix`, `address_out_of_range`. Non-string/non-bigint argument types raise `TypeError`.

## Development

Use Node.js 24 for development and CI.

```sh
npm ci
npm run check
npm test
```

A successful push to main creates a tested versioned release. If the package version already exists, the release workflow increments its patch version and commits that metadata. Explicit higher versions are preserved. Release artifacts include compiled JavaScript, declarations and this license.

## License

MIT. Copyright 2026 Bartosz Golat.
