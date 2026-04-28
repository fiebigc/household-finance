import type { Loan } from "@/types/schema";
import type { AmortizationRow } from "@/types/engine";
import { addMonths, format } from "date-fns";

export function computeAmortizationSchedule(
  loan: Loan,
  months: number = 360
): AmortizationRow[] {
  const rows: AmortizationRow[] = [];
  let balance = loan.outstanding;
  const monthlyRate = loan.interest_rate / 12;
  const startDate = new Date(loan.start_date);

  for (let i = 0; i < months && balance > 0.01; i++) {
    const interest = balance * monthlyRate;
    let principal: number;
    let totalPayment: number;

    switch (loan.amortization_type) {
      case "annuity": {
        const payment = loan.monthly_payment ?? computeAnnuityPayment(loan.outstanding, monthlyRate, months);
        totalPayment = Math.min(payment, balance + interest);
        principal = totalPayment - interest;
        break;
      }
      case "straight_line": {
        principal = loan.outstanding / months;
        totalPayment = principal + interest;
        break;
      }
      case "interest_only": {
        principal = 0;
        totalPayment = interest;
        break;
      }
      default: {
        const payment = loan.monthly_payment ?? interest;
        totalPayment = payment;
        principal = payment - interest;
        break;
      }
    }

    principal = Math.max(0, Math.min(principal, balance));
    const closing = balance - principal;

    rows.push({
      month: i + 1,
      date: format(addMonths(startDate, i), "yyyy-MM"),
      opening_balance: Math.round(balance),
      interest: Math.round(interest),
      principal_payment: Math.round(principal),
      total_payment: Math.round(totalPayment),
      closing_balance: Math.round(closing),
    });

    balance = closing;
  }

  return rows;
}

function computeAnnuityPayment(principal: number, monthlyRate: number, months: number): number {
  if (monthlyRate === 0) return principal / months;
  return (principal * monthlyRate * Math.pow(1 + monthlyRate, months)) /
    (Math.pow(1 + monthlyRate, months) - 1);
}
