/**
 * 賞与額（標準賞与額）計算ユーティリティ
 * キャップ適用、切り捨て処理などの計算ロジック
 */

/**
 * 健康保険の年度（4/1〜翌年3/31）開始・終了を取得
 */
export function getHealthInsuranceYearBoundary(year: number, month: number): { startYear: number; startMonth: number; endYear: number; endMonth: number } {
  if (month >= 4) {
    // 4月〜12月の場合、その年の4月が年度開始
    return {
      startYear: year,
      startMonth: 4,
      endYear: year + 1,
      endMonth: 3
    };
  } else {
    // 1月〜3月の場合、前年の4月が年度開始
    return {
      startYear: year - 1,
      startMonth: 4,
      endYear: year,
      endMonth: 3
    };
  }
}

/**
 * 指定年月が同一年度（健康保険年度）に属しているか判定
 */
export function isSameHealthInsuranceYear(year1: number, month1: number, year2: number, month2: number): boolean {
  const boundary = getHealthInsuranceYearBoundary(year1, month1);
  const targetYM = year2 * 100 + month2;
  const startYM = boundary.startYear * 100 + boundary.startMonth;
  const endYM = boundary.endYear * 100 + boundary.endMonth;
  
  return targetYM >= startYM && targetYM <= endYM;
}

/**
 * 標準賞与額を計算（1,000円未満切り捨て、キャップ適用）
 */
export function calculateBonusStandardAmount(
  actualAmount: number,
  paymentYear: number,
  paymentMonth: number,
  existingRecords: Array<{
    id?: string;
    paymentYear: number;
    paymentMonth: number;
    healthStandardBonusAmount?: number;
    standardBonusAmount?: number;
  }> = [],
  currentRecordId?: string,
  previousInsuranceAmount: number = 0
): {
  healthStandardAmount: number;
  pensionStandardAmount: number;
  pensionCapExceeded: boolean;
  healthCapExceeded: boolean;
  healthInsuranceTotal: number;
} {
  // Step 1: 1,000円未満切り捨て
  const rawStandard = Math.floor(actualAmount / 1000) * 1000;

  // Step 2: 厚生年金上限判定（1回あたり150万円）
  const pensionCap = 1500000;
  const pensionCapExceeded = rawStandard > pensionCap;
  const pensionStandardAmount = Math.min(rawStandard, pensionCap);

  // Step 3: 健康保険上限判定（年度累計573万円：4/1〜翌年3/31）
  const boundary = getHealthInsuranceYearBoundary(paymentYear, paymentMonth);
  const startYM = boundary.startYear * 100 + boundary.startMonth;
  const endYM = boundary.endYear * 100 + boundary.endMonth;

  let fiscalYearTotal = previousInsuranceAmount;
  for (const record of existingRecords) {
    if (currentRecordId && record.id === currentRecordId) continue;
    const recYM = Number(record.paymentYear) * 100 + Number(record.paymentMonth);
    if (recYM >= startYM && recYM <= endYM) {
      fiscalYearTotal += Number(record.healthStandardBonusAmount ?? record.standardBonusAmount ?? 0);
    }
  }

  const healthCap = 5730000;
  let healthCapExceeded = false;
  let healthStandardAmount = rawStandard;

  if (fiscalYearTotal + rawStandard > healthCap) {
    healthCapExceeded = true;
    healthStandardAmount = Math.max(0, healthCap - fiscalYearTotal);
  }

  const finalHealthTotal = Math.min(healthCap, fiscalYearTotal + rawStandard);

  return {
    healthStandardAmount,
    pensionStandardAmount,
    pensionCapExceeded,
    healthCapExceeded,
    healthInsuranceTotal: finalHealthTotal
  };
}

/**
 * 支給年月範囲における賞与の累計を計算
 * （保険者変更を考慮）
 */
export function calculateBonusAmountInPeriod(
  bonusRecords: Array<{paymentYear: number; paymentMonth: number; standardBonusAmount: number}>,
  startYear: number,
  startMonth: number,
  endYear: number,
  endMonth: number,
  insurerId: string,
  policyChangeHistory: Array<{fromDate: string; toDate: string; insurerId: string}>
): number {
  const startYM = startYear * 100 + startMonth;
  const endYM = endYear * 100 + endMonth;
  let total = 0;

  for (const record of bonusRecords) {
    const recordYM = record.paymentYear * 100 + record.paymentMonth;
    
    // 指定期間内か判定
    if (recordYM < startYM || recordYM > endYM) {
      continue;
    }

    // 保険者が変わっていないか確認
    const recordDate = `${record.paymentYear}-${String(record.paymentMonth).padStart(2, '0')}-01`;
    let isSameInsurer = true;
    
    for (const policyChange of policyChangeHistory) {
      if (recordDate >= policyChange.fromDate && recordDate < policyChange.toDate) {
        if (policyChange.insurerId !== insurerId) {
          isSameInsurer = false;
          break;
        }
      }
    }

    if (isSameInsurer) {
      total += record.standardBonusAmount;
    }
  }

  return total;
}

/**
 * 前職賞与通算時の年度開始月から支給月までの累計を計算
 */
export function calculatePreviousBonusTotal(
  previousBonusRecords: Array<{paymentYear: number; paymentMonth: number; standardBonusAmount: number}>,
  currentYear: number,
  currentMonth: number
): number {
  const boundary = getHealthInsuranceYearBoundary(currentYear, currentMonth);
  const startYM = boundary.startYear * 100 + boundary.startMonth;
  const endYM = currentYear * 100 + currentMonth;
  let total = 0;

  for (const record of previousBonusRecords) {
    const recordYM = record.paymentYear * 100 + record.paymentMonth;
    if (recordYM >= startYM && recordYM <= endYM) {
      total += record.standardBonusAmount;
    }
  }

  return total;
}
