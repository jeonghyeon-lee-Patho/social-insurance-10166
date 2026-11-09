import { EmployeeView } from '../models/employee.model';
import { InsuranceStandard, InsuranceExceptionType } from '../models/insurance-standard.model';
import { InsuranceRateMaster } from '../models/insurance-rate.model';
import { SalaryStandard } from '../models/salary-standard.model';
import { BonusHistory } from '../models/bonus-history.model';
import { getSalaryGradeByNumber } from '../data/salary-grade-master.data';

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
 * 退職日に基づく最終被保険者年月（保険料賦課の最終月）を計算
 * ・月末退職：退職当月まで賦課（翌月1日資格喪失）
 * ・月中退職：退職前月まで賦課（当月中資格喪失のため当月免除）
 */
export function calculateInsuranceEndYearMonth(retirementDateStr?: string, hireDateStr?: string): { year: number; month: number } | null {
  if (!retirementDateStr) return null;
  const [retireY, retireM, retireD] = retirementDateStr.split('-').map(Number);
  if (!retireY || !retireM || !retireD) return null;

  if (hireDateStr) {
    const [hireY, hireM] = hireDateStr.split('-').map(Number);
    if (hireY === retireY && hireM === retireM) {
      return { year: retireY, month: retireM };
    }
  }

  const lastDayOfMonth = new Date(retireY, retireM, 0).getDate();

  if (retireD === lastDayOfMonth) {
    return { year: retireY, month: retireM };
  } else {
    let endMonth = retireM - 1;
    let endYear = retireY;
    if (endMonth === 0) {
      endMonth = 12;
      endYear -= 1;
    }
    return { year: endYear, month: endMonth };
  }
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

  const currentBonus = empBonusList.find(
    b => Number(b.paymentYear) === targetYear && Number(b.paymentMonth) === targetMonth
  );

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
      const sStart = Number(s.effectiveStartYear) * 100 + Number(s.effectiveStartMonth);
      const sEnd = (s.effectiveEndYear && s.effectiveEndMonth)
        ? Number(s.effectiveEndYear) * 100 + Number(s.effectiveEndMonth)
        : 999999;
      return !(sEnd < fiscalStartYM || sStart > fiscalEndYM);
    });

    const hasAnnualBonus = empBonusList.some(b => {
      const bYM = Number(b.paymentYear) * 100 + Number(b.paymentMonth);
      return bYM >= fiscalStartYM && bYM <= fiscalEndYM;
    });

    shouldDisplayInTable = hasAnnualSalary || hasAnnualBonus;
  }

  return {
    isEligibleForDenominator,
    shouldDisplayInTable,
    currentSal,
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

  let healthRate = 0, careRate = 0, pensionRate = 0, empBurdenRatio = 50;
  if (!isExemptStandard && rateMaster && rateMaster.rates) {
    healthRate = Number(rateMaster.rates.healthInsurance) || 0;
    careRate = Number(rateMaster.rates.careInsurance) || 0;
    pensionRate = Number(rateMaster.rates.pensionInsurance) || 0;
    empBurdenRatio = Number(rateMaster.burdenRatio?.employee) || 50;
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
    applyHealth,
    applyCare,
    applyPension
  };
}

export function resolveInsuranceMultipliers(
  rates: ReturnType<typeof resolveRatesAndExemptions>,
  targetRates: ReturnType<typeof resolveRatesAndExemptions>,
  isTwoMonthsCollection: boolean
): InsuranceMultipliers {
  return {
    health: (rates.applyHealth ? 1 : 0) + (isTwoMonthsCollection && targetRates.applyHealth ? 1 : 0),
    care: (rates.applyCare ? 1 : 0) + (isTwoMonthsCollection && targetRates.applyCare ? 1 : 0),
    pension: (rates.applyPension ? 1 : 0) + (isTwoMonthsCollection && targetRates.applyPension ? 1 : 0)
  };
}

export function calculateMonthlyPremiums(
  currentSal: SalaryStandard | undefined,
  currentBonus: BonusHistory | undefined,
  salaryRates: ReturnType<typeof resolveRatesAndExemptions>,
  bonusRates: ReturnType<typeof resolveRatesAndExemptions>,
  multipliers: InsuranceMultipliers,
  isTwoMonthsCollection: boolean,
  activeSegment: SegmentType
) {
  const rawMonthlySalary = currentSal ? (Number(currentSal.monthlyAmount) || 0) : 0;
  const salaryGrade = currentSal ? (currentSal.salaryGradeDisplay || '-') : '-';
  const bonusActualAmount = currentBonus ? (Number(currentBonus.actualPaymentAmount) || 0) : 0;
  const totalRemuneration = rawMonthlySalary + bonusActualAmount;

  const hasGrade = currentSal?.salaryGrade !== undefined && currentSal?.salaryGrade !== null;
  const gradeMaster = (rawMonthlySalary > 0 && hasGrade)
    ? getSalaryGradeByNumber(Number(currentSal.salaryGrade))
    : null;

  const stdHealthSalary = gradeMaster ? gradeMaster.baseAmount : (rawMonthlySalary > 0 ? rawMonthlySalary : 0);
  const stdPensionSalary = stdHealthSalary > 0 ? Math.max(88000, Math.min(stdHealthSalary, 650000)) : 0;

  const salH = (multipliers.health > 0 && !salaryRates.isExemptStandard && stdHealthSalary > 0)
    ? calculateInsuranceItem(stdHealthSalary, salaryRates.healthRate, salaryRates.empBurdenRatio)
    : { employeeShare: 0, employerShare: 0, totalAmount: 0 };
  const salC = (multipliers.care > 0 && !salaryRates.isExemptStandard && stdHealthSalary > 0)
    ? calculateInsuranceItem(stdHealthSalary, salaryRates.careRate, salaryRates.empBurdenRatio)
    : { employeeShare: 0, employerShare: 0, totalAmount: 0 };
  const salP = (multipliers.pension > 0 && !salaryRates.isExemptStandard && stdHealthSalary > 0)
    ? calculateInsuranceItem(stdPensionSalary, salaryRates.pensionRate, 50)
    : { employeeShare: 0, employerShare: 0, totalAmount: 0 };

  const salHEmp = salH.employeeShare * multipliers.health, salHComp = salH.employerShare * multipliers.health, salHTot = salH.totalAmount * multipliers.health;
  const salCEmp = salC.employeeShare * multipliers.care, salCComp = salC.employerShare * multipliers.care, salCTot = salC.totalAmount * multipliers.care;
  const salPEmp = salP.employeeShare * multipliers.pension, salPComp = salP.employerShare * multipliers.pension, salPTot = salP.totalAmount * multipliers.pension;

  const salEmpTotal = salHEmp + salCEmp + salPEmp;
  const salCompTotal = salHComp + salCComp + salPComp;
  const salTotal = salHTot + salCTot + salPTot;

  const stdHealthBonus = currentBonus ? Number(currentBonus.healthStandardBonusAmount ?? currentBonus.standardBonusAmount ?? 0) : 0;
  const stdPensionBonus = currentBonus ? Number(currentBonus.pensionStandardBonusAmount ?? currentBonus.standardBonusAmount ?? 0) : 0;

  const bH = (bonusRates.applyHealth && !bonusRates.isExemptStandard && stdHealthBonus > 0)
    ? calculateInsuranceItem(stdHealthBonus, bonusRates.healthRate, bonusRates.empBurdenRatio)
    : { employeeShare: 0, employerShare: 0, totalAmount: 0 };
  const bC = (bonusRates.applyCare && !bonusRates.isExemptStandard && stdHealthBonus > 0)
    ? calculateInsuranceItem(stdHealthBonus, bonusRates.careRate, bonusRates.empBurdenRatio)
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

  const effSalaryH = stdHealthSalary * multipliers.health;
  const effSalaryC = stdHealthSalary * multipliers.care;
  const effSalaryP = stdPensionSalary * multipliers.pension;

  const dispBonusH = bonusRates.applyHealth ? stdHealthBonus : 0;
  const dispBonusC = bonusRates.applyCare ? stdHealthBonus : 0;
  const dispBonusP = bonusRates.applyPension ? stdPensionBonus : 0;

  const healthRemun = isBonus ? dispBonusH : isSalary ? effSalaryH : (effSalaryH + dispBonusH);
  const careRemun = isBonus ? dispBonusC : isSalary ? effSalaryC : (effSalaryC + dispBonusC);
  const pensionRemun = isBonus ? dispBonusP : isSalary ? effSalaryP : (effSalaryP + dispBonusP);

  const applyHealth = multipliers.health > 0 || bonusRates.applyHealth;
  const applyCare = multipliers.care > 0 || bonusRates.applyCare;
  const applyPension = multipliers.pension > 0 || bonusRates.applyPension;

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
      healthRate: applyHealth ? (salaryRates.healthRate || bonusRates.healthRate) : 0,
      careRate: applyCare ? (salaryRates.careRate || bonusRates.careRate) : 0,
      pensionRate: applyPension ? (salaryRates.pensionRate || bonusRates.pensionRate) : 0,
      applyHealth,
      applyCare,
      applyPension,
      isTwoMonthsCollection,
      healthMultiplier: multipliers.health,
      careMultiplier: multipliers.care,
      pensionMultiplier: multipliers.pension,

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

      salaryHealthRemuneration: stdHealthSalary,
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
      const res = calculateInsuranceItem(stdHealthSalary, rates.careRate, rates.empBurdenRatio);
      mCEmp = res.employeeShare * cMult; mCComp = res.employerShare * cMult; mCTot = res.totalAmount * cMult;
    }
    if (pMult > 0) {
      const res = calculateInsuranceItem(stdPensionSalary, rates.pensionRate, 50);
      mPEmp = res.employeeShare * pMult; mPComp = res.employerShare * pMult; mPTot = res.totalAmount * pMult;
    }

    salHEmp += mHEmp; salHComp += mHComp; salHTot += mHTot;
    salCEmp += mCEmp; salCComp += mCComp; salCTot += mCTot;
    salPEmp += mPEmp; salPComp += mPComp; salPTot += mPTot;
    salaryMonthsCount++;
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
      const res = calculateInsuranceItem(stdHealthBonus, rates.careRate, rates.empBurdenRatio);
      bCEmp += res.employeeShare; bCComp += res.employerShare; bCTot += res.totalAmount;
    }
    if (rates.applyPension && stdPensionBonus > 0) {
      const res = calculateInsuranceItem(stdPensionBonus, rates.pensionRate, 50);
      bPEmp += res.employeeShare; bPComp += res.employerShare; bPTot += res.totalAmount;
    }
    bonusCount++;
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
    notices.push('案内: 月末退職に伴う当月分＋前月分の2ヶ月分一括徴収対象です。');
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

  if (activeSegment === 'salary') {
    const effectiveSalaryAge = (isRetiredThisMonth || basis === 'currentMonth') && !salaryAgeInfo.isTransition
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
      const effectiveAge = (isRetiredThisMonth || basis === 'currentMonth') && !salaryAgeInfo.isTransition
        ? targetAgeInfo
        : salaryAgeInfo;
      isAgeTransition = effectiveAge.isTransition;
      if (isAgeTransition) {
        appendStandardAgeNotice(notices, effectiveAge.reachedAge);
      }
    } else {
      const isSplitTiming = (basis === 'nextMonth' && !isRetiredThisMonth);

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
