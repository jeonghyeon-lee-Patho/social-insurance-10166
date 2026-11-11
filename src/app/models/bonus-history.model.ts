/**
 * 賞与額（Bonus History）データモデル
 * 標準賞与額の支給実績を管理
 */

/**
 * 標準賞与額支給実績レコード
 */
export interface BonusHistory {
  id: string;
  employeeId: string;
  paymentYear: number;
  paymentMonth: number;
  actualPaymentAmount: number;
  healthStandardBonusAmount: number;
  pensionStandardBonusAmount: number;
  standardBonusAmount?: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  organizationId: string;
  isActive: boolean;
}

/**
 * 表示用ビューモデル（フォーマット済み）
 */
export interface BonusHistoryView extends BonusHistory {
  paymentPeriod: string;
  actualPaymentAmountDisplay: string;
  healthStandardBonusAmountDisplay: string;
  pensionStandardBonusAmountDisplay: string;
}
