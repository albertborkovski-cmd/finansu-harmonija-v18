# Finansų harmonija V18

Aktyvi V18 versija iš užfiksuotos V17 (`33258134b61c6b780851c080f12724774a1935b7`, žyma `v17`). Tolesni pakeitimai atliekami tik V18 kataloge. V17 ir ankstesnės versijos nebekeičiamos.

Testavimas: https://albertborkovski-cmd.github.io/finansu-harmonija-v17/

Nekintamos V16 testavimas: https://albertborkovski-cmd.github.io/finansu-harmonija-v16/

V16 GitHub: https://github.com/albertborkovski-cmd/finansu-harmonija-v16

## Paleidimas

```bash
npm ci
npm run dev
```

Vietinis V18 adresas: http://127.0.0.1:5199/

V13 testavimo nuoroda: https://albertborkovski-cmd.github.io/finansu-harmonija-v13/

V17 turi atskirą Git saugyklą. Vietiniai testavimo duomenys lieka nepublikuojamame `.meso-shared-data.json` faile. GitHub Pages naudoja demonstracinius duomenis; tai nėra produkcinė apskaitos sistema.

Tai demonstracinis prototipas su demonstraciniu prisijungimu, ne produkcinė sistema. Nenaudokite tikrų slaptažodžių ar konfidencialių dokumentų. GitHub Pages versijoje duomenys saugomi naršyklėje, nėra bendro serverio ar saugaus naudotojų autentifikavimo. To paties GitHub Pages domeno versijos gali naudoti bendrus naršyklės duomenis; izoliuotam testavimui naudokite atskirą naršyklės profilį. Vietinis `.meso-shared-data.json` ir `.env` nėra publikuojami.

GitHub Pages skirtas pagrindinei programos sąsajai testuoti. Atskiros viešos skolų suderinimo ir onboarding nuorodos, kurioms reikalingi serverio maršrutai, šiame statiniame prototipe nėra pilnai palaikomos.
