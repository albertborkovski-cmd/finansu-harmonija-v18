# Finansų harmonija V17

Aktyvi V17 versija, sukurta iš užfiksuotos V16 (`1aef121a0c750afc28cf87735c808dafcbb64d21`, žyma `v16`). Tolesni pakeitimai atliekami tik šiame V17 kataloge. V16 ir ankstesnės versijos nebekeičiamos.

Nekintamos V16 testavimas: https://albertborkovski-cmd.github.io/finansu-harmonija-v16/

V16 GitHub: https://github.com/albertborkovski-cmd/finansu-harmonija-v16

## Paleidimas

```bash
npm ci
npm run dev
```

Vietinis V17 adresas: http://127.0.0.1:5198/

V13 testavimo nuoroda: https://albertborkovski-cmd.github.io/finansu-harmonija-v13/

V17 turi atskirą Git saugyklą be V16 ar ankstesnių versijų nuotolinių adresų. Vietiniai testavimo duomenys lieka nepublikuojamame `.meso-shared-data.json` faile.

Tai demonstracinis prototipas su demonstraciniu prisijungimu, ne produkcinė sistema. Nenaudokite tikrų slaptažodžių ar konfidencialių dokumentų. GitHub Pages versijoje duomenys saugomi naršyklėje, nėra bendro serverio ar saugaus naudotojų autentifikavimo. To paties GitHub Pages domeno versijos gali naudoti bendrus naršyklės duomenis; izoliuotam testavimui naudokite atskirą naršyklės profilį. Vietinis `.meso-shared-data.json` ir `.env` nėra publikuojami.

GitHub Pages skirtas pagrindinei programos sąsajai testuoti. Atskiros viešos skolų suderinimo ir onboarding nuorodos, kurioms reikalingi serverio maršrutai, šiame statiniame prototipe nėra pilnai palaikomos.
