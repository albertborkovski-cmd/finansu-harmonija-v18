import type { Company } from './supabase';

export interface DebtRow {
  id: string;
  counterpartyCode: string;
  counterpartyName: string;
  counterpartyType: string;
  documentReference: string;
  documentType: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  totalAmount: string;
  paidAmount: string;
  outstandingAmount: string;
  daysOverdue: number;
  debtStatus: string;
  reminderStage: string;
  lastReminderDate: string;
  paymentPriority: string;
  department: string;
  notes: string;
}

export const DEBT_ROWS: DebtRow[] = [
  {
    id: 'debt-1',
    counterpartyCode: '123456',
    counterpartyName: 'UAB Alfa',
    counterpartyType: 'Buyer',
    documentReference: 'INV-1025',
    documentType: 'Sales invoice',
    issueDate: '11.12.2025',
    dueDate: '11.12.2025',
    currency: 'EUR',
    totalAmount: '1,200.00',
    paidAmount: '900.00',
    outstandingAmount: '300.00',
    daysOverdue: 5,
    debtStatus: 'Partially paid',
    reminderStage: 'Final',
    lastReminderDate: '11.12.2025',
    paymentPriority: 'Low',
    department: 'Project A',
    notes: '—',
  },
  {
    id: 'debt-2',
    counterpartyCode: '123456',
    counterpartyName: 'UAB Alfa',
    counterpartyType: 'Buyer',
    documentReference: 'INV-1025',
    documentType: 'Sales invoice',
    issueDate: '11.12.2025',
    dueDate: '11.12.2025',
    currency: 'EUR',
    totalAmount: '1,200.00',
    paidAmount: '900.00',
    outstandingAmount: '300.00',
    daysOverdue: 5,
    debtStatus: 'Partially paid',
    reminderStage: 'Final',
    lastReminderDate: '11.12.2025',
    paymentPriority: 'Low',
    department: 'Project A',
    notes: '—',
  },
];

export type ClientRow = {
  id: string;
  registrationNumber: string;
  companyCode: string;
  vatCode: string;
  name: string;
  email: string;
};

export function seedClients(company: Pick<Company, 'name'>): ClientRow[] {
  if (company.name.toLocaleLowerCase() === "alice stone") {
    return [
      {
        id: "alice-client-001",
        registrationNumber: "305499987",
        companyCode: "305499987",
        vatCode: "—",
        name: "Nord 1, UAB",
        email: "—",
      },
      {
        id: "alice-client-002",
        registrationNumber: "305499987",
        companyCode: "305499987",
        vatCode: "—",
        name: "Nord 1, UAB",
        email: "—",
      },
    ];
  }
  return [];
}

