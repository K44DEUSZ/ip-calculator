# ip-calculator

[English version](README.en.md)

Ta biblioteka oblicza parametry podsieci IPv4 i IPv6: adres sieci, maskę, zakres i liczbę adresów. Możesz też skracać zapis IPv6 i mapować IPv4 na IPv6. Obliczenia korzystają z `bigint`, więc nie tracą precyzji na dużych adresach.

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

## Praca z kodem

Do pracy nad biblioteką użyj Node.js 24. Kod jest w TypeScript; wydania zawierają JavaScript ESM i deklaracje typów.

```sh
npm ci
npm run check
npm test
```

Push na `main` uruchamia sprawdzenie kodu i testy. Wydanie publikuję osobno przez GitHub Actions, z numerem zapisanym w `package.json`. Automat nie zmienia tego numeru ani nie nadpisuje istniejącego wydania. Opublikowana paczka trafia do narzędzi na stronie po przejściu ich kontroli.

## Licencja

MIT. Copyright 2026 Bartosz Golat.
