# ip-calculator

[English version](README.en.md)

Ta biblioteka oblicza parametry podsieci IPv4 i IPv6: adres sieci, maskę, zakres i liczbę adresów. Możesz też skracać zapis IPv6 i mapować IPv4 na IPv6. Obliczenia korzystają z `bigint`, więc nie tracą precyzji na dużych adresach.

Bieżące poprawki pozostają na wersji 1.0.0 i nie stanowią nowego wydania. Publiczna paczka 1.0.0 nie jest nadpisywana; nowe możliwości opisane poniżej dotyczą aktualnego kodu repozytorium. Aby je sprawdzić przed wydaniem, uruchom `npm ci`, `npm run build`, `npm pack` i zainstaluj uzyskany plik lokalnie. Changelog pozostaje w repozytorium i nie trafia do paczki.

## Jak użyć

Pobierz paczkę wybranego wydania z [Releases](https://github.com/K44DEUSZ/ip-calculator/releases), a następnie zainstaluj ją w swoim projekcie:

```sh
npm install ./k44deusz-ip-calculator-1.0.0.tgz
```

```ts
import { calculateSubnet, formatAddress } from "@k44deusz/ip-calculator";

const subnet = calculateSubnet("192.168.1.42", "24", 4);
formatAddress(subnet.network, 4); // "192.168.1.0"
subnet.hosts; // 254n
```

## Co warto wiedzieć

`parseAddress` zamienia tekst na liczbę, `formatAddress` wykonuje operację odwrotną, a `parsePrefix` odczytuje CIDR lub maskę IPv4. `calculateSubnet` zwraca parametry sieci i zapis bitowy. Do mapowania służą `mapIpv4ToIpv6` i `extractMappedIpv4`.

Dla IPv4 `/31` i `/32` wynik nie zawiera zwykłego adresu broadcast; `/31` udostępnia oba adresy jako końce połączenia. IPv6 nie dostaje liczby hostów ani broadcastu w znaczeniu IPv4.

`classifyAddress` rozpoznaje wybrane znane zakresy, np. prywatne i dokumentacyjne. Nie używaj tej funkcji jako filtra bezpieczeństwa lub pełnej oceny routowalności. Parser nie przyjmuje identyfikatorów strefy ani nawiasów używanych w URL. Błędy mają typ `IpError` i pole `code`, które możesz przetłumaczyć w swoim interfejsie.

## API

Wersja adresu to zawsze liczba `4` lub `6`, bez automatycznego zgadywania.

| Eksport                                                  | Wejście i wynik                                                                                                                                                                                     |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `parseAddress(text, version)`                            | Adres bez CIDR; zwraca `bigint`. Usuwa zewnętrzne białe znaki, odrzuca zera wiodące oktetów IPv4. Obsługuje końcówkę IPv4 w IPv6. Limit po trimowaniu: 64 znaki.                                    |
| `formatAddress(value, version, expanded = false)`        | `bigint` z zakresu `0..2^32-1` lub `0..2^128-1`. Zwraca IPv4 albo skrócony IPv6. `expanded=true` rozwija osiem grup IPv6 po cztery cyfry. Mapowane IPv4 domyślnie używa `::ffff:a.b.c.d`.           |
| `parsePrefix(text, version)`                             | Tekst `0..32` lub `0..128`, opcjonalnie z `/`; dla IPv4 także ciągła maska dziesiętna. Zwraca `number`.                                                                                             |
| `calculateSubnet(addressText, prefixText, version)`      | Argumenty obu parserów; zwraca parametry opisane poniżej. CIDR podaj w `prefixText`, nie dołączaj go do adresu.                                                                                     |
| `mapIpv4ToIpv6(value)`                                   | IPv4 jako `bigint`; zwraca IPv6 w `::ffff:0:0/96`.                                                                                                                                                  |
| `extractMappedIpv4(value)`                               | IPv6 jako `bigint`; zwraca IPv4 jako `bigint` albo `null`, jeśli adres nie jest mapowany.                                                                                                           |
| `classifyAddress(value, version)`                        | Zwraca `unspecified`, `loopback`, `multicast`, `link_local`, `unique_local`, `private`, `documentation`, `ipv4_mapped`, `limited_broadcast` lub `other`. To wybrane zakresy, nie kompletny rejestr. |
| `IpVersion`, `IpErrorCode`, `AddressCategory`, `IpError` | Typy TypeScript i klasa błędu rozszerzająca `RangeError`.                                                                                                                                           |

Wynik `calculateSubnet` zawiera:

- Liczby `version`, `prefix`, `width` i `hostBits`.
- Wartości `bigint`: `address`, `count`, `mask`, `wildcard`, `network`, `last`, `firstHost` i `lastHost`.
- `broadcast` i `hosts`: `bigint` albo `null`, zgodnie z wyjątkami IPv4 i IPv6 opisanymi wyżej.
- Teksty `addressBits`, `maskBits`, `networkBits`, dopełnione do 32 lub 128 bitów.

`firstHost` i `lastHost` w IPv6 opisują granice zakresu, nie gwarancję przydzielalności hostom. `/0` obejmuje całą przestrzeń adresową; liczba adresów nie oznacza liczby globalnie routowalnych hostów.

`IpError.code` to `invalid_version`, `address_too_long`, `invalid_ipv4`, `invalid_ipv6`, `invalid_mask`, `invalid_prefix` lub `address_out_of_range`. Pole `version` jest dostępne dla błędów zależnych od poprawnej wersji. Nie-tekstowe wejścia parserów i argumenty numeryczne inne niż `bigint` powodują `TypeError`. Nieciągła poprawnie zapisana maska daje `invalid_mask`; błędny oktet maski daje `invalid_ipv4`.

## Node.js i przeglądarka

Paczka ESM nie wymaga sieci, DOM ani frameworka. W Node.js użyj `.mjs` albo `"type": "module"`. W przeglądarce użyj bundlera lub zaimportuj plik `dist/index.js` jako moduł. Nie ma osobnego eksportu CommonJS. Dane `bigint` przed serializacją JSON zamień jawnie na tekst.

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

## Praca z kodem

Do pracy nad biblioteką użyj Node.js 24. Kod jest w TypeScript; wydania zawierają JavaScript ESM i deklaracje typów.

```sh
npm ci
npm run check
npm test
npm run check:package
```

Push na `main` uruchamia sprawdzenie kodu i testy. Wydanie publikuję osobno przez GitHub Actions, z numerem zapisanym w `package.json`. Automat nie zmienia tego numeru ani nie nadpisuje istniejącego wydania. Opublikowana paczka trafia do narzędzi na stronie po przejściu ich kontroli.

Szczegóły publikacji, konfiguracji i ponawiania operacji: [instrukcja wydań](docs/RELEASING.md).

## Licencja

MIT. Copyright 2026 Bartosz Golat.
