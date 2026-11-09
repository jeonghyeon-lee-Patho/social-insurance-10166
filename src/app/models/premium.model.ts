import { EmployeeView } from "./employee.model";


/**
 * アコーディオン詳細展開用の法定内訳モデル
 */
export interface InsuranceDetailBreakdown {
  healthRate: number;
  careRate: number;
  pensionRate: number;

  applyHealth: boolean;
  applyCare: boolean;
  applyPension: boolean;
  isTwoMonthsCollection: boolean;

  healthMultiplier?: number;
  careMultiplier?: number;
  pensionMultiplier?: number;

  healthRemuneration: number;
  careRemuneration: number;
  pensionRemuneration: number;
  healthEmployee: number;
  healthCompany: number;
  healthTotal: number;
  careEmployee: number;
  careCompany: number;
  careTotal: number;
  pensionEmployee: number;
  pensionCompany: number;
  pensionTotal: number;
  
  salaryHealthRemuneration: number;
  salaryEmployeeTotal: number;
  salaryCompanyTotal: number;
  salaryTotal: number;

  bonusHealthRemuneration: number;
  bonusCareRemuneration: number;
  bonusPensionRemuneration: number;
  bonusHealthEmployee: number;
  bonusHealthCompany: number;
  bonusHealthTotal: number;
  bonusCareEmployee: number;
  bonusCareCompany: number;
  bonusCareTotal: number;
  bonusPensionEmployee: number;
  bonusPensionCompany: number;
  bonusPensionTotal: number;
  bonusEmployeeTotal: number;
  bonusCompanyTotal: number;
  bonusTotal: number;
}

export interface AnnualDetailBreakdown {
  salaryMonthsCount: number;         // 給与控除月数（例: 12ヶ月）
  salaryEmployeeTotal: number;       // 毎月給与分 本人累計
  salaryCompanyTotal: number;        // 毎月給与分 会社累計
  salaryTotal: number;               // 毎月給与分 総額
  bonusCount: number;                // 年間賞与支給回数（例: 2回）
  bonusEmployeeTotal: number;        // 年間賞与分 本人累計
  bonusCompanyTotal: number;         // 年間賞与分 会社累計
  bonusTotal: number;                // 年間賞与分 総額
  healthEmployeeTotal: number;       // 健康保険 本人累計
  healthCompanyTotal: number;        // 健康保険 会社累計
  healthTotal: number;               // 健康保険 総額
  careEmployeeTotal: number;         // 介護保険 本人累計
  careCompanyTotal: number;          // 介護保険 会社累計
  careTotal: number;                 // 介護保険 総額
  pensionEmployeeTotal: number;      // 厚生年金 本人累計
  pensionCompanyTotal: number;       // 厚生年金 会社累計
  pensionTotal: number;              // 厚生年金 総額
}

/**
 * 社員別保険料表示用の拡張ビューモデル
 */
export interface PremiumEmployeeView extends EmployeeView {
  insuranceStandardName: string;
  totalRemuneration: number;    // 総報酬額（給与 + 賞与）
  monthlySalary: number;        // 給与報酬月額
  salaryGrade: string;          // 標準報酬等級
  bonusAmount: number;          // 賞与実支給額
  annualHealth: number;         // 年間健康保険料累計
  annualCare: number;           // 年間介護保険料累計
  annualPension: number;        // 年間厚生年金料累計
  employeeShare: number;        // 本人負担額
  companyShare: number;         // 会社負担額
  totalPremium: number;         // 総保険料（折半納付合計）
  isNewHire: boolean;           // 初回控除開始月強調フラグ
  isRetiredThisMonth: boolean;  // 退職控除強調フラグ
  isAgeTransition: boolean;     // 年齢到達控除開始・喪失強調フラグ
  noticeMessage?: string;       // 条件付き特記事項案内文
  breakdown: InsuranceDetailBreakdown;
  annualBreakdown?: AnnualDetailBreakdown;
}


