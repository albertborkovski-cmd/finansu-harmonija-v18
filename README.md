# Finansų harmonija V15

Užfiksuota V15 testavimo versija (žyma `v15`). Tolesni pakeitimai atliekami atskirame V16 kataloge. V15 ir ankstesnės versijos nebekeičiamos.

Testavimas: https://albertborkovski-cmd.github.io/finansu-harmonija-v15/

GitHub: https://github.com/albertborkovski-cmd/finansu-harmonija-v15

## Paleidimas

```bash
npm ci
npm run dev
```

Vietinis V15 adresas: http://127.0.0.1:5196/

V13 testavimo nuoroda: https://albertborkovski-cmd.github.io/finansu-harmonija-v13/

V14 ir ankstesnės versijos lieka nekintamos. V15 neturi jų GitHub nuotolinių saugyklų. V16 kuriama iš šios užfiksuotos V15 kopijos ir nenaudoja V15 nuotolinės saugyklos.

Tai demonstracinis prototipas su demonstraciniu prisijungimu, ne produkcinė sistema. Nenaudokite tikrų slaptažodžių ar konfidencialių dokumentų. GitHub Pages versijoje duomenys saugomi naršyklėje, nėra bendro serverio ar saugaus naudotojų autentifikavimo. To paties GitHub Pages domeno versijos gali naudoti bendrus naršyklės duomenis; izoliuotam testavimui naudokite atskirą naršyklės profilį. Vietinis `.meso-shared-data.json` ir `.env` nėra publikuojami.

GitHub Pages skirtas pagrindinei programos sąsajai testuoti. Atskiros viešos skolų suderinimo ir onboarding nuorodos, kurioms reikalingi serverio maršrutai, šiame statiniame prototipe nėra pilnai palaikomos.
