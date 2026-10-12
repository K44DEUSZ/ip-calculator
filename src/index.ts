export type IpVersion = 4 | 6;
export type IpErrorCode =
  | "invalid_version"
  | "address_too_long"
  | "invalid_ipv4"
  | "invalid_ipv6"
  | "invalid_mask"
  | "invalid_prefix"
  | "address_out_of_range";

export class IpError extends RangeError {
  constructor(
    public readonly code: IpErrorCode,
    public readonly version?: IpVersion,
  ) {
    super(code);
    this.name = "IpError";
  }
}

function widthOf(version: IpVersion): number {
  if (version !== 4 && version !== 6) throw new IpError("invalid_version");
  return version === 4 ? 32 : 128;
}

function validateValue(value: bigint, version: IpVersion): void {
  const width = widthOf(version);
  if (typeof value !== "bigint") throw new TypeError("Expected a bigint address.");
  if (value < 0n || value >= 1n << BigInt(width))
    throw new IpError("address_out_of_range", version);
}

function parseV4(text: string): bigint {
  const octets = text.split(".");
  if (
    octets.length !== 4 ||
    octets.some((part) => !/^(0|[1-9]\d{0,2})$/.test(part) || Number(part) > 255)
  )
    throw new IpError("invalid_ipv4", 4);
  return octets.reduce((value, part) => (value << 8n) | BigInt(part), 0n);
}

export function parseAddress(text: string, version: IpVersion): bigint {
  widthOf(version);
  if (typeof text !== "string") throw new TypeError("Expected an address string.");
  let input = text.trim();
  if (input.length > 64) throw new IpError("address_too_long", version);
  if (version === 4) return parseV4(input);
  const fail = () => new IpError("invalid_ipv6", 6);
  if (!input || /[^\da-fA-F:.]/.test(input)) throw fail();
  if (input.includes(".")) {
    const lastColon = input.lastIndexOf(":");
    if (lastColon < 0) throw fail();
    let tail: bigint;
    try {
      tail = parseV4(input.slice(lastColon + 1));
    } catch {
      throw fail();
    }
    input =
      input.slice(0, lastColon + 1) +
      (tail >> 16n).toString(16) +
      ":" +
      (tail & 65535n).toString(16);
  }
  const halves = input.split("::");
  if (halves.length > 2) throw fail();
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const supplied = left.length + right.length;
  if ((halves.length === 1 && supplied !== 8) || (halves.length === 2 && supplied >= 8))
    throw fail();
  const groups = [...left, ...Array<string>(8 - supplied).fill("0"), ...right];
  if (groups.some((part) => !/^[\da-fA-F]{1,4}$/.test(part))) throw fail();
  return groups.reduce((value, part) => (value << 16n) | BigInt("0x" + part), 0n);
}

export function formatAddress(value: bigint, version: IpVersion, expanded = false): string {
  validateValue(value, version);
  if (version === 4)
    return [24n, 16n, 8n, 0n].map((shift) => String((value >> shift) & 255n)).join(".");
  const groups = Array.from({ length: 8 }, (_, index) =>
    Number((value >> BigInt((7 - index) * 16)) & 65535n),
  );
  if (expanded) return groups.map((part) => part.toString(16).padStart(4, "0")).join(":");
  // RFC 5952 recommends mixed notation for the IPv4-mapped prefix.
  if (value >> 32n === 65535n) return "::ffff:" + formatAddress(value & 0xffffffffn, 4);
  let start = -1;
  let length = 1;
  for (let index = 0; index < 8;) {
    if (groups[index] !== 0) {
      index += 1;
      continue;
    }
    let end = index;
    while (end < 8 && groups[end] === 0) end += 1;
    if (end - index > length) {
      start = index;
      length = end - index;
    }
    index = end;
  }
  const text = groups.map((part) => part.toString(16));
  return start < 0
    ? text.join(":")
    : text.slice(0, start).join(":") + "::" + text.slice(start + length).join(":");
}

export function parsePrefix(text: string, version: IpVersion): number {
  const width = widthOf(version);
  if (typeof text !== "string") throw new TypeError("Expected a prefix string.");
  const input = text.trim().replace(/^\//, "");
  if (version === 4 && input.includes(".")) {
    const bits = parseV4(input).toString(2).padStart(32, "0");
    if (!/^1*0*$/.test(bits)) throw new IpError("invalid_mask", 4);
    return bits.indexOf("0") < 0 ? 32 : bits.indexOf("0");
  }
  if (!/^(0|[1-9]\d{0,2})$/.test(input) || Number(input) > width)
    throw new IpError("invalid_prefix", version);
  return Number(input);
}

export function mapIpv4ToIpv6(address: bigint): bigint {
  validateValue(address, 4);
  return (0xffffn << 32n) | address;
}

export function extractMappedIpv4(address: bigint): bigint | null {
  validateValue(address, 6);
  return address >> 32n === 0xffffn ? address & 0xffffffffn : null;
}

export function calculateSubnet(addressText: string, prefixText: string, version: IpVersion) {
  const address = parseAddress(addressText, version);
  const prefix = parsePrefix(prefixText, version);
  const width = widthOf(version);
  const hostBits = width - prefix;
  const count = 1n << BigInt(hostBits);
  const wildcard = count - 1n;
  const mask = ((1n << BigInt(width)) - 1n) ^ wildcard;
  const network = address & mask;
  const last = network | wildcard;
  const conventionalHosts = version === 4 && prefix < 31;
  return {
    version,
    address,
    prefix,
    width,
    hostBits,
    count,
    mask,
    wildcard,
    network,
    last,
    broadcast: conventionalHosts ? last : null,
    hosts: version === 4 ? (conventionalHosts ? count - 2n : count) : null,
    firstHost: conventionalHosts ? network + 1n : network,
    lastHost: conventionalHosts ? last - 1n : last,
    addressBits: address.toString(2).padStart(width, "0"),
    maskBits: mask.toString(2).padStart(width, "0"),
    networkBits: network.toString(2).padStart(width, "0"),
  };
}

export type AddressCategory =
  | "unspecified"
  | "loopback"
  | "multicast"
  | "link_local"
  | "unique_local"
  | "private"
  | "documentation"
  | "ipv4_mapped"
  | "limited_broadcast"
  | "other";

/** Describes selected well-known ranges; it is not a routability or access-control verdict. */
export function classifyAddress(value: bigint, version: IpVersion): AddressCategory {
  validateValue(value, version);
  if (value === 0n) return "unspecified";
  if (version === 6) {
    if (value === 1n) return "loopback";
    if (value >> 120n === 255n) return "multicast";
    if (value >> 118n === 1018n) return "link_local";
    if (value >> 121n === 126n) return "unique_local";
    if (value >> 96n === 0x20010db8n) return "documentation";
    if (value >> 32n === 65535n) return "ipv4_mapped";
    return "other";
  }
  if (value === 0xffffffffn) return "limited_broadcast";
  if (value >> 24n === 127n) return "loopback";
  if (value >> 16n === 0xa9fen) return "link_local";
  if (value >> 24n === 10n || value >> 20n === 2753n || value >> 16n === 49320n) return "private";
  if (value >> 28n === 14n) return "multicast";
  if ([0xc00002n, 0xc63364n, 0xcb0071n].includes(value >> 8n)) return "documentation";
  return "other";
}
