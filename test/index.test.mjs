import assert from "node:assert/strict";
import { isIP } from "node:net";
import test from "node:test";
import {
  parseAddress,
  formatAddress,
  parsePrefix,
  calculateSubnet,
  mapIpv4ToIpv6,
  extractMappedIpv4,
  classifyAddress,
  IpError,
} from "../dist/index.js";

test("IPv4 round trips and subnet boundaries use exact integer values", () => {
  for (const address of ["0.0.0.0", "192.168.1.42", "255.255.255.255"])
    assert.equal(formatAddress(parseAddress(address, 4), 4), address);
  const subnet = calculateSubnet("192.168.1.42", "255.255.255.0", 4);
  assert.equal(formatAddress(subnet.network, 4), "192.168.1.0");
  assert.equal(formatAddress(subnet.broadcast, 4), "192.168.1.255");
  assert.equal(subnet.hosts, 254n);
  assert.equal(formatAddress(subnet.firstHost, 4), "192.168.1.1");
  assert.equal(formatAddress(subnet.lastHost, 4), "192.168.1.254");
  assert.equal(calculateSubnet("192.0.2.1", "0", 4).count, 4294967296n);
  for (const [prefix, hosts] of [
    [31, 2n],
    [32, 1n],
  ]) {
    const result = calculateSubnet("192.0.2.1", String(prefix), 4);
    assert.equal(result.hosts, hosts);
    assert.equal(result.broadcast, null);
  }
});

test("IPv6 compression follows longest-run and first-run tie rules", () => {
  const vectors = [
    ["0:0:0:0:0:0:0:0", "::"],
    ["0:0:0:0:0:0:0:1", "::1"],
    ["2001:0DB8:0000:0000:0008:0800:200C:417A", "2001:db8::8:800:200c:417a"],
    ["2001:0:0:1:0:0:1:1", "2001::1:0:0:1:1"],
    ["2001:db8:0:1:1:1:1:1", "2001:db8:0:1:1:1:1:1"],
    ["::ffff:192.0.2.1", "::ffff:192.0.2.1"],
  ];
  for (const [source, expected] of vectors) {
    const value = parseAddress(source, 6);
    assert.equal(formatAddress(value, 6), expected);
    assert.equal(isIP(expected), 6);
    assert.equal(parseAddress(expected, 6), value);
    assert.equal(formatAddress(value, 6, true).split(":").length, 8);
  }
  const subnet = calculateSubnet("2001:db8:1234::42", "/64", 6);
  assert.equal(formatAddress(subnet.network, 6), "2001:db8:1234::");
  assert.equal(subnet.count, 18446744073709551616n);
  assert.equal(subnet.hosts, null);
  assert.equal(subnet.broadcast, null);
  assert.equal(calculateSubnet("::1", "0", 6).count, 1n << 128n);
  assert.equal(calculateSubnet("::1", "128", 6).count, 1n);
});

test("rejects malformed addresses, masks, prefixes, versions and numeric ranges", () => {
  for (const address of ["", "1.2.3", "256.1.2.3", "01.2.3.4", "1.2.3.4.5", "-1.2.3.4"])
    assert.throws(() => parseAddress(address, 4), IpError);
  for (const address of [
    "",
    ":1:2:3:4:5:6:7",
    "1:2:3:4:5:6:7:",
    "1::2::3",
    "1:2:3:4:5:6:7",
    "1:2:3:4:5:6:7:8:9",
    "12345::",
    "fe80::1%eth0",
    "[::1]",
    "::ffff:192.0.2.999",
  ])
    assert.throws(() => parseAddress(address, 6), IpError);
  assert.throws(() => parseAddress("1".repeat(65), 6), { code: "address_too_long" });
  assert.throws(() => parsePrefix("255.0.255.0", 4), { code: "invalid_mask" });
  for (const version of [4, 6]) {
    for (const prefix of ["-1", "1.5", "01", "129", "", "1e1"])
      assert.throws(() => parsePrefix(prefix, version), IpError);
    assert.throws(() => formatAddress(-1n, version), { code: "address_out_of_range" });
    assert.throws(() => formatAddress(1n << BigInt(version === 4 ? 32 : 128), version), IpError);
  }
  assert.throws(() => parsePrefix("33", 4), { code: "invalid_prefix", version: 4 });
  assert.throws(() => parseAddress("::1", 5), { code: "invalid_version" });
  assert.throws(() => parseAddress(null, 4), TypeError);
});

test("IPv4 mapping and selected range categories remain independent of translations", () => {
  const address = parseAddress("192.0.2.1", 4);
  const mapped = mapIpv4ToIpv6(address);
  assert.equal(formatAddress(mapped, 6), "::ffff:192.0.2.1");
  assert.equal(extractMappedIpv4(mapped), address);
  assert.equal(extractMappedIpv4(parseAddress("::1", 6)), null);
  assert.throws(() => mapIpv4ToIpv6(1n << 32n), IpError);
  for (const [addressText, version, category] of [
    ["0.0.0.0", 4, "unspecified"],
    ["127.0.0.1", 4, "loopback"],
    ["10.1.2.3", 4, "private"],
    ["172.16.0.1", 4, "private"],
    ["172.31.255.255", 4, "private"],
    ["172.32.0.1", 4, "other"],
    ["192.168.1.1", 4, "private"],
    ["169.254.1.1", 4, "link_local"],
    ["224.0.0.1", 4, "multicast"],
    ["192.0.2.1", 4, "documentation"],
    ["255.255.255.255", 4, "limited_broadcast"],
    ["::", 6, "unspecified"],
    ["::1", 6, "loopback"],
    ["ff02::1", 6, "multicast"],
    ["fe80::1", 6, "link_local"],
    ["fd00::1", 6, "unique_local"],
    ["2001:db8::1", 6, "documentation"],
    ["::ffff:192.0.2.1", 6, "ipv4_mapped"],
  ])
    assert.equal(classifyAddress(parseAddress(addressText, version), version), category);
});

test("all CIDR widths preserve exact subnet bounds and dotted-mask equivalence", () => {
  for (const version of [4, 6]) {
    const width = version === 4 ? 32 : 128;
    const maximum = (1n << BigInt(width)) - 1n;
    const addresses = [0n, 1n, maximum / 3n, maximum - 1n, maximum];
    for (let prefix = 0; prefix <= width; prefix += 1) {
      assert.equal(parsePrefix(`/${prefix}`, version), prefix);
      const count = 1n << BigInt(width - prefix);
      const mask = maximum - count + 1n;
      if (version === 4) assert.equal(parsePrefix(formatAddress(mask, 4), 4), prefix);
      for (const address of addresses) {
        const subnet = calculateSubnet(formatAddress(address, version), String(prefix), version);
        const network = address - (address % count);
        assert.equal(subnet.network, network);
        assert.equal(subnet.last, network + count - 1n);
        assert.equal(subnet.last - subnet.network + 1n, subnet.count);
        assert.ok(subnet.network <= address && address <= subnet.last);
        assert.equal(subnet.mask, mask);
        if (version === 4) {
          assert.equal(subnet.hosts, prefix < 31 ? count - 2n : count);
          assert.equal(subnet.broadcast, prefix < 31 ? subnet.last : null);
          assert.equal(subnet.firstHost, prefix < 31 ? network + 1n : network);
          assert.equal(subnet.lastHost, prefix < 31 ? subnet.last - 1n : subnet.last);
        } else {
          assert.equal(subnet.hosts, null);
          assert.equal(subnet.broadcast, null);
        }
      }
    }
  }
});

test("deterministic addresses agree with the independent Node parser and mapping", () => {
  let state = 123456789n;
  for (const version of [4, 6]) {
    const maximum = (1n << BigInt(version === 4 ? 32 : 128)) - 1n;
    for (let index = 0; index < 256; index += 1) {
      state = (state * 6364136223846793005n + 1442695040888963407n) & ((1n << 128n) - 1n);
      const value = state & maximum;
      for (const expanded of [false, true]) {
        const text = formatAddress(value, version, expanded);
        assert.equal(isIP(text), version);
        assert.equal(parseAddress(text, version), value);
      }
      if (version === 4) assert.equal(extractMappedIpv4(mapIpv4ToIpv6(value)), value);
    }
  }
  for (const text of [
    "1:2:3:4:5:6:192.0.2.1",
    "::192.0.2.1",
    "2001:db8::192.0.2.1",
    "1::",
    "::1",
    "ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff",
  ]) {
    assert.equal(isIP(text), 6);
    const value = parseAddress(text, 6);
    assert.equal(parseAddress(formatAddress(value, 6), 6), value);
  }
});

test("well-known range classifications include both boundary addresses only", () => {
  for (const [version, start, end, category] of [
    [4, "10.0.0.0", "10.255.255.255", "private"],
    [4, "172.16.0.0", "172.31.255.255", "private"],
    [4, "192.168.0.0", "192.168.255.255", "private"],
    [4, "127.0.0.0", "127.255.255.255", "loopback"],
    [4, "169.254.0.0", "169.254.255.255", "link_local"],
    [4, "192.0.2.0", "192.0.2.255", "documentation"],
    [4, "198.51.100.0", "198.51.100.255", "documentation"],
    [4, "203.0.113.0", "203.0.113.255", "documentation"],
    [4, "224.0.0.0", "239.255.255.255", "multicast"],
    [6, "fc00::", "fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff", "unique_local"],
    [6, "fe80::", "febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff", "link_local"],
    [6, "2001:db8::", "2001:db8:ffff:ffff:ffff:ffff:ffff:ffff", "documentation"],
    [6, "::ffff:0.0.0.0", "::ffff:255.255.255.255", "ipv4_mapped"],
  ]) {
    const first = parseAddress(start, version);
    const last = parseAddress(end, version);
    assert.equal(classifyAddress(first, version), category);
    assert.equal(classifyAddress(last, version), category);
    assert.notEqual(classifyAddress(first - 1n, version), category);
    assert.notEqual(classifyAddress(last + 1n, version), category);
  }
  assert.equal(classifyAddress(parseAddress("ff00::", 6), 6), "multicast");
  assert.equal(classifyAddress((1n << 128n) - 1n, 6), "multicast");
});

test("JavaScript type errors and malformed text retain stable public errors", () => {
  for (const version of [4, 6]) {
    for (const value of [null, undefined, 1, 1n, {}, []]) {
      assert.throws(() => parseAddress(value, version), TypeError);
      assert.throws(() => parsePrefix(value, version), TypeError);
    }
    for (const value of [null, undefined, 1, "1", {}, NaN]) {
      assert.throws(() => formatAddress(value, version), TypeError);
      assert.throws(() => classifyAddress(value, version), TypeError);
    }
    assert.throws(() => parsePrefix("/", version), { code: "invalid_prefix", version });
    assert.throws(() => parsePrefix("//1", version), { code: "invalid_prefix", version });
  }
  for (const version of [null, undefined, "4", 0, 5, NaN]) {
    assert.throws(() => parseAddress("0.0.0.0", version), { code: "invalid_version" });
    assert.throws(() => formatAddress(0n, version), { code: "invalid_version" });
  }
  for (const separator of ["\n", "\r", "\r\n", "\t", " ", "\u2028", "\u2029"])
    assert.throws(() => parseAddress(`192${separator}.0.2.1`, 4), { code: "invalid_ipv4" });
  for (const address of [":::1", "1::2::3", "1:2:3:4:5:6::192.0.2.1", "::ffff:01.2.3.4"])
    assert.throws(() => parseAddress(address, 6), { name: "IpError", code: "invalid_ipv6" });
  for (const mask of ["255.0.255.0", "0.0.0.1", "255.255.255.253"])
    assert.throws(() => parsePrefix(mask, 4), { code: "invalid_mask", version: 4 });
  assert.throws(() => parsePrefix("255.255.255.256", 4), { code: "invalid_ipv4", version: 4 });
});
