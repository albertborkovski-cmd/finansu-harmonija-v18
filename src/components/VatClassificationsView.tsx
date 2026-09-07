import { useMemo, useRef, useState } from "react";
import {
  Check,
  FileText,
  FileUp,
  Pencil,
  X,
} from "lucide-react";
import * as XLSX from "xlsx";
import ColumnSettingsPanel, { type ColConfig } from "./ColumnSettingsPanel";
import ColumnSortButton, { useMultiColumnSort } from "./ColumnSortButton";
import { BulkDeleteButton, RowDeleteButton } from "./DeleteButtons";
import HorizontalTableScrollbar from "./HorizontalTableScrollbar";
import OcrSearchField from "./OcrSearchField";
import { PageActionButton, PageHeader } from "./PageHeader";
import { HeaderBackButton } from "./SystemNavigation";
import RefreshAllButton from "./RefreshAllButton";
import { ColumnSettingsButton } from "./ScopedActionButtons";
import TablePagination from "./TablePagination";
import SystemAddFilters from "./SystemAddFilters";
import { ResizeHandle, useColumnResize } from "./useColumnResize";
import SearchableSelect from "./SearchableSelect";

export interface VatClassification {
  id: string;
  code: string;
  incomingRegister: string;
  outgoingRegister: string;
  description: string;
  rate: string;
  examples: string;
  active: boolean;
}

const LEGACY_STORAGE_KEY = "finansu-harmonija:v7:vat-classifications";
const TEMPLATES_STORAGE_KEY =
  "finansu-harmonija:v7:vat-classification-templates";

interface VatClassificationTemplate {
  id: string;
  name: string;
  description: string;
  active: boolean;
  updatedAt: string;
  sourceRevision?: string;
  classifications: VatClassification[];
}

const LITHUANIAN_VAT_DATA_REVISION = "2025-12-16-pdf-v2";

const TEMPLATE_COLUMNS: ColConfig[] = [
  { key: "name", label: "Name", width: 300, visible: true },
  { key: "description", label: "Description", width: 390, visible: true },
  {
    key: "classifications",
    label: "Classifications",
    width: 145,
    visible: true,
  },
  { key: "updatedAt", label: "Last update", width: 140, visible: true },
  { key: "active", label: "Active", width: 115, visible: true },
];

const CLASSIFICATION_COLUMNS: ColConfig[] = [
  { key: "code", label: "Tax code", width: 120, visible: true },
  {
    key: "incomingRegister",
    label: "Incoming register",
    width: 155,
    visible: true,
  },
  {
    key: "outgoingRegister",
    label: "Outgoing register",
    width: 155,
    visible: true,
  },
  { key: "description", label: "Description", width: 360, visible: true },
  { key: "rate", label: "VAT rate (%)", width: 125, visible: true },
  { key: "examples", label: "Examples", width: 280, visible: true },
  { key: "active", label: "Active", width: 110, visible: true },
];

const VAT_ROWS: Array<[string, string, string, string, string, string]> = [
  [
    "PVM1",
    "x*",
    "x***",
    "Šalies teritorijoje patiektos prekės ir / ar suteiktos paslaugos (Lietuvos Respublikos pridėtinės vertės mokesčio įstatymo (toliau - PVMĮ) 19 str. 1 dalis)",
    "21",
    "",
  ],
  [
    "PVM2",
    "x*",
    "x",
    "Šalies teritorijoje patiektos prekės ir / ar suteiktos paslaugos (PVMĮ 19 str. 3 dalis)",
    "9",
    "Iki 2025 m. gruodžio 31 d. spausdintos ir elektroninės knygos ir elektroniniai neperiodiniai informaciniai leidiniai, keleivių vežimas, apgyvendinimas viešbučiuose, malkos ir medienos produktai, skirti buitiniams energijos vartotojams, visų rūšių meno ir kultūros įstaigų, meno ir kultūros renginių lankymo paslaugos, iki 2023 m. gruodžio 31 d. restoranų, kavinių ir panašių maitinimo įstaigų teikiamoms maitinimo paslaugoms ir išsinešti tiekiamam maistui (išskyrus alkoholinius gėrimus ir paslaugas ar paslaugos dalis, kurios susijusios su alkoholiniais gėrimais), iki 2023 m. birželio 30 d. sporto renginių, sporto klubų lankymui ir kitų asmenų, teikiančių panašias į sporto klubų teikiamas paslaugas, lankymui bei atlikėjų teikiamos atlikimo paslaugos ir kt.",
  ],
  [
    "PVM3",
    "x*",
    "x",
    "Šalies teritorijoje patiektos prekės ir / ar suteiktos paslaugos (PVMĮ 19 str. 4 dalis)",
    "5",
    "Žurnalai, laikraščiai ir kiti periodiniai leidiniai, vaistai, medicinos pagalbos priemonės, asmenų su negalia techninės pagalbos priemonės, jų remontas. Nuo 2026 m. sausio 1 d. spausdintos ir elektroninės knygos ir elektroniniai neperiodiniai informaciniai leidiniai",
  ],
  [
    "PVM25",
    "x",
    "x",
    "Atvejai, kai pirkėjas išskaito ir sumoka PVM už jam tiekiamas prekes ar teikiamas paslaugas (PVMĮ 96 straipsnis)",
    "21",
    "Statybos darbai, turtinis įnašas, pastato esminio pagerinimo perdavimas, iki 2021-12-31 patiekta mediena ir bankrutuojančio (bankrutavusio) asmens patiektos prekės bei suteiktos paslaugos, iki 2022-02-28 patiekti standieji diskai, iki 2026-12-31 patiekti telefonai, planšetės ir nešiojamieji kompiuteriai, asmenų su negalia technikos pagalbos priemonių montavimas (atvejais, kai montavimas atliekamas be įrangos tiekimo)",
  ],
  [
    "PVM26",
    "x",
    "x",
    "Atvejai, kai pirkėjas išskaito ir sumoka PVM už jam tiekiamas prekes ar teikiamas paslaugas (PVMĮ 96 straipsnis)",
    "9",
    "Iki 2021-12-31 bankrutuojančio (bankrutavusio) asmens patiektos prekės, suteiktos paslaugos",
  ],
  [
    "PVM27",
    "x",
    "x",
    "Atvejai, kai pirkėjas išskaito ir sumoka PVM už jam tiekiamas prekes ar teikiamas paslaugas (PVMĮ 96 straipsnis)",
    "5",
    "Iki 2021-12-31 bankrutuojančio (bankrutavusio) asmens patiektos prekės, suteiktos paslaugos",
  ],
  [
    "PVM5",
    "x*",
    "x",
    "Atvejai, kai prekių tiekimas ir paslaugų teikimas neapmokestinamas PVM (PVMĮ 20–33 ir 112 straipsniai)",
    "-",
    "Sveikatos priežiūros, socialinės, švietimo ir mokymo, kultūros ir sporto, pašto, draudimo, finansinės ir kitos PVM neapmokestinamos paslaugos, prekės. Investicinis auksas ir susijusios paslaugos",
  ],
  [
    "PVM6",
    "-",
    "x",
    "Atvejai, kai prekės (paslaugos) yra suvartotos PVM mokėtojo privatiems poreikiams tenkinti (PVMĮ 5 ir 8 straipsniai)",
    "21",
    "",
  ],
  [
    "PVM7",
    "-",
    "x",
    "Atvejai, kai prekės (paslaugos) yra suvartotos PVM mokėtojo privatiems poreikiams tenkinti (PVMĮ 5 ir 8 straipsniai)",
    "9",
    "Iki 2025 m. gruodžio 31 d. knygos, keleivių vežimas, apgyvendinimas viešbučiuose, ir kt.",
  ],
  [
    "PVM8",
    "-",
    "x",
    "Atvejai, kai prekės (paslaugos) yra suvartotos PVM mokėtojo privatiems poreikiams tenkinti (PVMĮ 5 ir 8 straipsniai)",
    "5",
    "Žurnalai, laikraščiai ir kiti periodiniai leidiniai, vaistai, medicinos pagalbos priemonės, asmenų su negalia techninės pagalbos priemonės. Nuo 2026 m. sausio 1 d. spausdintos ir elektroninės knygos ir elektroniniai neperiodiniai informaciniai leidiniai",
  ],
  [
    "PVM28",
    "-",
    "x",
    "Atvejai, kai prekės (paslaugos) yra suvartotos PVM mokėtojo privatiems poreikiams tenkinti (PVMĮ 5 ir 8 straipsniai)",
    "0",
    "Keleivių ir jų bagažo vežimas tarptautiniu maršrutu, eksportuojamų, importuojamų, tranzitu gabenamų prekių vežimas, papildomos vežimo paslaugos ir kt.",
  ],
  [
    "PVM29",
    "-",
    "x",
    "Atvejai, kai prekės (paslaugos) yra suvartotos PVM mokėtojo privatiems poreikiams tenkinti (PVMĮ 5 ir 8 straipsniai)",
    "-",
    "Paslaugų suteikimo vieta – ne šalies teritorija ir kt.",
  ],
  [
    "PVM9",
    "-",
    "x",
    "PVM mokėtojo ilgalaikio materialiojo turto pasigaminimas ir nuosavybės teise priklausančio ar nepriklausančio pastato (statinio) esminis pagerinimas (PVMĮ 6 straipsnis)",
    "21",
    "Staklės, įrenginiai, pastatai (statiniai), kaip ilgalaikis turtas ir kt.",
  ],
  [
    "PVM30",
    "-",
    "x",
    "PVM mokėtojo ilgalaikio materialiojo turto pasigaminimas ir nuosavybės teise priklausančio ar nepriklausančio pastato (statinio) esminis pagerinimas (PVMĮ 6 straipsnis)",
    "9",
    "Iki 2025 m. gruodžio 31 d. knyga kaip ilgalaikis turtas",
  ],
  [
    "PVM31",
    "-",
    "x",
    "PVM mokėtojo ilgalaikio materialiojo turto pasigaminimas ir nuosavybės teise priklausančio ar nepriklausančio pastato (statinio) esminis pagerinimas (PVMĮ 6 straipsnis)",
    "5",
    "Asmenų su negalia techninės pagalbos priemonė kaip ilgalaikis turtas",
  ],
  [
    "PVM32",
    "x*",
    "x",
    "Atvejai, kai sandoriams taikoma speciali apmokestinimo schema (marža) (PVMĮ II, III skirsniai)",
    "21",
    "Turizmo paslaugos ES, naudotos prekės, meno kūriniai, kolekciniai ir antikvariniai daiktai",
  ],
  [
    "PVM33",
    "x*",
    "x",
    "Atvejai, kai sandoriams taikoma speciali apmokestinimo schema (marža) (PVMĮ II, III skirsniai)",
    "0",
    "Turizmo paslaugos už ES teritorijos ribų, naudotos prekės, meno kūriniai, kolekciniai ir antikvariniai daiktai, tiekiami PVM įstatymo 41- 44 straipsniuose nurodytomis sąlygomis",
  ],
  [
    "PVM12",
    "-",
    "x",
    "Prekių eksportas (PVMĮ 41 straipsnis)",
    "0",
    "Patiektos ir išgabentos iš ES teritorijos prekės",
  ],
  [
    "PVM13",
    "-",
    "x",
    "ES PVM mokėtojams patiektos prekės (PVMĮ 49 straipsnio 1, 2, 4 dalys), išskyrus tiekimus, deklaruojamus PVM50 mokesčio kodu",
    "0",
    "Patiektos ir į kitą valstybę narę išgabentos prekės. Pateikiama FR0564 forma",
  ],
  [
    "PVM14",
    "x*",
    "x",
    "Kiti sandoriai (PVMĮ 42, 43, 44, 45, 46, 47, 48 straipsniai, 49 straipsnio 2 (išskyrus ES PVM mokėtojams tiekiamas naujas transporto priemones) ir 3 dalys, 51, 52 straipsniai, 53 straipsnio 1, 5, 6, 10 dalys)",
    "0",
    "Keleivių išgabentos prekės, laivai ir orlaiviai, laivų ir orlaivių atsargos, vežimo paslaugos, naujų transporto priemonių tiekimas asmeniui neregistruotam PVM mokėtoju į kitą valstybę narę, akcizinių prekių tiekimas apmokestinamajam asmeniui arba juridiniam asmeniui, kuris nėra PVM mokėtojas, muitinės prižiūrimų prekių tiekimas ir kt.",
  ],
  [
    "PVM15",
    "-",
    "x",
    "Už Lietuvos ribų patiektos prekės ir/ar suteiktos paslaugos (atvejai, kai PVM neskaičiuojamas, nes prekių tiekimas ir / ar paslaugų teikimas laikomas įvykusiu už Lietuvos ribų ir yra ne PVM objektas Lietuvoje, bet PVM atskaita galima pagal PVMĮ 58 str. 1 dalies 2 punkto nuostatas)",
    "-",
    "PVM apmokestinamos paslaugos. Finansinės bei draudimo paslaugos, suteiktos už ES teritorijos ribų. PVM apmokestinami prekių tiekimo sandoriai",
  ],
  [
    "PVM34",
    "-",
    "x",
    "Už Lietuvos ribų patiektos prekės ir/ar suteiktos paslaugos (atvejai, kai PVM neskaičiuojamas, nes prekių tiekimas ir / ar paslaugų teikimas laikomas įvykusiu už Lietuvos ribų ir yra ne PVM objektas Lietuvoje, o PVM atskaita atsižvelgiant į PVMĮ 58 str. nuostatas negalima)",
    "-",
    "PVM neapmokestinamos prekės, paslaugos (finansinės bei draudimo ES, kultūros ir kt.)",
  ],
  [
    "PVM16",
    "x",
    "-",
    "Atvejai, kai iš kitų valstybių narių prekių įsigijimas laikomas įvykusiu šalies teritorijoje (PVMĮ 41 ir 122 straipsniai)",
    "21",
    "Prekių įsigijimai iš kitos valstybės narės, įskaitant rezervo taisyklę ir atvejus, kai prekės neatgabenamos į Lietuvą, bet pardavėjui nurodomas LT PVM mokėtojo kodas",
  ],
  [
    "PVM17",
    "x",
    "-",
    "Atvejai, kai iš kitų valstybių narių prekių įsigijimas laikomas įvykusiu šalies teritorijoje (PVMĮ 41 ir 122 straipsniai)",
    "9",
    "Iki 2025 m. gruodžio 31d. knygos ir kiti neperiodiniai informaciniai leidiniai",
  ],
  [
    "PVM18",
    "x",
    "-",
    "Atvejai, kai iš kitų valstybių narių prekių įsigijimas laikomas įvykusiu šalies teritorijoje (PVMĮ 41 ir 122 straipsniai)",
    "5",
    "Žurnalai laikraščiai ir kiti periodiniai leidiniai, vaistai, medicinos pagalbos priemonės, asmenų su negalia pagalbos priemonės. . Nuo 2026 m. sausio 1 d. spausdintos knygos ir spausdinti neperiodiniai informaciniai leidiniai",
  ],
  [
    "PVM35",
    "x**",
    "-",
    "Atvejai, kai iš kitų valstybių narių prekių įsigijimas laikomas įvykusiu šalies teritorijoje (PVMĮ 41 ir 122 straipsniai)",
    "0",
    "Prekės, kurias tiekiant Lietuvoje, jos būtų apmokestinamos taikant 0 proc. PVM tarifą (laivai, lėktuvai, laivų lėktuvų atsargos, naudotos prekės, meno kūriniai, kolekciniai ir antikvariniai daiktai, apmokestinami taikant maržos schemą ir kt.), o įsigijimas iš kitos valstybės narės PVM neapmokestinamas",
  ],
  [
    "PVM36",
    "x**",
    "-",
    "Atvejai, kai iš kitų valstybių narių prekių įsigijimas laikomas įvykusiu šalies teritorijoje (PVMĮ 41 ir 122 straipsniai)",
    "-",
    "PVM neapmokestinamų prekių įsigijimo sandoriai: žmogaus organai, kraujas, motinos pienas, dantų protezai, investicinis auksas, Iki 2022 m. gruodžio 31 d.vakcinos nuo COVID-19 ligos, in vitro diagnostikos medicinos priemonės skirtos COVID-19 ligai diagnozuoti ir kt.",
  ],
  [
    "PVM19",
    "x**",
    "x",
    "Atvejai, kai Lietuvos Respublikos PVM mokėtojo, trikampėje prekyboje esančio tarpininkaujančia šalimi (antrasis asmuo), iš vienos valstybės narės PVM mokėtojo įsigytos prekės iš karto buvo nugabentos į kitą valstybę narę, kurioje patiektos tos kitos valstybės narės PVM mokėtojui (PVMĮ 122 straipsnio 3 dalis)",
    "-",
    "Trikampėje prekyboje tarpininkaujančio asmens (antrojo asmens) prekių įsigijimo ir pardavimo sandoriai",
  ],
  [
    "PVM20",
    "x",
    "-",
    "Iš užsienio valstybių (išskyrus iš ES PVM mokėtojų) įsigytos paslaugos, kurių pardavimo PVM apskaičiuoja pirkėjas (PVMĮ 95 str. 2 dalis)",
    "21",
    "Paslaugos iš trečiųjų valstybių, kurių teikimo vieta pagal PVM įstatymo 13 str. 2 d. 1 p. – šalies teritorija",
  ],
  [
    "PVM37",
    "x",
    "-",
    "Iš užsienio valstybių (išskyrus iš ES PVM mokėtojų) įsigytos paslaugos, kurių pardavimo PVM apskaičiuoja pirkėjas (PVMĮ 95 str. 2 dalis)",
    "5",
    "Asmenų su negalia pagalbos priemonių remontas. Nuo 2026 m. sausio 1 d. elektroninės knygos ir elektroniniai neperiodiniai informaciniai leidiniai",
  ],
  [
    "PVM38",
    "x**",
    "-",
    "Iš užsienio valstybių (išskyrus iš ES PVM mokėtojų) įsigytos paslaugos, kurių pardavimo PVM pirkėjas neskaičiuoja (PVMĮ 95 str. 1 dalies 3 punktas)",
    "0",
    "Eksportuojamų, importuojamų, tranzitu gabenamų prekių vežimas, papildomos vežimo paslaugos ir kt.",
  ],
  [
    "PVM39",
    "x**",
    "-",
    "Iš užsienio valstybių (išskyrus iš ES PVM mokėtojų) įsigytos paslaugos, kurių pardavimo PVM pirkėjas neapskaičiuoja (PVMĮ 95 str. 1 dalies 2 punktas)",
    "-",
    "Įsigytos PVM neapmokestinamos paslaugos (finansinės, draudimo ir kt..), kurių vieta – šalies teritorija",
  ],
  [
    "PVM21",
    "x",
    "-",
    "Iš ES PVM mokėtojų įsigytos paslaugos, kurių pardavimo PVM apskaičiuoja pirkėjas (PVMĮ 95 str. 2 dalis)",
    "21",
    "Paslaugos, kurių teikimo vieta pagal PVM įstatymo 13 str. 2 d. 1 p. – šalies teritorija",
  ],
  [
    "PVM40",
    "x",
    "-",
    "Iš ES PVM mokėtojų įsigytos paslaugos, kurių pardavimo PVM apskaičiuoja pirkėjas (PVMĮ 95 str. 2 dalis)",
    "5",
    "Asmenų su negalia pagalbos priemonių remontas. Nuo 2026 m. sausio 1 d. elektroninės knygos ir elektroniniai neperiodiniai informaciniai leidiniai",
  ],
  [
    "PVM41",
    "x**",
    "-",
    "Iš ES PVM mokėtojų įsigytos paslaugos, kurių pardavimo PVM pirkėjas neapskaičiuoja (PVMĮ 95 str. 1 dalies 3 punktas)",
    "0",
    "Eksportuojamų, importuojamų, tranzitu gabenamų prekių vežimas, papildomos vežimo paslaugos ir kt.",
  ],
  [
    "PVM42",
    "x**",
    "-",
    "Iš ES PVM mokėtojų įsigytos paslaugos, kurių pardavimo PVM pirkėjas neapskaičiuoja (PVMĮ 95 str. 1 dalies 2 punktas)",
    "-",
    "Įsigytos PVM neapmokestinamos paslaugos (finansinės, draudimo ir kt..), kurių vieta – šalies teritorija",
  ],
  [
    "PVM43",
    "x",
    "-",
    "Atvejai, kai už šalies teritorijoje neįsikūrusio užsienio apmokestinamojo asmens šalies teritorijoje tiekiamas prekes ir / ar teikiamas paslaugas PVM apskaičiuoja ir sumoka pirkėjas (PVMĮ 95 str. 3, 4 ir 5 dalys)",
    "21",
    "Dujos, elektros energija, Lietuvoje surenkamos ar instaliuojamos prekės, trikampės prekybos atveju trečiojo asmens įsigyjamos prekės ir kt.",
  ],
  [
    "PVM44",
    "x",
    "-",
    "Atvejai, kai už šalies teritorijoje neįsikūrusio užsienio apmokestinamojo asmens šalies teritorijoje tiekiamas prekes ir / ar teikiamas paslaugas PVM apskaičiuoja ir sumoka pirkėjas (PVMĮ 95 str. 3, 4 ir 5 dalys)",
    "9",
    "Iki 2025 m. gruodžio 31 d. knygos ir kiti neperiodiniai informaciniai leidiniai ir kt.",
  ],
  [
    "PVM45",
    "x",
    "-",
    "Atvejai, kai už šalies teritorijoje neįsikūrusio užsienio apmokestinamojo asmens šalies teritorijoje tiekiamas prekes ir / ar teikiamas paslaugas PVM apskaičiuoja ir sumoka pirkėjas (PVMĮ 95 str. 3, 4 ir 5 dalys)",
    "5",
    "Žurnalai, laikraščiai ir kiti periodiniai leidiniai, vaistai, medicinos pagalbos priemonės, asmenų su negalia techninės pagalbos priemonės, jų remontas. Nuo 2026 m. sausio 1 d. spausdintos ir elektroninės knygos ir elektroniniai neperiodiniai informaciniai leidiniai",
  ],
  [
    "PVM46",
    "x**",
    "-",
    "Atvejai, kai už šalies teritorijoje neįsikūrusio užsienio apmokestinamojo asmens šalies teritorijoje tiekiamas prekes ir / ar teikiamas kitas paslaugas PVM pirkėjas neapskaičiuoja (PVMĮ 95 str. 3, 4 ir 5 dalys)",
    "0",
    "Tiekiamos prekės (teikiamos paslaugos), apmokestinamos taikant 0 procentų PVM tarifą",
  ],
  [
    "PVM47",
    "x**",
    "-",
    "Atvejai, kai už šalies teritorijoje neįsikūrusio užsienio apmokestinamojo asmens šalies teritorijoje tiekiamas prekes ir / ar teikiamas kitas paslaugas PVM apskaičiuoja ir sumoka pirkėjas (PVMĮ 95 str. 3, 4 ir 5 dalys)",
    "-",
    "Tiekiamos prekės (teikiamos paslaugos) PVM neapmokestinamos",
  ],
  [
    "PVM23",
    "-",
    "-",
    "Sumokėtas importo PVM",
    "21,9,5",
    "PVM deklaracijose šio duomens nėra - i.SAF nepildoma",
  ],
  [
    "PVM24",
    "-",
    "-",
    "Importo PVM, kurio įskaitymą kontroliuoja VMI",
    "21,9, 5",
    "PVM deklaracijose šio duomens nėra - i.SAF nepildoma",
  ],
  [
    "PVM48",
    "x**",
    "-",
    "Už Lietuvos ribų įsigytos prekės ir/ar paslaugos (įskaitant atvejus, kai apskaičiuotas užsienio šalies PVM ir atvejus, kai prekės importuojamos vidaus vartojimui) (atvejai, kai prekių ir/ar paslaugų įsigijimas laikomas įvykusiu už Lietuvos ribų ir pardavimo PVM Lietuvoje neskaičiuojamas, nes įsigijimas - ne PVM objektas Lietuvoje)",
    "-",
    "Apgyvendinimo paslaugos užsienyje esančiuose viešbučiuose, užsienio valstybėje įsigytos (ir parduotos) prekės, kai tai nėra prekių įsigijimas Lietuvoje iš kitos valstybės narės, trečiojoje valstybėje įsigytos prekės, kurios importuojamos vidaus vartojimui ir kt.",
  ],
  [
    "PVM49",
    "x",
    "-",
    "Atvejai, kai žemės ūkio produkcija ir paslaugos įsigytos iš ūkininkų, kuriems taikoma kompensacinio PVM tarifo schema",
    "6",
    "Ūkininkai, kuriems taikoma kompensacinio PVM tarifo schema: http://www.vmi.lt/cms/ukininkai- kuriems-taikoma-kompensacinio- pvm-tarifo-schema1",
  ],
  [
    "PVM100",
    "x",
    "x",
    "Kiti atvejai",
    "",
    "Kiti aukščiau nenurodyti atvejai, kurie išskiriami savo apskaitoje, pvz.: asmens, kaip kitos valstybės PVM mokėtojo, išrašytos PVM sąskaitos faktūros; iš PVM mokėtojo, taikančio smulkiojo verslo schemą (SVS) Lietuvoje, gautos PVM sąskaitos faktūros; PVM mokėtojo, taikančio SVS Lietuvoje, per I.APS išrašytos e. sąskaitos; baudos; delspinigiai; rinkliavos ir kt.",
  ],
  [
    "PVM50",
    "-",
    "x",
    "ES PVM mokėtojams patiektos prekės, kurios buvo pristatytos tiekti pagal pareikalavimą, PVM įstatymo 42 straipsnyje nurodytomis sąlygomis (PVMĮ 49 straipsnio 1, 4 dalys)",
    "0",
    "Prekių pristatymas, kad jos būtų patiektos pagal pareikalavimą (angl. call-of stock)",
  ],
  [
    "PVM51",
    "x",
    "x",
    "Sandoriai, apmokestinami taikant PVMĮ 19 straipsnio 5 dalies 2 ir 3 punktus (visi atvejai, įskaitant, pvz., PVMĮ 5 straipsnį)",
    "0",
    "Iki 2022 m. gruodžio 31 d. vakcinoms nuo COVID-19 ligos (koronaviruso infekcijos) ir in vitro diagnostikos medicinos priemonėms, skirtoms COVID-19 ligos (koronaviruso infekcijos) diagnostikai",
  ],
  [
    "PVM52",
    "x*",
    "x",
    "Atvejai, kai sandoriams taikoma speciali apmokestinimo schema (marža) (PVMĮ II, III skirsniai)",
    "9",
    "Iki 2025 m. gruodžio 31 d. naudotos prekės, meno kūriniai, kolekciniai ir antikvariniai daiktai, pvz. naudotos knygos",
  ],
  [
    "PVM53",
    "x*",
    "x",
    "Atvejai, kai sandoriams taikoma speciali apmokestinimo schema (marža) (PVMĮ II, III skirsniai)",
    "5",
    "Naudotos prekės, meno kūriniai, kolekciniai ir antikvariniai daiktai, pvz. asmenų su negalia techninės pagalbos priemonės",
  ],
  [
    "PVM54",
    "x",
    "-",
    "Iš užsienio valstybių (išskyrus iš ES PVM mokėtojų) įsigytos paslaugos, kurių pardavimo PVM apskaičiuoja pirkėjas (PVMĮ 95 str. 2 dalis)",
    "9",
    "Iki 2025 m. gruodžio 31 d. elektroninės knygos, elektroniniai neperiodiniai informaciniai leidiniai, iki 2023 m. birželio 30 d. atlikėjų teikiamoms paslaugoms",
  ],
  [
    "PVM55",
    "x*",
    "x",
    "PVMĮ 501 straipsnio 1 ir 4 dalyse nurodyti sandoriai",
    "0",
    "Paramos gavėjams, kaip jie suprantami pagal Lietuvos Respublikos labdaros ir paramos įstatymo nuostatas ir (arba) kitiems nelaimių padarinius šalinantiems asmenims tiekiamos prekės ir (arba) teikiamos paslaugos, kurios susijusios su šiomis ar su šių asmenų iš kitų ES valstybių narių įsigyjamomis prekėmis, skirtoms neatlygintinai pagalbai nelaimių aukoms, nurodytoms Europos Komisijos sprendime Lietuvos Respublikai, teikti",
  ],
  [
    "PVM56",
    "x**",
    "-",
    "PVMĮ 501 straipsnio 2 dalyje nurodyti sandoriai",
    "-",
    "Paramos gavėjo, kaip jis suprantamas pagal Lietuvos Respublikos labdaros ir paramos įstatymo nuostatas ir (arba) kito nelaimių padarinius šalinančio asmens įsigyjamos prekės iš kitos ES valstybės narės, kurios skirtos neatlygintinai pagalbai nelaimių aukoms, nurodytoms Europos Komisijos sprendime Lietuvos Respublikai, teikti",
  ],
  [
    "PVM57",
    "x",
    "-",
    "Iš ES PVM mokėtojų įsigytos paslaugos, kurių pardavimo PVM apskaičiuoja pirkėjas (PVMĮ 95 str. 2 dalis)",
    "9",
    "Iki 2025 m. gruodžio 31 d. elektroninės knygos, elektroniniai neperiodiniai informaciniai leidiniai, iki 2023 m. birželio 30 d. atlikėjų teikiamoms paslaugoms",
  ],
  [
    "PVM58",
    "x*",
    "x",
    "Šalies teritorijoje suteiktos paslaugos (PVMĮ 19 straipsnio 3 dalis)",
    "12",
    "Nuo 2026 m. sausio 1 d. apgyvendinimo paslaugos; Keleivių ir bagažo vežimas reguliariais maršrutais; Meno ir kultūros įstaigų bei renginių lankymas (kai netaikomas PVMĮ 23 straipsnis)",
  ],
  [
    "PVM59",
    "-",
    "x",
    "Atvejai, kai paslaugos yra suvartotos PVM mokėtojo privatiems poreikiams tenkinti (PVMĮ 8 straipsnis)",
    "12",
    "Nuo 2026 m. sausio 1 d. apgyvendinimo paslaugos; Keleivių ir bagažo vežimo reguliariais maršrutais; Meno ir kultūros įstaigų bei renginių lankymas (kai netaikomas PVMĮ 23 straipsnis)",
  ],
  [
    "PVM60",
    "x",
    "-",
    "Atvejai, kai už šalies teritorijoje neįsikūrusio užsienio apmokestinamojo asmens šalies teritorijoje teikiamas paslaugas PVM apskaičiuoja ir sumoka pirkėjas (PVMĮ 95 straipsnio 5 dalis)",
    "12",
    "Nuo 2026 m. sausio 1 d. apgyvendinimo paslaugos; Keleivių ir bagažo vežimas reguliariais maršrutais; Meno ir kultūros įstaigų bei renginių lankymas (kai netaikomas PVMĮ 23 straipsnis)",
  ],
];
const DEFAULT_CLASSIFICATIONS: VatClassification[] = VAT_ROWS.map(
  (
    [code, incomingRegister, outgoingRegister, description, rate, examples],
    index,
  ) => ({
    id: `vat-${index + 1}`,
    code,
    incomingRegister,
    outgoingRegister,
    description,
    rate,
    examples,
    active: true,
  }),
);

const DEFAULT_TEMPLATE: VatClassificationTemplate = {
  id: "vat-template-lt-2025-12-16",
  name: "Lithuanian VAT classifications 2025-12-16",
  description:
    "57 VAT classifications imported from PVM klasifikatorius 2025-12-16.",
  active: true,
  updatedAt: "2025-12-16",
  sourceRevision: LITHUANIAN_VAT_DATA_REVISION,
  classifications: DEFAULT_CLASSIFICATIONS,
};

function loadVatClassificationTemplates(): VatClassificationTemplate[] {
  if (typeof window === "undefined") return [DEFAULT_TEMPLATE];
  try {
    const storedValue = window.localStorage.getItem(TEMPLATES_STORAGE_KEY);
    if (storedValue !== null) {
      const storedTemplates = JSON.parse(
        storedValue,
      ) as VatClassificationTemplate[];
      let migrated = false;
      let hasLithuanianTemplate = false;
      const templates = storedTemplates.map((template) => {
        const isLithuanianDefault =
          template.id === DEFAULT_TEMPLATE.id ||
          template.name
            .trim()
            .toLocaleLowerCase()
            .startsWith("lithuanian vat classifications");
        if (isLithuanianDefault) hasLithuanianTemplate = true;
        if (
          !isLithuanianDefault ||
          template.sourceRevision === LITHUANIAN_VAT_DATA_REVISION
        ) {
          return template;
        }

        migrated = true;
        return {
          ...template,
          id: DEFAULT_TEMPLATE.id,
          name: DEFAULT_TEMPLATE.name,
          description: DEFAULT_TEMPLATE.description,
          sourceRevision: LITHUANIAN_VAT_DATA_REVISION,
          updatedAt: DEFAULT_TEMPLATE.updatedAt,
          classifications: DEFAULT_CLASSIFICATIONS,
        };
      });

      if (!hasLithuanianTemplate) {
        templates.unshift(DEFAULT_TEMPLATE);
        migrated = true;
      }

      if (migrated) {
        window.localStorage.setItem(
          TEMPLATES_STORAGE_KEY,
          JSON.stringify(templates),
        );
      }
      return templates;
    }

    const legacyRows = JSON.parse(
      window.localStorage.getItem(LEGACY_STORAGE_KEY) ?? "[]",
    ) as VatClassification[];
    return [
      {
        ...DEFAULT_TEMPLATE,
        classifications:
          legacyRows.length > 0 ? legacyRows : DEFAULT_CLASSIFICATIONS,
      },
    ];
  } catch {
    return [DEFAULT_TEMPLATE];
  }
}

export function loadVatClassificationTemplateNames() {
  return loadVatClassificationTemplates()
    .filter((template) => template.active)
    .map((template) => template.name);
}

export function loadVatClassifications() {
  const templates = loadVatClassificationTemplates();
  return (
    templates.find((template) => template.active)?.classifications ??
    templates[0]?.classifications ??
    DEFAULT_CLASSIFICATIONS
  );
}

const emptyClassification = (): VatClassification => ({
  id: `vat-${Date.now()}`,
  code: "",
  incomingRegister: "-",
  outgoingRegister: "-",
  description: "",
  rate: "",
  examples: "",
  active: true,
});

function normalizeImportHeader(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function importedValue(
  row: Record<string, unknown>,
  aliases: string[],
  fallback = "",
) {
  const normalizedAliases = new Set(aliases.map(normalizeImportHeader));
  const entry = Object.entries(row).find(([key]) =>
    normalizedAliases.has(normalizeImportHeader(key)),
  );
  return entry ? String(entry[1] ?? "").trim() : fallback;
}

function importedActive(value: string) {
  if (!value) return true;
  return !["false", "no", "0", "inactive", "ne", "neaktyvus"].includes(
    value.trim().toLocaleLowerCase(),
  );
}

function mapImportedClassification(
  row: Record<string, unknown>,
  index: number,
): VatClassification | null {
  const code = importedValue(row, [
    "code",
    "tax code",
    "vat code",
    "pvm kodas",
    "pvm klasifikatorius",
  ]).toUpperCase();
  if (!code) return null;

  return {
    id: `vat-import-${Date.now()}-${index}`,
    code,
    incomingRegister: importedValue(
      row,
      [
        "incoming register",
        "incoming",
        "gaunamu saskaitu registras",
        "gaunamu registras",
      ],
      "-",
    ),
    outgoingRegister: importedValue(
      row,
      [
        "outgoing register",
        "outgoing",
        "israsomu saskaitu registras",
        "israsomu registras",
      ],
      "-",
    ),
    description: importedValue(row, [
      "description",
      "name",
      "pavadinimas",
      "aprasymas",
    ]),
    rate: importedValue(row, [
      "vat rate",
      "vat rate %",
      "rate",
      "pvm tarifas",
      "tarifas",
    ]),
    examples: importedValue(row, ["examples", "example", "pavyzdziai"]),
    active: importedActive(importedValue(row, ["active", "status", "aktyvus"])),
  };
}

async function readImportedClassifications(file: File) {
  const extension = file.name.split(".").pop()?.toLocaleLowerCase();
  let sourceRows: Record<string, unknown>[] = [];

  if (extension === "json") {
    const parsed = JSON.parse(await file.text()) as
      | Record<string, unknown>[]
      | { classifications?: Record<string, unknown>[] };
    sourceRows = Array.isArray(parsed)
      ? parsed
      : (parsed.classifications ?? []);
  } else {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!firstSheet) return [];
    sourceRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
      defval: "",
      raw: false,
    });
  }

  return sourceRows
    .map(mapImportedClassification)
    .filter((row): row is VatClassification => row !== null);
}

export default function VatClassificationsView() {
  const [templates, setTemplates] = useState<VatClassificationTemplate[]>(
    loadVatClassificationTemplates,
  );
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null,
  );
  const [search, setSearch] = useState("");
  const [templateFilterKeys, setTemplateFilterKeys] = useState<string[]>([]);
  const [templateFilterValues, setTemplateFilterValues] = useState<
    Record<string, string[]>
  >({});
  const [classificationFilterKeys, setClassificationFilterKeys] = useState<
    string[]
  >([]);
  const [classificationFilterValues, setClassificationFilterValues] = useState<
    Record<string, string[]>
  >({});
  const [draft, setDraft] = useState<VatClassification | null>(null);
  const [templateDraft, setTemplateDraft] =
    useState<VatClassificationTemplate | null>(null);
  const [selectedTemplates, setSelectedTemplates] = useState<Set<string>>(
    new Set(),
  );
  const [showTemplateColumns, setShowTemplateColumns] = useState(false);
  const [showClassificationColumns, setShowClassificationColumns] =
    useState(false);
  const [selectedClassifications, setSelectedClassifications] = useState<
    Set<string>
  >(new Set());
  const [importMessage, setImportMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [templateColumns, setTemplateColumns] =
    useState<ColConfig[]>(TEMPLATE_COLUMNS);
  const [classificationColumns, setClassificationColumns] = useState<
    ColConfig[]
  >(CLASSIFICATION_COLUMNS);
  const templateTableScrollRef = useRef<HTMLDivElement>(null);
  const classificationTableScrollRef = useRef<HTMLDivElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const { startResize: startTemplateResize } = useColumnResize(
    templateColumns,
    setTemplateColumns,
  );
  const { startResize: startClassificationResize } = useColumnResize(
    classificationColumns,
    setClassificationColumns,
  );
  const templateSorter = useMultiColumnSort(templates, (template, key) => {
    if (key === "classifications") return template.classifications.length;
    if (key === "active") return template.active ? 1 : 0;
    return template[key as "name" | "description" | "updatedAt"];
  });

  const selectedTemplate = templates.find(
    (template) => template.id === selectedTemplateId,
  );
  const rows = useMemo(
    () => selectedTemplate?.classifications ?? [],
    [selectedTemplate],
  );
  const classificationSorter = useMultiColumnSort(rows, (row, key) =>
    key === "active"
      ? row.active
        ? 1
        : 0
      : row[key as Exclude<keyof VatClassification, "id" | "active">],
  );

  const templateValue = (template: VatClassificationTemplate, key: string) => {
    if (key === "classifications")
      return String(template.classifications.length);
    if (key === "active") return template.active ? "Active" : "Inactive";
    return String(template[key as "name" | "description" | "updatedAt"] ?? "");
  };
  const classificationValue = (row: VatClassification, key: string) =>
    key === "active"
      ? row.active
        ? "Active"
        : "Inactive"
      : String(
          row[key as Exclude<keyof VatClassification, "id" | "active">] ?? "",
        );

  const templateFilterColumns = useMemo(
    () =>
      TEMPLATE_COLUMNS.map((column) => ({
        key: column.key,
        label: column.label,
        options: Array.from(
          new Set(
            templates.map((template) => templateValue(template, column.key)),
          ),
        )
          .filter(Boolean)
          .sort((left, right) => left.localeCompare(right)),
      })),
    [templates],
  );
  const classificationFilterColumns = useMemo(
    () =>
      CLASSIFICATION_COLUMNS.map((column) => ({
        key: column.key,
        label: column.label,
        options: Array.from(
          new Set(rows.map((row) => classificationValue(row, column.key))),
        )
          .filter(Boolean)
          .sort((left, right) => left.localeCompare(right)),
      })),
    [rows],
  );

  const persistTemplates = (next: VatClassificationTemplate[]) => {
    setTemplates(next);
    window.localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("vat-classifications-updated"));
  };

  const persistRows = (next: VatClassification[]) => {
    if (!selectedTemplate) return;
    persistTemplates(
      templates.map((template) =>
        template.id === selectedTemplate.id
          ? {
              ...template,
              classifications: next,
              updatedAt: new Date().toISOString().slice(0, 10),
            }
          : template,
      ),
    );
  };

  const visibleRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return classificationSorter.sortedRows.filter((row) => {
      const matchesSearch = [
        row.code,
        row.description,
        row.rate,
        row.examples,
        row.incomingRegister,
        row.outgoingRegister,
      ]
        .join(" ")
        .toLocaleLowerCase()
        .includes(query);
      return (
        matchesSearch &&
        classificationFilterKeys.every((key) => {
          const selected = classificationFilterValues[key] ?? [];
          return (
            selected.length === 0 ||
            selected.includes(classificationValue(row, key))
          );
        })
      );
    });
  }, [
    classificationFilterKeys,
    classificationFilterValues,
    classificationSorter.sortedRows,
    search,
  ]);

  const visibleTemplates = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return templateSorter.sortedRows.filter((template) => {
      const matchesSearch = [template.name, template.description]
        .join(" ")
        .toLocaleLowerCase()
        .includes(query);
      return (
        matchesSearch &&
        templateFilterKeys.every((key) => {
          const selected = templateFilterValues[key] ?? [];
          return (
            selected.length === 0 ||
            selected.includes(templateValue(template, key))
          );
        })
      );
    });
  }, [
    search,
    templateFilterKeys,
    templateFilterValues,
    templateSorter.sortedRows,
  ]);

  const saveDraft = () => {
    if (!draft?.code.trim() || !draft.description.trim()) return;
    const exists = rows.some((row) => row.id === draft.id);
    persistRows(
      exists
        ? rows.map((row) => (row.id === draft.id ? draft : row))
        : [...rows, draft],
    );
    setDraft(null);
  };

  const saveTemplateDraft = () => {
    if (!templateDraft?.name.trim()) return;
    const exists = templates.some(
      (template) => template.id === templateDraft.id,
    );
    persistTemplates(
      exists
        ? templates.map((template) =>
            template.id === templateDraft.id ? templateDraft : template,
          )
        : [...templates, templateDraft],
    );
    setTemplateDraft(null);
  };

  const importClassifications = async (file?: File) => {
    if (!file || !selectedTemplate) return;
    try {
      const importedRows = await readImportedClassifications(file);
      if (importedRows.length === 0) {
        setImportMessage({
          type: "error",
          text: "No VAT classification rows were found in the selected file.",
        });
        return;
      }

      const mergedRows = [...rows];
      let updatedCount = 0;
      let addedCount = 0;
      importedRows.forEach((importedRow) => {
        const existingIndex = mergedRows.findIndex(
          (row) => row.code.toLocaleUpperCase() === importedRow.code,
        );
        if (existingIndex >= 0) {
          mergedRows[existingIndex] = {
            ...importedRow,
            id: mergedRows[existingIndex].id,
          };
          updatedCount += 1;
        } else {
          mergedRows.push(importedRow);
          addedCount += 1;
        }
      });
      persistRows(mergedRows);
      setImportMessage({
        type: "success",
        text: `${importedRows.length} classifications imported: ${addedCount} added, ${updatedCount} updated.`,
      });
    } catch {
      setImportMessage({
        type: "error",
        text: "The document could not be imported. Use XLSX, XLS, CSV, JSON or TXT format.",
      });
    } finally {
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

  if (!selectedTemplate) {
    const visibleTemplateColumns = templateColumns.filter(
      (column) => column.visible,
    );
    const allVisibleSelected =
      visibleTemplates.length > 0 &&
      visibleTemplates.every((template) => selectedTemplates.has(template.id));
    const templateTableWidth =
      42 +
      visibleTemplateColumns.reduce((sum, column) => sum + column.width, 0) +
      80;
    const deleteTemplates = (ids: Set<string>) => {
      persistTemplates(templates.filter((template) => !ids.has(template.id)));
      setSelectedTemplates(new Set());
    };
    return (
      <main
        className="flex h-screen min-w-0 flex-col gap-8 overflow-hidden bg-white py-14"
        style={{
          paddingLeft: "clamp(24px, 5vw, 72px)",
          paddingRight: "clamp(24px, 5vw, 72px)",
        }}
      >
        <PageHeader
          title="VAT classification templates"
          actions={
            <PageActionButton
              onClick={() =>
                setTemplateDraft({
                  id: `vat-template-${Date.now()}`,
                  name: "",
                  description: "",
                  active: true,
                  updatedAt: new Date().toISOString().slice(0, 10),
                  classifications: [],
                })
              }
            >
              Create new
            </PageActionButton>
          }
        />
        <Breadcrumb />

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1" data-native-system-filters="true">
            <OcrSearchField
              ariaLabel="Search VAT classification templates"
              value={search}
              onChange={setSearch}
              className="!w-[260px] !min-w-[260px] !max-w-[260px] !flex-none"
            />
            <SystemAddFilters
              persistenceKey="finansu-harmonija:v7:filters:vat-classification-templates"
              columns={templateFilterColumns}
              activeKeys={templateFilterKeys}
              values={templateFilterValues}
              onActiveKeysChange={setTemplateFilterKeys}
              onValuesChange={setTemplateFilterValues}
            />
          </div>
          <div className="flex items-center gap-4">
            <BulkDeleteButton
              selectedCount={selectedTemplates.size}
              onDelete={() => deleteTemplates(selectedTemplates)}
            />
            <ColumnSettingsButton
              onClick={() => setShowTemplateColumns(true)}
            />
            <RefreshAllButton
              onRefresh={() => setTemplates((current) => [...current])}
            />
          </div>
        </div>

        <div
          ref={templateTableScrollRef}
          className="min-h-0 flex-1 overflow-x-auto scrollbar-hide"
        >
          <div style={{ minWidth: templateTableWidth }}>
            <div className="mb-3 flex h-6 items-center">
              <div data-table-header-select="true" className="flex w-[42px] flex-shrink-0 px-3">
                <TableCheckBox
                  checked={allVisibleSelected}
                  label="Select all templates"
                  onChange={() =>
                    setSelectedTemplates(
                      allVisibleSelected
                        ? new Set()
                        : new Set(
                            visibleTemplates.map((template) => template.id),
                          ),
                    )
                  }
                />
              </div>
              {visibleTemplateColumns.map((column) => {
                const realIndex = templateColumns.findIndex(
                  (item) => item.key === column.key,
                );
                return (
                  <div
                    key={column.key}
                    style={{ width: column.width }}
                    className="relative flex flex-shrink-0 items-center gap-1 border-l border-[#D3E1EC] px-3 font-montserrat text-[12px] font-medium text-[#10233A]"
                  >
                    {column.label}
                    <ColumnSortButton
                      columnLabel={column.label}
                      direction={templateSorter.directionFor(column.key)}
                      onDirectionChange={(direction) =>
                        templateSorter.changeSort(column.key, direction)
                      }
                    />
                    <ResizeHandle
                      onMouseDown={(event) =>
                        startTemplateResize(realIndex, event)
                      }
                    />
                  </div>
                );
              })}
              <div className="w-[80px] flex-shrink-0" />
            </div>
            <div className="flex flex-col gap-0.5">
              {visibleTemplates.map((template, rowIndex) => (
                <div
                  key={template.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setSelectedTemplateId(template.id);
                    setSearch("");
                  }}
                  className={`flex h-10 cursor-pointer items-center rounded-lg ${rowIndex % 2 === 0 ? "bg-[#F8FDFF]" : "bg-white"} hover:bg-[#E7F4F9]`}
                >
                  <div className="flex w-[42px] flex-shrink-0 px-3">
                    <TableCheckBox
                      checked={selectedTemplates.has(template.id)}
                      label={`Select ${template.name}`}
                      onChange={() =>
                        setSelectedTemplates((current) => {
                          const next = new Set(current);
                          if (next.has(template.id)) next.delete(template.id);
                          else next.add(template.id);
                          return next;
                        })
                      }
                    />
                  </div>
                  {visibleTemplateColumns.map((column, columnIndex) => (
                    <div
                      key={column.key}
                      style={{ width: column.width }}
                      className="flex-shrink-0 overflow-hidden px-3"
                    >
                      {column.key === "active" ? (
                        <span className="flex items-center gap-2 font-montserrat text-[12px] text-[#10233A]">
                          <span
                            className={`h-2 w-2 rounded-full ${template.active ? "bg-[#18B889]" : "bg-[#B8C5D0]"}`}
                          />
                          {template.active ? "Yes" : "No"}
                        </span>
                      ) : (
                        <span
                          className={`block truncate font-montserrat text-[12px] ${columnIndex === 0 ? "font-medium text-[#007EA7]" : "text-[#10233A]"}`}
                        >
                          {column.key === "classifications"
                            ? template.classifications.length
                            : template[
                                column.key as
                                  "name" | "description" | "updatedAt"
                              ] || "—"}
                        </span>
                      )}
                    </div>
                  ))}
                  <div className="flex w-[80px] flex-shrink-0 justify-end gap-1">
                    <button
                      type="button"
                      aria-label={`Edit ${template.name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        setTemplateDraft({ ...template });
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded text-[#7288A3] hover:bg-white hover:text-[#007EA7]"
                    >
                      <Pencil size={15} />
                    </button>
                    <RowDeleteButton
                      label={`Delete ${template.name}`}
                      onDelete={() => deleteTemplates(new Set([template.id]))}
                    />
                  </div>
                </div>
              ))}
              {visibleTemplates.length === 0 && (
                <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 text-[#7288A3]">
                  <FileText size={30} />
                  <span className="font-montserrat text-[14px] font-semibold">
                    No templates
                  </span>
                  <PageActionButton
                    onClick={() =>
                      setTemplateDraft({
                        id: `vat-template-${Date.now()}`,
                        name: "",
                        description: "",
                        active: true,
                        updatedAt: new Date().toISOString().slice(0, 10),
                        classifications: [],
                      })
                    }
                  >
                    Create new
                  </PageActionButton>
                </div>
              )}
            </div>
          </div>
        </div>

        <HorizontalTableScrollbar scrollRef={templateTableScrollRef} />
        <div>
          <TablePagination
            currentPage={1}
            totalPages={1}
            itemCount={visibleTemplates.length}
            itemsPerPage={Math.max(1, visibleTemplates.length)}
            onPageChange={() => undefined}
            onShowMore={() => undefined}
          />
        </div>

        {templateDraft && (
          <TemplateEditor
            draft={templateDraft}
            onChange={setTemplateDraft}
            onCancel={() => setTemplateDraft(null)}
            onSave={saveTemplateDraft}
          />
        )}
        {showTemplateColumns && (
          <ColumnSettingsPanel
            columns={templateColumns}
            defaultColumns={TEMPLATE_COLUMNS}
            onSave={(next) => {
              setTemplateColumns(next);
              setShowTemplateColumns(false);
            }}
            onClose={() => setShowTemplateColumns(false)}
          />
        )}
      </main>
    );
  }

  const visibleClassificationColumns = classificationColumns.filter(
    (column) => column.visible,
  );
  const classificationTableWidth =
    42 +
    visibleClassificationColumns.reduce(
      (sum, column) => sum + column.width,
      0,
    ) +
    80;
  const allClassificationsSelected =
    visibleRows.length > 0 &&
    visibleRows.every((row) => selectedClassifications.has(row.id));

  return (
    <main
      className="flex h-screen min-w-0 flex-1 flex-col gap-8 overflow-hidden bg-white py-14"
      style={{
        paddingLeft: "clamp(24px, 5vw, 72px)",
        paddingRight: "clamp(24px, 5vw, 72px)",
      }}
    >
      <PageHeader
        title={selectedTemplate.name}
        leading={<HeaderBackButton onClick={() => { setSelectedTemplateId(null); setSearch(""); }} label="Back to VAT classification templates" />}
        actions={
          <div className="flex items-center gap-2">
            <PageActionButton
              icon={<FileUp size={15} />}
              onClick={() => importInputRef.current?.click()}
            >
              Import document
            </PageActionButton>
            <PageActionButton onClick={() => setDraft(emptyClassification())}>
              Create new
            </PageActionButton>
          </div>
        }
      />
      <input
        ref={importInputRef}
        type="file"
        className="hidden"
        accept=".xlsx,.xls,.csv,.json,.txt"
        onChange={(event) =>
          void importClassifications(event.target.files?.[0])
        }
      />
      <Breadcrumb templateName={selectedTemplate.name} />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1" data-native-system-filters="true">
          <OcrSearchField
            value={search}
            onChange={setSearch}
            ariaLabel="Search VAT classifications"
          />
          <SystemAddFilters
            persistenceKey={`finansu-harmonija:v7:filters:vat-classifications:${selectedTemplate.id}`}
            columns={classificationFilterColumns}
            activeKeys={classificationFilterKeys}
            values={classificationFilterValues}
            onActiveKeysChange={setClassificationFilterKeys}
            onValuesChange={setClassificationFilterValues}
          />
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden whitespace-nowrap font-montserrat text-[12px] font-medium text-[#7288A3] xl:inline">
            {visibleRows.length} of {rows.length} classifications
          </span>
          <BulkDeleteButton
            selectedCount={selectedClassifications.size}
            onDelete={() => {
              persistRows(
                rows.filter((row) => !selectedClassifications.has(row.id)),
              );
              setSelectedClassifications(new Set());
            }}
          />
          <ColumnSettingsButton
            onClick={() => setShowClassificationColumns(true)}
          />
          <RefreshAllButton onRefresh={() => persistRows([...rows])} />
        </div>
      </div>

      <div
        ref={classificationTableScrollRef}
        className="min-h-0 flex-1 overflow-auto scrollbar-hide"
      >
        <div style={{ minWidth: classificationTableWidth }}>
          <div className="mb-3 flex h-6 items-center">
            <div data-table-header-select="true" className="flex w-[42px] flex-shrink-0 px-3">
              <TableCheckBox
                checked={allClassificationsSelected}
                label="Select all classifications"
                onChange={() =>
                  setSelectedClassifications(
                    allClassificationsSelected
                      ? new Set()
                      : new Set(visibleRows.map((row) => row.id)),
                  )
                }
              />
            </div>
            {visibleClassificationColumns.map((column, visibleIndex) => {
              const realIndex = classificationColumns.findIndex(
                (item) => item.key === column.key,
              );
              return (
                <div
                  key={column.key}
                  style={{ width: column.width }}
                  className={`relative flex h-6 flex-shrink-0 items-center gap-1 px-3 font-montserrat text-[12px] font-medium text-[#10233A] ${visibleIndex > 0 ? "border-l border-[#D3E1EC]" : ""}`}
                >
                  <span className="whitespace-nowrap">{column.label}</span>
                  <ColumnSortButton
                    columnLabel={column.label}
                    direction={classificationSorter.directionFor(column.key)}
                    onDirectionChange={(direction) =>
                      classificationSorter.changeSort(column.key, direction)
                    }
                  />
                  <ResizeHandle
                    onMouseDown={(event) =>
                      startClassificationResize(realIndex, event)
                    }
                  />
                </div>
              );
            })}
            <div className="h-6 w-[80px] flex-shrink-0 bg-white" />
          </div>

          <div className="flex flex-col gap-0.5">
            {visibleRows.map((row, rowIndex) => (
              <div
                key={row.id}
                className={`group flex h-10 items-center rounded-lg font-montserrat text-[12px] text-[#10233A] transition-colors ${rowIndex % 2 === 0 ? "bg-[#F8FDFF]" : "bg-white"} hover:bg-[#E7F4F9]`}
              >
                <div className="flex w-[42px] flex-shrink-0 px-3">
                  <TableCheckBox
                    checked={selectedClassifications.has(row.id)}
                    label={`Select ${row.code}`}
                    onChange={() =>
                      setSelectedClassifications((current) => {
                        const next = new Set(current);
                        if (next.has(row.id)) next.delete(row.id);
                        else next.add(row.id);
                        return next;
                      })
                    }
                  />
                </div>
                {visibleClassificationColumns.map((column) => (
                  <div
                    key={column.key}
                    style={{ width: column.width }}
                    className="flex-shrink-0 overflow-hidden px-3"
                  >
                    {column.key === "active" ? (
                      <span className="flex items-center gap-2">
                        <span
                          className={`h-2 w-2 rounded-full ${row.active ? "bg-[#18B889]" : "bg-[#B8C5D0]"}`}
                        />
                        {row.active ? "Yes" : "No"}
                      </span>
                    ) : column.key === "incomingRegister" ||
                      column.key === "outgoingRegister" ? (
                      <RegisterMark
                        value={
                          row[
                            column.key as
                              "incomingRegister" | "outgoingRegister"
                          ]
                        }
                      />
                    ) : (
                      <span
                        className="block truncate font-medium text-[#10233A]"
                        title={String(
                          row[
                            column.key as Exclude<
                              keyof VatClassification,
                              "id" | "active"
                            >
                          ] ?? "",
                        )}
                      >
                        {row[
                          column.key as Exclude<
                            keyof VatClassification,
                            "id" | "active"
                          >
                        ] || "—"}
                      </span>
                    )}
                  </div>
                ))}
                <div
                  className={`flex h-10 w-[80px] flex-shrink-0 items-center justify-end gap-1 transition-colors ${rowIndex % 2 === 0 ? "bg-[#F8FDFF]" : "bg-white"} group-hover:bg-[#E7F4F9]`}
                >
                  <button
                    type="button"
                    aria-label={`Edit ${row.code}`}
                    onClick={() => setDraft({ ...row })}
                    className="flex h-8 w-8 items-center justify-center rounded text-[#7288A3] hover:bg-white hover:text-[#007EA7]"
                  >
                    <Pencil size={15} />
                  </button>
                  <RowDeleteButton
                    variant="plain"
                    label={`Delete ${row.code}`}
                    onDelete={() =>
                      persistRows(rows.filter((item) => item.id !== row.id))
                    }
                  />
                </div>
              </div>
            ))}
            {visibleRows.length === 0 && (
              <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 text-[#7288A3]">
                <FileText size={30} />
                <span className="font-montserrat text-[13px] font-semibold">
                  No VAT classifications
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <HorizontalTableScrollbar scrollRef={classificationTableScrollRef} />
      <div>
        <TablePagination
          currentPage={1}
          totalPages={1}
          itemCount={visibleRows.length}
          itemsPerPage={Math.max(1, visibleRows.length)}
          onPageChange={() => undefined}
          onShowMore={() => undefined}
        />
      </div>

      {showClassificationColumns && (
        <ColumnSettingsPanel
          columns={classificationColumns}
          defaultColumns={CLASSIFICATION_COLUMNS}
          onSave={(next) => {
            setClassificationColumns(next);
            setShowClassificationColumns(false);
          }}
          onClose={() => setShowClassificationColumns(false)}
        />
      )}

      {importMessage && (
        <div
          role="status"
          className={`fixed bottom-6 right-6 z-[95] flex max-w-[430px] items-start justify-between gap-4 rounded-xl border px-4 py-3 shadow-lg ${
            importMessage.type === "success"
              ? "border-[#B9E9D7] bg-[#EEFBF6] text-[#08745A]"
              : "border-[#F1CACA] bg-[#FFF5F5] text-[#B53F3F]"
          }`}
        >
          <span className="font-montserrat text-[12px] font-semibold leading-5">
            {importMessage.text}
          </span>
          <button
            type="button"
            aria-label="Close import message"
            onClick={() => setImportMessage(null)}
            className="mt-0.5 shrink-0"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {draft && (
        <Editor
          draft={draft}
          onChange={setDraft}
          onCancel={() => setDraft(null)}
          onSave={saveDraft}
        />
      )}
    </main>
  );
}

function TableCheckBox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        onChange();
      }}
      className={`flex h-[18px] w-[18px] items-center justify-center rounded-[6px] border ${checked ? "border-[#007EA7] bg-[#007EA7]" : "border-[#A1B6C6] bg-white"}`}
    >
      {checked && <Check size={12} className="text-white" />}
    </button>
  );
}

function Breadcrumb({ templateName }: { templateName?: string }) {
  return (
    <div className="flex items-center gap-2 font-montserrat text-[12px] font-medium text-[#7288A3]">
      <span>Settings</span>
      <span>/</span>
      <span>Organizations</span>
      <span>/</span>
      <span>VAT classifications</span>
      {templateName && (
        <>
          <span>/</span>
          <span>{templateName}</span>
        </>
      )}
    </div>
  );
}

function TemplateEditor({
  draft,
  onChange,
  onCancel,
  onSave,
}: {
  draft: VatClassificationTemplate;
  onChange: (value: VatClassificationTemplate) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[90] flex justify-end bg-[#10233A]/25"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <aside className="h-full w-[420px] max-w-[calc(100vw-24px)] overflow-y-auto bg-white px-6 pb-8 pt-6 shadow-[-2px_0_0_#E5EDF9]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-montserrat text-[25px] font-semibold text-[#10233A]">
              {draft.name ? "Edit template" : "New VAT template"}
            </h2>
            <p className="mt-1 font-montserrat text-[12px] text-[#7288A3]">
              Create a reusable VAT classification structure for organizations.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close VAT template"
            onClick={onCancel}
            className="flex h-9 w-9 items-center justify-center rounded text-[#7288A3] hover:bg-[#F0F7FA]"
          >
            <X size={20} />
          </button>
        </div>
        <div className="mt-7 space-y-5">
          <Input
            label="Template name"
            required
            value={draft.name}
            onChange={(name) => onChange({ ...draft, name })}
            placeholder="Example: Lithuanian VAT classifications"
          />
          <TextArea
            label="Description"
            value={draft.description}
            onChange={(description) => onChange({ ...draft, description })}
          />
          <label className="flex items-center gap-3 font-montserrat text-[13px] font-medium text-[#10233A]">
            <button
              type="button"
              aria-label="Active template"
              aria-pressed={draft.active}
              onClick={() => onChange({ ...draft, active: !draft.active })}
              className={`flex h-5 w-5 items-center justify-center rounded border ${draft.active ? "border-[#007EA7] bg-[#007EA7] text-white" : "border-[#AFC0CE] bg-white"}`}
            >
              {draft.active && <Check size={14} />}
            </button>
            Active
          </label>
        </div>
        <div className="mt-8 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="h-10 rounded-lg border border-[#CFE0EA] px-5 font-montserrat text-[13px] font-semibold text-[#7288A3]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!draft.name.trim()}
            onClick={onSave}
            className="h-10 rounded-lg bg-[#007EA7] px-6 font-montserrat text-[13px] font-semibold text-white disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </aside>
    </div>
  );
}

function RegisterMark({ value }: { value: string }) {
  return (
    <span
      className={`font-semibold ${value === "-" ? "text-[#A2B0BE]" : "text-[#10233A]"}`}
    >
      {value}
    </span>
  );
}

function Editor({
  draft,
  onChange,
  onCancel,
  onSave,
}: {
  draft: VatClassification;
  onChange: (value: VatClassification) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const field = (key: keyof VatClassification, value: string | boolean) =>
    onChange({ ...draft, [key]: value });
  return (
    <div
      className="fixed inset-0 z-[90] flex justify-end bg-[#10233A]/25"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <aside className="h-full w-[420px] max-w-[calc(100vw-24px)] overflow-y-auto bg-white px-6 pb-8 pt-6 shadow-[-2px_0_0_#E5EDF9]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-montserrat text-[25px] font-semibold text-[#10233A]">
              {draft.code ? `Edit ${draft.code}` : "New VAT classification"}
            </h2>
            <p className="mt-1 font-montserrat text-[12px] text-[#7288A3]">
              Shared VAT classification used by organizations.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close VAT classification"
            onClick={onCancel}
            className="flex h-9 w-9 items-center justify-center rounded text-[#7288A3] hover:bg-[#F0F7FA]"
          >
            <X size={20} />
          </button>
        </div>
        <div className="mt-7 grid grid-cols-2 gap-5">
          <Input
            label="Tax code"
            required
            value={draft.code}
            onChange={(value) => field("code", value.toUpperCase())}
          />
          <Input
            label="VAT rate (%)"
            value={draft.rate}
            onChange={(value) => field("rate", value)}
            placeholder="21, 9, 5 or —"
          />
          <Select
            label="Incoming register"
            value={draft.incomingRegister}
            onChange={(value) => field("incomingRegister", value)}
          />
          <Select
            label="Outgoing register"
            value={draft.outgoingRegister}
            onChange={(value) => field("outgoingRegister", value)}
          />
          <div className="col-span-2">
            <TextArea
              label="Description"
              required
              value={draft.description}
              onChange={(value) => field("description", value)}
            />
          </div>
          <div className="col-span-2">
            <TextArea
              label="Examples"
              value={draft.examples}
              onChange={(value) => field("examples", value)}
            />
          </div>
          <label className="col-span-2 flex items-center gap-3 font-montserrat text-[13px] font-medium text-[#10233A]">
            <button
              type="button"
              aria-label="Active"
              aria-pressed={draft.active}
              onClick={() => field("active", !draft.active)}
              className={`flex h-5 w-5 items-center justify-center rounded border ${draft.active ? "border-[#007EA7] bg-[#007EA7] text-white" : "border-[#AFC0CE] bg-white"}`}
            >
              {draft.active && <Check size={14} />}
            </button>
            Active
          </label>
        </div>
        <div className="mt-8 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="h-10 rounded-lg border border-[#CFE0EA] px-5 font-montserrat text-[13px] font-semibold text-[#7288A3]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!draft.code.trim() || !draft.description.trim()}
            onClick={onSave}
            className="h-10 rounded-lg bg-[#007EA7] px-6 font-montserrat text-[13px] font-semibold text-white disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </aside>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  required,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block font-montserrat text-[13px] font-semibold text-[#10233A]">
      {label}
      {required && <span className="text-[#E45858]"> *</span>}
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-11 w-full rounded-lg border border-[#D3E1EC] px-3 font-montserrat text-[13px] font-medium outline-none focus:border-[#007EA7]"
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label className="block font-montserrat text-[13px] font-semibold text-[#10233A]">
      {label}
      {required && <span className="text-[#E45858]"> *</span>}
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={4}
        className="mt-2 w-full resize-y rounded-lg border border-[#D3E1EC] px-3 py-3 font-montserrat text-[13px] font-medium leading-5 outline-none focus:border-[#007EA7]"
      />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block font-montserrat text-[13px] font-semibold text-[#10233A]">
      {label}
      <div className="mt-2">
        <SearchableSelect ariaLabel={label} value={value} onChange={onChange} options={[{ value: "-", label: "Not used" }, { value: "x", label: "x — required" }, { value: "x*", label: "x* — conditional" }, { value: "x**", label: "x** — conditional" }, { value: "x***", label: "x*** — conditional" }]} className="h-11 rounded-lg border border-[#D3E1EC] bg-white px-3 pr-9 font-montserrat text-[13px] font-medium text-[#10233A]" />
      </div>
    </label>
  );
}
