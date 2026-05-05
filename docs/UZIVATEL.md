# Návod – Rohlík hlídač slev

Aplikace ti každé ráno pošle e-mail, pokud je některý z tvých oblíbených
produktů z Rohlíku ve slevě nad nastavenou hranicí. Ty jen rozhoduješ, co tě
zajímá.

## Přihlášení

Otevři si v prohlížeči adresu, kterou ti dal Ondra (něco jako
`https://nazev.vercel.app`). Prohlížeč se zeptá na jméno a heslo – zadej je
jednou, prohlížeč si je zapamatuje.

## Přidání produktu

1. Najdi produkt na [rohlik.cz](https://www.rohlik.cz). V adresním řádku
   zkopíruj odkaz – vypadá takhle:
   `https://www.rohlik.cz/123456-nazev-produktu`.
2. Vlož ho do políčka **„Vlož odkaz z Rohlíku"** nahoře a klikni **Načíst**.
3. Zobrazí se náhled (název + obrázek). Posuvníkem zvol minimální slevu, při
   které tě má aplikace upozornit (např. 20 %).
4. Klikni **Přidat na seznam**.

## Smazání nebo úprava

U každé položky:
- Křížek vpravo → odebrat.
- **změnit** vedle „Upozornit od X %" → posuvník + **Uložit**.

## Co vidím u každé položky

- **„Dnes sleva −34 % · 79 Kč"** (žluté) – produkt je dnes ve slevě, sleva je
  nad tvým minimem. Ráno ti přijde e-mail.
- **„Dnes není ve slevě."** (šedé) – dnes není v sekci Zachraň a ušetři, nebo
  je sleva pod tvojí hranicí.

## Nastavení

Klikni vpravo nahoře na **Nastavení**. Můžeš změnit:

- **E-mail pro upozornění** – kam se mají posílat upozornění.
- **Čas zaslání** – kolikátá hodina ráno (středoevropský čas). Doporučuju 7:00
  nebo 8:00, ať máš info ke snídani.
- **Výchozí minimální sleva** – jaké procento se předvyplní, když přidáš novou
  položku. Pro každou pak můžeš nastavit jiné.

## E-mail

Pokud se najde shoda, ráno ti přijde jeden e-mail se všemi položkami, které
jsou ve slevě. Klikneš na produkt → otevře se ti přímo na Rohlíku, kde můžeš
přidat do košíku.

Pokud žádná shoda není, e-mail ti nepřijde.

## Co když něco nefunguje

- **Nejde přidat – „URL must look like…"** → zkontroluj odkaz, musí
  obsahovat číslo (např. `1408933-...`).
- **Náhled se nenačte** → produkt byl pravděpodobně z Rohlíku stažen. Zkus
  jiný odkaz.
- **Nedostala jsem e-mail, ale produkt je ve slevě** → napiš Ondrovi.
  Většinou jde o vypršenou „warehouse session" – musí znovu nahrát soubor
  v admin sekci.

## Tipy

- Můžeš si přidat klidně 50+ položek. Aplikace vyhodnocuje všechny najednou.
- Když ti vyšla položka „dnes ve slevě", ale nestihla jsi ji koupit, druhý
  den znovu zkontroluje – pokud je sleva pořád aktivní, znovu ti přijde
  e-mail. Až sleva skončí, zmizí i ze seznamu „dnes ve slevě".
- Pokud chceš dočasně přestat dostávat e-maily o nějaké položce, můžeš ji buď
  smazat, nebo nastavit minimální slevu třeba na 90 % (prakticky se nikdy
  netrefí).
