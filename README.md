# Finansų harmonija V16

Aktyvi V16 versija, sukurta iš užfiksuotos V15 (`0f2280d63a4c95c40e319905d4128ec5605dd903`, žyma `v15`). Tolesni pakeitimai atliekami tik šiame V16 kataloge. V15 ir ankstesnės versijos nebekeičiamos.

Nekintamos V15 testavimas: https://albertborkovski-cmd.github.io/finansu-harmonija-v15/

V15 GitHub: https://github.com/albertborkovski-cmd/finansu-harmonija-v15

## Paleidimas

```bash
npm ci
npm run dev
```

Vietinis V16 adresas: http://127.0.0.1:5197/

V13 testavimo nuoroda: https://albertborkovski-cmd.github.io/finansu-harmonija-v13/

V16 turi atskirą Git saugyklą be V15 ar ankstesnių versijų nuotolinių adresų. Vietiniai testavimo duomenys nukopijuoti iš V15, bet lieka nepublikuojamame `.meso-shared-data.json` faile.

Tai demonstracinis prototipas su demonstraciniu prisijungimu, ne produkcinė sistema. Nenaudokite tikrų slaptažodžių ar konfidencialių dokumentų. GitHub Pages versijoje duomenys saugomi naršyklėje, nėra bendro serverio ar saugaus naudotojų autentifikavimo. To paties GitHub Pages domeno versijos gali naudoti bendrus naršyklės duomenis; izoliuotam testavimui naudokite atskirą naršyklės profilį. Vietinis `.meso-shared-data.json` ir `.env` nėra publikuojami.

GitHub Pages skirtas pagrindinei programos sąsajai testuoti. Atskiros viešos skolų suderinimo ir onboarding nuorodos, kurioms reikalingi serverio maršrutai, šiame statiniame prototipe nėra pilnai palaikomos.
