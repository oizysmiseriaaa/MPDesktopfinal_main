export type HistoricalExpenseUnitSummary = {
  unitName: string;
  unitId?: string;
  total: number;
};

export type HistoricalExpenseCategorySummary = {
  category: string;
  total: number;
};

export type HistoricalExpenseSummary = {
  month: number;
  year: number;
  source: "historical-summary";
  sourceLabel: string;
  unitSummaries: HistoricalExpenseUnitSummary[];
  categorySummaries?: HistoricalExpenseCategorySummary[];
  grandTotal: number;
};

const UNIT_NAME_TO_ID: Record<string, string | undefined> = {
  "1586 C2": "KIj4HrdE0cqWBvykEpBM",
  "1585 C2": "jgG3dqrseM2GUThTXxY4",
  "1583 C2": "icenQfPT9AYy5OV4FCu8",
  "1571 C2": "S3NWTiUzmSwaGZVhiDOf",
  "1569 C2": "JvwgbK6mCtVmXSr2L1Wp",
  "1567 C2": "7YhmwYv8ZvaQfBJQ38qv",
  "1537 C2": "snXxFE2ncaQzoBGtUKuj",
  "1539 C2": "71aRlTNWEFJcZg0NaC0C",
  "1839 C2": "VItQBSg7Lb8DeklOsVnI",
  "953 D": "A7retS75MsnuZT50sch8",
  "963 D": "KSjFPBxkyc9wxDqitCVz",
  "525 S3T1": "6JMTCJy1l7twsDWKNEsV",
  "372 S3T1": "T2vYhxAbvMGfZf1U2A7S",
  "855 S3T1": "KZejEJ4XEs5gK6NGTl6u",
  "595 C2": undefined,
  "S2T1 - 1407": undefined,
  "S2T2 - 1746": undefined,
  "S2T2 - 941": undefined,
  "S2T3 - 1821": undefined,
  "S2T2 - 516": undefined,
};

function normalizeUnitName(name: string): string {
  return name.trim().toUpperCase().replace(/\s+/g, " ");
}

export const HISTORICAL_EXPENSE_SUMMARIES: HistoricalExpenseSummary[] = [
  {
    month: 1,
    year: 2026,
    source: "historical-summary",
    sourceLabel: "January 2026 Historical Monthly Expense Summary",
    grandTotal: 410320.0,
    unitSummaries: [
      { unitName: "1586 C2", unitId: UNIT_NAME_TO_ID["1586 C2"], total: 27488 },
      { unitName: "1585 C2", unitId: UNIT_NAME_TO_ID["1585 C2"], total: 27488 },
      { unitName: "1583 C2", unitId: UNIT_NAME_TO_ID["1583 C2"], total: 27488 },
      { unitName: "1571 C2", unitId: UNIT_NAME_TO_ID["1571 C2"], total: 27488 },
      { unitName: "1569 C2", unitId: UNIT_NAME_TO_ID["1569 C2"], total: 27488 },
      { unitName: "1567 C2", unitId: UNIT_NAME_TO_ID["1567 C2"], total: 27488 },
      { unitName: "1537 C2", unitId: UNIT_NAME_TO_ID["1537 C2"], total: 27488 },
      { unitName: "1539 C2", unitId: UNIT_NAME_TO_ID["1539 C2"], total: 27264 },
      { unitName: "1839 C2", unitId: UNIT_NAME_TO_ID["1839 C2"], total: 0 },
      { unitName: "595 C2", unitId: UNIT_NAME_TO_ID["595 C2"], total: 0 },
      { unitName: "953 D", unitId: UNIT_NAME_TO_ID["953 D"], total: 27488 },
      { unitName: "963 D", unitId: UNIT_NAME_TO_ID["963 D"], total: 27488 },
      { unitName: "S3T1 - 372", unitId: UNIT_NAME_TO_ID["372 S3T1"], total: 27488 },
      { unitName: "S3T1 - 525", unitId: UNIT_NAME_TO_ID["525 S3T1"], total: 28488 },
      { unitName: "S3T1 - 855", unitId: UNIT_NAME_TO_ID["855 S3T1"], total: 31988 },
      { unitName: "S2T1 - 1407", unitId: UNIT_NAME_TO_ID["S2T1 - 1407"], total: 27488 },
      { unitName: "S2T2 - 1746", unitId: UNIT_NAME_TO_ID["S2T2 - 1746"], total: 27488 },
      { unitName: "S2T2 - 941", unitId: UNIT_NAME_TO_ID["S2T2 - 941"], total: 6500 },
      { unitName: "S2T3 - 1821", unitId: UNIT_NAME_TO_ID["S2T3 - 1821"], total: 0 },
      { unitName: "S2T2 - 516", unitId: UNIT_NAME_TO_ID["S2T2 - 516"], total: 0 },
    ],
  },
  {
    month: 2,
    year: 2026,
    source: "historical-summary",
    sourceLabel: "February 2026 Historical Monthly Expense Summary",
    grandTotal: 410320.0,
    unitSummaries: [
      { unitName: "1586 C2", unitId: UNIT_NAME_TO_ID["1586 C2"], total: 42000 },
      { unitName: "1585 C2", unitId: UNIT_NAME_TO_ID["1585 C2"], total: 42000 },
      { unitName: "1583 C2", unitId: UNIT_NAME_TO_ID["1583 C2"], total: 42000 },
      { unitName: "1571 C2", unitId: UNIT_NAME_TO_ID["1571 C2"], total: 31500 },
      { unitName: "1569 C2", unitId: UNIT_NAME_TO_ID["1569 C2"], total: 42000 },
      { unitName: "1567 C2", unitId: UNIT_NAME_TO_ID["1567 C2"], total: 34500 },
      { unitName: "1537 C2", unitId: UNIT_NAME_TO_ID["1537 C2"], total: 27000 },
      { unitName: "1539 C2", unitId: UNIT_NAME_TO_ID["1539 C2"], total: 0 },
      { unitName: "1839 C2", unitId: UNIT_NAME_TO_ID["1839 C2"], total: 25500 },
      { unitName: "595 C2", unitId: UNIT_NAME_TO_ID["595 C2"], total: 0 },
      { unitName: "953 D", unitId: UNIT_NAME_TO_ID["953 D"], total: 22500 },
      { unitName: "963 D", unitId: UNIT_NAME_TO_ID["963 D"], total: 37500 },
      { unitName: "S3T1 - 372", unitId: UNIT_NAME_TO_ID["372 S3T1"], total: 15000 },
      { unitName: "S3T1 - 525", unitId: UNIT_NAME_TO_ID["525 S3T1"], total: 16500 },
      { unitName: "S3T1 - 855", unitId: UNIT_NAME_TO_ID["855 S3T1"], total: 18000 },
      { unitName: "S2T1 - 1407", unitId: UNIT_NAME_TO_ID["S2T1 - 1407"], total: 3000 },
      { unitName: "S2T2 - 1746", unitId: UNIT_NAME_TO_ID["S2T2 - 1746"], total: 0 },
      { unitName: "S2T2 - 941", unitId: UNIT_NAME_TO_ID["S2T2 - 941"], total: 0 },
      { unitName: "S2T3 - 1821", unitId: UNIT_NAME_TO_ID["S2T3 - 1821"], total: 0 },
      { unitName: "S2T2 - 516", unitId: UNIT_NAME_TO_ID["S2T2 - 516"], total: 0 },
    ],
  },
  {
    month: 3,
    year: 2026,
    source: "historical-summary",
    sourceLabel: "March 2026 Historical Monthly Expense Summary",
    grandTotal: 307405.12,
    unitSummaries: [
      { unitName: "S1C2-1569", unitId: UNIT_NAME_TO_ID["1569 C2"], total: 43400 },
      { unitName: "S1C2-1583", unitId: UNIT_NAME_TO_ID["1583 C2"], total: 43400 },
      { unitName: "S1C2-1585", unitId: UNIT_NAME_TO_ID["1585 C2"], total: 43400 },
      { unitName: "S1C2-1586", unitId: UNIT_NAME_TO_ID["1586 C2"], total: 41300 },
      { unitName: "S1D2-0953", unitId: UNIT_NAME_TO_ID["953 D"], total: 35700 },
      { unitName: "S1C2-1571", unitId: UNIT_NAME_TO_ID["1571 C2"], total: 35180.5 },
      { unitName: "S1C2-1839", unitId: UNIT_NAME_TO_ID["1839 C2"], total: 34643 },
      { unitName: "S1C2-1567", unitId: UNIT_NAME_TO_ID["1567 C2"], total: 32840.5 },
      { unitName: "S1C2-1537", unitId: UNIT_NAME_TO_ID["1537 C2"], total: 29157 },
      { unitName: "S3T1-0855", unitId: UNIT_NAME_TO_ID["855 S3T1"], total: 28000 },
      { unitName: "S1D2-0963", unitId: UNIT_NAME_TO_ID["963 D"], total: 25700 },
      { unitName: "S3T1 - 525", unitId: UNIT_NAME_TO_ID["525 S3T1"], total: 25500 },
      { unitName: "S3T1 - 372", unitId: UNIT_NAME_TO_ID["372 S3T1"], total: 20700 },
      { unitName: "S1C2-595", unitId: UNIT_NAME_TO_ID["595 C2"], total: 19100 },
      { unitName: "S2T1 - 1407", unitId: UNIT_NAME_TO_ID["S2T1 - 1407"], total: 15300 },
      { unitName: "S1C2-1539", unitId: UNIT_NAME_TO_ID["1539 C2"], total: 4214 },
    ],
    categorySummaries: [
      { category: "Rent", total: 171510.0 },
      { category: "Supplies", total: 1025.0 },
      { category: "Repairs", total: 2150.0 },
      { category: "Shared Expense", total: 76437.26 },
      { category: "Staff Salaries / Wages", total: 500.0 },
      { category: "Utilities", total: 55782.86 },
    ],
  },
];

export function getHistoricalSummaryForMonth(
  month: number,
  year: number,
): HistoricalExpenseSummary | undefined {
  return HISTORICAL_EXPENSE_SUMMARIES.find(
    (s) => s.month === month && s.year === year,
  );
}

export function isHistoricalSummaryMonth(month: number, year: number): boolean {
  return getHistoricalSummaryForMonth(month, year) !== undefined;
}
