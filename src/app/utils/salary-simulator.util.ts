/**
 * 定時決定・随時改定シミュレーター計算ユーティリティ
 * 社会保険（厚生年金・健康保険）の標準報酬月額決定ロジック
 */

import { determineSalaryGrade, getSalaryGradeByNumber } from '../data/salary-grade-master.data';
import { calculateInsuranceEndYearMonth } from './employee.util';
import { SalaryStandard } from '../models/salary-standard.model';

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

  const eligibleMonths = getEligibleMonthsForRegularDecision(simulationYear, hireDate);

  if (hireDate) {
    const [hY, hM] = hireDate.split('-').map(Number);

    if (hY > simulationYear) {
      warningMessages.push(`入社年月日（${hY}年${hM}月）以前の年度は定時決定の対象外です。`);
      canCalculate = false;
    } else if (hY === simulationYear && hM >= 6) {
      warningMessages.push(
        `${simulationYear}年6月1日以降に入社した社員は、当年度の定時決定の対象外（翌年8月まで入社時等級を維持）です。`
      );
      canCalculate = false;
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
    m => m.amount === null || m.amount === undefined || isNaN(Number(m.amount)) || Number(m.amount) <= 0
  );
  if (hasInvalidAmount) {
    warningMessages.push('充足月の中に報酬月額が未入力または0円以下の月があります。');
    canCalculate = false;
  }

  // 3. 定時決定の適用開始・終了年月の決定（退職日を考慮）
  const rangeStartYM = simulationYear * 100 + 9;
  const rangeEndYM = (simulationYear + 1) * 100 + 8;

  const targetStartYear = simulationYear;
  const targetStartMonth = 9;
  let targetEndYear = simulationYear + 1;
  let targetEndMonth = 8;

  if (retirementDate) {
    const endYM = calculateInsuranceEndYearMonth(retirementDate, hireDate);
    if (endYM) {
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
  }

  // 4. 平均額および等級の計算
  let averageAmount = 0;
  if (canCalculate && sufficientMonths.length > 0) {
    const sum = sufficientMonths.reduce((acc, cur) => acc + Number(cur.amount), 0);
    averageAmount = Math.floor(sum / sufficientMonths.length);
  }

  const gradeMaster = canCalculate ? determineSalaryGrade(averageAmount) : null;

  return {
    simulationYear,
    months,
    averageAmount,
    calculatedGrade: gradeMaster?.grade ?? 0,
    calculatedGradeDisplay: gradeMaster?.displayName ?? '',
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
  changeDirection: 'increase' | 'decrease' = 'increase',
  retirementDate: string = '',
  hireDate: string = ''
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
    m => m.amount === null || m.amount === undefined || isNaN(Number(m.amount)) || Number(m.amount) <= 0
  );
  if (hasInvalidAmount) {
    warningMessages.push('対象月の中に報酬月額が未入力または0円以下の月があります。');
    canCalculate = false;
  }

  let averageAmount = 0;
  if (canCalculate) {
    const amounts = sufficientMonths.map(m => Number(m.amount));
    averageAmount = Math.floor(amounts.reduce((a, b) => a + b, 0) / amounts.length);
  }

  const gradeMaster = canCalculate ? determineSalaryGrade(averageAmount) : null;
  const calculatedGrade = gradeMaster ? gradeMaster.grade : previousGrade;
  const calculatedGradeDisplay = gradeMaster
    ? gradeMaster.displayName
    : (getSalaryGradeByNumber(previousGrade)?.displayName || `${previousGrade}等級`);
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

  const period = getVarChangedApplicationPeriod(changeStartYear, changeStartMonth, retirementDate, hireDate);
  const startVal = period.startYear * 100 + period.startMonth;
  const endVal = period.endYear * 100 + period.endMonth;

  if (endVal < startVal) {
    warningMessages.push(
      `退職に伴う資格喪失（${period.endYear}年${period.endMonth}月）が改定適用開始月（${period.startYear}年${period.startMonth}月）以前のため、随時改定の対象外です。`
    );
    canCalculate = false;
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
  month3: { amount: number; year: number; month: number; daysSufficient: boolean },
  retirementDate: string = '',
  hireDate: string = ''
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
    m => m.amount === null || m.amount === undefined || isNaN(Number(m.amount)) || Number(m.amount) <= 0
  );
  if (hasInvalidAmount) {
    warningMessages.push('充足月の中に報酬月額が未入力または0円以下の月があります。');
    canCalculate = false;
  }

  let averageAmount = 0;
  if (canCalculate && sufficientMonths.length > 0) {
    const amounts = sufficientMonths.map(m => Number(m.amount));
    averageAmount = Math.floor(amounts.reduce((a, b) => a + b, 0) / amounts.length);
  }

  const gradeMaster = canCalculate ? determineSalaryGrade(averageAmount) : null;
  const calculatedGrade = gradeMaster ? gradeMaster.grade : previousGrade;
  const calculatedGradeDisplay = gradeMaster
    ? gradeMaster.displayName
    : (getSalaryGradeByNumber(previousGrade)?.displayName || `${previousGrade}等級`);
  
  const effectivePreviousGrade = Math.min(50, Math.max(1, previousGrade));
  const effectiveCalculatedGrade = Math.min(50, Math.max(1, calculatedGrade));
  const gradeDifference = effectiveCalculatedGrade - effectivePreviousGrade;

  let sufficientGradeDiff = false;
  if (canCalculate) {
    if (gradeDifference <= -1) {
      sufficientGradeDiff = true;
    } else {
      warningMessages.push('1等級以上の低下がないため育休復帰特例による随時改定を行うことができません。');
      canCalculate = false;
    }
  }

  const period = getVarChangedApplicationPeriod(changeStartYear, changeStartMonth, retirementDate, hireDate);
  const startVal = period.startYear * 100 + period.startMonth;
  const endVal = period.endYear * 100 + period.endMonth;

  if (endVal < startVal) {
    warningMessages.push(
      `退職に伴う資格喪失（${period.endYear}年${period.endMonth}月）が改定適用開始月（${period.startYear}年${period.startMonth}月）以前のため、随時改定の対象外です。`
    );
    canCalculate = false;
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

/**
 * 指定年月に適用中の給与履歴レコードを取得
 */
export function findSalaryHistoryAtMonth(
  salaryHistories: SalaryStandard[], year: number, month: number
): SalaryStandard | undefined {
  const targetYM = year * 100 + month;
  return salaryHistories.find(history => {
    const startYM = Number(history.effectiveStartYear) * 100 + Number(history.effectiveStartMonth);
    const endYM = (history.effectiveEndYear && history.effectiveEndMonth)
      ? Number(history.effectiveEndYear) * 100 + Number(history.effectiveEndMonth)
      : 999999;
    return targetYM >= startYM && targetYM <= endYM;
  });
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

/**
 * 期間重複する既存給与履歴を抽出（共通ヘルパー）
 */
function findOverlappingHistories(
  salaryHistories: SalaryStandard[],
  targetStartYM: number,
  targetEndYM: number
): SalaryStandard[] {
  return salaryHistories.filter(h => {
    const hStartYM = Number(h.effectiveStartYear) * 100 + Number(h.effectiveStartMonth);
    const hEndYM = (h.effectiveEndYear && h.effectiveEndMonth)
      ? Number(h.effectiveEndYear) * 100 + Number(h.effectiveEndMonth)
      : 999999;
    return hStartYM <= targetEndYM && hEndYM >= targetStartYM;
  });
}

/**
 * 定時決定の上書き対象履歴を検出
 */
export function detectRegularOverwriteTargets(
  salaryHistories: SalaryStandard[],
  targetStartYear: number,
  targetStartMonth: number,
  targetEndYear: number,
  targetEndMonth: number
): SalaryStandard[] {
  return findOverlappingHistories(
    salaryHistories,
    targetStartYear * 100 + targetStartMonth,
    targetEndYear * 100 + targetEndMonth
  );
}

/**
 * 随時改定の上書き対象履歴を検出
 */
export function detectOverwriteTargets(
  salaryHistories: SalaryStandard[],
  changeStartYear: number,
  changeStartMonth: number,
  retirementDate: string = '',
  hireDate: string = ''
): SalaryStandard[] {
  const period = getVarChangedApplicationPeriod(changeStartYear, changeStartMonth, retirementDate, hireDate);
  return findOverlappingHistories(
    salaryHistories,
    period.startYear * 100 + period.startMonth,
    period.endYear * 100 + period.endMonth
  );
}

