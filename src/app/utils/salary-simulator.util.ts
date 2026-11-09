/**
 * 定時決定・随時改定シミュレーター計算ユーティリティ
 * 社会保険（厚生年金・健康保険）の標準報酬月額決定ロジック
 */

import { SALARY_GRADE_MASTER } from '../data/salary-grade-master.data';
import { calculateInsuranceEndYearMonth } from './insurance-calculator.util';

/**
 * 定時決定シミュレーション結果
 */
export interface RegularDecisionResult {
  simulationYear: number;
  months: Array<{
    month: number;
    amount: number;
    daysSufficient: boolean;
  }>;
  averageAmount: number;
  calculatedGrade: number;
  calculatedGradeDisplay: string;
  sufficientMonthsCount: number;
  canApply: boolean;
  warningMessages: string[];
  targetStartYear: number;
  targetStartMonth: number;
  targetEndYear: number;
  targetEndMonth: number;
}

/**
 * 随時改定シミュレーション結果
 */
export interface VarChangedDecisionResult {
  changeStartYear: number;
  changeStartMonth: number;
  mode: 'normal' | 'maternity-return';
  hasFixedWageChange: boolean;
  noRerequisitionIn3Months: boolean;
  changeDirection?: 'increase' | 'decrease';
  previousGrade: number;
  previousAmount: number;
  months: Array<{
    month: number;
    year: number;
    amount: number;
    daysSufficient: boolean;
  }>;
  averageAmount: number;
  calculatedGrade: number;
  calculatedGradeDisplay: string;
  gradeDifference: number;
  canApply: boolean;
  warningMessages: string[];
  overwriteTargets?: Array<{
    id: string;
    currentPeriod: string;
  }>;
}

/**
 * 退職日に基づく社会保険資格喪失年月（最終適用年月）を計算
 * ・末日退職：退職当月まで適用（翌月1日資格喪失）
 * ・月中退職：退職前月まで適用（翌日資格喪失）
 */
export function getInsuranceEndYearMonthByRetirement(retirementDate: string): { year: number; month: number } {
  const [rY, rM, rD] = retirementDate.split('-').map(Number);
  const lastDay = new Date(rY, rM, 0).getDate();
  if (rD === lastDay) {
    return { year: rY, month: rM };
  } else {
    let eM = rM - 1;
    let eY = rY;
    if (eM === 0) {
      eM = 12;
      eY -= 1;
    }
    return { year: eY, month: eM };
  }
}

/**
 * 報酬額から対応する等級を取得
 */
export function determineSalaryGradeFromAmount(monthlyAmount: number): number {
  for (const grade of SALARY_GRADE_MASTER) {
    if (grade.maximumSalary === null || grade.maximumSalary === undefined) {
      return grade.grade;
    }
    if (monthlyAmount >= grade.minimumSalary && monthlyAmount < grade.maximumSalary) {
      return grade.grade;
    }
  }
  return SALARY_GRADE_MASTER[51].grade;
}

/**
 * 等級番号から表示名を取得
 */
export function getGradeDisplayName(grade: number): string {
  const gradeMaster = SALARY_GRADE_MASTER.find(g => g.grade === grade);
  return gradeMaster?.displayName || `${grade}等級`;
}

/**
 * 入社日に応じた定時決定の対象月（4月, 5月, 6月）を取得
 */
export function getEligibleMonthsForRegularDecision(
  simulationYear: number,
  hireDate: string
): number[] {
  if (!hireDate) return [4, 5, 6];

  const [hY, hM, hD] = hireDate.split('-').map(Number);

  if (hY > simulationYear || (hY === simulationYear && hM >= 6)) {
    return [];
  }

  if (hY < simulationYear) {
    return [4, 5, 6];
  }

  if (hM < 4 || (hM === 4 && hD <= 1)) {
    return [4, 5, 6];
  } else if ((hM === 4 && hD > 1) || (hM === 5 && hD <= 1)) {
    return [5, 6];
  } else if (hM === 5 && hD > 1) {
    return [6];
  }

  return [];
}

/**
 * 定時決定シミュレーション実行
 */
export function simulateRegularDecision(
  simulationYear: number,
  april: { amount: number; daysSufficient: boolean },
  may: { amount: number; daysSufficient: boolean },
  june: { amount: number; daysSufficient: boolean },
  salaryHistories: Array<{
    effectiveStartYear: number;
    effectiveStartMonth: number;
    effectiveEndYear?: number;
    effectiveEndMonth?: number;
  }> = [],
  retirementDate: string = '',
  hireDate: string = ''
): RegularDecisionResult {
  const months = [
    { month: 4, amount: april.amount, daysSufficient: april.daysSufficient },
    { month: 5, amount: may.amount, daysSufficient: may.daysSufficient },
    { month: 6, amount: june.amount, daysSufficient: june.daysSufficient }
  ];

  const warningMessages: string[] = [];
  let canCalculate = true;

  let eligibleMonths = [4, 5, 6];

  if (hireDate) {
    const [hY, hM, hD] = hireDate.split('-').map(Number);

    if (hY > simulationYear) {
      warningMessages.push(`入社年月日（${hY}年${hM}月）以前の年度は定時決定の対象外です。`);
      canCalculate = false;
    } else if (hY === simulationYear) {
      if (hM >= 6) {
        warningMessages.push(
          `${simulationYear}年6月1日以降に入社した社員は、当年度の定時決定の対象外（翌年8月まで入社時等級を維持）です。`
        );
        canCalculate = false;
      } else if (hM === 5 && hD > 1) {
        eligibleMonths = [6];
      } else if ((hM === 4 && hD > 1) || (hM === 5 && hD === 1)) {
        eligibleMonths = [5, 6];
      }
    }
  }

  // 1. 充足月数判定
  const sufficientMonths = months.filter(
    m => eligibleMonths.includes(m.month) && m.daysSufficient
  );

  if (canCalculate && sufficientMonths.length === 0) {
    warningMessages.push('支払基礎日数の充足月がないため定時決定を行うことができません。');
    canCalculate = false;
  }

  // 2. 充足月の報酬額チェック (0円以下入力の防止)
  const hasInvalidAmount = sufficientMonths.some(
    m => m.amount === null || m.amount === undefined || isNaN(Number(m.amount)) || Number(m.amount) < 0
  );
  if (hasInvalidAmount) {
    warningMessages.push('充足月の中に報酬月額が未入力またはマイナスの月があります。');
    canCalculate = false;
  }

  // 3. 当該年度9月〜翌年8月間の既存履歴重複チェック
  const rangeStartYM = simulationYear * 100 + 9;
  const rangeEndYM = (simulationYear + 1) * 100 + 8;

  const hasOverlapHistory = salaryHistories.some(history => {
    const histStartYM = Number(history.effectiveStartYear) * 100 + Number(history.effectiveStartMonth);
    const histEndYM = (history.effectiveEndYear && history.effectiveEndMonth)
      ? Number(history.effectiveEndYear) * 100 + Number(history.effectiveEndMonth)
      : 999999;

    return histStartYM <= rangeEndYM && histEndYM >= rangeStartYM;
  });

  if (hasOverlapHistory) {
    warningMessages.push(
      `${simulationYear}年9月〜${simulationYear + 1}年8月の期間に報酬履歴がすでに存在するため、定時決定シミュレーターは利用できません。`
    );
    canCalculate = false;
  }

  // 4. 定時決定の適用開始・終了年月の決定（退職日を考慮）
  const targetStartYear = simulationYear;
  const targetStartMonth = 9;
  let targetEndYear = simulationYear + 1;
  let targetEndMonth = 8;

  if (retirementDate) {
    const endYM = getInsuranceEndYearMonthByRetirement(retirementDate);
    const endValue = endYM.year * 100 + endYM.month;

    if (endValue < rangeStartYM) {
      warningMessages.push(
        `退職に伴う資格喪失（${endYM.year}年${endYM.month}月）が${simulationYear}年9月以前のため、定時決定の対象外です。`
      );
      canCalculate = false;
    } else if (endValue < rangeEndYM) {
      targetEndYear = endYM.year;
      targetEndMonth = endYM.month;
    }
  }

  // 5. 平均額および等級の計算
  let averageAmount = 0;
  if (canCalculate && sufficientMonths.length > 0) {
    const sum = sufficientMonths.reduce((acc, cur) => acc + Number(cur.amount), 0);
    averageAmount = Math.floor(sum / sufficientMonths.length);
  }

  const calculatedGrade = canCalculate ? determineSalaryGradeFromAmount(averageAmount) : 0;
  const calculatedGradeDisplay = canCalculate ? getGradeDisplayName(calculatedGrade) : '';

  return {
    simulationYear,
    months,
    averageAmount,
    calculatedGrade,
    calculatedGradeDisplay,
    sufficientMonthsCount: sufficientMonths.length,
    canApply: canCalculate && warningMessages.length === 0,
    warningMessages,
    targetStartYear,
    targetStartMonth,
    targetEndYear,
    targetEndMonth
  };
}

/**
 * 年月から直前月（1ヶ月前）を計算
 */
export function getPreviousYearMonth(year: number, month: number): { year: number; month: number } {
  let prevMonth = month - 1;
  let prevYear = year;
  if (prevMonth === 0) {
    prevMonth = 12;
    prevYear -= 1;
  }
  return { year: prevYear, month: prevMonth };
}

/**
 * 随時改定シミュレーション実行（通常モード）
 */
export function simulateVarChangedDecisionNormal(
  changeStartYear: number,
  changeStartMonth: number,
  previousGrade: number,
  previousAmount: number,
  month1: { amount: number; year: number; month: number; daysSufficient: boolean },
  month2: { amount: number; year: number; month: number; daysSufficient: boolean },
  month3: { amount: number; year: number; month: number; daysSufficient: boolean },
  hasFixedWageChange: boolean = true,
  noRerequisitionIn3Months: boolean = true,
  changeDirection: 'increase' | 'decrease' = 'increase'
): VarChangedDecisionResult {
  const months = [month1, month2, month3];
  const sufficientMonths = months.filter(m => m.daysSufficient);
  const sufficientMonthsCount = sufficientMonths.length;

  const warningMessages: string[] = [];
  let canCalculate = true;

  if (!hasFixedWageChange) {
    warningMessages.push('固定的賃金の変動がないため随時改定を行うことができません。');
    canCalculate = false;
  }

  if (!noRerequisitionIn3Months) {
    warningMessages.push('対象3ヶ月内に再変動がある場合は随時改定を行うことができません。');
    canCalculate = false;
  }

  if (sufficientMonthsCount !== 3) {
    warningMessages.push('対象3ヶ月すべてにおいて支払基礎日数の充足が必要です。');
    canCalculate = false;
  }

  const hasInvalidAmount = sufficientMonths.some(
    m => m.amount === null || m.amount === undefined || isNaN(Number(m.amount)) || Number(m.amount) < 0
  );
  if (hasInvalidAmount) {
    warningMessages.push('対象月の中に報酬月額が未入力またはマイナスの月があります。');
    canCalculate = false;
  }

  let averageAmount = 0;
  if (canCalculate) {
    const amounts = sufficientMonths.map(m => Number(m.amount));
    averageAmount = Math.floor(amounts.reduce((a, b) => a + b, 0) / amounts.length);
  }

  const calculatedGrade = canCalculate ? determineSalaryGradeFromAmount(averageAmount) : previousGrade;
  const calculatedGradeDisplay = getGradeDisplayName(calculatedGrade);
  const gradeDifference = calculatedGrade - previousGrade;

  let sufficientGradeDiff = false;
  if (canCalculate) {
    if (changeDirection === 'increase' && gradeDifference >= 2) {
      sufficientGradeDiff = true;
    } else if (changeDirection === 'decrease' && gradeDifference <= -2) {
      sufficientGradeDiff = true;
    } else {
      warningMessages.push('2等級以上の変動がないため随時改定を行うことができません。');
      canCalculate = false;
    }
  }

  return {
    changeStartYear,
    changeStartMonth,
    mode: 'normal',
    hasFixedWageChange,
    noRerequisitionIn3Months,
    changeDirection,
    previousGrade,
    previousAmount,
    months,
    averageAmount,
    calculatedGrade,
    calculatedGradeDisplay,
    gradeDifference,
    canApply: canCalculate && sufficientGradeDiff,
    warningMessages
  };
}

/**
 * 随時改定シミュレーション実行（育休復帰特例モード）
 */
export function simulateVarChangedDecisionMaternityReturn(
  changeStartYear: number,
  changeStartMonth: number,
  previousGrade: number,
  previousAmount: number,
  month1: { amount: number; year: number; month: number; daysSufficient: boolean },
  month2: { amount: number; year: number; month: number; daysSufficient: boolean },
  month3: { amount: number; year: number; month: number; daysSufficient: boolean }
): VarChangedDecisionResult {
  const months = [month1, month2, month3];
  const sufficientMonths = months.filter(m => m.daysSufficient);

  const warningMessages: string[] = [];
  let canCalculate = true;

  if (sufficientMonths.length === 0) {
    warningMessages.push('1ヶ月以上の支払基礎日数の充足が必要です。');
    canCalculate = false;
  }

  const hasInvalidAmount = sufficientMonths.some(
    m => m.amount === null || m.amount === undefined || isNaN(Number(m.amount)) || Number(m.amount) < 0
  );
  if (hasInvalidAmount) {
    warningMessages.push('充足月の中に報酬月額が未入力またはマイナスの月があります。');
    canCalculate = false;
  }

  let averageAmount = 0;
  if (canCalculate && sufficientMonths.length > 0) {
    const amounts = sufficientMonths.map(m => Number(m.amount));
    averageAmount = Math.floor(amounts.reduce((a, b) => a + b, 0) / amounts.length);
  }

  const calculatedGrade = canCalculate ? determineSalaryGradeFromAmount(averageAmount) : previousGrade;
  const calculatedGradeDisplay = getGradeDisplayName(calculatedGrade);
  const gradeDifference = calculatedGrade - previousGrade;

  let sufficientGradeDiff = false;
  if (canCalculate) {
    if (gradeDifference <= -1) {
      sufficientGradeDiff = true;
    } else {
      warningMessages.push('1等級以上の低下がないため育休復帰特例による随時改定を行うことができません。');
      canCalculate = false;
    }
  }

  return {
    changeStartYear,
    changeStartMonth,
    mode: 'maternity-return',
    hasFixedWageChange: true,
    noRerequisitionIn3Months: true,
    previousGrade,
    previousAmount,
    months,
    averageAmount,
    calculatedGrade,
    calculatedGradeDisplay,
    gradeDifference,
    canApply: canCalculate && sufficientGradeDiff,
    warningMessages
  };
}

export function hasPreviousDataAtMonth(
  salaryHistories: Array<{
    effectiveStartYear: number;
    effectiveStartMonth: number;
    effectiveEndYear?: number;
    effectiveEndMonth?: number;
    monthlyAmount: number;
  }>,
  year: number,
  month: number
): boolean {
  const targetYM = year * 100 + month;
  for (const history of salaryHistories) {
    const startYM = history.effectiveStartYear * 100 + history.effectiveStartMonth;
    const endYM = history.effectiveEndYear
      ? history.effectiveEndYear * 100 + history.effectiveEndMonth!
      : 999999;
    if (targetYM >= startYM && targetYM <= endYM) {
      return true;
    }
  }
  return false;
}

export function getPreviousAmountAtMonth(
  salaryHistories: Array<{
    effectiveStartYear: number;
    effectiveStartMonth: number;
    effectiveEndYear?: number;
    effectiveEndMonth?: number;
    monthlyAmount: number;
  }>,
  year: number,
  month: number
): number {
  const targetYM = year * 100 + month;
  for (const history of salaryHistories) {
    const startYM = history.effectiveStartYear * 100 + history.effectiveStartMonth;
    const endYM = history.effectiveEndYear
      ? history.effectiveEndYear * 100 + history.effectiveEndMonth!
      : 999999;
    if (targetYM >= startYM && targetYM <= endYM) {
      return history.monthlyAmount;
    }
  }
  return 0;
}

export function getPreviousGradeAtMonth(
  salaryHistories: Array<{
    effectiveStartYear: number;
    effectiveStartMonth: number;
    effectiveEndYear?: number;
    effectiveEndMonth?: number;
    salaryGrade: number;
  }>,
  year: number,
  month: number
): number {
  const targetYM = year * 100 + month;
  for (const history of salaryHistories) {
    const startYM = history.effectiveStartYear * 100 + history.effectiveStartMonth;
    const endYM = history.effectiveEndYear
      ? history.effectiveEndYear * 100 + history.effectiveEndMonth!
      : 999999;
    if (targetYM >= startYM && targetYM <= endYM) {
      return history.salaryGrade;
    }
  }
  return 0;
}

/**
 * 随時改定の適用期間（4ヶ月目 〜 当年または翌年8月 / 退職月）を計算
 */
export function getVarChangedApplicationPeriod(
  changeStartYear: number,
  changeStartMonth: number,
  retirementDate: string = '',
  hireDate: string = ''
): { startYear: number; startMonth: number; endYear: number; endMonth: number } {
  // 1. 改定開始月（変動開始月の4ヶ月目）
  let startMonth = changeStartMonth + 3;
  let startYear = changeStartYear;
  if (startMonth > 12) {
    startMonth -= 12;
    startYear += 1;
  }

  // 2. 法定の適用終了月（1〜6月改定なら当年8月、7〜12月改定なら翌年8月）
  let endYear = startMonth <= 6 ? startYear : startYear + 1;
  let endMonth = 8;

  // 3. 退職日が存在する場合は資格喪失月に応じて終了月を短縮
  if (retirementDate) {
    const endYM = calculateInsuranceEndYearMonth(retirementDate, hireDate);
    if (endYM) {
      const legalEndVal = endYear * 100 + endMonth;
      const retireEndVal = endYM.year * 100 + endYM.month;
      if (retireEndVal < legalEndVal) {
        endYear = endYM.year;
        endMonth = endYM.month;
      }
    }
  }

  return { startYear, startMonth, endYear, endMonth };
}

export function detectOverwriteTargets(
  salaryHistories: Array<{
    id: string;
    effectiveStartYear: number;
    effectiveStartMonth: number;
    effectiveEndYear?: number;
    effectiveEndMonth?: number;
  }>,
  changeStartYear: number,
  changeStartMonth: number,
  retirementDate: string = '',
  hireDate: string = ''
): Array<{ id: string; currentPeriod: string }> {
  const period = getVarChangedApplicationPeriod(changeStartYear, changeStartMonth, retirementDate, hireDate);
  const targetStartYM = period.startYear * 100 + period.startMonth;
  const targetEndYM = period.endYear * 100 + period.endMonth;

  const targets: Array<{ id: string; currentPeriod: string }> = [];

  for (const h of salaryHistories) {
    const hStartYM = Number(h.effectiveStartYear) * 100 + Number(h.effectiveStartMonth);
    const hEndYM = (h.effectiveEndYear && h.effectiveEndMonth)
      ? Number(h.effectiveEndYear) * 100 + Number(h.effectiveEndMonth)
      : 999999;

    // 期間重複判定: (hStartYM <= targetEndYM) && (hEndYM >= targetStartYM)
    if (hStartYM <= targetEndYM && hEndYM >= targetStartYM) {
      let currentPeriod = `${h.effectiveStartYear}/${String(h.effectiveStartMonth).padStart(2, '0')}`;
      if (h.effectiveEndYear && h.effectiveEndMonth) {
        currentPeriod += ` 〜 ${h.effectiveEndYear}/${String(h.effectiveEndMonth).padStart(2, '0')}`;
      } else {
        currentPeriod += ' 〜';
      }
      targets.push({ id: h.id, currentPeriod });
    }
  }

  return targets;
}




