import { EmployeeView } from '../models/employee.model';
import { InsuranceStandard, InsuranceExceptionType } from '../models/insurance-standard.model';
import { InsuranceRateMaster } from '../models/insurance-rate.model';
import { SalaryStandard } from '../models/salary-standard.model';
import { BonusHistory } from '../models/bonus-history.model';
import { getSalaryGradeByNumber } from '../data/salary-grade-master.data';
import { calculateInsuranceEndYearMonth } from './employee.util';

export type CollectionBasisType = 'nextMonth' | 'currentMonth';
export type TabType = 'monthly' | 'annual';
export type SegmentType = 'total' | 'salary' | 'bonus';

export interface InsuranceMultipliers {
  health: number;
  care: number;
  pension: number;
}

/**
 * 社会保険料の計算結果モデル
 */
export interface InsuranceCalculationResult {
  totalAmount: number;     // 総保険料（納付合計額）
  employeeShare: number;   // 従業員負担額（給与天引き額）
  employerShare: number;   // 会社負担額
}

/**
 * 被保険者負担分の端数処理（健康保険法第164条・厚生年金保険法第89条）
 * ・50銭以下：切り捨て（例: 0.50円 -> 0円）
 * ・50銭超：切り上げ（例: 0.51円 -> 1円）
 */
export function roundEmployeeShare(amount: number): number {
  const integerPart = Math.floor(amount);
  const decimalPart = Math.round((amount - integerPart) * 100) / 100;
  return decimalPart > 0.50 ? integerPart + 1 : integerPart;
}

export function calculateInsuranceItem(
  standardRemuneration: number,
  ratePercentage: number,
  employeeBurdenRatio: number = 50
): InsuranceCalculationResult {
  if (!standardRemuneration || !ratePercentage) {
    return { totalAmount: 0, employeeShare: 0, employerShare: 0 };
  }

  // 1. 全体保険料の算出（円未満四捨五入）
  const totalAmount = Math.round((standardRemuneration * ratePercentage) / 100);

  // 2. 従業員負担額の算出（法定端数処理: 50銭以下切り捨て / 50銭超切り上げ）
  const rawEmployeeShare = (totalAmount * employeeBurdenRatio) / 100;
  const employeeShare = roundEmployeeShare(rawEmployeeShare);

  // 3. 会社負担額（総額との差額を会社が負担することで1円のズレを解消）
  const employerShare = totalAmount - employeeShare;

  return {
    totalAmount,
    employeeShare,
    employerShare
  };
}

/**
 * 日本の「年齢計算ニ関スル法律」に基づく社会保険判定用法定年齢の計算
 * ※誕生日の前日に満年齢に到達する法定ルール（1日生まれは前月に到達）
 */
export function getLegalAgeForInsurance(dateOfBirthStr: string, targetYear: number, targetMonth: number): number {
  if (!dateOfBirthStr) return 0;
  const [bYear, bMonth, bDay] = dateOfBirthStr.split('-').map(Number);

  let effectiveBirthYear = bYear;
  let effectiveBirthMonth = bMonth;
  // 1日生まれの場合は前月の末日に加齢するため、誕生日前月を基準とする
  if (bDay === 1) {
    effectiveBirthMonth--;
    if (effectiveBirthMonth === 0) {
      effectiveBirthMonth = 12;
      effectiveBirthYear--;
    }
  }

  let age = targetYear - effectiveBirthYear;
  if (targetMonth < effectiveBirthMonth) {
    age--;
  }
  return age;
}

/**
 * 照会年月と徴収基準（翌月徴収／当月徴収）から給与保険料の帰属年月を算出
 */
export function getAttributionYearMonth(
  targetYear: number,
  targetMonth: number,
  collectionBasis: 'nextMonth' | 'currentMonth'
): { attrYear: number; attrMonth: number; attrYM: number } {
  if (collectionBasis === 'currentMonth') {
    return { attrYear: targetYear, attrMonth: targetMonth, attrYM: targetYear * 100 + targetMonth };
  }

  let attrMonth = targetMonth - 1;
  let attrYear = targetYear;
  if (attrMonth === 0) {
    attrMonth = 12;
    attrYear -= 1;
  }
  return { attrYear, attrMonth, attrYM: attrYear * 100 + attrMonth };
}

/**
 * 当該帰属年月において特定の法定年齢（40, 65, 70, 75歳）に到達した月かどうかを判定
 */
export function isAgeTransitionInMonth(
  dateOfBirthStr: string,
  attrYear: number,
  attrMonth: number
): { isTransition: boolean; reachedAge: number } {
  if (!dateOfBirthStr) return { isTransition: false, reachedAge: 0 };
  const [bY, bM, bD] = dateOfBirthStr.split('-').map(Number);

  const milestoneAges = [40, 65, 70, 75];
  for (const age of milestoneAges) {
    let transYear = bY + age;
    let transMonth = (bD === 1) ? bM - 1 : bM;
    if (transMonth === 0) {
      transMonth = 12;
      transYear -= 1;
    }
    if (attrYear === transYear && attrMonth === transMonth) {
      return { isTransition: true, reachedAge: age };
    }
  }
  return { isTransition: false, reachedAge: 0 };
}

export function isSameMonthHireAndRetire(hireDateStr?: string, retirementDateStr?: string): boolean {
  if (!hireDateStr || !retirementDateStr) return false;
  const [hY, hM] = hireDateStr.split('-').map(Number);
  const [rY, rM] = retirementDateStr.split('-').map(Number);
  return hY === rY && hM === rM;
}

/**
 * 社員の入社日・退職日・徴収基準に基づき、実際に給与天引きが発生する「徴収開始年月」と「最終徴収年月」を算出
 */
export function getCollectionActivePeriod(
  hireDateStr: string,
  retirementDateStr: string | undefined,
  collectionBasis: 'nextMonth' | 'currentMonth'
): { startYM: number; endYM: number; isEndOfMonthRetirement: boolean; isSameMonth: boolean } {
  if (!hireDateStr) return { startYM: 999999, endYM: 0, isEndOfMonthRetirement: false, isSameMonth: false };

  const [hY, hM] = hireDateStr.split('-').map(Number);
  const isSameMonth = isSameMonthHireAndRetire(hireDateStr, retirementDateStr);

  if (isSameMonth) {
    const ym = hY * 100 + hM;
    return { startYM: ym, endYM: ym, isEndOfMonthRetirement: false, isSameMonth: true };
  }

  // 1. 徴収開始月（翌月徴収なら入社翌月、当月徴収なら入社当月）
  let startYM = hY * 100 + hM;
  if (collectionBasis === 'nextMonth') {
    let nextM = hM + 1;
    let nextY = hY;
    if (nextM > 12) { nextM = 1; nextY += 1; }
    startYM = nextY * 100 + nextM;
  }

  // 2. 最終徴収月（退職がない場合は無期限）
  let endYM = 999999;
  let isEndOfMonth = false;

  if (retirementDateStr) {
    const [rY, rM, rD] = retirementDateStr.split('-').map(Number);
    const lastDay = new Date(rY, rM, 0).getDate();
    isEndOfMonth = (rD === lastDay);

    if (collectionBasis === 'nextMonth') {
      endYM = rY * 100 + rM;
    } else {
      const lastInsured = calculateInsuranceEndYearMonth(retirementDateStr, hireDateStr);
      endYM = lastInsured ? (lastInsured.year * 100 + lastInsured.month) : (rY * 100 + rM);
    }
  }

  return { startYM, endYM, isEndOfMonthRetirement: isEndOfMonth, isSameMonth: false };
}

export function checkEmployeeEligibility(
  emp: EmployeeView,
  targetYear: number,
  targetMonth: number,
  targetYM: number,
  attrYM: number,
  fiscalStartYM: number,
  fiscalEndYM: number,
  salMap: Record<string, any[]>,
  bonusMap: Record<string, any[]>,
  basis: CollectionBasisType,
  activeTab: TabType,
  activeSegment: SegmentType
) {
  const { startYM: collStartYM, endYM: collEndYM, isEndOfMonthRetirement } =
    getCollectionActivePeriod(emp.hireDate, emp.retirementDate, basis);

  const { startYM: insuredStartYM, endYM: insuredEndYM } =
    getCollectionActivePeriod(emp.hireDate, emp.retirementDate, 'currentMonth');

  const isSalaryPeriodEligible = (targetYM >= collStartYM && targetYM <= collEndYM);
  const isInsuredActivePeriod = (targetYM >= insuredStartYM && targetYM <= insuredEndYM);

  const empSalList: SalaryStandard[] = salMap[emp.id] || [];
  const empBonusList: BonusHistory[] = bonusMap[emp.id] || [];

  const currentSal = empSalList.find(s => {
    const sStart = Number(s.effectiveStartYear) * 100 + Number(s.effectiveStartMonth);
    const sEnd = (s.effectiveEndYear && s.effectiveEndMonth)
      ? Number(s.effectiveEndYear) * 100 + Number(s.effectiveEndMonth)
      : 999999;
    return attrYM >= sStart && attrYM <= sEnd;
  });

  const targetSal = empSalList.find(s => {
    const sStart = Number(s.effectiveStartYear) * 100 + Number(s.effectiveStartMonth);
    const sEnd = (s.effectiveEndYear && s.effectiveEndMonth)
      ? Number(s.effectiveEndYear) * 100 + Number(s.effectiveEndMonth)
      : 999999;
    return targetYM >= sStart && targetYM <= sEnd;
  });

  const currentBonus = isInsuredActivePeriod
    ? empBonusList.find(b => Number(b.paymentYear) === targetYear && Number(b.paymentMonth) === targetMonth)
    : undefined;

  let isEligibleForDenominator = false;
  let shouldDisplayInTable = false;

  if (activeTab === 'monthly') {
    if (activeSegment === 'salary') {
      isEligibleForDenominator = isSalaryPeriodEligible;
      shouldDisplayInTable = isSalaryPeriodEligible && !!currentSal;
    } else if (activeSegment === 'bonus') {
      isEligibleForDenominator = isInsuredActivePeriod;
      shouldDisplayInTable = isInsuredActivePeriod && !!currentBonus;
    } else {
      isEligibleForDenominator = isSalaryPeriodEligible || isInsuredActivePeriod;
      shouldDisplayInTable = (isSalaryPeriodEligible && !!currentSal) || (isInsuredActivePeriod && !!currentBonus);
    }
  } else {
    isEligibleForDenominator = !(collEndYM < fiscalStartYM || collStartYM > fiscalEndYM);

    const hasAnnualSalary = empSalList.some(s => {
      if ((Number(s.monthlyAmount) || 0) <= 0) return false;
      const sStart = Math.max(Number(s.effectiveStartYear) * 100 + Number(s.effectiveStartMonth), collStartYM);
      const rawEnd = (s.effectiveEndYear && s.effectiveEndMonth)
        ? Number(s.effectiveEndYear) * 100 + Number(s.effectiveEndMonth)
        : 999999;
      const sEnd = Math.min(rawEnd, collEndYM);

      return sStart <= sEnd && !(sEnd < fiscalStartYM || sStart > fiscalEndYM);
    });

    const hasAnnualBonus = empBonusList.some(b => {
      const bYM = Number(b.paymentYear) * 100 + Number(b.paymentMonth);
      return bYM >= collStartYM && bYM <= collEndYM && bYM >= fiscalStartYM && bYM <= fiscalEndYM;
    });

    shouldDisplayInTable = isEligibleForDenominator && (hasAnnualSalary || hasAnnualBonus);
  }

  return {
    isEligibleForDenominator,
    shouldDisplayInTable,
    currentSal,
    targetSal,
    currentBonus,
    collStartYM,
    collEndYM,
    isEndOfMonthRetirement
  };
}

export function resolveRatesAndExemptions(
  emp: EmployeeView,
  attrYM: number,
  attrYear: number,
  attrMonth: number,
  insMap: Record<string, any[]>,
  insuranceRateMastersMap: Record<string, InsuranceRateMaster>
) {
  const empInsList: InsuranceStandard[] = insMap[emp.id] || [];
  const currentIns = empInsList.find(i => {
    const start = Number(i.effectiveStartYear) * 100 + Number(i.effectiveStartMonth);
    const end = (i.effectiveEndYear && i.effectiveEndMonth)
      ? Number(i.effectiveEndYear) * 100 + Number(i.effectiveEndMonth)
      : 999999;
    return attrYM >= start && attrYM <= end;
  });

  const masterName = currentIns?.insuranceRateMasterName || '未設定';
  const rateMaster = insuranceRateMastersMap[masterName] || insuranceRateMastersMap[currentIns?.insuranceRateMasterId || ''];

  const isExemptStandard = !currentIns ||
    masterName === '対象外' ||
    masterName === '未設定' ||
    currentIns.insuranceRateMasterId === 'N/A';

  let healthRate = 0, careRate = 0, pensionRate = 0;
  let empBurdenRatio = 50;
  let careEmpBurdenRatio = 50;

  if (!isExemptStandard && rateMaster && rateMaster.rates) {
    healthRate = Number(rateMaster.rates.healthInsurance) || 0;
    careRate = Number(rateMaster.rates.careInsurance) || 0;
    pensionRate = Number(rateMaster.rates.pensionInsurance) || 0;
    empBurdenRatio = (rateMaster.burdenRatio?.employee !== undefined && rateMaster.burdenRatio?.employee !== null)
      ? Number(rateMaster.burdenRatio.employee)
      : 50;
    careEmpBurdenRatio = (rateMaster.burdenRatioCare?.employee !== undefined && rateMaster.burdenRatioCare?.employee !== null)
      ? Number(rateMaster.burdenRatioCare.employee)
      : 50;
  }

  const legalAgeAtAttrMonth = getLegalAgeForInsurance(emp.dateOfBirth, attrYear, attrMonth);
  const isCareEligible = (legalAgeAtAttrMonth >= 40 && legalAgeAtAttrMonth < 65);
  const isPensionEligible = (legalAgeAtAttrMonth < 70);
  const isHealthEligible = (legalAgeAtAttrMonth < 75);

  let applyHealth = !isExemptStandard && isHealthEligible;
  let applyCare = !isExemptStandard && isCareEligible;
  let applyPension = !isExemptStandard && isPensionEligible;

  if (currentIns) {
    if (currentIns.exceptionType === InsuranceExceptionType.CHILDCARE_LEAVE_EXEMPTION) {
      applyHealth = applyCare = applyPension = false;
    } else if (currentIns.exceptionType === InsuranceExceptionType.FOREIGN_AGREEMENT_PENSION) {
      applyPension = false;
    } else if (currentIns.exceptionType === InsuranceExceptionType.FOREIGN_AGREEMENT_HEALTH) {
      applyHealth = applyCare = false;
    } else if (currentIns.exceptionType === InsuranceExceptionType.FOREIGN_AGREEMENT_BOTH) {
      applyHealth = applyCare = applyPension = false;
    }
  }

  return {
    currentIns,
    masterName,
    isExemptStandard,
    healthRate,
    careRate,
    pensionRate,
    empBurdenRatio,
    careEmpBurdenRatio,
    applyHealth,
    applyCare,
    applyPension
  };
}

export function calculateMonthlyPremiums(
  currentSal: SalaryStandard | undefined,
  targetSal: SalaryStandard | undefined,
  currentBonus: BonusHistory | undefined,
  salaryRates: ReturnType<typeof resolveRatesAndExemptions>,
  targetRates: ReturnType<typeof resolveRatesAndExemptions>,
  bonusRates: ReturnType<typeof resolveRatesAndExemptions>,
  isTwoMonthsCollection: boolean,
  activeSegment: SegmentType
) {
  const rawMonthlySalary = currentSal ? (Number(currentSal.monthlyAmount) || 0) : 0;
  const salaryGrade = currentSal ? (currentSal.salaryGradeDisplay || '-') : '-';
  const bonusActualAmount = currentBonus ? (Number(currentBonus.actualPaymentAmount) || 0) : 0;
  const totalRemuneration = rawMonthlySalary + bonusActualAmount;

  // 1. 帰属月（前月分または当月分）の標準報酬月額・保険料算出
  const hasGrade1 = currentSal?.salaryGrade !== undefined && currentSal?.salaryGrade !== null;
  const gradeMaster1 = (rawMonthlySalary > 0 && hasGrade1)
    ? getSalaryGradeByNumber(Number(currentSal.salaryGrade))
    : null;
  const stdHealthSalary1 = gradeMaster1 ? gradeMaster1.baseAmount : (rawMonthlySalary > 0 ? rawMonthlySalary : 0);
  const stdPensionSalary1 = stdHealthSalary1 > 0 ? Math.max(88000, Math.min(stdHealthSalary1, 650000)) : 0;

  const sal1H = (salaryRates.applyHealth && !salaryRates.isExemptStandard && stdHealthSalary1 > 0)
    ? calculateInsuranceItem(stdHealthSalary1, salaryRates.healthRate, salaryRates.empBurdenRatio)
    : { employeeShare: 0, employerShare: 0, totalAmount: 0 };
  const sal1C = (salaryRates.applyCare && !salaryRates.isExemptStandard && stdHealthSalary1 > 0)
    ? calculateInsuranceItem(stdHealthSalary1, salaryRates.careRate, salaryRates.careEmpBurdenRatio)
    : { employeeShare: 0, employerShare: 0, totalAmount: 0 };
  const sal1P = (salaryRates.applyPension && !salaryRates.isExemptStandard && stdPensionSalary1 > 0)
    ? calculateInsuranceItem(stdPensionSalary1, salaryRates.pensionRate, 50)
    : { employeeShare: 0, employerShare: 0, totalAmount: 0 };

  // 2. 月末退職による2ヶ月分一括徴収時、退職当月分を独立して算出
  let stdHealthSalary2 = 0;
  let stdPensionSalary2 = 0;
  let sal2H = { employeeShare: 0, employerShare: 0, totalAmount: 0 };
  let sal2C = { employeeShare: 0, employerShare: 0, totalAmount: 0 };
  let sal2P = { employeeShare: 0, employerShare: 0, totalAmount: 0 };

  if (isTwoMonthsCollection) {
    const rawTargetSalary = targetSal ? (Number(targetSal.monthlyAmount) || 0) : 0;
    const hasGrade2 = targetSal?.salaryGrade !== undefined && targetSal?.salaryGrade !== null;
    const gradeMaster2 = (rawTargetSalary > 0 && hasGrade2)
      ? getSalaryGradeByNumber(Number(targetSal.salaryGrade))
      : null;
    stdHealthSalary2 = gradeMaster2 ? gradeMaster2.baseAmount : (rawTargetSalary > 0 ? rawTargetSalary : 0);
    stdPensionSalary2 = stdHealthSalary2 > 0 ? Math.max(88000, Math.min(stdHealthSalary2, 650000)) : 0;

    if (targetRates.applyHealth && !targetRates.isExemptStandard && stdHealthSalary2 > 0) {
      sal2H = calculateInsuranceItem(stdHealthSalary2, targetRates.healthRate, targetRates.empBurdenRatio);
    }
    if (targetRates.applyCare && !targetRates.isExemptStandard && stdHealthSalary2 > 0) {
      sal2C = calculateInsuranceItem(stdHealthSalary2, targetRates.careRate, targetRates.careEmpBurdenRatio);
    }
    if (targetRates.applyPension && !targetRates.isExemptStandard && stdPensionSalary2 > 0) {
      sal2P = calculateInsuranceItem(stdPensionSalary2, targetRates.pensionRate, 50);
    }
  }

  const salHEmp = sal1H.employeeShare + sal2H.employeeShare;
  const salHComp = sal1H.employerShare + sal2H.employerShare;
  const salHTot = sal1H.totalAmount + sal2H.totalAmount;

  const salCEmp = sal1C.employeeShare + sal2C.employeeShare;
  const salCComp = sal1C.employerShare + sal2C.employerShare;
  const salCTot = sal1C.totalAmount + sal2C.totalAmount;

  const salPEmp = sal1P.employeeShare + sal2P.employeeShare;
  const salPComp = sal1P.employerShare + sal2P.employerShare;
  const salPTot = sal1P.totalAmount + sal2P.totalAmount;

  const salEmpTotal = salHEmp + salCEmp + salPEmp;
  const salCompTotal = salHComp + salCComp + salPComp;
  const salTotal = salHTot + salCTot + salPTot;

  // 3. 賞与保険料の算出
  const stdHealthBonus = currentBonus ? Number(currentBonus.healthStandardBonusAmount ?? currentBonus.standardBonusAmount ?? 0) : 0;
  const stdPensionBonus = currentBonus ? Number(currentBonus.pensionStandardBonusAmount ?? currentBonus.standardBonusAmount ?? 0) : 0;

  const bH = (bonusRates.applyHealth && !bonusRates.isExemptStandard && stdHealthBonus > 0)
    ? calculateInsuranceItem(stdHealthBonus, bonusRates.healthRate, bonusRates.empBurdenRatio)
    : { employeeShare: 0, employerShare: 0, totalAmount: 0 };
  const bC = (bonusRates.applyCare && !bonusRates.isExemptStandard && stdHealthBonus > 0)
    ? calculateInsuranceItem(stdHealthBonus, bonusRates.careRate, bonusRates.careEmpBurdenRatio)
    : { employeeShare: 0, employerShare: 0, totalAmount: 0 };
  const bP = (bonusRates.applyPension && !bonusRates.isExemptStandard && stdPensionBonus > 0)
    ? calculateInsuranceItem(stdPensionBonus, bonusRates.pensionRate, 50)
    : { employeeShare: 0, employerShare: 0, totalAmount: 0 };

  const bonusEmpTotal = bH.employeeShare + bC.employeeShare + bP.employeeShare;
  const bonusCompTotal = bH.employerShare + bC.employerShare + bP.employerShare;
  const bonusTotal = bH.totalAmount + bC.totalAmount + bP.totalAmount;

  const isSalary = activeSegment === 'salary';
  const isBonus = activeSegment === 'bonus';

  const finalEmpShare = isSalary ? salEmpTotal : isBonus ? bonusEmpTotal : salEmpTotal + bonusEmpTotal;
  const finalCompShare = isSalary ? salCompTotal : isBonus ? bonusCompTotal : salCompTotal + bonusCompTotal;
  const finalTotal = isSalary ? salTotal : isBonus ? bonusTotal : salTotal + bonusTotal;

  const month1AppliedH = salaryRates.applyHealth && !salaryRates.isExemptStandard && stdHealthSalary1 > 0;
  const month2AppliedH = isTwoMonthsCollection && targetRates.applyHealth && !targetRates.isExemptStandard && stdHealthSalary2 > 0;
  const month1AppliedC = salaryRates.applyCare && !salaryRates.isExemptStandard && stdHealthSalary1 > 0;
  const month2AppliedC = isTwoMonthsCollection && targetRates.applyCare && !targetRates.isExemptStandard && stdHealthSalary2 > 0;
  const month1AppliedP = salaryRates.applyPension && !salaryRates.isExemptStandard && stdPensionSalary1 > 0;
  const month2AppliedP = isTwoMonthsCollection && targetRates.applyPension && !targetRates.isExemptStandard && stdPensionSalary2 > 0;

  const effSalaryH = (month1AppliedH ? stdHealthSalary1 : 0) + (month2AppliedH ? stdHealthSalary2 : 0);
  const effSalaryC = (month1AppliedC ? stdHealthSalary1 : 0) + (month2AppliedC ? stdHealthSalary2 : 0);
  const effSalaryP = (month1AppliedP ? stdPensionSalary1 : 0) + (month2AppliedP ? stdPensionSalary2 : 0);

  const dispBonusH = bonusRates.applyHealth && !bonusRates.isExemptStandard ? stdHealthBonus : 0;
  const dispBonusC = bonusRates.applyCare && !bonusRates.isExemptStandard ? stdHealthBonus : 0;
  const dispBonusP = bonusRates.applyPension && !bonusRates.isExemptStandard ? stdPensionBonus : 0;

  const healthRemun = isBonus ? dispBonusH : isSalary ? effSalaryH : (effSalaryH + dispBonusH);
  const careRemun = isBonus ? dispBonusC : isSalary ? effSalaryC : (effSalaryC + dispBonusC);
  const pensionRemun = isBonus ? dispBonusP : isSalary ? effSalaryP : (effSalaryP + dispBonusP);

  const applyHealth = month1AppliedH || month2AppliedH || (bonusRates.applyHealth && !bonusRates.isExemptStandard);
  const applyCare = month1AppliedC || month2AppliedC || (bonusRates.applyCare && !bonusRates.isExemptStandard);
  const applyPension = month1AppliedP || month2AppliedP || (bonusRates.applyPension && !bonusRates.isExemptStandard);

  const salHealthRate = month2AppliedH ? targetRates.healthRate : salaryRates.healthRate;
  const salCareRate = month2AppliedC ? targetRates.careRate : salaryRates.careRate;
  const salPensionRate = month2AppliedP ? targetRates.pensionRate : salaryRates.pensionRate;

  return {
    monthlySalary: rawMonthlySalary,
    salaryGrade,
    bonusAmount: bonusActualAmount,
    totalRemuneration: totalRemuneration,
    finalEmpShare,
    finalCompShare,
    finalTotal,
    annualHealth: salHTot * 12 + bH.totalAmount,
    annualCare: salCTot * 12 + bC.totalAmount,
    annualPension: salPTot * 12 + bP.totalAmount,
    breakdown: {
      healthRate: applyHealth ? (salHealthRate || bonusRates.healthRate) : 0,
      careRate: applyCare ? (salCareRate || bonusRates.careRate) : 0,
      pensionRate: applyPension ? (salPensionRate || bonusRates.pensionRate) : 0,
      applyHealth,
      applyCare,
      applyPension,
      isTwoMonthsCollection,
      healthMultiplier: (month1AppliedH ? 1 : 0) + (month2AppliedH ? 1 : 0),
      careMultiplier: (month1AppliedC ? 1 : 0) + (month2AppliedC ? 1 : 0),
      pensionMultiplier: (month1AppliedP ? 1 : 0) + (month2AppliedP ? 1 : 0),

      healthRemuneration: healthRemun,
      careRemuneration: careRemun,
      pensionRemuneration: pensionRemun,

      healthEmployee: isSalary ? salHEmp : isBonus ? bH.employeeShare : salHEmp + bH.employeeShare,
      healthCompany: isSalary ? salHComp : isBonus ? bH.employerShare : salHComp + bH.employerShare,
      healthTotal: isSalary ? salHTot : isBonus ? bH.totalAmount : salHTot + bH.totalAmount,
      careEmployee: isSalary ? salCEmp : isBonus ? bC.employeeShare : salCEmp + bC.employeeShare,
      careCompany: isSalary ? salCComp : isBonus ? bC.employerShare : salCComp + bC.employerShare,
      careTotal: isSalary ? salCTot : isBonus ? bC.totalAmount : salCTot + bC.totalAmount,
      pensionEmployee: isSalary ? salPEmp : isBonus ? bP.employeeShare : salPEmp + bP.employeeShare,
      pensionCompany: isSalary ? salPComp : isBonus ? bP.employerShare : salPComp + bP.employerShare,
      pensionTotal: isSalary ? salPTot : isBonus ? bP.totalAmount : salPTot + bP.totalAmount,

      salaryHealthRemuneration: stdHealthSalary1,
      salaryEmployeeTotal: salEmpTotal,
      salaryCompanyTotal: salCompTotal,
      salaryTotal: salTotal,

      bonusHealthRemuneration: dispBonusH,
      bonusCareRemuneration: dispBonusC,
      bonusPensionRemuneration: dispBonusP,
      bonusHealthEmployee: bH.employeeShare,
      bonusHealthCompany: bH.employerShare,
      bonusHealthTotal: bH.totalAmount,
      bonusCareEmployee: bC.employeeShare,
      bonusCareCompany: bC.employerShare,
      bonusCareTotal: bC.totalAmount,
      bonusPensionEmployee: bP.employeeShare,
      bonusPensionCompany: bP.employerShare,
      bonusPensionTotal: bP.totalAmount,
      bonusEmployeeTotal: bonusEmpTotal,
      bonusCompanyTotal: bonusCompTotal,
      bonusTotal: bonusTotal
    }
  };
}

export function calculateAnnualPremiums(
  emp: EmployeeView,
  fiscalYearNum: number,
  salMap: Record<string, any[]>,
  bonusMap: Record<string, any[]>,
  insMap: Record<string, any[]>,
  insuranceRateMastersMap: Record<string, InsuranceRateMaster>,
  collectionBasis: CollectionBasisType
) {
  const fiscalStartYM = fiscalYearNum * 100 + 4;
  const fiscalEndYM = (fiscalYearNum + 1) * 100 + 3;

  let salaryMonthsCount = 0;
  let salHEmp = 0, salHComp = 0, salHTot = 0;
  let salCEmp = 0, salCComp = 0, salCTot = 0;
  let salPEmp = 0, salPComp = 0, salPTot = 0;

  const months = [
    { y: fiscalYearNum, m: 4 }, { y: fiscalYearNum, m: 5 }, { y: fiscalYearNum, m: 6 },
    { y: fiscalYearNum, m: 7 }, { y: fiscalYearNum, m: 8 }, { y: fiscalYearNum, m: 9 },
    { y: fiscalYearNum, m: 10 }, { y: fiscalYearNum, m: 11 }, { y: fiscalYearNum, m: 12 },
    { y: fiscalYearNum + 1, m: 1 }, { y: fiscalYearNum + 1, m: 2 }, { y: fiscalYearNum + 1, m: 3 },
  ];

  const empSalList: SalaryStandard[] = salMap[emp.id] || [];
  const empBonusList: BonusHistory[] = bonusMap[emp.id] || [];

  const { startYM: collStartYM, endYM: collEndYM, isEndOfMonthRetirement } =
    getCollectionActivePeriod(emp.hireDate, emp.retirementDate, collectionBasis);

  for (const { y, m } of months) {
    const targetYM = y * 100 + m;
    if (targetYM < collStartYM || targetYM > collEndYM) {
      continue;
    }

    const { attrYear, attrMonth, attrYM } = getAttributionYearMonth(y, m, collectionBasis);

    const sal = empSalList.find(s => {
      const sStart = Number(s.effectiveStartYear) * 100 + Number(s.effectiveStartMonth);
      const sEnd = (s.effectiveEndYear && s.effectiveEndMonth)
        ? Number(s.effectiveEndYear) * 100 + Number(s.effectiveEndMonth)
        : 999999;
      return attrYM >= sStart && attrYM <= sEnd;
    });

    const rawSal = sal ? (Number(sal.monthlyAmount) || 0) : 0;
    if (rawSal <= 0) continue;

    const hasAnnualGrade = sal?.salaryGrade !== undefined && sal?.salaryGrade !== null;
    const gradeMaster = hasAnnualGrade ? getSalaryGradeByNumber(Number(sal.salaryGrade)) : null;
    const stdHealthSalary = gradeMaster ? gradeMaster.baseAmount : rawSal;
    const stdPensionSalary = Math.max(88000, Math.min(stdHealthSalary, 650000));

    const rates = resolveRatesAndExemptions(emp, attrYM, attrYear, attrMonth, insMap, insuranceRateMastersMap);
    salaryMonthsCount++;
    if (rates.isExemptStandard) continue;

    let mHEmp = 0, mHComp = 0, mHTot = 0;
    let mCEmp = 0, mCComp = 0, mCTot = 0;
    let mPEmp = 0, mPComp = 0, mPTot = 0;

    let hMult = rates.applyHealth ? 1 : 0;
    let cMult = rates.applyCare ? 1 : 0;
    let pMult = rates.applyPension ? 1 : 0;

    if (collectionBasis === 'nextMonth' && targetYM === collEndYM && isEndOfMonthRetirement) {
      const targetRates = resolveRatesAndExemptions(emp, targetYM, y, m, insMap, insuranceRateMastersMap);
      hMult = (rates.applyHealth ? 1 : 0) + (targetRates.applyHealth ? 1 : 0);
      cMult = (rates.applyCare ? 1 : 0) + (targetRates.applyCare ? 1 : 0);
      pMult = (rates.applyPension ? 1 : 0) + (targetRates.applyPension ? 1 : 0);
    }

    if (hMult > 0) {
      const res = calculateInsuranceItem(stdHealthSalary, rates.healthRate, rates.empBurdenRatio);
      mHEmp = res.employeeShare * hMult; mHComp = res.employerShare * hMult; mHTot = res.totalAmount * hMult;
    }
    if (cMult > 0) {
      const res = calculateInsuranceItem(stdHealthSalary, rates.careRate, rates.careEmpBurdenRatio);
      mCEmp = res.employeeShare * cMult; mCComp = res.employerShare * cMult; mCTot = res.totalAmount * cMult;
    }
    if (pMult > 0) {
      const res = calculateInsuranceItem(stdPensionSalary, rates.pensionRate, 50);
      mPEmp = res.employeeShare * pMult; mPComp = res.employerShare * pMult; mPTot = res.totalAmount * pMult;
    }

    salHEmp += mHEmp; salHComp += mHComp; salHTot += mHTot;
    salCEmp += mCEmp; salCComp += mCComp; salCTot += mCTot;
    salPEmp += mPEmp; salPComp += mPComp; salPTot += mPTot;
  }

  const salEmpTotal = salHEmp + salCEmp + salPEmp;
  const salCompTotal = salHComp + salCComp + salPComp;
  const salTotal = salHTot + salCTot + salPTot;

  let bonusCount = 0;
  let bHEmp = 0, bHComp = 0, bHTot = 0;
  let bCEmp = 0, bCComp = 0, bCTot = 0;
  let bPEmp = 0, bPComp = 0, bPTot = 0;

  const annualBonuses = empBonusList.filter(b => {
    const bYM = Number(b.paymentYear) * 100 + Number(b.paymentMonth);
    return bYM >= fiscalStartYM && bYM <= fiscalEndYM;
  });

  for (const b of annualBonuses) {
    bonusCount++;
    const pY = Number(b.paymentYear);
    const pM = Number(b.paymentMonth);
    const rates = resolveRatesAndExemptions(emp, pY * 100 + pM, pY, pM, insMap, insuranceRateMastersMap);
    if (rates.isExemptStandard) continue;

    const stdHealthBonus = Number(b.healthStandardBonusAmount ?? b.standardBonusAmount ?? 0);
    const stdPensionBonus = Number(b.pensionStandardBonusAmount ?? b.standardBonusAmount ?? 0);

    if (rates.applyHealth && stdHealthBonus > 0) {
      const res = calculateInsuranceItem(stdHealthBonus, rates.healthRate, rates.empBurdenRatio);
      bHEmp += res.employeeShare; bHComp += res.employerShare; bHTot += res.totalAmount;
    }
    if (rates.applyCare && stdHealthBonus > 0) {
      const res = calculateInsuranceItem(stdHealthBonus, rates.careRate, rates.careEmpBurdenRatio);
      bCEmp += res.employeeShare; bCComp += res.employerShare; bCTot += res.totalAmount;
    }
    if (rates.applyPension && stdPensionBonus > 0) {
      const res = calculateInsuranceItem(stdPensionBonus, rates.pensionRate, 50);
      bPEmp += res.employeeShare; bPComp += res.employerShare; bPTot += res.totalAmount;
    }
  }

  const bonusEmpTotal = bHEmp + bCEmp + bPEmp;
  const bonusCompTotal = bHComp + bCComp + bPComp;
  const bonusTotal = bHTot + bCTot + bPTot;

  const healthTotal = salHTot + bHTot;
  const careTotal = salCTot + bCTot;
  const pensionTotal = salPTot + bPTot;

  return {
    annualHealth: healthTotal,
    annualCare: careTotal,
    annualPension: pensionTotal,
    employeeShare: salEmpTotal + bonusEmpTotal,
    companyShare: salCompTotal + bonusCompTotal,
    totalPremium: salTotal + bonusTotal,
    annualBreakdown: {
      salaryMonthsCount,
      salaryEmployeeTotal: salEmpTotal,
      salaryCompanyTotal: salCompTotal,
      salaryTotal: salTotal,
      bonusCount,
      bonusEmployeeTotal: bonusEmpTotal,
      bonusCompanyTotal: bonusCompTotal,
      bonusTotal: bonusTotal,
      healthEmployeeTotal: salHEmp + bHEmp,
      healthCompanyTotal: salHComp + bHComp,
      healthTotal,
      careEmployeeTotal: salCEmp + bCEmp,
      careCompanyTotal: salCComp + bCComp,
      careTotal,
      pensionEmployeeTotal: salPEmp + bPEmp,
      pensionCompanyTotal: salPComp + bPComp,
      pensionTotal
    }
  };
}

export function resolveAlertMetadata(
  emp: EmployeeView,
  targetYM: number,
  collStartYM: number,
  collEndYM: number,
  isEndOfMonthRetirement: boolean,
  currentIns: InsuranceStandard | undefined,
  attrYear: number,
  attrMonth: number,
  basis: CollectionBasisType,
  activeSegment: SegmentType = 'total',
  hasBonus: boolean = false
) {
  const isNewHire = (targetYM === collStartYM);
  const isRetiredThisMonth = (emp.retirementDate != null && targetYM === collEndYM);

  const targetYear = Math.floor(targetYM / 100);
  const targetMonth = targetYM % 100;

  const salaryAgeInfo = isAgeTransitionInMonth(emp.dateOfBirth, attrYear, attrMonth);
  const targetAgeInfo = isAgeTransitionInMonth(emp.dateOfBirth, targetYear, targetMonth);

  const isSameMonth = isSameMonthHireAndRetire(emp.hireDate, emp.retirementDate);
  let isAgeTransition = false;
  const notices: string[] = [];

  if (isSameMonth && targetYM === collStartYM) {
    notices.push('案内: 同月得喪（入社当月退職）に伴い、当月分保険料（1ヶ月分）を控除します。');
  } else if (basis === 'nextMonth' && isRetiredThisMonth && isEndOfMonthRetirement) {
    notices.push('案内: 月末退職に伴う当月分＋前月分の2ヶ月分一括徴収対象です。（給与のみ適用）');
  } else if (isRetiredThisMonth) {
    notices.push('案内: 当月退職に伴う最終徴収月です。');
  }

  if (currentIns?.exceptionType === InsuranceExceptionType.CHILDCARE_LEAVE_EXEMPTION) {
    notices.push('案内: 育児・産前産後休業期間のため、社会保険料全額が法定免除（0円）となります。');
  } else if (currentIns?.exceptionType === InsuranceExceptionType.FOREIGN_AGREEMENT_BOTH) {
    notices.push('案内: 社会保障協定適用社員のため、社会保険料全額が免除されます。');
  } else if (currentIns?.exceptionType === InsuranceExceptionType.FOREIGN_AGREEMENT_PENSION) {
    notices.push('案内: 社会保障協定適用（年金保険免除）のため、厚生年金保険料が免除（0円）となります。');
  } else if (currentIns?.exceptionType === InsuranceExceptionType.FOREIGN_AGREEMENT_HEALTH) {
    notices.push('案内: 社会保障協定適用（医療保険免除）のため、健康保険料および介護保険料が免除（0円）となります。');
  }

  const isTwoMonthRetire = isRetiredThisMonth && isEndOfMonthRetirement;

  if (activeSegment === 'salary') {
    const effectiveSalaryAge = (isTwoMonthRetire || basis === 'currentMonth') && !salaryAgeInfo.isTransition
      ? targetAgeInfo
      : salaryAgeInfo;

    isAgeTransition = effectiveSalaryAge.isTransition;
    if (isAgeTransition) {
      appendStandardAgeNotice(notices, effectiveSalaryAge.reachedAge);
    }
  } else if (activeSegment === 'bonus') {
    isAgeTransition = targetAgeInfo.isTransition;
    if (isAgeTransition) {
      appendStandardAgeNotice(notices, targetAgeInfo.reachedAge);
    }
  } else {
    if (!hasBonus) {
      const effectiveAge = (isTwoMonthRetire || basis === 'currentMonth') && !salaryAgeInfo.isTransition
        ? targetAgeInfo
        : salaryAgeInfo;
      isAgeTransition = effectiveAge.isTransition;
      if (isAgeTransition) {
        appendStandardAgeNotice(notices, effectiveAge.reachedAge);
      }
    } else {
      const isSplitTiming = (basis === 'nextMonth' && !isTwoMonthRetire);

      if (isSplitTiming && !salaryAgeInfo.isTransition && targetAgeInfo.isTransition) {
        isAgeTransition = true;
        appendSplitTargetAgeNotice(notices, targetAgeInfo.reachedAge, targetMonth);
      } else if (isSplitTiming && salaryAgeInfo.isTransition && !targetAgeInfo.isTransition) {
        isAgeTransition = true;
        appendSplitSalaryAgeNotice(notices, salaryAgeInfo.reachedAge, targetMonth);
      } else {
        const reachedAges = new Set<number>();
        if (salaryAgeInfo.isTransition) reachedAges.add(salaryAgeInfo.reachedAge);
        if (targetAgeInfo.isTransition) reachedAges.add(targetAgeInfo.reachedAge);
        isAgeTransition = reachedAges.size > 0;
        reachedAges.forEach(age => appendStandardAgeNotice(notices, age));
      }
    }
  }

  const noticeMessage = notices.join('\n');
  return { isNewHire, isRetiredThisMonth, isAgeTransition, noticeMessage };
}

function appendStandardAgeNotice(notices: string[], age: number) {
  if (age === 40) notices.push('案内: 満40歳に到達したため、介護保険料の徴収が開始されます。');
  else if (age === 65) notices.push('案内: 満65歳に到達したため、介護保険第2号被保険者資格を喪失し控除が終了します。');
  else if (age === 70) notices.push('案内: 満70歳に到達したため、厚生年金保険の被保険者資格を喪失します。');
  else if (age === 75) notices.push('案内: 満75歳に到達したため、後期高齢者医療制度へ移行し健康保険料の控除が終了します。');
}

function appendSplitTargetAgeNotice(notices: string[], age: number, targetMonth: number) {
  if (age === 40) notices.push(`案内: ${targetMonth}月に満40歳到達に伴い、賞与から介護保険料の控除が開始されます（給与控除分は前月帰属のため介護保険対象外です）。`);
  else if (age === 65) notices.push(`案内: ${targetMonth}月に満65歳到達に伴い、賞与の介護保険料は控除対象外となります（給与控除分は前月帰属のため介護保険が適用されます）。`);
  else if (age === 70) notices.push(`案内: ${targetMonth}月に満70歳到達に伴い、賞与の厚生年金保険料は控除対象外となります（給与控除分は前月帰属のため厚生年金が適用されます）。`);
  else if (age === 75) notices.push(`案内: ${targetMonth}月に満75歳到達に伴い、賞与の健康保険料は控除対象外となります（給与控除分は前月帰属のため健康保険が適用されます）。`);
}

function appendSplitSalaryAgeNotice(notices: string[], age: number, targetMonth: number) {
  if (age === 40) notices.push('案内: 前月帰属の給与より満40歳到達に伴う介護保険料の控除が開始されます。');
  else if (age === 65) notices.push('案内: 前月帰属の給与より満65歳到達に伴う介護保険料の控除が終了します。');
  else if (age === 70) notices.push('案内: 前月帰属の給与より満70歳到達に伴う厚生年金保険の被保険者資格を喪失します。');
  else if (age === 75) notices.push('案内: 前月帰属の給与より満75歳到達に伴う健康保険料の控除が終了します。');
}
